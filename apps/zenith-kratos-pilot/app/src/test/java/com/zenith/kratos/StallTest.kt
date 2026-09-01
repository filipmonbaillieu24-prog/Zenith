package com.zenith.kratos

import com.zenith.kratos.data.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A lift that has stopped moving, and what the app should say about it.
 *
 * The two stalls pull in opposite directions. Grinding out the top of the rep range with
 * nothing in reserve, week after week, means the reps are never going to come and the
 * weight should go up despite the usual rule saying hold. Falling short of the floor
 * week after week means the opposite - and that one is the athlete's call, because
 * dropping the weight is the single change that makes the next session easier than the
 * last, which is the thing this whole rule exists to prevent.
 */
class StallTest {

    private val stack15: (Double) -> Double = { w -> 40.0 + Math.round((w - 40.0) / 15.0) * 15.0 }

    private fun target(history: List<SetOutcome>, floor: Int = 11, ceiling: Int = 13) =
        nextSetTarget(history, floor, ceiling, 2, 15.0, stack15)

    // ── Grinding at the ceiling ───────────────────────────────────────────────

    @Test
    fun `two grinding sessions is not yet a stall`() {
        val t = target(listOf(SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 0)))
        assertEquals(StallState.NONE, t.stall)
        assertEquals(100.0, t.weight, 0.001)
    }

    @Test
    fun `three grinding sessions moves the weight even though reserve says hold`() {
        val t = target(listOf(SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 0)))
        assertEquals(StallState.GRINDING, t.stall)
        assertEquals(115.0, t.weight, 0.001)
        assertTrue(t.reason.contains("nothing in reserve"))
    }

    @Test
    fun `a grinding run is broken by one session that moved`() {
        // Ceiling, ceiling, then a session with reserve: not stuck, just strong.
        val t = target(listOf(SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 3)))
        assertEquals(StallState.NONE, t.stall)
    }

    @Test
    fun `a grinding run only counts sessions at the same weight`() {
        val t = target(listOf(SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 0), SetOutcome(85.0, 13, 0)))
        assertEquals(StallState.NONE, t.stall)
    }

    // ── Missing the floor ─────────────────────────────────────────────────────

    @Test
    fun `three sessions short of the floor is flagged but the weight is not dropped`() {
        val t = target(listOf(SetOutcome(100.0, 8, 0), SetOutcome(100.0, 9, 0), SetOutcome(100.0, 8, 1)))
        assertEquals(StallState.MISSING_TARGET, t.stall)
        // The guarantee still holds: nothing lighter, and the floor is still the ask.
        assertEquals(100.0, t.weight, 0.001)
        assertEquals(11, t.reps)
        assertNotNull(t.advice)
        assertTrue(t.advice!!.contains("your call"))
    }

    @Test
    fun `one bad session is not a stall`() {
        val t = target(listOf(SetOutcome(100.0, 8, 0), SetOutcome(100.0, 12, 2), SetOutcome(100.0, 11, 2)))
        assertEquals(StallState.NONE, t.stall)
        assertNull(t.advice)
    }

    @Test
    fun `a stall never produces a lighter recommendation`() {
        // Whatever the app says about being stuck, it does not act on it by unloading
        // the bar. That decision stays with the athlete.
        val histories = listOf(
            listOf(SetOutcome(100.0, 4, 0), SetOutcome(100.0, 5, 0), SetOutcome(100.0, 3, 0)),
            listOf(SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 0)),
            listOf(SetOutcome(100.0, 8, 2), SetOutcome(100.0, 8, 1), SetOutcome(100.0, 9, 0))
        )
        for (h in histories) {
            val t = target(h)
            assertTrue("${h.first().weight} -> ${t.weight} is lighter", t.weight >= h.first().weight)
        }
    }

    // ── Degenerate input ──────────────────────────────────────────────────────

    @Test
    fun `an empty history does not crash`() {
        val t = nextSetTarget(emptyList(), 11, 13, 2, 15.0, stack15)
        assertEquals(11, t.reps)
    }

    @Test
    fun `a single session behaves exactly as the one-session rule does`() {
        val one = SetOutcome(100.0, 11, 4)
        val fromHistory = target(listOf(one))
        val fromSingle = nextSetTarget(one, 11, 13, 2, 15.0, stack15)
        assertEquals(fromSingle.weight, fromHistory.weight, 0.001)
        assertEquals(fromSingle.reps, fromHistory.reps)
        assertEquals(StallState.NONE, fromHistory.stall)
    }

    @Test
    fun `a grind stall on a stack that cannot go up says so instead of pretending`() {
        // A snap that refuses to move: the advice has to carry the message.
        val frozen: (Double) -> Double = { 100.0 }
        val t = nextSetTarget(
            listOf(SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 0), SetOutcome(100.0, 13, 0)),
            11, 13, 2, 15.0, frozen
        )
        assertEquals(StallState.GRINDING, t.stall)
        assertEquals(100.0, t.weight, 0.001)
        assertNotNull(t.advice)
    }
}
