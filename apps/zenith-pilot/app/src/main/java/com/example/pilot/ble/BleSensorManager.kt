package com.example.pilot.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.*

@SuppressLint("MissingPermission")
class BleSensorMaleager(private val context: Context) {
    private val bluetoothMaleager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothMaleager
    private val bluetoothAdapter = bluetoothMaleager?.adapter
    private val bleScanner = bluetoothAdapter?.bluetoothLeScanner

    private val _sensors = MutableStateFlow<List<BleSensor>>(emptyList())
    val sensors: StateFlow<List<BleSensor>> = _sensors.asStateFlow()

    private val _currentHR = MutableStateFlow<Int?>(null)
    val currentHR: StateFlow<Int?> = _currentHR.asStateFlow()

    private val _currentPower = MutableStateFlow<Int?>(null)
    val currentPower: StateFlow<Int?> = _currentPower.asStateFlow()

    private val _currentCadence = MutableStateFlow<Int?>(null)
    val currentCadence: StateFlow<Int?> = _currentCadence.asStateFlow()

    private val _currentSpeed = MutableStateFlow<Int?>(null)
    val currentSpeed: StateFlow<Int?> = _currentSpeed.asStateFlow()

    private val activeGatts = mutableMapOf<String, BluetoothGatt>()
    private val handler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(Dispatchers.Default)

    private var lastCrankRevolutions = -1
    private var lastCrankEventTime = -1

    private var lastWheelRevs = -1L
    private var lastWheelEventTime = -1

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    // UUIDs
    private val HR_SERVICE_UUID = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
    private val HR_CHAR_UUID = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")

    private val POWER_SERVICE_UUID = UUID.fromString("00001818-0000-1000-8000-00805f9b34fb")
    private val POWER_CHAR_UUID = UUID.fromString("00002a63-0000-1000-8000-00805f9b34fb")

    private val CADENCE_SERVICE_UUID = UUID.fromString("00001816-0000-1000-8000-00805f9b34fb")
    private val CADENCE_CHAR_UUID = UUID.fromString("00002a5b-0000-1000-8000-00805f9b34fb")

    private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    private val prefs = context.getSharedPreferences("ble_sensors", Context.MODE_PRIVATE)

    private fun loadRememberedSensors(): List<BleSensor> {
        val list = mutableListOf<BleSensor>()
        SensorType.values().forEach { type ->
            val key = "sensor_${type.name}"
            val address = prefs.getString("${key}_address", null)
            val name = prefs.getString("${key}_name", null)
            if (address != null && name != null) {
                list.add(
                    BleSensor(
                        address = address,
                        name = name,
                        type = type,
                        status = ConnectionStatus.DISCONNECTED
                    )
                )
            }
        }
        return list
    }

    private fun saveRememberedSensor(sensor: BleSensor) {
        val key = "sensor_${sensor.type.name}"
        prefs.edit()
            .putString("${key}_address", sensor.address)
            .putString("${key}_name", sensor.name)
            .apply()
    }

    private fun forgetRememberedSensor(address: String) {
        _sensors.value.find { it.address == address }?.let { sensor ->
            val key = "sensor_${sensor.type.name}"
            prefs.edit()
                .remove("${key}_address")
                .remove("${key}_name")
                .apply()
        }
    }

    init {
        _sensors.value = loadRememberedSensors()
        autoConnectRememberedSensors()
    }

    fun autoConnectRememberedSensors() {
        _sensors.value.forEach { sensor ->
            if (sensor.status == ConnectionStatus.DISCONNECTED) {
                connectSensor(sensor.address)
            }
        }
    }

