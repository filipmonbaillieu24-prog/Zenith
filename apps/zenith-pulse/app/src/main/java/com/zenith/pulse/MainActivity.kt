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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.health.connect.client.PermissionController
import com.zenith.pulse.data.HealthConnectManager
import com.zenith.pulse.data.ScaleBleManager
import com.zenith.pulse.data.ZenithProfileStore
import com.zenith.pulse.data.BodyComposition
import com.zenith.pulse.data.BodyCompositionStore
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
import androidx.compose.ui.text.style.TextOverflow
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

/*
 * The Zenith palette, shared with Kratos Pilot and the six web apps.
 *
 * Pulse was the last thing still wearing the neon green (#39FF14) that the rest of the
 * ecosystem stopped using: one app in the family shouting in a colour none of its
 * siblings owned. The names are kept so the hundred-odd call sites keep working; only
 * what they resolve to has changed.
 */
val ZenithBgDark = Color(0xFF09090B)
val PulseGradientTop = Color(0xFF090A0C)
val PulseGradientBottom = Color(0xFF0D2634)

val ZenithAccent = Color(0xFF38BDF8)
val ZenithAccentSoft = Color(0xFF7DD3FC)
/** A shade lighter, for the login button standing on nothing but the ground. */
val PulseLoginAccent = Color(0xFF45BBEF)
val ZenithOnAccent = Color(0xFF09090B)

/** Glass - a card lightens the ground rather than covering it. */
val ZenithGlass = Color(0x0BFFFFFF)
val ZenithGlassBorder = Color(0x14FFFFFF)
/** Opaque - dialogs and sheets, which sit over content and must not show it. */
val ZenithCardBg = Color(0xFF1C1C23)
/** Inert input chrome. */
val ZenithField = Color(0xFF27272E)

val ZenithSteelGrey = Color(0xFF1E293B)
val ZenithSteelBorder = Color(0xFF27272A)
val ZenithPurple = Color(0xFFA855F7)
val ZenithTextMain = Color(0xFFF8FAFC)
val ZenithTextBright = Color(0xFFCBD5E1)
val ZenithTextMuted = Color(0xFF94A3B8)
val ZenithTextSub = Color(0xFF64748B)
val ZenithGood = Color(0xFF4ADE80)
val ZenithWarn = Color(0xFFF5A623)
val ZenithRed = Color(0xFFEF4444)

/**
 * The ground, top-left to bottom-right. `Offset.Infinite` is the far corner of whatever
 * it is painted on, so the gradient runs the full diagonal on any screen size rather
 * than a fixed number of pixels.
 */
val PulseGround = Brush.linearGradient(
    colors = listOf(PulseGradientTop, PulseGradientBottom),
    start = Offset.Zero,
    end = Offset.Infinite
)

/** The wordmark face. Palatino is not on Android; Serif resolves to Noto Serif. */
val PulseWordmark: FontFamily = FontFamily.Serif

