package com.example.pilot.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

object UpdateMaleager {
    private const val VERSION_URL = "https://raw.githubusercontent.com/filipmonbaillieu24-prog/Zenith/main/apk/version.json"
    private val client = OkHttpClient()

    suspend fun checkForUpdates(
        currentVersionCode: Int
    ): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url(VERSION_URL).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string() ?: return@withContext null
                val json = JSONObject(body)
                val remoteVersionCode = json.getInt("versionCode")
                val remoteVersionName = json.getString("versionName")
                val downloadUrl = json.getString("apkUrl")

                if (remoteVersionCode > currentVersionCode) {
                    return@withContext UpdateInfo(remoteVersionName, downloadUrl)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return@withContext null
    }

    suspend fun downloadAndInstallApk(
        context: Context,
        downloadUrl: String,
        onProgress: (Float) -> Unit,
        onError: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url(downloadUrl).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    withContext(Dispatchers.Main) { onError("Download failed with status code: ${response.code}") }
                    return@withContext
                }
                
                val body = response.body
                if (body == null) {
                    withContext(Dispatchers.Main) { onError("Bestand is leeg.") }
                    return@withContext
                }

                val contentLength = body.contentLength()
                val cacheFile = File(context.cacheDir, "app-update.apk")
                if (cacheFile.exists()) cacheFile.delete()

                val buffer = ByteArray(4096)
                var bytesRead: Int
                var totalBytesRead = 0L

                body.byteStream().use { inputStream ->
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
            }
        } catch (e: Exception) {
            e.printStackTrace()
            withContext(Dispatchers.Main) { onError(e.message ?: "Unknown error during download.") }
        }
    }

    private fun triggerInstallation(context: Context, apkFile: File) {
        try {
            val apkUri: Uri = FileProvider.getUriForFile(
                context,
                context.packageName + ".provider",
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
    val downloadUrl: String
)
