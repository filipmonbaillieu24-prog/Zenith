package com.zenith.kratos.data

import kotlin.math.max
import kotlin.math.roundToInt

fun snapToHardwareStep(weight: Double, incrementWeight: Double, isPerSide: Boolean): Double {
    if (weight <= 0.0) return 0.0
    val step = if (isPerSide) incrementWeight * 2.0 else incrementWeight
    val effectiveStep = if (step <= 0.0) 2.5 else step
    val snapped = Math.round(weight / effectiveStep) * effectiveStep
    return max(effectiveStep, Math.round(snapped * 100.0) / 100.0)
}

fun recalculateWarmupTargets(
    sets: List<ActiveSetState>,
    workingWeight: Double,
    incrementWeight: Double = 2.5,
    isPerSide: Boolean = false
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
                    val fraction = 0.5 + (0.4 * warmupIndex.toDouble() / (count - 1).coerceAtLeast(1).toDouble())
                    workingWeight * fraction
                }
            }
            set.targetWeight = snapToHardwareStep(rawTarget, incrementWeight, isPerSide)
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
