import { describe, it, expect } from 'vitest';
import { predictRecoveryScore, cardioFreshness, recoveryHeuristic, buildRecoveryFeatureVector, recoveryModel, RecoveryInput } from '../RecoveryScore';
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

  it('treats a small absolute cardio load as fresh, whatever the ratio', () => {
    // Real case: CTL 7.3 / ATL 6.3, eleven days after the last ride. The ratio is
    // 0.86 of their base, but their base is ~7 TSS/day - roughly one easy hour a
    // week - so there is no meaningful fatigue here to carry. An earlier version
    // of this function scored it 58% and the dashboard called it "a fair amount".
    expect(cardioFreshness(7.3, 6.3)).toBe(1);
  });

  it('still penalises an unaccustomed big effort on a small base', () => {
    expect(cardioFreshness(5, 30)).toBe(0);
  });

  it('falls as acute load climbs above chronic load', () => {
    expect(cardioFreshness(60, 36)).toBeGreaterThan(cardioFreshness(60, 60));
    expect(cardioFreshness(60, 60)).toBeGreaterThan(cardioFreshness(60, 84));
  });
});

describe('training is idempotent', () => {
  it('a retrain on the same history always gives the same weights', async () => {
    // The bug: Hub replays the full history on every page load and every realtime
    // insert, and each replay used to apply its updates on top of the last one.
    // The displayed score walked a few points every refresh with nothing logged.
    const noDb: any = { from: () => ({ upsert: async () => ({ error: null }) }) };
    const samples = [
      { x: buildRecoveryFeatureVector(rested), targets: [recoveryHeuristic(rested)] },
      { x: buildRecoveryFeatureVector(fatigued), targets: [recoveryHeuristic(fatigued)] }
    ];
    await recoveryModel.retrainFromScratch(noDb, 'u', samples);
    const first = predictRecoveryScore(rested);
    await recoveryModel.retrainFromScratch(noDb, 'u', samples);
    expect(predictRecoveryScore(rested)).toBe(first);
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
