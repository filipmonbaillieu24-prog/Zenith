import { SimpleMLP } from './SimpleMLP';

// ==========================================================
// UNIFIED RECOVERY SCORE MODEL (CR11)
// ==========================================================
// Combines signals from all Zenith apps into a single 0-100 recovery score.
// Inputs: cycling freshness, sleep, gym stress, activity, nutrition, body weight.

/**
 * Weekly lifting treated as a "hard week", in EFFORT kg (tonnage already
 * discounted by reps in reserve - see kratosEffortVolume).
 *
 * Exported because the model's input vector, the heuristic below, and Hub's
 * background-training target all need it, and they previously each hardcoded
 * 15,000 - low enough that any serious lifter sat permanently at the cap.
 */
export const GYM_VOLUME_HARD_WEEK_KG = 25000;

/** Sleep duration, in hours, past which more sleep stops helping recovery. */
export const SLEEP_DURATION_TARGET_H = 8;

/**
 * How much each signal contributes to recovery. Sums to 1.
 *
 * This is the single source of truth for what Zenith believes recovery is made
 * of. It sets the model's starting weights AND the target the background trainer
 * teaches, because for a long time those were two DIFFERENT hand-written
 * formulas that disagreed with each other - the priors said cardio freshness
 * mattered most, the target said sleep did, and neither matched the other's
 * scaling. Every training pass dragged the displayed score toward one while the
 * defaults pulled it back toward the other, which is why the number kept
 * reading low and kept coming back after each fix.
 *
 * Steps, calorie balance and bodyweight are deliberately absent. They are still
 * model inputs, so it can learn a relationship from an athlete's own history,
 * but Zenith does not claim to know one in advance and will not bake a guess in.
 */
export const RECOVERY_SIGNAL_WEIGHTS = {
  sleepQuality: 0.45,
  sleepDuration: 0.15,
  cardioFreshness: 0.25,
  gymFreshness: 0.15
} as const;

function generateRecoveryDefaultWeights() {
  // Input (8), in buildRecoveryFeatureVector order: [
  //   cardio freshness      → acute vs chronic cardio load (0..1)
  //   sleepQuality/100      → Zenith sleep score (0..1)
  //   sleepDuration/8       → hours slept, capped at the point more stops helping
  //   gymEffort7d/25000     → last 7 days of lifting in effort kg
  //   dailySteps/20000      → steps today
  //   calorieBalance/1000   → surplus/deficit (-1..+1)
  //   bodyWeight/150        → normalisation
  //   cardioATL/100         → acute cardio load
  // ]
  // Hidden: 8, Output: 1 (recovery score 0..1 → 0..100)
  // Prior weight per input feature, taken straight from RECOVERY_SIGNAL_WEIGHTS
  // so the untrained model and the trained target describe the same thing. These
  // were previously hand-picked separately from the target and disagreed with it
  // on both the ranking and the scale of every signal.
  const W = RECOVERY_SIGNAL_WEIGHTS;
  const priorWeightsByInput = [
    W.cardioFreshness,   // fresher cardio -> better recovered
    W.sleepQuality,      // better sleep   -> better recovered
    W.sleepDuration,     // more sleep     -> better recovered
    -W.gymFreshness,     // more hard lifting -> less recovered
    0,                   // steps: no assumed effect, learned from history only
    0,                   // calorie balance: likewise
    0,                   // bodyweight: a normalisation input, not a recovery signal.
                         // This was +0.1, which scored a heavier athlete as better
                         // recovered for no reason other than being heavier.
    0                    // acute cardio load: already carried by cardioFreshness
  ];
  // Every hidden unit reads the SAME prior-weighted sum; what differs is where its
  // ReLU switches on. The eight knees are spread evenly across the range that sum
  // actually takes, so the layer produces a piecewise-linear curve with eight
  // distinct knots.
  //
  // This replaces a shared bias plus tiny per-neuron perturbations, which had two
  // problems. The units were near-duplicates of each other, so eight of them did
  // the work of one and the layer could only ever be affine - and a sigmoid of an
  // affine function cannot track a linear target, which is what the recovery
  // heuristic is. It saturates at both ends. With the knees spread, the same eight
  // units reproduce the heuristic to within 4 points across the whole scale, and
  // differing gate points break symmetry far more usefully than noise did.
  const HIDDEN_KNEES = [
    -0.085551, 0.028962, 0.143474, 0.257987,
    0.372500, 0.487012, 0.601525, 0.716038
  ];

  const W1: number[][] = Array.from({ length: 8 }, (_, i) =>
    new Array(8).fill(priorWeightsByInput[i])
  );
  const B1: number[] = HIDDEN_KNEES.map(knee => -knee);

  // Output layer, fitted by least squares against recoveryHeuristic on the logit
  // scale over 8,000 sampled realistic days (RMSE 1.0 score points, worst case 4).
  //
  // Previously every output weight was +0.4 with a bias of +0.1. Hidden activations
  // after a ReLU are never negative, so the pre-activation could never drop below
  // that +0.1 bias, and the score could never fall below sigmoid(0.1) = 52.5% - the
  // bottom half of the scale was unreachable, and a completely depleted athlete
  // scored 52%, which the dashboard labelled "well recovered".
  const W2: number[][] = [
    [4.699238], [1.052561], [-1.596429], [-0.198728],
    [0.167463], [0.371539], [2.063093], [5.007867]
  ];
  const B2: number[] = [-2.019565];

  return { W1, B1, W2, B2 };
}

