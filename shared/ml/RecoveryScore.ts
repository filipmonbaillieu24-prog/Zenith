import { SimpleMLP, buildSymmetryBrokenHiddenLayer } from './SimpleMLP';

// ==========================================================
// UNIFIED RECOVERY SCORE MODEL (CR11)
// ==========================================================
// Combines signals from all Zenith apps into a single 0-100 recovery score.
// Inputs: cycling freshness, sleep, gym stress, activity, nutrition, body weight.

function generateRecoveryDefaultWeights() {
  // Input (8): [
  //   cardioTSB/100,        → Cycling freshness (-50..+50 → 0..1)
  //   sleepQuality/100,     → Sleep quality (0..100 → 0..1)
  //   sleepDuration/12,     → Sleep duration hours (0..12 → 0..1)
  //   gymVolume7d/10000,    → Gym volume last 7 days
  //   dailySteps/20000,     → Daily steps
  //   calorieBalance/1000,  → Calorie surplus/deficit (-1000..+1000 → -1..+1)
  //   bodyWeight/150,       → Body weight (normalisation)
  //   cardioATL/100         → Acute cardio load
  // ]
  // Hidden: 8, Output: 1 (recovery score 0..1 → 0..100)
  // Prior weight per input feature (hand-picked heuristic magnitude/sign).
  const priorWeightsByInput = [
    0.8,   // High TSB → better recovered
    0.7,   // Good sleep quality → better recovered
    0.5,   // More sleep → better recovered
    -0.6,  // High gym volume → less recovered
    -0.3,  // Maley steps → slight fatigue
    0.3,   // Positive calorie balance → better recovery
    0.1,   // Body weight (neutral)
    -0.7   // High ATL → less recovered
  ];
  // Each hidden neuron gets a small deterministic per-neuron perturbation on top of
  // the shared prior so hidden units aren't identical (symmetry breaking) — without
  // this, ReLU units with identical weights/bias would stay identical forever.
  //
  // The hidden bias is +2.5, not ~0, and this matters. Weighting the eight scaled
  // inputs by the priors above gives roughly -2.1 for a completely depleted athlete
  // and +1.7 for a fully fresh one. With a bias near zero every hidden unit sat
  // below the ReLU threshold for ANY below-average day, so it output exactly 0 -
  // and a merely poor day and a catastrophic one both produced the same number.
  // The model could not tell them apart. Offsetting by 2.5 keeps the units in
  // their responsive range across the whole realistic span.
  const HIDDEN_BIAS = 2.5;
  const { W1, B1 } = buildSymmetryBrokenHiddenLayer(priorWeightsByInput, 8, HIDDEN_BIAS);

  // Output layer, chosen so the realistic input range spans the real 0..100 scale.
  //
  // Previously every output weight was +0.4 with a bias of +0.1. Hidden activations
  // after a ReLU are never negative, so the pre-activation could never drop below
  // that +0.1 bias, and the score could never drop below sigmoid(0.1) = 52.5%.
  // The bottom half of the scale was unreachable: a completely depleted athlete
  // scored 52%, which the dashboard then labelled "well recovered".
  //
  // With HIDDEN_BIAS the eight units carry roughly 0.4 (worst) to 4.2 (best), so
  // these map that span onto about 8%..95%.
  const OUTPUT_WEIGHT = 0.177;
  const W2: number[][] = Array.from({ length: 8 }, () => new Array(1).fill(0));
  const B2: number[] = [-3.006];

  for (let j = 0; j < 8; j++) {
    W2[j][0] = OUTPUT_WEIGHT;
  }

  return { W1, B1, W2, B2 };
}

/**
 * Weekly lifting volume treated as a "hard week", in kg.
 *
 * Exported because the model's input vector AND Hub's background-training
 * target both need it, and they previously each hardcoded 15,000 - low enough
 * that any serious lifter sat permanently at the cap in both places.
 */
export const GYM_VOLUME_HARD_WEEK_KG = 25000;

/**
 * Cardio freshness (TSB) range used when scoring recovery, from clearly
 * fatigued to clearly rested.
 *
 * The training target previously mapped -30..+50 onto 0..1, so the freshness
 * term only reached full value at a TSB of +50 - a level you reach by not
 * training. An athlete sitting at a healthy TSB near zero scored barely a third
 * of it, which held their achievable recovery score down to about 62% no matter
 * how well they slept.
 */
