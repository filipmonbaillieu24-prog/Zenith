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
 * Estimated one-rep max, Epley, counting the reps left in reserve as reps not done.
 *
 * The same measure the web logbook uses to decide whether a lift is progressing, so a
 * session judged as progress here is judged as progress there.
 */
fun estimatedOneRepMax(weight: Double, reps: Int, rir: Int): Double =
    weight * (1.0 + (reps + rir) / 30.0)

/**
 * How many reps at the new weight to be worth at least the last session.
 *
 * Resetting to the bottom of the rep range after every weight rise is the textbook move,
 * and it is right when the rise is big: 100 to 115 lb on a pin stack is 15%, and nobody
 * holds their reps through that. But on a lift that goes up 2.5 kg at a time it charged
 * a 33% drop in reps for a 2% rise in load - 100x12 became 102x8 - which is less work
 * than the session it was meant to progress from.
 *
 * So the target is the fewest reps that keep the estimated max at or above last time,
 * held inside the prescribed range. A big jump still lands on the floor of the range; a
 * small one barely moves the reps at all.
 */
private fun repsToMatchLastTime(
    newWeight: Double,
    prev: SetOutcome,
    targetRir: Int,
    floor: Int,
    ceiling: Int
): Int {
    if (newWeight <= 0.0) return floor
    val toMatch = estimatedOneRepMax(prev.weight, prev.reps, prev.rir)
    var reps = floor
    while (reps < ceiling && estimatedOneRepMax(newWeight, reps, targetRir) < toMatch) {
        reps++
    }
    return reps
}

/**
 * Double progression: climb the rep range at a fixed weight, then add weight and take
 * the reps back only as far as the heavier bar actually costs.
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
                val heavier = snap(prev.weight + steps * stepWeight)
                SetTarget(
                    weight = heavier,
                    reps = repsToMatchLastTime(heavier, prev, targetRir, floor, ceiling),
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

/**
 * Where to start an exercise with no history behind it.
 *
 * This was a bare 20.0 in three places, which is neither a weight nor a unit: on this
 * athlete's Chest Fly, Lat Pulldown and Rear Delt Flye the stack starts at 55 lb, so 20
 * is not a position the machine has. On a 1 kg-per-side lateral raise starting at 2 kg
 * it is the opposite problem.
 *
 * The bottom of the stack is the honest answer - it is the only weight we know the
 * hardware can make, and the first session then measures the athlete rather than
 * guessing at them. Where no minimum is configured, a couple of steps up from nothing
 * is the least-wrong stand-in.
 */
fun startingWeightFor(
    minWeight: Double?,
    incrementWeight: Double,
    isPerSide: Boolean
): Double {
    minWeight?.let { if (it > 0.0) return it }
    val step = if (isPerSide) incrementWeight * 2.0 else incrementWeight
    val effective = if (step <= 0.0) 2.5 else step
    return effective * 2.0
}
