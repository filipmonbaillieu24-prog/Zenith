package com.zenith.pulse.auth

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
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
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

object UserAuthManager {

    private const val PREFS_NAME = "zenith_pulse_auth_prefs"
    private const val KEY_USER_EMAIL = "key_user_email"
    private const val KEY_USER_ID = "key_user_id"
    private const val KEY_ACCESS_TOKEN = "key_access_token"
    private const val KEY_REFRESH_TOKEN = "key_refresh_token"

    private const val SUPABASE_URL = "https://usvddplwtrelmqsecprp.supabase.co"
    private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdmRkcGx3dHJlbG1xc2VjcHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzAyMjksImV4cCI6MjEwMTE0NjIyOX0.WGLIaVq-7bzOQGtSpypApOBt1UyBeATnREmPgz8BacM"

    private val httpClient by lazy {
        HttpClient(OkHttp)
    }

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun isLoggedIn(context: Context): Boolean {
        val email = getUserEmail(context)
        return !email.isNullOrEmpty()
    }

    fun getUserEmail(context: Context): String? {
        return getPrefs(context).getString(KEY_USER_EMAIL, null)
    }

    fun getUserId(context: Context): String? {
        return getPrefs(context).getString(KEY_USER_ID, null)
    }

    fun getAccessToken(context: Context): String? {
        return getPrefs(context).getString(KEY_ACCESS_TOKEN, null)
    }

    fun getRefreshToken(context: Context): String? {
        return getPrefs(context).getString(KEY_REFRESH_TOKEN, null)
    }

    fun saveUserAccount(
        context: Context,
        email: String,
        userId: String = "",
        accessToken: String = "",
        refreshToken: String = ""
    ) {
        val editor = getPrefs(context).edit()
            .putString(KEY_USER_EMAIL, email.trim().lowercase())
            .putString(KEY_USER_ID, userId.ifEmpty { email.trim().lowercase() })
            .putString(KEY_ACCESS_TOKEN, accessToken)
        // Only overwrite a stored refresh token when a new one was actually issued -
        // e.g. a bare access-token refresh (see refreshAccessToken below) must not
        // wipe out the refresh token it was itself supplied with.
        if (refreshToken.isNotEmpty()) {
            editor.putString(KEY_REFRESH_TOKEN, refreshToken)
        }
        editor.apply()
        Log.i("UserAuthManager", "Saved user account for: $email")
    }

    /**
     * Exchanges the stored refresh token for a fresh access token. Zenith Pulse's
     * background sync runs hourly and Supabase access tokens are short-lived, so this
     * is called before every sync (see ZenithSyncManager) rather than tracking token
     * expiry locally - simpler and immune to clock-skew bugs. Returns the fresh access
     * token, or null if there's no refresh token stored or the refresh itself fails
     * (e.g. the session was revoked), in which case the caller should prompt re-login.
     */
    suspend fun refreshAccessToken(context: Context): String? = withContext(Dispatchers.IO) {
        val refreshToken = getRefreshToken(context)
        if (refreshToken.isNullOrEmpty()) {
            return@withContext null
        }

        try {
            val response = httpClient.post("$SUPABASE_URL/auth/v1/token?grant_type=refresh_token") {
                contentType(ContentType.Application.Json)
                headers {
                    append("apikey", SUPABASE_ANON_KEY)
                }
                setBody(kotlinx.serialization.json.buildJsonObject {
                    put("refresh_token", kotlinx.serialization.json.JsonPrimitive(refreshToken))
                }.toString())
            }

            if (response.status.value !in 200..299) {
                Log.w("UserAuthManager", "Token refresh failed with status ${response.status.value}")
                return@withContext null
            }

            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val newAccessToken = json["access_token"]?.jsonPrimitive?.content
            val newRefreshToken = json["refresh_token"]?.jsonPrimitive?.content

            if (newAccessToken.isNullOrEmpty()) {
                return@withContext null
            }

            val email = getUserEmail(context) ?: ""
            val userId = getUserId(context) ?: ""
            saveUserAccount(context, email, userId, newAccessToken, newRefreshToken ?: "")
            newAccessToken
        } catch (e: Exception) {
            Log.e("UserAuthManager", "Token refresh exception", e)
            null
        }
    }

    fun logout(context: Context) {
        getPrefs(context).edit().clear().apply()
        Log.i("UserAuthManager", "Cleared user session")
    }

    suspend fun loginWithSupabase(context: Context, emailInput: String, passwordInput: String): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val email = emailInput.trim().lowercase()
        val password = passwordInput.trim()

        if (email.isEmpty() || password.isEmpty()) {
            return@withContext Pair(false, "Please enter email address and password.")
        }

        try {
            val payloadObj = kotlinx.serialization.json.buildJsonObject {
                put("email", kotlinx.serialization.json.JsonPrimitive(email))
                put("password", kotlinx.serialization.json.JsonPrimitive(password))
            }

            val jsonBody = payloadObj.toString()

            val response = httpClient.post("$SUPABASE_URL/auth/v1/token?grant_type=password") {
                contentType(ContentType.Application.Json)
                headers {
                    append("apikey", SUPABASE_ANON_KEY)
                    append("Authorization", "Bearer $SUPABASE_ANON_KEY")
                }
                setBody(jsonBody)
            }

            val bodyText = response.bodyAsText()
            Log.d("UserAuthManager", "Supabase Auth status: ${response.status.value}, body: $bodyText")

            if (response.status.value in 200..299) {
                val json = Json.parseToJsonElement(bodyText).jsonObject
                val accessToken = json["access_token"]?.jsonPrimitive?.content ?: ""
                val refreshToken = json["refresh_token"]?.jsonPrimitive?.content ?: ""
                val userObj = json["user"]?.jsonObject
                val userId = userObj?.get("id")?.jsonPrimitive?.content ?: email
                val userEmail = userObj?.get("email")?.jsonPrimitive?.content ?: email

                saveUserAccount(context, userEmail, userId, accessToken, refreshToken)
                return@withContext Pair(true, "Successfully logged in as $userEmail!")
            } else {
                val errorReason = try {
                    val json = Json.parseToJsonElement(bodyText).jsonObject
                    val msg = json["msg"]?.jsonPrimitive?.content
                        ?: json["error_description"]?.jsonPrimitive?.content
                        ?: json["message"]?.jsonPrimitive?.content
                        ?: json["error"]?.jsonPrimitive?.content
                    if (msg == "Invalid login credentials") {
                        "Invalid login credentials. Please check your email and password."
                    } else {
                        msg ?: "Error ${response.status.value}"
                    }
                } catch (e: Exception) {
                    "Status ${response.status.value}"
                }

                Log.w("UserAuthManager", "Supabase auth failed: $errorReason")
                return@withContext Pair(false, "Login failed: $errorReason")
            }
        } catch (e: Exception) {
            Log.e("UserAuthManager", "Auth exception", e)
            return@withContext Pair(false, "Connection error: ${e.localizedMessage}")
        }
    }
}
