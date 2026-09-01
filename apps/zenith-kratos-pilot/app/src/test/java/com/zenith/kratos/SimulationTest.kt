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

    private fun afterSet(g: Gear, w: Double, r: Int, rir: Int, nextReps: Int, nextRir: Int) {
        val a = autoregulateNextSet(w, r, rir, nextReps, nextRir, g.increment, g.perSide, g.min, null)
        println("  did ${w} x $r @ RIR $rir  ->  next set: ${a.weight} ${g.unit} x ${a.reps}")
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
    }
}
