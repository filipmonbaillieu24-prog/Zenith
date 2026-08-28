package com.zenith.pulse.data

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.UUID

/**
 * Reads a Bluetooth body-composition scale directly, so a reading does not have to be
 * copied out of the manufacturer's own app by hand.
 *
 * ## Why this is written the way it is
 *
 * The target is a NEO Health Onyx SE, which is a white-labelled OEM scale sold to pair
 * with Virtuagym. There is no published protocol for it, and Virtuagym's own API is
 * issued per gym rather than per member, so neither the device nor the service can be
 * asked politely what it means.
 *
 * Almost every scale in this class does one of four things, so all four are handled:
 *
 *  1. Broadcasts the measurement in its BLE advertisement, decodable without ever
 *     connecting. Xiaomi-family scales do this.
 *  2. Implements the Bluetooth SIG Weight Scale (0x181D) and Body Composition (0x181B)
 *     services properly, in which case [decodeWeightMeasurement] and
 *     [decodeBodyComposition] below are the whole job - these are the official
 *     specifications, not guesses.
 *  3. Uses one of the common OEM vendor services - 0xFFF0 (Yolanda / QN), 0xFFB0
 *     (Chipsea), 0xFEE7 - which notify a short binary frame.
 *  4. Something else entirely.
 *
 * For (4) - and to confirm which of the others applies - every notification and every
 * advertisement is also kept verbatim as hex in [capturedFrames]. That log is the point
 * of this class as much as the decoding is: with a few frames captured next to a known
 * weight, the format is usually obvious, and a specific decoder can then be written
 * with certainty instead of by trial and error.
 *
 * Nothing here pairs, bonds, or writes to the scale. It listens.
 */
class ScaleBleManager(private val context: Context) {

    companion object {
        private const val TAG = "ScaleBleManager"

        /** Bluetooth SIG assigned numbers. */
        val WEIGHT_SCALE_SERVICE: UUID = uuid16("181D")
        val WEIGHT_MEASUREMENT_CHAR: UUID = uuid16("2A9D")
        val BODY_COMPOSITION_SERVICE: UUID = uuid16("181B")
        val BODY_COMPOSITION_CHAR: UUID = uuid16("2A9C")
        private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        /**
         * Vendor services seen on OEM scales of this kind. Used only to rank which
         * device in a scan is most likely to be the scale, and to know which
         * characteristics are worth subscribing to.
         */
        val CANDIDATE_SERVICES: List<UUID> = listOf(
            WEIGHT_SCALE_SERVICE,
            BODY_COMPOSITION_SERVICE,
            uuid16("FFF0"),   // Yolanda / QN-Scale family
            uuid16("FFB0"),   // Chipsea family
            uuid16("FEE7"),   // Tencent / several rebadges
            uuid16("FFE0")    // generic serial-over-BLE modules
        )

        private fun uuid16(short: String): UUID =
            UUID.fromString("0000$short-0000-1000-8000-00805f9b34fb")

        fun ByteArray.toHex(): String = joinToString(" ") { "%02X".format(it) }

        /**
         * The band a bathroom scale can actually report. Anything outside it is a
         * misread frame, not a person - the Onyx SE itself is rated to 180 kg.
         *
         * This is deliberately narrow. A wrong weight here does not fail loudly; it
         * writes a plausible number into a bodyweight history that the trend and
         * forecasting models then learn from, so rejecting a real reading costs one
         * missed day while accepting a bad one corrupts the series.
         */
        private val PLAUSIBLE_KG = 20.0..300.0

        /**
         * All-ones is the conventional "value not available" marker for a uint16 in
         * these profiles, and it is also what a truncated or padded frame produces.
         * At the 0.005 kg weight resolution it decodes to a believable-looking 327 kg.
         */
        private const val UINT16_UNAVAILABLE = 0xFFFF

        private fun u16(b: ByteArray, i: Int): Int? =
            if (i + 1 < b.size) (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8) else null

        /**
         * Bluetooth SIG Weight Measurement, characteristic 0x2A9D.
         *
         * Byte 0 is a flags field; bit 0 selects units, and bits 1-3 mark optional fields
         * that follow the weight. Weight is a uint16 at offset 1 with a resolution of
         * 0.005 kg in SI, or 0.01 lb in imperial.
         */
        fun decodeWeightMeasurement(b: ByteArray): Reading? {
            if (b.size < 3) return null
            val flags = b[0].toInt() and 0xFF
            val imperial = (flags and 0x01) != 0
            val raw = u16(b, 1) ?: return null
            if (raw == UINT16_UNAVAILABLE) return null
            val kg = if (imperial) raw * 0.01 * 0.45359237 else raw * 0.005
            if (kg !in PLAUSIBLE_KG) return null
            return Reading(weightKg = kg)
        }

        /**
         * Bluetooth SIG Body Composition Measurement, characteristic 0x2A9C.
         *
         * A uint16 flags field, then body fat percentage at 0.1% resolution, then a run of
         * optional fields whose presence is set by the flag bits. They must be walked in
         * specification order because each one shifts the offset of the next.
         */
        fun decodeBodyComposition(b: ByteArray): Reading? {
            if (b.size < 4) return null
            val flags = u16(b, 0) ?: return null
            val imperial = (flags and 0x0001) != 0
            val massScale = if (imperial) 0.01 * 0.45359237 else 0.005

            var i = 2
            val fatRaw = u16(b, i) ?: return null
            i += 2
            val bodyFat = fatRaw * 0.1

            if (flags and 0x0002 != 0) i += 7   // timestamp
            if (flags and 0x0004 != 0) i += 1   // user id
            if (flags and 0x0008 != 0) i += 2   // basal metabolism
            var musclePct: Double? = null
            if (flags and 0x0010 != 0) { musclePct = (u16(b, i) ?: 0) * 0.1; i += 2 }
            if (flags and 0x0020 != 0) i += 2   // muscle mass
            if (flags and 0x0040 != 0) i += 2   // fat free mass
            if (flags and 0x0080 != 0) i += 2   // soft lean mass
            var waterPct: Double? = null
            var waterMassKg: Double? = null
            if (flags and 0x0100 != 0) { waterMassKg = (u16(b, i) ?: 0) * massScale; i += 2 }
            var impedance: Double? = null
            if (flags and 0x0200 != 0) { impedance = (u16(b, i) ?: 0) * 0.1; i += 2 }
            var weightKg: Double? = null
            if (flags and 0x0400 != 0) {
                val rawWeight = u16(b, i) ?: 0
                weightKg = if (rawWeight == UINT16_UNAVAILABLE) null else rawWeight * massScale
                i += 2
            }

            if (waterMassKg != null && weightKg != null && weightKg > 0) {
                waterPct = waterMassKg / weightKg * 100.0
            }

            val fatPlausible = bodyFat > 0 && bodyFat < 75
            return Reading(
                weightKg = weightKg?.takeIf { it in PLAUSIBLE_KG },
                bodyFatPercent = bodyFat.takeIf { fatPlausible },
                musclePercent = musclePct?.takeIf { it > 0 && it < 100 },
                bodyWaterPercent = waterPct?.takeIf { it > 0 && it < 100 },
                impedanceOhms = impedance?.takeIf { it > 0 }
            )
        }
    }

