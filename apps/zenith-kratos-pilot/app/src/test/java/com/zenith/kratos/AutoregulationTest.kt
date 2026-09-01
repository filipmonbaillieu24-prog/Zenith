package com.zenith.kratos

import com.zenith.kratos.data.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Adjusting the next set of the session from the one just finished.
 *
 * Found by walking a hypothetical session through the real rule: a first set of 85 that
 * came in easy rewrote a planned second set of 100 down to 85. The ramp survived between
 * sessions and was then flattened inside one, and the athlete was asked for less than
 * the plan they walked in with.
 */
class AutoregulationTest {

    private fun backExtension(
        w: Double, r: Int, rir: Int,
        nextReps: Int = 11, nextRir: Int = 2,
        planned: Double? = null, askedReps: Int? = 11, askedRir: Int? = 2
    ) = autoregulateNextSet(
        prevWeight = w, prevReps = r, prevRir = rir,
        nextTargetReps = nextReps, nextTargetRir = nextRir,
        incrementWeight = 15.0, incrementPerSide = false,
        minWeight = 40.0, maxWeight = null, mlPrediction = null,
        plannedNextWeight = planned, prevTargetReps = askedReps, prevTargetRir = askedRir
    )

    @Test
    fun `a good set never makes the next one lighter than the plan`() {
        // The case that prompted this. 85x11 at RIR 4 against a target of 11 @ RIR 2:
        // everything asked for, and more reserve than asked. Set two stays at 100.
        val next = backExtension(85.0, 11, 4, planned = 100.0)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(11, next.reps)
    }

    @Test
    fun `the ramp is held across every rung`() {
        assertEquals(100.0, backExtension(85.0, 11, 4, planned = 100.0).weight, 0.001)
        assertEquals(115.0, backExtension(100.0, 11, 4, planned = 115.0).weight, 0.001)
    }

    @Test
    fun `a set that fell short may still bring the next one down`() {
        // Asked for 11 at RIR 2, managed 7 with nothing left. The plan is no longer
        // credible and the next set should reflect what just happened.
        val next = backExtension(85.0, 7, 0, planned = 100.0)
        assertTrue("held at ${next.weight} after a set that fell apart", next.weight < 100.0)
    }

    @Test
    fun `less reserve than asked also releases the floor`() {
        val next = backExtension(85.0, 11, 0, planned = 100.0)
        assertTrue("held at ${next.weight} despite nothing in reserve", next.weight < 100.0)
    }

    @Test
    fun `autoregulation can still raise a set above its plan`() {
        // Only lowering is held back. A set far beyond what was asked should be allowed
        // to push the next one up.
        val next = backExtension(100.0, 20, 5, planned = 100.0)
        assertTrue("stuck at ${next.weight}", next.weight > 100.0)
    }

    @Test
    fun `straight sets behave as they did before`() {
        // No plan passed, no ramp: unchanged behaviour, reps climb when the stack has
        // no notch small enough.
        val next = backExtension(100.0, 11, 4, planned = null)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(13, next.reps)
    }

    @Test
    fun `a rep bump never exceeds the set's own rep range`() {
        // Rear Delt Flye's third set is 9-11 where the first two are 11-13 - a lower
        // range chosen on purpose. Capping at targetReps + 4 prescribed 13 for it.
        val next = autoregulateNextSet(
            prevWeight = 100.0, prevReps = 12, prevRir = 3,
            nextTargetReps = 11, nextTargetRir = 2,
            incrementWeight = 15.0, incrementPerSide = false,
            minWeight = 55.0, maxWeight = null, mlPrediction = null,
            plannedNextWeight = 100.0, prevTargetReps = 11, prevTargetRir = 2,
            nextMaxReps = 11
        )
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(11, next.reps)
    }

    @Test
    fun `without a known range the old cap still applies`() {
        val next = autoregulateNextSet(
            prevWeight = 100.0, prevReps = 12, prevRir = 3,
            nextTargetReps = 11, nextTargetRir = 2,
            incrementWeight = 15.0, incrementPerSide = false,
            minWeight = 55.0, maxWeight = null, mlPrediction = null,
            plannedNextWeight = 100.0, prevTargetReps = 11, prevTargetRir = 2,
            nextMaxReps = null
        )
        assertEquals(13, next.reps)
    }

    @Test
    fun `an unknown plan is simply not used`() {
        val withPlan = backExtension(85.0, 11, 4, planned = null)
        assertEquals(85.0, withPlan.weight, 0.001)
    }
}
