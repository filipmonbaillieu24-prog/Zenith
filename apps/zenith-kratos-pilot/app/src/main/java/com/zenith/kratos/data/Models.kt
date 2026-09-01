package com.zenith.kratos.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList

@Serializable
data class Exercise(
    val id: String,
    @SerialName("user_id") val userId: String,
    val name: String,
    val category: String,
    val notes: String? = null,
    @SerialName("increment_weight") val incrementWeight: Double = 2.5,
    @SerialName("increment_per_side") val incrementPerSide: Boolean = false,
    @SerialName("min_weight") val minWeight: Double? = null,
    @SerialName("max_weight") val maxWeight: Double? = null,
    @SerialName("is_bodyweight") val isBodyweight: Boolean = false,
    @SerialName("default_rir") val defaultRir: Int = 2,
    @SerialName("weight_unit") val weightUnit: String = "kg",
    val deleted: Boolean = false
)

@Serializable
data class TemplateSet(
    val type: String, // warmup, working
    @SerialName("min_reps") val minReps: Int,
    @SerialName("max_reps") val maxReps: Int,
    @SerialName("target_rir") val targetRir: Int
)

/**
 * What a set of a routine prescribes when nothing exists to inherit from.
 *
 * Stated constants rather than anything measured. A default is a default and should look
 * like one; the moment a fallback is computed from what the athlete just lifted, the
 * template stops being what they intend to do and becomes a record of what happened.
 */
val DEFAULT_WORKING_SET = TemplateSet(type = "working", minReps = 8, maxReps = 12, targetRir = 2)
val DEFAULT_WARMUP_SET = TemplateSet(type = "warmup", minReps = 6, maxReps = 8, targetRir = 4)

/**
 * The template set to keep for a given position, given whatever the routine already had
 * there.
 *
 * Deliberately has no access to the performed set. Rep ranges and target reserve are the
 * athlete's intent, and this whole function exists because they were once overwritten by
 * performance: a set that came back easy at RIR 4 rewrote its own target to 4, the next
 * session aimed for 4, hit 4, and wrote 4 again - a ratchet with no way back up, since
 * nothing in the app raises a target. That was fixed by preserving `existing`, but the
 * fallback still read the log, and ten of this athlete's rep ranges still carry the marks
 * of it - "9-11" on a set whose siblings say 11-13, matching a session where nine reps
 * were managed.
 *
 * Taking no log parameter is the point: the mistake is not available to make here.
 */
fun templateSetFor(existing: TemplateSet?, type: String): TemplateSet {
    existing?.let { return it.copy(type = type) }
    return if (type == "warmup") DEFAULT_WARMUP_SET else DEFAULT_WORKING_SET.copy(type = type)
}

@Serializable
data class TemplateExercise(
    @SerialName("exercise_id") val exerciseId: String,
    val sets: List<TemplateSet>
)

@Serializable
data class Template(
    val id: String,
    @SerialName("user_id") val userId: String,
    val name: String,
    val exercises: List<TemplateExercise>
)

@Serializable
data class WorkoutLoggedSet(
    val type: String, // warmup, working
    val weight: Double,
    val reps: Int,
    val rir: Int,
    @SerialName("rest_seconds") val restSeconds: Int? = null
)

@Serializable
data class WorkoutExerciseLog(
    @SerialName("exercise_id") val exerciseId: String,
    val sets: List<WorkoutLoggedSet>,
    /**
     * The 0-based position this exercise was actually performed in, which can differ
     * from the template order when a machine was busy.
     *
     * Recorded rather than inferred: the logged array is built from the template, so
     * a session done out of order used to produce a log byte-identical to one done
     * in order. Nothing could tell them apart, which meant a dip caused by doing an
     * exercise on pre-fatigued muscles looked exactly like getting weaker.
     *
     * Nullable because every session logged before this existed has no such record,
     * and guessing one would be worse than admitting it is unknown.
     */
    @SerialName("performed_order") val performedOrder: Int? = null
)