    /** A scale reading, in whatever completeness the device provided. */
    data class Reading(
        val weightKg: Double? = null,
        val bodyFatPercent: Double? = null,
        val musclePercent: Double? = null,
        val bodyWaterPercent: Double? = null,
        /** Raw bio-impedance in ohms, when the scale reports it but not a fat figure. */
        val impedanceOhms: Double? = null,
        val source: String = ""
    ) {
        val hasAnything: Boolean
            get() = weightKg != null || bodyFatPercent != null || impedanceOhms != null
    }

    data class DiscoveredDevice(
        val address: String,
        val name: String,
        val rssi: Int,
        val serviceUuids: List<String>,
        val advertisementHex: String,
        /** Whether it advertises a service this class knows how to talk to. */
        val looksLikeAScale: Boolean
    )

    private val _devices = MutableStateFlow<List<DiscoveredDevice>>(emptyList())
    val devices: StateFlow<List<DiscoveredDevice>> = _devices

    private val _reading = MutableStateFlow<Reading?>(null)
    val reading: StateFlow<Reading?> = _reading

    private val _status = MutableStateFlow("")
    val status: StateFlow<String> = _status

    /**
     * Every frame seen, as hex, newest last. Kept whether or not it decoded - an
     * undecoded frame beside a known weight is what makes the next decoder writable.
     */
    private val _capturedFrames = MutableStateFlow<List<String>>(emptyList())
    val capturedFrames: StateFlow<List<String>> = _capturedFrames

    /**
     * The scale the user picked, remembered across launches.
     *
     * Choosing from a scan list is a setup step, not a daily one. Once a device is
     * known, the flow is meant to be: open the app, step on the scale, confirm the
     * numbers - so the address is stored and reconnected to automatically.
     *
     * Plain SharedPreferences: a Bluetooth MAC of a bathroom scale is not a secret,
     * and the encrypted store this app uses for the session token would be overkill.
     */
    private val prefs by lazy { context.getSharedPreferences("zenith_scale", Context.MODE_PRIVATE) }

