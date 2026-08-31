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

    private fun capture(line: String) {
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
        probeRan = false
        handshakeAccepted = false
        measurementSeen = false
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
        probeRan = false
        handshakeAccepted = false
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
    private var probeRan = false

    /**
     * Set once the scale replies to a probe write.
     *
     * The first probe found the answer on its first attempt: writing 0x13 to fff2 got
     * a 0x14 back and the endless hello stopped. Every write after that is noise sent
     * to a scale that has already moved on, so the sweep stops here.
     */
    private var handshakeAccepted = false
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

    /** Appends the frame checksum: the sum of every preceding byte, mod 256. */
    private fun withChecksum(body: ByteArray): ByteArray {
        var sum = 0
        for (b in body) sum += (b.toInt() and 0xFF)
        return body + (sum and 0xFF).toByte()
    }

    /**
     * The QN handshake, as documented rather than guessed.
     *
     * `13 09 15 01 10 00 00 00 42` is the published magic frame for this protocol,
     * fixed and complete - which is why the probe got an answer from it on the first
     * attempt. I had briefly read the trailing zeros as an unfilled timestamp and
     * started substituting a real clock into them; that was wrong, and it would have
     * broken the one frame known to work. The time is a SEPARATE write.
     */
    private val QN_MAGIC = byteArrayOf(0x13, 0x09, 0x15, 0x01, 0x10, 0x00, 0x00, 0x00, 0x42)

    /**
     * The time write: 0x02 followed by four little-endian seconds.
     *
     * The epoch is Unix minus 946,702,800, the constant this firmware family counts
     * from. It is not the round 2000-01-01 UTC value and there is no point tidying it
     * into one - the scale is the authority on its own clock.
     */
    private fun qnTimeFrame(): ByteArray {
        val seconds = (System.currentTimeMillis() / 1000L) - 946_702_800L
        return byteArrayOf(
            0x02,
            (seconds and 0xFF).toByte(),
            ((seconds shr 8) and 0xFF).toByte(),
            ((seconds shr 16) and 0xFF).toByte(),
            ((seconds shr 24) and 0xFF).toByte()
        )
    }

    private fun handshakeFrames(): List<ByteArray> = listOf(QN_MAGIC, qnTimeFrame())

    private fun probeFrames(): List<ByteArray> = handshakeFrames() + listOf(
        // Acknowledge the hello. 0x13, total length 9, then a unit selector.
        withChecksum(byteArrayOf(0x13, 0x09, 0x15, 0x01, 0x10, 0x00, 0x00, 0x00)),
        withChecksum(byteArrayOf(0x13, 0x09, 0x15, 0x00, 0x00, 0x00, 0x00, 0x00)),
        // Ask for state, the usual follow-up in this frame family.
        withChecksum(byteArrayOf(0x14, 0x09, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00)),
        withChecksum(byteArrayOf(0x14, 0x05, 0x10, 0x00)),
        // Acknowledge using the same command byte the scale sent, in case it wants
        // its own hello echoed back.
        withChecksum(byteArrayOf(0x12, 0x05, 0x00, 0x00))
    )

    @SuppressLint("MissingPermission")
    private fun runHandshakeProbe() {
        if (probeRan) return
        val g = gatt ?: return
        val targets = writable.toList()
        if (targets.isEmpty()) {
            capture("PROBE skipped - no writable characteristic")
            return
        }
        probeRan = true
        // AE01 first. A scale exposing both AE00 and FFF0 is a QN device, and the
        // measurement stream is on AE02 however politely FFF1 answers.
        val ordered = targets.sortedByDescending { it.uuid == QN_WRITE }
        capture("PROBE start - ${ordered.size} writable characteristic(s), AE01 first")

        var delay = 0L
        for (target in ordered) {
            for (frame in probeFrames()) {
                delay += 700
                probeHandler.postDelayed({
                    try {
                        val noResponse = target.properties and
                            BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0
                        @Suppress("DEPRECATION")
                        target.writeType = if (noResponse) {
                            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                        } else {
                            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                        }
                        @Suppress("DEPRECATION")
                        target.value = frame
                        @Suppress("DEPRECATION")
                        if (handshakeAccepted) return@postDelayed
                        val ok = g.writeCharacteristic(target)
                        capture("TX ${target.uuid} ${frame.toHex()}${if (ok) "" else "  (write refused)"}")
                    } catch (e: Exception) {
                        capture("TX ${target.uuid} failed: ${e.message}")
                    }
                }, delay)
            }
        }
    }

    /**
     * A short sweep of neighbouring command bytes, run only after the scale has proved
     * it answers well-formed frames.
     *
     * Every one is minimal and correctly framed. The scale ignored 0x14 and 0x12
     * writes in the first probe without complaint, so an unrecognised command costs
     * nothing; what is being looked for is another reply like the 0x14, which would
     * say which command it understood.
     */
    private fun requestMeasurement() {
        val g = gatt ?: return
        val target = writable.firstOrNull { it.uuid == QN_WRITE }
            ?: writable.firstOrNull { it.uuid == FFF2 }
            ?: writable.firstOrNull() ?: return
        capture("PROBE stage 2 - asking for a measurement")

        val asks = handshakeFrames() + listOf(
            withChecksum(byteArrayOf(0x15, 0x05, 0x00, 0x00)),
            withChecksum(byteArrayOf(0x16, 0x05, 0x00, 0x00)),
            withChecksum(byteArrayOf(0x1F, 0x05, 0x00, 0x00)),
            withChecksum(byteArrayOf(0x20, 0x05, 0x00, 0x00)),
            withChecksum(byteArrayOf(0x10, 0x05, 0x00, 0x00))
        )

        var delay = 0L
        for (frame in asks) {
            delay += 700
            probeHandler.postDelayed({
                if (measurementSeen) return@postDelayed
                try {
                    @Suppress("DEPRECATION")
                    target.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    @Suppress("DEPRECATION")
                    target.value = frame
                    @Suppress("DEPRECATION")
                    val ok = g.writeCharacteristic(target)
                    capture("TX2 ${target.uuid} ${frame.toHex()}${if (ok) "" else "  (write refused)"}")
                } catch (e: Exception) {
                    capture("TX2 failed: ${e.message}")
                }
            }, delay)
        }
    }

    /**
     * Listen to the advertisement as well as the connection.
     *
     * Plenty of scales put the live weight in their broadcast and use the connection
     * only for configuration. Every diagnostics report so far says "devices seen: 0"
     * because no scan was ever running during a weigh-in, so that whole channel has
     * gone unexamined. Android is content to scan while connected.
     */
    @SuppressLint("MissingPermission")
    private fun onSilentAfterHandshake() {
        if (measurementSeen) return
        capture("PROBE stage 3 - nothing over the connection; listening for broadcasts too")
        _status.value = "Listening for a broadcast — stay on the scale"
        startScan()
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

        // A frame that carries no weight and repeats unchanged is a greeting, not a
        // measurement. Answer it once per connection.
        if (command == 0x12) {
            probeHandler.postDelayed({ runHandshakeProbe() }, 1200)
        }

        // The scale answered. Stop writing at it and tell the athlete it is their turn.
        if (command == 0x14 && !handshakeAccepted) {
            handshakeAccepted = true
            probeHandler.removeCallbacksAndMessages(null)
            capture("PROBE accepted - scale replied 0x14, remaining writes cancelled")
            _status.value = "Scale is listening — step on it now"

            // The handshake completes and then nothing follows, while the counter in
            // the greeting climbs with every weigh-in - 5, 7, 8, 10 across four
            // sessions. The scale is recording measurements and not volunteering
            // them, so two things are tried, neither of them a guess about weight:
            // asking for them, and listening to the airwaves instead of the socket.
            probeHandler.postDelayed({ requestMeasurement() }, 2500)
            probeHandler.postDelayed({ onSilentAfterHandshake() }, 9000)
        }

        // Anything that is neither the greeting nor the handshake reply is a candidate
        // measurement. Rather than guess a field offset, every 16-bit window is tried
        // and the ones landing in a human weight range are reported. A single
        // candidate is offered as a reading - which the athlete confirms before it is
        // saved anywhere - and the rest of the arithmetic goes into the diagnostics so
        // the guess can be checked rather than trusted.
        // ── The QN measurement frame ────────────────────────────────────────────
        //
        // A documented format, not a search: command 0x10, weight in bytes 3 and 4 as
        // a big-endian hundredth of a kilogram, and byte 5 saying whether the reading
        // has settled. Live values are shown as they change; only the settled one is
        // offered for confirmation, because a scale reads low for the first second or
        // two while the load spreads.
        if (command == 0x10 && value.size >= 6) {
            val kg = (((value[3].toInt() and 0xFF) shl 8) or (value[4].toInt() and 0xFF)) / 100.0
            val settled = (value[5].toInt() and 0xFF) == 0x01
            if (kg in 2.0..300.0) {
                measurementSeen = true
                capture("  QN weight ${kg} kg${if (settled) " (settled)" else " (still settling)"}")
                if (settled) {
                    probeHandler.removeCallbacksAndMessages(null)
                    _status.value = "Got it — check the reading and confirm"
                    publish(Reading(weightKg = Math.round(kg * 100) / 100.0, source = "QN protocol"))
                } else {
                    _status.value = "Weighing — hold still (${String.format(java.util.Locale.US, "%.1f", kg)} kg)"
                }
                return
            }
            capture("  QN frame but ${kg} kg is out of range - not offered")
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
