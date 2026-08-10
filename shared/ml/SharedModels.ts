import { SimpleMLP } from './SimpleMLP';

// ==========================================================
// 1. KRATOS PROGRESSIVE OVERLOAD MODEL
// ==========================================================

function generateKratosOverloadDefaultWeights() {
  // Inputs (5): [pastSetsVolume/5000, weightProgression/10, sleepQuality/1.0, cardioTsbScaled/1.0, targetReps/20]
  // Hidden: 6, Output: 1
  const W1: number[][] = Array.from({ length: 5 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.05);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.1]; // base offset for output

  // Higher past volume & positive progression trend -> positive effect
  for (let j = 0; j < 6; j++) {
    W1[0][j] = 0.5;  // past volume
    W1[1][j] = 0.6;  // weight progression
    W1[2][j] = 0.8;  // sleep quality (better sleep = more overload capability)
    W1[3][j] = 0.7;  // cardio TSB (positive TSB = fresh legs/body = more capability)
    W1[4][j] = -0.3; // higher reps -> lower overload increment (more reps = lighter weight)
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
  const scaledTsb = Math.max(0, Math.min(1, (cardioTsb + 50) / 100)); // scale -50..+50 to 0..1
  
  const x = [
    Math.min(1.5, pastSetsVolume / 5000),
    Math.min(1.5, Math.max(-1.5, weightProgression / 10)),
    Math.min(1.0, sleepQuality / 100),
    scaledTsb,
    Math.min(1.5, targetReps / 20)
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
// 2. KRATOS INTRA-WORKOUT AUTOREGULATION MODEL
// ==========================================================

function generateKratosAutoregDefaultWeights() {
  // Inputs (5): [setIndex/5.0, prevWeight/200.0, prevReps/20.0, prevRir/10.0, restSeconds/300.0]
  // Hidden: 6, Output: 1
  const W1: number[][] = Array.from({ length: 5 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.05);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.2];

  // Set default strength regression weights:
  // - More sets = higher fatigue = lower e1RM capacity -> negative weight on setIndex
  // - More rest = better recovery = higher capacity -> positive weight on restSeconds
  // - High previous weight/reps = high baseline strength -> positive weights
  for (let j = 0; j < 6; j++) {
    W1[0][j] = -0.3; // set index fatigue
    W1[1][j] = 0.7;  // prev weight
    W1[2][j] = 0.4;  // prev reps
    W1[3][j] = -0.2; // prev RIR (farther from failure, so lower weight/reps achieved)
    W1[4][j] = 0.3;  // rest recovery
    W2[j][0] = 0.5;
  }

  return { W1, B1, W2, B2 };
}

export const kratosAutoregModel = new SimpleMLP(
  5,
  6,
  1,
  'kratos_autoreg_weights',
  generateKratosAutoregDefaultWeights
);

/**
 * Predicts the optimal weight (in kg) for the next set based on the previous set's parameters and rest time.
 */
export function predictAutoregWeight(
  setIndex: number,
  prevWeight: number,
  prevReps: number,
  prevRir: number,
  restSeconds: number,
  targetReps: number,
  targetRir: number
): number {
  const x = [
    Math.min(1.0, setIndex / 5.0),
    Math.min(1.5, prevWeight / 200.0),
    Math.min(1.5, prevReps / 20.0),
    Math.min(1.0, prevRir / 10.0),
    Math.min(1.5, restSeconds / 300.0)
  ];

  const y = kratosAutoregModel.predict(x);
  
  // y[0] is the predicted next_e1rm scaled 0..1 (represents 0..200kg)
  const predictedE1RM = y[0] * 200.0;
  
  // Calculate predicted weight for the target reps and target RIR using the Epley formula:
  // weight = predictedE1RM / (1 + (reps + rir) / 30)
  const repsToFailure = targetReps + targetRir;
  const predictedWeight = predictedE1RM / (1.0 + repsToFailure / 30.0);
  
  // Apply safety guardrails: clamp predicted weight within 15% of previous weight
  // and within 10% of the scientific Epley formula weight.
  const repsToFailurePrev = prevReps + prevRir;
  const e1RMPrev = prevWeight * (1.0 + repsToFailurePrev / 30.0);
  const epleyW = e1RMPrev / (1.0 + (targetReps + targetRir) / 30.0);
  
  const minSafeW = Math.max(prevWeight * 0.85, epleyW * 0.9);
  const maxSafeW = Math.min(prevWeight * 1.15, epleyW * 1.1);
  
  return Math.max(0.0, Math.min(maxSafeW, Math.max(minSafeW, predictedWeight)));
}

/**
 * Trains the autoregulation model on user set completion.
 */
export async function trainAutoregModel(
  supabase: any,
  userId: string,
  setIndex: number,
  prevWeight: number,
  prevReps: number,
  prevRir: number,
  restSeconds: number,
  actualNextWeight: number,
  actualNextReps: number,
  actualNextRir: number
): Promise<number> {
  const x = [
    Math.min(1.0, setIndex / 5.0),
    Math.min(1.5, prevWeight / 200.0),
    Math.min(1.5, prevReps / 20.0),
    Math.min(1.0, prevRir / 10.0),
    Math.min(1.5, restSeconds / 300.0)
  ];

  // Actual next e1rm achieved:
  const actualNextE1RM = actualNextWeight * (1.0 + (actualNextReps + actualNextRir) / 30.0);
  const target = Math.max(0.0, Math.min(1.0, actualNextE1RM / 200.0));

  const y = await kratosAutoregModel.train(supabase, userId, x, [target], 0.15);
  return y[0] * 200.0;
}

// ==========================================================
// 3. DUAL-SPORT FATIGUE MODEL (CR14)
// ==========================================================

function generateDualSportFatigueWeights() {
  // Input (6): [cardioTSB/100, cardioATL/100, gymVolume7d/10000, sleepQuality/100, steps7d/100000, activeCalories/5000]
  // Hidden: 6, Output: 1 (fatigue score 0..1)
  const W1: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.05);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.15];

  for (let j = 0; j < 6; j++) {
    W1[0][j] = -0.8;  // High TSB = less fatigued (negative correlation)
    W1[1][j] = 0.7;   // High cardio ATL = more fatigued
    W1[2][j] = 0.6;   // High gym volume = more fatigued
    W1[3][j] = -0.5;  // Good sleep quality = less fatigued
    W1[4][j] = 0.3;   // Many steps = slight fatigue
    W1[5][j] = 0.5;   // High active calories = more fatigued
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
