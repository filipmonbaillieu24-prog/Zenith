package com.zenith.pulse

import android.content.Context
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.health.connect.client.PermissionController
import com.zenith.pulse.data.HealthConnectManager
import com.zenith.pulse.data.ScaleBleManager
import com.zenith.pulse.data.ZenithProfileStore
import com.zenith.pulse.data.BodyComposition
import com.zenith.pulse.sync.ZenithSyncManager
import androidx.compose.animation.core.*
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Canvas
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import android.Manifest
import android.content.ClipData
import android.content.Intent
import android.content.ClipboardManager
import android.os.Build
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import java.time.LocalDate
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var healthConnectManager: HealthConnectManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        healthConnectManager = HealthConnectManager(this)

        setContent {
            ZenithPulseTheme {
                ZenithPulseScreen(
                    healthConnectManager = healthConnectManager
                )
            }
        }
    }
}

// Zenith Hub Design Tokens
val ZenithBgDark = Color(0xFF09090B)
val ZenithCardBg = Color(0xFF141824)
val ZenithSteelGrey = Color(0xFF1E293B)
val ZenithSteelBorder = Color(0xFF334155)
val ZenithAccent = Color(0xFF39FF14) // Zenith Hub neon green accent
val ZenithPurple = Color(0xFFA855F7)
val ZenithTextMain = Color(0xFFF8FAFC)
val ZenithTextMuted = Color(0xFF94A3B8)
val ZenithTextSub = Color(0xFF64748B)
val ZenithRed = Color(0xFFEF4444)

@Composable
fun ZenithPulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = ZenithBgDark,
            surface = ZenithCardBg,
            primary = ZenithAccent,
            secondary = ZenithPurple,
            onBackground = ZenithTextMain,
            onSurface = ZenithTextMain
        ),
        content = content
    )
}

