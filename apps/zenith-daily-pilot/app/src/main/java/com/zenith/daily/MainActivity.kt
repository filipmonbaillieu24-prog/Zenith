package com.zenith.daily

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.zenith.daily.data.*
import com.zenith.daily.ui.screens.*
import com.zenith.daily.ui.theme.*
import com.zenith.daily.update.UpdateInfo
import com.zenith.daily.update.UpdateManager
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private lateinit var repository: DailyRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = DailyRepository(applicationContext)

        lifecycleScope.launch {
            repository.seedDefaultFoodItemsIfEmpty()
        }

        val prefs = applicationContext.getSharedPreferences("zenith_daily_auth", Context.MODE_PRIVATE)
        val savedEmail = prefs.getString("user_email", null)

        val currentVersionCode = try {
            val pInfo = applicationContext.packageManager.getPackageInfo(applicationContext.packageName, 0)
            pInfo.versionCode
        } catch (e: Exception) {
            1
        }

        setContent {
            ZenithDailyTheme {
                var currentUserEmail by remember { mutableStateOf(savedEmail) }

                // Auto-Update State
                var availableUpdate by remember { mutableStateOf<UpdateInfo?>(null) }
                var downloadProgress by remember { mutableStateOf<Float?>(null) }
                var isDownloading by remember { mutableStateOf(false) }
                var updateError by remember { mutableStateOf<String?>(null) }
                val scope = rememberCoroutineScope()
                val context = LocalContext.current

                // Automatic Update Check on App Startup
                LaunchedEffect(Unit) {
                    val info = UpdateManager.checkForUpdates(currentVersionCode)
                    if (info != null) {
                        availableUpdate = info
                    }
                }

                Box(modifier = Modifier.fillMaxSize()) {
                    if (currentUserEmail == null) {
                        LoginScreen(
                            onLoginSuccess = { email ->
                                prefs.edit().putString("user_email", email).apply()
                                currentUserEmail = email
                            },
                            onSkipLogin = {
                                prefs.edit().putString("user_email", "gast@zenith.app").apply()
                                currentUserEmail = "gast@zenith.app"
                            }
                        )
                    } else {
                        MainAppScreen(
                            repository = repository,
                            userEmail = currentUserEmail!!,
                            onLogout = {
                                prefs.edit().remove("user_email").apply()
                                currentUserEmail = null
                            }
                        )
                    }

                    // Auto-Update Modal Dialog
                    availableUpdate?.let { info ->
                        AlertDialog(
                            onDismissRequest = { /* Require update action */ },
                            containerColor = ZenithCardBg,
                            title = {
                                Text(
                                    text = "🚀 NIEUWE UPDATE BESCHIKBAAR",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Black,
                                    color = ZenithTextPrimary
                                )
                            },
                            text = {
                                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Text(
                                        text = "Er is een nieuwe versie van Zenith Daily beschikbaar (v${info.versionName}).",
                                        fontSize = 12.sp,
                                        color = ZenithSecondary,
                                        lineHeight = 16.sp
                                    )

                                    if (isDownloading) {
                                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Text(
                                                text = "Update downloaden... ${((downloadProgress ?: 0f) * 100).toInt()}%",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = ZenithPrimary
                                            )
                                            LinearProgressIndicator(
                                                progress = { downloadProgress ?: 0f },
                                                color = ZenithPrimary,
                                                trackColor = ZenithSurface,
                                                modifier = Modifier.fillMaxWidth().height(8.dp)
                                            )
                                        }
                                    }

                                    updateError?.let { err ->
                                        Text(
                                            text = err,
                                            fontSize = 11.sp,
                                            color = ZenithError,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            },
                            confirmButton = {
                                Button(
                                    onClick = {
                                        isDownloading = true
                                        updateError = null
                                        scope.launch {
                                            UpdateManager.downloadAndInstallApk(
                                                context = context,
                                                downloadUrl = info.downloadUrl,
                                                onProgress = { p -> downloadProgress = p },
                                                onError = { err ->
                                                    isDownloading = false
                                                    updateError = err
                                                }
                                            )
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = ZenithPrimary, contentColor = ZenithBackground),
                                    enabled = !isDownloading,
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Text(
                                        text = if (isDownloading) "BEZIG MET DOWNLOADEN..." else "NU AUTOMATISCH UPDATEN",
                                        fontWeight = FontWeight.Black,
                                        fontSize = 12.sp
                                    )
                                }
                            },
                            dismissButton = {
                                if (!isDownloading) {
                                    TextButton(onClick = { availableUpdate = null }) {
                                        Text("LATER", color = ZenithSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainAppScreen(
    repository: DailyRepository,
    userEmail: String,
    onLogout: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var selectedTab by remember { mutableStateOf(0) } // 0: Vandaag, 1: Voeding, 2: Gezondheid

    val todayMeals by repository.getTodayMealLogsFlow().collectAsState(initial = emptyList())
    val weights by repository.weightsFlow.collectAsState(initial = emptyList())
    val foodItems by repository.foodItemsFlow.collectAsState(initial = emptyList())

    val macroGoals = remember { MacroGoals(dailyCalorieTarget = 2400, proteinTargetG = 180.0, carbsTargetG = 250.0, fatTargetG = 70.0) }
    var healthSnapshot by remember { mutableStateOf(HealthConnectSnapshot(stepsCount = 8420, activeCaloriesBurned = 420, isConnected = true)) }

    // Quick Action Modals
    var showGlobalWeightModal by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "ZENITH DAILY",
                            style = LocalTextStyle.current.copy(
                                fontWeight = FontWeight.Black,
                                letterSpacing = 2.sp,
                                fontSize = 16.sp,
                                color = ZenithTextPrimary
                            )
                        )
                        Text(
                            text = userEmail,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = ZenithPrimary,
                            letterSpacing = 0.5.sp
                        )
                    }
                },
                actions = {
                    TextButton(onClick = onLogout) {
                        Text("UITLOGGEN", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ZenithSecondary)
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = ZenithBackground
                )
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = ZenithSurface,
                contentColor = ZenithTextPrimary,
                tonalElevation = 8.dp
            ) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Text("🏠", fontSize = 18.sp) },
                    label = { Text("Vandaag", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = ZenithPrimary,
                        selectedTextColor = ZenithPrimary,
                        unselectedIconColor = ZenithSecondary,
                        unselectedTextColor = ZenithSecondary,
                        indicatorColor = ZenithPrimary.copy(alpha = 0.15f)
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Text("🥗", fontSize = 18.sp) },
                    label = { Text("Voeding", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = ZenithPrimary,
                        selectedTextColor = ZenithPrimary,
                        unselectedIconColor = ZenithSecondary,
                        unselectedTextColor = ZenithSecondary,
                        indicatorColor = ZenithPrimary.copy(alpha = 0.15f)
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Text("⚖️", fontSize = 18.sp) },
                    label = { Text("Gezondheid", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = ZenithPrimary,
                        selectedTextColor = ZenithPrimary,
                        unselectedIconColor = ZenithSecondary,
                        unselectedTextColor = ZenithSecondary,
                        indicatorColor = ZenithPrimary.copy(alpha = 0.15f)
                    )
                )
            }
        },
        containerColor = ZenithBackground
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (selectedTab) {
                0 -> TodayScreen(
                    todayMeals = todayMeals,
                    weights = weights,
                    macroGoals = macroGoals,
                    healthSnapshot = healthSnapshot,
                    onOpenLogWeightModal = { showGlobalWeightModal = true },
                    onOpenLogMealModal = { selectedTab = 1 }
                )
                1 -> FuelScreen(
                    todayMeals = todayMeals,
                    foodItems = foodItems,
                    onAddMealLog = { mealType, foodName, cals, prot, carbs, fat, servings ->
                        scope.launch {
                            repository.saveMealLog(mealType, foodName, cals, prot, carbs, fat, servings)
                        }
                    },
                    onDeleteMealLog = { id ->
                        scope.launch {
                            repository.deleteMealLog(id)
                        }
                    },
                    onAddCustomFood = { name, brand, serving, cals, prot, carbs, fat, barcode ->
                        scope.launch {
                            val item = repository.addCustomFoodItem(name, brand, serving, cals, prot, carbs, fat, barcode)
                            repository.saveMealLog("Lunch", item.name, item.calories, item.proteinG, item.carbsG, item.fatG, 1.0)
                        }
                    },
                    onSearchBarcode = { barcode ->
                        repository.lookupBarcode(barcode)
                    }
                )
                2 -> VigorScreen(
                    weights = weights,
                    healthSnapshot = healthSnapshot,
                    onSaveWeight = { w, fat ->
                        scope.launch {
                            repository.saveWeight(w, fat)
                        }
                    },
                    onDeleteWeight = { id ->
                        scope.launch {
                            repository.deleteWeight(id)
                        }
                    },
                    onRequestHealthPermissions = {
                        healthSnapshot = healthSnapshot.copy(isConnected = true)
                    }
                )
            }

            // Global Weight Entry Modal
            if (showGlobalWeightModal) {
                var weightInput by remember { mutableStateOf("") }
                var fatInput by remember { mutableStateOf("") }

                AlertDialog(
                    onDismissRequest = { showGlobalWeightModal = false },
                    containerColor = ZenithCardBg,
                    title = { Text("Snel Gewicht Loggen", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = ZenithTextPrimary) },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = weightInput,
                                onValueChange = { weightInput = it },
                                label = { Text("Gewicht in kg (bijv. 81.4)", color = ZenithSecondary) },
                                modifier = Modifier.fillMaxWidth()
                            )
                            OutlinedTextField(
                                value = fatInput,
                                onValueChange = { fatInput = it },
                                label = { Text("Vet % (Optioneel)", color = ZenithSecondary) },
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                val w = weightInput.toDoubleOrNull()
                                if (w != null && w > 0) {
                                    scope.launch {
                                        repository.saveWeight(w, fatInput.toDoubleOrNull())
                                    }
                                    showGlobalWeightModal = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = ZenithPrimary, contentColor = ZenithBackground)
                        ) {
                            Text("OPSLAAN", fontWeight = FontWeight.ExtraBold)
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showGlobalWeightModal = false }) {
                            Text("ANNULEER", color = ZenithSecondary)
                        }
                    }
                )
            }
        }
    }
}
