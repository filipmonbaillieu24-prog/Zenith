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

object ZenithSyncManager {

    private const val ZENITH_RPC_URL =
        "https://usvddplwtrelmqsecprp.supabase.co/rest/v1/rpc/health_connect_ingest"

    private const val SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdmRkcGx3dHJlbG1xc2VjcHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzAyMjksImV4cCI6MjEwMTE4NjIyOX0.WGLIaVq-7bzOQGtSpypApOBt1UyBeATnREmPgz8BacM"

    private const val VALID_SUPABASE_ANON_KEY =
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
    var lastSyncStatus: String = "Nooit gesynchroniseerd"
        private set

    suspend fun performSync(context: Context): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!UserAuthManager.isLoggedIn(context)) {
                lastSyncStatus = "⛔ Inloggen verplicht: Geen gekoppeld Zenith account"
                Log.w("ZenithSyncManager", "Sync aborted: user not logged in.")
                return@withContext false
            }

            val manager = HealthConnectManager(context)
            val data = manager.fetchLatestHealthData()
            cachedPayload = data

            val userEmail = UserAuthManager.getUserEmail(context) ?: ""
            val userId = UserAuthManager.getUserId(context) ?: ""

            val innerPayloadJson = buildJsonObject {
                put("app_name", "Zenith Pulse")
                put("app_version", "1.0.11")
                put("user_email", userEmail)
                put("user_id", userId)
                put("timestamp", data.timestamp)
                put("steps_count", data.stepsCount)
                put("active_calories", data.activeCaloriesBurned)
                put("heart_rate_bpm", data.latestHeartRate)
                put("hrv_rmssd", data.latestHrvRmssd)
                put("sleep_minutes", data.sleepDurationMinutes)
                put("weight_kg", data.latestWeightKg)
                put("spo2_percent", data.latestSpO2)
                put("exercise_sessions_count", data.exerciseSessionsCount)
            }.toString()

            val rpcBodyJson = buildJsonObject {
                put("timestamp", System.currentTimeMillis())
                put("synctype", "MANUAL")
                put("datatype", "BIOMETRIC_FULL")
                put("recordcount", 1)
                put("payload", innerPayloadJson)
            }.toString()

            val response = httpClient.post(ZENITH_RPC_URL) {
                contentType(ContentType.Application.Json)
                headers {
                    append("apikey", VALID_SUPABASE_ANON_KEY)
                    append("Authorization", "Bearer $VALID_SUPABASE_ANON_KEY")
                }
                setBody(rpcBodyJson)
            }

            val bodyText = response.bodyAsText()
            lastSyncTimestamp = System.currentTimeMillis()

            if (response.status.value in 200..299) {
                lastSyncStatus = "Succesvol gesynchroniseerd met Zenith! (${data.stepsCount} stappen)"
                Log.i("ZenithSyncManager", "Sync to Zenith Supabase succeeded: $bodyText")
                return@withContext true
            } else {
                lastSyncStatus = "Sync Fout (HTTP ${response.status.value}): $bodyText"
                Log.w("ZenithSyncManager", "Sync failed with status ${response.status.value}: $bodyText")
                return@withContext false
            }
        } catch (e: Exception) {
            lastSyncStatus = "Fout bij synchroniseren: ${e.localizedMessage}"
            Log.e("ZenithSyncManager", "Exception during Zenith sync", e)
            return@withContext false
        }
    }
}
