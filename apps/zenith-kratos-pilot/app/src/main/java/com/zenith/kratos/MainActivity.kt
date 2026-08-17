package com.zenith.kratos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zenith.kratos.ui.theme.KratosPilotTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val prefs = getSharedPreferences("kratos_crashes", MODE_PRIVATE)
        val lastCrash = prefs.getString("last_crash", null)
        
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            val sw = java.io.StringWriter()
            val pw = java.io.PrintWriter(sw)
            throwable.printStackTrace(pw)
            prefs.edit().putString("last_crash", sw.toString()).commit()
            android.os.Process.killProcess(android.os.Process.myPid())
            java.lang.System.exit(10)
        }

        enableEdgeToEdge()
        setContent {
            KratosPilotTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    if (lastCrash != null) {
                        CrashScreen(
                            stackTrace = lastCrash,
                            onClear = {
                                prefs.edit().remove("last_crash").commit()
                                finish()
                                startActivity(intent)
                            },
                            onResetDb = {
                                try {
                                    deleteDatabase("kratos_database")
                                    prefs.edit().remove("last_crash").commit()
                                    finish()
                                    startActivity(intent)
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }
                            }
                        )
                    } else {
                        MainNavigation()
                    }
                }
            }
        }
    }
}

@Composable
fun CrashScreen(stackTrace: String, onClear: () -> Unit, onResetDb: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF09090B))
            .padding(24.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = "Kratos is gecrasht",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "An unexpected error occurred. Error details below:",
                    color = Color(0xFF94A3B8),
                    fontSize = 13.sp
                )
                Spacer(modifier = Modifier.height(16.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(350.dp)
                        .background(Color(0xFF1C1C23), RoundedCornerShape(8.dp))
                        .padding(12.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    Text(
                        text = stackTrace,
                        color = Color(0xFFEF4444),
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onClear,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFCBD5E1), contentColor = Color(0xFF09090B))
                ) {
                    Text("Probeer Opnieuw", fontWeight = FontWeight.Bold)
                }
                Button(
                    onClick = onResetDb,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444), contentColor = Color.White)
                ) {
                    Text("Reset Database & Start Opnieuw", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
