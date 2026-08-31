import { SimpleMLP, buildSymmetryBrokenHiddenLayer } from './SimpleMLP';
import { MinMaxScaler } from './MinMaxScaler';

export const volumeScaler = new MinMaxScaler(0, 5000);
export const progressionScaler = new MinMaxScaler(-10, 10);
export const sleepScaler = new MinMaxScaler(0, 100);
export const tsbScaler = new MinMaxScaler(-50, 50);
export const repsScaler = new MinMaxScaler(0, 20);

// ==========================================================
// 1. KRATOS PROGRESSIVE OVERLOAD MODEL
// ==========================================================

function generateKratosOverloadDefaultWeights() {
  // Inputs (5): [pastSetsVolume/5000, weightProgression/10, sleepQuality/1.0, cardioTsbScaled/1.0, targetReps/20]
  // Hidden: 6, Output: 1
  // Higher past volume & positive progression trend -> positive effect
  const priorWeightsByInput = [
    0.5,   // past volume
    0.6,   // weight progression
    0.8,   // sleep quality (better sleep = more overload capability)
    0.7,   // cardio TSB (positive TSB = fresh legs/body = more capability)
    -0.3   // higher reps -> lower overload increment (more reps = lighter weight)
  ];
  // Small deterministic per-neuron perturbation breaks weight symmetry so hidden
  // ReLU units don't stay identical (and identically-gradiented) forever.
  const { W1, B1 } = buildSymmetryBrokenHiddenLayer(priorWeightsByInput, 6, 0.05);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.1]; // base offset for output

  for (let j = 0; j < 6; j++) {
    W2[j][0] = 0.45;
  }

  return { W1, B1, W2, B2 };
}

export const kratosOverloadModel = new SimpleMLP(
  5, 
  6, 
  1, 
  'kratos_overload_weights', 
  generateKratosOverloadDefaultWeights
);

/**
 * Predicts the optimal weight increment (in kg) for the next workout session.
 * Outputs are mapped to a range of 0..10kg, rounded to 0.5kg steps (or 2.5kg steps depending on equipment).
 */
export function predictProgressiveOverload(
  pastSetsVolume: number, // total volume (weight * reps) of last session
  weightProgression: number, // change in weight (kg) over last 3 sessions
  sleepQuality: number, // 0..100
  cardioTsb: number, // -50..+50
  targetReps: number // e.g. 10 reps
): number {
  const x = [
    volumeScaler.scale(pastSetsVolume),
    progressionScaler.scale(weightProgression),
    sleepScaler.scale(sleepQuality),
    tsbScaler.scale(cardioTsb),
    repsScaler.scale(targetReps)
  ];

  const y = kratosOverloadModel.predict(x);
  
  // Map 0..1 to 0..10 kg increment, rounded to nearest 0.5kg
  const increment = Math.max(0, Math.min(10, y[0] * 10));
  return Math.round(increment * 2) / 2; // round to nearest 0.5kg
}

/**
 * Trains the progressive overload model on user performance confirmation.
 */
export async function trainProgressiveOverloadModel(
  supabase: any,
  userId: string,
  pastSetsVolume: number,
  weightProgression: number,
  sleepQuality: number,
  cardioTsb: number,
  targetReps: number,
  actualIncrementOccurred: number // the actual weight added (kg)
): Promise<number> {
  const scaledTsb = Math.max(0, Math.min(1, (cardioTsb + 50) / 100));
  
  const x = [
    Math.min(1.5, pastSetsVolume / 5000),
    Math.min(1.5, Math.max(-1.5, weightProgression / 10)),
    Math.min(1.0, sleepQuality / 100),
    scaledTsb,
    Math.min(1.5, targetReps / 20)
  ];

  const target = Math.max(0, Math.min(1, actualIncrementOccurred / 10)); // scale 0..10kg to 0..1
  
  const y = await kratosOverloadModel.train(supabase, userId, x, [target], 0.15);
  const increment = Math.max(0, Math.min(10, y[0] * 10));
  return Math.round(increment * 2) / 2;
}

// ==========================================================
// 2. KRATOS INTRA-WORKOUT AUTOREGULATION MODEL 2.0
// ==========================================================

