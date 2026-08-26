package com.zenith.kratos.data

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

// 1. Entities
@Entity(tableName = "exercises")
data class LocalExercise(
    @PrimaryKey val id: String,
    val name: String,
    val category: String,
    val notes: String?,
    val incrementWeight: Double,
    val incrementPerSide: Boolean,
    val minWeight: Double? = null,
    val maxWeight: Double? = null,
    val defaultRir: Int,
    val weightUnit: String,
    val isBodyweight: Boolean = false
)

@Entity(tableName = "templates")
data class LocalTemplate(
    @PrimaryKey val id: String,
    val name: String,
    val exercisesJson: String // Serialized JSON string of List<TemplateExercise>
)

@Entity(tableName = "completed_workouts")
data class LocalWorkout(
    @PrimaryKey val id: String,
    val templateId: String?,
    val name: String,
    val startedAt: String,
    val completedAt: String,
    val volume: Double,
    val cardioStressFactor: Double,
    val setsJson: String, // Serialized JSON string of List<WorkoutExerciseLog>
    val isSynced: Boolean = false
)

// 2. DAOs
@Dao
interface ExerciseDao {
    @Query("SELECT * FROM exercises ORDER BY name ASC")
    fun getAllExercisesFlow(): Flow<List<LocalExercise>>

    @Query("SELECT * FROM exercises")
    suspend fun getAllExercises(): List<LocalExercise>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertExercises(exercises: List<LocalExercise>)

    @Query("DELETE FROM exercises")
    suspend fun deleteAll()
}

@Dao
interface TemplateDao {
    @Query("SELECT * FROM templates ORDER BY name ASC")
    fun getAllTemplatesFlow(): Flow<List<LocalTemplate>>

    @Query("SELECT * FROM templates")
    suspend fun getAllTemplates(): List<LocalTemplate>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTemplates(templates: List<LocalTemplate>)

    @Query("DELETE FROM templates")
    suspend fun deleteAll()
}

@Dao
interface WorkoutDao {
    @Query("SELECT * FROM completed_workouts ORDER BY completedAt DESC")
    fun getAllWorkoutsFlow(): Flow<List<LocalWorkout>>

    @Query("SELECT * FROM completed_workouts WHERE isSynced = 0")
    suspend fun getUnsyncedWorkouts(): List<LocalWorkout>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkout(workout: LocalWorkout)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkouts(workouts: List<LocalWorkout>)

    @Query("UPDATE completed_workouts SET isSynced = 1 WHERE id = :workoutId")
    suspend fun markSynced(workoutId: String)

    @Query("SELECT COUNT(*) FROM completed_workouts")
    suspend fun getWorkoutCount(): Int

    @Query("DELETE FROM completed_workouts")
    suspend fun deleteAll()
}

@Entity(tableName = "active_workout")
data class LocalActiveWorkout(
    @PrimaryKey val id: String = "active_workout",
    val templateId: String?,
    val name: String,
    val startedAtMs: Long,
    val cardioStressFactor: Double,
    val exercisesJson: String
)

@Dao
interface ActiveWorkoutDao {
    @Query("SELECT * FROM active_workout WHERE id = 'active_workout' LIMIT 1")
    suspend fun getActiveWorkout(): LocalActiveWorkout?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveActiveWorkout(active: LocalActiveWorkout)

    @Query("DELETE FROM active_workout WHERE id = 'active_workout'")
    suspend fun deleteActiveWorkout()
}

// Adds min_weight/max_weight to the exercises cache without touching any other table.
// A prior version of this migration relied on fallbackToDestructiveMigration(), which
// wipes every table on any un-handled version bump - including completed_workouts, the
// only local source for "Previous" set values and PR history (workouts only ever sync
// UP to Supabase, never back down), silently erasing that history for every user who
// updated. An explicit Migration takes priority over the fallback for this exact jump.
val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE exercises ADD COLUMN minWeight REAL")
        db.execSQL("ALTER TABLE exercises ADD COLUMN maxWeight REAL")
    }
}

// 3. Database
@Database(entities = [LocalExercise::class, LocalTemplate::class, LocalWorkout::class, LocalActiveWorkout::class], version = 4, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun exerciseDao(): ExerciseDao
    abstract fun templateDao(): TemplateDao
    abstract fun workoutDao(): WorkoutDao
    abstract fun activeWorkoutDao(): ActiveWorkoutDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "kratos_database"
                ).addMigrations(MIGRATION_3_4)
                    // Deliberately NO fallbackToDestructiveMigration(): it silently
                    // dropped and recreated every table on any un-migrated version
                    // bump, which is exactly how local workout history was wiped
                    // once before. Without it, a missing migration fails loudly at
                    // open time - during development, where it belongs - instead of
                    // destroying user data in the field. Add an explicit Migration
                    // for every future schema change.
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
