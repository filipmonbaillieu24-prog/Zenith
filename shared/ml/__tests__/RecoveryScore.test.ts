import { describe, it, expect } from 'vitest';
import { predictRecoveryScore, cardioFreshness, RecoveryInput } from '../RecoveryScore';
import { kratosSessionEffortRatio, rirEffortFactor } from '../../services/trainingLoad';

const rested: RecoveryInput = {
  cardioCTL: 55,
  cardioATL: 30,   // well below chronic load - rested
  sleepQuality: 90,
  sleepDurationHours: 8.5,
  gymEffort7d: 1000,
  dailySteps: 8000,
  calorieBalance: 200,
  bodyWeight: 75
};

const fatigued: RecoveryInput = {
  cardioCTL: 55,
  cardioATL: 90,   // well above chronic load - deep in a block
  sleepQuality: 30,
  sleepDurationHours: 4.0,
  gymEffort7d: 24000,
  dailySteps: 18000,
  calorieBalance: -800,
  bodyWeight: 75
};

describe('Unified Recovery Score ML Model', () => {
  it('scores a well-rested athlete high', () => {
    const score = predictRecoveryScore(rested);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores a depleted athlete below the fatigue threshold', () => {
    expect(predictRecoveryScore(fatigued)).toBeLessThan(50);
  });

  it('separates a merely poor day from the worst possible one', () => {
    const poor = predictRecoveryScore({ ...fatigued, sleepQuality: 55, sleepDurationHours: 6, gymEffort7d: 14000 });
    const worst = predictRecoveryScore({ ...fatigued, sleepQuality: 0, sleepDurationHours: 0, gymEffort7d: 40000 });
    expect(poor).toBeGreaterThan(worst + 10);
  });
});

describe('cardioFreshness', () => {
  it('reads an athlete with no cardio base as fresh, not as mid-scale', () => {
    // The bug this replaces: TSB = CTL - ATL is bounded by CTL, so a lifter with
    // no cardio base could never rise above the middle of a fixed TSB band.
    expect(cardioFreshness(1, 0)).toBeGreaterThan(0.95);
  });

  it('distinguishes a rested cyclist from one deep in a block at the same TSB', () => {
    // Both have TSB 0; only one is carrying real fatigue.
    expect(cardioFreshness(1, 1)).toBeGreaterThan(cardioFreshness(60, 60));
  });

  it('falls as acute load climbs above chronic load', () => {
    expect(cardioFreshness(60, 36)).toBeGreaterThan(cardioFreshness(60, 60));
    expect(cardioFreshness(60, 60)).toBeGreaterThan(cardioFreshness(60, 84));
  });
});

describe('RIR effort weighting', () => {
  it('costs a set to failure more than one left well short', () => {
    expect(rirEffortFactor(0)).toBeGreaterThan(rirEffortFactor(2));
    expect(rirEffortFactor(2)).toBeGreaterThan(rirEffortFactor(4));
  });

  it('assumes a moderate set when RIR is missing', () => {
    expect(rirEffortFactor(null)).toBe(rirEffortFactor(2));
    expect(rirEffortFactor(undefined)).toBe(rirEffortFactor(2));
  });

  it('discounts a high-tonnage easy session below a lighter hard one', () => {
    const easyButHeavy = [{ sets: [
      { type: 'working', reps: 10, weight: 100, rir: 4 },
      { type: 'working', reps: 10, weight: 100, rir: 4 }
    ] }];
    const lightButHard = [{ sets: [
      { type: 'working', reps: 10, weight: 20, rir: 0 },
      { type: 'working', reps: 10, weight: 20, rir: 0 }
    ] }];
    expect(kratosSessionEffortRatio(easyButHeavy)).toBeLessThan(kratosSessionEffortRatio(lightButHard));
  });

  it('ignores warm-up sets, as stored volume does', () => {
    const withWarmup = [{ sets: [
      { type: 'warmup', reps: 6, weight: 40, rir: 4 },
      { type: 'working', reps: 10, weight: 100, rir: 0 }
    ] }];
    expect(kratosSessionEffortRatio(withWarmup)).toBe(1);
  });

  it('falls back to a moderate assumption for a workout with no set detail', () => {
    expect(kratosSessionEffortRatio(null)).toBe(rirEffortFactor(2));
    expect(kratosSessionEffortRatio([])).toBe(rirEffortFactor(2));
  });
});
