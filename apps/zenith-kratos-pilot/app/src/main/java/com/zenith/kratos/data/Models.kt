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
    val sets: List<WorkoutLoggedSet>
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
    isNewPR: Boolean = false
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
)

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
    val isNewPR: Boolean
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
    val sets: List<PersistedActiveSet>
)

@Serializable
data class BodyweightEntry(
    val weight: Double
)
