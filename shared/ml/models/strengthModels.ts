import { declareModel, DeclaredModel } from '../declareModel';

/**
 * The strength models, declared rather than hand-weighted.
 *
 * Both of these shipped saturated. The overload model sat at 0.9655 of its range and
 * so returned the top of a 0-10 kg increment for every input it was ever given - the
 * Kratos routine table showed "+10 kg" beside every exercise, on every day, for every
 * athlete. The autoregulation model sat at 0.96 of a 0-400 kg scale and predicted a
 * 324-388 kg one-rep max; the recommendations looked sane only because Epley-based
 * guardrails clamped them afterwards, which is to say the network contributed nothing
 * except a constant push at the top of the band.
 *
 * Each now states the rule it starts from. An untrained model reproduces that rule;
 * training moves it toward what this athlete actually does.
 */

// ── Progressive overload ───────────────────────────────────────────

/**
 * This one is a rule, not a model, and that is the finding rather than a shortcut.
 *
 * It was a network, and it was pinned: 0.9655 of a 0-1 range mapped onto a 0-10 kg
 * increment, so Kratos printed "+10 kg" beside every exercise for every athlete on
 * every day. When I rewrote it as a declared model with the double-progression rule as
 * its reference, the calibration refused it - fit error 0.185 against a limit of 0.05.
 *
 * That refusal is correct and worth stating. These networks are a function of ONE
 * weighted sum of their inputs. Whether to add load is not: it depends on clearing the
 * rep target AND having reps in reserve, which is an interaction between two inputs,
 * and the answer jumps rather than sliding. No choice of weights represents it. The
 * old model did not represent it either; it just failed silently instead of loudly.
 *
 * So the rule is the rule. It is short, it is testable, and anyone can read it and say
 * whether they agree - which was never true of the weights it replaces.
 */

/** Most steps to add in one session, however good the day was. */
export const MAX_STEPS_PER_SESSION = 2;

export interface ProgressionInput {
  /** Reps completed beyond the top of the prescribed range. Negative means missed. */
  repsBeyondTarget: number;
  /** Reps left in reserve on the last working set. */
  repsInReserve: number;
  /** 0..100. Omit when the night was not recorded rather than passing a guess. */
  sleepQuality?: number | null;
  /** Cardio form (TSB). Omit when unknown. */
  cardioTsb?: number | null;
  /** How many sessions this lift has sat at the same load. */
  sessionsAtThisLoad: number;
}

export interface ProgressionDecision {
  /** Hardware steps to add: 0, 0.5, 1 or 2. */
  steps: number;
  /** Why, in one line, for the athlete to read. */
  reason: string;
}

/**
 * Double progression: clear the top of the rep range with something left in reserve,
 * and the load goes up by one hardware step next time.
 *
 * The size of a step is a property of the equipment, not of how the athlete felt -
 * which is why this returns steps and lets the caller multiply by the increment the
 * exercise actually has. The old model returned kilograms and had no idea whether the
 * machine moved in 1 kg or 5 kg jumps.
 *
 * Readiness decides WHETHER to take the step, and occasionally whether to take a half
 * one. It never inflates it.
 */
export function progressionSteps(input: ProgressionInput): ProgressionDecision {
  const { repsBeyondTarget, repsInReserve, sessionsAtThisLoad } = input;

  // null and undefined must not become 0 here. A night that was not recorded is not a
  // night of no sleep, and treating it as one would hold back every athlete who does
  // not wear a watch to bed.
  const sleep = input.sleepQuality === null || input.sleepQuality === undefined
    ? null
    : Number(input.sleepQuality);
  const tsb = input.cardioTsb === null || input.cardioTsb === undefined
    ? null
    : Number(input.cardioTsb);

  if (!Number.isFinite(repsBeyondTarget) || !Number.isFinite(repsInReserve)) {
    return { steps: 0, reason: 'Last session was not logged in full, so the load holds.' };
  }

  if (repsBeyondTarget < 0) {
    return { steps: 0, reason: 'Target reps were missed last time - hold this load until they are met.' };
  }

  if (repsInReserve < 1) {
    return sessionsAtThisLoad >= 4
      ? { steps: 0.5, reason: 'Four sessions at this load without a clear win - a half step to break the stall.' }
      : { steps: 0, reason: 'Target met but with nothing left in reserve - stay here until it feels easier.' };
  }

  const badlyRested = (sleep !== null && sleep < 55) || (tsb !== null && tsb < -25);
  if (badlyRested) {
    return { steps: 0.5, reason: 'Earned a step, but on poor sleep or deep fatigue - take half of it.' };
  }

  const wellClear = repsInReserve >= 3 && repsBeyondTarget >= 2;
  const fresh = (sleep === null || sleep >= 70) && (tsb === null || tsb > -10);
  if (wellClear && fresh) {
    return { steps: MAX_STEPS_PER_SESSION, reason: 'Well clear of target and well recovered - take a double step.' };
  }

  return { steps: 1, reason: 'Target cleared with reps to spare - one step up.' };
}

