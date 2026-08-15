package com.zenith.kratos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zenith.kratos.data.*
import com.zenith.kratos.ui.theme.*
import kotlinx.coroutines.flow.map
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
        val uns = db.workoutDao().getUnsyncedWorkouts()
        unsyncedCount = uns.size
        cardioFactor = repository.calculateCardioStressFactor()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ZenithBackground)
            .then(safeDrawingPadding())
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "KRATOS PILOT",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White
                    )
                    Text(
                        text = "Kies een routine om te starten",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZenithSecondary
                    )
                }

                Button(
                    onClick = {
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
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0x1AFF7675)),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(text = "LOG OUT", color = ZenithError, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Sync Warning Banner
            if (unsyncedCount > 0) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0x1AEF4444)),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp).border(1.dp, Color(0x33EF4444), RoundedCornerShape(10.dp))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "⚠",
                            color = ZenithError,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "$unsyncedCount training(en) nog niet gesynchroniseerd",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Button(
                            onClick = {
                                isSyncing = true
                                scope.launch {
                                    val ok = repository.syncUnsyncedWorkouts()
                                    if (ok) {
                                        unsyncedCount = db.workoutDao().getUnsyncedWorkouts().size
                                    }
                                    isSyncing = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = ZenithError),
                            shape = RoundedCornerShape(6.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            enabled = !isSyncing
                        ) {
                            Text("SYNC NU", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        }
                    }
                }
            }


            // List of Templates
            Text(
                text = "ROUTINES",
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
                letterSpacing = 1.sp,
                modifier = Modifier.padding(bottom = 10.dp)
            )

            if (templates.isEmpty()) {
                Box(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ZenithSurface),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth(0.9f).border(1.dp, Color(0x16FFFFFF), RoundedCornerShape(16.dp))
                    ) {
                        Column(
                            modifier = Modifier.padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Welkom bij Kratos! 💪",
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(bottom = 8.dp)
                            )
                            Text(
                                text = "Er zijn nog geen routines gesynchroniseerd. Maak eerst routines/templates aan op Kratos Desktop via de computer.",
                                color = ZenithSecondary,
                                fontSize = 12.sp,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                lineHeight = 16.sp,
                                modifier = Modifier.padding(bottom = 20.dp)
                            )
                            Button(
                                onClick = {
                                    isSyncing = true
                                    scope.launch {
                                        repository.fetchAndCacheExercises()
                                        repository.fetchAndCacheTemplates()
                                        isSyncing = false
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = ZenithAccentNeon),
                                enabled = !isSyncing,
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(if (isSyncing) "Synchroniseren..." else "Sync Nu", color = Color(0xFF09090B), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    items(templates) { localTemp ->
                        val tempExercises = try {
                            json.decodeFromString<List<TemplateExercise>>(localTemp.exercisesJson)
                        } catch (e: Exception) {
                            emptyList()
                        }

                        Card(
                            colors = CardDefaults.cardColors(containerColor = ZenithSurface),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth().clickable {
                                // 1. Map to ActiveExerciseState list
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
                                            notes = ex.notes,
                                            isBodyweight = ex.isBodyweight,
                                            sets = androidx.compose.runtime.mutableStateListOf<ActiveSetState>().apply {
                                                addAll(
                                                    te.sets.map { ts ->
                                                        ActiveSetState(
                                                            type = ts.type,
                                                            targetWeight = 0.0,
                                                            targetReps = ts.minReps,
                                                            targetRir = ts.targetRir
                                                        )
                                                    }
                                                )
                                            }
                                        )
                                    } else null
                                }

                                // 2. Async load previous weights for double progression starting values
                                scope.launch {
                                    val prevWorkout = repository.getPreviousWorkoutForTemplate(localTemp.id)
                                    if (prevWorkout != null) {
                                        for (ae in active) {
                                            val log = prevWorkout.sets.find { it.exerciseId == ae.exerciseId }
                                            if (log != null && log.sets.isNotEmpty()) {
                                                val workingSetsInLog = log.sets.filter { it.type == "working" }
                                                val tempEx = tempExercises.find { it.exerciseId == ae.exerciseId }
                                                val allSuccess = workingSetsInLog.isNotEmpty() && workingSetsInLog.all { s ->
                                                    val maxReps = tempEx?.sets?.filter { it.type == "working" }?.firstOrNull()?.maxReps ?: 10
                                                    val targetRir = tempEx?.sets?.filter { it.type == "working" }?.firstOrNull()?.targetRir ?: 2
                                                    
                                                    s.reps >= maxReps && s.rir <= targetRir
                                                }

                                                var workIdx = 0
                                                for (i in ae.sets.indices) {
                                                    val setType = ae.sets[i].type
                                                    if (setType == "working") {
                                                        val prevSet = workingSetsInLog.getOrNull(workIdx) ?: workingSetsInLog.lastOrNull()
                                                        if (prevSet != null) {
                                                            val minReps = tempEx?.sets?.filter { it.type == "working" }?.getOrNull(workIdx)?.minReps ?: 8
                                                            val maxReps = tempEx?.sets?.filter { it.type == "working" }?.getOrNull(workIdx)?.maxReps ?: 12
                                                            val targetRir = tempEx?.sets?.filter { it.type == "working" }?.getOrNull(workIdx)?.targetRir ?: 2

                                                            if (allSuccess) {
                                                                val step = if (ae.incrementPerSide) 2.0 * ae.incrementWeight else ae.incrementWeight
                                                                val nextW = prevSet.weight + step
                                                                ae.sets[i].targetWeight = snapToHardwareStep(nextW, ae.incrementWeight, ae.incrementPerSide)
                                                                ae.sets[i].targetReps = minReps
                                                            } else {
                                                                val prevSuccessful = prevSet.rir <= targetRir
                                                                val targetW = snapToHardwareStep(prevSet.weight, ae.incrementWeight, ae.incrementPerSide)
                                                                ae.sets[i].targetWeight = targetW
                                                                if (prevSuccessful && prevSet.reps < maxReps) {
                                                                    ae.sets[i].targetReps = prevSet.reps + 1
                                                                } else {
                                                                    ae.sets[i].targetReps = prevSet.reps
                                                                }
                                                            }
                                                        } else {
                                                            ae.sets[i].targetWeight = 20.0
                                                        }
                                                        workIdx++
                                                    }
                                                }
                                            } else {
                                                for (i in ae.sets.indices) {
                                                    ae.sets[i].targetWeight = 20.0
                                                }
                                            }
                                            val workWeight = ae.sets.firstOrNull { it.type == "working" }?.targetWeight ?: 20.0
                                            recalculateWarmupTargets(ae.sets, workWeight, ae.incrementWeight, ae.incrementPerSide)
                                        }
                                    } else {
                                        for (ae in active) {
                                            for (i in ae.sets.indices) {
                                                ae.sets[i].targetWeight = 20.0
                                            }
                                            val workWeight = ae.sets.firstOrNull { it.type == "working" }?.targetWeight ?: 20.0
                                            recalculateWarmupTargets(ae.sets, workWeight, ae.incrementWeight, ae.incrementPerSide)
                                        }
                                    }

                                    // Open Bottom Sheet Preview instead of starting immediately
                                    previewExercises = active
                                    selectedTemplateForPreview = localTemp
                                    showPreviewSheet = true
                                }
                            }
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = localTemp.name,
                                    color = Color.White,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                val names = tempExercises.mapNotNull { te -> exercisesCache.find { e -> e.id == te.exerciseId }?.name }
                                Text(
                                    text = if (names.isEmpty()) "Geen oefeningen" else names.joinToString(", "),
                                    color = ZenithSecondary,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }
        }

        // 4. Modal Bottom Sheet for Routine Preview
        if (showPreviewSheet && selectedTemplateForPreview != null) {
            ModalBottomSheet(
                onDismissRequest = { showPreviewSheet = false },
                containerColor = Color(0xFF1C1C23),
                contentColor = Color.White,
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 16.dp)
                ) {
                    Text(
                        text = selectedTemplateForPreview!!.name,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "OEFENINGEN IN DEZE ROUTINE",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        color = ZenithSecondary,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 240.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(previewExercises) { ex ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0x0DFFFFFF), RoundedCornerShape(8.dp))
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = ex.name,
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    val weightLabel = if (ex.incrementPerSide) "per kant" else "totaal"
                                    Text(
                                        text = "${ex.category} • ($weightLabel)",
                                        color = ZenithSecondary,
                                        fontSize = 9.sp
                                    )
                                }
                                Text(
                                    text = "${ex.sets.size} sets",
                                    color = ZenithAccentNeon,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Button(
                        onClick = {
                            showPreviewSheet = false
                            onStartWorkout(selectedTemplateForPreview!!.id, selectedTemplateForPreview!!.name, previewExercises, cardioFactor)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ZenithAccentNeon),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Start Training", color = Color(0xFF09090B), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                }
            }
        }
    }
}

// Simple safeDrawingPadding mock helper since standard WindowInsets might fail on some SDKs
@Composable
fun safeDrawingPadding(): Modifier {
    return Modifier.systemBarsPadding()
}
