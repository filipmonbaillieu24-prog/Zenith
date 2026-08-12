import { describe, it, expect } from 'vitest';
import { predictRecoveryScore } from '../RecoveryScore';

describe('Unified Recovery Score ML Model', () => {
  it('should return high recovery score (80-100) when user is well-rested with high sleep and TSB', () => {
    const score = predictRecoveryScore(
      20,   // cardioTSB (fresh)
      90,   // sleepQuality (90%)
      8.5,  // sleepDuration (8.5h)
      1000, // gymVolume7d (low fatigue)
      8000, // dailySteps (moderate)
      200,  // calorieBalance (surplus)
      75,   // bodyWeight
      15    // cardioATL (low acute load)
    );

    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should return lower recovery score when acute load is very high and sleep is minimal', () => {
    const fatiguedScore = predictRecoveryScore(
      -40,  // cardioTSB (heavy fatigue)
      30,   // sleepQuality (poor)
      4.0,  // sleepDuration (4h)
      8000, // gymVolume7d (heavy gym volume)
      18000,// dailySteps (heavy steps)
      -800, // calorieBalance (deficit)
      75,   // bodyWeight
      90    // cardioATL (high acute load)
    );

    const restedScore = predictRecoveryScore(
      20, 90, 8.5, 1000, 8000, 200, 75, 15
    );

    expect(fatiguedScore).toBeLessThan(restedScore);
  });
});
