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
import android.os.Handler
import android.os.Looper
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

        /**
         * Tuya's BLE profile. Its payload is AES encrypted with a key issued when the
         * scale was paired to a Tuya account, so the bytes cannot be read without
         * that key however many offsets are tried - and trying them anyway produced
         * sixteen mutually contradictory "weights" per frame.
         */
        val TUYA_SERVICE: UUID = uuid16("1910")

        /** The Inlife family's write characteristic. */
        val FFF2: UUID = uuid16("FFF2")

        /**
         * The QN family: service AE00, write AE01, notify AE02.
         *
         * This scale exposes BOTH AE00 and FFF0, and that combination is a known trap
         * - a scale offering both is a QN device, and matching on FFF0 first picks the
         * Inlife protocol it does not speak. Writing to FFF2 did get an acknowledgement
         * out of it, but the measurement stream lives on the other service.
         */
        val QN_WRITE: UUID = uuid16("AE01")

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
    /** Whether a scan has been run at all, as against one that found nothing. */
    private var everScanned = false

    fun isBluetoothOn(): Boolean = adapter?.isEnabled == true

    private var lastCapturedLine: String? = null
    private var lastCapturedRepeats = 0

    private fun capture(line: String) {
        // A scale nobody is standing on streams 0.00 kg several times a second. Sixty
        // of those pushed the actual weigh-in out of a sixty-line buffer, so the one
        // report that finally contained a real measurement did not show it. Repeats
        // now collapse in place instead of scrolling history away.
        if (line == lastCapturedLine) {
            lastCapturedRepeats++
            val lines = _capturedFrames.value.toMutableList()
            if (lines.isNotEmpty()) {
                lines[lines.lastIndex] = "$line   (x${lastCapturedRepeats + 1})"
                _capturedFrames.value = lines
            }
            return
        }
        lastCapturedLine = line
        lastCapturedRepeats = 0
        // Bounded: this is a diagnostic buffer, not a log file.
        _capturedFrames.value = (_capturedFrames.value + line).takeLast(60)
    }

    /**
     * The GATT map, kept apart from the frame buffer.
     *
     * Both used to share one 60-line ring, so a scale that repeats itself pushed the
     * service list straight out of it - the first diagnostics report from a real
     * weigh-in arrived with sixty identical frames and only a fragment of the map,
     * which is exactly the half that identifies the device.
     */
    private val _gattMap = MutableStateFlow<List<String>>(emptyList())
    val gattMap: StateFlow<List<String>> = _gattMap

    private fun captureGatt(line: String) {
        _gattMap.value = (_gattMap.value + line).takeLast(40)
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
            }
                // Sorted on signal strength, this list re-ordered itself on every
                // advertisement - several times a second - so it slid under the finger
                // of anyone trying to scroll past it or tap an entry. Scales first,
                // then a stable key.
                .sortedWith(compareByDescending<DiscoveredDevice> { it.looksLikeAScale }.thenBy { it.address })
                .take(12)

            // A broadcast-only scale: try the service data against the SIG formats.
            record?.serviceData?.forEach { (parcelUuid, bytes) ->
                if (bytes != null && bytes.isNotEmpty()) {
                    capture("ADV ${device.name} svc=${parcelUuid.uuid} ${bytes.toHex()}")
                    decodeAny(parcelUuid.uuid, bytes, "advertisement")?.let { publish(it) }
                }
            }

            // Manufacturer data was never captured, and it is where this family of
            // scale is most likely to be putting the weight: the frames arriving over
            // GATT are manufacturer-shaped (an 0x11 0xFF block carrying the MAC) and
            // contain no weight at all, which is what a beacon looks like rather than
            // a measurement.
            record?.manufacturerSpecificData?.let { mfr ->
                for (i in 0 until mfr.size()) {
                    val id = mfr.keyAt(i)
                    val bytes = mfr.valueAt(i) ?: continue
                    if (bytes.isEmpty()) continue
                    capture("ADV ${device.name} mfr=0x%04X %s".format(id, bytes.toHex()))
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
            everScanned = true
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
        // Each connection gets one probe. Without this reset a reconnect would stay
        // silent because the previous connection had already used it up.
        measurementSeen = false
        qnConfigured = false
        qnPublishedThisSession = false
        qnProtocolType = 0
        qnWeightScaleFactor = 10.0
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
        probeHandler.removeCallbacksAndMessages(null)
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
            writable.clear()
            encryptedProfile = false
            for (service in g.services) {
                captureGatt("SVC ${service.uuid}" + if (service.uuid == TUYA_SERVICE) "   (Tuya - encrypted payload)" else "")
                if (service.uuid == TUYA_SERVICE) encryptedProfile = true
                for (ch in service.characteristics) {
                    val props = buildList {
                        if (ch.properties and BluetoothGattCharacteristic.PROPERTY_READ != 0) add("read")
                        if (ch.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) add("notify")
                        if (ch.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0) add("indicate")
                        if (ch.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) add("write")
                        // Without this, the one characteristic a vendor scale expects
                        // a command on reported as "[]" - no properties at all - which
                        // made it look inert when it is the way in.
                        if (ch.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) add("write-no-response")
                    }
                    captureGatt("  CHR ${ch.uuid} [${props.joinToString(",")}]")
                    val canNotify = ch.properties and
                        (BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
                    if (canNotify) notifiable.add(ch)
                    val canWrite = ch.properties and
                        (BluetoothGattCharacteristic.PROPERTY_WRITE or
                         BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                    if (canWrite) writable.add(ch)
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

    // ── Handshake probe ─────────────────────────────────────────────────────────
    //
    // This scale connects, subscribes and then repeats one 17-byte frame forever. It
    // carries the scale's own MAC and a checksum, and no weight: two weigh-ins 0.05 kg
    // apart produced identical frames except for a single byte that stepped 5 -> 7,
    // which counts measurements rather than measuring them. A device that keeps saying
    // the same thing is waiting for an answer.
    //
    // The answer is not documented anywhere I can verify, so this does not pretend to
    // know it. It writes a short series of candidate replies, shaped the way the
    // scale's own frames are shaped - byte 0 a command, byte 1 the total length, last
    // byte the sum of everything before it, which is verified against both captured
    // frames - and records every write and everything that comes back. If one of them
    // unlocks the measurement stream the diagnostics will show the frames changing.
    // If none do, the report says exactly what was tried.
    private val writable = mutableListOf<BluetoothGattCharacteristic>()

    /** Set when the connected device speaks a profile whose payload is encrypted. */
    private var encryptedProfile = false
    /** Set once anything that could be a measurement arrives, to stop the probing. */
    private var measurementSeen = false

    /**
     * The athlete's last known weight, when the app has one.
     *
     * A search over unlabelled bytes will happily return 25.1 kg, and it did - that
     * figure reached the confirmation field. A weight nobody could plausibly have
     * gained or lost since yesterday is not a reading, it is a coincidence, and
     * having a prior is the difference between offering a number and guessing one.
     */
    private var expectedWeightKg: Double? = null

    fun setExpectedWeight(kg: Double?) {
        expectedWeightKg = kg?.takeIf { it > 20 && it < 300 }
    }
    private val probeHandler = Handler(Looper.getMainLooper())

    // ── The QN protocol, implemented rather than probed ──────────────────────────
    //
    // Searching for prior art found this scale's family documented, and three things
    // in what the probe had been sending were wrong:
    //
    //  * Byte 2 of the config frame is the protocol type the scale announced in its
    //    greeting, not a constant. This scale says 0xFF; we were sending 0x15. It
    //    replied anyway, which is why the probe looked like it had succeeded.
    //  * The 0x14 reply is not an acknowledgement to file away. It is a request, and
    //    the answer is a 0x20 time frame. We received it and did nothing, which is
    //    exactly where every session has stalled.
    //  * The weight divisor is not fixed. The greeting carries it: byte 10 of the
    //    0x12 frame is 1 for hundredths of a kilogram and anything else for tenths.
    //    This scale says 0x03, so tenths.
    //
    // Writes go to FFF2 and notifications arrive on FFF1 - the "type 2" layout. AE01
    // was tried first last release on the strength of a bug report about a different
    // scale, and got no reply at all, which settles that.

    /** Announced by the scale in its greeting; echoed back in everything we send. */
    private var qnProtocolType: Byte = 0
    /** 100 for hundredths of a kilogram, 10 for tenths. From the greeting. */
    private var qnWeightScaleFactor = 10.0
    private var qnConfigured = false
    private var qnPublishedThisSession = false

    private fun qnChecksum(buf: ByteArray, from: Int, toInclusive: Int): Byte {
        var sum = 0
        for (i in from..toInclusive) sum = (sum + (buf[i].toInt() and 0xFF)) and 0xFF
        return sum.toByte()
    }

    /** Seconds since the scale's own epoch. Not the round 2000-01-01 UTC value. */
    private fun qnSeconds(): Long = (System.currentTimeMillis() / 1000L) - 946_702_800L

    private fun qnTimeBytes(): ByteArray {
        val t = qnSeconds()
        return byteArrayOf(
            (t and 0xFF).toByte(),
            ((t shr 8) and 0xFF).toByte(),
            ((t shr 16) and 0xFF).toByte(),
            ((t shr 24) and 0xFF).toByte()
        )
    }

    @SuppressLint("MissingPermission")
    private fun writeQn(frame: ByteArray, label: String) {
        val g = gatt ?: return
        val target = writable.firstOrNull { it.uuid == FFF2 } ?: writable.firstOrNull() ?: return
        try {
            @Suppress("DEPRECATION")
            target.writeType = if (target.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) {
                BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            } else {
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            }
            @Suppress("DEPRECATION")
            target.value = frame
            @Suppress("DEPRECATION")
            val ok = g.writeCharacteristic(target)
            capture("TX $label ${frame.toHex()}${if (ok) "" else "  (write refused)"}")
        } catch (e: Exception) {
            capture("TX $label failed: ${e.message}")
        }
    }

    /** The greeting: protocol type, weight divisor, then configure. */
    private fun onQnScaleInfo(data: ByteArray) {
        if (data.size <= 10) return
        qnProtocolType = (data[2].toInt() and 0xFF).toByte()
        qnWeightScaleFactor = if ((data[10].toInt() and 0xFF) == 1) 100.0 else 10.0
        if (qnConfigured) return
        qnConfigured = true
        capture("QN info - protocol type 0x%02X, weight divisor ${qnWeightScaleFactor.toInt()}".format(qnProtocolType))

        val config = byteArrayOf(0x13, 0x09, qnProtocolType, 0x01, 0x10, 0x00, 0x00, 0x00, 0x00)
        config[config.lastIndex] = qnChecksum(config, 0, config.lastIndex - 1)
        writeQn(config, "config")

        probeHandler.postDelayed({ writeQn(byteArrayOf(0x02) + qnTimeBytes(), "time") }, 400)
        _status.value = "Scale is listening — step on it now"
    }

    /** The scale asks for the time by sending 0x14. Answer it. */
    private fun onQnConfigAck() {
        val msg = byteArrayOf(0x20, 0x08, qnProtocolType, 0, 0, 0, 0, 0)
        qnTimeBytes().copyInto(msg, 3)
        msg[msg.lastIndex] = qnChecksum(msg, 0, msg.lastIndex - 1)
        writeQn(msg, "time-sync")
    }

    /** Some firmware asks for this pair before it will report. */
    private fun onQnHandshake0x21() {
        val a = byteArrayOf(0xa0.toByte(), 0x0d, 0x04, 0xfe.toByte(), 0, 0, 0, 0, 0, 0, 0, 0, 0)
        a[a.lastIndex] = qnChecksum(a, 0, a.lastIndex - 1)
        writeQn(a, "handshake-a")

        val b = byteArrayOf(0xa0.toByte(), 0x0d, 0x02, 0x01, 0x00, 0x08, 0x00, 0x21, 0x06, 0xb8.toByte(), 0x04, 0x02, 0)
        b[b.lastIndex] = qnChecksum(b, 0, b.lastIndex - 1)
        probeHandler.postDelayed({ writeQn(b, "handshake-b") }, 300)
    }

    private fun u16be(hi: Byte, lo: Byte): Int =
        ((hi.toInt() and 0xFF) shl 8) or (lo.toInt() and 0xFF)

    /** Live weight. Two layouts, told apart by byte 4 and the divisor. */
    private fun onQnLiveWeight(data: ByteArray) {
        if (data.size < 7) return
        val byte4 = data[4].toInt() and 0xFF
        val es30m = byte4 <= 0x02 && qnWeightScaleFactor == 10.0

        val stable: Boolean
        val raw: Int
        if (es30m) {
            stable = byte4 == 0x01 || byte4 == 0x02
            raw = u16be(data[5], data[6])
        } else {
            stable = (data[5].toInt() and 0xFF) == 1
            raw = u16be(data[3], data[4])
        }

        var kg = raw / qnWeightScaleFactor
        // The divisor announced in the greeting is not always the one used. A value
        // outside any human range means it was out by a factor of ten.
        if (kg > 0.0 && (kg <= 5.0 || kg >= 250.0)) kg /= 10.0

        // Impedance, which is what the scale actually measures besides weight. Body
        // fat, water and muscle are not sent by the scale at all - they are computed
        // from this together with age, sex and height, which is why the fields are
        // still empty.
        val impedance = if (es30m) u16be(data[7], data[8]) else u16be(data[6], data[7])

        // Nobody is standing on it. Not a reading in progress, and saying "hold still"
        // at an empty scale is telling the athlete to keep doing something they are
        // not doing.
        if (kg <= 0.05) return

        measurementSeen = true
        capture("  QN weight %.2f kg%s, impedance %d".format(kg, if (stable) " (settled)" else " (settling)", impedance))

        if (!stable) {
            _status.value = "Weighing — hold still (%.1f kg)".format(kg)
            return
        }
        if (qnPublishedThisSession || kg <= 5.0 || kg >= 250.0) return
        qnPublishedThisSession = true
        probeHandler.removeCallbacksAndMessages(null)
        _status.value = "Got it — check the reading and confirm"
        publish(Reading(
            weightKg = Math.round(kg * 100) / 100.0,
            impedanceOhms = if (impedance in 100..1500) impedance.toDouble() else null,
            source = "QN protocol"
        ))
    }

    /** A measurement the scale had stored from before we connected. */
    private fun onQnStoredMeasurement(data: ByteArray) {
        if (data.size < 12) return
        val kg = u16be(data[10], data[11]) / 100.0
        capture("  QN stored measurement %.2f kg".format(kg))
        if (qnPublishedThisSession || kg <= 5.0 || kg >= 250.0) return
        qnPublishedThisSession = true
        _status.value = "Found a stored reading — check it and confirm"
        publish(Reading(weightKg = Math.round(kg * 100) / 100.0, source = "QN protocol (stored)"))
    }

    private data class WeightCandidate(val kg: Double, val description: String)

    /**
     * Every 16-bit window in the frame, read both ways and scaled both ways, filtered
     * to values a person could weigh.
     *
     * This is a search, not a decode, and it is labelled as one everywhere it surfaces.
     * It exists because the alternative - picking an offset because it looked right
     * once - is how a number nobody checked ends up in a weight chart.
     */
    private fun weightCandidates(frame: ByteArray): List<WeightCandidate> {
        val found = mutableListOf<WeightCandidate>()
        // The last byte is the checksum and the first two are command and length;
        // neither is ever part of a measurement.
        for (i in 2 until frame.size - 2) {
            val a = frame[i].toInt() and 0xFF
            val b = frame[i + 1].toInt() and 0xFF
            val be = (a shl 8) or b
            val le = (b shl 8) or a
            for ((raw, order) in listOf(be to "BE", le to "LE")) {
                for ((divisor, unit) in listOf(10.0 to "/10", 100.0 to "/100")) {
                    val kg = raw / divisor
                    // Anchored to what this person actually weighs when that is known.
                    // The bare 25-250 kg band let 25.1 through as the single candidate
                    // for someone who weighs 88, and being the only answer in range
                    // does not make an answer right.
                    val expected = expectedWeightKg
                    val plausible = if (expected != null) {
                        kotlin.math.abs(kg - expected) <= 10.0
                    } else {
                        kg in 35.0..200.0
                    }
                    if (plausible) {
                        found.add(WeightCandidate(
                            kg = Math.round(kg * 100) / 100.0,
                            description = "offset $i $order $unit -> $kg kg"
                        ))
                    }
                }
            }
        }
        return found
    }

    private fun handleFrame(characteristic: UUID, value: ByteArray) {
        capture("NTF $characteristic ${value.toHex()}")

        val command = if (value.isNotEmpty()) value[0].toInt() and 0xFF else -1

        // Opcode dispatch, per the QN protocol. The probe that got us here tried
        // commands until one answered; this answers the ones the scale asks.
        when (command) {
            0x12 -> { onQnScaleInfo(value); return }
            0x14 -> { capture("  QN config acknowledged - sending the time"); onQnConfigAck(); return }
            0x21 -> { capture("  QN handshake requested"); onQnHandshake0x21(); return }
            0x10 -> { onQnLiveWeight(value); return }
            0x23 -> { onQnStoredMeasurement(value); return }
            0xA1, 0xA3 -> { capture("  QN acknowledged"); return }
        }

        if (encryptedProfile) {
            _status.value = "This scale encrypts its readings — Zenith cannot read them"
            return
        }

        if (command != 0x12 && command != 0x14 && value.size >= 4) {
            val candidates = weightCandidates(value)
            when {
                candidates.size == 1 -> {
                    measurementSeen = true
                    capture("  CAND ${candidates[0].description}")
                    capture("  -> offering ${candidates[0].kg} kg for confirmation")
                    publish(Reading(weightKg = candidates[0].kg, source = "vendor frame (format not confirmed)"))
                    return
                }
                // A frame that yields a dozen different "weights" has told us nothing,
                // and printing all dozen buries the frames that matter. The count is
                // the finding; a couple of examples are enough to show the spread.
                candidates.size > 3 -> {
                    capture("  CAND ${candidates.size} possible values, none conclusive" +
                        " (e.g. ${candidates.take(2).joinToString("; ") { it.description }})")
                }
                else -> candidates.forEach { capture("  CAND ${it.description}") }
            }
        }
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

    /**
     * Everything known about the attempt, formatted for sending on.
     *
     * Written to be useful when NOTHING worked, which is the case that matters. An
     * earlier version of the UI only offered this once frames had been captured -
     * exactly backwards, since a scan that finds nothing is precisely when the
     * details are needed and the moment they were unreachable.
     */
    fun diagnosticsText(): String = buildString {
        appendLine("Zenith Pulse - scale diagnostics")
        appendLine("time: ${java.time.Instant.now()}")
        appendLine("device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}, Android ${android.os.Build.VERSION.RELEASE} (SDK ${android.os.Build.VERSION.SDK_INT})")
        appendLine("bluetooth on: ${isBluetoothOn()}")
        appendLine("scanning: $scanning")
        appendLine("remembered scale: ${savedScaleName ?: "(none)"} [${savedScaleAddress ?: "-"}]")
        appendLine("status: ${_status.value.ifEmpty { "(none)" }}")
        appendLine()

        val devices = _devices.value
        appendLine("devices seen: ${devices.size}")
        if (devices.isEmpty()) {
            // Saying "the scan found nothing" when no scan ever ran sends people to
            // check their Bluetooth over a list that was simply never filled.
            if (everScanned) {
                appendLine("  (none - the scan found no Bluetooth LE devices at all.")
                appendLine("   Step on the scale so it powers up, and check Bluetooth is on.)")
            } else {
                appendLine("  (no scan has been run in this session - this connection went")
                appendLine("   straight to the remembered scale. Scan to pick a different one.)")
            }
        }
        devices.forEach {
            appendLine("  ${it.name} [${it.address}] rssi=${it.rssi} scaleLike=${it.looksLikeAScale}")
            if (it.serviceUuids.isNotEmpty()) appendLine("    services: ${it.serviceUuids}")
            if (it.advertisementHex.isNotEmpty()) appendLine("    adv: ${it.advertisementHex}")
        }
        appendLine()

        val gatt = _gattMap.value
        val frames = _capturedFrames.value
        appendLine("gatt map:")
        if (gatt.isEmpty()) {
            appendLine("  (none - never connected, or the services were never read.)")
        }
        gatt.forEach { appendLine("  $it") }
        appendLine()

        appendLine("frames: ${frames.size}")
        if (frames.isEmpty()) {
            appendLine("  (none - nothing was connected to, or the connection sent no data.)")
        }

        // Consecutive repeats collapse to one line with a count. Sixty identical
        // frames say one thing - the scale is repeating itself - and printing them
        // sixty times buries every other line in the report.
        var run = 0
        var previous: String? = null
        for (frame in frames) {
            if (frame == previous) { run++; continue }
            if (previous != null) appendLine("  $previous" + if (run > 1) "   (x$run)" else "")
            previous = frame
            run = 1
        }
        if (previous != null) appendLine("  $previous" + if (run > 1) "   (x$run)" else "")
    }
}
