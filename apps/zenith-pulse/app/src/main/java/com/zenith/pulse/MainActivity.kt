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
import com.zenith.pulse.data.HealthDataPayload
import com.zenith.pulse.sync.ZenithSyncManager
import kotlinx.coroutines.launch
import java.net.NetworkInterface

class MainActivity : ComponentActivity() {

    private lateinit var healthConnectManager: HealthConnectManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        healthConnectManager = HealthConnectManager(this)

        setContent {
            ZenithPulseTheme {
                ZenithPulseScreen(
                    healthConnectManager = healthConnectManager,
                    getLocalIpAddress = ::getLocalIpAddress
                )
            }
        }
    }

    private fun getLocalIpAddress(): String {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val intf = interfaces.nextElement()
                val addrs = intf.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (!addr.isLoopbackAddress && addr.hostAddress?.contains(":") == false) {
                        return addr.hostAddress ?: "127.0.0.1"
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return "192.168.x.x"
    }
}

// Zenith Hub Design Tokens
val ZenithBgDark = Color(0xFF09090B)
val ZenithCardBg = Color(0xFF141824)
val ZenithSteelGrey = Color(0xFF1E293B)
val ZenithSteelBorder = Color(0xFF334155)
val ZenithCyan = Color(0xFF38BDF8)
val ZenithPurple = Color(0xFFA855F7)
val ZenithGreen = Color(0xFF10B981)
val ZenithRed = Color(0xFFEF4444)
val ZenithTextMain = Color(0xFFF8FAFC)
val ZenithTextMuted = Color(0xFF94A3B8)
val ZenithTextSub = Color(0xFF64748B)

@Composable
fun ZenithPulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = ZenithBgDark,
            surface = ZenithCardBg,
            primary = ZenithCyan,
            secondary = ZenithPurple,
            onBackground = ZenithTextMain,
            onSurface = ZenithTextMain
        ),
        content = content
    )
}

