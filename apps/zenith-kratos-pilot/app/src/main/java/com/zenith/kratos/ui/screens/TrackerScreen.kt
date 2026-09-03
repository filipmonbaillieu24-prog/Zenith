package com.zenith.kratos.ui.screens

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.content.Intent
import com.zenith.kratos.RestTimerService
import com.zenith.kratos.data.*
import com.zenith.kratos.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import androidx.compose.ui.text.TextStyle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackerScreen(
    workoutName: String,
    exercises: List<ActiveExerciseState>,
    cardioStressFactor: Double,
    startTimeMs: Long,
    templateId: String?,
    bodyWeight: Double,
    repository: WorkoutRepository,
    onCancel: () -> Unit,
    onComplete: (loggedExercises: List<ActiveExerciseState>, totalVolume: Double) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // 1. Local copy of the exercises state
    val mutableExercises = remember { mutableStateListOf<ActiveExerciseState>().apply { addAll(exercises) } }

    // 2. Workout Timer state
    var elapsedSeconds by remember {
        val ms = System.currentTimeMillis() - startTimeMs
        mutableStateOf((ms / 1000).toInt().coerceAtLeast(0))
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            val ms = System.currentTimeMillis() - startTimeMs
            elapsedSeconds = (ms / 1000).toInt().coerceAtLeast(0)
        }
    }

    LaunchedEffect(Unit) {
        try {
            val weights = repository.getMLAutoregWeights()
            if (weights != null) {
                KratosAutoregModel.loadWeightsFromJson(weights)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun triggerSave() {
        scope.launch {
            repository.saveActiveWorkoutState(
                templateId = templateId,
                name = workoutName,
                startedAtMs = startTimeMs,
                cardioStressFactor = cardioStressFactor,
                exercises = mutableExercises
            )
        }
    }

    // 3. UI states for Exercise dropdown menu & description collapse
    val exerciseDropdownExpanded = remember { mutableStateMapOf<Int, Boolean>() }
    val exerciseNotesExpanded = remember { mutableStateMapOf<Int, Boolean>() }

    // 4. Custom Keyboard focus states
    var activeFocusExercise by remember { mutableStateOf<Int?>(null) }
    var activeFocusSet by remember { mutableStateOf<Int?>(null) }
    var activeFocusField by remember { mutableStateOf<String?>(null) } // "weight", "reps"

    // 5. Rest Timer state
    var isTimerActive by remember { mutableStateOf(false) }
    var timerDurationSeconds by remember { mutableStateOf(0) }
    var timerRemainingSeconds by remember { mutableStateOf(0) }
    var isTimerMuted by remember { mutableStateOf(false) }

    // 6. PR celebration states
    var showPRToast by remember { mutableStateOf(false) }
    var prExerciseName by remember { mutableStateOf("") }
    var prValue by remember { mutableStateOf(0.0) }
    var prUnit by remember { mutableStateOf("kg") }

    // 7. Inline PR Tracker flags (to show small "PR" tags next to specific sets)
    val setPrFlags = remember { mutableStateMapOf<String, Boolean>() } // Key: "exerciseId_setIndex"

    // 8. Exercise note editing state
    var editingNoteExerciseIndex by remember { mutableStateOf<Int?>(null) }
    var editingNoteText by remember { mutableStateOf("") }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted -> }
    
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                permissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    DisposableEffect(context) {
        val receiver = object : android.content.BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                when (intent?.action) {
                    "com.zenith.kratos.TIMER_UPDATE" -> {
                        timerRemainingSeconds = intent.getIntExtra("remaining", 0)
                        isTimerActive = true
                    }
                    "com.zenith.kratos.TIMER_FINISHED" -> {
                        timerRemainingSeconds = 0
                        isTimerActive = false
                    }
                    "com.zenith.kratos.TIMER_STOPPED" -> {
                        timerRemainingSeconds = 0
                        isTimerActive = false
                    }
                }
            }
        }
        val filter = android.content.IntentFilter().apply {
            addAction("com.zenith.kratos.TIMER_UPDATE")
            addAction("com.zenith.kratos.TIMER_FINISHED")
            addAction("com.zenith.kratos.TIMER_STOPPED")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
        
        if (RestTimerService.isRunning) {
            timerRemainingSeconds = RestTimerService.remainingSeconds
            isTimerActive = true
        }

        onDispose {
            try {
                context.unregisterReceiver(receiver)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // 8. Historical max 1RMs cache for PR checking
    val historical1RMs = remember { mutableStateMapOf<String, Double>() }
    // 9. Previous Workout completed sets
    val previousWorkoutSets = remember { mutableStateMapOf<String, List<WorkoutLoggedSet>>() }

    LaunchedEffect(Unit) {
        scope.launch {
            try {
                val db = AppDatabase.getDatabase(context)
                val allWorkouts = db.workoutDao().getAllWorkoutsFlow()
                allWorkouts.collect { list ->
                    val mapPR = mutableMapOf<String, Double>()
                    val mapPrev = mutableMapOf<String, List<WorkoutLoggedSet>>()

                    list.forEach { w ->
                        try {
                            val loggedList = kotlinx.serialization.json.Json.decodeFromString<List<WorkoutExerciseLog>>(w.setsJson)
                            loggedList.forEach { loggedEx ->
                                loggedEx.sets.forEach { set ->
                                    if (set.type == "working" && set.reps > 0) {
                                        val est1RM = set.weight * (1 + (set.reps + set.rir) / 30.0)
                                        val rounded = Math.round(est1RM * 2) / 2.0
                                        val currentMax = mapPR[loggedEx.exerciseId] ?: 0.0
                                        if (rounded > currentMax) {
                                            mapPR[loggedEx.exerciseId] = rounded
                                        }
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                    historical1RMs.clear()
                    historical1RMs.putAll(mapPR)

                    // Get previous set logs for each exercise
                    for (ex in exercises) {
                        val mostRecentWorkout = list.firstOrNull { w ->
                            w.setsJson.contains(ex.exerciseId)
                        }
                        if (mostRecentWorkout != null) {
                            try {
                                val loggedList = kotlinx.serialization.json.Json.decodeFromString<List<WorkoutExerciseLog>>(mostRecentWorkout.setsJson)
                                val match = loggedList.find { it.exerciseId == ex.exerciseId }
                                if (match != null) {
                                    mapPrev[ex.exerciseId] = match.sets
                                }
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                    }
                    previousWorkoutSets.clear()
                    previousWorkoutSets.putAll(mapPrev)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // Cancel warning dialog state
    var showCancelDialog by remember { mutableStateOf(false) }

    fun formatDuration(seconds: Int): String {
        val m = seconds / 60
        val s = seconds % 60
        return String.format("%02d:%02d", m, s)
    }

    // Auto-dismiss PR Celebration Toast after 4 seconds
    LaunchedEffect(showPRToast) {
        if (showPRToast) {
            delay(4000)
            showPRToast = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ZenithScreenBrush)
            .then(safeDrawingPadding())
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = if (activeFocusExercise != null) 290.dp else 16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = workoutName.uppercase(),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White
                    )
                    Text(
                        text = "Duration: ${formatDuration(elapsedSeconds)}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZenithSecondary
                    )
                }

                Button(
                    onClick = { showCancelDialog = true },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0x1AFF7675)),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(text = "ANNULEER", color = ZenithError, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }

            /*
             * The rest timer sits under the header rather than over the bottom of the
             * screen. As a drawer it covered the set you were about to log - exactly
             * the row you want to read while the clock runs - and the list had to
             * reserve 90dp of dead space to compensate.
             */
            AnimatedVisibility(visible = isTimerActive, enter = fadeIn(), exit = fadeOut()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 12.dp, end = 12.dp, bottom = 14.dp)
                        .background(ZenithAccentTint, RoundedCornerShape(12.dp))
                        .border(1.dp, ZenithAccentBorder, RoundedCornerShape(12.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // The ring is only drawn when the full duration is known. After
                        // the app is killed and reopened mid-rest the service still
                        // reports the seconds left but not what it counted down from,
                        // and a ring drawn against a guessed total would be a lie about
                        // how much rest is left.
                        val ringProgress = if (timerDurationSeconds > 0) {
                            (timerRemainingSeconds.toFloat() / timerDurationSeconds).coerceIn(0f, 1f)
                        } else null

                        Box(
                            modifier = Modifier.size(38.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            if (ringProgress != null) {
                                Canvas(modifier = Modifier.fillMaxSize()) {
                                    val stroke = 2.dp.toPx()
                                    val inset = Offset(stroke / 2f, stroke / 2f)
                                    val arcSize = Size(size.width - stroke, size.height - stroke)
                                    drawArc(
                                        color = ZenithAccentTintStrong,
                                        startAngle = -90f,
                                        sweepAngle = 360f,
                                        useCenter = false,
                                        topLeft = inset,
                                        size = arcSize,
                                        style = Stroke(width = stroke)
                                    )
                                    drawArc(
                                        color = ZenithAccent,
                                        startAngle = -90f,
                                        sweepAngle = 360f * ringProgress,
                                        useCenter = false,
                                        topLeft = inset,
                                        size = arcSize,
                                        style = Stroke(width = stroke, cap = StrokeCap.Round)
                                    )
                                }
                            } else {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(ZenithAccentTintStrong, CircleShape)
                                        .border(2.dp, ZenithAccent, CircleShape)
                                )
                            }
                            Text(
                                text = "${timerRemainingSeconds}s",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = ZenithAccentSoft
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(text = "REST TIMER", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            if (cardioStressFactor > 1.0) {
                                Text(
                                    text = "▶ +${Math.round((cardioStressFactor - 1) * 100)}% rest (cardio stress)",
                                    fontSize = 9.sp,
                                    color = ZenithSecondary,
                                    modifier = Modifier.padding(top = 1.dp)
                                )
                            }
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = if (isTimerMuted) "🔇" else "🔊",
                            fontSize = 14.sp,
                            modifier = Modifier
                                .clickable { isTimerMuted = !isTimerMuted }
                                .padding(4.dp)
                        )
                        Box(
                            modifier = Modifier
                                .background(Color(0x1AFFFFFF), RoundedCornerShape(6.dp))
                                .clickable {
                                    val intent = Intent(context, RestTimerService::class.java).apply {
                                        action = RestTimerService.ACTION_STOP
                                    }
                                    context.startService(intent)
                                }
                                .padding(horizontal = 10.dp, vertical = 5.dp)
                        ) {
                            Text(text = "SKIP", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // Exercise List
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                itemsIndexed(mutableExercises) { exIndex, exState ->
                    // Find first active (uncompleted) set to highlight
                    val firstUncompletedIndex = exState.sets.indexOfFirst { !it.isCompleted }

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(ZenithGlass, RoundedCornerShape(12.dp))
                            .border(1.dp, ZenithGlassBorder, RoundedCornerShape(12.dp))
                            .padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 8.dp)
                    ) {
                            // Title row with info button & delete menu dropdown
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = exState.name,
                                            color = Color.White,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                        val weightLabel = if (exState.incrementPerSide) "per side" else "total weight"
                                        Text(
                                            text = "${exState.category} • ${exState.weightUnit.uppercase()} ($weightLabel)",
                                            color = ZenithSecondary,
                                            fontSize = 10.sp
                                        )
                                    }

                                    if (!exState.notes.isNullOrBlank()) {
                                        IconButton(
                                            onClick = {
                                                val currentlyExpanded = exerciseNotesExpanded[exIndex] ?: false
                                                exerciseNotesExpanded[exIndex] = !currentlyExpanded
                                            },
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Text(
                                                text = "ⓘ",
                                                color = if (exerciseNotesExpanded[exIndex] == true) ZenithPrimary else ZenithSecondary,
                                                fontSize = 16.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                }

                                // What this exercise has actually produced so far, from
                                // the sets already ticked off. Absent until there is one -
                                // an average of nothing is not zero.
                                val doneWorking = exState.sets.filter { it.isCompleted && it.type == "working" }
                                val loggedRirs = doneWorking.mapNotNull { it.rirInput.toIntOrNull() }
                                if (doneWorking.isNotEmpty()) {
                                    val volumeSoFar = doneWorking.sumOf { s ->
                                        (s.weightInput.toDoubleOrNull() ?: 0.0) * (s.repsInput.toIntOrNull() ?: 0)
                                    }
                                    Box(
                                        modifier = Modifier
                                            .background(Color(0x0FFFFFFF), RoundedCornerShape(20.dp))
                                            .padding(horizontal = 7.dp, vertical = 3.dp)
                                    ) {
                                        Text(
                                            text = buildString {
                                                if (loggedRirs.isNotEmpty()) {
                                                    append("avg RIR ")
                                                    append(String.format(java.util.Locale.US, "%.1f", loggedRirs.sum().toDouble() / loggedRirs.size))
                                                    append(" · ")
                                                }
                                                append(String.format(java.util.Locale.US, "%,.0f %s", volumeSoFar, exState.weightUnit))
                                            },
                                            color = ZenithSecondary,
                                            fontSize = 8.sp,
                                            maxLines = 1
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(4.dp))
                                }

                                // Exercise dropdown actions
                                Box {
                                    IconButton(
                                        onClick = { exerciseDropdownExpanded[exIndex] = true },
                                        modifier = Modifier.size(24.dp)
                                    ) {
                                        Text(
                                            text = "⋮",
                                            color = ZenithSecondary,
                                            fontSize = 18.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                    DropdownMenu(
                                        expanded = exerciseDropdownExpanded[exIndex] ?: false,
                                        onDismissRequest = { exerciseDropdownExpanded[exIndex] = false },
                                        modifier = Modifier.background(ZenithSurface)
                                    ) {
                                        DropdownMenuItem(
                                            text = { Text("Edit Note", color = Color.White, fontSize = 12.sp) },
                                            onClick = {
                                                exerciseDropdownExpanded[exIndex] = false
                                                editingNoteExerciseIndex = exIndex
                                                editingNoteText = exState.notes ?: ""
                                            }
                                        )
                                        DropdownMenuItem(
                                            text = { Text("Delete exercise", color = ZenithError, fontSize = 12.sp) },
                                            onClick = {
                                                exerciseDropdownExpanded[exIndex] = false
                                                mutableExercises.removeAt(exIndex)
                                                triggerSave()
                                            }
                                        )
                                    }
                                }
                            }

                            // Expandable Notes inline description
                            if (exerciseNotesExpanded[exIndex] == true && !exState.notes.isNullOrBlank()) {
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Color(0x0DFFFFFF)),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 8.dp)
                                ) {
                                    Text(
                                        text = exState.notes!!,
                                        color = Color(0xFFE2E8F0),
                                        fontSize = 11.sp,
                                        lineHeight = 14.sp,
                                        modifier = Modifier.padding(10.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                             // Hevy/Strong Column Headers Row
                             Row(
                                 modifier = Modifier
                                     .fillMaxWidth()
                                     .padding(horizontal = 8.dp, vertical = 4.dp),
                                 verticalAlignment = Alignment.CenterVertically
                             ) {
                                 Text("SET", fontSize = 8.sp, fontWeight = FontWeight.Black, color = ZenithMuted, letterSpacing = 0.3.sp, modifier = Modifier.width(40.dp))
                                 Spacer(modifier = Modifier.width(6.dp))
                                 Text("PREVIOUS", fontSize = 8.sp, fontWeight = FontWeight.Black, color = ZenithMuted, letterSpacing = 0.3.sp, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                                 Spacer(modifier = Modifier.width(6.dp))
                                 Text(exState.weightUnit.uppercase(), fontSize = 8.sp, fontWeight = FontWeight.Black, color = ZenithMuted, letterSpacing = 0.3.sp, modifier = Modifier.width(56.dp), textAlign = TextAlign.Center)
                                 Spacer(modifier = Modifier.width(6.dp))
                                 Text("REPS", fontSize = 8.sp, fontWeight = FontWeight.Black, color = ZenithMuted, letterSpacing = 0.3.sp, modifier = Modifier.width(46.dp), textAlign = TextAlign.Center)
                                 Spacer(modifier = Modifier.width(6.dp))
                                 Text("RIR", fontSize = 8.sp, fontWeight = FontWeight.Black, color = ZenithMuted, letterSpacing = 0.3.sp, modifier = Modifier.width(42.dp), textAlign = TextAlign.Center)
                                 Spacer(modifier = Modifier.width(6.dp))
                                 Text("DONE", fontSize = 8.sp, fontWeight = FontWeight.Black, color = ZenithMuted, letterSpacing = 0.3.sp, modifier = Modifier.width(38.dp), textAlign = TextAlign.Center)
                             }

                            // Sets input list
                            exState.sets.forEachIndexed { setIndex, setVal ->
                                val isActive = setIndex == firstUncompletedIndex
                                val isCompleted = setVal.isCompleted
                                val rowKey = "${exState.exerciseId}_${setIndex}"
                                val prevSet = previousWorkoutSets[exState.exerciseId]?.getOrNull(setIndex)

                                // Dynamic warmup naming count
                                val setLabel = if (setVal.type == "warmup") {
                                    val warmupPreceding = exState.sets.take(setIndex).count { it.type == "warmup" }
                                    "W${warmupPreceding + 1}"
                                } else {
                                    val workPreceding = exState.sets.take(setIndex).count { it.type == "working" }
                                    "${workPreceding + 1}"
                                }

                                // Exactly one row is lit at a time: the set you are on.
                                // Everything above it is spent and everything below it
                                // has not happened yet, so neither competes for the eye.
                                val rowActive = isActive && !isCompleted
                                val fieldHeight = if (rowActive) 38.dp else 34.dp

                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = if (rowActive) 6.dp else 0.dp)
                                        .background(
                                            color = if (rowActive) ZenithAccentTint else Color.Transparent,
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        .border(
                                            width = if (rowActive) 1.dp else 0.dp,
                                            color = if (rowActive) ZenithAccent else Color.Transparent,
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        .drawBehind {
                                            if (!rowActive) {
                                                drawLine(
                                                    color = ZenithDivider,
                                                    start = Offset(0f, size.height),
                                                    end = Offset(size.width, size.height),
                                                    strokeWidth = 1f
                                                )
                                            }
                                        }
                                        .padding(horizontal = 8.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // 1. Column SET (Index & Toggle)
                                    Box(
                                        modifier = Modifier
                                            .width(40.dp)
                                            .clickable(enabled = !isCompleted) {
                                                val nextType = if (setVal.type == "warmup") "working" else "warmup"
                                                setVal.type = nextType
                                                val workWeight = exState.sets.firstOrNull { it.type == "working" }?.targetWeight ?: 20.0
                                                recalculateWarmupTargets(exState.sets, workWeight, exState.incrementWeight, exState.incrementPerSide, exState.minWeight, exState.maxWeight)
                                                triggerSave()
                                            },
                                        contentAlignment = Alignment.CenterStart
                                    ) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            val isWarmup = setVal.type == "warmup"
                                            val badgeFill = when {
                                                rowActive && !isWarmup -> ZenithAccent
                                                isCompleted && !isWarmup -> ZenithAccentTintStrong
                                                else -> Color(0x14FFFFFF)
                                            }
                                            val badgeText = when {
                                                rowActive && !isWarmup -> ZenithOnAccent
                                                isCompleted && !isWarmup -> ZenithAccentSoft
                                                isWarmup -> ZenithSecondary
                                                else -> Color(0x8CF8FAFC)
                                            }
                                            Box(
                                                modifier = Modifier.size(24.dp).background(badgeFill, CircleShape),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Text(
                                                    text = setLabel,
                                                    fontSize = if (isWarmup) 8.sp else 10.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = badgeText
                                                )
                                            }
                                            if (setPrFlags[rowKey] == true) {
                                                Box(
                                                    modifier = Modifier
                                                        .padding(top = 2.dp)
                                                        .background(ZenithWarning, RoundedCornerShape(4.dp))
                                                        .padding(horizontal = 3.dp, vertical = 1.dp)
                                                ) {
                                                    Text("PR", fontSize = 7.sp, fontWeight = FontWeight.Black, color = ZenithOnAccent)
                                                }
                                            }
                                        }
                                    }

                                    Spacer(modifier = Modifier.width(6.dp))

                                    // 2. Column PREVIOUS (Previous Workout)
                                    Box(
                                        modifier = Modifier.weight(1f),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = if (prevSet != null) "${trimDisplayWeight(prevSet.weight)} × ${prevSet.reps}" else "—",
                                            fontSize = 10.sp,
                                            color = if (rowActive) ZenithSecondary else ZenithMuted,
                                            maxLines = 1,
                                            overflow = TextOverflow.Clip,
                                            textAlign = TextAlign.Center
                                        )
                                    }

                                    Spacer(modifier = Modifier.width(6.dp))

                                    // 4. Column KG (Weight Box Field)
                                    val isWeightFocused = activeFocusExercise == exIndex && activeFocusSet == setIndex && activeFocusField == "weight"
                                    Box(
                                        modifier = Modifier
                                            .width(56.dp)
                                            .height(fieldHeight)
                                            .background(
                                                color = if (isCompleted) Color(0x0AFFFFFF) else ZenithField,
                                                shape = RoundedCornerShape(if (rowActive) 7.dp else 6.dp)
                                            )
                                            .border(
                                                width = if (isWeightFocused || rowActive) 1.5.dp else 0.dp,
                                                color = if (isWeightFocused || rowActive) ZenithAccent else Color.Transparent,
                                                shape = RoundedCornerShape(if (rowActive) 7.dp else 6.dp)
                                            )
                                            .clickable(enabled = !isCompleted) {
                                                activeFocusExercise = exIndex
                                                activeFocusSet = setIndex
                                                activeFocusField = "weight"
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        val displayVal = if (setVal.weightInput.isEmpty()) trimDisplayWeight(setVal.targetWeight) else setVal.weightInput
                                        Text(
                                            text = displayVal,
                                            color = when {
                                                isCompleted -> Color(0x8CF8FAFC)
                                                setVal.weightInput.isEmpty() -> Color(0x90F8FAFC)
                                                else -> Color.White
                                            },
                                            fontSize = if (rowActive) 14.sp else 12.sp,
                                            fontWeight = if (rowActive) FontWeight.Black else FontWeight.Bold,
                                            maxLines = 1
                                        )
                                    }

                                    Spacer(modifier = Modifier.width(6.dp))

                                    // 5. Column REPS (Reps Box Field)
                                    val isRepsFocused = activeFocusExercise == exIndex && activeFocusSet == setIndex && activeFocusField == "reps"
                                    Box(
                                        modifier = Modifier
                                            .width(46.dp)
                                            .height(fieldHeight)
                                            .background(
                                                color = if (isCompleted) Color(0x0AFFFFFF) else ZenithField,
                                                shape = RoundedCornerShape(if (rowActive) 7.dp else 6.dp)
                                            )
                                            .border(
                                                width = if (isRepsFocused || rowActive) 1.5.dp else 0.dp,
                                                color = if (isRepsFocused || rowActive) ZenithAccent else Color.Transparent,
                                                shape = RoundedCornerShape(if (rowActive) 7.dp else 6.dp)
                                            )
                                            .clickable(enabled = !isCompleted) {
                                                activeFocusExercise = exIndex
                                                activeFocusSet = setIndex
                                                activeFocusField = "reps"
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        val displayVal = if (setVal.repsInput.isEmpty()) "${setVal.targetReps}" else setVal.repsInput
                                        Text(
                                            text = displayVal,
                                            color = when {
                                                isCompleted -> Color(0x8CF8FAFC)
                                                setVal.repsInput.isEmpty() -> Color(0x90F8FAFC)
                                                else -> Color.White
                                            },
                                            fontSize = if (rowActive) 14.sp else 12.sp,
                                            fontWeight = if (rowActive) FontWeight.Black else FontWeight.Bold,
                                            maxLines = 1
                                        )
                                    }

                                    Spacer(modifier = Modifier.width(6.dp))

                                    // 6. Column RIR (RIR Dropdown Select field)
                                    Box(modifier = Modifier.width(42.dp)) {
                                        var rirMenuExpanded by remember { mutableStateOf(false) }
                                        val rirDisplay = if (setVal.type == "warmup") "—" else setVal.rirInput

                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(fieldHeight)
                                                .background(
                                                    if (isCompleted) Color(0x0AFFFFFF) else ZenithField,
                                                    RoundedCornerShape(if (rowActive) 7.dp else 6.dp)
                                                )
                                                .border(
                                                    width = if (rowActive && setVal.type == "working") 1.5.dp else 0.dp,
                                                    color = if (rowActive && setVal.type == "working") ZenithAccent else Color.Transparent,
                                                    shape = RoundedCornerShape(if (rowActive) 7.dp else 6.dp)
                                                )
                                                .clickable(enabled = !isCompleted && setVal.type == "working") {
                                                    rirMenuExpanded = true
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = if (rirDisplay.isEmpty()) "${setVal.targetRir}" else rirDisplay,
                                                color = when {
                                                    setVal.type == "warmup" -> ZenithMuted
                                                    isCompleted -> Color(0x8CF8FAFC)
                                                    rirDisplay.isEmpty() -> Color(0x90F8FAFC)
                                                    else -> Color.White
                                                },
                                                fontSize = if (rowActive) 14.sp else 12.sp,
                                                fontWeight = if (rowActive) FontWeight.Black else FontWeight.Bold
                                            )
                                        }

                                        DropdownMenu(
                                            expanded = rirMenuExpanded,
                                            onDismissRequest = { rirMenuExpanded = false },
                                            modifier = Modifier.background(ZenithSurface)
                                        ) {
                                            (0..4).forEach { rirVal ->
                                                DropdownMenuItem(
                                                    text = { Text("$rirVal", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold) },
                                                    onClick = {
                                                        setVal.rirInput = rirVal.toString()
                                                        rirMenuExpanded = false
                                                        triggerSave()
                                                    }
                                                )
                                            }
                                        }
                                    }

                                    Spacer(modifier = Modifier.width(6.dp))

                                    // 7. Column ✓ (Checkmark Completed Button)
                                    Box(
                                        modifier = Modifier
                                            .size(38.dp)
                                            .background(
                                                color = if (isCompleted) ZenithAccent else Color(0x0DFFFFFF),
                                                shape = RoundedCornerShape(9.dp)
                                            )
                                            .border(
                                                width = 1.dp,
                                                color = if (isCompleted) ZenithAccent else Color(0x33FFFFFF),
                                                shape = RoundedCornerShape(9.dp)
                                            )
                                            .clickable {
                                                if (isCompleted) {
                                                    setVal.isCompleted = false
                                                    val intent = Intent(context, RestTimerService::class.java).apply {
                                                        action = RestTimerService.ACTION_STOP
                                                    }
                                                    context.startService(intent)
                                                } else {
                                                    val w = setVal.weightInput.toDoubleOrNull() ?: setVal.targetWeight
                                                    val r = setVal.repsInput.toIntOrNull() ?: setVal.targetReps
                                                    val rir = if (setVal.type == "warmup") 4 else (setVal.rirInput.toIntOrNull() ?: setVal.targetRir)

                                                    setVal.weightInput = w.toString()
                                                    setVal.repsInput = r.toString()
                                                    setVal.rirInput = rir.toString()
                                                    setVal.isCompleted = true

                                                    // Stamp when this exercise was actually started, so the
                                                    // performed order can be recovered at the end. The logged
                                                    // array is built in template order, so without this a
                                                    // session done out of order - because a machine was taken -
                                                    // saves as byte-identical to one done in order, and a dip
                                                    // caused by working pre-fatigued muscles is indistinguishable
                                                    // from getting weaker.
                                                    if (exState.firstCompletedAtMs == null) {
                                                        exState.firstCompletedAtMs = System.currentTimeMillis()
                                                    }

                                                    // What this set was ASKED for, read before the
                                                    // lines below overwrite it with what was done.
                                                    //
                                                    // Those lines are why the next set could never tell
                                                    // a good set from a bad one: by the time the
                                                    // autoregulation below compared performance against
                                                    // target, the target had already been replaced by
                                                    // the performance, so they always matched and a set
                                                    // that fell apart looked like a set that went to
                                                    // plan. Same shape as the template ratchet, one
                                                    // layer in.
                                                    val askedReps = setVal.targetReps
                                                    val askedRir = setVal.targetRir

                                                    // Update target parawithers upon confirmation
                                                    setVal.targetWeight = w
                                                    setVal.targetReps = r
                                                    if (setVal.type != "warmup") {
                                                        setVal.targetRir = rir
                                                    }

                                                    // If this is the first working set, update warmup targets
                                                    if (setVal.type == "working" && exState.sets.firstOrNull { it.type == "working" } == setVal) {
                                                        recalculateWarmupTargets(exState.sets, w, exState.incrementWeight, exState.incrementPerSide, exState.minWeight, exState.maxWeight)
                                                    }

                                                    // Dismiss keyboard if open on this set
                                                    if (activeFocusSet == setIndex && activeFocusExercise == exIndex) {
                                                        activeFocusExercise = null
                                                        activeFocusSet = null
                                                        activeFocusField = null
                                                    }

                                                    // PR Celebration Logic (Trigger only if a prior PR exists)
                                                    if (setVal.type == "working" && r > 0) {
                                                        val est1RM = w * (1 + (r + rir) / 30.0)
                                                        val rounded1RM = Math.round(est1RM * 2) / 2.0
                                                        val prevPR = historical1RMs[exState.exerciseId] ?: 0.0

                                                        if (prevPR > 0.0 && rounded1RM > prevPR) {
                                                            historical1RMs[exState.exerciseId] = rounded1RM
                                                            setPrFlags[rowKey] = true // mark row inline
                                                            // Carried on the set itself, not only in this
                                                            // screen's map: the completion screen is handed
                                                            // the sets and nothing else, so a record marked
                                                            // only here vanished the moment the session ended.
                                                            setVal.isNewPR = true
                                                            prExerciseName = exState.name
                                                            prValue = rounded1RM
                                                            prUnit = exState.weightUnit
                                                            showPRToast = true

                                                            scope.launch {
                                                                    try {
                                                                        val toneGen = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
                                                                        toneGen.startTone(ToneGenerator.TONE_PROP_BEEP, 250)
                                                                        delay(300)
                                                                        toneGen.startTone(ToneGenerator.TONE_PROP_BEEP, 250)
                                                                    } catch (e: Exception) { e.printStackTrace() }
                                                                }
                                                        }
                                                    }

                                                    // Autoregulation calculation on NEXT set using scientific e1RM / ML Model
                                                    val nextSetIndex = setIndex + 1
                                                    val nextSet = exState.sets.getOrNull(nextSetIndex)
                                                    
                                                    val isCompound = listOf("Chest", "Lats", "Upper Back", "Quads", "Hamstrings").contains(exState.category)
                                                    val baseRest = if (setVal.type == "warmup") 60 else (if (isCompound) 120 else 90)
                                                    val totalRest = Math.round(baseRest * cardioStressFactor).toInt()

                                                    if (nextSet != null) {
                                                        if (setVal.type == "working" && nextSet.type == "working") {
                                                            val nextTargetRir = nextSet.targetRir
                                                            val nextTargetReps = nextSet.targetReps

                                                            // The arithmetic lives in Progression.kt now, where it can be
                                                            // run without a device and a finished set.
                                                            val auto = autoregulateNextSet(
                                                                prevWeight = w,
                                                                prevReps = r,
                                                                prevRir = rir,
                                                                nextTargetReps = nextTargetReps,
                                                                nextTargetRir = nextTargetRir,
                                                                incrementWeight = exState.incrementWeight,
                                                                incrementPerSide = exState.incrementPerSide,
                                                                minWeight = exState.minWeight,
                                                                maxWeight = exState.maxWeight,
                                                                mlPrediction = if (KratosAutoregModel.isLoaded()) {
                                                                    KratosAutoregModel.predictWeight(
                                                                        setIndex = setIndex,
                                                                        prevWeight = w,
                                                                        prevReps = r,
                                                                        prevRir = rir,
                                                                        restSeconds = totalRest,
                                                                        targetReps = nextTargetReps,
                                                                        targetRir = nextTargetRir
                                                                    )
                                                                } else null,
                                                                plannedNextWeight = nextSet.targetWeight,
                                                                prevTargetReps = askedReps,
                                                                prevTargetRir = askedRir,
                                                                nextMaxReps = nextSet.maxReps
                                                            )
                                                            nextSet.targetWeight = auto.weight
                                                            nextSet.targetReps = auto.reps
                                                        }

                                                        // Pre-fill fields silently
                                                        nextSet.weightInput = nextSet.targetWeight.toString()
                                                        nextSet.repsInput = nextSet.targetReps.toString()
                                                        nextSet.rirInput = if (nextSet.type == "warmup") "4" else nextSet.targetRir.toString()
                                                    }

                                                    // Start Rest Timer
                                                    val isLastExercise = exIndex == mutableExercises.size - 1
                                                    val isLastSet = setIndex == exState.sets.size - 1
                                                    if (!(isLastExercise && isLastSet)) {
                                                        timerDurationSeconds = totalRest
                                                        val intent = Intent(context, RestTimerService::class.java).apply {
                                                            action = RestTimerService.ACTION_START
                                                            putExtra(RestTimerService.EXTRA_DURATION, totalRest)
                                                            putExtra(RestTimerService.EXTRA_MUTED, isTimerMuted)
                                                        }
                                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                                            context.startForegroundService(intent)
                                                        } else {
                                                            context.startService(intent)
                                                        }
                                                    }
                                                    triggerSave()
                                                }
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = "✓",
                                            color = if (isCompleted) ZenithOnAccent else Color.White,
                                            fontSize = 15.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            // Dynamic add/delete set triggers
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "+ Add Set",
                                    color = ZenithPrimary,
                                    // unchanged behaviour; styling follows the mockup
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier
                                        .clickable {
                                            val workSets = exState.sets.filter { it.type == "working" }
                                            val lastWeight = workSets.lastOrNull()?.targetWeight ?: 20.0
                                            val lastReps = workSets.lastOrNull()?.targetReps ?: 8
                                            val lastRir = workSets.lastOrNull()?.targetRir ?: 2

                                            exState.sets.add(
                                                ActiveSetState(
                                                    type = "working",
                                                    targetWeight = lastWeight,
                                                    targetReps = lastReps,
                                                    targetRir = lastRir
                                                )
                                            )
                                            recalculateWarmupTargets(exState.sets, lastWeight, exState.incrementWeight, exState.incrementPerSide, exState.minWeight, exState.maxWeight)
                                            triggerSave()
                                        }
                                        .padding(vertical = 4.dp)
                                )

                                Text(
                                    text = "- Remove Set",
                                    color = ZenithError,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier
                                        .clickable {
                                            if (exState.sets.size > 1) {
                                                exState.sets.removeAt(exState.sets.size - 1)
                                                val workWeight = exState.sets.firstOrNull { it.type == "working" }?.targetWeight ?: 20.0
                                                recalculateWarmupTargets(exState.sets, workWeight, exState.incrementWeight, exState.incrementPerSide, exState.minWeight, exState.maxWeight)
                                                triggerSave()
                                            }
                                        }
                                        .padding(vertical = 4.dp)
                                )
                            }
                        }
                    }
                }

            Spacer(modifier = Modifier.height(16.dp))

            // Completion finish button
            Button(
                onClick = {
                    val hasCompletedSet = mutableExercises.any { ex -> ex.sets.any { s -> s.isCompleted } }
                    if (!hasCompletedSet) {
                        Toast.makeText(context, "Check off at least one set to finish.", Toast.LENGTH_SHORT).show()
                        return@Button
                    }

                    // Auto-delete / skip uncompleted sets prior to completion
                    for (ex in mutableExercises) {
                        ex.sets.removeAll { !it.isCompleted }
                    }

                    // Calculate total volume
                    var totalVolume = 0.0
                    for (ex in mutableExercises) {
                        for (s in ex.sets) {
                            if (s.isCompleted && s.type == "working") {
                                val w = s.weightInput.toDoubleOrNull() ?: s.targetWeight
                                val r = s.repsInput.toIntOrNull() ?: s.targetReps
                                // Volume is accumulated in KILOGRAMS, whatever unit the exercise is
                                // configured in. It used to add a 100 lb stack as 100, identical to
                                // 100 kg, which on a mixed metric/imperial gym floor inflated stored
                                // tonnage by 79-111% per session - and that number feeds the recovery
                                // model's gym input, the Kratos share of the PMC, and the weekly total.
                                //
                                // The old line also compared against "lb" while the database stores
                                // "lbs", so it never matched: rather than converting bodyweight into
                                // the exercise's unit it silently left everything as-is. Bodyweight is
                                // already kg, so it is now added AFTER the conversion instead.
                                val unit = ex.weightUnit.trim().lowercase()
                                val addedKg = if (unit == "lb" || unit == "lbs") w * 0.45359237 else w
                                val effectiveKg = if (ex.isBodyweight) (bodyWeight + addedKg) else addedKg
                                totalVolume += (effectiveKg * r)
                            }
                        }
                    }

                    onComplete(mutableExercises, totalVolume)
                },
                colors = ButtonDefaults.buttonColors(containerColor = ZenithAccent),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .height(48.dp)
            ) {
                Text(text = "TRAINING AFRONDEN", color = ZenithOnAccent, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }
        }

        // 10. Custom Numeric Pad with RIR Selection Overlay
        if (activeFocusExercise != null && activeFocusSet != null && activeFocusField != null) {
            val activeEx = mutableExercises.getOrNull(activeFocusExercise!!)
            val activeSet = activeEx?.sets?.getOrNull(activeFocusSet!!)

            if (activeEx != null && activeSet != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = ZenithSurface),
                    shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .border(1.dp, ZenithGlassBorder, RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Keyboard Header details
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            val activeValText = if (activeFocusField == "weight") activeSet.weightInput else activeSet.repsInput
                            val activePlaceholder = if (activeFocusField == "weight") activeSet.targetWeight.toString() else activeSet.targetReps.toString()
                            
                            Box(
                                modifier = Modifier
                                    .background(Color(0x0FFFFFFF), RoundedCornerShape(20.dp))
                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                            ) {
                                Text(
                                    text = "Set ${activeFocusSet!! + 1} · ${activeFocusField!!.uppercase()} · " +
                                        if (activeValText.isEmpty()) "target $activePlaceholder" else activeValText,
                                    color = ZenithSecondary,
                                    fontSize = 9.sp,
                                    maxLines = 1
                                )
                            }
                            Text(
                                text = "SLUITEN",
                                color = ZenithSecondary,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Black,
                                modifier = Modifier
                                    .clickable {
                                        activeFocusExercise = null
                                        activeFocusSet = null
                                        activeFocusField = null
                                    }
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }

                        // Row 1: RIR quick selection (only for working sets)
                        if (activeSet.type == "working") {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text("RIR:", color = ZenithSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                (0..4).forEach { rirVal ->
                                    val isSelected = activeSet.rirInput == rirVal.toString()
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .height(36.dp)
                                            .background(
                                                color = if (isSelected) ZenithAccent else ZenithField,
                                                shape = RoundedCornerShape(6.dp)
                                            )
                                            .clickable {
                                                activeSet.rirInput = rirVal.toString()
                                                triggerSave()
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = "$rirVal",
                                            color = if (isSelected) ZenithOnAccent else Color.White,
                                            fontSize = 13.sp,
                                            fontWeight = if (isSelected) FontWeight.Black else FontWeight.Bold
                                        )
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }

                        // Row 2: Grid of numeric pad keys (1-9, ., 0, backspace)
                        val keys = listOf(
                            listOf("1", "2", "3"),
                            listOf("4", "5", "6"),
                            listOf("7", "8", "9"),
                            listOf(".", "0", "⌫")
                        )

                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            keys.forEach { rowKeys ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    rowKeys.forEach { key ->
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(44.dp)
                                                .background(ZenithField, RoundedCornerShape(8.dp))
                                                .clickable {
                                                    val currentText = if (activeFocusField == "weight") {
                                                        activeSet.weightInput
                                                    } else {
                                                        activeSet.repsInput
                                                    }

                                                    val newText = when (key) {
                                                        "⌫" -> if (currentText.isNotEmpty()) currentText.dropLast(1) else ""
                                                        else -> {
                                                            if (key == "." && currentText.contains(".")) currentText
                                                            else currentText + key
                                                        }
                                                    }

                                                    if (activeFocusField == "weight") {
                                                        activeSet.weightInput = newText
                                                        val newW = newText.toDoubleOrNull()
                                                        if (newW != null && activeSet.type == "working" && activeEx.sets.firstOrNull { it.type == "working" } == activeSet) {
                                                            recalculateWarmupTargets(activeEx.sets, newW, activeEx.incrementWeight, activeEx.incrementPerSide, activeEx.minWeight, activeEx.maxWeight)
                                                        }
                                                    } else {
                                                        activeSet.repsInput = newText
                                                    }
                                                    triggerSave()
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = key,
                                                color = Color.White,
                                                fontSize = 16.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                }
                            }

                            // Navigation Next / Done action key row
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp)
                                        .background(ZenithAccentTint, RoundedCornerShape(8.dp))
                                        .border(1.dp, ZenithAccentBorder, RoundedCornerShape(8.dp))
                                        .clickable {
                                            activeFocusField = if (activeFocusField == "weight") "reps" else "weight"
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = if (activeFocusField == "weight") "☞ ENTER REPS" else "☞ WEIGHT INVOEREN",
                                        color = ZenithAccentSoft,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp)
                                        .background(ZenithAccent, RoundedCornerShape(8.dp))
                                        .clickable {
                                            if (activeFocusField == "weight") {
                                                activeFocusField = "reps"
                                            } else {
                                                // Complete typing, fill defaults if empty
                                                val w = activeSet.weightInput.toDoubleOrNull() ?: activeSet.targetWeight
                                                val r = activeSet.repsInput.toIntOrNull() ?: activeSet.targetReps
                                                val rir = if (activeSet.type == "warmup") 4 else (activeSet.rirInput.toIntOrNull() ?: activeSet.targetRir)

                                                activeSet.weightInput = w.toString()
                                                activeSet.repsInput = r.toString()
                                                activeSet.rirInput = rir.toString()

                                                // Save targetWeight and targetReps with confirmed inputs
                                                activeSet.targetWeight = w
                                                activeSet.targetReps = r
                                                if (activeSet.type != "warmup") {
                                                    activeSet.targetRir = rir
                                                }

                                                // Update warmup sets if first working set is edited
                                                if (activeSet.type == "working" && activeEx.sets.firstOrNull { it.type == "working" } == activeSet) {
                                                    recalculateWarmupTargets(activeEx.sets, w, activeEx.incrementWeight, activeEx.incrementPerSide, activeEx.minWeight, activeEx.maxWeight)
                                                }

                                                activeFocusField = null
                                                activeFocusExercise = null
                                                activeFocusSet = null
                                            }
                                            triggerSave()
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = if (activeFocusField == "weight") "NEXT" else "DONE",
                                        color = ZenithOnAccent,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Black
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }
            }
        }

        // Cancel dialog alert
        if (showCancelDialog) {
            AlertDialog(
                onDismissRequest = { showCancelDialog = false },
                title = { Text("Cancel Workout", color = Color.White) },
                text = { Text("Are you sure you want to cancel this workout? Unsaved sets will be lost.", color = Color.White) },
                confirmButton = {
                    Button(
                        onClick = {
                            showCancelDialog = false
                            onCancel()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ZenithError)
                    ) {
                        Text("Yes, Cancel", color = Color.White)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showCancelDialog = false }) {
                        Text("Nee, Doorgaan", color = Color.White)
                    }
                },
                containerColor = ZenithSurface
            )
        }

        // Exercise note editing dialog
        if (editingNoteExerciseIndex != null) {
            AlertDialog(
                onDismissRequest = { editingNoteExerciseIndex = null },
                title = { Text("Edit Note", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp) },
                text = {
                    OutlinedTextField(
                        value = editingNoteText,
                        onValueChange = { editingNoteText = it },
                        placeholder = { Text("Enter a note...", color = Color.Gray, fontSize = 12.sp) },
                        textStyle = TextStyle(color = Color.White, fontSize = 13.sp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ZenithAccent,
                            unfocusedBorderColor = Color.Gray,
                            focusedLabelColor = ZenithAccent,
                            cursorColor = ZenithAccent
                        ),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = false,
                        maxLines = 4
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            val idx = editingNoteExerciseIndex!!
                            val updatedEx = mutableExercises[idx].copy(notes = editingNoteText.ifBlank { null })
                            mutableExercises[idx] = updatedEx
                            exerciseNotesExpanded[idx] = !editingNoteText.isBlank()
                            editingNoteExerciseIndex = null
                            triggerSave()
                        }
                    ) {
                        Text("Save", color = ZenithAccent, fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { editingNoteExerciseIndex = null }) {
                        Text("Annuleer", color = Color.White)
                    }
                },
                containerColor = ZenithSurface
            )
        }

        // PR Celebration toast
        AnimatedVisibility(
            visible = showPRToast,
            modifier = Modifier.align(Alignment.TopCenter)
        ) {
            Card(
                colors = CardDefaults.cardColors(containerColor = ZenithSurface),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth()
                    .border(1.dp, ZenithWarning, RoundedCornerShape(10.dp))
                    .clickable { showPRToast = false }
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = "PR GEBROKEN! 🔥", color = ZenithWarning, fontSize = 11.sp, fontWeight = FontWeight.Black)
                        Text(text = "$prExerciseName geschat 1RM: $prValue $prUnit", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    IconButton(onClick = { showPRToast = false }) {
                        Text(
                            text = "✕",
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

/**
 * "70.0" reads better as "70" on a stack that only ever makes whole numbers, and the
 * PREVIOUS column is 66dp wide - two characters of ".0" is the difference between a
 * figure that fits and one that is clipped.
 */
fun trimDisplayWeight(value: Double): String =
    if (value == Math.floor(value) && !value.isInfinite()) value.toLong().toString()
    else value.toString().trimEnd('0').trimEnd('.')