    var savedScaleAddress: String?
        get() = prefs.getString("address", null)
        private set(value) { prefs.edit().putString("address", value).apply() }

    var savedScaleName: String?
        get() = prefs.getString("name", null)
        private set(value) { prefs.edit().putString("name", value).apply() }

    fun rememberScale(address: String, name: String) {
        savedScaleAddress = address
        savedScaleName = name
    }

    fun forgetScale() {
        prefs.edit().clear().apply()
    }

    /** Clears the last reading so a new step-on is unambiguous rather than stale. */
    fun clearReading() {
        _reading.value = null
    }

    private val adapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private var gatt: BluetoothGatt? = null
    private var scanning = false

    fun isBluetoothOn(): Boolean = adapter?.isEnabled == true

    private fun capture(line: String) {
        // Bounded: this is a diagnostic buffer, not a log file.
        _capturedFrames.value = (_capturedFrames.value + line).takeLast(60)
    }

    // ── Scanning ────────────────────────────────────────────────────────────────

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val record = result.scanRecord
            val advertised = record?.serviceUuids?.map { it.uuid } ?: emptyList()

            // Some scales never need connecting to - the weight is in the broadcast.
            // Capture the raw bytes so that case is recognisable even when the
            // decoders below do not fire.
            val raw = record?.bytes?.toHex() ?: ""

            val device = DiscoveredDevice(
                address = result.device.address,
                name = safeName(result.device) ?: record?.deviceName ?: "(unnamed)",
                rssi = result.rssi,
                serviceUuids = advertised.map { it.toString() },
                advertisementHex = raw,
                looksLikeAScale = advertised.any { it in CANDIDATE_SERVICES }
            )

            val existing = _devices.value
            val idx = existing.indexOfFirst { it.address == device.address }
            _devices.value = if (idx >= 0) {
                existing.toMutableList().also { it[idx] = device }
            } else {
                existing + device
            }.sortedWith(compareByDescending<DiscoveredDevice> { it.looksLikeAScale }.thenByDescending { it.rssi })

