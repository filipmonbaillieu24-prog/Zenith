package com.zenith.kratos

import com.zenith.kratos.data.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Reserve well above target means the weight has not been found yet, not that the
 * session went well. The athlete's own reading: "RIR 4 means we are still looking for
 * the correct weight to get within target."
 *
 * So the answer is to solve for the weight the set points at, rather than step one notch
 * and ask again next week.
 */
class CalibrationTest {

    private val stack15: (Double) -> Double = { w -> 40.0 + Math.round((w - 40.0) / 15.0) * 15.0 }

    private fun backExtension(prev: SetOutcome) =
        nextSetTarget(prev, 11, 13, 2, 15.0, stack15)

    @Test
    fun `the real PULL session lands on the weight the sets point at`() {
        // 2026-09-01, all three sets 15 reps at RIR 4 against a range of 11-13 @ RIR 2.
        assertEquals(85.0, backExtension(SetOutcome(70.0, 15, 4)).weight, 0.001)
        assertEquals(100.0, backExtension(SetOutcome(85.0, 15, 4)).weight, 0.001)
        assertEquals(115.0, backExtension(SetOutcome(100.0, 15, 4)).weight, 0.001)
    }

    @Test
    fun `calibration targets the bottom of the rep range`() {
        // A working set starts at the floor and climbs; that is the weight being solved for.
        assertEquals(11, backExtension(SetOutcome(100.0, 15, 4)).reps)
    }

    @Test
    fun `an easy set the stack cannot answer with weight is answered with reps`() {
        // 100x11 at RIR 4 implies about 105, and a 15 lb machine has no 105. Rounding
        // back to 100 and then prescribing the floor of the range would ask for fewer
        // reps than were just done, so the ordinary rule takes over and climbs instead.
        val t = backExtension(SetOutcome(100.0, 11, 4))
        assertEquals(100.0, t.weight, 0.001)
        assertTrue("no progress at all: ${t.weight}x${t.reps}", t.reps > 11)
    }

    @Test
    fun `one rep either side of target is ordinary variation, not calibration`() {
        // RIR 3 against a target of 2 is a normal set: climb the reps, hold the weight.
        val t = backExtension(SetOutcome(100.0, 11, 3))
        assertEquals(100.0, t.weight, 0.001)
        assertTrue(t.reps > 11)
    }

    @Test
    fun `a set at target reserve is left entirely alone`() {
        val t = backExtension(SetOutcome(100.0, 12, 2))
        assertEquals(100.0, t.weight, 0.001)
        assertEquals(13, t.reps)
    }

    @Test
    fun `a mistyped reserve cannot move the bar by half`() {
        // 8 in reserve where 0 was meant. Capped at a fifth, not acted on literally.
        val t = backExtension(SetOutcome(100.0, 15, 8))
        assertTrue("jumped to ${t.weight} off one entry", t.weight <= 100.0 * 1.20 + 15.0)
    }

    @Test
    fun `calibration never lightens the bar`() {
        for (reps in 11..20) {
            for (rir in 4..8) {
                val t = backExtension(SetOutcome(100.0, reps, rir))
                assertTrue("${reps}x@$rir -> ${t.weight}", t.weight >= 100.0)
            }
        }
    }

    @Test
    fun `calibration closes a real gap in one or two sessions`() {
        // Someone who is genuinely four reps light should not spend two months creeping.
        var w = 70.0
        var sessions = 0
        while (sessions < 5) {
            val t = backExtension(SetOutcome(w, 15, 4))
            if (t.weight == w) break
            w = t.weight
            sessions++
            if (w >= 115.0) break
        }
        assertTrue("took $sessions sessions to reach $w", sessions <= 3 && w >= 115.0)
    }

    // ── The ramp stays a ramp ─────────────────────────────────────────────────

    private val rampSpecs = listOf(SetSpec(11, 13, 2), SetSpec(11, 13, 2), SetSpec(11, 13, 2))

    @Test
    fun `an ascending ramp keeps its shape when the top set moves`() {
        val history = listOf(
            listOf(SetOutcome(70.0, 15, 4)),
            listOf(SetOutcome(85.0, 15, 4)),
            listOf(SetOutcome(100.0, 15, 4))
        )
        val t = nextExerciseTargets(history, rampSpecs, 15.0, stack15)
        assertEquals(listOf(85.0, 100.0, 115.0), t.map { it.weight })
    }

    @Test
    fun `a stalled top set holds the whole ramp instead of flattening it`() {
        // Top set grinding at the ceiling, lower sets still easy. Progressing those
        // independently turns 70/85/100 into 100/115/115 - every set a top set.
        val history = listOf(
            listOf(SetOutcome(70.0, 13, 4)),
            listOf(SetOutcome(85.0, 13, 4)),
            listOf(SetOutcome(100.0, 13, 0))
        )
        val t = nextExerciseTargets(history, rampSpecs, 15.0, stack15)
        assertEquals(listOf(70.0, 85.0, 100.0), t.map { it.weight })
    }

    @Test
    fun `ramp steps never collapse into each other`() {
        val history = listOf(
            listOf(SetOutcome(85.0, 15, 4)),
            listOf(SetOutcome(100.0, 15, 4)),
            listOf(SetOutcome(115.0, 15, 4))
        )
        val t = nextExerciseTargets(history, rampSpecs, 15.0, stack15)
        for (i in 1 until t.size) {
            assertTrue("${t.map { it.weight }} is no longer ascending", t[i].weight > t[i - 1].weight)
        }
    }

    @Test
    fun `straight sets are left to progress independently`() {
        // Same weight across sets is not a ramp, and each set keeps its own history.
        val history = listOf(
            listOf(SetOutcome(100.0, 12, 2)),
            listOf(SetOutcome(100.0, 11, 1)),
            listOf(SetOutcome(100.0, 10, 0))
        )
        val t = nextExerciseTargets(history, rampSpecs, 15.0, stack15)
        assertEquals(100.0, t[0].weight, 0.001)
        assertEquals(100.0, t[2].weight, 0.001)
    }
}
