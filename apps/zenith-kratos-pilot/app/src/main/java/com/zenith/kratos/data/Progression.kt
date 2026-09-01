package com.zenith.kratos.data

/**
 * What to put on the bar next, given how the last session actually went.
 *
 * This is the Kotlin side of the rule in shared/ml/models/strengthModels.ts. The two
 * had drifted, and the drift produced a recommendation an athlete could see was wrong:
 *
 *   Pin Loaded - Back Extension, range 11-13 reps, target 2 reps in reserve
 *     05 Aug   70x8,  85x8,  115x8   (RIR 4)
 *     15 Aug   70x10, 85x10, 100x10  (RIR 4)
 *     24 Aug   70x11, 85x11, 100x11  (RIR 4)
 *     offered  70x8,  85x8,  115x8
 *
 * The offer was the 5 August session, reproduced three weeks later: a 15 lb jump on the
 * top set and a rep target three below the floor of the range.
 *
 * Two things caused it, and both are fixed here.
 *
 * The baseline was chosen as the session with the highest best-set e1RM out of the last
 * three. The intent was that one bad day should not become the new starting point, which
 * is right, but "best of the last three" is the wrong instrument: a single overreaching
 * session anchors everything until it falls out of the window, and real progress made
 * since is discarded. 115x8 was an overreach the athlete abandoned - they went back to
 * 100 and stayed there - and it still set the target three weeks later.
 *
 * The other was an inverted reading of reps in reserve. Adding weight required
 * `rir <= targetRir`, so a set left with 4 reps in reserve counted as unsuccessful and
 * blocked progression. Reserve is how much room is left: more of it is a reason to
 * progress faster, not slower. Every set of this exercise was logged at RIR 4, so the
 * recommendation could never move at all.
 */

/** One working set as it was actually performed. */
data class SetOutcome(
    val weight: Double,
    val reps: Int,
    val rir: Int
)

/** What to aim for next time. */
data class SetTarget(
    val weight: Double,
    val reps: Int,
    /** Plain-language why, for the preview sheet. */
    val reason: String
)

/** Reserve at or above this means the set had real room left in it. */
const val WELL_CLEAR_RIR = 3

/** Never more than this many hardware steps from one session to the next. */
const val MAX_STEPS_PER_SESSION = 2

/**
 * A double step is only offered when it is a small share of the current load.
 *
 * On a pin stack with a 15 lb increment, two steps off 100 lb is a 30% jump - which is
 * how the abandoned 115x8 came about in the first place. One step on that stack is
 * already 15%, and that is the hardware minimum, so it stands; doubling it is not
 * something to do because a single set felt easy.
 */
const val MAX_DOUBLE_STEP_FRACTION = 0.10

/**
 * Double progression: climb the rep range at a fixed weight, then add weight and drop
 * back to the floor of the range.
 *
 * `snap` turns a raw weight into one the hardware can actually make, so this stays
 * honest about pin stacks and plate loading.
 */
fun nextSetTarget(
    prev: SetOutcome,
    minReps: Int,
    maxReps: Int,
    targetRir: Int,
    stepWeight: Double,
    snap: (Double) -> Double
): SetTarget {
    val floor = if (minReps > 0) minReps else 1
    val ceiling = if (maxReps >= floor) maxReps else floor

    val raw: SetTarget = when {
        // Fell short of the range. Hold the weight and ask for the floor again - the
        // answer to a hard day is to repeat it, not to lighten the bar.
        prev.reps < floor -> SetTarget(
            weight = snap(prev.weight),
            reps = floor,
            reason = "Short of $floor reps last time - same weight until you get there."
        )

        // Topped the range. Whether it earns weight depends on what was left in reserve.
        prev.reps >= ceiling -> {
            if (prev.rir < 1) {
                SetTarget(
                    weight = snap(prev.weight),
                    reps = ceiling,
                    reason = "Top of the range but nothing left in reserve - hold here until it eases."
                )
            } else {
                val canDouble = prev.rir >= WELL_CLEAR_RIR &&
                    MAX_STEPS_PER_SESSION * stepWeight <= prev.weight * MAX_DOUBLE_STEP_FRACTION
                val steps = if (canDouble) MAX_STEPS_PER_SESSION else 1
                SetTarget(
                    weight = snap(prev.weight + steps * stepWeight),
                    reps = floor,
                    reason = if (steps > 1)
                        "Topped the range with ${prev.rir} in reserve - up two steps."
                    else
                        "Topped the range with room to spare - up a step."
                )
            }
        }

        // Inside the range. Climb it, faster when there was plenty left.
        else -> {
            val gain = if (prev.rir >= WELL_CLEAR_RIR) 2 else 1
            val nextReps = (prev.reps + gain).coerceAtMost(ceiling)
            SetTarget(
                weight = snap(prev.weight),
                reps = nextReps,
                reason = if (gain > 1)
                    "${prev.rir} reps in reserve at ${prev.reps} - same weight, go for $nextReps."
                else
                    "Same weight, one more rep than last time."
            )
        }
    }

    return atLeastLastTime(raw, prev)
}

/**
 * The guarantee: an athlete who follows the recommendation never does less than last
 * time.
 *
 * Everything above is meant to progress, but two things can quietly walk it backwards.
 * Snapping to the hardware grid can round a weight down - a stack anchored at 40 in
 * steps of 15 has no 102, so 102 becomes 100. And a set logged above the top of its
 * range (14 reps where the range ends at 13) would otherwise be answered with the
 * ceiling, asking for 13.
 *
 * So the result is floored against what was actually done: never a lighter weight, and
 * at the same weight never fewer reps. A heavier weight is allowed to reset reps to the
 * floor of the range, which is the whole point of double progression and is more work,
 * not less.
 */
private fun atLeastLastTime(target: SetTarget, prev: SetOutcome): SetTarget {
    if (target.weight > prev.weight) return target

    val weight = maxOf(target.weight, prev.weight)
    val reps = maxOf(target.reps, prev.reps)
    if (weight == target.weight && reps == target.reps) return target

    return target.copy(
        weight = weight,
        reps = reps,
        reason = if (reps > target.reps && target.reps < prev.reps)
            "Matching last time at ${prev.reps} reps, then build from there."
        else target.reason
    )
}

/**
 * The session to progress from.
 *
 * The most recent one in which at least one working set reached the floor of its rep
 * range - that being the last time the athlete actually did the prescribed work. A
 * session where everything fell short is skipped rather than becoming the new baseline,
 * which is what the old "best e1RM of the last three" was reaching for; the difference
 * is that this cannot anchor on an old outlier, because it always prefers the newer of
 * two qualifying sessions.
 *
 * `sessions` must be ordered newest first.
 */
fun <T> chooseBaselineSession(
    sessions: List<T>,
    workingSetsOf: (T) -> List<SetOutcome>,
    repFloorFor: (index: Int) -> Int
): T? {
    val withWork = sessions.filter { workingSetsOf(it).isNotEmpty() }
    val qualifying = withWork.firstOrNull { session ->
        workingSetsOf(session).withIndex().any { (idx, s) -> s.reps >= repFloorFor(idx) }
    }
    return qualifying ?: withWork.firstOrNull()
}
