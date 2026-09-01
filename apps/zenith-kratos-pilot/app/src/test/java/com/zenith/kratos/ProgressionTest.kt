package com.zenith.kratos

import com.zenith.kratos.data.*
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The case that prompted this: Pin Loaded - Back Extension, 11-13 reps, target RIR 2,
 * 15 lb stack anchored at 40. Three sessions, newest first.
 */
class ProgressionTest {

    private val snap15: (Double) -> Double = { w -> 40.0 + Math.round((w - 40.0) / 15.0) * 15.0 }

    @Test
    fun `climbs the rep range when there is reserve left`() {
        // 24 Aug: 100x11 with 4 in reserve. Floor of the range, plenty in hand.
        val next = nextSetTarget(SetOutcome(100.0, 11, 4), 11, 13, 2, 15.0, snap15)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(13, next.reps)
    }

    @Test
    fun `adds one rep when the set was closer to failure`() {
        val next = nextSetTarget(SetOutcome(100.0, 11, 1), 11, 13, 2, 15.0, snap15)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(12, next.reps)
    }

    @Test
    fun `adds weight once the top of the range is reached`() {
        val next = nextSetTarget(SetOutcome(100.0, 13, 2), 11, 13, 2, 15.0, snap15)
        assertEquals(115.0, next.weight, 0.001)
        assertEquals(11, next.reps)
    }

    @Test
    fun `will not double step when the step is a big share of the load`() {
        // Two 15 lb steps off 100 lb is a 30% jump. One step is already 15% and is the
        // smallest the stack can do, so it stands - but it is not doubled.
        val next = nextSetTarget(SetOutcome(100.0, 13, 4), 11, 13, 2, 15.0, snap15)
        assertEquals(115.0, next.weight, 0.001)
        assertEquals(11, next.reps)
    }

    @Test
    fun `takes two steps when the increment is small enough to justify it`() {
        // 2.5 kg steps off 100 kg is 5%: a double step there is reasonable. The reps
        // stay high, because 5 kg does not cost four reps - dropping to the floor of
        // the range for it would be a lighter session than the one before.
        val fine: (Double) -> Double = { w -> Math.round(w / 2.5) * 2.5 }
        val next = nextSetTarget(SetOutcome(100.0, 13, 4), 11, 13, 2, 2.5, fine)
        assertEquals(105.0, next.weight, 0.001)
        assertEquals(13, next.reps)
    }

    @Test
    fun `holds when the top of the range took everything`() {
        val next = nextSetTarget(SetOutcome(100.0, 13, 0), 11, 13, 2, 15.0, snap15)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(13, next.reps)
    }

    @Test
    fun `repeats the weight after a session that fell short`() {
        // The answer to a hard day is to do it again, not to lighten the bar.
        val next = nextSetTarget(SetOutcome(100.0, 8, 0), 11, 13, 2, 15.0, snap15)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(11, next.reps)
    }

    @Test
    fun `never suggests more than two steps in one session`() {
        val fine: (Double) -> Double = { w -> Math.round(w / 2.5) * 2.5 }
        val next = nextSetTarget(SetOutcome(100.0, 20, 5), 11, 13, 2, 2.5, fine)
        assertEquals(100.0 + MAX_STEPS_PER_SESSION * 2.5, next.weight, 0.001)
    }

    @Test
    fun `a set above the top of the range is not answered with fewer reps`() {
        // 14 reps where the range ends at 13, with nothing in reserve. Holding at the
        // ceiling would ask for 13 - one fewer than was just done.
        val next = nextSetTarget(SetOutcome(100.0, 14, 0), 11, 13, 2, 15.0, snap15)
        assertEquals(100.0, next.weight, 0.001)
        assertEquals(14, next.reps)
    }

    @Test
    fun `snapping down the grid never costs the athlete weight`() {
        // A stack anchored at 40 in steps of 15 has no 102, and rounding finds 100.
        val next = nextSetTarget(SetOutcome(102.0, 11, 1), 11, 13, 2, 15.0, snap15)
        assert(next.weight >= 102.0) { "snapped to ${next.weight}, below the 102.0 just lifted" }
    }

