package com.zenith.pulse.sync

import android.content.Context
import android.util.Log
import com.zenith.pulse.auth.UserAuthManager
import com.zenith.pulse.data.HealthConnectManager
import com.zenith.pulse.data.HealthDataPayload
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.request.headers
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.add

object ZenithSyncManager {

    private const val ZENITH_RPC_URL =
        "https://usvddplwtrelmqsecprp.supabase.co/rest/v1/rpc/health_connect_ingest"

    private const val SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdmRkcGx3dHJlbG1xc2VjcHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzAyMjksImV4cCI6MjEwMTE0NjIyOX0.WGLIaVq-7bzOQGtSpypApOBt1UyBeATnREmPgz8BacM"

    private val httpClient by lazy {
        HttpClient(OkHttp)
    }

    @Volatile
    var cachedPayload: HealthDataPayload = HealthDataPayload()
        private set

    @Volatile
    var lastSyncTimestamp: Long = 0
        private set

    @Volatile
    var lastSyncStatus: String = "Never synced"
        private set

    /**
     * The three things a sync does, in order, so the screen can say which one it is on.
     *
     * These are the real stages, not a decoration: each is reported when that step has
     * genuinely finished, and a failure reports the stage it failed at. A sync that
     * silently posts nothing is the failure mode this app has actually had - 157 of 185
     * background syncs once posted a payload of zeros and every one returned success -
     * so which step gave up is worth showing rather than a spinner that always ends
     * the same way.
     */
    enum class SyncStage { AUTH, READ, UPLOAD }

