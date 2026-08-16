package com.zenith.daily.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.json.JSONObject

class DailyRepository(private val context: Context) {
    private val db = AppDatabase.getDatabase(context)
    private val weightDao = db.weightDao()
    private val mealLogDao = db.mealLogDao()
    private val foodItemDao = db.foodItemDao()

    fun getTodayDateString(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        return sdf.format(Date())
    }

    val weightsFlow: Flow<List<WeightLog>> = weightDao.getWeightsFlow().map { list ->
        list.map { WeightLog(it.id, it.date, it.weightKg, it.bodyFatPct, it.loggedAtMs) }
    }

    fun getTodayMealLogsFlow(dateStr: String = getTodayDateString()): Flow<List<DailyMealLog>> {
        return mealLogDao.getMealLogsByDateFlow(dateStr).map { list ->
            list.map { DailyMealLog(it.id, it.date, it.mealType, it.foodName, it.calories, it.proteinG, it.carbsG, it.fatG, it.servings, it.timestampMs) }
        }
    }

    val foodItemsFlow: Flow<List<FoodItem>> = foodItemDao.getAllFoodItemsFlow().map { list ->
        list.map { FoodItem(it.id, it.barcode, it.name, it.brand, it.servingSize, it.calories, it.proteinG, it.carbsG, it.fatG) }
    }

    suspend fun seedDefaultFoodItemsIfEmpty() = withContext(Dispatchers.IO) {
        val existing = foodItemDao.searchFoodItems("")
        if (existing.isEmpty()) {
            val defaults = listOf(
                FoodItem(id = "def-1", name = "Kipfilet (gegrild)", brand = "Zenith Basics", servingSize = "100g", calories = 165, proteinG = 31.0, carbsG = 0.0, fatG = 3.6),
                FoodItem(id = "def-2", name = "Magere Franse Kwark", brand = "Zenith Basics", servingSize = "250g", calories = 140, proteinG = 22.5, carbsG = 10.0, fatG = 0.5),
                FoodItem(id = "def-3", name = "Zilvervliesrijst (gekookt)", brand = "Zenith Basics", servingSize = "150g", calories = 195, proteinG = 4.5, carbsG = 41.0, fatG = 1.6),
                FoodItem(id = "def-4", name = "Havermout", brand = "Zenith Basics", servingSize = "50g", calories = 185, proteinG = 6.5, carbsG = 30.0, fatG = 3.5),
                FoodItem(id = "def-5", name = "Eieren (Gekookt, 2 stuks)", brand = "Zenith Basics", servingSize = "100g", calories = 155, proteinG = 13.0, carbsG = 1.1, fatG = 11.0),
                FoodItem(id = "def-6", name = "Whey Isolate Shake", brand = "Zenith Fuel", servingSize = "30g", calories = 112, proteinG = 26.0, carbsG = 1.2, fatG = 0.4),
                FoodItem(id = "def-7", name = "Banaan (Middelgroot)", brand = "Fruit", servingSize = "118g", calories = 105, proteinG = 1.3, carbsG = 27.0, fatG = 0.3),
                FoodItem(id = "def-8", name = "Pindakaas (100% Pinda)", brand = "Zenith Fuel", servingSize = "15g", calories = 95, proteinG = 4.0, carbsG = 1.8, fatG = 8.0)
            )
            defaults.forEach { item ->
                foodItemDao.insert(FoodItemEntity(item.id, item.barcode, item.name, item.brand, item.servingSize, item.calories, item.proteinG, item.carbsG, item.fatG))
            }
        }
    }

    suspend fun saveWeight(weightKg: Double, bodyFatPct: Double? = null, dateStr: String = getTodayDateString()) = withContext(Dispatchers.IO) {
        val entity = WeightEntity(
            id = java.util.UUID.randomUUID().toString(),
            date = dateStr,
            weightKg = weightKg,
            bodyFatPct = bodyFatPct,
            loggedAtMs = System.currentTimeMillis()
        )
        weightDao.insert(entity)
    }

    suspend fun deleteWeight(id: String) = withContext(Dispatchers.IO) {
        weightDao.deleteById(id)
    }