@Composable
fun ZenithPulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = ZenithBgDark,
            surface = ZenithCardBg,
            primary = ZenithAccent,
            secondary = ZenithAccentSoft,
            onPrimary = ZenithOnAccent,
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

    // What the running sync has actually got through. Keyed by SyncStage.name, with
    // true for a stage that finished and false for the one that gave up; a stage with
    // no entry has not been reached. Written from the sync's IO thread, which snapshot
    // state handles.
    val hcStages = remember { mutableStateMapOf<String, Boolean>() }
    var hcOpen by remember { mutableStateOf(false) }
    var hcFinished by remember { mutableStateOf(false) }

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
    // Kept so the confirmed reading can carry water and muscle through to Zenith, not
    // only the body fat that has an input box of its own.
    var lastEstimate by remember { mutableStateOf<BodyComposition.Estimate?>(null) }
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
                BodyComposition.estimate(weight, height, ohms, male, zenithProfile.ageYears)?.let { est ->
                    bodyFatInput = String.format(java.util.Locale.US, "%.1f", est.bodyFatPercent)
                    lastEstimate = est
                    bodyCompositionNote = buildString {
                        // Age is not an input to Sun 2003 - it takes height, weight, sex
                        // and resistance - so naming it would make the estimate sound
                        // better founded than it is. Janssen's muscle equation does use
                        // it, which is why that line can be missing and the others not.
                        append("From ${ohms.toInt()} Ω, your height and weight: ")
                        append("body fat ${est.bodyFatPercent}% (fat-free mass ${est.fatFreeMassKg} kg), ")
                        append("water ${est.bodyWaterPercent}% (${est.totalBodyWaterL} L)")
                        est.skeletalMusclePercent?.let {
                            append(", skeletal muscle ${it}% (${est.skeletalMuscleMassKg} kg)")
                        }
                        append(". Fat and water are Sun 2003")
                        if (est.skeletalMusclePercent != null) append("; muscle is Janssen 2000, skeletal muscle only")
                        append(". Your scale's app uses its own unpublished equations, so expect some difference.")
                        if (est.skeletalMusclePercent == null) {
                            append(" Add your date of birth in the profile to get a muscle figure too.")
                        }
                    }
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

    // The ground. Padding is left to each screen: the login centres on 28dp like the
    // rest of the family, the dashboard sits on 20dp.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PulseGround)
            .systemBarsPadding(),
        contentAlignment = Alignment.Center
    ) {
        if (!isLoggedInState) {
            // ==========================================
            // SCREEN 1: LOGIN SCREEN (Minimalist)
            // ==========================================
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // The wordmark carries the screen, set large and light rather than
                // heavy - a black serif at this size reads as a logo stamp.
                Text(
                    text = "PULSE",
                    fontSize = 44.sp,
                    fontWeight = FontWeight.Normal,
                    fontFamily = PulseWordmark,
                    color = Color.White,
                    letterSpacing = 2.sp
                )
                Text(
                    text = "HEALTH & RECOVERY",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = ZenithTextBright,
                    letterSpacing = 1.sp
                )

                Spacer(modifier = Modifier.height(36.dp))

                OutlinedTextField(
                    value = emailInput.value,
                    onValueChange = { emailInput.value = it },
                    placeholder = { Text("Email address", color = ZenithTextMuted, fontSize = 14.sp) },
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedBorderColor = ZenithAccent,
                        unfocusedBorderColor = ZenithSteelBorder,
                        cursorColor = ZenithAccent,
                        focusedTextColor = ZenithTextMain,
                        unfocusedTextColor = ZenithTextMain
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(14.dp))

                OutlinedTextField(
                    value = passwordInput.value,
                    onValueChange = { passwordInput.value = it },
                    placeholder = { Text("Password", color = ZenithTextMuted, fontSize = 14.sp) },
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp),
                    visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedBorderColor = ZenithAccent,
                        unfocusedBorderColor = ZenithSteelBorder,
                        cursorColor = ZenithAccent,
                        focusedTextColor = ZenithTextMain,
                        unfocusedTextColor = ZenithTextMain
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                authMessage?.let { msg ->
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(text = msg, fontSize = 12.sp, color = ZenithRed)
                }

                Spacer(modifier = Modifier.height(20.dp))

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
                        containerColor = PulseLoginAccent,
                        disabledContainerColor = ZenithSteelGrey
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                ) {
                    Text(
                        text = if (isLoggingIn) "LOGGING IN..." else "LOG IN",
                        color = ZenithOnAccent,
                        fontWeight = FontWeight.Black,
                        fontSize = 15.sp,
                        letterSpacing = 0.5.sp
                    )
                }
            }
        } else {
            // ==========================================
            // SCREEN 2: SYNC SCREEN (Zero-UI Concept)
            // ==========================================
            Box(modifier = Modifier.fillMaxSize().padding(20.dp)) {
                // Top bar: Account & Logout
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // The account, kept but demoted: it is reassurance, not a control.
                    Text(
                        text = userEmailState,
                        color = ZenithTextSub,
                        fontSize = 9.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.width(74.dp)
                    )

                    Text(
                        text = "PULSE",
                        fontSize = 18.sp,
                        fontFamily = PulseWordmark,
                        color = Color.White,
                        letterSpacing = 1.sp
                    )

                    Box(
                        modifier = Modifier
                            .background(Color(0x1AFF7675), RoundedCornerShape(8.dp))
                            .clickable {
                                com.zenith.pulse.auth.UserAuthManager.logout(context)
                                isLoggedInState = false
                                userEmailState = ""
                                syncSuccess = false
                                isSyncing = false
                            }
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Text(text = "LOG OUT", color = ZenithRed, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                }

                // Center logo & pulse animation
                // Scrollable, and centred only while it fits. The scale setup panel
                // below expands into a scan list and a diagnostics dump, which on a
                // shorter phone used to run off the bottom with no way to reach it.
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = 44.dp, bottom = 8.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    SyncOrb(
                        isSyncing = isSyncing,
                        syncSuccess = syncSuccess,
                        hasPermissions = hasPermissions,
                        onClick = {
                            coroutineScope.launch {
                                hcStages.clear()
                                hcFinished = false
                                hcOpen = true
                                isSyncing = true
                                val success = ZenithSyncManager.performSync(context, "MANUAL") { stage, ok ->
                                    hcStages[stage.name] = ok
                                }
                                isSyncing = false
                                hcFinished = true
                                if (success) {
                                    syncSuccess = true
                                    delay(3000)
                                    syncSuccess = false
                                }
                            }
                        }
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "HEALTH CONNECT",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (hasPermissions) ZenithAccentSoft else ZenithRed,
                        letterSpacing = 0.5.sp
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    Text(
                        text = when {
                            isSyncing -> "Transferring data to Zenith…"
                            syncSuccess -> "Biometrics are up to date"
                            !hasPermissions -> "Access not granted yet"
                            else -> "Tap to sync"
                        },
                        fontSize = 10.sp,
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
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = ZenithGlass),
                        border = androidx.compose.foundation.BorderStroke(1.dp, ZenithGlassBorder)
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
                                        .background(ZenithField, RoundedCornerShape(8.dp))
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
                                    colors = ButtonDefaults.buttonColors(containerColor = ZenithField),
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
                                        colors = ButtonDefaults.buttonColors(containerColor = ZenithField),
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
                                            .background(ZenithField, RoundedCornerShape(8.dp))
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
                                                .background(Color(0xFF16161C), RoundedCornerShape(8.dp))
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

                                        // Hold the derived pair against today so the next
                                        // sync can carry them; Health Connect has no home
                                        // for either. Only for the reading just confirmed.
                                        lastEstimate?.let { est ->
                                            BodyCompositionStore.save(
                                                context, LocalDate.now(),
                                                est.bodyWaterPercent, est.skeletalMusclePercent
                                            )
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

        if (hcOpen) {
            HealthConnectSyncSheet(
                stages = hcStages,
                finished = hcFinished,
                statusText = ZenithSyncManager.lastSyncStatus,
                onDismiss = { hcOpen = false }
            )
        }
    }
}

/**
 * The sync control: three rings breathing outwards, a slowly turning ring of accent,
 * and a sphere that swells and settles.
 *
 * The rings run whether or not a sync is under way. This app's whole job is that data
 * keeps moving, so its one control should look alive rather than look like a dead
 * button until pressed. Colour is what carries state: the rings go red when Health
 * Connect access is missing, because then pressing it cannot do anything.
 */
@Composable
fun SyncOrb(
    isSyncing: Boolean,
    syncSuccess: Boolean,
    hasPermissions: Boolean,
    onClick: () -> Unit
) {
    val transition = rememberInfiniteTransition(label = "orb")
    val ringColor = if (hasPermissions) ZenithAccent else ZenithRed

    // Three rings on the same 2.4s expansion, started 0.8s apart. The offset is a
    // start offset rather than a delay inside the tween: a delay would be part of each
    // repeat and stretch the period to 3.2s, so the three would drift apart.
    val ringPhases = listOf(0, 800, 1600).map { offsetMs ->
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(2400, easing = LinearEasing),
                repeatMode = RepeatMode.Restart,
                initialStartOffset = StartOffset(offsetMs)
            ),
            label = "ring$offsetMs"
        )
    }

    val spin by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "spin"
    )

    val breathe by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.035f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breathe"
    )

    Box(
        modifier = Modifier
            .size(176.dp)
            .clickable(enabled = !isSyncing) { onClick() },
        contentAlignment = Alignment.Center
    ) {
        ringPhases.forEach { phase ->
            val t = phase.value
            Box(
                modifier = Modifier
                    .size(176.dp)
                    .graphicsLayer {
                        val sc = 1f + 0.7f * t
                        scaleX = sc
                        scaleY = sc
                        alpha = 0.55f * (1f - t)
                    }
                    .border(1.dp, ringColor.copy(alpha = 0.35f), CircleShape)
            )
        }

        Canvas(
            modifier = Modifier
                .size(154.dp)
                .graphicsLayer { rotationZ = spin }
        ) {
            drawCircle(
                brush = Brush.sweepGradient(
                    listOf(ZenithAccent, ZenithAccentSoft, ZenithAccent)
                ),
                radius = size.minDimension / 2f - 2.dp.toPx(),
                style = Stroke(width = 3.dp.toPx()),
                alpha = 0.5f
            )
        }

        Box(
            modifier = Modifier
                .size(132.dp)
                .graphicsLayer {
                    scaleX = breathe
                    scaleY = breathe
                }
                .clip(CircleShape)
                .drawBehind {
                    // Lit from the upper left, so it reads as a sphere rather than a
                    // flat disc.
                    drawCircle(
                        brush = Brush.radialGradient(
                            colors = listOf(Color(0xFF5FCBFA), Color(0xFF0EA5E9), Color(0xFF0369A1)),
                            center = Offset(size.width * 0.35f, size.height * 0.30f),
                            radius = size.width * 0.95f
                        )
                    )
                },
            contentAlignment = Alignment.Center
        ) {
            if (syncSuccess) {
                Canvas(modifier = Modifier.size(56.dp)) {
                    val path = androidx.compose.ui.graphics.Path().apply {
                        moveTo(size.width * 0.25f, size.height * 0.5f)
                        lineTo(size.width * 0.45f, size.height * 0.7f)
                        lineTo(size.width * 0.75f, size.height * 0.3f)
                    }
                    drawPath(
                        path = path,
                        color = Color(0xFF082F49),
                        style = Stroke(
                            width = 6.dp.toPx(),
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round
                        )
                    )
                }
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = "⟳", fontSize = 26.sp, color = Color(0xFF082F49))
                    Text(
                        text = "SYNC",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFF082F49),
                        letterSpacing = 1.sp,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        }
    }
}

