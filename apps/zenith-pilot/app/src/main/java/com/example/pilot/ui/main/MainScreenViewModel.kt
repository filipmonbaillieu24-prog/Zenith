package com.example.pilot.ui.main

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.pilot.ble.BleSensor
import com.example.pilot.ble.BleSensorManager
import com.example.pilot.coaching.CoachingCue
import com.example.pilot.data.PlannedWorkout
import com.example.pilot.data.WorkoutRepository
import com.example.pilot.service.WorkoutService
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

sealed interface SyncStatus {
    object Checking : SyncStatus
    object Synced : SyncStatus
    object Error : SyncStatus
}

data class PilotUiState(
    val isLoading: Boolean = true,
    val todayWorkouts: List<PlannedWorkout> = emptyList(),
    val selectedWorkoutIndex: Int = 0,
    val sensors: List<BleSensor> = emptyList(),
    val coachingLog: List<CoachingCue> = emptyList(),
    val syncStatus: SyncStatus = SyncStatus.Checking,
    // Active session bindings
    val isWorkoutActive: Boolean = false,
    val isPaused: Boolean = false,
    val currentBlockIndex: Int = 0,
    val elapsedSeconds: Int = 0,
    val blockElapsedSeconds: Int = 0,
    // Live sensor values
    val currentHR: Int? = null,
    val currentPower: Int? = null,
    val currentCadence: Int? = null,
    val currentSpeed: Int? = null,
    // Scanning state
    val isScanning: Boolean = false,
    // Auto-update info
    val updateInfo: com.example.pilot.update.UpdateInfo? = null,
    val updateProgress: Float? = null,
    val updateError: String? = null
)

class MainScreenViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = WorkoutRepository()
    
    // We instantiate a backup sensor manager just in case the service isn't running yet
    private val localSensorManager = BleSensorManager(application)

    private val _uiState = MutableStateFlow(PilotUiState())
    val uiState: StateFlow<PilotUiState> = _uiState.asStateFlow()

    private var serviceConnection: ServiceConnection? = null
    private var boundService: WorkoutService? = null
    
    private var serviceJobs = mutableListOf<Job>()
    private var repositoryJob: Job? = null

    init {
        // Start checking for today's workouts
        startSyncing()
        
        // Listen to local sensors by default
        observeLocalSensors()
        
        // Auto-bind service if it's already active
        bindToWorkoutService()

        // Check for updates
        checkAppUpdates()
    }

    private fun checkAppUpdates() {
        viewModelScope.launch {
            try {
                val context = getApplication<Application>().applicationContext
                val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                val currentVersionCode = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                    pInfo.longVersionCode.toInt()
                } else {
                    pInfo.versionCode
                }
                
                val update = com.example.pilot.update.UpdateManager.checkForUpdates(currentVersionCode)
                if (update != null) {
                    _uiState.update { it.copy(updateInfo = update) }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun downloadAndInstallUpdate() {
        val update = uiState.value.updateInfo ?: return
        _uiState.update { it.copy(updateProgress = 0f, updateError = null) }
        viewModelScope.launch {
            com.example.pilot.update.UpdateManager.downloadAndInstallApk(
                context = getApplication(),
                downloadUrl = update.downloadUrl,
                onProgress = { progress ->
                    _uiState.update { it.copy(updateProgress = progress) }
                },
                onError = { error ->
                    _uiState.update { it.copy(updateError = error, updateProgress = null) }
                }
            )
        }
    }

    private fun startSyncing() {
        repositoryJob?.cancel()
        repositoryJob = viewModelScope.launch {
            _uiState.update { it.copy(syncStatus = SyncStatus.Checking) }
            repository.getTodaysWorkouts()
                .catch {
                    _uiState.update { state -> state.copy(syncStatus = SyncStatus.Error, isLoading = false) }
                }
                .collect { workouts ->
                    _uiState.update { state ->
                        state.copy(
                            todayWorkouts = workouts,
                            isLoading = false,
                            syncStatus = SyncStatus.Synced
                        )
                    }
                }
        }
    }

    private fun observeLocalSensors() {
        viewModelScope.launch {
            combine(
                localSensorManager.sensors,
                localSensorManager.currentHR,
                localSensorManager.currentPower,
                localSensorManager.currentCadence,
                localSensorManager.currentSpeed,
                localSensorManager.isScanning
            ) { array ->
                @Suppress("UNCHECKED_CAST")
                val sensorsList = array[0] as List<BleSensor>
                val hr = array[1] as? Int
                val power = array[2] as? Int
                val cadence = array[3] as? Int
                val speed = array[4] as? Int
                val scanning = array[5] as Boolean

                if (boundService == null) {
                    _uiState.update { state ->
                        state.copy(
                            sensors = sensorsList,
                            currentHR = hr,
                            currentPower = power,
                            currentCadence = cadence,
                            currentSpeed = speed,
                            isScanning = scanning
                        )
                    }
                }
            }.collect()
        }
    }

    private fun bindToWorkoutService() {
        if (WorkoutService.activeService != null) {
            connectToServiceInstance(WorkoutService.activeService!!)
        }

        serviceConnection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                val binder = service as? WorkoutService.WorkoutBinder
                binder?.getService()?.let { connectToServiceInstance(it) }
            }

            override fun onServiceDisconnected(name: ComponentName?) {
                disconnectFromService()
            }
        }

        val intent = Intent(getApplication(), WorkoutService::class.java)
        getApplication<Application>().bindService(intent, serviceConnection!!, Context.BIND_AUTO_CREATE)
    }

    private fun connectToServiceInstance(service: WorkoutService) {
        boundService = service
        
        // Cancel any previous service observer jobs
        serviceJobs.forEach { it.cancel() }
        serviceJobs.clear()

        // Bind active service flows to our UI state
        val context = getApplication<Application>()
        
        serviceJobs.add(viewModelScope.launch {
            service.isWorkoutActive.collect { active ->
                _uiState.update { it.copy(isWorkoutActive = active) }
            }
        })
        
        serviceJobs.add(viewModelScope.launch {
            service.isPaused.collect { paused ->
                _uiState.update { it.copy(isPaused = paused) }
            }
        })

        serviceJobs.add(viewModelScope.launch {
            service.currentBlockIndex.collect { idx ->
                _uiState.update { it.copy(currentBlockIndex = idx) }
            }
        })

        serviceJobs.add(viewModelScope.launch {
            service.elapsedSeconds.collect { elapsed ->
                _uiState.update { it.copy(elapsedSeconds = elapsed) }
            }
        })

        serviceJobs.add(viewModelScope.launch {
            service.blockElapsedSeconds.collect { elapsed ->
                _uiState.update { it.copy(blockElapsedSeconds = elapsed) }
            }
        })

        // Observe service sensor manager flows when bound
        serviceJobs.add(viewModelScope.launch {
            combine(
                service.bleSensorManager.sensors,
                service.bleSensorManager.currentHR,
                service.bleSensorManager.currentPower,
                service.bleSensorManager.currentCadence,
                service.bleSensorManager.currentSpeed,
                service.bleSensorManager.isScanning
            ) { array ->
                @Suppress("UNCHECKED_CAST")
                val sensorsList = array[0] as List<BleSensor>
                val hr = array[1] as? Int
                val power = array[2] as? Int
                val cadence = array[3] as? Int
                val speed = array[4] as? Int
                val scanning = array[5] as Boolean

                _uiState.update { state ->
                    state.copy(
                        sensors = sensorsList,
                        currentHR = hr,
                        currentPower = power,
                        currentCadence = cadence,
                        currentSpeed = speed,
                        isScanning = scanning
                    )
                }
            }.collect()
        })
    }

    private fun disconnectFromService() {
        boundService = null
        serviceJobs.forEach { it.cancel() }
        serviceJobs.clear()
        _uiState.update { it.copy(isWorkoutActive = false) }
    }

    fun startWorkout() {
        val workouts = uiState.value.todayWorkouts
        val idx = uiState.value.selectedWorkoutIndex
        if (workouts.isEmpty() || idx >= workouts.size) return

        val workout = workouts[idx]
        val context = getApplication<Application>()
        
        // Start Foreground Service
        val intent = Intent(context, WorkoutService::class.java)
        context.startService(intent)
        
        // Bind to it
        bindToWorkoutService()

        // Trigger start workout
        viewModelScope.launch {
            // Give service a moment to initialize if needed
            var attempts = 0
            while (WorkoutService.activeService == null && attempts < 10) {
                delay(100)
                attempts++
            }
            WorkoutService.activeService?.startWorkout(workout)
        }
    }

    fun togglePause() {
        WorkoutService.activeService?.togglePause()
    }

    fun stopWorkout() {
        WorkoutService.activeService?.stopWorkout()
        disconnectFromService()
    }

    fun selectWorkout(index: Int) {
        _uiState.update { it.copy(selectedWorkoutIndex = index) }
    }

    fun startScanning() {
        WorkoutService.activeService?.bleSensorManager?.startScanning() ?: localSensorManager.startScanning()
    }

    fun connectSensor(address: String) {
        WorkoutService.activeService?.bleSensorManager?.connectSensor(address) ?: localSensorManager.connectSensor(address)
    }

    fun disconnectSensor(address: String) {
        WorkoutService.activeService?.bleSensorManager?.disconnectSensor(address) ?: localSensorManager.disconnectSensor(address)
    }

    override fun onCleared() {
        super.onCleared()
        repositoryJob?.cancel()
        serviceJobs.forEach { it.cancel() }
        localSensorManager.cleanUp()
        serviceConnection?.let {
            try {
                getApplication<Application>().unbindService(it)
            } catch (e: Exception) {
                // ignore
            }
        }
    }
}
