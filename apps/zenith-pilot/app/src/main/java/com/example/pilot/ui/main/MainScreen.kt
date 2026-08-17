package com.example.pilot.ui.main

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import com.example.pilot.ble.BleSensor
import com.example.pilot.ble.SensorType
import com.example.pilot.ble.ConnectionStatus
import com.example.pilot.service.WorkoutService
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MainScreenViewModel = androidx.lifecycle.viewmodel.compose.viewModel()
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()

    // Permissions Request Logic
    val permissionsToRequest = mutableListOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    ).apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            add(Manifest.permission.BLUETOOTH_SCAN)
            add(Manifest.permission.BLUETOOTH_CONNECT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions.entries.all { it.value }
        if (granted) {
            viewModel.startScanning()
        }
    }

    LaunchedEffect(Unit) {
        val allGranted = permissionsToRequest.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
        if (allGranted) {
            viewModel.startScanning()
        } else {
            launcher.launch(permissionsToRequest.toTypedArray())
        }
    }

    val workouts = uiState.todayWorkouts

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(
                        text = "ZENITH PILOT",
                        style = LocalTextStyle.current.copy(
                            fontFamily = FontFamily.SansSerif,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 2.sp,
                            fontSize = 18.sp,
                            color = Color(0xFFF8FAFC)
                        )
                    )
                },
                actions = {
                    TextButton(onClick = onLogout) {
                        Text(
                            text = "LOG OUT",
                            color = Color(0xFF94A3B8),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp
                        )
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = Color(0xFF09090B)
                )
            )
        },
        bottomBar = {
            if (workouts.isNotEmpty()) {
                val isWorkoutActive = uiState.isWorkoutActive
                val isPaused = uiState.isPaused

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF09090B))
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (!isWorkoutActive) {
                        Button(
                            onClick = { viewModel.startWorkout() },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFFCBD5E1),
                                contentColor = Color(0xFF09090B)
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                        ) {
                            Text(
                                text = "START COACHING",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 1.sp
                            )
                        }
                    } else {
                        Button(
                            onClick = { viewModel.togglePause() },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF475569),
                                contentColor = Color(0xFFCBD5E1)
                              ),
                            modifier = Modifier
                                .weight(1f)
                                .height(50.dp)
                        ) {
                            Text(
                                text = if (isPaused) "HERVATTEN" else "PAUZEREN",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 1.sp
                            )
                        }

                        Button(
                            onClick = { viewModel.stopWorkout() },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFFEF4444),
                                contentColor = Color(0xFFF8FAFC)
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(50.dp)
                        ) {
                            Text(
                                text = "STOPPEN",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 1.sp
                            )
                        }
                    }
                }
            }
        },
        containerColor = Color(0xFF09090B),
        modifier = modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 20.dp)
                .padding(bottom = 8.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Auto-update banner
            uiState.updateInfo?.let { updateInfo ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFCBD5E1).copy(alpha = 0.08f), RoundedCornerShape(16.dp))
                        .border(1.dp, Color(0xFFCBD5E1).copy(alpha = 0.15f), RoundedCornerShape(16.dp))
                        .padding(14.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = "Update beschikbaar! (v${updateInfo.versionName})",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF4ADE80)
                                )
                                Text(
                                    text = "Nieuwe functies en prestatieverbeteringen.",
                                    fontSize = 10.sp,
                                    color = Color(0xFF94A3B8)
                                )
                            }
                            if (uiState.updateProgress == null) {
                                Button(
                                    onClick = { viewModel.downloadAndInstallUpdate() },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4ADE80)),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                                    modifier = Modifier.height(30.dp)
                                ) {
                                    Text("UPDATEN", fontSize = 10.sp, color = Color(0xFF09090B), fontWeight = FontWeight.Bold)
                                }
                            }
                        }

                        uiState.updateProgress?.let { progress ->
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                LinearProgressIndicator(
                                    progress = progress,
                                    color = Color(0xFF4ADE80),
                                    trackColor = Color(0xFF27272A),
                                    modifier = Modifier.fillMaxWidth().height(6.dp)
                                )
                                Text(
                                    text = "Downloading: ${Math.round(progress * 100)}%",
                                    fontSize = 9.sp,
                                    color = Color(0xFF94A3B8)
                                )
                            }
                        }

                        uiState.updateError?.let { error ->
                            Text(
                                text = "Update error: $error",
                                fontSize = 10.sp,
                                color = Color(0xFFEF4444),
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // 1. Sync & Connection Status Panel
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1C1C23).copy(alpha = 0.65f), RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFCBD5E1).copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                    .padding(14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Zenith Cloud Sync",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFCBD5E1)
                        )
                        Text(
                            text = when (uiState.syncStatus) {
                                SyncStatus.Synced -> "Status: Connected"
                                SyncStatus.Checking -> "Status: Controleren..."
                                SyncStatus.Error -> "Status: Sync Error"
                            },
                            fontSize = 10.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                    Text(
                        text = when (uiState.syncStatus) {
                            SyncStatus.Synced -> "SYNCHROON"
                            SyncStatus.Checking -> "ZOEKEN..."
                            SyncStatus.Error -> "OFFLINE"
                        },
                        fontSize = 9.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = when (uiState.syncStatus) {
                            SyncStatus.Synced -> Color(0xFF4ADE80)
                            SyncStatus.Checking -> Color(0xFFFFB020)
                            SyncStatus.Error -> Color(0xFFEF4444)
                        },
                        modifier = Modifier
                            .background(
                                color = when (uiState.syncStatus) {
                                    SyncStatus.Synced -> Color(0xFF4ADE80).copy(alpha = 0.1f)
                                    SyncStatus.Checking -> Color(0xFFFFB020).copy(alpha = 0.1f)
                                    SyncStatus.Error -> Color(0xFFEF4444).copy(alpha = 0.1f)
                                },
                                shape = RoundedCornerShape(6.dp)
                            )
                            .border(
                                width = 1.dp,
                                color = when (uiState.syncStatus) {
                                    SyncStatus.Synced -> Color(0xFF4ADE80).copy(alpha = 0.2f)
                                    SyncStatus.Checking -> Color(0xFFFFB020).copy(alpha = 0.2f)
                                    SyncStatus.Error -> Color(0xFFEF4444).copy(alpha = 0.2f)
                                },
                                shape = RoundedCornerShape(6.dp)
                            )
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            // 2. Today's Workout Panel
            val workouts = uiState.todayWorkouts
            if (workouts.isEmpty()) {
                // Empty state
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF1C1C23).copy(alpha = 0.65f), RoundedCornerShape(16.dp))
                        .border(1.dp, Color(0xFFCBD5E1).copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "No workout planned for today",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFCBD5E1)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Schedule a route and workout in Aero to get started.",
                            fontSize = 11.sp,
                            color = Color(0xFF94A3B8),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            } else {
                val selectedWorkout = workouts.getOrNull(uiState.selectedWorkoutIndex)
                if (selectedWorkout != null) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF1C1C23).copy(alpha = 0.65f), RoundedCornerShape(16.dp))
                            .border(1.dp, Color(0xFFCBD5E1).copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Title block with optional picker
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = selectedWorkout.title,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFF8FAFC)
                                )
                                Text(
                                    text = "Duur: ${selectedWorkout.durationMinutes} min • TSS: ${selectedWorkout.plannedTSS}",
                                    fontSize = 11.sp,
                                    color = Color(0xFF94A3B8)
                                )
                            }
                            
                            // Multi workout picker trigger if needed
                            if (workouts.size > 1) {
                                Button(
                                    onClick = { 
                                        val nextIdx = (uiState.selectedWorkoutIndex + 1) % workouts.size
                                        viewModel.selectWorkout(nextIdx)
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF475569)),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                    modifier = Modifier.height(28.dp)
                                ) {
                                    Text("Next (${workouts.size})", fontSize = 10.sp, color = Color.White)
                                }
                            }
                        }

                        // Workout Visual Bar
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(12.dp)
                                .background(Color(0xFF09090B), RoundedCornerShape(6.dp))
                                .border(1.dp, Color(0xFFCBD5E1).copy(alpha = 0.05f), RoundedCornerShape(6.dp)),
                            horizontalArrangement = Arrangement.spacedBy(1.dp)
                        ) {
                            selectedWorkout.steps.forEach { step ->
                                val weight = step.duration.toFloat()
                                Box(
                                    modifier = Modifier
                                        .weight(weight)
                                        .fillMaxHeight()
                                        .background(Color(android.graphics.Color.parseColor(step.color)))
                                )
                            }
                        }

                        // Active workout execution details
                        if (uiState.isWorkoutActive) {
                            val currentStep = selectedWorkout.steps.getOrNull(uiState.currentBlockIndex)
                            if (currentStep != null) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(
                                            text = "Actief blok: ${currentStep.name}",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFFF8FAFC)
                                        )
                                        val watts = selectedWorkout.ftp?.let { ftp ->
                                            Math.round(currentStep.powerPct * ftp)
                                        }
                                        val targetStr = if (watts != null) "$watts W" else "Zone ${currentStep.zone}"
                                        Text(
                                            text = "Target: $targetStr",
                                            fontSize = 11.sp,
                                            color = Color(0xFF4ADE80)
                                        )
                                    }

                                    // Countdown timer for block
                                    val remaining = currentStep.duration - uiState.blockElapsedSeconds
                                    val min = remaining / 60
                                    val sec = remaining % 60
                                    Text(
                                        text = String.format(Locale.getDefault(), "%02d:%02d", min, sec),
                                        fontSize = 24.sp,
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFFF8FAFC)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 3. BLE Sensors Status Panel
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1C1C23).copy(alpha = 0.65f), RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFCBD5E1).copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Bluetooth BLE Sensoren",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFF8FAFC)
                    )
                    
                    val scanText = if (uiState.isScanning) "ZOEKEN..." else "ZOEKEN"
                    Text(
                        text = scanText,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF39FF14),
                        modifier = Modifier
                            .clickable(enabled = !uiState.isScanning) {
                                viewModel.startScanning()
                            }
                            .background(Color(0xFF39FF14).copy(alpha = 0.08f), RoundedCornerShape(4.dp))
                            .border(1.dp, Color(0xFF39FF14).copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }

                val hrSensors = uiState.sensors.filter { it.type == SensorType.HEART_RATE }
                val powerSensors = uiState.sensors.filter { it.type == SensorType.POWER }
                val cadenceSensors = uiState.sensors.filter { it.type == SensorType.CADENCE }
                val speedSensors = uiState.sensors.filter { it.type == SensorType.SPEED }

                if (uiState.sensors.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No Bluetooth sensors found. Tap SCAN to search.",
                            fontSize = 10.sp,
                            color = Color(0xFF94A3B8),
                            textAlign = TextAlign.Center
                        )
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (hrSensors.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = "HARTSLAGMETERS",
                                    fontSize = 8.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF94A3B8)
                                )
                                hrSensors.forEach { sensor ->
                                    SensorRow(sensor, viewModel)
                                }
                            }
                        }

                        if (powerSensors.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = "VERMOGENSMETERS",
                                    fontSize = 8.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF94A3B8)
                                )
                                powerSensors.forEach { sensor ->
                                    SensorRow(sensor, viewModel)
                                }
                            }
                        }

                        if (cadenceSensors.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = "CADANSSENSOREN",
                                    fontSize = 8.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF94A3B8)
                                )
                                cadenceSensors.forEach { sensor ->
                                    SensorRow(sensor, viewModel)
                                }
                            }
                        }

                        if (speedSensors.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = "SNELHEIDSSENSOREN",
                                    fontSize = 8.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF94A3B8)
                                )
                                speedSensors.forEach { sensor ->
                                    SensorRow(sensor, viewModel)
                                }
                            }
                        }
                    }
                }
            }            // 4. In-Ear Coaching Log
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1C1C23).copy(alpha = 0.65f), RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFCBD5E1).copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Live In-Ear Coaching Logs",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFF8FAFC)
                )

                val cues = WorkoutService.activeService?.coachingEngine?.cues?.collectAsState()?.value ?: emptyList<com.example.pilot.coaching.CoachingCue>()
                val displayedCues = cues.takeLast(5).reversed()

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (displayedCues.isEmpty()) {
                        Text(
                            text = "No logs yet. Start coaching to receive real-time audio guidance.",
                            fontSize = 10.sp,
                            color = Color(0xFF64748B),
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    } else {
                        displayedCues.forEach { cue ->
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0xFF09090B).copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                                    .border(1.dp, Color(0xFF27272A).copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                                    .padding(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = "[${cue.category.uppercase()}]",
                                        fontSize = 8.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color(0xFFCBD5E1)
                                    )
                                    Text(
                                        text = cue.timestamp,
                                        fontSize = 8.sp,
                                        color = Color(0xFF64748B)
                                    )
                                }
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = cue.message,
                                    fontSize = 10.sp,
                                    color = Color(0xFFCBD5E1),
                                    lineHeight = 13.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SensorRow(sensor: BleSensor, viewModel: MainScreenViewModel) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF09090B).copy(alpha = 0.4f), RoundedCornerShape(8.dp))
            .border(1.dp, Color(0xFF27272A).copy(alpha = 0.5f), RoundedCornerShape(8.dp))
            .padding(10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = sensor.name,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFF8FAFC)
            )
            val typeLabel = when (sensor.type) {
                SensorType.HEART_RATE -> "Heart Rate"
                SensorType.POWER -> "Power"
                SensorType.CADENCE -> "Cadans"
                SensorType.SPEED -> "Speed"
            }
            val valSuffix = when (sensor.type) {
                SensorType.HEART_RATE -> " bpm"
                SensorType.POWER -> " W"
                SensorType.CADENCE -> " rpm"
                SensorType.SPEED -> " km/u"
            }
            val liveValStr = sensor.lastValue?.let { " • $it$valSuffix" } ?: ""
            Text(
                text = "$typeLabel$liveValStr",
                fontSize = 9.sp,
                color = Color(0xFF94A3B8)
            )
        }

        val statusColor = when (sensor.status) {
            ConnectionStatus.CONNECTED -> Color(0xFF4ADE80)
            ConnectionStatus.CONNECTING -> Color(0xFFFFB020)
            else -> Color(0xFF94A3B8)
        }

        Text(
            text = when (sensor.status) {
                ConnectionStatus.CONNECTED -> "CONNECTED"
                ConnectionStatus.CONNECTING -> "VERBINDEN"
                ConnectionStatus.SCANNING -> "ZOEKEN"
                ConnectionStatus.FOUND -> "KOPPELEN"
                ConnectionStatus.DISCONNECTED -> "STANDBY"
            },
            fontSize = 8.sp,
            fontWeight = FontWeight.ExtraBold,
            color = statusColor,
            modifier = Modifier
                .clickable(enabled = sensor.status == ConnectionStatus.FOUND || sensor.status == ConnectionStatus.DISCONNECTED || sensor.status == ConnectionStatus.CONNECTED) {
                    if (sensor.status == ConnectionStatus.CONNECTED) {
                        viewModel.disconnectSensor(sensor.address)
                    } else {
                        viewModel.connectSensor(sensor.address)
                    }
                }
                .background(statusColor.copy(alpha = 0.08f), RoundedCornerShape(4.dp))
                .border(1.dp, statusColor.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                .padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}
