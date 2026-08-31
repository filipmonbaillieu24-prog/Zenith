import { describe, it, expect } from 'vitest';
import {
  estimate1RM,
  buildExerciseSessions,
  analyseExerciseTrend,
  analyseAllExercises,
  compareToPreviousSession,
  ExerciseMeta,
  WorkoutRow
} from '../progression';

const KG: ExerciseMeta = { id: 'kg-ex', name: 'Incline Dumbbell Curl', weight_unit: 'kg' };
const LBS: ExerciseMeta = { id: 'lbs-ex', name: 'Pin Loaded - Triceps Cable Pushdown', weight_unit: 'lbs' };
const BW: ExerciseMeta = { id: 'bw-ex', name: 'Pull-up', weight_unit: 'kg', is_bodyweight: true };

const set = (weight: number, reps: number, rir: number | null, type = 'working') => ({ weight, reps, rir, type });

const workout = (id: string, name: string, date: string, exId: string, sets: any[], templateId = 'tpl'): WorkoutRow => ({
  id, name, template_id: templateId, completed_at: date,
  sets: [{ exercise_id: exId, sets }]
});

describe('estimate1RM', () => {
  it('counts reps left in reserve as reps not performed', () => {
    // 100 kg x 10 with 2 left is treated as a 12-rep set.
    expect(estimate1RM(100, 10, 2)).toBeCloseTo(100 * (1 + 12 / 30), 5);
  });

  it('is zero for a set that did not happen', () => {
    expect(estimate1RM(0, 10, 0)).toBe(0);
    expect(estimate1RM(100, 0, 0)).toBe(0);
  });
});

describe('unit handling', () => {
  it('converts pounds before comparing anything', () => {
    // The bug this exists to prevent: a 100 lb stack counted as 100 kg overstated
    // this athlete's session tonnage by up to 111%.
    const [s] = buildExerciseSessions(
      [workout('w1', 'ARMS', '2026-08-26T19:00:00Z', LBS.id, [set(100, 10, 0)])],
      [LBS]
    );
    expect(s.volumeKg).toBe(Math.round(100 * 0.45359237 * 10));
    expect(s.bestE1rmKg).toBeCloseTo(100 * 0.45359237 * (1 + 10 / 30), 1);
  });

  it('leaves metric exercises alone', () => {
    const [s] = buildExerciseSessions(
      [workout('w1', 'ARMS', '2026-08-26T19:00:00Z', KG.id, [set(20, 10, 0)])],
      [KG]
    );
    expect(s.volumeKg).toBe(200);
  });

  it('adds bodyweight in kg, not in the exercise unit', () => {
    const [s] = buildExerciseSessions(
      [workout('w1', 'PULL', '2026-08-26T19:00:00Z', BW.id, [set(10, 5, 0)])],
      [BW],
      86
    );
    expect(s.volumeKg).toBe((86 + 10) * 5);
  });
});

describe('set filtering', () => {
  it('ignores warm-up sets', () => {
    const [s] = buildExerciseSessions(
      [workout('w1', 'PUSH', '2026-08-29T19:00:00Z', KG.id, [
        set(40, 6, 4, 'warmup'),
        set(60, 10, 1)
      ])],
      [KG]
    );
    expect(s.workingSets).toBe(1);
    expect(s.volumeKg).toBe(600);
  });

  it('tells a missing RIR apart from a RIR of zero', () => {
    // 0 means taken to failure and is the single most informative value there is.
    // `|| 2` would silently rewrite it, the same Number(null) trap as everywhere else.
    const [toFailure] = buildExerciseSessions(
      [workout('a', 'X', '2026-08-01T00:00:00Z', KG.id, [set(100, 10, 0)])], [KG]);
    const [unrecorded] = buildExerciseSessions(
      [workout('b', 'X', '2026-08-01T00:00:00Z', KG.id, [set(100, 10, null)])], [KG]);

    expect(toFailure.hardSets).toBe(1);
    expect(unrecorded.hardSets).toBe(0);
    expect(unrecorded.bestE1rmKg).toBeGreaterThan(toFailure.bestE1rmKg);
  });
});

