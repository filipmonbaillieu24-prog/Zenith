import { SimpleMLP } from './SimpleMLP';

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
  const W1: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const B1: number[] = new Array(8).fill(0.05);
  const W2: number[][] = Array.from({ length: 8 }, () => new Array(1).fill(0));
  const B2: number[] = [0.1];

  for (let j = 0; j < 8; j++) {
    W1[0][j] = 0.8;   // High TSB → better recovered
    W1[1][j] = 0.7;   // Good sleep quality → better recovered
    W1[2][j] = 0.5;   // More sleep → better recovered
    W1[3][j] = -0.6;  // High gym volume → less recovered
    W1[4][j] = -0.3;  // Maley steps → slight fatigue
    W1[5][j] = 0.3;   // Positive calorie balance → better recovery
    W1[6][j] = 0.1;   // Body weight (neutral)
    W1[7][j] = -0.7;  // High ATL → less recovered
    W2[j][0] = 0.4;
  }

  return { W1, B1, W2, B2 };
}

export const recoveryModel = new SimpleMLP(
  8, 8, 1, 'unified_recovery_score', generateRecoveryDefaultWeights
);

/**
 * Predicts a unified recovery score (0..100).
 * 0 = completely depleted, 100 = fully recovered.
 *
 * Consumed by: Hub Dashboard, Kratos (rest time), Aero Coach (intensity cap), Vigor (display).
 */
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
  const x = [
    Math.max(0, Math.min(1, (cardioTSB + 50) / 100)),
    Math.min(1, sleepQuality / 100),
    Math.min(1, sleepDuration / 12),
    Math.min(1.5, gymVolume7d / 10000),
    Math.min(1, dailySteps / 20000),
    Math.max(-1, Math.min(1, calorieBalance / 1000)),
    Math.min(1.5, bodyWeight / 150),
    Math.min(1.5, cardioATL / 100)
  ];
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
  const x = [
    Math.max(0, Math.min(1, (cardioTSB + 50) / 100)),
    Math.min(1, sleepQuality / 100),
    Math.min(1, sleepDuration / 12),
    Math.min(1.5, gymVolume7d / 10000),
    Math.min(1, dailySteps / 20000),
    Math.max(-1, Math.min(1, calorieBalance / 1000)),
    Math.min(1.5, bodyWeight / 150),
    Math.min(1.5, cardioATL / 100)
  ];
  const target = Math.max(0, Math.min(1, actualRecoveryTarget));
  const y = await recoveryModel.train(supabase, userId, x, [target], 0.15);
  return Math.round(y[0] * 100);
}