    suspend fun saveMealLog(mealType: String, foodName: String, calories: Int, proteinG: Double, carbsG: Double, fatG: Double, servings: Double = 1.0, dateStr: String = getTodayDateString()) = withContext(Dispatchers.IO) {
        val entity = MealLogEntity(
            id = java.util.UUID.randomUUID().toString(),
            date = dateStr,
            mealType = mealType,
            foodName = foodName,
            calories = Math.round(calories * servings).toInt(),
            proteinG = Math.round(proteinG * servings * 10) / 10.0,
            carbsG = Math.round(carbsG * servings * 10) / 10.0,
            fatG = Math.round(fatG * servings * 10) / 10.0,
            servings = servings,
            timestampMs = System.currentTimeMillis()
        )
        mealLogDao.insert(entity)
    }

    suspend fun deleteMealLog(id: String) = withContext(Dispatchers.IO) {
        mealLogDao.deleteById(id)
    }

    suspend fun addCustomFoodItem(name: String, brand: String?, servingSize: String, calories: Int, proteinG: Double, carbsG: Double, fatG: Double, barcode: String? = null): FoodItem = withContext(Dispatchers.IO) {
        val item = FoodItem(
            id = java.util.UUID.randomUUID().toString(),
            barcode = barcode,
            name = name,
            brand = brand,
            servingSize = servingSize,
            calories = calories,
            proteinG = proteinG,
            carbsG = carbsG,
            fatG = fatG
        )
        foodItemDao.insert(FoodItemEntity(item.id, item.barcode, item.name, item.brand, item.servingSize, item.calories, item.proteinG, item.carbsG, item.fatG))
        item
    }

    suspend fun searchFoodItems(query: String): List<FoodItem> = withContext(Dispatchers.IO) {
        foodItemDao.searchFoodItems(query).map {
            FoodItem(it.id, it.barcode, it.name, it.brand, it.servingSize, it.calories, it.proteinG, it.carbsG, it.fatG)
        }
    }

    suspend fun lookupBarcode(barcode: String): FoodItem? = withContext(Dispatchers.IO) {
        // 1. Local DB search
        val cached = foodItemDao.findByBarcode(barcode)
        if (cached != null) {
            return@withContext FoodItem(cached.id, cached.barcode, cached.name, cached.brand, cached.servingSize, cached.calories, cached.proteinG, cached.carbsG, cached.fatG)
        }

        // 2. Fallback to OpenFoodFacts API
        try {
            val url = URL("https://world.openfoodfacts.org/api/v2/product/$barcode.json")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 4000
            conn.readTimeout = 4000

            if (conn.responseCode == 200) {
                val jsonStr = conn.inputStream.bufferedReader().use { it.readText() }
                val root = JSONObject(jsonStr)
                if (root.optInt("status", 0) == 1) {
                    val product = root.getJSONObject("product")
                    val name = product.optString("product_name", "Gescand Product")
                    val brand = product.optString("brands", "Onbekend merk")
                    val nutriments = product.optJSONObject("nutriments")
                    
                    val kcal = nutriments?.optInt("energy-kcal_100g", nutriments.optInt("energy-kcal", 150)) ?: 150
                    val protein = nutriments?.optDouble("proteins_100g", 10.0) ?: 10.0
                    val carbs = nutriments?.optDouble("carbohydrates_100g", 20.0) ?: 20.0
                    val fat = nutriments?.optDouble("fat_100g", 5.0) ?: 5.0

                    val newItem = FoodItem(
                        id = java.util.UUID.randomUUID().toString(),
                        barcode = barcode,
                        name = name,
                        brand = brand,
                        servingSize = "100g",
                        calories = kcal,
                        proteinG = Math.round(protein * 10) / 10.0,
                        carbsG = Math.round(carbs * 10) / 10.0,
                        fatG = Math.round(fat * 10) / 10.0
                    )
                    foodItemDao.insert(FoodItemEntity(newItem.id, newItem.barcode, newItem.name, newItem.brand, newItem.servingSize, newItem.calories, newItem.proteinG, newItem.carbsG, newItem.fatG))
                    return@withContext newItem
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        null
    }
}
