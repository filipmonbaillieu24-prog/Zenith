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

@Composable
fun ZenithPulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = Color(0xFF090D16),
            surface = Color(0xFF131C2E),
            primary = Color(0xFF38BDF8),
            secondary = Color(0xFFA855F7),
            onBackground = Color(0xFFF8FAFC),
            onSurface = Color(0xFFE2E8F0)
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
                    colors = listOf(Color(0xFF090D16), Color(0xFF0F172A))
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
            Spacer(modifier = Modifier.height(16.dp))

            // Update Available Card Banner
            updateInfo?.let { info ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1B4B))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFFA855F7))
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Nieuwe Zenith Pulse Update (v${info.versionName})",
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFFA855F7),
                                fontSize = 14.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "A new version of Zenith Pulse is available.",
                            fontSize = 12.sp,
                            color = Color(0xFFE2E8F0)
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        if (isDownloadingUpdate) {
                            LinearProgressIndicator(
                                progress = { downloadProgress },
                                modifier = Modifier.fillMaxWidth(),
                                color = Color(0xFF38BDF8),
                                trackColor = Color(0xFF334155)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Update downloaden ${(downloadProgress * 100).toInt()}%...",
                                fontSize = 11.sp,
                                color = Color(0xFF94A3B8)
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
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF38BDF8)),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = "UPDATE AUTOMATICALLY NOW",
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF090D16)
                                )
                            }
                        }
                    }
                }
            }

            // App Header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth()
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_zenith_pulse),
                    contentDescription = "Zenith Pulse Logo",
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .border(2.dp, Color(0xFF38BDF8), CircleShape)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = "ZENITH PULSE",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color(0xFF38BDF8),
                        letterSpacing = 2.sp
                    )
                    Text(
                        text = "Health Connect Ecosystem Sync",
                        fontSize = 13.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Zenith User Account & Coupling Card
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
                colors = CardDefaults.cardColors(containerColor = Color(0xFF131C2E)),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    if (isLoggedIn.value) Color(0xFF10B981) else Color(0xFFF59E0B)
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(if (isLoggedIn.value) Color(0xFF10B981) else Color(0xFFF59E0B))
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isLoggedIn.value) "Gekoppeld met Zenith Profiel" else "Zenith Account Koppelen",
                            fontWeight = FontWeight.Bold,
                            color = if (isLoggedIn.value) Color(0xFF10B981) else Color(0xFFF59E0B),
                            fontSize = 14.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    if (isLoggedIn.value) {
                        Text(
                            text = "Ingelogd als: ${userEmail.value}",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Alle Health Connect gegevens (stappen, HR, HRV, slaap, gewicht) worden automatisch gekoppeld aan dit profiel.",
                            fontSize = 12.sp,
                            color = Color(0xFFCBD5E1)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedButton(
                            onClick = {
                                com.zenith.pulse.auth.UserAuthManager.logout(context)
                                isLoggedIn.value = false
                                userEmail.value = ""
                                Toast.makeText(context, "Account ontkoppeld", Toast.LENGTH_SHORT).show()
                            },
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Account Ontkoppelen / Uitloggen", color = Color(0xFFEF4444), fontSize = 12.sp)
                        }
                    } else {
                        Text(
                            text = "Meld je aan met je Zenith account om biometrische data direct aan jouw profiel te koppelen.",
                            fontSize = 12.sp,
                            color = Color(0xFFCBD5E1)
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = emailInput.value,
                            onValueChange = { emailInput.value = it },
                            label = { Text("Zenith Emailadres") },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFF38BDF8),
                                unfocusedBorderColor = Color(0xFF334155),
                                focusedLabelColor = Color(0xFF38BDF8),
                                unfocusedLabelColor = Color(0xFF94A3B8)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        OutlinedTextField(
                            value = passwordInput.value,
                            onValueChange = { passwordInput.value = it },
                            label = { Text("Wachtwoord (Optioneel for Supabase Auth)") },
                            singleLine = true,
                            visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFF38BDF8),
                                unfocusedBorderColor = Color(0xFF334155),
                                focusedLabelColor = Color(0xFF38BDF8),
                                unfocusedLabelColor = Color(0xFF94A3B8)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )

                        authMessage.value?.let { msg ->
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(text = msg, fontSize = 12.sp, color = Color(0xFFF87171))
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF38BDF8)),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = if (isLoggingIn.value) "Inloggen..." else "Inloggen op Zenith",
                                    color = Color(0xFF090D16),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                            }

                            Button(
                                onClick = {
                                    if (emailInput.value.isNotBlank()) {
                                        com.zenith.pulse.auth.UserAuthManager.saveUserAccount(context, emailInput.value)
                                        isLoggedIn.value = true
                                        userEmail.value = emailInput.value.trim().lowercase()
                                        Toast.makeText(context, "Gekoppeld aan ${emailInput.value}", Toast.LENGTH_SHORT).show()
                                    } else {
                                        authMessage.value = "Voer een geldig emailadres in."
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = "Direct Koppelen",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }
            }

            // Status Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF131C2E))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(if (hasPermissions) Color(0xFF22C55E) else Color(0xFFEF4444))
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (hasPermissions) "Health Connect Actief" else "Permissies vereist",
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Status: $syncMessage",
                        fontSize = 13.sp,
                        color = Color(0xFFCBD5E1)
                    )

                    if (!hasPermissions) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = {
                                permissionLauncher.launch(healthConnectManager.requiredPermissions)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFA855F7)),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Health Connect Permissies Verlenen", color = Color.White)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Live Metrics Grid
            Text(
                text = "Live Healthsstatistieken",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
            )

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile(
                    title = "Stappen",
                    value = "${payload.stepsCount}",
                    unit = "stappen",
                    accentColor = Color(0xFF38BDF8),
                    modifier = Modifier.weight(1f)
                )
                MetricTile(
                    title = "Heart Rate",
                    value = if (payload.latestHeartRate > 0) "${payload.latestHeartRate}" else "--",
                    unit = "BPM",
                    accentColor = Color(0xFFEF4444),
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile(
                    title = "HRV",
                    value = if (payload.latestHrvRmssd > 0) "${payload.latestHrvRmssd.toInt()}" else "--",
                    unit = "ms RMSSD",
                    accentColor = Color(0xFFA855F7),
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
                    accentColor = Color(0xFF10B981),
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Local HTTP Bridge Server Info
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF131C2E))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Lokale Wi-Fi HTTP Server (Zenith Hub Bridge)",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = Color(0xFF38BDF8)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "URL: http://$localIp:8787",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color.White
                    )
                    Text(
                        text = "Endpoints: /ping, /latest",
                        fontSize = 11.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Manual Sync Trigger Button
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
                enabled = !isSyncing && hasPermissions,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF38BDF8)),
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
                        text = "Sync Now with Zenith",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF090D16)
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
        colors = CardDefaults.cardColors(containerColor = Color(0xFF131C2E))
    ) {
        Column(
            modifier = Modifier
                .padding(12.dp)
                .fillMaxWidth()
        ) {
            Text(text = title, fontSize = 12.sp, color = Color(0xFF94A3B8))
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                color = accentColor
            )
            Text(text = unit, fontSize = 10.sp, color = Color(0xFF64748B))
        }
    }
}
