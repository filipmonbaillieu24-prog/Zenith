package com.zenith.daily.data

import kotlinx.serialization.Serializable

@Serializable
data class WeightLog(
    val id: String = java.util.UUID.randomUUID().toString(),
    val date: String, // YYYY-MM-DD
    val weightKg: Double,
    val bodyFatPct: Double? = null,
    val loggedAtMs: Long = System.currentTimeMillis()
)

@Serializable
data class FoodItem(
    val id: String = java.util.UUID.randomUUID().toString(),
    val barcode: String? = null,
    val name: String,
    val brand: String? = null,
    val servingSize: String = "100g",
    val calories: Int,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double
)

@Serializable
data class DailyMealLog(
    val id: String = java.util.UUID.randomUUID().toString(),
    val date: String, // YYYY-MM-DD
    val mealType: String, // "Breakfast", "Lunch", "Dinner", "Snack"
    val foodName: String,
    val calories: Int,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val servings: Double = 1.0,
    val timestampMs: Long = System.currentTimeMillis()
)

@Serializable
data class MacroGoals(
    val dailyCalorieTarget: Int = 2400,
    val proteinTargetG: Double = 180.0,
    val carbsTargetG: Double = 250.0,
    val fatTargetG: Double = 70.0
)

data class HealthConnectSnapshot(
    val stepsCount: Long = 0,
    val activeCaloriesBurned: Int = 0,
    val isConnected: Boolean = false,
    val lastSyncedMs: Long = 0
)

data class UpdateInfo(
    val versionName: String,
    val apkUrl: String,
    val releaseNotes: String? = null
)
