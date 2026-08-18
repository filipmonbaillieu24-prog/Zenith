package com.zenith.pulse.update

import android.content.Context
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

data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val downloadUrl: String
)

object UpdateManager {

    private const val PULSE_VERSION_URL =
        "https://raw.githubusercontent.com/filipmonbaillieu24-prog/Zenith/main/apk/pulse-version.json"

    suspend fun checkForUpdates(currentVersionCode: Int): UpdateInfo? = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val url = URL("$PULSE_VERSION_URL?t=${System.currentTimeMillis()}")
            connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate")
            connection.setRequestProperty("Pragma", "no-cache")
            connection.instanceFollowRedirects = true
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.connect()

            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val text = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(text)
                val remoteVersionCode = json.getInt("versionCode")
                val remoteVersionName = json.getString("versionName")
                val downloadUrl = json.getString("apkUrl")

                if (remoteVersionCode > currentVersionCode) {
                    return@withContext UpdateInfo(remoteVersionCode, remoteVersionName, downloadUrl)
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
        onProgress: (Float) -> Unit,
        onError: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            var currentUrl = downloadUrl
            var redirectCount = 0
            var responseCode: Int

            do {
                val url = URL(currentUrl)
                connection = url.openConnection() as HttpURLConnection
                connection.instanceFollowRedirects = true
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                connection.connect()

                responseCode = connection.responseCode
                if (responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                    responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                    responseCode == 307 ||
                    responseCode == 308) {
                    val location = connection.getHeaderField("Location")
                    connection.disconnect()
                    currentUrl = location ?: break
                    redirectCount++
                } else {
                    break
                }
            } while (redirectCount < 5)

            if (responseCode != HttpURLConnection.HTTP_OK) {
                withContext(Dispatchers.Main) { onError("Download failed with HTTP $responseCode") }
                return@withContext
            }

            val contentLength = connection.contentLength
            val cacheFile = File(context.cacheDir, "pulse-app-update.apk")
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

            withContext(Dispatchers.Main) {
                triggerInstallation(context, cacheFile)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            withContext(Dispatchers.Main) { onError(e.message ?: "Update download error.") }
        } finally {
            connection?.disconnect()
        }
    }

    private fun triggerInstallation(context: Context, apkFile: File) {
        try {
            val apkUri: Uri = FileProvider.getUriForFile(
                context,
                "com.zenith.pulse.fileprovider",
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
