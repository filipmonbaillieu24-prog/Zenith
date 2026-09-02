package com.zenith.kratos

import com.zenith.kratos.data.*
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * A warmup's weight is this app's to derive. Its reps are the athlete's to prescribe.
 *
 * They set every ARMS warmup to 10 reps on the web, watched it reach Supabase, and still
 * saw 6 on the phone - because recalculateWarmupTargets ran afterwards and assigned a
 * fixed scheme over the top of it.
 */
class WarmupTest {

    private fun warmup(reps: Int) = ActiveSetState(
        type = "warmup", targetWeight = 0.0, targetReps = reps, targetRir = 4
    )

    private fun working() = ActiveSetState(
        type = "working", targetWeight = 100.0, targetReps = 10, targetRir = 2
    )

    @Test
    fun `a single warmup keeps the reps the template asked for`() {
        val sets = listOf(warmup(10), working(), working(), working())
        recalculateWarmupTargets(sets, 100.0, 15.0, false, 55.0, null)
        assertEquals(10, sets[0].targetReps)
    }

    @Test
    fun `a warmup ramp keeps each of its own rep targets`() {
        // Their bench warmups are 10-12 / 5-7 / 2-4, so 10, 5 and 2 - which the old
        // hardcoded scheme happened to match, and would have silently replaced with the
        // same numbers. It must not be doing that by luck.
        val sets = listOf(warmup(12), warmup(6), warmup(3), working())
        recalculateWarmupTargets(sets, 100.0, 2.5, true, 0.0, null)
        assertEquals(listOf(12, 6, 3), sets.take(3).map { it.targetReps })
    }

    @Test
    fun `the weight is still derived from the working set`() {
        val sets = listOf(warmup(10), working())
        recalculateWarmupTargets(sets, 100.0, 15.0, false, 55.0, null)
        // 60% of 100 on a 15 lb stack anchored at 55.
        assertEquals(55.0, sets[0].targetWeight, 0.001)
    }

    @Test
    fun `a warmup with no prescription at all still gets something usable`() {
        val sets = listOf(warmup(0), working())
        recalculateWarmupTargets(sets, 100.0, 15.0, false, 55.0, null)
        assertEquals(6, sets[0].targetReps)
    }

    @Test
    fun `warmup weights never fall below the bottom of the stack`() {
        val sets = listOf(warmup(10), working())
        recalculateWarmupTargets(sets, 60.0, 15.0, false, 55.0, null)
        assertEquals(55.0, sets[0].targetWeight, 0.001)
    }
}
