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
        plannedNext: Double? = null, prevTargetReps: Int? = null, prevTargetRir: Int? = null,
        nextMaxReps: Int? = null
    ) {
        val a = autoregulateNextSet(
            w, r, rir, nextReps, nextRir, g.increment, g.perSide, g.min, null, null,
            plannedNext, prevTargetReps, prevTargetRir, nextMaxReps
        )
        println("  did ${w} x $r @ RIR $rir (asked ${prevTargetReps ?: "-"} @ ${prevTargetRir ?: "-"}), " +
            "plan for next was ${plannedNext ?: "-"}  ->  next set: ${a.weight} ${g.unit} x ${a.reps}")
    }

    @Test
    fun `scenario`() {
        val rearDelt = Gear(increment = 15.0, perSide = false, min = 55.0, unit = "lbs")
        // Template: sets 1-2 are 11-13 @ RIR 2, set 3 is 9-11 @ RIR 2.
        val specs = listOf(SetSpec(11, 13, 2), SetSpec(11, 13, 2), SetSpec(9, 11, 2))

        println("=== REAR DELT FLYE: last session 100x15@2, 100x15@1, 100x11@0 ===")
        betweenSessions(
            rearDelt,
            listOf(
                listOf(SetOutcome(100.0, 15, 2), SetOutcome(100.0, 14, 1), SetOutcome(100.0, 11, 2)),
                listOf(SetOutcome(100.0, 15, 1), SetOutcome(100.0, 14, 0), SetOutcome(100.0, 11, 2)),
                listOf(SetOutcome(100.0, 11, 0), SetOutcome(100.0, 10, 0), SetOutcome(100.0, 9, 0))
            ),
            specs
        )

        println("=== WITHIN SESSION: set 1 asked for 115x11@2, did 115x10@0; set 2 planned 115 ===")
        afterSet(rearDelt, w = 115.0, r = 10, rir = 0, nextReps = 11, nextRir = 2,
            plannedNext = 115.0, prevTargetReps = 11, prevTargetRir = 2)

        println("=== WITHIN SESSION: set 2 asked 100x11@2, did 100x12@3; set 3 planned 100 (range 9-11) ===")
        afterSet(rearDelt, w = 100.0, r = 12, rir = 3, nextReps = 11, nextRir = 2,
            plannedNext = 100.0, prevTargetReps = 11, prevTargetRir = 2, nextMaxReps = 11)
    }
}