@Serializable
data class Workout(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("template_id") val templateId: String? = null,
    val name: String,
    @SerialName("started_at") val startedAt: String,
    @SerialName("completed_at") val completedAt: String,
    val volume: Double,
    @SerialName("cardio_stress_factor") val cardioStressFactor: Double = 1.0,
    /** Marked unrepresentative by the athlete. Still counts for volume; never used as a progression baseline. */
    @SerialName("is_off_day") val isOffDay: Boolean = false,
    val sets: List<WorkoutExerciseLog>
)


// Simple helper class to represent active workout UI state
class ActiveSetState(
    type: String,
    targetWeight: Double,
    targetReps: Int,
    targetRir: Int,
    weightInput: String = "",
    repsInput: String = "",
    rirInput: String = "",
    isCompleted: Boolean = false,
    isNewPR: Boolean = false,
    /**
     * The top of this set's prescribed rep range.
     *
     * Carried because the between-set adjustment used to cap a rep bump at
     * targetReps + 4, a constant with nothing behind it. On a set whose template range
     * is 9-11 that prescribed 13 - two reps past a ceiling the athlete had deliberately
     * set lower than the sets before it.
     */
    maxReps: Int? = null,
    /** Why this target, in words - shown in the routine preview. */
    coachNote: String? = null,
    /** True when this lift has stopped moving and the note says what is stuck. */
    stalled: Boolean = false
) {
    var type by mutableStateOf(type)
    var targetWeight by mutableStateOf(targetWeight)
    var targetReps by mutableStateOf(targetReps)
    var targetRir by mutableStateOf(targetRir)
    var weightInput by mutableStateOf(weightInput)
    var repsInput by mutableStateOf(repsInput)
    var rirInput by mutableStateOf(rirInput)
    var isCompleted by mutableStateOf(isCompleted)
    var isNewPR by mutableStateOf(isNewPR)
    var maxReps by mutableStateOf(maxReps)
    var coachNote by mutableStateOf(coachNote)
    var stalled by mutableStateOf(stalled)
}

data class ActiveExerciseState(
    val exerciseId: String,
    val name: String,
    val category: String,
    val weightUnit: String,
    val incrementWeight: Double,
    val incrementPerSide: Boolean,
    val minWeight: Double? = null,
    val maxWeight: Double? = null,
    val notes: String?,
    val isBodyweight: Boolean,
    val sets: SnapshotStateList<ActiveSetState>
) {
    /**
     * When the first set of this exercise was ticked off, in epoch millis.
     *
     * Stamped as it happens rather than reconstructed afterwards: the logged array
     * is built in template order, so once a session is saved there is no trace of
     * what was actually done when. Sorting by this at completion gives the real
     * order - which matters when a busy machine forces an exercise later in the
     * session, onto muscles that are already tired.
     */
    var firstCompletedAtMs by mutableStateOf<Long?>(null)
}

@Serializable
data class PersistedActiveSet(
    val type: String,
    val targetWeight: Double,
    val targetReps: Int,
    val targetRir: Int,
    val weightInput: String,
    val repsInput: String,
    val rirInput: String,
    val isCompleted: Boolean,
    val isNewPR: Boolean,
    // Defaulted so sessions persisted before this field existed still deserialize.
    val maxReps: Int? = null
)

@Serializable
data class PersistedActiveExercise(
    val exerciseId: String,
    val name: String,
    val category: String,
    val weightUnit: String,
    val incrementWeight: Double,
    val incrementPerSide: Boolean,
    val minWeight: Double? = null,
    val maxWeight: Double? = null,
    val notes: String?,
    val isBodyweight: Boolean = false,
    // Survives the app being killed mid-session, or the performed order would be
    // lost for exactly the sessions most likely to have been disrupted.
    val firstCompletedAtMs: Long? = null,
    val sets: List<PersistedActiveSet>
)

@Serializable
data class BodyweightEntry(
    val weight: Double
)
