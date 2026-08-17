package com.zenith.pulse.data

import android.content.Context
import android.util.Log
import com.zenith.pulse.sync.ZenithSyncManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.ServerSocket
import java.net.Socket

object LocalHttpServer {

    private const val PORT = 8787
    private var isRunning = false
    private var serverSocket: ServerSocket? = null

    fun startServer(context: Context) {
        if (isRunning) return
        isRunning = true

        CoroutineScope(Dispatchers.IO).launch {
            try {
                serverSocket = ServerSocket(PORT)
                Log.i("LocalHttpServer", "Zenith Pulse Local HTTP Server running on port $PORT")

                while (isRunning && serverSocket?.isClosed == false) {
                    val clientSocket = serverSocket?.accept() ?: break
                    handleClient(clientSocket)
                }
            } catch (e: Exception) {
                Log.e("LocalHttpServer", "Local HTTP Server stopped or failed", e)
            } finally {
                isRunning = false
            }
        }
    }

    private fun handleClient(socket: Socket) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
                val writer = PrintWriter(socket.getOutputStream(), true)

                val requestLine = reader.readLine() ?: return@launch
                val path = requestLine.split(" ").getOrNull(1) ?: "/"

                val jsonResponse = when {
                    path.startsWith("/ping") -> {
                        buildJsonObject {
                            put("status", "online")
                            put("app", "Zenith Pulse")
                            put("app_version", "1.0.0")
                            put("uptime_ms", System.currentTimeMillis())
                        }.toString()
                    }
                    path.startsWith("/latest") -> {
                        val payload = ZenithSyncManager.cachedPayload
                        buildJsonObject {
                            put("app_version", "1.0.0")
                            put("timestamp", payload.timestamp)
                            put("steps", buildJsonArray {
                                for (s in payload.rawStepsList) {
                                    add(buildJsonObject {
                                        put("count", (s["count"] as? Long) ?: 0)
                                        put("start_time", (s["start_time"] as? String) ?: "")
                                        put("end_time", (s["end_time"] as? String) ?: "")
                                    })
                                }
                            })
                            put("sleep", buildJsonArray {
                                for (sl in payload.rawSleepList) {
                                    add(buildJsonObject {
                                        put("session_end_time", (sl["session_end_time"] as? String) ?: "")
                                        put("duration_seconds", (sl["duration_seconds"] as? Long) ?: 0)
                                    })
                                }
                            })
                            put("exercise", buildJsonArray {
                                for (ex in payload.rawExerciseList) {
                                    add(buildJsonObject {
                                        put("type", (ex["type"] as? String) ?: "workout")
                                        put("start_time", (ex["start_time"] as? String) ?: "")
                                        put("end_time", (ex["end_time"] as? String) ?: "")
                                        put("duration_seconds", (ex["duration_seconds"] as? Long) ?: 0)
                                    })
                                }
                            })
                            put("active_calories_kcal", payload.activeCaloriesBurned)
                            put("latest_heart_rate_bpm", payload.latestHeartRate)
                            put("latest_hrv_rmssd", payload.latestHrvRmssd)
                        }.toString()
                    }
                    else -> {
                        buildJsonObject {
                            put("service", "Zenith Pulse Local HTTP Bridge")
                            put("status", "ok")
                            put("port", PORT)
                        }.toString()
                    }
                }

                val httpResponse = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: application/json\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Content-Length: ${jsonResponse.toByteArray().size}\r\n" +
                        "\r\n" +
                        jsonResponse

                writer.print(httpResponse)
                writer.flush()
                socket.close()
            } catch (e: Exception) {
                Log.w("LocalHttpServer", "Error serving client request", e)
            }
        }
    }

    fun stopServer() {
        isRunning = false
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            Log.w("LocalHttpServer", "Error closing server socket", e)
        }
    }
}
