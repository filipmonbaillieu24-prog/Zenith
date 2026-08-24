package com.zenith.kratos

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.zenith.kratos.data.*
import com.zenith.kratos.ui.screens.LoginScreen
import com.zenith.kratos.ui.screens.TodayScreen
import com.zenith.kratos.ui.screens.TrackerScreen
import com.zenith.kratos.ui.screens.CompletionScreen
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.*
import com.zenith.kratos.ui.theme.*

enum class KratosScreen {
    LOADING,
    LOGIN,
    TODAY,
    TRACKER,
    COMPLETION
}

@Composable
fun MainNavigation() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // 1. Initialize Room & Repo (with self-healing fallback)
    var databaseInitializationError by remember { mutableStateOf<String?>(null) }
    val database = remember {
        try {
            AppDatabase.getDatabase(context)
        } catch (e: Exception) {
            try {
                context.deleteDatabase("kratos_database")
                AppDatabase.getDatabase(context)
            } catch (e2: Exception) {
                databaseInitializationError = "Database Error: ${e2.localizedMessage ?: "Could not load local file"}"
                null
            }
        }
    }
    val repository = remember(database) {
        if (database != null) {
            WorkoutRepository(
                database.exerciseDao(),
                database.templateDao(),
                database.workoutDao(),
                database.activeWorkoutDao()
            )
        } else null
    }

    // 2. Authentication status flow
    val auth = remember { SupabaseClient.client.auth }
    val sessionStatus by auth.sessionStatus.collectAsState()

    // 3. Screen Routing
    var currentScreen by remember { mutableStateOf(KratosScreen.LOADING) }

    // 4. Workout State variables
    var activeWorkoutName by remember { mutableStateOf("") }
    var activeTemplateId by remember { mutableStateOf<String?>(null) }
    var activeExercises by remember { mutableStateOf<List<ActiveExerciseState>>(emptyList()) }
    var activeStartTime by remember { mutableStateOf("") }
    var activeStartTimeMs by remember { mutableStateOf(0L) }
    var activeCompletedTime by remember { mutableStateOf("") }
    var activeVolume by remember { mutableStateOf(0.0) }
    var cardioStressFactor by remember { mutableStateOf(1.0) }
    var bodyWeight by remember { mutableStateOf(80.0) }

    // Update States
    var updateInfo by remember { mutableStateOf<com.zenith.kratos.update.UpdateInfo?>(null) }
    var downloadProgress by remember { mutableStateOf<Float?>(null) }
    var updateError by remember { mutableStateOf<String?>(null) }

    // Session loader
    LaunchedEffect(sessionStatus) {
        if (currentScreen == KratosScreen.LOADING) {
            delay(800) // loading window visual ease only on first cold start
        }
        when (sessionStatus) {
            is SessionStatus.Authenticated -> {
                scope.launch {
                    val w = repository?.getLatestBodyweight() ?: 80.0
                    bodyWeight = w

                    val persisted = repository?.getPersistedActiveWorkout()
                    if (persisted != null) {
                        activeTemplateId = persisted.templateId
                        activeWorkoutName = persisted.name
                        activeExercises = persisted.exercises
                        cardioStressFactor = persisted.cardioStressFactor
                        activeStartTimeMs = persisted.startedAtMs
                        activeStartTime = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.getDefault()).format(java.util.Date(persisted.startedAtMs))
                        currentScreen = KratosScreen.TRACKER
                    } else {
                        currentScreen = KratosScreen.TODAY
                    }

                    repository?.fetchAndCacheExercises()
                    repository?.fetchAndCacheTemplates()
                    try {
                        val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                        val currentVersionCode = if (android.os.Build.VERSION.SDK_INT >= 28) {
                            pInfo.longVersionCode.toInt()
                        } else {
                            @Suppress("DEPRECATION") pInfo.versionCode
                        }
                        val update = com.zenith.kratos.update.UpdateManager.checkForUpdates(currentVersionCode)
                        if (update != null) {
                            updateInfo = update
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }
            is SessionStatus.NotAuthenticated -> {
                currentScreen = KratosScreen.LOGIN
            }
            else -> {
                // Loading/Refreshing: keep the current active screen
            }
        }
    }

    if (databaseInitializationError != null || repository == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF09090B))
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                androidx.compose.material3.Text("Oops! Kratos could not start.", color = Color.White, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, fontSize = 18.sp)
                Spacer(modifier = Modifier.height(8.dp))
                androidx.compose.material3.Text(databaseInitializationError ?: "Unknown database error", color = Color(0xFFEF4444), fontSize = 13.sp)
                Spacer(modifier = Modifier.height(24.dp))
                androidx.compose.material3.Button(
                    onClick = {
                        try {
                            context.deleteDatabase("kratos_database")
                            databaseInitializationError = "Database reset. Restart the app to continue."
                        } catch (e: Exception) {
                            databaseInitializationError = "Reset failed: ${e.message}"
                        }
                    },
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                ) {
                    androidx.compose.material3.Text("Wissen & Reset Database", color = Color.White)
                }
            }
        }
        return
    }

    when (currentScreen) {
        KratosScreen.LOADING -> {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF09090B)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = ZenithAccentNeon)
            }
        }
        KratosScreen.LOGIN -> {
            LoginScreen(
                onLoginSuccess = {
                    currentScreen = KratosScreen.LOADING
                }
            )
        }
        KratosScreen.TODAY -> {
            TodayScreen(
                repository = repository,
                onLogout = {
                    scope.launch {
                        repository?.deleteActiveWorkoutState()
                        auth.signOut()
                    }
                },
                onStartWorkout = { templateId, name, exercises, factor ->
                    activeTemplateId = templateId
                    activeWorkoutName = name
                    activeExercises = exercises
                    cardioStressFactor = factor
                    val startTimeMs = System.currentTimeMillis()
                    activeStartTimeMs = startTimeMs
                    activeStartTime = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.getDefault()).format(java.util.Date(startTimeMs))
                    scope.launch {
                        repository?.saveActiveWorkoutState(
                            templateId = templateId,
                            name = name,
                            startedAtMs = startTimeMs,
                            cardioStressFactor = factor,
                            exercises = exercises
                        )
                    }
                    currentScreen = KratosScreen.TRACKER
                }
            )
        }
        KratosScreen.TRACKER -> {
            TrackerScreen(
                workoutName = activeWorkoutName,
                exercises = activeExercises,
                cardioStressFactor = cardioStressFactor,
                startTimeMs = activeStartTimeMs,
                templateId = activeTemplateId,
                bodyWeight = bodyWeight,
                repository = repository,
                onCancel = {
                    scope.launch {
                        repository?.deleteActiveWorkoutState()
                    }
                    currentScreen = KratosScreen.TODAY
                },
                onComplete = { loggedExercises, totalVolume ->
                    activeCompletedTime = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.getDefault()).format(java.util.Date())
                    activeExercises = loggedExercises
                    activeVolume = totalVolume
                    scope.launch {
                        repository?.deleteActiveWorkoutState()
                    }
                    currentScreen = KratosScreen.COMPLETION
                }
            )
        }
        KratosScreen.COMPLETION -> {
            CompletionScreen(
                workoutName = activeWorkoutName,
                templateId = activeTemplateId,
                startTime = activeStartTime,
                completedTime = activeCompletedTime,
                volume = activeVolume,
                cardioStressFactor = cardioStressFactor,
                exercises = activeExercises,
                repository = repository,
                onFinish = {
                    currentScreen = KratosScreen.TODAY
                }
            )
        }
    }

    // 5. Update Alert Dialog
    if (updateInfo != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { updateInfo = null },
            title = { androidx.compose.material3.Text("Update Beschikbaar", color = Color.White) },
            text = {
                Column {
                    androidx.compose.material3.Text(
                        "A new version of Kratos Pilot is available (v${updateInfo?.versionName}). Would you like to download and install now?",
                        color = Color.White
                    )
                    if (downloadProgress != null) {
                        Spacer(modifier = Modifier.height(16.dp))
                        androidx.compose.material3.LinearProgressIndicator(
                            progress = downloadProgress!!,
                            color = ZenithAccentNeon,
                            modifier = Modifier.fillMaxWidth()
                        )
                        androidx.compose.material3.Text(
                            "Downloaden: ${Math.round(downloadProgress!! * 100)}%",
                            color = ZenithAccentNeon,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                    if (updateError != null) {
                        androidx.compose.material3.Text(
                            updateError!!,
                            color = Color(0xFFEF4444),
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            },
            confirmButton = {
                androidx.compose.material3.Button(
                    onClick = {
                        scope.launch {
                            com.zenith.kratos.update.UpdateManager.downloadAndInstallApk(
                                context = context,
                                downloadUrl = updateInfo!!.downloadUrl,
                                onProgress = { progress ->
                                    downloadProgress = progress
                                },
                                onError = { err ->
                                    updateError = err
                                    downloadProgress = null
                                }
                            )
                        }
                    },
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = ZenithAccentNeon),
                    enabled = downloadProgress == null
                ) {
                    androidx.compose.material3.Text("Download", color = Color(0xFF09090B))
                }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(
                    onClick = { updateInfo = null },
                    enabled = downloadProgress == null
                ) {
                    androidx.compose.material3.Text("Later", color = Color.White)
                }
            },
            containerColor = Color(0xFF1C1C23)
        )
    }
}
