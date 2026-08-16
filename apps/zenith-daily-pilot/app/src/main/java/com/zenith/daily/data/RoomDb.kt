package com.zenith.daily.data

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "weights")
data class WeightEntity(
    @PrimaryKey val id: String,
    val date: String,
    val weightKg: Double,
    val bodyFatPct: Double?,
    val loggedAtMs: Long
)

@Entity(tableName = "meal_logs")
data class MealLogEntity(
    @PrimaryKey val id: String,
    val date: String,
    val mealType: String,
    val foodName: String,
    val calories: Int,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val servings: Double,
    val timestampMs: Long
)

@Entity(tableName = "food_items")
data class FoodItemEntity(
    @PrimaryKey val id: String,
    val barcode: String?,
    val name: String,
    val brand: String?,
    val servingSize: String,
    val calories: Int,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double
)

@Dao
interface WeightDao {
    @Query("SELECT * FROM weights ORDER BY loggedAtMs DESC")
    fun getWeightsFlow(): Flow<List<WeightEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(weight: WeightEntity)

    @Query("DELETE FROM weights WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface MealLogDao {
    @Query("SELECT * FROM meal_logs WHERE date = :date ORDER BY timestampMs ASC")
    fun getMealLogsByDateFlow(date: String): Flow<List<MealLogEntity>>

    @Query("SELECT * FROM meal_logs ORDER BY timestampMs DESC")
    fun getAllMealLogsFlow(): Flow<List<MealLogEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(meal: MealLogEntity)

    @Query("DELETE FROM meal_logs WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface FoodItemDao {
    @Query("SELECT * FROM food_items ORDER BY name ASC")
    fun getAllFoodItemsFlow(): Flow<List<FoodItemEntity>>

    @Query("SELECT * FROM food_items WHERE name LIKE '%' || :query || '%' OR brand LIKE '%' || :query || '%'")
    suspend fun searchFoodItems(query: String): List<FoodItemEntity>

    @Query("SELECT * FROM food_items WHERE barcode = :barcode LIMIT 1")
    suspend fun findByBarcode(barcode: String): FoodItemEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(foodItem: FoodItemEntity)
}

@Database(
    entities = [WeightEntity::class, MealLogEntity::class, FoodItemEntity::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun weightDao(): WeightDao
    abstract fun mealLogDao(): MealLogDao
    abstract fun foodItemDao(): FoodItemDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "zenith_daily_db"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}