    @Test
    fun `following the recommendation is never less work than last time`() {
        // The guarantee, over every combination that can occur.
        val snaps = listOf<Pair<String, (Double) -> Double>>(
            "15lb stack" to snap15,
            "2.5kg plates" to { w -> Math.round(w / 2.5) * 2.5 },
            "coarse" to { w -> Math.round(w / 20.0) * 20.0 }
        )
        for ((stackName, snap) in snaps) {
            for (weight in listOf(20.0, 47.5, 100.0, 102.0, 137.5)) {
                for (reps in 1..20) {
                    for (rir in 0..5) {
                        for ((floor, ceiling) in listOf(5 to 8, 8 to 12, 11 to 13, 10 to 10)) {
                            val step = if (stackName == "15lb stack") 15.0 else 2.5
                            val prev = SetOutcome(weight, reps, rir)
                            val next = nextSetTarget(prev, floor, ceiling, 2, step, snap)

                            assert(next.weight >= prev.weight) {
                                "$stackName: ${prev.weight}x${prev.reps}@$rir ($floor-$ceiling) " +
                                    "-> ${next.weight}, lighter than last time"
                            }
                            if (next.weight == prev.weight) {
                                assert(next.reps >= prev.reps) {
                                    "$stackName: ${prev.weight}x${prev.reps}@$rir ($floor-$ceiling) " +
                                        "-> same weight for ${next.reps} reps, fewer than last time"
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ── Baseline selection ────────────────────────────────────────────────────

    private data class Session(val label: String, val sets: List<SetOutcome>)

    private val history = listOf(
        Session("24 Aug", listOf(SetOutcome(70.0, 11, 4), SetOutcome(85.0, 11, 4), SetOutcome(100.0, 11, 4))),
        Session("15 Aug", listOf(SetOutcome(70.0, 10, 4), SetOutcome(85.0, 10, 4), SetOutcome(100.0, 10, 4))),
        Session("05 Aug", listOf(SetOutcome(70.0, 8, 4), SetOutcome(85.0, 8, 4), SetOutcome(115.0, 8, 4)))
    )

    @Test
    fun `takes the newest session that did the work, not the heaviest`() {
        // 05 Aug has by far the highest e1RM (115x8 at RIR 4), and choosing by that is
        // what produced a 115x8 recommendation three weeks after the athlete had gone
        // back to 100 and stayed there.
        val chosen = chooseBaselineSession(history, { it.sets }, { 11 })
        assertEquals("24 Aug", chosen?.label)
    }

    @Test
    fun `skips a session where every set fell short`() {
        val withBadDay = listOf(
            Session("today-ish", listOf(SetOutcome(100.0, 5, 0))),
            Session("24 Aug", listOf(SetOutcome(100.0, 11, 4)))
        )
        assertEquals("24 Aug", chooseBaselineSession(withBadDay, { it.sets }, { 11 })?.label)
    }

    @Test
    fun `falls back to the newest session when none reached the floor`() {
        val allShort = listOf(
            Session("newest", listOf(SetOutcome(100.0, 9, 1))),
            Session("older", listOf(SetOutcome(100.0, 8, 1)))
        )
        assertEquals("newest", chooseBaselineSession(allShort, { it.sets }, { 11 })?.label)
    }

    @Test
    fun `the whole PULL back extension case end to end`() {
        val chosen = chooseBaselineSession(history, { it.sets }, { 11 })!!
        val targets = chosen.sets.map { nextSetTarget(it, 11, 13, 2, 15.0, snap15) }

        // What it used to offer: 70x8, 85x8, 115x8 - lighter reps than the 11 just
        // logged, off a session three weeks old.
        assertEquals(listOf(70.0, 85.0, 100.0), targets.map { it.weight })
        assertEquals(listOf(13, 13, 13), targets.map { it.reps })

        // And every set asks for more than was done on 24 August.
        chosen.sets.zip(targets).forEach { (prev, next) ->
            assert(next.weight > prev.weight || next.reps > prev.reps) {
                "${prev.weight}x${prev.reps} -> ${next.weight}x${next.reps} is not progress"
            }
        }
    }
}