    fun startScanning() {
        if (_isScanning.value || bleScanner == null) return
        _isScanning.value = true

        _sensors.value = _sensors.value.map { 
            if (it.status == ConnectionStatus.DISCONNECTED) it.copy(status = ConnectionStatus.SCANNING) else it 
        }

        try {
            bleScanner.startScan(scanCallback)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Auto stop scan after 15 seconds
        handler.postDelayed({ stopScanning() }, 15000)
    }

    fun stopScanning() {
        if (!_isScanning.value || bleScanner == null) return
        _isScanning.value = false
        try {
            bleScanner.stopScan(scanCallback)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        _sensors.value = _sensors.value.map { 
            if (it.status == ConnectionStatus.SCANNING) it.copy(status = ConnectionStatus.DISCONNECTED) else it 
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            val deviceName = result.scanRecord?.deviceName ?: device.name ?: "Onbekend BLE Apparaat"
            val address = device.address

            // Determine sensor type by looking at advertised services
            val services = result.scanRecord?.serviceUuids
            val type = when {
                services?.contains(android.os.ParcelUuid(HR_SERVICE_UUID)) == true -> SensorType.HEART_RATE
                services?.contains(android.os.ParcelUuid(POWER_SERVICE_UUID)) == true -> SensorType.POWER
                services?.contains(android.os.ParcelUuid(CADENCE_SERVICE_UUID)) == true -> {
                    if (deviceName.contains("Speed", ignoreCase = true) || deviceName.contains("Spd", ignoreCase = true)) {
                        SensorType.SPEED
                    } else {
                        SensorType.CADENCE
                    }
                }
                deviceName.contains("HR", ignoreCase = true) || deviceName.contains("Heart", ignoreCase = true) -> SensorType.HEART_RATE
                deviceName.contains("Power", ignoreCase = true) || deviceName.contains("Rotor", ignoreCase = true) -> SensorType.POWER
                deviceName.contains("Speed", ignoreCase = true) || deviceName.contains("Spd", ignoreCase = true) -> SensorType.SPEED
                deviceName.contains("Cadence", ignoreCase = true) || deviceName.contains("Cad", ignoreCase = true) -> SensorType.CADENCE
                else -> return // Ignore other BLE devices to keep list clean
            }

            val existing = _sensors.value.find { it.address == address }
            if (existing == null) {
                val newSensor = BleSensor(
                    address = address,
                    name = deviceName,
                    type = type,
                    status = ConnectionStatus.FOUND
                )
                _sensors.value = _sensors.value + newSensor
                
                // Auto-connect if it matches a remembered sensor
                val rememberedAddress = prefs.getString("sensor_${type.name}_address", null)
                if (address == rememberedAddress) {
                    connectSensor(address)
                }
            } else {
                val rememberedAddress = prefs.getString("sensor_${type.name}_address", null)
                if (address == rememberedAddress && existing.status == ConnectionStatus.DISCONNECTED) {
                    connectSensor(address)
                }
            }
        }
    }

    fun connectSensor(address: String) {
        val sensor = _sensors.value.find { it.address == address } ?: return
        _sensors.value = _sensors.value.map { if (it.address == address) it.copy(status = ConnectionStatus.CONNECTING) else it }

        stopScanning()

        val device = bluetoothAdapter?.getRemoteDevice(address) ?: return
        val gatt = device.connectGatt(context, false, gattCallback)
        activeGatts[address] = gatt
    }

    fun disconnectSensor(address: String) {
        forgetRememberedSensor(address)
        activeGatts[address]?.let { gatt ->
            gatt.disconnect()
            gatt.close()
        }
        activeGatts.remove(address)
        _sensors.value = _sensors.value.map { 
            if (it.address == address) it.copy(status = ConnectionStatus.DISCONNECTED, lastValue = null) else it 
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            val address = gatt.device.address
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                _sensors.value = _sensors.value.map { if (it.address == address) it.copy(status = ConnectionStatus.CONNECTED) else it }
                gatt.discoverServices()

                _sensors.value.find { it.address == address }?.let { sensor ->
                    saveRememberedSensor(sensor)
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                _sensors.value = _sensors.value.map { if (it.address == address) it.copy(status = ConnectionStatus.DISCONNECTED, lastValue = null) else it }
                activeGatts.remove(address)
                gatt.close()

                // Automatic background reconnection loop for remembered devices
                val sensor = _sensors.value.find { it.address == address }
                if (sensor != null) {
                    val key = "sensor_${sensor.type.name}"
                    val rememberedAddress = prefs.getString("${key}_address", null)
                    if (rememberedAddress == address) {
                        handler.postDelayed({
                            // Only reconnect if still disconnected and still remembered
                            val current = _sensors.value.find { it.address == address }
                            if (current != null && current.status == ConnectionStatus.DISCONNECTED && 
                                prefs.getString("${key}_address", null) == address) {
                                connectSensor(address)
                            }
                        }, 5000)
                    }
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) return
            
            // Enable notifications for our desired characteristics
            gatt.services.forEach { service ->
                when (service.uuid) {
                    HR_SERVICE_UUID -> enableNotification(gatt, service.getCharacteristic(HR_CHAR_UUID))
                    POWER_SERVICE_UUID -> enableNotification(gatt, service.getCharacteristic(POWER_CHAR_UUID))
                    CADENCE_SERVICE_UUID -> enableNotification(gatt, service.getCharacteristic(CADENCE_CHAR_UUID))
                }
            }
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            val address = gatt.device.address
            
            // Dynamic auto-correction of CSC sensors based on actual transmitted data flags
            if (characteristic.uuid == CADENCE_CHAR_UUID) {
                @Suppress("DEPRECATION")
                val data = characteristic.value
                if (data != null && data.isNotEmpty()) {
                    val flags = data[0].toInt()
                    val hasWheel = (flags and 0x01) != 0
                    val hasCrank = (flags and 0x02) != 0
                    
                    val currentSensor = _sensors.value.find { it.address == address }
                    if (currentSensor != null) {
                        if (hasWheel && !hasCrank && currentSensor.type == SensorType.CADENCE) {
                            updateSensorType(address, SensorType.SPEED)
                        } else if (hasCrank && !hasWheel && currentSensor.type == SensorType.SPEED) {
                            updateSensorType(address, SensorType.CADENCE)
                        }
                    }
                }
            }

            val sensorType = when (characteristic.uuid) {
                HR_CHAR_UUID -> SensorType.HEART_RATE
                POWER_CHAR_UUID -> SensorType.POWER
                CADENCE_CHAR_UUID -> {
                    _sensors.value.find { it.address == address }?.type ?: SensorType.CADENCE
                }
                else -> return
            }

            val value = decodeCharacteristicValue(characteristic, sensorType) ?: return

            // Update live values and sensor record
            scope.launch {
                when (sensorType) {
                    SensorType.HEART_RATE -> {
                        _currentHR.value = value
                    }
                    SensorType.POWER -> {
                        _currentPower.value = value
                    }
                    SensorType.CADENCE -> {
                        _currentCadence.value = value
                    }
                    SensorType.SPEED -> {
                        _currentSpeed.value = value
                    }
                }
                _sensors.value = _sensors.value.map {
                    if (it.address == address) it.copy(lastValue = value) else it
                }
            }
        }
    }

    private fun updateSensorType(address: String, newType: SensorType) {
        _sensors.value = _sensors.value.map {
            if (it.address == address) {
                val updated = it.copy(type = newType)
                // If it was remembered, update the remembered key
                val oldKey = "sensor_${it.type.name}"
                if (prefs.getString("${oldKey}_address", null) == address) {
                    prefs.edit()
                        .remove("${oldKey}_address")
                        .remove("${oldKey}_name")
                        .apply()
                    saveRememberedSensor(updated)
                }
                updated
            } else it
        }
        
        // Reset old live values to prevent ghost stats
        if (newType == SensorType.SPEED) {
            _currentCadence.value = null
        } else if (newType == SensorType.CADENCE) {
            _currentSpeed.value = null
        }
    }

    private fun enableNotification(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic?) {
        if (characteristic == null) return
        gatt.setCharacteristicNotification(characteristic, true)
        val descriptor = characteristic.getDescriptor(CCCD_UUID)
        if (descriptor != null) {
            descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            gatt.writeDescriptor(descriptor)
        }
    }

    private fun decodeCharacteristicValue(characteristic: BluetoothGattCharacteristic, type: SensorType): Int? {
        val data = characteristic.value ?: return null
        if (data.isEmpty()) return null

        return when (type) {
            SensorType.HEART_RATE -> {
                val flags = data[0].toInt()
                val is16Bit = (flags and 0x01) != 0
                if (is16Bit && data.size >= 3) {
                    ((data[2].toInt() and 0xFF) shl 8) or (data[1].toInt() and 0xFF)
                } else {
                    data[1].toInt() and 0xFF
                }
            }
            SensorType.POWER -> {
                if (data.size >= 4) {
                    // Instantaneous power is uint16 at index 2-3
                    ((data[3].toInt() and 0xFF) shl 8) or (data[2].toInt() and 0xFF)
                } else null
            }
            SensorType.CADENCE -> {
                val flags = data[0].toInt()
                val hasWheel = (flags and 0x01) != 0
                val hasCrank = (flags and 0x02) != 0
                
                if (hasCrank) {
                    val offset = if (hasWheel) 7 else 1
                    if (data.size >= offset + 4) {
                        val crankRevolutions = ((data[offset + 1].toInt() and 0xFF) shl 8) or (data[offset].toInt() and 0xFF)
                        val crankEventTime = ((data[offset + 3].toInt() and 0xFF) shl 8) or (data[offset + 2].toInt() and 0xFF)
                        
                        var rpm = 0
                        if (lastCrankRevolutions != -1 && lastCrankEventTime != -1) {
                            val diffRevs = (crankRevolutions - lastCrankRevolutions) and 0xFFFF
                            val diffTime = (crankEventTime - lastCrankEventTime) and 0xFFFF
                            if (diffTime > 0 && diffRevs > 0) {
                                rpm = (diffRevs * 60 * 1024) / diffTime
                                if (rpm > 250) rpm = 250
                            } else if (diffRevs == 0) {
                                rpm = 0
                            }
                        }
                        
                        lastCrankRevolutions = crankRevolutions
                        lastCrankEventTime = crankEventTime
                        rpm
                    } else null
                } else null
            }
            SensorType.SPEED -> {
                val flags = data[0].toInt()
                val hasWheel = (flags and 0x01) != 0
                if (hasWheel && data.size >= 7) {
                    val wheelRevs = ((data[4].toLong() and 0xFFL) shl 24) or
                                    ((data[3].toLong() and 0xFFL) shl 16) or
                                    ((data[2].toLong() and 0xFFL) shl 8) or
                                    (data[1].toLong() and 0xFFL)
                    val wheelEventTime = ((data[6].toInt() and 0xFF) shl 8) or
                                         (data[5].toInt() and 0xFF)
                    
                    var speedKmh = 0
                    if (lastWheelRevs != -1L && lastWheelEventTime != -1) {
                        val diffRevs = (wheelRevs - lastWheelRevs) and 0xFFFFFFFFL
                        val diffTime = (wheelEventTime - lastWheelEventTime) and 0xFFFF
                        if (diffTime > 0 && diffRevs > 0) {
                            val speedMps = (diffRevs * 2.1 * 1024.0) / diffTime
                            speedKmh = Math.round(speedMps * 3.6).toInt()
                            if (speedKmh > 100) speedKmh = 100
                        }
                    }
                    lastWheelRevs = wheelRevs
                    lastWheelEventTime = wheelEventTime
                    speedKmh
                } else null
            }
        }
    }

    fun cleanUp() {
        stopScanning()
        activeGatts.values.forEach { gatt ->
            gatt.disconnect()
            gatt.close()
        }
        activeGatts.clear()
        lastCrankRevolutions = -1
        lastCrankEventTime = -1
        lastWheelRevs = -1L
        lastWheelEventTime = -1
    }
}
