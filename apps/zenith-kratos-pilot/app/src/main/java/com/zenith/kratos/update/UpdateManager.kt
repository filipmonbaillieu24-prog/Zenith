package com.zenith.kratos.update

import android.content.Context
import android.util.Log
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

object UpdateManager {
    private const val TAG = "KratosUpdateManager"
    private const val VERSION_URL = "https://raw.githubusercontent.com/filipmonbaillieu24-prog/Zenith/main/apk/kratos-version.json"

    suspend fun checkForUpdates(currentVersionCode: Int): UpdateInfo? = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            // raw.githubusercontent.com is served through a CDN that caches responses by
            // URL - a static URL here could keep returning a stale versionCode long after
            // a new release lands on main, silently hiding every update from this device.
            // Cache-bust with a timestamp query param and disable caching explicitly.
            val url = URL("$VERSION_URL?t=${System.currentTimeMillis()}")
            connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate")
            connection.setRequestProperty("Pragma", "no-cache")
            connection.instanceFollowRedirects = true
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.connect()

            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val text = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(text)
                val remoteVersionCode = json.getInt("versionCode")
                val remoteVersionName = json.getString("versionName")
                val downloadUrl = json.getString("apkUrl")
                // Required, not optional: an update manifest without a digest is
                // treated as unusable rather than installed unverified.
                val expectedSha256 = json.optString("sha256", "").trim().lowercase()

                if (remoteVersionCode > currentVersionCode) {
                    if (expectedSha256.length != 64) {
                        Log.w(TAG, "Update $remoteVersionName has no usable sha256 digest; refusing to offer it.")
                        return@withContext null
                    }
                    return@withContext UpdateInfo(remoteVersionName, downloadUrl, expectedSha256)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            connection?.disconnect()
        }
        return@withContext null
    }

    suspend fun downloadAndInstallApk(
        context: Context,
        downloadUrl: String,
        expectedSha256: String,
        onProgress: (Float) -> Unit,
        onError: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val url = URL(downloadUrl)
            connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.connect()

            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                withContext(Dispatchers.Main) { onError("Download failed with status code: ${connection.responseCode}") }
                return@withContext
            }

            val contentLength = connection.contentLength
            val cacheFile = File(context.cacheDir, "kratos-app-update.apk")
            if (cacheFile.exists()) cacheFile.delete()

            val buffer = ByteArray(4096)
            var bytesRead: Int
            var totalBytesRead = 0L

            BufferedInputStream(connection.inputStream).use { inputStream ->
                FileOutputStream(cacheFile).use { outputStream ->
                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        outputStream.write(buffer, 0, bytesRead)
                        totalBytesRead += bytesRead
                        if (contentLength > 0) {
                            val progress = totalBytesRead.toFloat() / contentLength.toFloat()
                            withContext(Dispatchers.Main) { onProgress(progress) }
                        }
                    }
                }
            }

            // Verify before handing anything to the package installer. The APK is
            // fetched over HTTPS from a public repo and installed via
            // REQUEST_INSTALL_PACKAGES; without this check, anyone able to serve a
            // different file at that URL (a compromised repo/account, a proxy that
            // strips TLS) gets arbitrary code execution on the device.
            val actualSha256 = sha256Of(cacheFile)
            if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                cacheFile.delete()
                Log.e(TAG, "APK digest mismatch: expected $expectedSha256, got $actualSha256")
                withContext(Dispatchers.Main) {
                    onError("This update failed its integrity check and was not installed.")
                }
                return@withContext
            }

            withContext(Dispatchers.Main) {
                triggerInstallation(context, cacheFile)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            withContext(Dispatchers.Main) { onError(e.message ?: "Unknown error during download.") }
        } finally {
            connection?.disconnect()
        }
    }

    private fun sha256Of(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun triggerInstallation(context: Context, apkFile: File) {
        try {
            val apkUri: Uri = FileProvider.getUriForFile(
                context,
                "com.zenith.kratos.provider",
                apkFile
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}

data class UpdateInfo(
    val versionName: String,
    val downloadUrl: String,
    /** Lowercase hex SHA-256 of the APK named by [downloadUrl]. */
    val sha256: String
)