    suspend fun performSync(
        context: Context,
        syncType: String = "MANUAL",
        onStage: ((SyncStage, Boolean) -> Unit)? = null
    ): Boolean = withContext(Dispatchers.IO) {
        // Reported on the caller's behalf from a background thread; the UI hops back to
        // the main thread itself.
        fun stage(s: SyncStage, ok: Boolean) = onStage?.invoke(s, ok)
        try {
            if (!UserAuthManager.isLoggedIn(context)) {
                stage(SyncStage.AUTH, false)
                lastSyncStatus = "⛔ Login required: No linked Zenith account"
                Log.w("ZenithSyncManager", "Sync aborted: user not logged in.")
                return@withContext false
            }

            // health_connect_ingest() now requires an authenticated caller (identity is
            // derived server-side from this token, never from the payload - see
            // shared/09_secure_health_connect_ingest.sql), so a fresh access token is
            // required, not just the anon key. Refreshed on every sync rather than
            // tracked for expiry locally: simpler, and immune to clock-skew bugs.
            val userAccessToken = UserAuthManager.refreshAccessToken(context)
                ?: UserAuthManager.getAccessToken(context)
            if (userAccessToken.isNullOrEmpty()) {
                stage(SyncStage.AUTH, false)
                lastSyncStatus = "⛔ Login expired: please sign in to Zenith Pulse again"
                Log.w("ZenithSyncManager", "Sync aborted: no valid access token (refresh failed and no cached token).")
                return@withContext false
            }

            stage(SyncStage.AUTH, true)

            val manager = HealthConnectManager(context)
            val data = manager.fetchLatestHealthData()

            // Do NOT post a read that failed. Every readRecords() call sits in its own
            // try/catch, so a permission or availability failure used to fall through
            // as a payload of zeros - steps 0, sleep 0, empty history arrays - which is
            // indistinguishable from a genuine rest day once it reaches the server. 157
            // of 185 background syncs posted exactly that, and each returned success, so
            // nothing ever retried and nothing ever surfaced.
            //
            // The server's ingest happens to guard every write on `> 0`, so no real data
            // was overwritten. That is the ingest being defensive, not this being safe:
            // the sync should not be sending it.
            if (!data.readSucceeded) {
                stage(SyncStage.READ, false)
                val background = manager.hasBackgroundReadPermission()
                lastSyncStatus = if (!background) {
                    "⛔ Health Connect background access not granted — open Zenith Pulse and allow it, or sync manually"
                } else {
                    "⛔ Could not read Health Connect (${data.readErrors} record types failed)"
                }
                Log.w("ZenithSyncManager", "Sync aborted: unusable Health Connect read (errors=${data.readErrors}, backgroundPermission=$background). Nothing posted.")
                // Returning false so WorkManager retries rather than recording a success.
                return@withContext false
            }

            // Only cache a read that actually worked - overwriting this with zeros also
            // blanked the app's own display.
            stage(SyncStage.READ, true)
            cachedPayload = data

            val userEmail = UserAuthManager.getUserEmail(context) ?: ""
            val userId = UserAuthManager.getUserId(context) ?: ""

            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            val currentVersionName = packageInfo.versionName ?: "1.0.20"

            val innerPayloadJson = buildJsonObject {
                put("app_name", "Zenith Pulse")
                put("app_version", currentVersionName)
                put("user_email", userEmail)
                put("user_id", userId)
                put("timestamp", data.timestamp)
                put("local_date", data.localDate)
                put("steps_count", data.stepsCount)
                put("distance_withers", data.distanceMeters)
                put("elevation_gained_withers", data.elevationGainedMeters)
                put("active_calories", data.activeCaloriesBurned)
                put("total_calories", data.totalCaloriesBurned)
                put("bmr_calories", data.bmrCalories)
                put("heart_rate_bpm", data.latestHeartRate)
                put("resting_heart_rate_bpm", data.restingHeartRate)
                put("hrv_rmssd", data.latestHrvRmssd)
                put("sleep_minutes", data.sleepDurationMinutes)
                // The night's own date. The ingest prefers this over local_date so a
                // night is never filed under the day it was uploaded.
                put("sleep_local_date", data.sleepLocalDate)
                put("sleep_deep_minutes", data.sleepDeepMinutes)
                put("sleep_light_minutes", data.sleepLightMinutes)
                put("sleep_rem_minutes", data.sleepRemMinutes)
                put("sleep_awake_minutes", data.sleepAwakeMinutes)
                put("weight_kg", data.latestWeightKg)
                put("height_cm", data.heightCm)
                put("body_fat_percent", data.bodyFatPercent)
                put("body_water_percent", data.bodyWaterPercent)
                put("skeletal_muscle_percent", data.skeletalMusclePercent)
                put("lean_body_mass_kg", data.leanBodyMassKg)
                put("spo2_percent", data.latestSpO2)
                put("respiratory_rate", data.respiratoryRate)
                put("systolic_bp", data.systolicBp)
                put("diastolic_bp", data.diastolicBp)
                put("body_temp_celsius", data.bodyTempCelsius)
                put("hydration_ml", data.hydrationMl)
                put("avg_power_watts", data.avgPowerWatts)
                put("avg_speed_kmh", data.avgSpeedKmh)
                put("exercise_sessions_count", data.exerciseSessionsCount)
                // Full exercise sessions, not just the count. The server-side
                // ingest turns these into Stride activities - before this, the
                // only path that ever populated stride_activities from Health
                // Connect was the (now removed) LAN bridge, so dropping the
                // detail here silently ended workout sync to Stride.
                put("exercise_sessions", buildJsonArray {
                    for (ex in data.rawExerciseList) {
                        add(buildJsonObject {
                            put("type", (ex["type"] as? Int)?.toString() ?: (ex["type"] as? String) ?: "workout")
                            put("title", (ex["title"] as? String) ?: "Workout")
                            put("start_time", (ex["start_time"] as? String) ?: "")
                            // Local wall-clock start. Without it the ingest read the
                            // time in UTC, which put an evening session on the wrong
                            // hour and, near midnight, the wrong day.
                            put("start_local", (ex["start_local"] as? String) ?: "")
                            put("end_time", (ex["end_time"] as? String) ?: "")
                            put("duration_seconds", (ex["duration_seconds"] as? Long) ?: ((ex["duration_seconds"] as? Int)?.toLong()) ?: 0L)
                            put("distance_meters", (ex["distance_meters"] as? Double) ?: 0.0)
                            put("calories", (ex["calories"] as? Double) ?: 0.0)
                            put("avg_heart_rate", (ex["avg_heart_rate"] as? Int) ?: 0)
                            put("max_heart_rate", (ex["max_heart_rate"] as? Int) ?: 0)
                            put("steps", (ex["steps"] as? Long) ?: ((ex["steps"] as? Int)?.toLong()) ?: 0L)
                            put("data_origin", ((ex["metadata"] as? Map<*, *>)?.get("data_origin") as? String) ?: "")
                        })
                    }
                })
                put("daily_steps", buildJsonArray {
                    for (s in data.dailyStepsList) {
                        add(buildJsonObject {
                            put("date", (s["date"] as? String) ?: "")
                            put("steps", (s["steps"] as? Long) ?: ((s["steps"] as? Int)?.toLong()) ?: 0)
                        })
                    }
                })
                put("daily_sleep", buildJsonArray {
                    for (sl in data.dailySleepList) {
                        add(buildJsonObject {
                            put("date", (sl["date"] as? String) ?: "")
                            put("duration_minutes", (sl["duration_minutes"] as? Long) ?: ((sl["duration_minutes"] as? Int)?.toLong()) ?: 0)
                        })
                    }
                })
                put("daily_weight", buildJsonArray {
                    for (w in data.dailyWeightList) {
                        add(buildJsonObject {
                            put("date", (w["date"] as? String) ?: "")
                            put("weight_kg", (w["weight_kg"] as? Double) ?: ((w["weight_kg"] as? Float)?.toDouble()) ?: 0.0)
                        })
                    }
                })
            }.toString()

            val rpcBodyJson = buildJsonObject {
                put("timestamp", System.currentTimeMillis())
                put("synctype", syncType)
                put("datatype", "BIOMETRIC_FULL")
                put("recordcount", 1)
                put("payload", innerPayloadJson)
            }.toString()

            val response = httpClient.post(ZENITH_RPC_URL) {
                contentType(ContentType.Application.Json)
                headers {
                    append("apikey", SUPABASE_ANON_KEY)
                    append("Authorization", "Bearer $userAccessToken")
                }
                setBody(rpcBodyJson)
            }

            val bodyText = response.bodyAsText()
            lastSyncTimestamp = System.currentTimeMillis()

            if (response.status.value in 200..299) {
                stage(SyncStage.UPLOAD, true)
                lastSyncStatus = "Successfully synced with Zenith! (${data.stepsCount} steps)"
                Log.i("ZenithSyncManager", "Sync to Zenith Supabase succeeded: $bodyText")
                return@withContext true
            } else {
                stage(SyncStage.UPLOAD, false)
                lastSyncStatus = "Sync Error (HTTP ${response.status.value}): $bodyText"
                Log.w("ZenithSyncManager", "Sync failed with status ${response.status.value}: $bodyText")
                return@withContext false
            }
        } catch (e: Exception) {
            lastSyncStatus = "Error while syncing: ${e.localizedMessage}"
            Log.e("ZenithSyncManager", "Exception during Zenith sync", e)
            return@withContext false
        }
    }
}