/**
 * Acute cardio load below this, in TSS/day, is small in absolute terms whatever
 * it looks like relative to the athlete's base. Used as a floor on the
 * denominator so a low-volume athlete is not measured against almost nothing.
 */
export const MEANINGFUL_CTL = 15;

/**
 * How fresh the athlete's cardio is, on 0..1.
 *
 * This used to scale raw TSB (= CTL - ATL) onto a fixed -30..+15 band, and that
 * is unusable for anyone who does not ride or run much. TSB is bounded by CTL:
 * with a CTL near zero, TSB can never rise far above zero no matter how rested
 * you are, so a lifter who does almost no cardio sat permanently near the middle
 * of the band and could never earn the top of it. Worse, the two states are
 * indistinguishable on raw TSB alone - CTL 60 / ATL 60 and CTL 1 / ATL 1 both
 * give TSB 0, but the first athlete is deep in a training block and the second
 * is carrying no cardio fatigue whatsoever.
 *
 * Asking "how much fatigue are you carrying relative to the training you are
 * actually used to" (an acute:chronic ratio) is well defined at every scale.
 */
export function cardioFreshness(cardioCTL: number, cardioATL: number): number {
  const ctl = Number.isFinite(cardioCTL) ? Math.max(0, cardioCTL) : 0;
  const atl = Number.isFinite(cardioATL) ? Math.max(0, cardioATL) : 0;

  // The floor is what makes this safe at low volume. Without it, an athlete with
  // a CTL of 2 who does one ordinary ride divides by almost nothing and reads as
  // destroyed. With it, an acute load below ~15 TSS/day is treated as small in
  // absolute terms no matter how it compares to their base - which is right, as
  // that is roughly one easy hour a week.
  //
  // It also still catches the case that genuinely does hurt: an unaccustomed big
  // effort. CTL 5 with ATL 30 gives a ratio of 2.0 and scores 0, correctly.
  const ratio = atl / Math.max(ctl, MEANINGFUL_CTL);

  // 0.6 and below = rested; 1.4 and above = deep in a block carrying real fatigue.
  return Math.max(0, Math.min(1, (1.4 - ratio) / 0.8));
}

/**
 * Everything the recovery model reads, named.
 *
 * Deliberately an object rather than eight positional numbers. Two of these are
 * scaled from the same cardio series and two are volumes in different units;
 * with a positional signature a caller silently passing tonnage where effort-kg
 * belongs, or ATL where CTL belongs, compiles cleanly and is wrong forever.
 */
export interface RecoveryInput {
  /** Cardio-only chronic training load (Aero + Stride). */
  cardioCTL: number;
  /** Cardio-only acute training load. */
  cardioATL: number;
  /** Zenith sleep score, 0..100. */
  sleepQuality: number;
  sleepDurationHours: number;
  /**
   * Last 7 days of lifting in EFFORT kg - tonnage already discounted by reps in
   * reserve (see kratosEffortVolume). Not raw `volume`.
   */
  gymEffort7d: number;
  dailySteps: number;
  calorieBalance: number;
  bodyWeight: number;
}