/**
 * What the sync is doing, while it does it.
 *
 * The three rows are the three things performSync actually performs, and each ticks
 * when that step has genuinely returned - not on a timer. The distinction matters here
 * more than most places: this app once had 157 of 185 background syncs post a payload
 * of zeros and report success, and a spinner that always ends the same way is exactly
 * what hid it. A step that fails shows a cross and stops the ones after it, and the
 * reason is printed underneath.
 */
@Composable
fun HealthConnectSyncSheet(
    stages: Map<String, Boolean>,
    finished: Boolean,
    statusText: String,
    onDismiss: () -> Unit
) {
    val rows = listOf(
        ZenithSyncManager.SyncStage.AUTH.name to "Signing in",
        ZenithSyncManager.SyncStage.READ.name to "Reading Health Connect",
        ZenithSyncManager.SyncStage.UPLOAD.name to "Uploading to Zenith"
    )
    val failed = stages.values.any { !it }

    val transition = rememberInfiniteTransition(label = "sheet")
    val spin by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "sheetSpin"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xB8050608))
            // Dismissible at any point. The sync carries on either way, and a sheet
            // that can only be closed once the network replies is a trap the moment a
            // request hangs.
            .clickable { onDismiss() },
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .width(288.dp)
                .background(ZenithCardBg, RoundedCornerShape(20.dp))
                .border(1.dp, ZenithGlassBorder, RoundedCornerShape(20.dp))
                .padding(horizontal = 22.dp, vertical = 26.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier.size(64.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .background(if (failed) ZenithRed else ZenithAccent, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (failed) "!" else "⟳",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        color = ZenithOnAccent
                    )
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            Text(
                text = "HEALTH CONNECT",
                fontSize = 12.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
                letterSpacing = 0.6.sp
            )
            Text(
                text = when {
                    failed -> "Sync stopped"
                    finished -> "All done"
                    else -> "Syncing your health data…"
                },
                fontSize = 10.sp,
                color = ZenithTextMuted,
                modifier = Modifier.padding(top = 2.dp, bottom = 16.dp)
            )

            rows.forEachIndexed { index, (key, label) ->
                val state = stages[key]
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = label,
                        fontSize = 12.sp,
                        color = if (state == false) ZenithRed else ZenithTextBright
                    )
                    when {
                        state == true -> Text("✓", fontSize = 14.sp, fontWeight = FontWeight.Black, color = ZenithGood)
                        state == false -> Text("✕", fontSize = 13.sp, fontWeight = FontWeight.Black, color = ZenithRed)
                        // Nothing reached this step because an earlier one gave up.
                        finished -> Text("—", fontSize = 12.sp, color = ZenithTextSub)
                        else -> Canvas(
                            modifier = Modifier
                                .size(13.dp)
                                .graphicsLayer { rotationZ = spin }
                        ) {
                            drawArc(
                                color = ZenithAccent,
                                startAngle = 0f,
                                sweepAngle = 110f,
                                useCenter = false,
                                style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                            )
                        }
                    }
                }
                if (index < rows.lastIndex) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(Color(0x0FFFFFFF))
                    )
                }
            }

            if (failed && statusText.isNotBlank()) {
                Text(
                    text = statusText,
                    fontSize = 10.sp,
                    color = ZenithWarn,
                    lineHeight = 14.sp,
                    modifier = Modifier.padding(top = 12.dp)
                )
            }

            if (finished) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp)
                        .height(42.dp)
                        .background(ZenithAccent, RoundedCornerShape(10.dp))
                        .clickable { onDismiss() },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "DONE",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        color = ZenithOnAccent,
                        letterSpacing = 0.5.sp
                    )
                }
            }
        }
    }
}
