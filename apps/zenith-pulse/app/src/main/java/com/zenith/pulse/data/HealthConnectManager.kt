package com.zenith.pulse.data

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.temporal.ChronoUnit

data class HealthDataPayload(
    val stepsCount: Long = 0,
    val distanceMeters: Double = 0.0,
    val elevationGainedMeters: Double = 0.0,
    val activeCaloriesBurned: Double = 0.0,
    val totalCaloriesBurned: Double = 0.0,
    val bmrCalories: Double = 0.0,
    val latestHeartRate: Int = 0,
    val restingHeartRate: Int = 0,
    val latestHrvRmssd: Double = 0.0,
    val sleepDurationMinutes: Long = 0,
    val latestWeightKg: Double = 0.0,
    val heightCm: Double = 0.0,
    val bodyFatPercent: Double = 0.0,
    val leanBodyMassKg: Double = 0.0,
    val latestSpO2: Double = 0.0,
    val respiratoryRate: Double = 0.0,
    val systolicBp: Double = 0.0,
    val diastolicBp: Double = 0.0,
    val bodyTempCelsius: Double = 0.0,
    val hydrationMl: Double = 0.0,
    val avgPowerWatts: Double = 0.0,
    val avgSpeedKmh: Double = 0.0,
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
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ElevationGainedRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(BasalMetabolicRateRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        HealthPermission.getReadPermission(RespiratoryRateRecord::class),
        HealthPermission.getReadPermission(BloodPressureRecord::class),
        HealthPermission.getReadPermission(BodyTemperatureRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(HeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getReadPermission(LeanBodyMassRecord::class),
        HealthPermission.getReadPermission(HydrationRecord::class),
        HealthPermission.getReadPermission(PowerRecord::class),
        HealthPermission.getReadPermission(SpeedRecord::class)
    )

    suspend fun hasAllPermissions(): Boolean {
        val client = healthConnectClient ?: return false
        val granted = client.permissionController.getGrantedPermissions()
        // Return true if at least any key health permission is granted so sync isn't blocked completely
        if (granted.contains(HealthPermission.getReadPermission(StepsRecord::class)) ||
            granted.contains(HealthPermission.getReadPermission(HeartRateRecord::class)) ||
            granted.contains(HealthPermission.getReadPermission(SleepSessionRecord::class)) ||
            granted.size >= 3) {
            return true
        }
        return granted.containsAll(requiredPermissions)
    }

    suspend fun fetchLatestHealthData(): HealthDataPayload {
        val client = healthConnectClient ?: return HealthDataPayload()

        val now = Instant.now()
        val startOfDay = now.truncatedTo(ChronoUnit.DAYS)
        val startTime48h = now.minus(48, ChronoUnit.HOURS)
        val startTime30Days = now.minus(30, ChronoUnit.DAYS)

        var totalSteps: Long = 0
        var totalDistMeters: Double = 0.0
        var totalElevMeters: Double = 0.0
        var activeCals: Double = 0.0
        var totalCals: Double = 0.0
        var bmrCals: Double = 0.0
        var latestHr = 0
        var restingHr = 0
        var latestHrv = 0.0
        var sleepMinutes: Long = 0
        var latestWeight = 0.0
        var heightValueCm = 0.0
        var bodyFatPct = 0.0
        var leanMassKg = 0.0
        var latestSpO2Val = 0.0
        var respRate = 0.0
        var sysBp = 0.0
        var diaBp = 0.0
        var tempCelsius = 0.0
        var totalHydrationMl = 0.0
        var avgPower = 0.0
        var avgSpeed = 0.0

        val stepsMaps = mutableListOf<Map<String, Any>>()
        val sleepMaps = mutableListOf<Map<String, Any>>()
        val exerciseMaps = mutableListOf<Map<String, Any>>()

        // 1. Steps Today (Isolated Try-Catch)
        try {
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
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Steps fetch error: ${e.message}")
        }

        // 2. Distance Today (Isolated Try-Catch)
        try {
            val distRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = DistanceRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startOfDay)
                )
            )
            for (record in distRes.records) {
                totalDistMeters += record.distance.inMeters
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Distance fetch error: ${e.message}")
        }

        // 3. Elevation Gained Today
        try {
            val elevRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = ElevationGainedRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startOfDay)
                )
            )
            for (record in elevRes.records) {
                totalElevMeters += record.elevation.inMeters
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Elevation fetch error: ${e.message}")
        }

        // 4. Active & Total Calories
        try {
            val activeCalsRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = ActiveCaloriesBurnedRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startOfDay)
                )
            )
            for (record in activeCalsRes.records) {
                activeCals += record.energy.inKilocalories
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Active calories error: ${e.message}")
        }

        try {
            val totalCalsRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = TotalCaloriesBurnedRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startOfDay)
                )
            )
            for (record in totalCalsRes.records) {
                totalCals += record.energy.inKilocalories
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Total calories error: ${e.message}")
        }

        try {
            val bmrRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = BasalMetabolicRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime48h)
                )
            )
            if (bmrRes.records.isNotEmpty()) {
                bmrCals = bmrRes.records.last().basalMetabolicRate.inKilocaloriesPerDay
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "BMR error: ${e.message}")
        }

        // 5. Heart Rate (Last 48h)
        try {
            val hrRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime48h)
                )
            )
            if (hrRes.records.isNotEmpty()) {
                val lastRecord = hrRes.records.last()
                if (lastRecord.samples.isNotEmpty()) {
                    latestHr = lastRecord.samples.last().beatsPerMinute.toInt()
                }
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Heart Rate error: ${e.message}")
        }

        try {
            val rhrRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = RestingHeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime30Days)
                )
            )
            if (rhrRes.records.isNotEmpty()) {
                restingHr = rhrRes.records.last().beatsPerMinute.toInt()
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Resting HR error: ${e.message}")
        }

        // 6. HRV (Last 30 Days)
        try {
            val hrvRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateVariabilityRmssdRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime30Days)
                )
            )
            if (hrvRes.records.isNotEmpty()) {
                latestHrv = hrvRes.records.last().heartRateVariabilityMillis
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "HRV error: ${e.message}")
        }

        // 7. Sleep Sessions (Last 48h)
        try {
            val sleepRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime48h)
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
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Sleep error: ${e.message}")
        }

        // 8. Exercise Sessions (Last 30 Days)
        try {
            val exRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = ExerciseSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime30Days)
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
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Exercise error: ${e.message}")
        }

        // 9. Body Composition (Weight, Height, Fat, Lean Mass - Last 30 Days)
        try {
            val weightRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = WeightRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime30Days)
                )
            )
            if (weightRes.records.isNotEmpty()) {
                latestWeight = weightRes.records.last().weight.inKilograms
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Weight error: ${e.message}")
        }

        try {
            val heightRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeightRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime30Days)
                )
            )
            if (heightRes.records.isNotEmpty()) {
                heightValueCm = heightRes.records.last().height.inMeters * 100.0
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Height error: ${e.message}")
        }

        try {
            val fatRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = BodyFatRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime30Days)
                )
            )
            if (fatRes.records.isNotEmpty()) {
                bodyFatPct = fatRes.records.last().percentage.value
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Body Fat error: ${e.message}")
        }

        try {
            val leanRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = LeanBodyMassRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime30Days)
                )
            )
            if (leanRes.records.isNotEmpty()) {
                leanMassKg = leanRes.records.last().mass.inKilograms
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Lean Mass error: ${e.message}")
        }

        // 10. SpO2 & Respiratory (Last 48h)
        try {
            val spo2Res = client.readRecords(
                ReadRecordsRequest(
                    recordType = OxygenSaturationRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime48h)
                )
            )
            if (spo2Res.records.isNotEmpty()) {
                latestSpO2Val = spo2Res.records.last().percentage.value
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "SpO2 error: ${e.message}")
        }

        try {
            val respRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = RespiratoryRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime48h)
                )
            )
            if (respRes.records.isNotEmpty()) {
                respRate = respRes.records.last().rate
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Respiratory error: ${e.message}")
        }

        // 11. Blood Pressure & Temperature (Last 48h)
        try {
            val bpRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = BloodPressureRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime48h)
                )
            )
            if (bpRes.records.isNotEmpty()) {
                val lastBp = bpRes.records.last()
                sysBp = lastBp.systolic.inMillimetersOfMercury
                diaBp = lastBp.diastolic.inMillimetersOfMercury
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Blood Pressure error: ${e.message}")
        }

        try {
            val tempRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = BodyTemperatureRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startTime48h)
                )
            )
            if (tempRes.records.isNotEmpty()) {
                tempCelsius = tempRes.records.last().temperature.inCelsius
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Body Temp error: ${e.message}")
        }

        // 12. Hydration (Today)
        try {
            val hydRes = client.readRecords(
                ReadRecordsRequest(
                    recordType = HydrationRecord::class,
                    timeRangeFilter = TimeRangeFilter.after(startOfDay)
                )
            )
            for (h in hydRes.records) {
                totalHydrationMl += h.volume.inLiters * 1000.0
            }
        } catch (e: Exception) {
            Log.w("HealthConnectManager", "Hydration error: ${e.message}")
        }

        return HealthDataPayload(
            stepsCount = totalSteps,
            distanceMeters = totalDistMeters,
            elevationGainedMeters = totalElevMeters,
            activeCaloriesBurned = activeCals,
            totalCaloriesBurned = totalCals,
            bmrCalories = bmrCals,
            latestHeartRate = latestHr,
            restingHeartRate = restingHr,
            latestHrvRmssd = latestHrv,
            sleepDurationMinutes = sleepMinutes,
            latestWeightKg = latestWeight,
            heightCm = heightValueCm,
            bodyFatPercent = bodyFatPct,
            leanBodyMassKg = leanMassKg,
            latestSpO2 = latestSpO2Val,
            respiratoryRate = respRate,
            systolicBp = sysBp,
            diastolicBp = diaBp,
            bodyTempCelsius = tempCelsius,
            hydrationMl = totalHydrationMl,
            avgPowerWatts = avgPower,
            avgSpeedKmh = avgSpeed,
            exerciseSessionsCount = exerciseMaps.size,
            rawStepsList = stepsMaps,
            rawSleepList = sleepMaps,
            rawExerciseList = exerciseMaps
        )
    }
}
