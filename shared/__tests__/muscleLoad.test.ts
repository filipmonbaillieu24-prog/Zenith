import { describe, it, expect } from 'vitest';
import {
  runMuscleImpact, rideMuscleImpact, runningLoad, activityTimestampMs,
  SINGLE_SESSION_CAP
} from '../services/muscleLoad';

/**
 * The heatmap scaled muscle fatigue from raw kilometres, and kilometres are not
 * comparable between sports. An 82 km ride charged the quadriceps 85 - the maximum -
 * while a hard 6.05 km run charged them 8.
 */
describe('running and cycling are charged on the same scale', () => {
  // This athlete's 31 August run: 35.4 min at 176 bpm.
  const theRun = runningLoad(2126, 176);
  // Their 9 August ride: 82 km, TSS 168.
  const theRide = 168;

  it('gives a hard run real fatigue rather than single digits', () => {
    const run = runMuscleImpact(theRun);
    expect(theRun).toBeGreaterThan(40);
    expect(run.calves).toBeGreaterThan(30);
    expect(run.quadriceps).toBeGreaterThan(25);
  });

  it('still charges a long ride more than a short run overall', () => {
    // The ride is four times the training stress; it should read that way.
    const ride = rideMuscleImpact(theRide);
    const run = runMuscleImpact(theRun);
    expect(ride.quadriceps).toBeGreaterThan(run.quadriceps);
  });

  it('leaves running harder on the calves than cycling at equal load', () => {
    // Footstrike is eccentric; pedalling is not. That difference is the whole reason
    // a runner's calves are sore and a cyclist's are not.
    const equal = 100;
    expect(runMuscleImpact(equal).calves).toBeGreaterThan(rideMuscleImpact(equal).calves * 3);
  });

  it('caps a single session so a second one can still show', () => {
    const huge = runMuscleImpact(10000);
    for (const value of Object.values(huge)) expect(value).toBeLessThanOrEqual(SINGLE_SESSION_CAP);
  });

  it('returns nothing for a session with no load', () => {
    expect(runMuscleImpact(0)).toEqual({});
    expect(rideMuscleImpact(-5)).toEqual({});
  });
});

describe('runningLoad', () => {
  it('scales with duration and effort', () => {
    expect(runningLoad(3600, 176)).toBeGreaterThan(runningLoad(1800, 176));
    expect(runningLoad(1800, 176)).toBeGreaterThan(runningLoad(1800, 130));
  });

  it('does not read a missing heart rate as no effort', () => {
    // Number(null) is 0, which would make an unmonitored run cost nothing at all.
    const noHr = runningLoad(2126, null);
    expect(noHr).toBeGreaterThan(0);
    expect(noHr).toBeCloseTo(Math.round((2126 / 60) * 1.1), 0);
    expect(runningLoad(2126, '')).toBe(noHr);
    expect(runningLoad(2126, undefined)).toBe(noHr);
  });

  it('is zero only when there is no session', () => {
    expect(runningLoad(0, 176)).toBe(0);
    expect(runningLoad(null, 176)).toBe(0);
  });
});

describe('activityTimestampMs', () => {
  it('uses the clock time the run was recorded at', () => {
    const at = activityTimestampMs('2026-08-31', '17:25');
    const local = new Date(at);
    expect(local.getHours()).toBe(17);
    expect(local.getMinutes()).toBe(25);
  });

  it('falls back to midday, not midnight, when no time was recorded', () => {
    // Midnight is up to 24 hours wrong; midday is never more than 12. At 3.5% decay
    // an hour that is the difference between losing 46% of a session's fatigue and
    // losing none of it on average.
    expect(new Date(activityTimestampMs('2026-08-31')).getHours()).toBe(12);
  });

  it('rejects a date it cannot read rather than returning the epoch', () => {
    expect(Number.isNaN(activityTimestampMs(null))).toBe(true);
    expect(Number.isNaN(activityTimestampMs('not a date'))).toBe(true);
  });

  it('accepts a full timestamp string by taking its day', () => {
    expect(new Date(activityTimestampMs('2026-08-31T00:00:00Z', '09:30')).getHours()).toBe(9);
  });
});