@Composable
fun ZenithPulseScreen(
    healthConnectManager: HealthConnectManager
) {
    val coroutineScope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current

    // Authentication States
    var isLoggedInState by remember { mutableStateOf(com.zenith.pulse.auth.UserAuthManager.isLoggedIn(context)) }
    var userEmailState by remember { mutableStateOf(com.zenith.pulse.auth.UserAuthManager.getUserEmail(context) ?: "") }
    
    // Auth Input Fields (prefill with standard email)
    val emailInput = remember { mutableStateOf("filip.monbaillieu.24@gmail.com") }
    val passwordInput = remember { mutableStateOf("") }
    var isLoggingIn by remember { mutableStateOf(false) }
    var authMessage by remember { mutableStateOf<String?>(null) }

    // Sync States
    var hasPermissions by remember { mutableStateOf(false) }
    var isSyncing by remember { mutableStateOf(false) }
    var syncSuccess by remember { mutableStateOf(false) }

    // Update States
    var updateInfo by remember { mutableStateOf<com.zenith.pulse.update.UpdateInfo?>(null) }
    var isDownloadingUpdate by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableStateOf(0f) }

    // Tracked separately from hasPermissions. Health Connect will not grant background
    // access in the same dialog as the read permissions, and without it every read made
    // from the sync worker throws - which is why background syncs were posting empty
    // payloads while manual syncs, run with this Activity in the foreground, worked.
    var hasBackgroundAccess by remember { mutableStateOf(true) }

    // Body stats entry. A Virtuagym-branded scale reports only into Virtuagym, and
    // Virtuagym does not write to Health Connect, so these two numbers were being read
    // off one app and retyped into another every day. Entered here they go into Health
    // Connect once and the normal sync carries them the rest of the way.
    var hasWriteAccess by remember { mutableStateOf(false) }
    // Age, sex and height. The scale measures weight and impedance; body fat is
    // calculated from impedance together with these, so without them the field could
    // only ever stay empty.
    var zenithProfile by remember { mutableStateOf(ZenithProfileStore.cached(context)) }
    LaunchedEffect(Unit) { zenithProfile = ZenithProfileStore.refresh(context) }

    var bodyCompositionNote by remember { mutableStateOf<String?>(null) }
    var weightInput by remember { mutableStateOf("") }
    var bodyFatInput by remember { mutableStateOf("") }
    var bodyStatsMessage by remember { mutableStateOf<String?>(null) }
    var bodyStatsSaving by remember { mutableStateOf(false) }
    var bodyStatsSavedOk by remember { mutableStateOf(false) }

    // Reading the scale over Bluetooth. A NEO Health Onyx SE is an OEM device with no
    // published protocol, so this both decodes the standard formats and captures what
    // it actually sends - see ScaleBleManager.
    val scaleManager = remember { ScaleBleManager(context) }
    var scaleScanning by remember { mutableStateOf(false) }
    var showScalePanel by remember { mutableStateOf(false) }
    var showDiagnostics by remember { mutableStateOf(false) }
    val scaleDevices by scaleManager.devices.collectAsState()
    val scaleReading by scaleManager.reading.collectAsState()
    val scaleStatus by scaleManager.status.collectAsState()
    val scaleFrames by scaleManager.capturedFrames.collectAsState()

    val bluetoothPermissions = remember {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }
    var pendingScaleScan by remember { mutableStateOf(false) }
    var savedScaleName by remember { mutableStateOf(scaleManager.savedScaleName) }
    var savedScaleAddress by remember { mutableStateOf(scaleManager.savedScaleAddress) }
    // True once a reading has arrived and is sitting in the fields waiting to be
    // confirmed, so the card can say so rather than silently changing two numbers.
    var awaitingConfirm by remember { mutableStateOf(false) }
    val bluetoothPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        if (result.values.all { it }) {
            if (pendingScaleScan) {
                pendingScaleScan = false
                // Resume whichever action needed the permission. With a scale already
                // chosen that is a read, not a rescan - otherwise granting permission
                // from the READ button would drop the user back into device discovery.
                val saved = scaleManager.savedScaleAddress
                if (saved != null && !showScalePanel) {
                    scaleManager.clearReading()
                    awaitingConfirm = false
                    scaleManager.connect(saved)
                } else {
                    scaleManager.startScan()?.let { Toast.makeText(context, it, Toast.LENGTH_LONG).show() }
                    scaleScanning = true
                }
            }
        } else {
            Toast.makeText(context, "Bluetooth permission is needed to read the scale", Toast.LENGTH_LONG).show()
        }
    }

    // A decoded reading fills the entry fields rather than saving on its own: a scale
    // can report mid-step, and a number that writes itself into your history without
    // you seeing it first is worse than one you confirm.
    LaunchedEffect(scaleReading) {
        scaleReading?.let { r ->
            r.weightKg?.let { weightInput = String.format(java.util.Locale.US, "%.1f", it) }
            r.bodyFatPercent?.let { bodyFatInput = String.format(java.util.Locale.US, "%.1f", it) }

            // The scale does not send a body fat figure. It sends impedance, and this
            // is where that becomes one - the same step the manufacturer's own app
            // takes, with an equation that has been published rather than a private one.
            val weight = r.weightKg
            val ohms = r.impedanceOhms
            val height = zenithProfile.heightCm
            val male = zenithProfile.isMale
            if (r.bodyFatPercent == null && weight != null && ohms != null && height != null && male != null) {
                BodyComposition.estimate(weight, height, ohms, male)?.let { est ->
                    bodyFatInput = String.format(java.util.Locale.US, "%.1f", est.bodyFatPercent)
                    bodyCompositionNote =
                        "Body fat estimated from ${ohms.toInt()} Ω, your height and age (Sun 2003) — " +
                        "fat-free mass ${est.fatFreeMassKg} kg. Your scale's own app uses a different, " +
                        "unpublished equation, so expect a few points of difference."
                }
            }
            if (r.hasAnything) {
                bodyStatsSavedOk = false
                // Filled in, not saved. A scale reports mid-step and settles a second
                // later, and a number that writes itself into your history without you
                // seeing it is worse than one you confirm.
                awaitingConfirm = true
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            scaleManager.stopScan()
            scaleManager.disconnect()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        coroutineScope.launch {
            hasPermissions = healthConnectManager.hasAllPermissions()
            hasBackgroundAccess = healthConnectManager.hasBackgroundReadPermission()
            hasWriteAccess = healthConnectManager.hasWritePermissions()
        }
    }

    LaunchedEffect(Unit) {
        hasPermissions = healthConnectManager.hasAllPermissions()
        hasBackgroundAccess = healthConnectManager.hasBackgroundReadPermission()
        hasWriteAccess = healthConnectManager.hasWritePermissions()

        // Prefilled with the last reading so a daily entry is a small correction to an
        // existing number rather than typing two figures from scratch.
        val (lastWeight, lastFat) = healthConnectManager.latestBodyStats()
        // Gives the frame search something to check itself against. Without it a
        // single in-range value wins by default, which is how 25.1 kg reached the
        // confirmation field.
        scaleManager.setExpectedWeight(lastWeight)
        if (weightInput.isBlank() && lastWeight != null) {
            weightInput = String.format(java.util.Locale.US, "%.1f", lastWeight)
        }
        if (bodyFatInput.isBlank() && lastFat != null) {
            bodyFatInput = String.format(java.util.Locale.US, "%.1f", lastFat)
        }
        
        // Auto update check using dynamic versionCode
        val currentCode = com.zenith.pulse.BuildConfig.VERSION_CODE
        val info = com.zenith.pulse.update.UpdateManager.checkForUpdates(currentCode)
        if (info != null) {
            updateInfo = info
        }
    }

    // A. Update Dialog Popup
    updateInfo?.let { info ->
        AlertDialog(
            onDismissRequest = { /* Prevent dismissal during update */ },
            title = {
                Text(
                    text = "Update Available",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = ZenithAccent
                )
            },
            text = {
                Column {
                    Text(
                        text = "A new version of Zenith Pulse (v${info.versionName}) is available.",
                        color = ZenithTextMain,
                        fontSize = 14.sp
                    )
                    if (isDownloadingUpdate) {
                        Spacer(modifier = Modifier.height(16.dp))
                        LinearProgressIndicator(
                            progress = { downloadProgress },
                            modifier = Modifier.fillMaxWidth(),
                            color = ZenithAccent,
                            trackColor = ZenithSteelBorder
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Downloading: ${(downloadProgress * 100).toInt()}%",
                            color = ZenithTextMuted,
                            fontSize = 12.sp
                        )
                    }
                }
            },
            confirmButton = {
                if (!isDownloadingUpdate) {
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                isDownloadingUpdate = true
                                com.zenith.pulse.update.UpdateManager.downloadAndInstallApk(
                                    context = context,
                                    downloadUrl = info.downloadUrl,
                                    expectedSha256 = info.sha256,
                                    onProgress = { p -> downloadProgress = p },
                                    onError = { err ->
                                        isDownloadingUpdate = false
                                        Toast.makeText(context, err, Toast.LENGTH_LONG).show()
                                    }
                                )
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ZenithAccent)
                    ) {
                        Text("UPDATE NOW", color = Color(0xFF09090B), fontWeight = FontWeight.Bold)
                    }
                }
            },
            dismissButton = {
                if (!isDownloadingUpdate) {
                    TextButton(onClick = { updateInfo = null }) {
                        Text("LATER", color = ZenithTextMuted)
                    }
                }
            },
            containerColor = ZenithCardBg,
            shape = RoundedCornerShape(16.dp)
        )
    }

    // Background Gradient for entire screen
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(ZenithBgDark, Color(0xFF0C0E14), Color(0xFF09090B))
                )
            )
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        if (!isLoggedInState) {
            // ==========================================
            // SCREEN 1: LOGIN SCREEN (Minimalist)
            // ==========================================
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Circle Logo
                Box(
                    modifier = Modifier
                        .size(100.dp)
                        .clip(CircleShape)
                        .border(2.dp, ZenithAccent, CircleShape)
                        .background(ZenithCardBg),
                    contentAlignment = Alignment.Center
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.ic_zenith_pulse),
                        contentDescription = "Emblem",
                        modifier = Modifier
                            .size(70.dp)
                            .clip(CircleShape)
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                Text(
                    text = "ZENITH PULSE",
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Black,
                    color = ZenithAccent,
                    letterSpacing = 3.sp
                )
                Text(
                    text = "Health Connect Ingestion Client",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = ZenithTextMuted
                )

                Spacer(modifier = Modifier.height(36.dp))

                OutlinedTextField(
                    value = emailInput.value,
                    onValueChange = { emailInput.value = it },
                    label = { Text("Email Address") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF141824),
                        unfocusedContainerColor = Color(0xFF141824),
                        focusedBorderColor = ZenithAccent,
                        unfocusedBorderColor = ZenithSteelBorder,
                        focusedLabelColor = ZenithAccent,
                        unfocusedLabelColor = ZenithTextMuted,
                        focusedTextColor = ZenithTextMain,
                        unfocusedTextColor = ZenithTextMain
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = passwordInput.value,
                    onValueChange = { passwordInput.value = it },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF141824),
                        unfocusedContainerColor = Color(0xFF141824),
                        focusedBorderColor = ZenithAccent,
                        unfocusedBorderColor = ZenithSteelBorder,
                        focusedLabelColor = ZenithAccent,
                        unfocusedLabelColor = ZenithTextMuted,
                        focusedTextColor = ZenithTextMain,
                        unfocusedTextColor = ZenithTextMain
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                authMessage?.let { msg ->
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(text = msg, fontSize = 12.sp, color = ZenithRed)
                }

                Spacer(modifier = Modifier.height(28.dp))

                Button(
                    onClick = {
                        coroutineScope.launch {
                            isLoggingIn = true
                            authMessage = null
                            val (success, msg) = com.zenith.pulse.auth.UserAuthManager.loginWithSupabase(
                                context,
                                emailInput.value,
                                passwordInput.value
                            )
                            isLoggingIn = false
                            if (success) {
                                isLoggedInState = true
                                userEmailState = com.zenith.pulse.auth.UserAuthManager.getUserEmail(context) ?: emailInput.value
                                Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                            } else {
                                authMessage = msg
                            }
                        }
                    },
                    enabled = !isLoggingIn,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ZenithAccent,
                        disabledContainerColor = ZenithSteelGrey
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                ) {
                    Text(
                        text = if (isLoggingIn) "LOGGING IN..." else "SIGN IN",
                        color = Color(0xFF09090B),
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        letterSpacing = 1.sp
                    )
                }
            }
        } else {
            // ==========================================
            // SCREEN 2: SYNC SCREEN (Zero-UI Concept)
            // ==========================================
            Box(modifier = Modifier.fillMaxSize()) {
                // Top bar: Account & Logout
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = userEmailState,
                        color = ZenithTextMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )

                    Text(
                        text = "LOGOUT",
                        color = ZenithRed,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                        modifier = Modifier.clickable {
                            com.zenith.pulse.auth.UserAuthManager.logout(context)
                            isLoggedInState = false
                            userEmailState = ""
                            syncSuccess = false
                            isSyncing = false
                        }
                    )
                }

                // Center logo & pulse animation
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // Double concentric pulse animation
                    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
                    val scale1 by infiniteTransition.animateFloat(
                        initialValue = 1.0f,
                        targetValue = 2.0f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(1800, easing = LinearOutSlowInEasing),
                            repeatMode = RepeatMode.Restart
                        ),
                        label = "scale1"
                    )
                    val alpha1 by infiniteTransition.animateFloat(
                        initialValue = 0.8f,
                        targetValue = 0.0f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(1800, easing = LinearOutSlowInEasing),
                            repeatMode = RepeatMode.Restart
                        ),
                        label = "alpha1"
                    )

                    val scale2 by infiniteTransition.animateFloat(
                        initialValue = 1.0f,
                        targetValue = 2.0f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(1800, delayMillis = 900, easing = LinearOutSlowInEasing),
                            repeatMode = RepeatMode.Restart
                        ),
                        label = "scale2"
                    )
                    val alpha2 by infiniteTransition.animateFloat(
                        initialValue = 0.8f,
                        targetValue = 0.0f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(1800, delayMillis = 900, easing = LinearOutSlowInEasing),
                            repeatMode = RepeatMode.Restart
                        ),
                        label = "alpha2"
                    )

                    Box(contentAlignment = Alignment.Center) {
                        if (isSyncing) {
                            Box(
                                modifier = Modifier
                                    .size(160.dp)
                                    .graphicsLayer {
                                        scaleX = scale1
                                        scaleY = scale1
                                        alpha = alpha1
                                    }
                                    .background(ZenithAccent.copy(alpha = 0.35f), CircleShape)
                            )
                            Box(
                                modifier = Modifier
                                    .size(160.dp)
                                    .graphicsLayer {
                                        scaleX = scale2
                                        scaleY = scale2
                                        alpha = alpha2
                                    }
                                    .background(ZenithAccent.copy(alpha = 0.35f), CircleShape)
                            )
                        }

                        // Circular Logo Button
                        Box(
                            modifier = Modifier
                                .size(160.dp)
                                .clip(CircleShape)
                                .background(ZenithCardBg)
                                .border(
                                    width = 3.dp,
                                    color = if (syncSuccess) ZenithAccent else if (hasPermissions) ZenithAccent.copy(alpha = 0.6f) else ZenithRed,
                                    shape = CircleShape
                                )
                                .clickable(enabled = !isSyncing && hasPermissions) {
                                    coroutineScope.launch {
                                        isSyncing = true
                                        val success = ZenithSyncManager.performSync(context)
                                        isSyncing = false
                                        if (success) {
                                            syncSuccess = true
                                            delay(3000)
                                            syncSuccess = false
                                        } else {
                                            Toast.makeText(context, "Synchronization failed.", Toast.LENGTH_LONG).show()
                                        }
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            if (syncSuccess) {
                                Canvas(modifier = Modifier.size(64.dp)) {
                                    val path = androidx.compose.ui.graphics.Path().apply {
                                        moveTo(size.width * 0.25f, size.height * 0.5f)
                                        lineTo(size.width * 0.45f, size.height * 0.7f)
                                        lineTo(size.width * 0.75f, size.height * 0.3f)
                                    }
                                    drawPath(
                                        path = path,
                                        color = ZenithAccent,
                                        style = Stroke(
                                            width = 6.dp.toPx(),
                                            cap = StrokeCap.Round,
                                            join = StrokeJoin.Round
                                        )
                                    )
                                }
                            } else {
                                Image(
                                    painter = painterResource(id = R.drawable.ic_zenith_pulse),
                                    contentDescription = "Zenith Logo",
                                    modifier = Modifier
                                        .size(100.dp)
                                        .clip(CircleShape)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(28.dp))

                    Text(
                        text = if (isSyncing) "SYNCING..." else if (syncSuccess) "SUCCESS!" else "TAP TO SYNC",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (syncSuccess) ZenithAccent else ZenithTextMain,
                        letterSpacing = 1.sp
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = if (isSyncing) "Transferring data to Zenith..." else if (syncSuccess) "Biometrics are up to date" else "Full offline synchronization",
                        fontSize = 12.sp,
                        color = ZenithTextMuted
                    )

                    Spacer(modifier = Modifier.height(32.dp))

                    // -- Body stats -------------------------------------------------
                    // The one thing Health Connect cannot get on its own here: a
                    // Virtuagym-branded scale reports only into Virtuagym, and
                    // Virtuagym does not write to Health Connect. Entered once here it
                    // reaches Health Connect, then Zenith, then anything else reading
                    // Health Connect - instead of being read off one app and retyped
                    // into another every day.
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF12161C)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0x22FFFFFF))
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "BODY STATS FROM YOUR SCALE",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = ZenithTextMuted,
                                letterSpacing = 1.sp
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Saved to Health Connect, so Zenith picks it up automatically.",
                                fontSize = 11.sp,
                                color = ZenithTextMuted
                            )
                            Spacer(modifier = Modifier.height(14.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                OutlinedTextField(
                                    value = weightInput,
                                    onValueChange = { weightInput = it; bodyStatsSavedOk = false },
                                    label = { Text("Weight (kg)") },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = ZenithAccent,
                                        unfocusedBorderColor = Color(0x33FFFFFF),
                                        focusedLabelColor = ZenithAccent,
                                        unfocusedLabelColor = ZenithTextMuted,
                                        focusedTextColor = ZenithTextMain,
                                        unfocusedTextColor = ZenithTextMain
                                    ),
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedTextField(
                                    value = bodyFatInput,
                                    onValueChange = { bodyFatInput = it; bodyStatsSavedOk = false },
                                    label = { Text("Body fat (%)") },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = ZenithAccent,
                                        unfocusedBorderColor = Color(0x33FFFFFF),
                                        focusedLabelColor = ZenithAccent,
                                        unfocusedLabelColor = ZenithTextMuted,
                                        focusedTextColor = ZenithTextMain,
                                        unfocusedTextColor = ZenithTextMain
                                    ),
                                    modifier = Modifier.weight(1f)
                                )
                            }

                            bodyStatsMessage?.let { msg ->
                                Spacer(modifier = Modifier.height(10.dp))
                                Text(
                                    text = msg,
                                    fontSize = 12.sp,
                                    color = if (bodyStatsSavedOk) ZenithAccent else ZenithRed
                                )
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            // ── Reading the scale ───────────────────────────────
                            // Picking the scale is a setup step, done once. After that
                            // the daily flow is: open, step on, confirm.
                            if (savedScaleAddress != null && !showScalePanel) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(Color(0xFF1A1F27), RoundedCornerShape(8.dp))
                                        .padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = savedScaleName ?: "Your scale",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = ZenithTextMain
                                        )
                                        Text(
                                            text = if (scaleStatus.isNotEmpty()) scaleStatus else "Tap to read, then step on",
                                            fontSize = 10.sp,
                                            color = ZenithTextMuted
                                        )
                                    }
                                    Text(
                                        text = "READ",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = ZenithAccent,
                                        modifier = Modifier.clickable {
                                            val missing = bluetoothPermissions.any {
                                                androidx.core.content.ContextCompat.checkSelfPermission(context, it) !=
                                                    android.content.pm.PackageManager.PERMISSION_GRANTED
                                            }
                                            if (missing) {
                                                pendingScaleScan = true
                                                bluetoothPermissionLauncher.launch(bluetoothPermissions)
                                            } else {
                                                // Clear first: a leftover reading would
                                                // make a failed connection look like a
                                                // fresh measurement.
                                                scaleManager.clearReading()
                                                awaitingConfirm = false
                                                savedScaleAddress?.let { scaleManager.connect(it) }
                                            }
                                        }
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                            }

                            Text(
                                text = when {
                                    showScalePanel -> "Hide scale setup"
                                    savedScaleAddress != null -> "Scale setup & diagnostics"
                                    else -> "Set up my Bluetooth scale"
                                },
                                fontSize = 12.sp,
                                color = ZenithAccent,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.clickable {
                                    showScalePanel = !showScalePanel
                                    if (!showScalePanel) {
                                        scaleManager.stopScan()
                                        scaleScanning = false
                                    }
                                }
                            )

                            if (showScalePanel) {
                                Spacer(modifier = Modifier.height(10.dp))

                                Text(
                                    text = "Step on the scale so it powers up, then scan. Pick it from the list once and Zenith will remember it.",
                                    fontSize = 11.sp,
                                    color = ZenithTextMuted
                                )

                                Spacer(modifier = Modifier.height(10.dp))

                                Button(
                                    onClick = {
                                        val missing = bluetoothPermissions.any {
                                            androidx.core.content.ContextCompat.checkSelfPermission(context, it) !=
                                                android.content.pm.PackageManager.PERMISSION_GRANTED
                                        }
                                        if (missing) {
                                            pendingScaleScan = true
                                            bluetoothPermissionLauncher.launch(bluetoothPermissions)
                                        } else if (scaleScanning) {
                                            scaleManager.stopScan()
                                            scaleScanning = false
                                        } else {
                                            scaleManager.startScan()?.let {
                                                Toast.makeText(context, it, Toast.LENGTH_LONG).show()
                                            }
                                            scaleScanning = true
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E2530)),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = if (scaleScanning) "STOP SCANNING" else "SCAN FOR SCALE",
                                        color = ZenithTextMain,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                }

                                if (scaleStatus.isNotEmpty()) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(text = scaleStatus, fontSize = 11.sp, color = ZenithTextMuted)
                                }

                                // Always offered, never gated on having captured
                                // something. A scan that finds nothing is exactly
                                // when these details are needed, and the previous
                                // version hid the button in precisely that case.
                                Spacer(modifier = Modifier.height(12.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Button(
                                        onClick = {
                                            val text = scaleManager.diagnosticsText()
                                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                            cm.setPrimaryClip(ClipData.newPlainText("Zenith scale diagnostics", text))
                                            Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E2530)),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text("COPY", color = ZenithTextMain, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                    }
                                    Button(
                                        onClick = {
                                            // Share, not just clipboard: pasting a long
                                            // hex dump out of an Android clipboard into
                                            // something useful is its own small ordeal.
                                            val send = Intent(Intent.ACTION_SEND).apply {
                                                type = "text/plain"
                                                putExtra(Intent.EXTRA_SUBJECT, "Zenith Pulse scale diagnostics")
                                                putExtra(Intent.EXTRA_TEXT, scaleManager.diagnosticsText())
                                            }
                                            context.startActivity(Intent.createChooser(send, "Send diagnostics"))
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = ZenithAccent),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text("SHARE", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                    }

                                scaleDevices.forEach { dev ->
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                scaleManager.stopScan()
                                                scaleScanning = false
                                                scaleManager.rememberScale(dev.address, dev.name)
                                                savedScaleAddress = dev.address
                                                savedScaleName = dev.name
                                                scaleManager.clearReading()
                                                awaitingConfirm = false
                                                scaleManager.connect(dev.address)
                                            }
                                            .background(Color(0xFF1A1F27), RoundedCornerShape(8.dp))
                                            .padding(10.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = dev.name,
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (dev.looksLikeAScale) ZenithAccent else ZenithTextMain
                                            )
                                            Text(
                                                text = if (dev.looksLikeAScale) "Looks like a scale · tap to use it" else "tap to use it",
                                                fontSize = 10.sp,
                                                color = ZenithTextMuted
                                            )
                                        }
                                        Text(text = "${dev.rssi} dBm", fontSize = 10.sp, color = ZenithTextMuted)
                                    }
                                }

                                }

                                Text(
                                    text = if (scaleFrames.isEmpty())
                                        "Nothing captured yet — send this anyway, what it does NOT contain is the useful part."
                                    else
                                        "${scaleFrames.size} frames captured.",
                                    fontSize = 10.sp,
                                    color = ZenithTextMuted,
                                    modifier = Modifier.padding(top = 6.dp)
                                )

                                // On screen as well, and selectable. If sharing is
                                // awkward this can still be read or screenshotted.
                                Spacer(modifier = Modifier.height(10.dp))
                                // The scale measures weight and impedance and nothing
                                // else. Body fat, water, muscle and bone are computed
                                // from impedance with age, sex and height - by the app,
                                // not the scale - so saying so beats an empty field the
                                // athlete reads as a failure.
                                bodyCompositionNote?.let { note ->
                                    Text(
                                        text = note,
                                        fontSize = 10.sp,
                                        color = ZenithTextMuted,
                                        modifier = Modifier.padding(top = 6.dp)
                                    )
                                }

                                // Says which input is missing rather than leaving an
                                // empty box that reads as a failed measurement.
                                if (bodyCompositionNote == null && scaleReading?.impedanceOhms != null && !zenithProfile.isComplete) {
                                    Text(
                                        text = "Impedance ${scaleReading?.impedanceOhms?.toInt()} Ω measured, but your Zenith profile is missing " +
                                            (if (zenithProfile.heightCm == null) "your height" else "your sex") +
                                            " — set it there and body fat will fill itself in.",
                                        fontSize = 10.sp,
                                        color = ZenithTextMuted,
                                        modifier = Modifier.padding(top = 6.dp)
                                    )
                                }

                                Text(
                                    text = if (showDiagnostics) "Hide details" else "Show details",
                                    fontSize = 11.sp,
                                    color = ZenithAccent,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.clickable { showDiagnostics = !showDiagnostics }
                                )
                                if (showDiagnostics) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    androidx.compose.foundation.text.selection.SelectionContainer {
                                        Text(
                                            text = scaleManager.diagnosticsText(),
                                            fontSize = 9.sp,
                                            color = ZenithTextMuted,
                                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .background(Color(0xFF0E1217), RoundedCornerShape(8.dp))
                                                .padding(10.dp)
                                        )
                                    }
                                }
                            }

                            if (awaitingConfirm) {
                                Spacer(modifier = Modifier.height(10.dp))
                                Text(
                                    text = "Read from your scale — check the numbers above, then save.",
                                    fontSize = 11.sp,
                                    color = ZenithAccent,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        bodyStatsSaving = true
                                        bodyStatsSavedOk = false
                                        bodyStatsMessage = null

                                        if (!healthConnectManager.hasWritePermissions()) {
                                            // Ask rather than fail: write access is a
                                            // separate grant from the read permissions.
                                            bodyStatsSaving = false
                                            permissionLauncher.launch(healthConnectManager.writePermissions)
                                            return@launch
                                        }

                                        val weight = weightInput.trim().replace(",", ".").toDoubleOrNull()
                                        // Body fat is optional - a scale that only reports
                                        // weight should not block the entry.
                                        val fat = bodyFatInput.trim().replace(",", ".").toDoubleOrNull()

                                        if (weight == null) {
                                            bodyStatsMessage = "Enter a weight first"
                                            bodyStatsSaving = false
                                            return@launch
                                        }

                                        val error = healthConnectManager.writeBodyStats(weight, fat, LocalDate.now())
                                        if (error != null) {
                                            bodyStatsMessage = error
                                            bodyStatsSaving = false
                                            return@launch
                                        }

                                        // Push it straight through rather than waiting for
                                        // the next periodic sync - the whole point is that
                                        // it lands in Zenith without a second step.
                                        val synced = ZenithSyncManager.performSync(context, "MANUAL")
                                        bodyStatsSaving = false
                                        bodyStatsSavedOk = true
                                        awaitingConfirm = false
                                        bodyStatsMessage = if (synced) {
                                            "Saved and sent to Zenith."
                                        } else {
                                            "Saved to Health Connect. It will reach Zenith on the next sync."
                                        }
                                        hasWriteAccess = true
                                    }
                                },
                                enabled = !bodyStatsSaving,
                                colors = ButtonDefaults.buttonColors(containerColor = ZenithAccent),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = when {
                                        bodyStatsSaving -> "SAVING..."
                                        !hasWriteAccess -> "ALLOW ACCESS & SAVE"
                                        awaitingConfirm -> "CONFIRM & SAVE"
                                        else -> "SAVE"
                                    },
                                    color = Color.Black,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                // Background access is a separate grant, and its absence is silent:
                // everything looks fine while the app is open and nothing syncs once it
                // is closed. Only shown once the read permissions themselves are in
                // place, so the two prompts do not compete.
                if (hasPermissions && !hasBackgroundAccess) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 16.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF2D2416)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF5A623))
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Background Sync Is Off",
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFF5A623),
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Zenith Pulse can only read Health Connect while it is open. Allow background access so your data keeps syncing on its own.",
                                fontSize = 12.sp,
                                color = ZenithTextMain,
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = {
                                    permissionLauncher.launch(setOf(healthConnectManager.backgroundReadPermission))
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF5A623)),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("ALLOW BACKGROUND SYNC", color = Color.Black, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // Bottom permissions alert (if missing)
                if (!hasPermissions) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 16.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF2D1616)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, ZenithRed)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Health Connect Permissions Required",
                                fontWeight = FontWeight.Bold,
                                color = ZenithRed,
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Grant access to Health Connect to read biometric data.",
                                fontSize = 12.sp,
                                color = ZenithTextMain,
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = {
                                    permissionLauncher.launch(healthConnectManager.requiredPermissions)
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = ZenithRed),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("GRANT ACCESS", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}
