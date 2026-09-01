package com.zenith.kratos

import com.zenith.kratos.data.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rule against the exercises this athlete actually has configured, and against the
 * sessions people actually have: a bad day, a great day, a set logged without thinking
 * about reserve, a machine whose stack cannot make small jumps.
 *
 * The numbers below are the real kratos_exercises rows, because a progression rule that
 * only works on tidy 2.5 kg plates is not a rule that works in this gym.
 */
class ProgressionScenarioTest {

    /** Mirrors snapToHardwareStep for the cases these tests exercise. */
    private fun stack(increment: Double, perSide: Boolean, min: Double?): (Double) -> Double = { w ->
        if (w <= 0.0) 0.0
        else {
            val step = if (perSide) increment * 2.0 else increment
            val effective = if (step <= 0.0) 2.5 else step
            val anchor = min ?: 0.0
            val snapped = anchor + Math.round((w - anchor) / effective) * effective
            if (min != null && snapped < min) min else snapped
        }
    }

    private data class Gym(
        val name: String,
        val increment: Double,
        val perSide: Boolean,
        val min: Double?
    ) {
        val step: Double get() = if (perSide) increment * 2.0 else increment
    }

    private val gyms = listOf(
        Gym("Back Extension (15 lb stack, min 40)", 15.0, false, 40.0),
        Gym("Chest Fly (15 lb stack, min 55)", 15.0, false, 55.0),
        Gym("Lateral Raise (1 kg per side, min 2)", 1.0, true, 2.0),
        Gym("Bench Press (1.25 kg per side, min 0)", 1.25, true, 0.0),
        Gym("Preacher Curl (5 kg, min 5)", 5.0, false, 5.0),
        Gym("Triceps Pushdown (5 lb, min 15)", 5.0, false, 15.0)
    )

    private fun target(g: Gym, prev: SetOutcome, floor: Int, ceiling: Int) =
        nextSetTarget(prev, floor, ceiling, 2, g.step, stack(g.increment, g.perSide, g.min))

    // ── A session that went badly ─────────────────────────────────────────────

    @Test
    fun `a session well short of the floor keeps the weight and re-asks for the floor`() {
        // Nothing left in the tank and only 5 of 11. The answer is to do it again, not
        // to quietly drop the weight - that is how a working weight erodes.
        val g = gyms[0]
        val next = target(g, SetOutcome(100.0, 5, 0), 11, 13)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(11, next.reps)
    }

    @Test
    fun `one rep short still holds the weight rather than dropping it`() {
        val g = gyms[0]
        val next = target(g, SetOutcome(100.0, 10, 0), 11, 13)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(11, next.reps)
    }

    @Test
    fun `a catastrophic set does not produce a lighter recommendation`() {
        for (g in gyms) {
            val next = target(g, SetOutcome(60.0, 1, 0), 11, 13)
            assertTrue(
                "${g.name}: 60x1 -> ${next.weight}, lighter than what was lifted",
                next.weight >= 60.0
            )
        }
    }

    // ── Reserve, across its whole range ───────────────────────────────────────

    @Test
    fun `more reserve never yields a lighter weight`() {
        // The bug that started this was reserve read backwards - 4 reps in reserve
        // counted as a failed set. Being further from failure must never buy less.
        for (g in gyms) {
            for ((floor, ceiling) in listOf(8 to 12, 11 to 13, 5 to 8)) {
                for (reps in floor..ceiling) {
                    var lightest = Double.NEGATIVE_INFINITY
                    for (rir in 0..5) {
                        val t = target(g, SetOutcome(100.0, reps, rir), floor, ceiling)
                        assertTrue(
                            "${g.name} ${reps} reps ($floor-$ceiling): RIR $rir gave ${t.weight}, " +
                                "lighter than RIR ${rir - 1} gave ($lightest)",
                            t.weight >= lightest
                        )
                        lightest = t.weight
                    }
                }
            }
        }
    }

