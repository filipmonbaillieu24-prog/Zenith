package com.zenith.pulse.data

import android.content.Context
import android.util.Log
import com.zenith.pulse.auth.UserAuthManager
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.client.statement.HttpResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.Period

/**
 * Age, sex and height, read from the athlete's Zenith profile.
 *
 * The scale measures two things: weight and impedance. Body fat is not one of them -
 * it is calculated from impedance together with these three, which is why the field
 * sat empty however well the protocol worked. They live in `profiles` on the server
 * and the app already holds a token that can read that row.
 *
 * Cached locally, because a weigh-in should not depend on having signal in the
 * bathroom.
 */
data class ZenithProfile(
    val birthDate: LocalDate?,
    /** "male" / "female" as stored; anything else is treated as unknown. */
    val gender: String?,
    val heightCm: Double?
) {
    val ageYears: Int?
        get() = birthDate?.let { Period.between(it, LocalDate.now()).years.takeIf { y -> y in 5..120 } }

    val isMale: Boolean?
        get() = when (gender?.lowercase()?.trim()) {
            "male", "man", "m" -> true
            "female", "woman", "f", "vrouw" -> false
            else -> null
        }

    /** Everything the body-composition estimate needs. */
    val isComplete: Boolean
        get() = heightCm != null && heightCm > 100 && isMale != null
}

object ZenithProfileStore {

    private const val PREFS = "zenith_profile"
    private const val KEY_BIRTH = "birth_date"
    private const val KEY_GENDER = "gender"
    private const val KEY_HEIGHT = "height_cm"

    private const val SUPABASE_URL = "https://usvddplwtrelmqsecprp.supabase.co"
    private const val SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdmRkcGx3dHJlbG1xc2VjcHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzAyMjksImV4cCI6MjEwMTE0NjIyOX0.WGLIaVq-7bzOQGtSpypApOBt1UyBeATnREmPgz8BacM"

    private val httpClient = HttpClient(OkHttp)
    private val json = Json { ignoreUnknownKeys = true }

    fun cached(context: Context): ZenithProfile {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val birth = prefs.getString(KEY_BIRTH, null)?.takeIf { it.isNotBlank() }
        return ZenithProfile(
            birthDate = birth?.let { runCatching { LocalDate.parse(it) }.getOrNull() },
            gender = prefs.getString(KEY_GENDER, null),
            heightCm = prefs.getFloat(KEY_HEIGHT, 0f).toDouble().takeIf { it > 0 }
        )
    }

    /**
     * Refreshes from the server, returning the cached copy unchanged on any failure.
     *
     * A profile that cannot be fetched must not blank the one already stored: the
     * common case for a failure here is a phone with no signal, and that is exactly
     * when the athlete is standing on the scale.
     */
    suspend fun refresh(context: Context): ZenithProfile = withContext(Dispatchers.IO) {
        val userId = UserAuthManager.getUserId(context)
        val token = UserAuthManager.getAccessToken(context)
        if (userId.isNullOrBlank() || token.isNullOrBlank()) return@withContext cached(context)

        try {
            val response: HttpResponse = httpClient.get(
                "$SUPABASE_URL/rest/v1/profiles?id=eq.$userId&select=birth_date,gender,height_cm"
            ) {
                headers {
                    append("apikey", SUPABASE_ANON_KEY)
                    append("Authorization", "Bearer $token")
                }
            }
            if (response.status != HttpStatusCode.OK) {
                Log.w("ZenithProfile", "Profile fetch returned ${response.status}")
                return@withContext cached(context)
            }

            val rows = json.parseToJsonElement(response.bodyAsText()).jsonArray
            if (rows.isEmpty()) return@withContext cached(context)
            val row = rows[0].jsonObject

            fun str(key: String): String? =
                row[key]?.jsonPrimitive?.takeIf { !it.toString().equals("null", true) }?.content

            val birth = str("birth_date")
            val gender = str("gender")
            val height = str("height_cm")?.toDoubleOrNull()

            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY_BIRTH, birth ?: "")
                .putString(KEY_GENDER, gender ?: "")
                .putFloat(KEY_HEIGHT, (height ?: 0.0).toFloat())
                .apply()

            ZenithProfile(
                birthDate = birth?.let { runCatching { LocalDate.parse(it) }.getOrNull() },
                gender = gender,
                heightCm = height
            )
        } catch (e: Exception) {
            Log.w("ZenithProfile", "Profile fetch failed: ${e.message}")
            cached(context)
        }
    }
}

/**
 * Body composition from a foot-to-foot impedance reading.
 *
 * Fat-free mass comes from Sun et al. (2003), the NHANES III equations - developed on
 * 1,829 adults against a four-compartment model, and one of the few widely validated
 * sets that needs only resistance, height, weight and sex. Reactance is not available
 * from a scale you stand on, which rules out the equations that use it.
 *
 * Body fat is then what is left: weight minus fat-free mass. It is an estimate and
 * says so wherever it is shown. The scale's own app will disagree by a few points,
 * because it uses a proprietary equation nobody has published - neither figure is the
 * truth a DXA scan would give.
 *
 * Water, muscle and bone are deliberately absent. Each needs its own validated
 * equation, and inventing three more numbers to fill the boxes would make the screen
 * look complete while making it less true.
 */
object BodyComposition {

    data class Estimate(
        val fatFreeMassKg: Double,
        val bodyFatPercent: Double
    )

    /** Sun et al. 2003, NHANES III. Height in cm, resistance in ohms. */
    fun estimate(
        weightKg: Double,
        heightCm: Double,
        resistanceOhms: Double,
        isMale: Boolean
    ): Estimate? {
        if (weightKg < 20 || weightKg > 300) return null
        if (heightCm < 100 || heightCm > 250) return null
        // A foot-to-foot scale reads somewhere around 300-900 ohms for an adult.
        // Outside that the reading is not impedance and the equation is meaningless.
        if (resistanceOhms < 150 || resistanceOhms > 1200) return null

        val h2r = (heightCm * heightCm) / resistanceOhms
        val ffm = if (isMale) {
            -10.68 + 0.65 * h2r + 0.26 * weightKg + 0.02 * resistanceOhms
        } else {
            -9.53 + 0.69 * h2r + 0.17 * weightKg + 0.02 * resistanceOhms
        }

        // A fat-free mass above the measured weight, or implying a body fat outside
        // what a living adult carries, means an input was wrong. Report nothing rather
        // than a number that is merely arithmetic.
        if (ffm <= 0 || ffm >= weightKg) return null
        val fatPercent = ((weightKg - ffm) / weightKg) * 100.0
        if (fatPercent < 3 || fatPercent > 65) return null

        return Estimate(
            fatFreeMassKg = Math.round(ffm * 10) / 10.0,
            bodyFatPercent = Math.round(fatPercent * 10) / 10.0
        )
    }
}