describe('trend verdicts', () => {
  const series = (e1rms: number[]) =>
    buildExerciseSessions(
      e1rms.map((w, i) =>
        workout(`w${i}`, 'ARMS', `2026-08-${String(1 + i * 7).padStart(2, '0')}T19:00:00Z`, KG.id, [set(w, 10, 1)])),
      [KG]
    );

  it('needs three sessions before judging anything', () => {
    expect(analyseExerciseTrend(series([50, 55])).verdict).toBe('new');
  });

  it('calls a genuine climb progressing', () => {
    const t = analyseExerciseTrend(series([50, 55, 60]));
    expect(t.verdict).toBe('progressing');
    expect(t.recentChangePct).toBeGreaterThan(0);
  });

  it('calls an unchanged weight stalled', () => {
    expect(analyseExerciseTrend(series([50, 50, 50])).verdict).toBe('stalled');
  });

  it('does not call a single rep of noise a stall or a win', () => {
    // 100x10 then 100x10 then 101x10 - about 1%, which is one rep of rounding.
    const t = analyseExerciseTrend(series([100, 100, 101]));
    expect(t.verdict).toBe('stalled');
  });

  it('calls a real drop regressing', () => {
    expect(analyseExerciseTrend(series([60, 55, 50])).verdict).toBe('regressing');
  });

  it('judges the RECENT window, not the distance from an early peak', () => {
    // The pattern in this athlete's real log: an inflated first session (optimistic
    // RIR when they started recording), then steady genuine progress. Measuring from
    // the all-time best would report a permanent regression that good training can
    // never undo.
    const t = analyseExerciseTrend(series([80, 50, 55, 60]));
    expect(t.verdict).toBe('progressing');
  });

  it('separates a stall with hard sets from one without', () => {
    const lazy = buildExerciseSessions(
      [0, 1, 2].map(i => workout(`w${i}`, 'A', `2026-08-0${1 + i}T19:00:00Z`, KG.id, [set(50, 10, 4)])), [KG]);
    const trying = buildExerciseSessions(
      [0, 1, 2].map(i => workout(`w${i}`, 'A', `2026-08-0${1 + i}T19:00:00Z`, KG.id, [set(50, 10, 0)])), [KG]);

    expect(analyseExerciseTrend(lazy).detail).toMatch(/room to push/i);
    expect(analyseExerciseTrend(trying).detail).toMatch(/change something/i);
  });

  it('puts stalls and regressions first', () => {
    const all = analyseAllExercises([
      ...series([50, 55, 60]),
      ...buildExerciseSessions(
        [0, 1, 2].map(i => workout(`x${i}`, 'A', `2026-08-0${1 + i}T19:00:00Z`, LBS.id, [set(50, 10, 1)])), [LBS])
    ]);
    expect(all[0].verdict).toBe('stalled');
  });
});

describe('same-routine comparison', () => {
  const sessions = buildExerciseSessions([
    workout('w1', 'PUSH', '2026-08-18T19:00:00Z', KG.id, [set(50, 10, 1)]),
    workout('w2', 'PULL', '2026-08-24T19:00:00Z', KG.id, [set(90, 10, 1)]),
    workout('w3', 'PUSH', '2026-08-29T19:00:00Z', KG.id, [set(55, 10, 1)])
  ].map((w, i) => ({ ...w, template_id: i === 1 ? 'pull-tpl' : 'push-tpl' })), [KG]);

  it('compares against the previous run of the same routine, not the previous session', () => {
    const cmp = compareToPreviousSession('w3', sessions)!;
    expect(cmp.previousDate).toBe('2026-08-18T19:00:00Z');   // the PUSH, not the PULL
    expect(cmp.exercises[0].e1rmChangePct).toBeCloseTo(10, 0);
  });

  it('handles a routine with no previous run', () => {
    const cmp = compareToPreviousSession('w1', sessions)!;
    expect(cmp.previousDate).toBeNull();
    expect(cmp.exercises[0].e1rmChangePct).toBeNull();
    expect(cmp.volumeChangePct).toBeNull();
  });

  it('falls back to the routine name when templates were never linked', () => {
    const untemplated = buildExerciseSessions([
      { ...workout('a', 'PUSH', '2026-08-18T19:00:00Z', KG.id, [set(50, 10, 1)]), template_id: null },
      { ...workout('b', 'PUSH', '2026-08-29T19:00:00Z', KG.id, [set(55, 10, 1)]), template_id: null }
    ], [KG]);
    expect(compareToPreviousSession('b', untemplated)!.previousDate).toBe('2026-08-18T19:00:00Z');
  });
});
