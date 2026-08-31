import { describe, it, expect } from 'vitest';
import {
  eftpTrend, strengthTrend, runningEconomyTrend, loadTrend, estimate1RM, MEANINGFUL_CHANGE_PCT,
  resolveTrendWindow
} from '../services/progressTrends';

const NOW = new Date('2026-08-31T12:00:00Z').getTime();
const day = 86400000;
const w = { splitMs: NOW - 42 * day, fromMs: NOW - 84 * day, halfDays: 42 };

describe('eftpTrend', () => {
  it('compares the best of each window', () => {
    const t = eftpTrend([
      { date: NOW - 70 * day, metadata: { eFTP: 140 } },
      { date: NOW - 10 * day, metadata: { eFTP: 158 } }
    ], w);
    expect(t.value).toBe(158);
    expect(t.previous).toBe(140);
    expect(t.direction).toBe('up');
  });

  it('says so rather than guessing when there is nothing to compare', () => {
    const t = eftpTrend([{ date: NOW - 10 * day, metadata: { eFTP: 158 } }], w);
    expect(t.direction).toBe('unknown');
    expect(t.note).toBeTruthy();
  });

  it('does not read a missing eFTP as zero watts', () => {
    const t = eftpTrend([
      { date: NOW - 70 * day, metadata: { eFTP: null } },
      { date: NOW - 10 * day, metadata: { eFTP: '' } }
    ], w);
    expect(t.value).toBeNull();
  });

  it('calls a change under the noise floor flat', () => {
    const t = eftpTrend([
      { date: NOW - 70 * day, metadata: { eFTP: 200 } },
      { date: NOW - 10 * day, metadata: { eFTP: 202 } }
    ], w);
    expect(t.direction).toBe('flat');
    expect(Math.abs(t.changePct!)).toBeLessThan(MEANINGFUL_CHANGE_PCT);
  });
});

describe('estimate1RM', () => {
  it('is Epley, counting reps in reserve as reps not done', () => {
    expect(estimate1RM(100, 10, 2)).toBeCloseTo(140);
    expect(estimate1RM(0, 10, 2)).toBe(0);
  });
});

describe('strengthTrend', () => {
  const workout = (daysAgo: number, weight: number, rir: number = 2) => ({
    completed_at: new Date(NOW - daysAgo * day).toISOString(),
    sets: [{ exercise_id: 'bench', sets: [{ type: 'working', weight, reps: 10, rir }] }]
  });

  it('sums the best estimate per exercise across the two windows', () => {
    const t = strengthTrend([workout(70, 60), workout(5, 70)], { bench: 'kg' }, w);
    expect(t.previous).toBe(84);   // 60 * (1 + 12/30)
    expect(t.value).toBe(98);      // 70 * (1 + 12/30)
    expect(t.direction).toBe('up');
    expect(t.improved).toBe(1);
  });

  it('ignores an exercise that only appears in one window', () => {
    // Otherwise adding a new lift reads as progress on the day it is added.
    const t = strengthTrend([workout(5, 70)], { bench: 'kg' }, w);
    expect(t.value).toBeNull();
    expect(t.movers).toHaveLength(0);
  });

  it('converts pounds before comparing', () => {
    const lbs = strengthTrend([workout(70, 60), workout(5, 70)], { bench: 'lbs' }, w);
    const kg = strengthTrend([workout(70, 60), workout(5, 70)], { bench: 'kg' }, w);
    expect(lbs.value).toBeLessThan(kg.value!);
  });

  it('does not treat a missing RIR as taken to failure', () => {
    const noRir = { completed_at: new Date(NOW - 5 * day).toISOString(),
      sets: [{ exercise_id: 'bench', sets: [{ type: 'working', weight: 70, reps: 10, rir: null }] }] };
    const asFailure = { completed_at: new Date(NOW - 5 * day).toISOString(),
      sets: [{ exercise_id: 'bench', sets: [{ type: 'working', weight: 70, reps: 10, rir: 0 }] }] };
    const a = strengthTrend([{ ...noRir, completed_at: new Date(NOW - 70 * day).toISOString() }, noRir], { bench: 'kg' }, w);
    const b = strengthTrend([{ ...asFailure, completed_at: new Date(NOW - 70 * day).toISOString() }, asFailure], { bench: 'kg' }, w);
    expect(a.value).toBeGreaterThan(b.value!);
  });

  it('skips warm-up sets and off days', () => {
    const warmupOnly = { completed_at: new Date(NOW - 5 * day).toISOString(),
      sets: [{ exercise_id: 'bench', sets: [{ type: 'warmup', weight: 200, reps: 10, rir: 2 }] }] };
    expect(strengthTrend([warmupOnly], { bench: 'kg' }, w).value).toBeNull();
    expect(strengthTrend([{ ...workout(5, 70), is_off_day: true }], { bench: 'kg' }, w).value).toBeNull();
  });
});