export const RECOVERY_TSB_MIN = -30;
export const RECOVERY_TSB_MAX = 15;

/** Maps a cardio TSB onto 0..1 for recovery scoring. */
export function scaleRecoveryTsb(tsb: number): number {
  const span = RECOVERY_TSB_MAX - RECOVERY_TSB_MIN;
  return Math.max(0, Math.min(1, (tsb - RECOVERY_TSB_MIN) / span));
}

export const recoveryModel = new SimpleMLP(
  // Key bumped from 'unified_recovery_score'. Anything stored under the old key
  // was trained on top of defaults whose output could not go below 52.5%, so it
  // learned around a floor that no longer exists.
  8, 8, 1, 'unified_recovery_score_v2', generateRecoveryDefaultWeights
);

/**
 * Predicts a unified recovery score (0..100).
 * 0 = completely depleted, 100 = fully recovered.
 *
 * Consumed by: Hub Dashboard, Kratos (rest time), Aero Coach (intensity cap), Vigor (display).
 */
/**
 * The ONE place raw recovery signals become a model input vector.
 *
 * Both the prediction path and Hub's background trainer go through this. They
 * previously each had their own copy of the scaling, so changing a divisor in
 * one silently created a train/serve mismatch - the model would be taught on
 * one scale and asked to predict on another. That is the same failure that had
 * to be fixed in the Kratos autoregulation model and again in ZenithFusionNet;
 * a second copy of a feature vector is how it keeps coming back.
 */
export function buildRecoveryFeatureVector(
  cardioTSB: number,
  sleepQuality: number,
  sleepDuration: number,
  gymVolume7d: number,
  dailySteps: number,
  calorieBalance: number,
  bodyWeight: number,
  cardioATL: number
): number[] {
  return [
    Math.max(0, Math.min(1, (cardioTSB + 50) / 100)),
    Math.min(1, sleepQuality / 100),
    Math.min(1, sleepDuration / 12),
    // Divisor raised from 10,000. At the old scale this hit its 1.5 cap at
    // 15,000 kg a week, which anyone training seriously exceeds routinely - an
    // athlete lifting ~16,500 kg in a normal week sat pinned at the maximum gym
    // penalty permanently, so the input told the model nothing about them. Caps
    // at 37,500 kg now, which a hard week approaches rather than saturates.
    Math.min(1.5, gymVolume7d / GYM_VOLUME_HARD_WEEK_KG),
    Math.min(1, dailySteps / 20000),
    Math.max(-1, Math.min(1, calorieBalance / 1000)),
    Math.min(1.5, bodyWeight / 150),
    Math.min(1.5, cardioATL / 100)
  ];
}

export function predictRecoveryScore(
  cardioTSB: number,
  sleepQuality: number,
  sleepDuration: number,
  gymVolume7d: number,
  dailySteps: number,
  calorieBalance: number,
  bodyWeight: number,
  cardioATL: number
): number {
  const x = buildRecoveryFeatureVector(
    cardioTSB, sleepQuality, sleepDuration, gymVolume7d,
    dailySteps, calorieBalance, bodyWeight, cardioATL
  );
  const y = recoveryModel.predict(x);
  return Math.round(y[0] * 100); // 0..100 score
}

/**
 * Trains the recovery score model based on actual next-day performance feedback.
 * Target: 0..1 where 1 = performed well the next day (was recovered).
 */
export async function trainRecoveryModel(
  supabase: any,
  userId: string,
  cardioTSB: number,
  sleepQuality: number,
  sleepDuration: number,
  gymVolume7d: number,
  dailySteps: number,
  calorieBalance: number,
  bodyWeight: number,
  cardioATL: number,
  actualRecoveryTarget: number // 0..1
): Promise<number> {
  // Third copy of this vector, found still on the old gym divisor after the
  // other two were updated - training here would have used a different scale
  // from the one predictions are served on, in the same file.
  const x = buildRecoveryFeatureVector(
    cardioTSB, sleepQuality, sleepDuration, gymVolume7d,
    dailySteps, calorieBalance, bodyWeight, cardioATL
  );
  const target = Math.max(0, Math.min(1, actualRecoveryTarget));
  const y = await recoveryModel.train(supabase, userId, x, [target], 0.15);
  return Math.round(y[0] * 100);
}