/** Steps turned into the weight this particular exercise actually moves in. */
export function progressionWeight(
  decision: ProgressionDecision,
  incrementStepKg: number,
  isPerSide = false
): number {
  const step = Number(incrementStepKg);
  if (!Number.isFinite(step) || step <= 0) return 0;
  const total = decision.steps * step * (isPerSide ? 2 : 1);
  return Math.round(total * 100) / 100;
}

// ── Intra-session autoregulation ─────────────────────────────────────────────

/**
 * Rest taken, as a fraction of what was recommended.
 *
 * Bounded rather than raw: a set after twenty seconds is not four times worse than one
 * after eighty, and a ten-minute chat between sets does not make the next one 5x
 * stronger.
 */
export function computeAutoregRestRatio(restSeconds: number, recommendedRestSeconds: number = 120): number {
  const rest = Number(restSeconds);
  if (!Number.isFinite(rest) || rest <= 0) return 1;
  return Math.min(1.5, Math.max(0.2, rest / Math.max(45, Number(recommendedRestSeconds) || 120)));
}

/** Epley, the estimate used everywhere else in this codebase. */
export function epley1RM(weight: number, reps: number, rir: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  return weight * (1 + (reps + rir) / 30);
}

/**
 * What the next set should weigh, from what the last one did.
 *
 * The reference is Epley applied to the previous set and solved for the target rep
 * count - which is exactly what the guardrails were already computing and clamping the
 * old model's output to. Making it the starting point rather than the correction means
 * the model begins by agreeing with the arithmetic, and anything it learns afterwards
 * is a real observation about this athlete's within-session fatigue rather than a
 * fight with a clamp.
 *
 * Expressed as a RATIO of the previous set's weight, not as kilograms: a model that
 * predicts absolute load has to relearn every athlete's strength from scratch, where
 * one that predicts a ratio transfers immediately.
 */
/**
 * The band a single set's load may move within.
 *
 * Chosen to contain what the reference actually produces over realistic inputs rather
 * than picked for looks: six reps of surplus is +14%, eight sets of accumulated
 * fatigue is -12%, and a halved rest is another -3%. A range narrower than its own
 * reference clips the samples it is fitted against, and the fit error goes up for a
 * reason that has nothing to do with the model.
 */
export const AUTOREG_RATIO_RANGE: [number, number] = [0.70, 1.16];

/**
 * Reps of surplus are worth about 2.4% of load each.
 *
 * Epley says the load for a given reps-to-failure is proportional to 1/(1 + n/30). The
 * ratio between two of those is (30 + previous) / (30 + target) - a quotient, which is
 * NOT a function of any single weighted sum of the four numbers involved, and the
 * calibration rejected a first attempt that tried to make it one (fit error 0.215).
 *
 * Rewriting it in terms of the surplus fixes that and improves the model at the same
 * time. Around a typical target of twelve reps-to-failure, (30 + 12 + s) / (30 + 12)
 * is 1 + s/42 - so one rep of surplus is worth 1/42, about 2.4%. That is within a
 * whisker of the 2.5% per RIR point the guardrails in Kratos already use, arrived at
 * from the other direction, which is a good sign for both.
 *
 * The surplus is also the honest input. "How much easier was that set than I asked
 * for" is one number the athlete can feel, where four separate rep counts are not.
 */