@Composable
fun ZenithPulseScreen(
    healthConnectManager: HealthConnectManager,
    getLocalIpAddress: () -> String
) {
    val coroutineScope = rememberCoroutineScope()
    var hasPermissions by remember { mutableStateOf(false) }
    var isSyncing by remember { mutableStateOf(false) }
    var payload by remember { mutableStateOf(HealthDataPayload()) }
    var syncMessage by remember { mutableStateOf(ZenithSyncManager.lastSyncStatus) }

    var updateInfo by remember { mutableStateOf<com.zenith.pulse.update.UpdateInfo?>(null) }
    var isDownloadingUpdate by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableStateOf(0f) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        coroutineScope.launch {
            hasPermissions = healthConnectManager.hasAllPermissions()
            if (hasPermissions) {
                payload = healthConnectManager.fetchLatestHealthData()
            }
        }
    }

    LaunchedEffect(Unit) {
        hasPermissions = healthConnectManager.hasAllPermissions()
        if (hasPermissions) {
            payload = healthConnectManager.fetchLatestHealthData()
        }
        // Auto update check using dynamic versionCode
        val currentCode = com.zenith.pulse.BuildConfig.VERSION_CODE
        val info = com.zenith.pulse.update.UpdateManager.checkForUpdates(currentCode)
        if (info != null) {
            updateInfo = info
        }
    }

    val context = androidx.compose.ui.platform.LocalContext.current
    val localIp = remember { getLocalIpAddress() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(ZenithBgDark, Color(0xFF0F172A), Color(0xFF18181B))
                )
            )
            .padding(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            // Update Available Card Banner
            updateInfo?.let { info ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1B4B)),
                    border = androidx.compose.foundation.BorderStroke(1.dp, ZenithPurple)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(ZenithPurple)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Nieuwe Zenith Pulse Update (v${info.versionName})",
                                fontWeight = FontWeight.Bold,
                                color = ZenithPurple,
                                fontSize = 14.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "A new version of Zenith Pulse is available with latest features.",
                            fontSize = 12.sp,
                            color = ZenithTextMain
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        if (isDownloadingUpdate) {
                            LinearProgressIndicator(
                                progress = { downloadProgress },
                                modifier = Modifier.fillMaxWidth(),
                                color = ZenithCyan,
                                trackColor = ZenithSteelBorder
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Update downloaden ${(downloadProgress * 100).toInt()}%...",
                                fontSize = 11.sp,
                                color = ZenithTextMuted
                            )
                        } else {
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
                                colors = ButtonDefaults.buttonColors(containerColor = ZenithCyan),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = "UPDATE AUTOMATICALLY NOW",
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF09090B)
                                )
                            }
                        }
                    }
                }
            }

            // App Header (Zenith Brand System)
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(ZenithCardBg)
                    .border(1.dp, ZenithSteelBorder, RoundedCornerShape(20.dp))
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.ic_zenith_pulse),
                        contentDescription = "Zenith Pulse Logo",
                        modifier = Modifier
                            .size(52.dp)
                            .clip(CircleShape)
                            .border(2.dp, ZenithCyan, CircleShape)
                    )
                    Spacer(modifier = Modifier.width(14.dp))
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "ZENITH PULSE",
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Black,
                                color = ZenithCyan,
                                letterSpacing = 2.sp
                            )
                        }
                        Text(
                            text = "Health Connect Ecosystem Sync",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = ZenithTextMuted
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Zenith User Account & Mandatory Login Card (Steel Grey Theme)
            val userEmail = remember { mutableStateOf(com.zenith.pulse.auth.UserAuthManager.getUserEmail(context) ?: "") }
            val isLoggedIn = remember { mutableStateOf(com.zenith.pulse.auth.UserAuthManager.isLoggedIn(context)) }
            val emailInput = remember { mutableStateOf("filip.monbaillieu.24@gmail.com") }
            val passwordInput = remember { mutableStateOf("") }
            val isLoggingIn = remember { mutableStateOf(false) }
            val authMessage = remember { mutableStateOf<String?>(null) }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = ZenithCardBg),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    if (isLoggedIn.value) ZenithGreen else ZenithSteelBorder
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(if (isLoggedIn.value) ZenithGreen else ZenithRed)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isLoggedIn.value) "Gekoppeld met Zenith Profiel" else "Inloggen Verplicht",
                            fontWeight = FontWeight.ExtraBold,
                            color = if (isLoggedIn.value) ZenithGreen else ZenithRed,
                            fontSize = 14.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    if (isLoggedIn.value) {
                        Text(
                            text = "Ingelogd als: ${userEmail.value}",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = ZenithTextMain
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Alle Health Connect gegevens worden automatisch toegewezen aan jouw Zenith atletenprofiel.",
                            fontSize = 12.sp,
                            color = ZenithTextMuted
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedButton(
                            onClick = {
                                com.zenith.pulse.auth.UserAuthManager.logout(context)
                                isLoggedIn.value = false
                                userEmail.value = ""
                                Toast.makeText(context, "Account uitgelogd", Toast.LENGTH_SHORT).show()
                            },
                            shape = RoundedCornerShape(10.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, ZenithRed),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Account Ontkoppelen / Uitloggen", color = ZenithRed, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    } else {
                        Text(
                            text = "Meld je verplicht aan met je Zenith account (e-mailadres & wachtwoord) om je biometrische data te synchroniseren.",
                            fontSize = 12.sp,
                            color = ZenithTextMuted
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = emailInput.value,
                            onValueChange = { emailInput.value = it },
                            label = { Text("Zenith Emailadres") },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = ZenithSteelGrey,
                                unfocusedContainerColor = ZenithSteelGrey,
                                focusedBorderColor = ZenithCyan,
                                unfocusedBorderColor = ZenithSteelBorder,
                                focusedLabelColor = ZenithCyan,
                                unfocusedLabelColor = ZenithTextMuted,
                                focusedTextColor = ZenithTextMain,
                                unfocusedTextColor = ZenithTextMain
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        OutlinedTextField(
                            value = passwordInput.value,
                            onValueChange = { passwordInput.value = it },
                            label = { Text("Wachtwoord") },
                            singleLine = true,
                            visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = ZenithSteelGrey,
                                unfocusedContainerColor = ZenithSteelGrey,
                                focusedBorderColor = ZenithCyan,
                                unfocusedBorderColor = ZenithSteelBorder,
                                focusedLabelColor = ZenithCyan,
                                unfocusedLabelColor = ZenithTextMuted,
                                focusedTextColor = ZenithTextMain,
                                unfocusedTextColor = ZenithTextMain
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )

                        authMessage.value?.let { msg ->
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(text = msg, fontSize = 12.sp, color = ZenithRed)
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Button(
                            onClick = {
                                coroutineScope.launch {
                                    isLoggingIn.value = true
                                    authMessage.value = null
                                    val (success, msg) = com.zenith.pulse.auth.UserAuthManager.loginWithSupabase(
                                        context,
                                        emailInput.value,
                                        passwordInput.value
                                    )
                                    isLoggingIn.value = false
                                    if (success) {
                                        isLoggedIn.value = true
                                        userEmail.value = com.zenith.pulse.auth.UserAuthManager.getUserEmail(context) ?: emailInput.value
                                        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                                    } else {
                                        authMessage.value = msg
                                    }
                                }
                            },
                            enabled = !isLoggingIn.value,
                            colors = ButtonDefaults.buttonColors(containerColor = ZenithCyan),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = if (isLoggingIn.value) "Inloggen..." else "INLOGGEN OP ZENITH ACCOUNT",
                                color = Color(0xFF09090B),
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }

            // Health Connect Status Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = ZenithCardBg),
                border = androidx.compose.foundation.BorderStroke(1.dp, ZenithSteelBorder)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(if (hasPermissions) ZenithGreen else ZenithRed)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (hasPermissions) "Health Connect Actief" else "Permissies vereist",
                            fontWeight = FontWeight.Bold,
                            color = ZenithTextMain
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Status: $syncMessage",
                        fontSize = 13.sp,
                        color = ZenithTextMuted
                    )

                    if (!hasPermissions) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = {
                                permissionLauncher.launch(healthConnectManager.requiredPermissions)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = ZenithPurple),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Health Connect Permissies Verlenen", color = Color.White, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Live Metrics Grid (Steel Grey Cards)
            Text(
                text = "Live Healthstatistieken",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = ZenithTextMain,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
            )

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile(
                    title = "Stappen",
                    value = "${payload.stepsCount}",
                    unit = "stappen",
                    accentColor = ZenithCyan,
                    modifier = Modifier.weight(1f)
                )
                MetricTile(
                    title = "Heart Rate",
                    value = if (payload.latestHeartRate > 0) "${payload.latestHeartRate}" else "--",
                    unit = "BPM",
                    accentColor = ZenithRed,
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile(
                    title = "HRV",
                    value = if (payload.latestHrvRmssd > 0) "${payload.latestHrvRmssd.toInt()}" else "--",
                    unit = "ms RMSSD",
                    accentColor = ZenithPurple,
                    modifier = Modifier.weight(1f)
                )
                MetricTile(
                    title = "Slaapduur",
                    value = "${payload.sleepDurationMinutes / 60}u ${payload.sleepDurationMinutes % 60}m",
                    unit = "nacht",
                    accentColor = Color(0xFF6366F1),
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile(
                    title = "Calorieën",
                    value = "${payload.activeCaloriesBurned.toInt()}",
                    unit = "kcal actief",
                    accentColor = Color(0xFFF59E0B),
                    modifier = Modifier.weight(1f)
                )
                MetricTile(
                    title = "Weight",
                    value = if (payload.latestWeightKg > 0) "${payload.latestWeightKg} kg" else "--",
                    unit = "biometrisch",
                    accentColor = ZenithGreen,
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Local HTTP Bridge Server Info (Steel Grey Card)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = ZenithCardBg),
                border = androidx.compose.foundation.BorderStroke(1.dp, ZenithSteelBorder)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Lokale Wi-Fi HTTP Server (Zenith Hub Bridge)",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = ZenithCyan
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(ZenithSteelGrey, RoundedCornerShape(8.dp))
                            .border(1.dp, ZenithSteelBorder, RoundedCornerShape(8.dp))
                            .padding(8.dp)
                    ) {
                        Text(
                            text = "URL: http://$localIp:8787",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = ZenithTextMain
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Endpoints: /ping, /latest",
                        fontSize = 11.sp,
                        color = ZenithTextMuted
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Manual Sync Trigger Button (Zenith Cyan Accent)
            Button(
                onClick = {
                    coroutineScope.launch {
                        isSyncing = true
                        val success = ZenithSyncManager.performSync(context)
                        payload = healthConnectManager.fetchLatestHealthData()
                        syncMessage = ZenithSyncManager.lastSyncStatus
                        isSyncing = false
                    }
                },
                enabled = !isSyncing && hasPermissions && isLoggedIn.value,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isLoggedIn.value) ZenithCyan else ZenithSteelGrey,
                    disabledContainerColor = ZenithSteelGrey
                ),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                if (isSyncing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Color.Black,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = if (!isLoggedIn.value) "🔐 EERST INLOGGEN MET ZENITH ACCOUNT" else "Sync Now with Zenith",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = if (isLoggedIn.value) Color(0xFF09090B) else ZenithTextSub
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
fun MetricTile(
    title: String,
    value: String,
    unit: String,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = ZenithSteelGrey),
        border = androidx.compose.foundation.BorderStroke(1.dp, ZenithSteelBorder)
    ) {
        Column(
            modifier = Modifier
                .padding(12.dp)
                .fillMaxWidth()
        ) {
            Text(text = title, fontSize = 12.sp, color = ZenithTextMuted)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                color = accentColor
            )
            Text(text = unit, fontSize = 10.sp, color = ZenithTextSub)
        }
    }
}