function generateKratosAutoregDefaultWeights() {
  // Inputs (6): [setIndex/10.0, prevWeight/400.0, prevReps/30.0, rirDelta/5.0, restRatio/1.5, sleepQuality/100.0]
  // Hidden: 6, Output: 1
  // Set default strength regression weights:
  // - More sets = higher fatigue = lower e1RM capacity -> negative weight on setIndex
  // - High previous weight/reps = high baseline strength -> positive weights
  // - Positive RIR Delta (overperformed) = higher capacity -> positive weight
  // - More rest = better ATP recovery = higher capacity -> positive weight on restRatio
  const priorWeightsByInput = [
    -0.3, // set index fatigue
    0.8,  // prev weight (scaled 0..400kg)
    0.4,  // prev reps
    0.5,  // rir delta (+ if overperformed, - if early failure)
    0.3,  // rest recovery ratio
    0.2   // sleep quality
  ];
  // Small deterministic per-neuron perturbation breaks weight symmetry so hidden
  // ReLU units don't stay identical (and identically-gradiented) forever.
  const { W1, B1 } = buildSymmetryBrokenHiddenLayer(priorWeightsByInput, 6, 0.05);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.2];

  for (let j = 0; j < 6; j++) {
    W2[j][0] = 0.5;
  }

  return { W1, B1, W2, B2 };
}

export const kratosAutoregModel = new SimpleMLP(
  6,
  6,
  1,
  'kratos_autoreg_weights',
  generateKratosAutoregDefaultWeights
);

/**
 * Converts a rest duration (seconds) into the [0.2, 1.5]-clamped "rest ratio"
 * feature used by the autoregulation model (actual rest vs. the recommended rest
 * for the set).
 */
export function computeAutoregRestRatio(restSeconds: number, recommendedRestSeconds: number = 120): number {
  return Math.min(1.5, Math.max(0.2, restSeconds / Math.max(45, recommendedRestSeconds)));
}

/**
 * Builds the EXACT feature vector consumed by the Kratos Autoregulation 2.0 model
 * (predict, online train, and the background retrainer all funnel through this one
 * function) so the model is never trained on one feature distribution and served on
 * another (train/serve skew).
 *
 * Inputs (6): [setIndex/10.0, prevWeight/400.0, prevReps/30.0, rirDelta/5.0, restRatio, sleepQuality/100.0]
 */
export function buildAutoregFeatureVector(
  setIndex: number,
  prevWeight: number,
  prevReps: number,
  rirDelta: number,
  restRatio: number,
  sleepQuality: number
): number[] {
  return [
    Math.min(1.0, setIndex / 10.0),
    Math.min(1.5, prevWeight / 400.0),
    Math.min(1.5, prevReps / 30.0),
    Math.max(-1.5, Math.min(1.5, rirDelta / 5.0)),
    restRatio,
    Math.min(1.0, sleepQuality / 100.0)
  ];
}

/** Scales an achieved e1RM (kg) down to the model's 0..1 target space (0..400kg). */
export function computeAutoregE1RMTarget(weight: number, reps: number, rir: number): number {
  const e1RM = weight * (1.0 + (reps + rir) / 30.0);
  return Math.max(0.0, Math.min(1.0, e1RM / 400.0));
}

/**
 * Predicts the optimal weight (in kg) for the next set based on the previous set's parawithers,
 * RIR Delta matrix, rest time, and hardware step limits (Autoregulation 2.0).
 */
