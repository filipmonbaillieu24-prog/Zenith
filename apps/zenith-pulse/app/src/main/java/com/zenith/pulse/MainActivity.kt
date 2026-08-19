package com.zenith.pulse

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
import com.zenith.pulse.sync.ZenithSyncManager
import androidx.compose.animation.core.*
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Canvas
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
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

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        coroutineScope.launch {
            hasPermissions = healthConnectManager.hasAllPermissions()
        }
    }

    LaunchedEffect(Unit) {
        hasPermissions = healthConnectManager.hasAllPermissions()
        
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
                    text = "Update Beschikbaar",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = ZenithAccent
                )
            },
            text = {
                Column {
                    Text(
                        text = "Er is een nieuwe versie van Zenith Pulse (v${info.versionName}) beschikbaar.",
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
                            text = "Downloaden: ${(downloadProgress * 100).toInt()}%",
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
                        Text("UPDATE NU", color = Color(0xFF09090B), fontWeight = FontWeight.Bold)
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
                    label = { Text("E-mailadres") },
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
                    label = { Text("Wachtwoord") },
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
                        text = if (isLoggingIn) "INLOGGEN..." else "INLOGGEN",
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
                        text = "UITLOGGEN",
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
                                            Toast.makeText(context, "Synchronisatie mislukt.", Toast.LENGTH_LONG).show()
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
                        text = if (isSyncing) "SYNCHRONISEREN..." else if (syncSuccess) "GESLAAGD!" else "TIK OM TE SYNCHRONISEREN",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (syncSuccess) ZenithAccent else ZenithTextMain,
                        letterSpacing = 1.sp
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = if (isSyncing) "Data wordt overgedragen naar Zenith..." else if (syncSuccess) "Biometrische gegevens up-to-date" else "Volledige offline synchronisatie",
                        fontSize = 12.sp,
                        color = ZenithTextMuted
                    )
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
                                text = "Health Connect Permissies Vereist",
                                fontWeight = FontWeight.Bold,
                                color = ZenithRed,
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Geef toegang tot Health Connect om biometrische gegevens uit te lezen.",
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
                                Text("TOEGANG VERLENEN", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}