/**
 * The transparent, explainable recovery score: a plain weighted sum of the four
 * signals Zenith claims to understand, on 0..1.
 *
 * This is what the model starts out reproducing and what the background trainer
 * teaches, so an untrained model and a trained one agree about the same day.
 * Training then lets the model learn where a particular athlete DEVIATES from
 * the heuristic - which is the only reason to have a model here at all.
 */
export function recoveryHeuristic(input: RecoveryInput): number {
  const W = RECOVERY_SIGNAL_WEIGHTS;
  const sleepQ = Math.max(0, Math.min(1, input.sleepQuality / 100));
  const sleepD = Math.max(0, Math.min(1, input.sleepDurationHours / SLEEP_DURATION_TARGET_H));
  const fresh = cardioFreshness(input.cardioCTL, input.cardioATL);
  const gymFresh = 1 - Math.max(0, Math.min(1, input.gymEffort7d / GYM_VOLUME_HARD_WEEK_KG));

  return Math.max(0, Math.min(1,
    sleepQ * W.sleepQuality
    + sleepD * W.sleepDuration
    + fresh * W.cardioFreshness
    + gymFresh * W.gymFreshness
  ));
}

export const recoveryModel = new SimpleMLP(
  // v1 -> v2: v1's defaults could not output below 52.5%, so anything trained on
  // top of them learned around a floor that no longer exists.
  // v2 -> v3: two INPUTS changed meaning. Slot 0 is now fitness-relative cardio
  // freshness rather than scaled raw TSB, and slot 3 is effort-weighted gym load
  // rather than raw tonnage. Weights trained against the old meanings would be
  // read as if they described the new ones.
  8, 8, 1, 'unified_recovery_score_v3', generateRecoveryDefaultWeights
);

/**
 * The ONE place raw recovery signals become a model input vector.
 *
 * Feeds predictRecoveryScore (0 = completely depleted, 100 = fully recovered),
 * which is consumed by Hub's dashboard, Vigor's display, Kratos's rest timing
 * and Aero Coach's intensity cap.
 *
 * Both the prediction path and Hub's background trainer go through this. They
 * previously each had their own copy of the scaling, so changing a divisor in
 * one silently created a train/serve mismatch - the model would be taught on
 * one scale and asked to predict on another. That is the same failure that had
 * to be fixed in the Kratos autoregulation model and again in ZenithFusionNet;
 * a second copy of a feature vector is how it keeps coming back.
 */
export function buildRecoveryFeatureVector(input: RecoveryInput): number[] {
  return [
    // Fitness-relative, so an athlete with no cardio base reads as fresh rather
    // than as permanently mid-scale. See cardioFreshness.
    cardioFreshness(input.cardioCTL, input.cardioATL),
    Math.min(1, input.sleepQuality / 100),
    Math.min(1, input.sleepDurationHours / SLEEP_DURATION_TARGET_H),
    // Effort kg, not tonnage. Divisor raised from 10,000 to 25,000: at the old
    // scale this hit its 1.5 cap at 15,000 kg a week, which anyone training
    // seriously exceeds routinely, so gym load sat pinned at maximum penalty and
    // told the model nothing.
    Math.min(1.5, input.gymEffort7d / GYM_VOLUME_HARD_WEEK_KG),
    Math.min(1, input.dailySteps / 20000),
    Math.max(-1, Math.min(1, input.calorieBalance / 1000)),
    Math.min(1.5, input.bodyWeight / 150),
    Math.min(1.5, input.cardioATL / 100)
  ];
}

export function predictRecoveryScore(input: RecoveryInput): number {
  const y = recoveryModel.predict(buildRecoveryFeatureVector(input));
  return Math.round(y[0] * 100); // 0..100 score
}

/**
 * Trains the recovery score model based on actual next-day performance feedback.
 * Target: 0..1 where 1 = performed well the next day (was recovered).
 */
export async function trainRecoveryModel(
  supabase: any,
  userId: string,
  input: RecoveryInput,
  actualRecoveryTarget: number // 0..1
): Promise<number> {
  // Third copy of this vector, found still on the old gym divisor after the
  // other two were updated - training here would have used a different scale
  // from the one predictions are served on, in the same file.
  const x = buildRecoveryFeatureVector(input);
  const target = Math.max(0, Math.min(1, actualRecoveryTarget));
  const y = await recoveryModel.train(supabase, userId, x, [target], 0.15);
  return Math.round(y[0] * 100);
}