export function predictAutoregWeight(
  setIndex: number,
  prevWeight: number,
  prevReps: number,
  prevRir: number,
  restSeconds: number,
  targetReps: number,
  targetRir: number,
  stepWeight: number = 1,
  isPerSide: boolean = false,
  recommendedRestSeconds: number = 120,
  sleepQuality: number = 80,
  hardMinWeight?: number,
  hardMaxWeight?: number
): number {
  const rirDelta = prevRir - targetRir;
  const restRatio = computeAutoregRestRatio(restSeconds, recommendedRestSeconds);

  const x = buildAutoregFeatureVector(setIndex, prevWeight, prevReps, rirDelta, restRatio, sleepQuality);

  const y = kratosAutoregModel.predict(x);
  
  // y[0] is predicted e1RM scaled 0..1 (represents 0..400kg)
  const predictedE1RM = y[0] * 400.0;
  
  // Calculate predicted weight using Epley formula: weight = predictedE1RM / (1 + (reps + rir) / 30)
  const repsToFailure = targetReps + targetRir;
  const predictedWeight = predictedE1RM / (1.0 + repsToFailure / 30.0);
  
  // Safety guardrails: how far a single set's load may swing off the previous set.
  // Scaled by rirDelta so a small overperformance (e.g. 1 rep in reserve above target)
  // only earns a small bump, while a larger, genuine overperformance can justify more.
  // A flat 20%/15% band here previously let any positive rirDelta jump straight to the
  // ceiling every time (e.g. 100 -> 120 lbs off just 1 extra rep in reserve), and since
  // the bound is relative to the previous *set*, repeated overperformance within one
  // exercise compounded into unrealistic same-session escalation (75 -> 90 -> 105 kg).
  const repsToFailurePrev = prevReps + prevRir;
  const e1RMPrev = prevWeight * (1.0 + repsToFailurePrev / 30.0);
  const epleyW = e1RMPrev / (1.0 + (targetReps + targetRir) / 30.0);

  const RIR_ADJUSTMENT_PCT = 0.025; // ~2.5% weight change per RIR point of delta
  const BASE_ADJUSTMENT_PCT = 0.02; // small allowance at rirDelta 0 (equipment step noise)
  const MAX_ADJUSTMENT_PCT = 0.15; // hard ceiling even for a large rirDelta

  const growthPct = Math.min(MAX_ADJUSTMENT_PCT, BASE_ADJUSTMENT_PCT + RIR_ADJUSTMENT_PCT * Math.max(0, rirDelta));
  const shrinkPct = Math.min(MAX_ADJUSTMENT_PCT, BASE_ADJUSTMENT_PCT + RIR_ADJUSTMENT_PCT * Math.max(0, -rirDelta));

  let minSafeW = Math.max(prevWeight * (1 - shrinkPct), epleyW * 0.92);
  let maxSafeW = Math.min(prevWeight * (1 + growthPct), epleyW * 1.08);

  // On coarse equipment the percentage band can be narrower than a single notch,
  // and then it excludes the only weight the machine can actually provide: a 15 lb
  // stack at 100 lb has its next position at +15%, while a rirDelta of 2 allows
  // +7%. The band tops out at 107, snapping rounds it back to 100, and the athlete
  // never moves up however easy the set was. Reps cannot rescue it either - the
  // caller's rep fallback caps at targetReps + 4.
  //
  // Once the reps are at that ceiling and the set is still at or above target RIR,
  // let the band reach the next real notch - but only when Epley says that much has
  // been earned, so a very coarse machine cannot launch someone up a stack.
  //
  // Kept identical to TrackerScreen.kt in Kratos Pilot, which runs the same
  // arithmetic on-device; the two have drifted before.
  if (rirDelta > 0 && prevReps >= targetReps + 4) {
    const gridBase = hardMinWeight ?? prevWeight;
    const nextNotch = gridBase + Math.ceil((prevWeight - gridBase + 1e-6) / Math.max(0.25, stepWeight)) * Math.max(0.25, stepWeight);
    if (nextNotch > maxSafeW && nextNotch <= epleyW * 1.08) maxSafeW = nextNotch;
  }

  // Hard equipment limits (e.g. a machine's actual stack range) always win over the
  // rirDelta-scaled band above - no amount of overperformance should suggest a weight
  // the equipment physically can't provide.
  if (hardMinWeight != null) minSafeW = Math.max(minSafeW, hardMinWeight);
  if (hardMaxWeight != null) maxSafeW = Math.min(maxSafeW, hardMaxWeight);

  const rawClampedWeight = Math.max(0.0, Math.min(maxSafeW, Math.max(minSafeW, predictedWeight)));

  // Hardware Step Snapping (Autoregulatie 2.0). Anchor the grid to hardMinWeight
  // (the stack's actual lowest pin) when it's known, rather than to prevWeight:
  // prevWeight is only guaranteed grid-aligned if it came from a previous
  // working set snapped this same way - a warmup weight (computed as a rough
  // percentage, never snapped) is not, and anchoring to an off-grid prevWeight
  // silently shifts the whole grid, letting through positions the equipment
  // doesn't actually have (e.g. step=15, hardMinWeight=55 -> real positions are
  // 55/70/85/.../115/130; anchoring to an off-grid 75 warmup could still
  // produce 120, which never exists on this machine). Falls back to anchoring
  // on prevWeight when no hardMinWeight is configured.
  const validStep = Math.max(0.25, stepWeight);
  if (isPerSide) {
    const perSideRaw = rawClampedWeight / 2.0;
    const gridAnchor = hardMinWeight != null ? hardMinWeight / 2.0 : (prevWeight > 0 ? prevWeight / 2.0 : 0);
    const diff = perSideRaw - gridAnchor;
    const snappedPerSide = gridAnchor + Math.round(diff / validStep) * validStep;
    return Math.max(validStep * 2.0, snappedPerSide * 2.0);
  } else {
    const gridAnchor = hardMinWeight ?? (prevWeight > 0 ? prevWeight : 0);
    const diff = rawClampedWeight - gridAnchor;
    const snapped = gridAnchor + Math.round(diff / validStep) * validStep;
    return Math.max(validStep, snapped);
  }
}

