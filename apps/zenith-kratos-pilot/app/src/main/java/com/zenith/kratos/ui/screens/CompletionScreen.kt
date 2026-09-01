package com.zenith.kratos.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zenith.kratos.data.*
import com.zenith.kratos.ui.theme.*
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompletionScreen(
    workoutName: String,
    templateId: String?,
    startTime: String,
    completedTime: String,
    volume: Double,
    cardioStressFactor: Double,
    exercises: List<ActiveExerciseState>,
    repository: WorkoutRepository,
    onFinish: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var saveToTemplate by remember { mutableStateOf(true) }
    // Marked by the athlete when the session was not representative - a machine was
    // taken and the order had to change, illness, a rushed lunch break. The session
    // still counts for volume and history; it is only skipped when choosing the
    // baseline the NEXT session's targets are built from.
    var isOffDay by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }

    // Parse duration
    val durationMinutes = remember {
        try {
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.getDefault())
            val start = sdf.parse(startTime)?.time ?: 0L
            val end = sdf.parse(completedTime)?.time ?: 0L
            Math.max(1, ((end - start) / 60000).toInt())
        } catch (e: Exception) {
            45
        }
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
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "WORKOUT COMPLETED! 🎉",
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = ZenithAccentNeon,
                letterSpacing = 1.sp,
                modifier = Modifier.padding(top = 16.dp, bottom = 4.dp)
            )
            Text(
                text = "Great job on your workout!",
                fontSize = 11.sp,
                color = ZenithSecondary,
                modifier = Modifier.padding(bottom = 24.dp)
            )

            // Volume and duration cards row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = ZenithSurface),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("Volume", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ZenithSecondary)
                        // "5231.38007575 kg" was the raw double, eight decimals of it,
                        // wrapping onto two lines. Nobody needs a hundredth of a gram of
                        // lifted volume, and the total is in kilograms because sets logged
                        // in pounds are converted before they are summed.
                        Text(
                            text = String.format(java.util.Locale.getDefault(), "%,.0f kg", volume),
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White,
                            maxLines = 1
                        )
                    }
                }

                Card(
                    colors = CardDefaults.cardColors(containerColor = ZenithSurface),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("Duration", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ZenithSecondary)
                        Text("$durationMinutes min", fontSize = 18.sp, fontWeight = FontWeight.Black, color = Color.White)
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Exercise summary list
            Card(
                colors = CardDefaults.cardColors(containerColor = ZenithSurface),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "WORKOUT SUMMARY",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                        letterSpacing = 0.5.sp,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )

                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(exercises) { ex ->
                            val workingSets = ex.sets.filter { it.isCompleted }
                            if (workingSets.isNotEmpty()) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(Color(0xFF27272E), RoundedCornerShape(8.dp))
                                        .padding(10.dp)
                                ) {
                                    Text(
                                        text = ex.name.replace(" - ", " • ").trim(),
                                        color = Color.White,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(bottom = 8.dp)
                                    )

                                    // Chips wrap onto the next line rather than being
                                    // squeezed: four sets in a fixed Row turned
                                    // "3: 100.0kg x 15" into four stacked characters wide.
                                    FlowRow(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        workingSets.forEachIndexed { sIdx, s ->
                                            val label = if (s.type == "warmup") {
                                                val wPre = ex.sets.take(sIdx).count { it.type == "warmup" }
                                                "W${wPre + 1}"
                                            } else {
                                                val workPre = ex.sets.take(sIdx).count { it.type == "working" }
                                                "${workPre + 1}"
                                            }
                                            Box(
                                                modifier = Modifier
                                                    .background(Color(0x1AFFFFFF), RoundedCornerShape(4.dp))
                                                    .padding(horizontal = 6.dp, vertical = 4.dp)
                                            ) {
                                                Text(
                                                    // The exercise's own unit. These two
                                                    // machines are logged in pounds and the
                                                    // screen labelled every set "kg".
                                                    text = "$label: ${trimWeight(s.weightInput)} ${ex.weightUnit} x ${s.repsInput}",
                                                    color = ZenithSecondary,
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    maxLines = 1
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }


            // Off-day switch.
            //
            // Targets are built from previous performance, so a bad session quietly
            // becomes the new starting point. The best-of-recent baseline handles the
            // common case on its own, but it cannot see WHY a session was poor - this
            // is the escape hatch for the reasons no data captures.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (isOffDay) ZenithAccentNeon.copy(alpha = 0.10f) else ZenithSurface)
                    .clickable { isOffDay = !isOffDay }
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(
                    checked = isOffDay,
                    onCheckedChange = { isOffDay = it },
                    colors = CheckboxDefaults.colors(checkedColor = ZenithAccentNeon, checkmarkColor = ZenithBackground)
                )
                Column(modifier = Modifier.padding(start = 6.dp)) {
                    Text(
                        text = "Don't use this session for my next targets",
                        color = ZenithPrimary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Equipment taken, felt ill, short on time - it still counts in your history.",
                        color = ZenithSecondary,
                        fontSize = 11.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Save button
            Button(
                onClick = {
                    isSaving = true
                    scope.launch {
                        try {
                            // 1. Build Workout Exercise Logs
                            // The order exercises were actually started in, derived from
                            // the timestamps stamped as each one's first set was ticked
                            // off. Exercises that were never started have no stamp and
                            // are dropped below anyway.
                            val performedRank = exercises
                                .filter { it.firstCompletedAtMs != null }
                                .sortedBy { it.firstCompletedAtMs }
                                .mapIndexed { idx, ex -> ex.exerciseId to idx }
                                .toMap()

                            val logs = exercises.mapNotNull { ex ->
                                val completedSets = ex.sets.filter { it.isCompleted }.map { s ->
                                    WorkoutLoggedSet(
                                        type = s.type,
                                        weight = s.weightInput.toDoubleOrNull() ?: s.targetWeight,
                                        reps = s.repsInput.toIntOrNull() ?: s.targetReps,
                                        rir = s.rirInput.toIntOrNull() ?: s.targetRir
                                    )
                                }
                                if (completedSets.isNotEmpty()) {
                                    WorkoutExerciseLog(
                                        exerciseId = ex.exerciseId,
                                        sets = completedSets,
                                        // The array itself stays in template order - other
                                        // code matches by id and renders in array order -
                                        // so the real order is recorded as a field.
                                        performedOrder = performedRank[ex.exerciseId]
                                    )
                                } else null
                            }

                            // 2. Log workout (Room + Supabase upload)
                            val workoutId = UUID.randomUUID().toString()
                            val workoutObj = Workout(
                                id = workoutId,
                                userId = "", // will use current session uid in repo
                                templateId = templateId,
                                name = workoutName,
                                startedAt = startTime,
                                completedAt = completedTime,
                                volume = volume,
                                cardioStressFactor = cardioStressFactor,
                                isOffDay = isOffDay,
                                sets = logs
                            )
                            repository.logWorkout(workoutObj)

                            // 3. Optional: Write changes back to template
                            if (saveToTemplate && templateId != null) {
                                val db = AppDatabase.getDatabase(context)
                                val localTemp = db.templateDao().getAllTemplates().find { it.id == templateId }
                                if (localTemp != null) {
                                    val currentEx = Json.decodeFromString<List<TemplateExercise>>(localTemp.exercisesJson)
                                    val updatedEx = currentEx.map { te ->
                                        val log = logs.find { it.exerciseId == te.exerciseId }
                                        if (log != null) {
                                            // Keep the athlete's TARGETS. Only the structure of the
                                            // session - how many sets, and whether each is a warmup
                                            // or a working set - is written back.
                                            //
                                            // This used to copy the performed set straight into the
                                            // template:
                                            //
                                            //     minReps = s.reps, maxReps = s.reps + 2, targetRir = s.rir
                                            //
                                            // which made the RIR you HIT the RIR you were next asked
                                            // for. A set that came back easy at RIR 4 rewrote its own
                                            // target to 4, the next session then aimed for 4, hit 4,
                                            // and wrote 4 again - a one-way ratchet with no path back
                                            // up, because nothing in the app ever raises a target.
                                            // Three exercises here had drifted from a hand-set RIR 2
                                            // to RIR 4 this way, which is warm-up intensity being
                                            // prescribed as working sets. It is the reason the weight
                                            // suggestions looked timid: they were obeying a target
                                            // that performance had quietly lowered.
                                            //
                                            // A template is what you intend to do. A log is what
                                            // happened. The second must not overwrite the first.
                                            val sets = log.sets.mapIndexed { idx, s ->
                                                val existing = te.sets.getOrNull(idx)
                                                    ?: te.sets.lastOrNull { it.type == s.type }
                                                    ?: te.sets.lastOrNull()
                                                TemplateSet(
                                                    type = s.type,
                                                    minReps = existing?.minReps ?: s.reps,
                                                    maxReps = existing?.maxReps ?: (s.reps + 2),
                                                    targetRir = existing?.targetRir ?: s.rir
                                                )
                                            // Only completed sets reach the log, so a skipped set would
                                            // otherwise delete itself from the routine - run out of time
                                            // once and the set is gone for good. Any template sets beyond
                                            // what was performed are kept.
                                            } + te.sets.drop(log.sets.size)
                                            te.copy(sets = sets)
                                        } else te
                                    }

                                    // Nothing to save unless the STRUCTURE actually changed.
                                    //
                                    // Now that targets are preserved rather than overwritten, a
                                    // normal session produces a template identical to the one it
                                    // started from - so writing it back can only ever do harm. And
                                    // it could: templates are cached locally and refreshed on app
                                    // launch, so editing a template on the web while the phone is
                                    // already running leaves the phone holding a stale copy. Saving
                                    // a workout would then push that stale copy back over the edit.
                                    //
                                    // Skipping the no-op write removes that risk for every ordinary
                                    // session.
                                    if (updatedEx == currentEx) {
                                        // Structure unchanged - the template already says this.
                                    } else {
                                        // Something structural did change (a set added or dropped
                                        // mid-session). Merge onto the CURRENT remote template rather
                                        // than the local cache, so a concurrent edit made elsewhere
                                        // is not overwritten by whatever this phone last downloaded.
                                        val remoteEx: List<TemplateExercise>? = try {
                                            SupabaseClient.client.postgrest["kratos_templates"].select {
                                                filter { eq("id", templateId) }
                                            }.decodeList<Template>().firstOrNull()?.exercises
                                        } catch (e: Exception) {
                                            e.printStackTrace()
                                            null
                                        }

                                        val merged = if (remoteEx != null) {
                                            // Re-run the same preserve-targets merge, this time against
                                            // what the server currently holds.
                                            remoteEx.map { rte ->
                                                val log = logs.find { it.exerciseId == rte.exerciseId }
                                                if (log != null) {
                                                    rte.copy(sets = log.sets.mapIndexed { idx, ls ->
                                                        val existing = rte.sets.getOrNull(idx)
                                                            ?: rte.sets.lastOrNull { it.type == ls.type }
                                                            ?: rte.sets.lastOrNull()
                                                        TemplateSet(
                                                            type = ls.type,
                                                            minReps = existing?.minReps ?: ls.reps,
                                                            maxReps = existing?.maxReps ?: (ls.reps + 2),
                                                            targetRir = existing?.targetRir ?: ls.rir
                                                        )
                                                    } + rte.sets.drop(log.sets.size))
                                                } else rte
                                            }
                                        } else updatedEx

                                        db.templateDao().insertTemplates(listOf(
                                            localTemp.copy(exercisesJson = Json.encodeToString(merged))
                                        ))

                                        try {
                                            SupabaseClient.client.postgrest["kratos_templates"].update(
                                                mapOf("exercises" to merged)
                                            ) {
                                                filter {
                                                    eq("id", templateId)
                                                }
                                            }
                                        } catch (e: Exception) {
                                            e.printStackTrace()
                                        }
                                    }
                                }
                            }

                            Toast.makeText(context, "Workout successfully saved!", Toast.LENGTH_SHORT).show()
                            onFinish()
                        } catch (e: Exception) {
                            Toast.makeText(context, "Error saving: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
                        } finally {
                            isSaving = false
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = ZenithAccentNeon),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                enabled = !isSaving
            ) {
                if (isSaving) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = ZenithBackground)
                } else {
                    Text(text = "SAVE AND FINISH", color = ZenithBackground, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
        }
    }
}

/** "70.0" reads better as "70" on a stack that only makes whole numbers. */
private fun trimWeight(raw: String): String {
    val value = raw.trim().toDoubleOrNull() ?: return raw.trim()
    return if (value == Math.floor(value)) value.toLong().toString()
    else value.toString().trimEnd('0').trimEnd('.')
}
