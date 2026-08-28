package com.zenith.pulse.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Bluetooth SIG decoders, checked against frames built by hand from the published
 * characteristic definitions.
 *
 * These matter more than most tests here because the scale cannot be asked what it
 * means. If the standard formats are decoded wrongly, the failure is not a crash - it
 * is a plausible-looking weight that is quietly off by a factor, written into a
 * bodyweight history that other models then train on.
 */
class ScaleDecodeTest {

    private val mgr = ScaleBleManager.Companion

    private fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }

    // ── Weight Measurement, 0x2A9D ──────────────────────────────────────────────

    @Test
    fun `decodes an SI weight at the specified 0_005 kg resolution`() {
        // flags = 0 (SI, no optional fields); 86.3 kg / 0.005 = 17260 = 0x436C
        val r = mgr.decodeWeightMeasurement(bytes(0x00, 0x6C, 0x43))
        assertEquals(86.3, r!!.weightKg!!, 0.001)
    }

    @Test
    fun `decodes an imperial weight and converts it to kilograms`() {
        // flags bit0 = 1 (imperial); 190.25 lb / 0.01 = 19025 = 0x4A51
        val r = mgr.decodeWeightMeasurement(bytes(0x01, 0x51, 0x4A))
        assertEquals(190.25 * 0.45359237, r!!.weightKg!!, 0.01)
    }

    @Test
    fun `rejects a frame too short to hold a weight`() {
        assertNull(mgr.decodeWeightMeasurement(bytes(0x00, 0x6C)))
    }

    @Test
    fun `rejects an implausible weight rather than recording it`() {
        // 0xFFFF is the "value not available" marker, and at 0.005 kg resolution it
        // decodes to a believable-looking 327 kg - which an earlier 400 kg bound let
        // straight through. A bad weight here is not a crash: it is a plausible number
        // written into the history the trend models learn from.
        assertNull(mgr.decodeWeightMeasurement(bytes(0x00, 0xFF, 0xFF)))
        assertNull(mgr.decodeWeightMeasurement(bytes(0x00, 0x00, 0x00)))
        // 15 kg: a real value, but not a person standing on a bathroom scale.
        assertNull(mgr.decodeWeightMeasurement(bytes(0x00, 0xB8, 0x0B)))
    }

    // ── Body Composition Measurement, 0x2A9C ────────────────────────────────────

    @Test
    fun `decodes body fat with no optional fields present`() {
        // flags = 0x0000; fat 20.3% / 0.1 = 203 = 0x00CB
        val r = mgr.decodeBodyComposition(bytes(0x00, 0x00, 0xCB, 0x00))
        assertEquals(20.3, r!!.bodyFatPercent!!, 0.001)
        assertNull(r.weightKg)
    }

    @Test
    fun `walks the optional fields in specification order to find weight`() {
        // The offsets of later fields depend on which earlier flags are set, so this is
        // the case that actually exercises the parser rather than the first two bytes.
        // flags = 0x0410 -> muscle percentage (0x0010) + weight (0x0400)
        // fat 20.3% = 203 = 0x00CB; muscle 41.2% = 412 = 0x019C; 86.3 kg / 0.005 = 0x436C
        val r = mgr.decodeBodyComposition(
            bytes(0x10, 0x04, 0xCB, 0x00, 0x9C, 0x01, 0x6C, 0x43)
        )
        assertEquals(20.3, r!!.bodyFatPercent!!, 0.001)
        assertEquals(41.2, r.musclePercent!!, 0.001)
        assertEquals(86.3, r.weightKg!!, 0.001)
    }

    @Test
    fun `derives body water percentage from the reported water mass and weight`() {
        // flags = 0x0500 -> body water mass (0x0100) + weight (0x0400)
        // fat 20.3%; water 51.8 kg / 0.005 = 10360 = 0x2878; weight 86.3 kg = 0x436C
        val r = mgr.decodeBodyComposition(
            bytes(0x00, 0x05, 0xCB, 0x00, 0x78, 0x28, 0x6C, 0x43)
        )
        assertEquals(60.0, r!!.bodyWaterPercent!!, 0.1)
    }

    @Test
    fun `reads impedance when the scale reports it instead of a fat figure`() {
        // flags = 0x0200 -> impedance only. 500.0 ohms / 0.1 = 5000 = 0x1388
        val r = mgr.decodeBodyComposition(bytes(0x00, 0x02, 0xCB, 0x00, 0x88, 0x13))
        assertEquals(500.0, r!!.impedanceOhms!!, 0.01)
    }

    @Test
    fun `discards an out-of-range body fat rather than reporting it`() {
        // 900 * 0.1 = 90%, which no living person measures.
        val r = mgr.decodeBodyComposition(bytes(0x00, 0x00, 0x84, 0x03))
        assertNull(r!!.bodyFatPercent)
    }

    @Test
    fun `survives a truncated frame without throwing`() {
        // A frame whose flags promise fields the payload does not contain. Real devices
        // do send these, and an index-out-of-bounds here would kill the BLE callback.
        val r = mgr.decodeBodyComposition(bytes(0xFF, 0x0F, 0xCB, 0x00))
        assertTrue(r == null || r.bodyFatPercent != null)
    }
}
