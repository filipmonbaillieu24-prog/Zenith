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

/**
 * A lift that has stopped moving, and which way it is stuck.
 *
 * Worth separating because the two call for opposite responses. Grinding out the top of
 * the rep range with nothing in reserve, week after week, means the weight should go up
 * even though the usual rule says hold. Missing the bottom of the range week after week
 * means the opposite, and is the athlete's call to make rather than the app's.
 */
enum class StallState {
    NONE,

    /** Topping the range at zero reserve, session after session, going nowhere. */
    GRINDING,

    /** Falling short of the rep floor, session after session. */
    MISSING_TARGET
}

/** Sessions stuck the same way before it is called a stall rather than a bad day. */
const val SESSIONS_BEFORE_STALL = 3

/** What to aim for next time. */
data class SetTarget(
    val weight: Double,
    val reps: Int,
    /** Plain-language why, for the preview sheet. */
    val reason: String,
    val stall: StallState = StallState.NONE,
    /**
     * What the athlete might do about a stall, when the app should not decide alone.
     *
     * Null unless something is genuinely stuck. Dropping the weight is never done
     * silently: it is the one change that makes the next session easier than the last,
     * and an app that does that on its own is an app that quietly walks a lift
     * backwards - which is where this whole rule started.
     */
    val advice: String? = null
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
 * Reserve this far above target means the weight is not settled yet.
 *
 * The athlete's own reading of it: a set at four reps in reserve against a target of two
 * is not a training outcome to progress from, it is a set that was too light, and the
 * weight is still being found. One reserve rep either side of target is ordinary session
 * variation and is left alone.
 */
const val CALIBRATION_RIR_MARGIN = 2

/**
 * The most a single session may add while calibrating.
 *
 * Calibration solves for a weight rather than stepping to one, so a mistyped reserve -
 * 8 where 0 was meant - would otherwise move the bar by half. Twenty percent is enough
 * to close a genuine gap in one or two sessions and not enough to hurt anyone. Snapping
 * to the stack can carry it slightly past, because the alternative is not moving at all.
 */
const val MAX_CALIBRATION_RISE = 0.20

/**
 * Estimated one-rep max, Epley, counting the reps left in reserve as reps not done.
 *
 * The same measure the web logbook uses to decide whether a lift is progressing, so a
 * session judged as progress here is judged as progress there.
 */
fun estimatedOneRepMax(weight: Double, reps: Int, rir: Int): Double =
    weight * (1.0 + (reps + rir) / 30.0)

/**
 * The weight this set says it should have been.
 *
 * Takes the estimated max the set demonstrated and asks what load would put the athlete
 * at the bottom of the rep range with the prescribed reserve left - which is where a
 * working set is supposed to start before it climbs the range.
 *
 * Always heavier than what was lifted whenever the reserve was above target and the
 * reps at least met the floor, which are exactly the conditions it is called under.
 */
private fun impliedWorkingWeight(prev: SetOutcome, floor: Int, targetRir: Int): Double {
    val denominator = 1.0 + (floor + targetRir) / 30.0
    if (denominator <= 0.0) return prev.weight
    return estimatedOneRepMax(prev.weight, prev.reps, prev.rir) / denominator
}

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

    // Still finding the weight. Reserve well above target says the load is wrong, not
    // that the session went well, so stepping one notch at a time answers the wrong
    // question - the set already contains an estimate of where the weight should be.
    //
    // Null when the stack cannot express the difference: a 15 lb machine has no 105, so
    // an implied 104.65 rounds straight back to 100. Calibrating to the weight already
    // being used is not calibration, and prescribing the floor of the rep range at that
    // weight would ask for fewer reps than were just done. In that case the ordinary
    // rule takes over and climbs the reps instead, which is the only move the hardware
    // leaves available.
    val calibrated: Double? =
        if (prev.reps >= floor && prev.rir >= targetRir + CALIBRATION_RIR_MARGIN) {
            val implied = impliedWorkingWeight(prev, floor, targetRir)
            val capped = implied.coerceAtMost(prev.weight * (1.0 + MAX_CALIBRATION_RISE))
            snap(capped).takeIf { it > prev.weight }
        } else null

    val raw: SetTarget = when {
        calibrated != null -> SetTarget(
            weight = calibrated,
            reps = floor,
            reason = "${prev.rir} in reserve against a target of $targetRir - still light, so this is the weight your set points at."
        )

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
 * How many of the most recent sessions were stuck the same way at the same weight.
 *
 * `history` is that one set across recent sessions, newest first. Counting only the
 * leading run matters: a lift that stalled in July, moved in August and is moving now
 * is not stalled, and a rule that counted every stuck session anywhere in the window
 * would say it was.
 */
private fun leadingRun(
    history: List<SetOutcome>,
    weight: Double,
    predicate: (SetOutcome) -> Boolean
): Int {
    var run = 0
    for (s in history) {
        if (s.weight != weight || !predicate(s)) break
        run++
    }
    return run
}

/**
 * The same decision as nextSetTarget, with the set's recent history so a lift that has
 * stopped moving can be recognised as stuck rather than answered the same way forever.
 *
 * `history` is newest first and starts with the session being progressed from.
 */
fun nextSetTarget(
    history: List<SetOutcome>,
    minReps: Int,
    maxReps: Int,
    targetRir: Int,
    stepWeight: Double,
    snap: (Double) -> Double
): SetTarget {
    val prev = history.firstOrNull() ?: return SetTarget(snap(0.0), minReps, "No history for this set yet.")
    val base = nextSetTarget(prev, minReps, maxReps, targetRir, stepWeight, snap)

    val floor = if (minReps > 0) minReps else 1
    val ceiling = if (maxReps >= floor) maxReps else floor

    // Grinding: topping the range with nothing left, and the weight has not moved.
    val grinding = leadingRun(history, prev.weight) { it.reps >= ceiling && it.rir < 1 }
    if (grinding >= SESSIONS_BEFORE_STALL) {
        val heavier = snap(prev.weight + stepWeight)
        // Only if the hardware can actually make a heavier notch; on a stack whose
        // step rounds back to where it started, saying so is better than pretending.
        if (heavier > prev.weight) {
            return SetTarget(
                weight = heavier,
                reps = repsToMatchLastTime(heavier, prev, targetRir, floor, ceiling),
                reason = "$grinding sessions at ${fmt(prev.weight)} with nothing in reserve - the reps are not coming, so the weight goes up.",
                stall = StallState.GRINDING
            )
        }
        return base.copy(
            stall = StallState.GRINDING,
            advice = "Stuck at the top of the range for $grinding sessions with nothing in reserve."
        )
    }

    // Missing the floor: the prescription is not being met and repeating it is not
    // working. Flag it; do not quietly lighten the bar.
    val missing = leadingRun(history, prev.weight) { it.reps < floor }
    if (missing >= SESSIONS_BEFORE_STALL) {
        return base.copy(
            stall = StallState.MISSING_TARGET,
            advice = "Short of $floor reps at ${fmt(prev.weight)} for $missing sessions. " +
                "Worth dropping a step and building back, or checking rest and sleep - " +
                "your call, not the app's."
        )
    }

    return base
}

/** Weights read better without a trailing .0 on a stack that only makes whole numbers. */
private fun fmt(w: Double): String =
    if (w == Math.floor(w)) w.toLong().toString() else w.toString()

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

/** The template's prescription for one working set. */
data class SetSpec(
    val minReps: Int,
    val maxReps: Int,
    val targetRir: Int
)

/**
 * Ascending working sets are one exercise, not three independent ones.
 *
 * This athlete's Back Extension is 70 / 85 / 100 lb - exactly 70% / 85% / 100% - and the
 * ramp is deliberate. Progressing each set from its own history pulls that shape apart,
 * because the lower sets are submaximal by design and so always report reserve to spare.
 * The top set stalling at 115 while sets one and two keep earning their step turns
 * 70/85/100 into 100/115/115: the ramp is gone and every set is now a top set.
 *
 * It also reads a signal that is not there. Reserve saturates - "4" means "too easy",
 * not "exactly four" - so on a set chosen to be easy it carries no information at all.
 * Only the top set is near enough to failure for its reserve to mean anything, which is
 * why it is the one that decides.
 *
 * So: the top set progresses on the ordinary rule, and the rest keep their proportion of
 * it. If the top set holds, the ramp holds with it.
 *
 * `historyBySet` is one list per working set, newest first, in set order.
 */
fun nextExerciseTargets(
    historyBySet: List<List<SetOutcome>>,
    specs: List<SetSpec>,
    stepWeight: Double,
    snap: (Double) -> Double
): List<SetTarget> {
    fun specAt(i: Int) = specs.getOrNull(i) ?: specs.lastOrNull() ?: SetSpec(8, 12, 2)

    val independent = historyBySet.mapIndexed { i, h ->
        val s = specAt(i)
        nextSetTarget(h, s.minReps, s.maxReps, s.targetRir, stepWeight, snap)
    }

    val lastWeights = historyBySet.map { it.firstOrNull()?.weight }
    if (!isRamp(lastWeights)) return independent

    val weights = lastWeights.filterNotNull()
    val topIdx = weights.lastIndex
    val topPrev = weights[topIdx]
    val topTarget = independent[topIdx]

    // The ramp did not move, so nothing below it moves either. Holding a preparation
    // set at the same weight is not a stalled lift; it is the ramp doing its job.
    if (topTarget.weight <= topPrev) return independent.mapIndexed { i, t ->
        if (i == topIdx) t else t.copy(
            weight = weights[i],
            reps = maxOf(t.reps, historyBySet[i].firstOrNull()?.reps ?: t.reps),
            reason = "Holding the ramp - the top set stays at ${fmt(topPrev)}."
        )
    }

    var ceilingWeight = topTarget.weight
    val out = independent.toMutableList()
    for (i in topIdx - 1 downTo 0) {
        val prev = historyBySet[i].firstOrNull() ?: continue
        val spec = specAt(i)
        val proportion = weights[i] / topPrev
        // Never below what was lifted last time, never at or above the set above it -
        // a ramp whose steps collapse into each other has stopped being a ramp.
        val raw = snap(proportion * topTarget.weight)
        val bounded = raw.coerceAtLeast(prev.weight).coerceAtMost(ceilingWeight)
        val reps = if (bounded > prev.weight)
            repsToMatchLastTime(bounded, prev, spec.targetRir, spec.minReps, maxOf(spec.minReps, spec.maxReps))
        else
            maxOf(independent[i].reps, prev.reps)

        out[i] = independent[i].copy(
            weight = bounded,
            reps = reps,
            reason = "Holding its ${Math.round(proportion * 100)}% place in the ramp under ${fmt(topTarget.weight)}."
        )
        ceilingWeight = bounded
    }
    return out
}

/**
 * Strictly ascending working weights, with enough spread to be a deliberate shape rather
 * than one set that happened to land a notch heavier.
 */
private fun isRamp(lastWeights: List<Double?>): Boolean {
    if (lastWeights.size < 3 || lastWeights.any { it == null }) return false
    val w = lastWeights.filterNotNull()
    for (i in 1 until w.size) if (w[i] <= w[i - 1]) return false
    return w.last() > w.first()
}

/** What the next set of the CURRENT session should be, after the one just finished. */
data class WithinSessionTarget(
    val weight: Double,
    val reps: Int
)

/**
 * Autoregulation between sets of a session, as opposed to between sessions.
 *
 * This was forty lines inline inside a Composable, which meant the arithmetic that
 * decides what goes on the bar next could not be run without an Android device and a
 * finished set. It is the same shape as the between-session rule - take the estimated
 * max the set demonstrated and solve for the load that lands on the next set's target -
 * bounded by a band that widens with how far the set landed from its prescribed reserve.
 *
 * `mlPrediction` is the on-device model's answer where it has one; the Epley solve
 * stands in when it does not. Either way the result is clamped to the same band, because
 * an unbounded estimate from a cold-start model was once used as-is.
 */
fun autoregulateNextSet(
    prevWeight: Double,
    prevReps: Int,
    prevRir: Int,
    nextTargetReps: Int,
    nextTargetRir: Int,
    incrementWeight: Double,
    incrementPerSide: Boolean,
    minWeight: Double?,
    maxWeight: Double?,
    mlPrediction: Double? = null,
    /**
     * What the next set was already planned to be, before this one was performed.
     *
     * Needed because this function reasons from the set just finished, and in an
     * ascending ramp the next set is deliberately heavier than that one. Without it, a
     * first set of 85 that came in easy rewrote a planned second set of 100 down to 85 -
     * the ramp collapsed mid-session, and the athlete was asked for less than the plan
     * they had walked in with.
     */
    plannedNextWeight: Double? = null,
    /** What the set just finished was asked for, to tell a good set from a bad one. */
    prevTargetReps: Int? = null,
    prevTargetRir: Int? = null
): WithinSessionTarget {
    val step = if (incrementPerSide) 2.0 * incrementWeight else incrementWeight
    val effectiveStep = if (step <= 0.0) 2.5 else step

    val epleyW = estimatedOneRepMax(prevWeight, prevReps, prevRir) /
        (1.0 + (nextTargetReps + nextTargetRir) / 30.0)

    // The band widens with the distance from target reserve, so one rep of
    // overperformance earns a small bump rather than a flat swing.
    val rirDelta = prevRir - nextTargetRir
    val growthPct = Math.min(0.15, 0.02 + 0.025 * Math.max(0, rirDelta))
    val shrinkPct = Math.min(0.15, 0.02 + 0.025 * Math.max(0, -rirDelta))
    var minSafeW = Math.max(prevWeight * (1.0 - shrinkPct), epleyW * 0.92)
    var maxSafeW = Math.min(prevWeight * (1.0 + growthPct), epleyW * 1.08)

    // On coarse equipment the band can be narrower than a single notch, which excludes
    // the only weight the machine can make: a 15 lb stack at 100 lb has its next
    // position at +15% while a rirDelta of 2 allows +7%, so the athlete never moves up
    // however easy it gets. Once the reps have topped out and reserve is still above
    // target, let the band reach the next real notch - but only as far as Epley says
    // has actually been earned.
    if (rirDelta > 0 && prevReps >= nextTargetReps + 4) {
        val gridBase = minWeight ?: prevWeight
        val notchesUp = Math.ceil((prevWeight - gridBase + 1e-6) / effectiveStep)
        val nextNotch = gridBase + notchesUp * effectiveStep
        if (nextNotch > maxSafeW && nextNotch <= epleyW * 1.08) {
            maxSafeW = nextNotch
        }
    }

    minWeight?.let { minSafeW = Math.max(minSafeW, it) }
    maxWeight?.let { maxSafeW = Math.min(maxSafeW, it) }
    if (minSafeW > maxSafeW) minSafeW = maxSafeW

    val predictedW = (mlPrediction ?: epleyW).coerceIn(minSafeW, maxSafeW)

    val roundedW = if (minWeight != null) {
        snapToHardwareStep(predictedW, incrementWeight, incrementPerSide, minWeight, maxWeight)
    } else {
        var snapped = prevWeight + Math.round((predictedW - prevWeight) / effectiveStep) * effectiveStep
        maxWeight?.let { hardMax ->
            if (snapped > hardMax) {
                snapped = prevWeight + Math.floor((hardMax - prevWeight) / effectiveStep) * effectiveStep
            }
        }
        snapped
    }

    // A set that met what was asked of it never makes the next set lighter than the
    // plan. The estimate above is drawn from the set just finished, which in a ramp is
    // deliberately submaximal - so it underestimates every set above it, and letting it
    // overwrite a heavier planned weight walks the session backwards. It may still raise
    // the next set past the plan; only lowering is held back.
    val underperformed =
        (prevTargetReps != null && prevReps < prevTargetReps) ||
        (prevTargetRir != null && prevRir < prevTargetRir)
    val floored = if (!underperformed && plannedNextWeight != null) {
        Math.max(roundedW, plannedNextWeight)
    } else roundedW

    // No notch small enough for what this set earned, so progress the reps instead.
    return if (Math.abs(prevWeight - floored) >= 0.5 * effectiveStep) {
        WithinSessionTarget(floored, nextTargetReps)
    } else {
        // Integer arithmetic on purpose: the float round-trip this replaced landed on
        // 15.999999999999998 and truncated, quietly losing a rep.
        val exactReps = prevReps + prevRir - nextTargetRir
        WithinSessionTarget(prevWeight, exactReps.coerceIn(3, nextTargetReps + 4))
    }
}