    @Test
    fun `at the same weight more reserve never yields fewer reps`() {
        // Only meaningful where the weight is unchanged: once a set calibrates, the reps
        // reset to the floor of the range on purpose, at a heavier load.
        for (g in gyms) {
            for ((floor, ceiling) in listOf(8 to 12, 11 to 13, 5 to 8)) {
                for (reps in floor..ceiling) {
                    val byWeight = mutableMapOf<Double, Int>()
                    for (rir in 0..5) {
                        val t = target(g, SetOutcome(100.0, reps, rir), floor, ceiling)
                        val seen = byWeight[t.weight]
                        if (seen != null) {
                            assertTrue(
                                "${g.name} ${reps} reps ($floor-$ceiling): at ${t.weight} " +
                                    "RIR $rir asked for ${t.reps}, fewer than a lower RIR asked ($seen)",
                                t.reps >= seen
                            )
                        }
                        byWeight[t.weight] = t.reps
                    }
                }
            }
        }
    }

    @Test
    fun `a heavier recommendation still holds the estimated max, unless the range caps it`() {
        // This is what stops a weight rise from being a net loss. Going up 2.5 kg and
        // dropping four reps is less work than staying put; the reps come back only as
        // far as the heavier bar actually costs. The exception is a rep ceiling that
        // simply has no room left - then the extra weight is the whole gain.
        for (g in gyms) {
            for ((floor, ceiling) in listOf(8 to 12, 11 to 13)) {
                for (reps in floor..ceiling) {
                    for (rir in 0..5) {
                        val prev = SetOutcome(100.0, reps, rir)
                        val t = target(g, prev, floor, ceiling)
                        if (t.weight <= prev.weight) continue
                        // One hardware step of tolerance: a calibrated weight is solved
                        // for and then snapped to a notch the machine actually has, and
                        // that rounding can land just under the mark.
                        val held = estimatedOneRepMax(t.weight + g.step, t.reps, 2) >=
                            estimatedOneRepMax(prev.weight, prev.reps, prev.rir)
                        assertTrue(
                            "${g.name}: ${prev.weight}x${prev.reps}@$rir -> ${t.weight}x${t.reps} " +
                                "loses estimated max with reps still below the ceiling",
                            held || t.reps >= ceiling
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `zero reserve at the top of the range holds instead of piling on weight`() {
        val g = gyms[0]
        val next = target(g, SetOutcome(100.0, 13, 0), 11, 13)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(13, next.reps)
    }

    @Test
    fun `a single rep in reserve at the top of the range earns the step`() {
        // 15 lb off 100 is a 15% rise, so the reps do drop to the floor of the range.
        val g = gyms[0]
        val next = target(g, SetOutcome(100.0, 13, 1), 11, 13)
        assertEquals(115.0, next.weight, 0.001)
        assertEquals(11, next.reps)
    }

    @Test
    fun `a small rise costs only the reps it is worth`() {
        // 2.5 kg off 100 is 2.5%. Resetting to the floor of the range would trade a 33%
        // drop in reps for it, which is a worse session than the one before.
        val bench = gyms[3]
        val next = target(bench, SetOutcome(100.0, 12, 1), 8, 12)
        assertEquals(102.5, next.weight, 0.001)
        assertTrue("dropped to ${next.reps} reps for a 2.5% rise", next.reps >= 10)
    }

    // ── Small increments, where a double step is affordable ───────────────────

    @Test
    fun `fine increments allow the double step that coarse stacks do not`() {
        // Inside the target reserve band, where stepping is the right instrument.
        val bench = gyms[3] // 1.25 per side, so 2.5 a step
        val easy = target(bench, SetOutcome(100.0, 12, 3), 8, 12)
        assertEquals(105.0, easy.weight, 0.001)

        val stackCase = gyms[0] // 15 lb a step
        val coarse = target(stackCase, SetOutcome(100.0, 13, 3), 11, 13)
        assertEquals(115.0, coarse.weight, 0.001)
    }

    @Test
    fun `a light dumbbell lift is not doubled off a tiny working weight`() {
        // 6 kg lateral raise, 2 kg a step - a third of the load. The implied weight is
        // about 6.9, which the hardware cannot make, so this ends up as a single step
        // rather than a calibrated jump. One step is the smallest move available.
        val raise = gyms[2]
        val next = target(raise, SetOutcome(6.0, 12, 4), 8, 12)
        assertEquals(8.0, next.weight, 0.001)
    }

    // ── Hardware honesty ──────────────────────────────────────────────────────

    @Test
    fun `recommendations always land on a weight the hardware can make`() {
        for (g in gyms) {
            for (reps in 6..14) {
                for (rir in 0..4) {
                    val prev = SetOutcome(100.0, reps, rir)
                    val next = target(g, prev, 8, 12)
                    val anchor = g.min ?: 0.0
                    // Either a real notch on the stack, or the untouched previous weight
                    // that the athlete themselves managed to load.
                    val offGrid = Math.abs((next.weight - anchor) / g.step - Math.round((next.weight - anchor) / g.step)) > 1e-6
                    assertTrue(
                        "${g.name}: ${next.weight} is not on the grid and is not the previous weight",
                        !offGrid || next.weight == prev.weight
                    )
                }
            }
        }
    }

    @Test
    fun `never recommends below the bottom of the stack`() {
        for (g in gyms) {
            val min = g.min ?: continue
            val next = target(g, SetOutcome(min, 12, 4), 8, 12)
            assertTrue("${g.name}: ${next.weight} is under the stack minimum $min", next.weight >= min)
        }
    }

    // ── Multi-session arcs ────────────────────────────────────────────────────

    @Test
    fun `following the rule week after week actually moves the weight up`() {
        // An athlete who keeps 3 reps in reserve should not sit still for months.
        val g = gyms[0]
        var weight = 100.0
        var reps = 11
        repeat(6) {
            val next = target(g, SetOutcome(weight, reps, 3), 11, 13)
            weight = next.weight
            reps = next.reps
        }
        assertTrue("weight never moved off 100 in six sessions", weight > 100.0)
    }

    @Test
    fun `a bad week does not undo the weeks before it`() {
        val g = gyms[0]
        // Built up to 115, then a poor session at 115.
        val afterBadDay = target(g, SetOutcome(115.0, 7, 0), 11, 13)
        assertEquals(115.0, afterBadDay.weight, 0.001)
        // And recovering from it climbs again rather than starting over.
        val recovered = target(g, SetOutcome(115.0, 11, 3), 11, 13)
        assertTrue(recovered.weight > 115.0 || recovered.reps > 11)
    }

    // ── An exercise with no history ───────────────────────────────────────────

    @Test
    fun `a brand new exercise starts at the bottom of its own stack`() {
        // Was a bare 20.0 everywhere. Three of this athlete's machines start at 55 lb,
        // where 20 is not a position that exists; a lateral raise starts at 2 kg, where
        // it is far too heavy.
        assertEquals(55.0, startingWeightFor(55.0, 15.0, false), 0.001)
        assertEquals(40.0, startingWeightFor(40.0, 15.0, false), 0.001)
        assertEquals(2.0, startingWeightFor(2.0, 1.0, true), 0.001)
        assertEquals(5.0, startingWeightFor(5.0, 5.0, false), 0.001)
    }

    @Test
    fun `an exercise with no configured minimum starts off two steps`() {
        // Bench press has min 0 and 1.25 per side, so a step is 2.5.
        assertEquals(5.0, startingWeightFor(0.0, 1.25, true), 0.001)
        assertEquals(5.0, startingWeightFor(null, 1.25, true), 0.001)
        // And a missing increment does not produce a zero starting weight.
        assertTrue(startingWeightFor(null, 0.0, false) > 0.0)
    }

    @Test
    fun `an outlier session is skipped in favour of the newest real one`() {
        data class S(val label: String, val sets: List<SetOutcome>)
        val history = listOf(
            S("newest, went badly", listOf(SetOutcome(100.0, 4, 0))),
            S("solid", listOf(SetOutcome(100.0, 12, 2))),
            S("ancient overreach", listOf(SetOutcome(140.0, 6, 0)))
        )
        assertEquals("solid", chooseBaselineSession(history, { it.sets }, { 11 })?.label)
    }
}
