package com.zenith.pulse.data

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.temporal.ChronoUnit

data class HealthDataPayload(
    val stepsCount: Long = 0,
    val activeCaloriesBurned: Double = 0.0,
    val totalCaloriesBurned: Double = 0.0,
    val latestHeartRate: Int = 0,
    val latestHrvRmssd: Double = 0.0,
    val sleepDurationMinutes: Long = 0,
    val latestWeightKg: Double = 0.0,
    val latestSpO2: Double = 0.0,
    val exerciseSessionsCount: Int = 0,
    val rawStepsList: List<Map<String, Any>> = emptyList(),
    val rawSleepList: List<Map<String, Any>> = emptyList(),
    val rawExerciseList: List<Map<String, Any>> = emptyList(),
    val timestamp: String = Instant.now().toString()
)

class HealthConnectManager(private val context: Context) {

    private val healthConnectClient: HealthConnectClient? by lazy {
        val status = HealthConnectClient.getSdkStatus(context)
        if (status == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(context)
        } else {
            null
        }
    }

    val requiredPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(OxygenSaturationRecord::class)
    )

    suspend fun hasAllPermissions(): Boolean {
        val client = healthConnectClient ?: return false
        val granted = client.permissionController.getGrantedPermissions()
        return granted.containsAll(requiredPermissions)
    }

    suspend fun fetchLatestHealthData(): HealthDataPayload {
        val client = healthConnectClient ?: return HealthDataPayload()

        val now = Instant.now()
        val startOfDay = now.truncatedTo(ChronoUnit.DAYS)
        val startTime24h = now.minus(24, ChronoUnit.HOURS)
        val startTime7Days = now.minus(7, ChronoUnit.DAYS)

        var totalSteps: Long = 0
        var activeCals: Double = 0.0
        var totalCals: Double = 0.0
        var latestHr = 0
        var latestHrv = 0.0
        var sleepMinutes: Long = 0
        var latestWeight = 0.0
        var latestSpO2Val = 0.0

        val stepsMaps = mutableListOf<Map<String, Any>>()
        val sleepMaps = mutableListOf<Map<String, Any>>()
        val exerciseMaps = mutableListOf<Map<String, Any>>()

        try {
            // 1. Steps Today
            val stepsResponse = client.readRecords(
                ReadRecordsRequest(
                    recordType = StepsRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startOfDay)
                )
            )
            for (record in stepsResponse.records) {
                totalSteps += record.count
                stepsMaps.add(
                    mapOf(
                        "count" to record.count,
                        "start_time" to record.startTime.toString(),
                        "end_time" to record.endTime.toString(),
                        "metadata" to mapOf("data_origin" to record.metadata.dataOrigin.packageName)
                    )
                )
            }

            // 2. Active Calories Today
            val activeCalsRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = ActiveCaloriesBurnedRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startOfDay)
                )
            )
            for (record in activeCalsRes.records) {
                activeCals += record.energy.inKilocalories
            }

            // 3. Heart Rate (Last 24h)
            val hrRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime24h)
                )
            )
            if (hrRes.records.isNotEmpty()) {
                val lastRecord = hrRes.records.last()
                if (lastRecord.samples.isNotEmpty()) {
                    latestHr = lastRecord.samples.last().beatsPerMinute.toInt()
                }
            }

            // 4. HRV (Last 24h)
            val hrvRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateVariabilityRmssdRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime24h)
                )
            )
            if (hrvRes.records.isNotEmpty()) {
                latestHrv = hrvRes.records.last().heartRateVariabilityMillis
            }

            // 5. Sleep Sessions (Last 24h)
            val sleepRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime24h)
                )
            )
            for (session in sleepRes.records) {
                val durSec = ChronoUnit.SECONDS.between(session.startTime, session.endTime)
                sleepMinutes += durSec / 60
                val stagesList = session.stages.map { st ->
                    val stDur = ChronoUnit.SECONDS.between(st.startTime, st.endTime)
                    mapOf(
                        "stage" to st.stage,
                        "start_time" to st.startTime.toString(),
                        "end_time" to st.endTime.toString(),
                        "duration_seconds" to stDur
                    )
                }
                sleepMaps.add(
                    mapOf(
                        "session_end_time" to session.endTime.toString(),
                        "duration_seconds" to durSec,
                        "stages" to stagesList
                    )
                )
            }

            // 6. Exercise Sessions (Last 7 Days)
            val exRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = ExerciseSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime7Days)
                )
            )
            for (ex in exRes.records) {
                val durSec = ChronoUnit.SECONDS.between(ex.startTime, ex.endTime)
                exerciseMaps.add(
                    mapOf(
                        "type" to ex.exerciseType,
                        "title" to (ex.title ?: "Workout"),
                        "start_time" to ex.startTime.toString(),
                        "end_time" to ex.endTime.toString(),
                        "duration_seconds" to durSec,
                        "metadata" to mapOf("data_origin" to ex.metadata.dataOrigin.packageName)
                    )
                )
            }

            // 7. Weight (Latest)
            val weightRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = WeightRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime7Days)
                )
            )
            if (weightRes.records.isNotEmpty()) {
                latestWeight = weightRes.records.last().weight.inKilograms
            }

            // 8. SpO2 (Latest)
            val spo2Res = client.readRecords(
                ReadRecordsRequest(
                    recordType = OxygenSaturationRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime24h)
                )
            )
            if (spo2Res.records.isNotEmpty()) {
                latestSpO2Val = spo2Res.records.last().percentage.value
            }

        } catch (e: Exception) {
            Log.e("HealthConnectManager", "Error reading Health Connect records", e)
        }

        return HealthDataPayload(
            stepsCount = totalSteps,
            activeCaloriesBurned = activeCals,
            totalCaloriesBurned = totalCals,
            latestHeartRate = latestHr,
            latestHrvRmssd = latestHrv,
            sleepDurationMinutes = sleepMinutes,
            latestWeightKg = latestWeight,
            latestSpO2 = latestSpO2Val,
            exerciseSessionsCount = exerciseMaps.size,
            rawStepsList = stepsMaps,
            rawSleepList = sleepMaps,
            rawExerciseList = exerciseMaps
        )
    }
}