export const LOAD_PER_SURPLUS_REP = 1 / 42;

/** Reps-to-failure delivered last set, minus what was asked for. */
export function effortSurplus(
  prevReps: number, prevRir: number, targetReps: number, targetRir: number
): number {
  return (prevReps + prevRir) - (targetReps + targetRir);
}

/**
 * The RESIDUAL cost of being deeper into an exercise, after the previous set has
 * already told us what the athlete can do.
 *
 * This was 0.015 per set, taken from the usual observation for compound work, and
 * checking it against this athlete's own logged sets showed the mistake: from
 * 100 kg x 10 @ RIR 0 at set four - four reps short of target - the model proposed
 * 85 kg, a 15% drop nobody would make. Epley alone says 90.7 kg, and the per-set term
 * was taking another 4.5% off on top.
 *
 * The double-count is the point. The previous set's rep count and reps in reserve are
 * a measurement of capacity RIGHT THEN; whatever fatigue had accumulated by set four
 * is already in them. Only the additional fatigue between that set and the next one is
 * still to come, and that is small.
 */
export const FATIGUE_PER_SET = 0.005;
/** Cutting the rest short costs up to this much. */
export const SHORT_REST_PENALTY = 0.06;

function autoregReference(raw: number[]): number {
  const [surplus, setIndex, restRatio] = raw;

  // Additive, not multiplicative. The three corrections are each a few percent, so
  // their products are second-order - but a product is not a function of a weighted
  // sum, and the calibration rejected the multiplicative form for exactly that reason
  // (fit error 0.105 against a limit of 0.05). Writing what is already a small-signal
  // approximation in the form it actually has costs nothing and makes the model
  // representable.
  const ratio = 1
    + surplus * LOAD_PER_SURPLUS_REP
    - FATIGUE_PER_SET * Math.max(0, setIndex)
    - SHORT_REST_PENALTY * (1 - Math.max(0, Math.min(1, restRatio)));

  return Math.max(AUTOREG_RATIO_RANGE[0], Math.min(AUTOREG_RATIO_RANGE[1], ratio));
}

export const autoregModel: DeclaredModel = declareModel({
  key: 'kratos_autoreg_ratio_v1',
  purpose: 'next set weight as a ratio of the previous set',
  hiddenSize: 8,
  outputRange: AUTOREG_RATIO_RANGE,
  reference: autoregReference,
  inputs: [
    {
      name: 'effort surplus (reps easier than asked)',
      scale: v => (v + 15) / 30,
      sampleRange: [-6, 6]
    },
    {
      name: 'set index within the exercise',
      scale: v => Math.min(1, v / 8),
      sampleRange: [0, 8]
    },
    {
      name: 'rest taken vs recommended',
      scale: v => Math.min(1, v / 1.5),
      sampleRange: [0.3, 1.5]
    }
  ]
});

/** The recommendation in kilograms, from the previous set's actual load. */
export function autoregNextWeight(
  previousWeight: number,
  prevReps: number,
  prevRir: number,
  targetReps: number,
  targetRir: number,
  setIndex: number,
  restRatio: number
): number {
  const weight = Number(previousWeight);
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const ratio = autoregModel.predict([
    effortSurplus(prevReps, prevRir, targetReps, targetRir),
    setIndex,
    restRatio
  ]);
  return weight * ratio;
}

// ── Combined fatigue: deliberately absent ────────────────────────────────────
//
// There was a dualSportFatigueModel here. It read 0.54 for a fully rested athlete -
// the bottom half of its scale was unreachable - and rebuilding it turned up something
// more useful than the saturation: it was retrained on every login and its prediction
// was read by nothing. No app, no page, no component. It also learned from a target
// computed as a formula over its own inputs, which teaches a network to recite rather
// than observe.
//
// Hub already answers "how recovered am I" with the recovery score, which trains
// against how the athlete said they actually felt. A second, unread answer to the same
// question is not worth fixing.
