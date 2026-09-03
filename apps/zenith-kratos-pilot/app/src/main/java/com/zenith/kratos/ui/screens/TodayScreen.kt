package com.zenith.kratos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.zenith.kratos.data.*
import com.zenith.kratos.ui.theme.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(
    repository: WorkoutRepository,
    onLogout: () -> Unit,
    onStartWorkout: (templateId: String?, name: String, exercises: List<ActiveExerciseState>, factor: Double) -> Unit
) {
    val scope = rememberCoroutineScope()
    val json = remember { Json { ignoreUnknownKeys = true } }

    // 1. Observe local caches
    val context = LocalContext.current
    val db = remember { AppDatabase.getDatabase(context) }

    val templates by db.templateDao().getAllTemplatesFlow().collectAsState(initial = emptyList())
    val exercisesCache by db.exerciseDao().getAllExercisesFlow().collectAsState(initial = emptyList())
    val workoutHistory by db.workoutDao().getAllWorkoutsFlow().collectAsState(initial = emptyList())

    // 2. Fetch/Status state
    var isSyncing by remember { mutableStateOf(false) }
    var cardioFactor by remember { mutableStateOf(1.0) }
    var unsyncedCount by remember { mutableStateOf(0) }

    // Bottom Sheet Preview States
    var selectedTemplateForPreview by remember { mutableStateOf<LocalTemplate?>(null) }
    var showPreviewSheet by remember { mutableStateOf(false) }
    var previewExercises by remember { mutableStateOf<List<ActiveExerciseState>>(emptyList()) }

    // Update unsynced count
    LaunchedEffect(Unit) {
        repository.restoreWorkoutHistoryIfEmpty()
        val uns = db.workoutDao().getUnsyncedWorkouts()
        unsyncedCount = uns.size
        cardioFactor = repository.calculateCardioStressFactor()
    }

    /**
     * Pull routines down again whenever this screen comes back to the foreground.
     *
     * Templates were only fetched once, in Navigation's start-up effect, and the one
     * "Sync Now" button that pulls them lives inside the empty state - so an athlete who
     * already has routines had no way at all to get an edit made on the web, short of
     * killing the process. Returning from the background does not re-run a
     * LaunchedEffect, so backgrounding the app was not enough either.
     *
     * `templates` is a Room flow, so refreshing the cache updates the list on its own.
     */
    var lastPulledAtMs by remember { mutableStateOf(0L) }
    val refreshRoutines: (Boolean) -> Unit = { manual ->
        val now = System.currentTimeMillis()
        // Start-up already fetched; without this the first resume immediately refetches.
        if (manual || now - lastPulledAtMs > 10_000L) {
            lastPulledAtMs = now
            isSyncing = true
            scope.launch {
                repository.fetchAndCacheExercises()
                repository.fetchAndCacheTemplates()
                isSyncing = false
            }
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) refreshRoutines(false)
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    /**
     * How long ago each routine was last trained, in whole days.
     *
     * Read from the local cache rather than the network, so it is right offline and
     * costs nothing. Only the date part of the timestamp is parsed: workouts written by
     * this app and workouts pulled back down from Supabase carry different time-zone
     * suffixes, and "3d ago" needs the day, not the second.
     */
    val daysSinceByTemplate: Map<String, Int> = remember(workoutHistory) {
        // java.time would read better here, but this module is minSdk 24 without core
        // library desugaring, so LocalDate would throw on API 24-25 rather than compile
        // to something safe.
        val dayFormat = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
        val midnightToday = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 0)
            set(java.util.Calendar.MINUTE, 0)
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }.timeInMillis
        val dayMs = 86_400_000L

        workoutHistory
            .filter { it.templateId != null }
            .groupBy { it.templateId!! }
            .mapNotNull { (id, list) ->
                val newest = list
                    .mapNotNull { w -> runCatching { dayFormat.parse(w.completedAt.take(10))?.time }.getOrNull() }
                    .maxOrNull() ?: return@mapNotNull null
                // Half a day is added before dividing so the two clock changes a year
                // cannot round a 23- or 25-hour day into the wrong bucket.
                id to ((midnightToday - newest + dayMs / 2) / dayMs).toInt().coerceAtLeast(0)
            }
            .toMap()
    }

    /**
     * Routines ordered by how long they have gone untrained, longest first, so the one
     * at the top of the screen is the one that is due.
     *
     * A routine with no session behind it sorts first: never trained is longer ago than
     * any number of days. Templates are otherwise fetched in alphabetical order, which
     * says nothing about what to do today.
     */
    val orderedTemplates = remember(templates, daysSinceByTemplate) {
        templates.sortedWith(
            compareByDescending<LocalTemplate> { daysSinceByTemplate[it.id] ?: Int.MAX_VALUE }
                .thenBy { it.name }
        )
    }

    fun lastDoneLabel(templateId: String): String {
        val days = daysSinceByTemplate[templateId] ?: return "Never trained"
        return when {
            days == 0 -> "Last: today"
            days == 1 -> "Last: yesterday"
            days < 7 -> "Last: ${days}d ago"
            days < 14 -> "Last: 1w ago"
            else -> "Last: ${days / 7}w ago"
        }
    }

    /**
     * Build this routine's targets and open the preview.
     *
     * Shared by tapping a routine and by the START button on the card at the top - the
     * same decision either way, so the same code path.
     */
    val openPreview: (LocalTemplate, List<TemplateExercise>) -> Unit = { localTemp, tempExercises ->
        val active = tempExercises.mapNotNull { te ->
            val ex = exercisesCache.find { e -> e.id == te.exerciseId }
            if (ex != null) {
                ActiveExerciseState(
                    exerciseId = te.exerciseId,
                    name = ex.name,
                    category = ex.category,
                    weightUnit = ex.weightUnit,
                    incrementWeight = ex.incrementWeight,
                    incrementPerSide = ex.incrementPerSide,
                    minWeight = ex.minWeight,
                    maxWeight = ex.maxWeight,
                    notes = ex.notes,
                    isBodyweight = ex.isBodyweight,
                    sets = androidx.compose.runtime.mutableStateListOf<ActiveSetState>().apply {
                        addAll(
                            te.sets.map { ts ->
                                ActiveSetState(
                                    type = ts.type,
                                    targetWeight = 0.0,
                                    targetReps = ts.minReps,
                                    targetRir = ts.targetRir,
                                    maxReps = ts.maxReps
                                )
                            }
                        )
                    }
                )
            } else null
        }

        // Async load previous weights for double progression starting values
        scope.launch {
            // Per exercise, the best of the last few sessions rather than
            // whatever happened last time.
            //
            // Targets used to be built from the single most recent session,
            // so one bad day set the baseline and the athlete had to climb
            // back out of it. The cause is usually invisible in the data -
            // a machine was busy so the order changed and the chest was
            // pre-fatigued by the time the press came round, or they slept
            // badly, or they were short on time. All of it looks the same
            // from here: a set that fell short.
            //
            // Judged on best working-set e1RM, which is the same measure the
            // web logbook uses to decide whether a lift is progressing.
            val recentWorkouts = repository.getRecentWorkoutsForTemplate(localTemp.id, 3)
            if (recentWorkouts.isNotEmpty()) {
                for (ae in active) {
                    val tempEx = tempExercises.find { it.exerciseId == ae.exerciseId }
                    val workingTargets = tempEx?.sets?.filter { it.type == "working" } ?: emptyList()

                    // Newest session in which the prescribed work was actually done, rather
                    // than the heaviest of the last three. See Progression.kt: choosing by
                    // best e1RM let a single abandoned overreach set the target for weeks.
                    val log = chooseBaselineSession(
                        sessions = recentWorkouts.mapNotNull { w -> w.sets.find { it.exerciseId == ae.exerciseId } },
                        workingSetsOf = { exLog ->
                            exLog.sets.filter { it.type == "working" }
                                .map { SetOutcome(it.weight, it.reps, it.rir) }
                        },
                        repFloorFor = { idx ->
                            (workingTargets.getOrNull(idx) ?: workingTargets.lastOrNull())?.minReps ?: 8
                        }
                    )

                    if (log != null && log.sets.isNotEmpty()) {
                        val workingSetsInLog = log.sets.filter { it.type == "working" }

                        // The same set across the recent sessions, newest first, so a lift
                        // that has stopped moving can be told apart from one bad day.
                        val historyBySetIndex: List<List<SetOutcome>> =
                            workingSetsInLog.indices.map { idx ->
                                recentWorkouts.mapNotNull { w ->
                                    w.sets.find { it.exerciseId == ae.exerciseId }
                                        ?.sets?.filter { it.type == "working" }
                                        ?.getOrNull(idx)
                                        ?.let { SetOutcome(it.weight, it.reps, it.rir) }
                                }
                            }

                        val step = if (ae.incrementPerSide) 2.0 * ae.incrementWeight else ae.incrementWeight
                        val snapFor: (Double) -> Double = { w ->
                            snapToHardwareStep(w, ae.incrementWeight, ae.incrementPerSide, ae.minWeight, ae.maxWeight)
                        }

                        // The whole exercise is progressed at once, because an ascending
                        // ramp is one decision rather than three: only the top set is near
                        // enough to failure for its reserve to carry information.
                        val perSetHistories = workingSetsInLog.indices.map { idx ->
                            val prevOutcome = workingSetsInLog[idx].let { SetOutcome(it.weight, it.reps, it.rir) }
                            listOf(prevOutcome) +
                                (historyBySetIndex.getOrNull(idx) ?: emptyList())
                                    .filterNot { it == prevOutcome }
                        }
                        val perSetSpecs = workingSetsInLog.indices.map { idx ->
                            val spec = workingTargets.getOrNull(idx) ?: workingTargets.lastOrNull()
                            SetSpec(spec?.minReps ?: 8, spec?.maxReps ?: 12, spec?.targetRir ?: 2)
                        }
                        val computed = nextExerciseTargets(perSetHistories, perSetSpecs, step, snapFor)

                        var workIdx = 0
                        for (i in ae.sets.indices) {
                            val setType = ae.sets[i].type
                            if (setType == "working") {
                                val next = computed.getOrNull(workIdx) ?: computed.lastOrNull()
                                if (next != null) {
                                    ae.sets[i].targetWeight = next.weight
                                    ae.sets[i].targetReps = next.reps
                                    ae.sets[i].coachNote = next.advice ?: next.reason
                                    ae.sets[i].stalled = next.stall != StallState.NONE
                                } else {
                                    ae.sets[i].targetWeight = startingWeightFor(ae.minWeight, ae.incrementWeight, ae.incrementPerSide)
                                }
                                workIdx++
                            }
                        }
                    } else {
                        for (i in ae.sets.indices) {
                            ae.sets[i].targetWeight = startingWeightFor(ae.minWeight, ae.incrementWeight, ae.incrementPerSide)
                        }
                    }
                    val workWeight = ae.sets.firstOrNull { it.type == "working" }?.targetWeight ?: 20.0
                    recalculateWarmupTargets(ae.sets, workWeight, ae.incrementWeight, ae.incrementPerSide, ae.minWeight, ae.maxWeight)
                }
            } else {
                for (ae in active) {
                    for (i in ae.sets.indices) {
                        ae.sets[i].targetWeight = startingWeightFor(ae.minWeight, ae.incrementWeight, ae.incrementPerSide)
                    }
                    val workWeight = ae.sets.firstOrNull { it.type == "working" }?.targetWeight ?: 20.0
                    recalculateWarmupTargets(ae.sets, workWeight, ae.incrementWeight, ae.incrementPerSide, ae.minWeight, ae.maxWeight)
                }
            }

            // Open Bottom Sheet Preview instead of starting immediately
            previewExercises = active
            selectedTemplateForPreview = localTemp
            showPreviewSheet = true
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
                .padding(20.dp)
        ) {
            // Header: sync on the left, the wordmark centred, log out on the right.
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .background(ZenithAccentTint, RoundedCornerShape(8.dp))
                        .clickable(enabled = !isSyncing) { refreshRoutines(true) }
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = if (isSyncing) "⟲ SYNCING" else "⟲ SYNC",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isSyncing) ZenithSecondary else ZenithAccentSoft
                    )
                }

                Text(
                    text = "KRATOS",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = KratosWordmark,
                    color = Color.White
                )

                Box(
                    modifier = Modifier
                        .background(Color(0x1AFF7675), RoundedCornerShape(8.dp))
                        .clickable {
                            if (unsyncedCount > 0) {
                                android.widget.Toast.makeText(
                                    context,
                                    "You have $unsyncedCount unsynced workout(s). Sync before logging out or they will be lost.",
                                    android.widget.Toast.LENGTH_LONG
                                ).show()
                            } else {
                                scope.launch {
                                    try {
                                        db.exerciseDao().deleteAll()
                                        db.templateDao().deleteAll()
                                        db.workoutDao().deleteAll()
                                    } catch (e: Exception) {
                                        e.printStackTrace()
                                    }
                                    onLogout()
                                }
                            }
                        }
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Text(text = "LOG OUT", color = ZenithError, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                }
            }

            // Sync Warning Banner
            if (unsyncedCount > 0) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp)
                        .background(Color(0x1AEF4444), RoundedCornerShape(10.dp))
                        .border(1.dp, Color(0x33EF4444), RoundedCornerShape(10.dp))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "⚠", color = ZenithError, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "$unsyncedCount workout(s) pending sync",
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    Box(
                        modifier = Modifier
                            .background(ZenithError, RoundedCornerShape(6.dp))
                            .clickable(enabled = !isSyncing) {
                                isSyncing = true
                                scope.launch {
                                    val ok = repository.syncUnsyncedWorkouts()
                                    if (ok) {
                                        unsyncedCount = db.workoutDao().getUnsyncedWorkouts().size
                                    }
                                    isSyncing = false
                                }
                            }
                            .padding(horizontal = 10.dp, vertical = 5.dp)
                    ) {
                        Text("SYNC NOW", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }

            if (orderedTemplates.isEmpty()) {
                Box(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth(0.9f)
                            .background(ZenithGlass, RoundedCornerShape(16.dp))
                            .border(1.dp, ZenithGlassBorder, RoundedCornerShape(16.dp))
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Welcome to Kratos",
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                        Text(
                            text = "No routines synced yet. Create routines on Kratos Desktop to start.",
                            color = ZenithSecondary,
                            fontSize = 12.sp,
                            textAlign = TextAlign.Center,
                            lineHeight = 16.sp,
                            modifier = Modifier.padding(bottom = 20.dp)
                        )
                        Box(
                            modifier = Modifier
                                .background(ZenithAccent, RoundedCornerShape(8.dp))
                                .clickable(enabled = !isSyncing) { refreshRoutines(true) }
                                .padding(horizontal = 18.dp, vertical = 10.dp)
                        ) {
                            Text(
                                if (isSyncing) "Syncing..." else "Sync Now",
                                color = ZenithOnAccent,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    itemsIndexed(orderedTemplates) { index, localTemp ->
                        val tempExercises = remember(localTemp.exercisesJson) {
                            try {
                                json.decodeFromString<List<TemplateExercise>>(localTemp.exercisesJson)
                            } catch (e: Exception) {
                                emptyList()
                            }
                        }

                        if (index == 0) {
                            // The routine that is due, opened out: every exercise with a dot
                            // per set, so the shape of the session is readable before starting.
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0x1438BDF8), RoundedCornerShape(12.dp))
                                    .border(1.dp, ZenithAccent, RoundedCornerShape(12.dp))
                                    .clickable { openPreview(localTemp, tempExercises) }
                                    .padding(horizontal = 16.dp, vertical = 14.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = localTemp.name,
                                        color = Color.White,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f, fill = false)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = lastDoneLabel(localTemp.id),
                                        color = ZenithSecondary,
                                        fontSize = 9.sp
                                    )
                                }

                                Row(
                                    modifier = Modifier.padding(top = 10.dp, bottom = 8.dp),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    SetDotLegend(filled = false, label = "warmup")
                                    SetDotLegend(filled = true, label = "working")
                                }

                                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                    tempExercises.forEach { te ->
                                        val name = exercisesCache.find { e -> e.id == te.exerciseId }?.name
                                        if (name != null) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text(
                                                    text = name,
                                                    color = ZenithSecondary,
                                                    fontSize = 10.sp,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                    modifier = Modifier.weight(1f)
                                                )
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Row(
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    te.sets.forEach { ts -> SetDot(filled = ts.type != "warmup") }
                                                }
                                            }
                                        }
                                    }
                                }

                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 12.dp)
                                        .height(36.dp)
                                        .background(ZenithAccent, RoundedCornerShape(8.dp))
                                        .clickable { openPreview(localTemp, tempExercises) },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("START", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ZenithOnAccent)
                                }
                            }
                        } else {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0x08FFFFFF), RoundedCornerShape(12.dp))
                                    .clickable { openPreview(localTemp, tempExercises) }
                                    .padding(horizontal = 16.dp, vertical = 14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = localTemp.name,
                                    color = ZenithSecondary,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = lastDoneLabel(localTemp.id),
                                    color = ZenithMuted,
                                    fontSize = 9.sp
                                )
                            }
                        }
                    }
                }
            }
        }

        // 4. Modal Bottom Sheet for Routine Preview
        if (showPreviewSheet && selectedTemplateForPreview != null) {
            val workingTargets = previewExercises.flatMap { ex -> ex.sets.filter { it.type == "working" } }
            val avgRir = if (workingTargets.isEmpty()) null
                else workingTargets.sumOf { it.targetRir }.toDouble() / workingTargets.size
            val totalSets = previewExercises.sumOf { it.sets.size }

            ModalBottomSheet(
                onDismissRequest = { showPreviewSheet = false },
                containerColor = ZenithSurface,
                contentColor = Color.White,
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 24.dp, end = 24.dp, top = 4.dp, bottom = 20.dp)
                ) {
                    Text(
                        text = selectedTemplateForPreview!!.name,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        // Everything here is counted or prescribed. There is no session
                        // length estimate: the app does not know how long you rest.
                        text = buildString {
                            append("${previewExercises.size} exercises · $totalSets sets")
                            if (avgRir != null) append(" · avg RIR ${String.format(java.util.Locale.US, "%.1f", avgRir)}")
                        },
                        fontSize = 9.sp,
                        color = ZenithSecondary,
                        modifier = Modifier.padding(top = 2.dp)
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 320.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        itemsIndexed(previewExercises) { idx, ex ->
                            // A lift that has stopped moving is the one thing on this
                            // sheet worth reading before the session rather than after.
                            val stalledNote = ex.sets.firstOrNull { it.stalled }?.coachNote
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(
                                        if (stalledNote != null) Color(0x14F5A623) else ZenithGlass,
                                        RoundedCornerShape(12.dp)
                                    )
                                    .border(
                                        1.dp,
                                        if (stalledNote != null) Color(0x4DF5A623) else ZenithGlassBorder,
                                        RoundedCornerShape(12.dp)
                                    )
                                    .padding(horizontal = 14.dp, vertical = 10.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(18.dp)
                                                .background(ZenithAccentTintStrong, CircleShape),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = "${idx + 1}",
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = ZenithAccentSoft
                                            )
                                        }
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = ex.name,
                                            color = Color.White,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                    Box(
                                        modifier = Modifier
                                            .background(Color(0x0FFFFFFF), RoundedCornerShape(20.dp))
                                            .padding(horizontal = 8.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "${ex.sets.size} sets",
                                            color = ZenithSecondary,
                                            fontSize = 9.sp
                                        )
                                    }
                                }

                                val weightLabel = if (ex.incrementPerSide) "per side" else "total weight"
                                Text(
                                    text = "${ex.category} • ${ex.weightUnit.uppercase()} ($weightLabel)",
                                    color = ZenithSecondary,
                                    fontSize = 9.sp,
                                    modifier = Modifier.padding(start = 26.dp, top = 4.dp)
                                )

                                if (stalledNote != null) {
                                    Text(
                                        text = stalledNote,
                                        color = ZenithWarning,
                                        fontSize = 9.sp,
                                        lineHeight = 13.sp,
                                        modifier = Modifier.padding(start = 26.dp, top = 6.dp)
                                    )
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp)
                            .background(ZenithAccent, RoundedCornerShape(10.dp))
                            .clickable {
                                showPreviewSheet = false
                                onStartWorkout(
                                    selectedTemplateForPreview!!.id,
                                    selectedTemplateForPreview!!.name,
                                    previewExercises,
                                    cardioFactor
                                )
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Start Training", color = ZenithOnAccent, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

/** Hollow means warmup, filled means working - the whole legend for the card above. */
@Composable
private fun SetDot(filled: Boolean) {
    if (filled) {
        Box(modifier = Modifier.size(7.dp).background(ZenithAccent, CircleShape))
    } else {
        Box(modifier = Modifier.size(7.dp).border(1.5.dp, ZenithDot, CircleShape))
    }
}

@Composable
private fun SetDotLegend(filled: Boolean, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        SetDot(filled = filled)
        Text(text = label, fontSize = 8.sp, color = ZenithSecondary)
    }
}

// Simple safeDrawingPadding mock helper since standard WindowInsets might fail on some SDKs
@Composable
fun safeDrawingPadding(): Modifier {
    return Modifier.systemBarsPadding()
}
