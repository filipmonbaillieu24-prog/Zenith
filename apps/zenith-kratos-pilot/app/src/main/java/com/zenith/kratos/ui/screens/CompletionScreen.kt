package com.zenith.kratos.ui.screens

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
    bodyWeight: Double,
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

    val stamp = remember { java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.getDefault()) }
    val startedAtMs = remember { runCatching { stamp.parse(startTime)?.time }.getOrNull() }
    val endedAtMs = remember { runCatching { stamp.parse(completedTime)?.time }.getOrNull() }

    val durationMinutes = remember {
        if (startedAtMs != null && endedAtMs != null) Math.max(1, ((endedAtMs - startedAtMs) / 60000).toInt())
        else null
    }

    /**
     * The previous session of this same routine, for the one comparison worth making.
     *
     * Null when there is nothing to compare against, or when the fetch fails - and the
     * line is then simply absent. A first session has no "vs last time", and inventing
     * a baseline to produce a green arrow would make the most motivating number on the
     * screen the least trustworthy one.
     */
    var previousVolume by remember { mutableStateOf<Double?>(null) }
    LaunchedEffect(templateId) {
        if (templateId != null) {
            previousVolume = repository.getPreviousWorkoutForTemplate(templateId)?.volume?.takeIf { it > 0 }
        }
    }

    // ── What actually happened, counted once and read everywhere below ──────
    val completedSetCount = exercises.sumOf { ex -> ex.sets.count { it.isCompleted } }
    val prSets = exercises.flatMap { ex -> ex.sets.filter { it.isCompleted && it.isNewPR }.map { ex to it } }

    /** This exercise's share of the session total, in kilograms, on the same rule. */
    fun volumeKgOf(ex: ActiveExerciseState): Double =
        ex.sets.filter { it.isCompleted && it.type == "working" }.sumOf { s ->
            val w = s.weightInput.toDoubleOrNull() ?: s.targetWeight
            val r = s.repsInput.toIntOrNull() ?: s.targetReps
            val unit = ex.weightUnit.trim().lowercase()
            val addedKg = if (unit == "lb" || unit == "lbs") w * 0.45359237 else w
            val effectiveKg = if (ex.isBodyweight) (bodyWeight + addedKg) else addedKg
            effectiveKg * r
        }

    fun avgRirOf(ex: ActiveExerciseState): Double? {
        val rirs = ex.sets.filter { it.isCompleted && it.type == "working" }
            .mapNotNull { it.rirInput.toIntOrNull() }
        return if (rirs.isEmpty()) null else rirs.sum().toDouble() / rirs.size
    }

    fun clock(ms: Long?): String? =
        ms?.let { java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault()).format(java.util.Date(it)) }

    val headline = remember(completedTime) {
        val date = endedAtMs?.let {
            java.text.SimpleDateFormat("d MMM", java.util.Locale.getDefault()).format(java.util.Date(it)).uppercase()
        }
        if (date != null) "${workoutName.uppercase()} · $date" else workoutName.uppercase()
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
                .padding(horizontal = 24.dp, vertical = 20.dp)
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = headline,
                    fontSize = 11.sp,
                    color = ZenithSecondary,
                    letterSpacing = 1.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        // "5231.38007575 kg" was the raw double, eight decimals of it,
                        // wrapping onto two lines. Nobody needs a hundredth of a gram of
                        // lifted volume, and the total is in kilograms because sets logged
                        // in pounds are converted before they are summed.
                        text = String.format(java.util.Locale.getDefault(), "%,.0f", volume),
                        fontSize = 54.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                        maxLines = 1
                    )
                    Text(
                        text = "kg",
                        fontSize = 20.sp,
                        color = ZenithSecondary,
                        modifier = Modifier.padding(bottom = 6.dp)
                    )
                }
                Text(
                    text = "total volume lifted",
                    fontSize = 12.sp,
                    color = ZenithSecondary,
                    modifier = Modifier.padding(top = 6.dp)
                )

                previousVolume?.let { prev ->
                    val pct = ((volume - prev) / prev) * 100.0
                    val up = pct >= 0
                    Text(
                        text = String.format(
                            java.util.Locale.getDefault(),
                            "%s %.0f%% vs last session (%,.0f kg)",
                            if (up) "▲" else "▼", Math.abs(pct), prev
                        ),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (up) ZenithSuccess else ZenithSecondary,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }

                Row(
                    modifier = Modifier.padding(top = 20.dp, bottom = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    if (durationMinutes != null) StatBlock("$durationMinutes", "minutes")
                    StatBlock("$completedSetCount", "sets")
                    StatBlock(
                        "${prSets.size}",
                        if (prSets.size == 1) "PR" else "PRs",
                        if (prSets.isEmpty()) Color.White else ZenithWarning
                    )
                }

                // Records first, because they are the reason to look at this screen.
                prSets.forEach { (ex, set) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                            .background(Color(0x1AF5A623), RoundedCornerShape(8.dp))
                            .border(1.dp, Color(0x4DF5A623), RoundedCornerShape(8.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "NEW PR — ${ex.name}",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Black,
                            color = ZenithWarning,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "${trimDisplayWeight(set.weightInput.toDoubleOrNull() ?: set.targetWeight)} ${ex.weightUnit} × ${set.repsInput}",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }

                // Per-exercise breakdown.
                exercises.forEach { ex ->
                    val done = ex.sets.filter { it.isCompleted }
                    if (done.isNotEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 6.dp)
                                .background(ZenithGlass, RoundedCornerShape(12.dp))
                                .border(1.dp, ZenithGlassBorder, RoundedCornerShape(12.dp))
                                .padding(start = 14.dp, end = 14.dp, top = 10.dp, bottom = 6.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = ex.name.replace(" - ", " • ").trim(),
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f)
                                )
                                avgRirOf(ex)?.let { avg ->
                                    Box(
                                        modifier = Modifier
                                            .background(Color(0x0FFFFFFF), RoundedCornerShape(20.dp))
                                            .padding(horizontal = 7.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "avg ${String.format(java.util.Locale.US, "%.1f", avg)}",
                                            color = ZenithSecondary,
                                            fontSize = 8.sp
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(8.dp))
                                }
                                Text(
                                    text = String.format(java.util.Locale.getDefault(), "%,.0f kg", volumeKgOf(ex)),
                                    color = ZenithSecondary,
                                    fontSize = 9.sp
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(1.dp)
                                    .background(ZenithGlassBorder)
                            )

                            done.forEachIndexed { sIdx, s ->
                                val isWarmup = s.type == "warmup"
                                val label = if (isWarmup) {
                                    "W${done.take(sIdx).count { it.type == "warmup" } + 1}"
                                } else {
                                    "${done.take(sIdx).count { it.type == "working" } + 1}"
                                }
                                val tone = when {
                                    s.isNewPR -> ZenithWarning
                                    isWarmup -> ZenithSecondary
                                    else -> ZenithBright
                                }

                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(18.dp)
                                                .background(
                                                    when {
                                                        s.isNewPR -> ZenithWarning
                                                        isWarmup -> Color(0x14FFFFFF)
                                                        else -> ZenithAccentTintStrong
                                                    },
                                                    CircleShape
                                                ),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = label,
                                                fontSize = if (isWarmup) 8.sp else 9.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = when {
                                                    s.isNewPR -> ZenithOnAccent
                                                    isWarmup -> ZenithSecondary
                                                    else -> ZenithAccentSoft
                                                }
                                            )
                                        }
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = buildString {
                                                append(if (isWarmup) "Warmup" else "Set $label")
                                                if (s.isNewPR) append(" · New PR")
                                            },
                                            fontSize = 10.sp,
                                            color = tone,
                                            maxLines = 1
                                        )
                                    }

                                    Box(modifier = Modifier.width(44.dp), contentAlignment = Alignment.Center) {
                                        // A warmup has no reserve worth recording, so the
                                        // column says so rather than showing the 4 the
                                        // tracker writes to keep the log well-formed.
                                        if (isWarmup) {
                                            Text("—", fontSize = 9.sp, color = ZenithMuted)
                                        } else {
                                            Box(
                                                modifier = Modifier
                                                    .background(
                                                        if (s.isNewPR) Color(0x26F5A623) else Color(0x1F38BDF8),
                                                        RoundedCornerShape(5.dp)
                                                    )
                                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                                            ) {
                                                Text(
                                                    text = "RIR ${s.rirInput.ifBlank { s.targetRir.toString() }}",
                                                    fontSize = 9.sp,
                                                    color = if (s.isNewPR) ZenithWarning else ZenithAccentSoft
                                                )
                                            }
                                        }
                                    }

                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        // The exercise's own unit. These two machines are
                                        // logged in pounds and the screen labelled every
                                        // set "kg".
                                        text = "${trimDisplayWeight(s.weightInput.toDoubleOrNull() ?: s.targetWeight)} ${ex.weightUnit} × ${s.repsInput}",
                                        fontSize = 10.5.sp,
                                        fontWeight = if (s.isNewPR) FontWeight.Bold else FontWeight.SemiBold,
                                        color = if (s.isNewPR) ZenithWarning else Color.White,
                                        textAlign = TextAlign.End,
                                        modifier = Modifier.width(84.dp)
                                    )
                                }
                            }
                        }
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 4.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    val from = clock(startedAtMs)
                    val to = clock(endedAtMs)
                    if (from != null && to != null) {
                        Text("Started $from · Ended $to", fontSize = 9.sp, color = ZenithSecondary)
                    }
                    if (bodyWeight > 0) {
                        Text(
                            text = "Bodyweight ${trimDisplayWeight(bodyWeight)} kg",
                            fontSize = 9.sp,
                            color = ZenithSecondary
                        )
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
                        .padding(top = 10.dp, bottom = 4.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isOffDay) ZenithAccentTint else ZenithGlass)
                        .border(
                            1.dp,
                            if (isOffDay) ZenithAccentBorder else ZenithGlassBorder,
                            RoundedCornerShape(10.dp)
                        )
                        .clickable { isOffDay = !isOffDay }
                        .padding(end = 14.dp, top = 4.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = isOffDay,
                        onCheckedChange = { isOffDay = it },
                        colors = CheckboxDefaults.colors(
                            checkedColor = ZenithAccent,
                            checkmarkColor = ZenithOnAccent,
                            uncheckedColor = ZenithSecondary
                        )
                    )
                    Column {
                        Text(
                            text = "Don't use this session for my next targets",
                            color = ZenithBright,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Equipment taken, felt ill, short on time — it still counts in your history.",
                            color = ZenithSecondary,
                            fontSize = 10.sp,
                            lineHeight = 14.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .background(ZenithAccentTint, RoundedCornerShape(12.dp))
                        .border(1.dp, ZenithAccentBorder, RoundedCornerShape(12.dp))
                        .clickable {
                            // Hands the summary to the system share sheet. Nothing leaves
                            // the phone until the athlete picks somewhere to send it.
                            val body = buildString {
                                appendLine(headline)
                                appendLine(String.format(java.util.Locale.getDefault(), "%,.0f kg total volume", volume))
                                durationMinutes?.let { appendLine("$it minutes · $completedSetCount sets") }
                                if (prSets.isNotEmpty()) appendLine("${prSets.size} new PR(s)")
                                appendLine()
                                exercises.forEach { ex ->
                                    val done = ex.sets.filter { it.isCompleted && it.type == "working" }
                                    if (done.isNotEmpty()) {
                                        appendLine(ex.name)
                                        done.forEach { s ->
                                            appendLine("  ${trimDisplayWeight(s.weightInput.toDoubleOrNull() ?: s.targetWeight)} ${ex.weightUnit} × ${s.repsInput} @ RIR ${s.rirInput}")
                                        }
                                    }
                                }
                            }
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, headline)
                                putExtra(Intent.EXTRA_TEXT, body)
                            }
                            context.startActivity(Intent.createChooser(send, "Share workout"))
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text("SHARE", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ZenithAccentSoft)
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .background(ZenithAccent, RoundedCornerShape(12.dp))
                        .clickable(enabled = !isSaving) {
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
                                                        templateSetFor(existing, s.type)
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
                                                                templateSetFor(existing, ls.type)
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
                    contentAlignment = Alignment.Center
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = ZenithOnAccent,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("SAVE", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ZenithOnAccent)
                    }
                }
            }
        }
    }
}

@Composable
private fun StatBlock(value: String, label: String, tone: Color = Color.White) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, fontSize = 18.sp, fontWeight = FontWeight.Black, color = tone)
        Text(text = label, fontSize = 9.sp, color = ZenithSecondary)
    }
}