            // A broadcast-only scale: try the service data against the SIG formats.
            record?.serviceData?.forEach { (parcelUuid, bytes) ->
                if (bytes != null && bytes.isNotEmpty()) {
                    capture("ADV ${device.name} svc=${parcelUuid.uuid} ${bytes.toHex()}")
                    decodeAny(parcelUuid.uuid, bytes, "advertisement")?.let { publish(it) }
                }
            }
        }

        override fun onScanFailed(errorCode: Int) {
            _status.value = "Bluetooth scan failed (code $errorCode)"
            scanning = false
        }
    }

    @SuppressLint("MissingPermission")
    private fun safeName(device: BluetoothDevice): String? = try {
        device.name
    } catch (e: SecurityException) {
        null
    }

    @SuppressLint("MissingPermission")
    fun startScan(): String? {
        val scanner = adapter?.bluetoothLeScanner
            ?: return "Bluetooth is off, or this device has no Bluetooth LE"
        if (scanning) return null
        _devices.value = emptyList()
        return try {
            // No service filter: the whole point is to find out what this scale
            // advertises, and several OEM scales advertise no service UUID at all.
            scanner.startScan(
                emptyList(),
                ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),
                scanCallback
            )
            scanning = true
            _status.value = "Scanning — step on the scale so it wakes up"
            null
        } catch (e: SecurityException) {
            "Bluetooth permission not granted"
        } catch (e: Exception) {
            "Could not start scanning: ${e.message}"
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        if (!scanning) return
        try {
            adapter?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (e: Exception) {
            Log.w(TAG, "stopScan failed: ${e.message}")
        }
        scanning = false
    }

    // ── Connecting ──────────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    fun connect(address: String) {
        disconnect()
        val device = try {
            adapter?.getRemoteDevice(address)
        } catch (e: Exception) {
            _status.value = "Unknown device address"
            null
        } ?: return

        _status.value = "Connecting…"
        gatt = try {
            device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } catch (e: SecurityException) {
            _status.value = "Bluetooth permission not granted"
            null
        }
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        try {
            gatt?.disconnect()
            gatt?.close()
        } catch (e: Exception) {
            Log.w(TAG, "disconnect failed: ${e.message}")
        }
        gatt = null
    }

    private val gattCallback = object : BluetoothGattCallback() {

        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                _status.value = "Connected — reading services…"
                try {
                    g.discoverServices()
                } catch (e: SecurityException) {
                    _status.value = "Bluetooth permission not granted"
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                _status.value = "Disconnected"
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                _status.value = "Could not read the scale's services"
                return
            }

            // Record the full GATT map. When nothing decodes, this is what identifies
            // which OEM family the scale belongs to.
            val notifiable = mutableListOf<BluetoothGattCharacteristic>()
            for (service in g.services) {
                capture("SVC ${service.uuid}")
                for (ch in service.characteristics) {
                    val props = buildList {
                        if (ch.properties and BluetoothGattCharacteristic.PROPERTY_READ != 0) add("read")
                        if (ch.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) add("notify")
                        if (ch.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0) add("indicate")
                        if (ch.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) add("write")
                    }
                    capture("  CHR ${ch.uuid} [${props.joinToString(",")}]")
                    val canNotify = ch.properties and
                        (BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
                    if (canNotify) notifiable.add(ch)
                }
            }

            if (notifiable.isEmpty()) {
                _status.value = "Connected, but this device sends no measurements"
                return
            }

            // Subscribe to everything that can notify rather than only the known
            // characteristics: on an undocumented scale the measurement often arrives
            // on a vendor characteristic, and one subscription costs nothing.
            subscribeQueue = ArrayDeque(notifiable)
            subscribeNext(g)
            _status.value = "Listening — step on the scale"
        }

        override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            subscribeNext(g)
        }

        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            handleFrame(characteristic.uuid, value)
        }

        @Deprecated("Pre-33 callback; Android calls one or the other depending on API level.")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            handleFrame(characteristic.uuid, characteristic.value ?: return)
        }
    }

    private var subscribeQueue: ArrayDeque<BluetoothGattCharacteristic> = ArrayDeque()

    @SuppressLint("MissingPermission")
    private fun subscribeNext(g: BluetoothGatt) {
        // One at a time: Android's GATT queue drops overlapping descriptor writes
        // silently, which would leave some characteristics unsubscribed with no error.
        val next = subscribeQueue.removeFirstOrNull() ?: return
        try {
            g.setCharacteristicNotification(next, true)
            val cccd = next.getDescriptor(CCCD)
            if (cccd != null) {
                val value = if (next.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) {
                    BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                } else {
                    BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                }
                @Suppress("DEPRECATION")
                cccd.value = value
                @Suppress("DEPRECATION")
                g.writeDescriptor(cccd)
            } else {
                subscribeNext(g)
            }
        } catch (e: Exception) {
            Log.w(TAG, "subscribe failed for ${next.uuid}: ${e.message}")
            subscribeNext(g)
        }
    }

    private fun handleFrame(characteristic: UUID, value: ByteArray) {
        capture("NTF $characteristic ${value.toHex()}")
        val decoded = decodeAny(characteristic, value, "notification")
        if (decoded != null) {
            publish(decoded)
        } else {
            _status.value = "Reading received in an unrecognised format — see diagnostics"
        }
    }

    private fun publish(r: Reading) {
        // Merge rather than replace: a scale commonly sends weight first and body
        // composition a second or two later, in separate frames.
        val prev = _reading.value
        _reading.value = Reading(
            weightKg = r.weightKg ?: prev?.weightKg,
            bodyFatPercent = r.bodyFatPercent ?: prev?.bodyFatPercent,
            musclePercent = r.musclePercent ?: prev?.musclePercent,
            bodyWaterPercent = r.bodyWaterPercent ?: prev?.bodyWaterPercent,
            impedanceOhms = r.impedanceOhms ?: prev?.impedanceOhms,
            source = r.source
        )
        _status.value = "Reading received"
    }

    // ── Decoding ────────────────────────────────────────────────────────────────

    private fun decodeAny(characteristic: UUID, value: ByteArray, via: String): Reading? = when {
        characteristic == WEIGHT_MEASUREMENT_CHAR || characteristic == WEIGHT_SCALE_SERVICE ->
            decodeWeightMeasurement(value)?.copy(source = "Weight Scale service, $via")
        characteristic == BODY_COMPOSITION_CHAR || characteristic == BODY_COMPOSITION_SERVICE ->
            decodeBodyComposition(value)?.copy(source = "Body Composition service, $via")
        else -> null
    }

    /** The captured log, formatted for sharing when a scale needs a new decoder. */
    fun diagnosticsText(): String = buildString {
        appendLine("Zenith Pulse — scale diagnostics")
        appendLine("Devices seen:")
        _devices.value.forEach {
            appendLine("  ${it.name} [${it.address}] rssi=${it.rssi} services=${it.serviceUuids}")
            if (it.advertisementHex.isNotEmpty()) appendLine("    adv: ${it.advertisementHex}")
        }
        appendLine()
        appendLine("Frames:")
        _capturedFrames.value.forEach { appendLine("  $it") }
    }
}
