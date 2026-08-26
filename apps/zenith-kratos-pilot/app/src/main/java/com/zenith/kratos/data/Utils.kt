package com.zenith.kratos.data

import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Snaps a target weight to a position the equipment can actually produce.
 *
 * This used to snap to multiples of the step counted from ZERO, and ignored the
 * exercise's configured min/max entirely. For any machine whose lightest pin
 * isn't itself a multiple of the step, every suggestion it produced was a weight
 * that doesn't physically exist: a 55-130kg stack in 15kg increments has real
 * positions 55/70/85/100/115/130, but this returned 30, 45, 60, 135...
 *
 * The grid is now anchored to [minWeight] (the stack's actual lowest position)
 * when it's known, and the result is clamped back inside [minWeight]..[maxWeight]
 * afterwards - rounding goes to the NEAREST notch, so it can otherwise land up to
 * half a step outside the machine's real range.
 *
 * @param minWeight lightest position the equipment offers, if configured.
 * @param maxWeight heaviest position the equipment offers, if configured.
 */
fun snapToHardwareStep(
    weight: Double,
    incrementWeight: Double,
    isPerSide: Boolean,
    minWeight: Double? = null,
    maxWeight: Double? = null
): Double {
    if (weight <= 0.0) return 0.0
    val step = if (isPerSide) incrementWeight * 2.0 else incrementWeight
    val effectiveStep = if (step <= 0.0) 2.5 else step

    // Anchor the grid to the stack's lowest real position when we know it;
    // otherwise fall back to multiples of the step (the previous behaviour,
    // which is the best available guess with no min configured).
    val anchor = minWeight ?: 0.0
    var snapped = anchor + Math.round((weight - anchor) / effectiveStep) * effectiveStep

    // Step inward to the last legal notch rather than truncating to the raw
    // limit, which would usually itself be off-grid.
    if (maxWeight != null && snapped > maxWeight) {
        val stepsDown = Math.floor((maxWeight - anchor) / effectiveStep)
        val candidate = anchor + stepsDown * effectiveStep
        snapped = if (candidate >= anchor) candidate else maxWeight
    }
    if (minWeight != null && snapped < minWeight) {
        snapped = minWeight
    }
    if (minWeight == null) {
        snapped = max(effectiveStep, snapped)
    }

    return Math.round(snapped * 100.0) / 100.0
}

fun recalculateWarmupTargets(
    sets: List<ActiveSetState>,
    workingWeight: Double,
    incrementWeight: Double = 2.5,
    isPerSide: Boolean = false,
    minWeight: Double? = null,
    maxWeight: Double? = null
) {
    val warmupSets = sets.filter { it.type == "warmup" }
    val count = warmupSets.size
    var warmupIndex = 0
    for (i in sets.indices) {
        if (sets[i].type == "warmup") {
            val set = sets[i]
            val rawTarget = when {
                count <= 1 -> workingWeight * 0.6
                warmupIndex == 0 -> workingWeight * 0.5
                warmupIndex == count - 1 -> workingWeight * 0.75
                else -> {
                    // Linear ramp from the first set's 0.5 to the last set's 0.75,
                    // so interior sets stay strictly between them.
                    val fraction = 0.5 + (0.25 * warmupIndex.toDouble() / (count - 1).coerceAtLeast(1).toDouble())
                    workingWeight * fraction
                }
            }
            // Warmups are percentages of the working weight, so on a machine with a
            // heavy lightest pin they land below anything the stack offers (50% of
            // 100kg on a 55kg-minimum stack). Passing the limits through means the
            // suggestion is the lightest real position instead of an impossible one.
            set.targetWeight = snapToHardwareStep(rawTarget, incrementWeight, isPerSide, minWeight, maxWeight)
            set.targetReps = when {
                count <= 1 -> 6
                warmupIndex == 0 -> 10
                warmupIndex == count - 1 -> 2
                else -> 5
            }
            warmupIndex++
        }
    }
}
