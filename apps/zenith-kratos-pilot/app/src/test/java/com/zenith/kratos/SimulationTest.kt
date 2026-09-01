package com.zenith.kratos

import com.zenith.kratos.data.*
import org.junit.Test

/**
 * A scratchpad for walking a hypothetical session through the real rule.
 *
 * Prints rather than asserts: it exists so a proposed target can be checked against the
 * code that will actually produce it, instead of against someone's arithmetic.
 */
class SimulationTest {

    private val backExtension = Gear(increment = 15.0, perSide = false, min = 40.0, unit = "lbs")

    data class Gear(val increment: Double, val perSide: Boolean, val min: Double?, val unit: String) {
        val step: Double get() = if (perSide) increment * 2.0 else increment
        val snap: (Double) -> Double = { w -> snapToHardwareStep(w, increment, perSide, min, null) }
    }

    private fun betweenSessions(g: Gear, history: List<List<SetOutcome>>, specs: List<SetSpec>) {
        val t = nextExerciseTargets(history, specs, g.step, g.snap)
        t.forEachIndexed { i, s ->
            println("  set ${i + 1}: ${s.weight} ${g.unit} x ${s.reps}   [${s.reason}]")
        }
    }

    private fun afterSet(
        g: Gear, w: Double, r: Int, rir: Int,
        nextReps: Int, nextRir: Int,
        plannedNext: Double? = null, prevTargetReps: Int? = null, prevTargetRir: Int? = null
    ) {
        val a = autoregulateNextSet(
            w, r, rir, nextReps, nextRir, g.increment, g.perSide, g.min, null, null,
            plannedNext, prevTargetReps, prevTargetRir
        )
        println("  did ${w} x $r @ RIR $rir (asked ${prevTargetReps ?: "-"} @ ${prevTargetRir ?: "-"}), " +
            "plan for next was ${plannedNext ?: "-"}  ->  next set: ${a.weight} ${g.unit} x ${a.reps}")
    }

    @Test
    fun `scenario`() {
        println("=== BETWEEN SESSIONS: Back Extension, last session 70/85/100 x 15 @ RIR 4 ===")
        betweenSessions(
            backExtension,
            listOf(
                listOf(SetOutcome(70.0, 15, 4)),
                listOf(SetOutcome(85.0, 15, 4)),
                listOf(SetOutcome(100.0, 15, 4))
            ),
            listOf(SetSpec(11, 13, 2), SetSpec(11, 13, 2), SetSpec(11, 13, 2))
        )

        println("=== WITHIN SESSION: set 1 done at 85 x 11 @ RIR 4, set 2 was planned at 100 x 11 ===")
        afterSet(backExtension, w = 85.0, r = 11, rir = 4, nextReps = 11, nextRir = 2,
            plannedNext = 100.0, prevTargetReps = 11, prevTargetRir = 2)

        println("=== WITHIN SESSION: set 2 done at 100 x 11 @ RIR 4, set 3 was planned at 115 x 11 ===")
        afterSet(backExtension, w = 100.0, r = 11, rir = 4, nextReps = 11, nextRir = 2,
            plannedNext = 115.0, prevTargetReps = 11, prevTargetRir = 2)

        println("=== NEXT WORKOUT: session just logged was 85/100/115 x 11 @ RIR 4 ===")
        betweenSessions(
            backExtension,
            listOf(
                listOf(SetOutcome(85.0, 11, 4), SetOutcome(70.0, 15, 4)),
                listOf(SetOutcome(100.0, 11, 4), SetOutcome(85.0, 15, 4)),
                listOf(SetOutcome(115.0, 11, 4), SetOutcome(100.0, 15, 4))
            ),
            listOf(SetSpec(11, 13, 2), SetSpec(11, 13, 2), SetSpec(11, 13, 2))
        )

        println("=== THEN, if 100/115/130 x 11 @ RIR 4 gets logged ===")
        betweenSessions(
            backExtension,
            listOf(
                listOf(SetOutcome(100.0, 11, 4)),
                listOf(SetOutcome(115.0, 11, 4)),
                listOf(SetOutcome(130.0, 11, 4))
            ),
            listOf(SetSpec(11, 13, 2), SetSpec(11, 13, 2), SetSpec(11, 13, 2))
        )

        println("=== LAT PULLDOWN: a ramp whose top set IS on target (RIR 2) ===")
        betweenSessions(
            Gear(15.0, false, 55.0, "lbs"),
            listOf(
                listOf(SetOutcome(85.0, 9, 4)),
                listOf(SetOutcome(100.0, 9, 3)),
                listOf(SetOutcome(115.0, 9, 2))
            ),
            listOf(SetSpec(8, 12, 2), SetSpec(8, 12, 2), SetSpec(8, 12, 2))
        )

        println("=== AND THE ONE AFTER, if 85/100/115 x 13 @ RIR 4 gets logged ===")
        betweenSessions(
            backExtension,
            listOf(
                listOf(SetOutcome(85.0, 13, 4), SetOutcome(85.0, 11, 4)),
                listOf(SetOutcome(100.0, 13, 4), SetOutcome(100.0, 11, 4)),
                listOf(SetOutcome(115.0, 13, 4), SetOutcome(115.0, 11, 4))
            ),
            listOf(SetSpec(11, 13, 2), SetSpec(11, 13, 2), SetSpec(11, 13, 2))
        )
    }
}
