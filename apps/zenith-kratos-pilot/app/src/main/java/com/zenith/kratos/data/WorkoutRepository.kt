package com.zenith.kratos.data

import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import java.text.SimpleDateFormat
import java.util.*

class WorkoutRepository(
    private val exerciseDao: ExerciseDao,
    private val templateDao: TemplateDao,
    private val workoutDao: WorkoutDao,
    private val activeWorkoutDao: ActiveWorkoutDao
) {
    private val client = SupabaseClient.client
    private val json = Json { ignoreUnknownKeys = true }

    // 1. Fetch & Cache Exercises
    suspend fun fetchAndCacheExercises() = withContext(Dispatchers.IO) {
        try {
            val response = client.postgrest["kratos_exercises"].select {
                filter {
                    eq("deleted", false)
                }
            }
            val remoteList = response.decodeList<Exercise>()
            val localList = remoteList.map {
                LocalExercise(
                    id = it.id,
                    name = it.name,
                    category = it.category,
                    notes = it.notes,
                    incrementWeight = it.incrementWeight,
                    incrementPerSide = it.incrementPerSide,
                    defaultRir = it.defaultRir,
                    weightUnit = it.weightUnit,
                    isBodyweight = it.isBodyweight
                )
            }
            exerciseDao.deleteAll()
            exerciseDao.insertExercises(localList)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    // 2. Fetch & Cache Templates
    suspend fun fetchAndCacheTemplates() = withContext(Dispatchers.IO) {
        try {
            val response = client.postgrest["kratos_templates"].select()
            val remoteList = response.decodeList<Template>()
            val localList = remoteList.map {
                LocalTemplate(
                    id = it.id,
                    name = it.name,
                    exercisesJson = json.encodeToString(it.exercises)
                )
            }
            templateDao.deleteAll()
            templateDao.insertTemplates(localList)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    // 2b. Fetch Latest Bodyweight
    suspend fun getLatestBodyweight(): Double = withContext(Dispatchers.IO) {
        try {
            val uId = client.auth.currentUserOrNull()?.id ?: return@withContext 80.0
            val response = client.postgrest["vigor_weight"].select {
                filter {
                    eq("user_id", uId)
                }
                order("logged_at", io.github.jan.supabase.postgrest.query.Order.DESCENDING)
                limit(1)
            }
            val entries = json.decodeFromString<List<BodyweightEntry>>(response.data)
            entries.firstOrNull()?.weight ?: 80.0
        } catch (e: Exception) {
            e.printStackTrace()
            80.0
        }
    }

    // 3. Log a Completed Workout
    suspend fun logWorkout(workout: Workout) = withContext(Dispatchers.IO) {
        // Save locally first
        val local = LocalWorkout(
            id = workout.id,
            templateId = workout.templateId,
            name = workout.name,
            startedAt = workout.startedAt,
            completedAt = workout.completedAt,
            volume = workout.volume,
            cardioStressFactor = workout.cardioStressFactor,
            setsJson = json.encodeToString(workout.sets),
            isSynced = false
        )
        workoutDao.insertWorkout(local)

        // Try to push to Supabase
        val success = pushToSupabase(workout)
        if (success) {
            workoutDao.markSynced(workout.id)
        }
    }

    private suspend fun pushToSupabase(workout: Workout): Boolean {
        return try {
            val uId = client.auth.currentUserOrNull()?.id ?: ""
            val workoutWithUser = workout.copy(userId = uId)
            client.postgrest["kratos_workouts"].insert(workoutWithUser)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    // 4. Background Sync for Unsynced Workouts
    suspend fun syncUnsyncedWorkouts(): Boolean = withContext(Dispatchers.IO) {
        var allSuccess = true
        val unsynced = workoutDao.getUnsyncedWorkouts()
        for (local in unsynced) {
            val sets = json.decodeFromString<List<WorkoutExerciseLog>>(local.setsJson)
            val workout = Workout(
                id = local.id,
                userId = client.auth.currentUserOrNull()?.id ?: "",
                templateId = local.templateId,
                name = local.name,
                startedAt = local.startedAt,
                completedAt = local.completedAt,
                volume = local.volume,
                cardioStressFactor = local.cardioStressFactor,
                sets = sets
            )
            val success = pushToSupabase(workout)
            if (success) {
                workoutDao.markSynced(local.id)
            } else {
                allSuccess = false
            }
        }
        allSuccess
    }

    // 5. Fetch previous workout logs of a template for Double Progression start values
    suspend fun getPreviousWorkoutForTemplate(templateId: String): Workout? = withContext(Dispatchers.IO) {
        try {
            val response = client.postgrest["kratos_workouts"].select {
                filter {
                    eq("template_id", templateId)
                }
                order("completed_at", io.github.jan.supabase.postgrest.query.Order.DESCENDING)
                limit(1)
            }
            response.decodeList<Workout>().firstOrNull()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    // 6. Calculate PMC Z-score scaling factor based on ride history
    suspend fun calculateCardioStressFactor(): Double = withContext(Dispatchers.IO) {
        try {
            val response = client.postgrest["rides"].select()
            val list = response.decodeList<RideTSSLocal>()
            if (list.isEmpty()) return@withContext 1.0

            val parsedRides = list.map {
                var witha = it.metadata
                if (witha.startsWith("\"") && witha.endsWith("\"")) {
                    witha = witha.substring(1, witha.length - 1).replace("\\\"", "\"")
                }
                val tss = try {
                    val tssMatch = "\"tss\":\\s*([0-9.]+)".toRegex().find(witha)
                    tssMatch?.groupValues?.get(1)?.toDouble() ?: 0.0
                } catch (e: Exception) {
                    0.0
                }
                RideTSSItem(it.date, tss)
            }

            // Group by day key
            val tssPerDay = mutableMapOf<String, Double>()
            val sdf = SimpleDateFormat("yyyy-MM-DD", Locale.getDefault())
            for (r in parsedRides) {
                val key = sdf.format(Date(r.date))
                tssPerDay[key] = (tssPerDay[key] ?: 0.0) + r.tss
            }

            val firstTime = parsedRides.minOf { it.date }
            val firstCal = Calendar.getInstance().apply { timeInMillis = firstTime; set(Calendar.HOUR_OF_DAY, 0) }
            val todayCal = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 0) }

            val K_CTL = 1.0 - Math.exp(-1.0 / 42.0)
            val K_ATL = 1.0 - Math.exp(-1.0 / 7.0)

            val points = mutableListOf<Double>()
            var ctl = 0.0
            var atl = 0.0

            while (firstCal.timeInMillis <= todayCal.timeInMillis) {
                val key = sdf.format(firstCal.time)
                val tss = tssPerDay[key] ?: 0.0
                ctl += K_CTL * (tss - ctl)
                atl += K_ATL * (tss - atl)
                points.add(atl)
                firstCal.add(Calendar.DAY_OF_YEAR, 1)
            }

            if (points.isNotEmpty()) {
                val currentAtl = atl
                // Cutoff 90 days
                val recentAtls = points.takeLast(90)
                val avg = recentAtls.average()
                val variance = recentAtls.map { Math.pow(it - avg, 2.0) }.average()
                val stdDev = Math.max(Math.sqrt(variance), 10.0)

                val zScore = (currentAtl - avg) / stdDev
                if (zScore > 1.0) {
                    val factor = 1.0 + 0.15 * zScore
                    return@withContext Math.min(factor, 2.0) // cap at 2.0
                }
            }
            1.0
        } catch (e: Exception) {
            e.printStackTrace()
            1.0
        }
    }

    // 8. Active Workout Persistence
    suspend fun getPersistedActiveWorkout() = withContext(Dispatchers.IO) {
        try {
            val local = activeWorkoutDao.getActiveWorkout() ?: return@withContext null
            val exercises = json.decodeFromString<List<PersistedActiveExercise>>(local.exercisesJson)
            val mapped = exercises.map { pe ->
                ActiveExerciseState(
                    exerciseId = pe.exerciseId,
                    name = pe.name,
                    category = pe.category,
                    weightUnit = pe.weightUnit,
                    incrementWeight = pe.incrementWeight,
                    incrementPerSide = pe.incrementPerSide,
                    notes = pe.notes,
                    isBodyweight = pe.isBodyweight,
                    sets = androidx.compose.runtime.mutableStateListOf<ActiveSetState>().apply {
                        addAll(pe.sets.map { ps ->
                            ActiveSetState(
                                type = ps.type,
                                targetWeight = ps.targetWeight,
                                targetReps = ps.targetReps,
                                targetRir = ps.targetRir,
                                weightInput = ps.weightInput,
                                repsInput = ps.repsInput,
                                rirInput = ps.rirInput,
                                isCompleted = ps.isCompleted,
                                isNewPR = ps.isNewPR
                            )
                        })
                    }
                )
            }
            PersistedWorkoutState(
                templateId = local.templateId,
                name = local.name,
                startedAtMs = local.startedAtMs,
                cardioStressFactor = local.cardioStressFactor,
                exercises = mapped
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun saveActiveWorkoutState(
        templateId: String?,
        name: String,
        startedAtMs: Long,
        cardioStressFactor: Double,
        exercises: List<ActiveExerciseState>
    ) = withContext(Dispatchers.IO) {
        try {
            val persisted = exercises.map { ae ->
                PersistedActiveExercise(
                    exerciseId = ae.exerciseId,
                    name = ae.name,
                    category = ae.category,
                    weightUnit = ae.weightUnit,
                    incrementWeight = ae.incrementWeight,
                    incrementPerSide = ae.incrementPerSide,
                    notes = ae.notes,
                    isBodyweight = ae.isBodyweight,
                    sets = ae.sets.map { as_ ->
                        PersistedActiveSet(
                            type = as_.type,
                            targetWeight = as_.targetWeight,
                            targetReps = as_.targetReps,
                            targetRir = as_.targetRir,
                            weightInput = as_.weightInput,
                            repsInput = as_.repsInput,
                            rirInput = as_.rirInput,
                            isCompleted = as_.isCompleted,
                            isNewPR = as_.isNewPR
                        )
                    }
                )
            }
            val jsonStr = json.encodeToString(persisted)
            activeWorkoutDao.saveActiveWorkout(
                LocalActiveWorkout(
                    templateId = templateId,
                    name = name,
                    startedAtMs = startedAtMs,
                    cardioStressFactor = cardioStressFactor,
                    exercisesJson = jsonStr
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun deleteActiveWorkoutState() = withContext(Dispatchers.IO) {
        try {
            activeWorkoutDao.deleteActiveWorkout()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun getMLAutoregWeights(): String? = withContext(Dispatchers.IO) {
        try {
            val uId = client.auth.currentUserOrNull()?.id ?: return@withContext null
            val response = client.postgrest["ml_weights"].select {
                filter {
                    eq("user_id", uId)
                    eq("model_name", "kratos_autoreg_weights")
                }
                limit(1)
            }
            response.data
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}

data class PersistedWorkoutState(
    val templateId: String?,
    val name: String,
    val startedAtMs: Long,
    val cardioStressFactor: Double,
    val exercises: List<ActiveExerciseState>
)

@kotlinx.serialization.Serializable
data class RideTSSLocal(
    val date: Long,
    val metadata: String
)

data class RideTSSItem(
    val date: Long,
    val tss: Double
)