/**
 * Trains the autoregulation 2.0 model on user set completion.
 */
export async function trainAutoregModel(
  supabase: any,
  userId: string,
  setIndex: number,
  prevWeight: number,
  prevReps: number,
  prevRir: number,
  targetRir: number,
  restSeconds: number,
  recommendedRestSeconds: number,
  actualNextWeight: number,
  actualNextReps: number,
  actualNextRir: number,
  sleepQuality: number = 80
): Promise<number> {
  const rirDelta = prevRir - targetRir;
  const restRatio = computeAutoregRestRatio(restSeconds, recommendedRestSeconds);

  const x = buildAutoregFeatureVector(setIndex, prevWeight, prevReps, rirDelta, restRatio, sleepQuality);

  // Actual next e1rm achieved:
  const target = computeAutoregE1RMTarget(actualNextWeight, actualNextReps, actualNextRir);

  // Single-example online SGD: kept deliberately conservative (was 0.15) so one
  // outlier set (unusually good or bad) nudges the persisted weights gradually
  // instead of swinging them immediately. Momentum/EMA in SimpleMLP is unchanged.
  const y = await kratosAutoregModel.train(supabase, userId, x, [target], 0.03);
  return y[0] * 400.0;
}

// ==========================================================
// 3. DUAL-SPORT FATIGUE MODEL (CR14)
// ==========================================================

function generateDualSportFatigueWeights() {
  // Input (6): [cardioTSB/100, cardioATL/100, gymVolume7d/10000, sleepQuality/100, steps7d/100000, activeCalories/5000]
  // Hidden: 6, Output: 1 (fatigue score 0..1)
  const priorWeightsByInput = [
    -0.8,  // High TSB = less fatigued (negative correlation)
    0.7,   // High cardio ATL = more fatigued
    0.6,   // High gym volume = more fatigued
    -0.5,  // Good sleep quality = less fatigued
    0.3,   // Maley steps = slight fatigue
    0.5    // High active calories = more fatigued
  ];
  // Small deterministic per-neuron perturbation breaks weight symmetry so hidden
  // ReLU units don't stay identical (and identically-gradiented) forever.
  const { W1, B1 } = buildSymmetryBrokenHiddenLayer(priorWeightsByInput, 6, 0.05);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.15];

  for (let j = 0; j < 6; j++) {
    W2[j][0] = 0.45;
  }

  return { W1, B1, W2, B2 };
}

export const dualSportFatigueModel = new SimpleMLP(
  6, 6, 1, 'dual_sport_fatigue_weights', generateDualSportFatigueWeights
);

/**
 * Predicts a combined dual-sport fatigue score (0..1).
 * 0 = fully rested, 1 = extremely fatigued.
 */
export function predictDualSportFatigue(
  cardioTSB: number,
  cardioATL: number,
  gymVolume7d: number,
  sleepQuality: number,
  steps7d: number,
  activeCalories: number
): number {
  const x = [
    Math.max(0, Math.min(1, (cardioTSB + 50) / 100)),
    Math.min(1.5, cardioATL / 100),
    Math.min(1.5, gymVolume7d / 10000),
    Math.min(1.0, sleepQuality / 100),
    Math.min(1.0, steps7d / 100000),
    Math.min(1.5, activeCalories / 5000)
  ];
  const y = dualSportFatigueModel.predict(x);
  return parseFloat(y[0].toFixed(2));
}