describe('runningEconomyTrend', () => {
  const run = (daysAgo: number, pace: number, hr: number) => ({
    date: new Date(NOW - daysAgo * day).toISOString(),
    avg_pace_min_km: pace,
    avg_heart_rate: hr
  });

  it('treats getting faster at the same heart rate as improvement', () => {
    const t = runningEconomyTrend([run(70, 6.5, 140), run(5, 6.0, 140)], w);
    expect(t.direction).toBe('up');
    expect(t.changePct!).toBeGreaterThan(0);
  });

  it('ignores runs outside the heart-rate band, so running harder is not read as better', () => {
    const t = runningEconomyTrend([run(70, 6.5, 140), run(5, 4.5, 180)], w);
    expect(t.value).toBeNull();
    expect(t.note).toBeTruthy();
  });
});

describe('loadTrend', () => {
  it('reports load per week rather than a raw total', () => {
    const wide = { splitMs: NOW - 42 * day, fromMs: NOW - 126 * day, halfDays: 42 };
    const loads = [
      { dateKey: '2026-08-25', tss: 600 },
      { dateKey: '2026-08-20', tss: 600 },
      { dateKey: '2026-06-10', tss: 300 }
    ];
    const t = loadTrend(loads, wide, NOW);
    expect(t.value).toBe(200);      // 1200 over 6 weeks
    expect(t.previous).toBe(50);    // 300 over 6 weeks
    expect(t.direction).toBe('up');
  });

  it('reports nothing rather than zero for an empty window', () => {
    expect(loadTrend([], w, NOW).value).toBeNull();
  });
});

describe('resolveTrendWindow', () => {
  it('sizes the comparison to the history that exists', () => {
    // Four weeks of history splits into a fortnight against a fortnight, rather than
    // a fixed six-versus-six that would put all of it on one side.
    const win = resolveTrendWindow([NOW - 28 * day, NOW - day], NOW);
    expect(win!.halfDays).toBe(14);
  });

  it('will not compare windows shorter than a week', () => {
    const win = resolveTrendWindow([NOW - 3 * day, NOW], NOW);
    expect(win!.halfDays).toBe(7);
  });

  it('caps at six weeks a side, so it stays a read on current form', () => {
    const win = resolveTrendWindow([NOW - 700 * day, NOW], NOW);
    expect(win!.halfDays).toBe(42);
  });

  it('refuses a window with nothing to compare', () => {
    expect(resolveTrendWindow([], NOW)).toBeNull();
    expect(resolveTrendWindow([NOW - day], NOW)).toBeNull();
  });
});

describe('adaptive windows in practice', () => {
  it('finds this athlete\'s gym progress that a fixed 6-week split would miss', () => {
    // Their whole gym history is Aug 3 - Aug 29, inside one six-week window.
    const session = (dateISO: string, weight: number) => ({
      completed_at: dateISO,
      sets: [{ exercise_id: 'bench', sets: [{ type: 'working', weight, reps: 10, rir: 2 }] }]
    });
    const workouts = [
      session('2026-08-03T18:00:00Z', 60),
      session('2026-08-10T18:00:00Z', 62),
      session('2026-08-18T18:00:00Z', 65),
      session('2026-08-29T18:00:00Z', 70)
    ];

    const fixed = strengthTrend(workouts, { bench: 'kg' }, { splitMs: NOW - 42 * day, fromMs: NOW - 84 * day, halfDays: 42 }, NOW);
    expect(fixed.value).toBeNull();

    const adaptive = strengthTrend(workouts, { bench: 'kg' }, null, NOW);
    expect(adaptive.direction).toBe('up');
    expect(adaptive.windowDays).toBeGreaterThan(0);
  });
});
