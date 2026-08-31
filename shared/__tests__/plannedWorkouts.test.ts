import { describe, it, expect } from 'vitest';
import {
  estimateGymDuration,
  countTemplateSets,
  resolveRunPace,
  estimateRunDuration,
  formatPace,
  rideDurationFromTss,
  rideTssFromDuration,
  resolveCurrentFtp,
  plannedEnergyKcal,
  MIN_PER_SET_FALLBACK,
  DEFAULT_RUN_PACE_MIN_PER_KM,
  fulfilledPlanIds,
  outstandingPlansForDate
} from '../services/plannedWorkouts';

describe('estimateGymDuration', () => {
  it('takes the median of past sessions of the routine', () => {
    // This athlete's real PUSH sessions.
    const est = estimateGymDuration([42, 43, 46, 51], 17);
    expect(est.source).toBe('history');
    expect(est.minutes).toBe(45);
    expect(est.samples).toBe(4);
  });

  it('ignores sessions that were never properly closed', () => {
    const est = estimateGymDuration([44, 0.5, 480], 17);
    expect(est.samples).toBe(1);
    expect(est.minutes).toBe(44);
  });

  it('falls back to set count when the routine has never been logged', () => {
    const est = estimateGymDuration([], 17);
    expect(est.source).toBe('structure');
    expect(est.minutes).toBe(Math.round(17 * MIN_PER_SET_FALLBACK));
  });

  it('lands close to reality on all three of this athlete\'s routines', () => {
    // Structural estimate vs their measured medians: ARMS 24 sets/70.6 min,
    // PULL 16/40.8, PUSH 17/44.3. Within 15% is good enough to plan a day around.
    for (const [sets, actual] of [[24, 70.6], [16, 40.8], [17, 44.3]] as const) {
      const est = estimateGymDuration(null, sets).minutes;
      expect(Math.abs(est - actual) / actual).toBeLessThan(0.15);
    }
  });

  it('only reaches the flat default with nothing at all to go on', () => {
    expect(estimateGymDuration(null, null)).toEqual({ minutes: 60, source: 'default', samples: 0 });
    expect(estimateGymDuration([], 0).source).toBe('default');
  });
});

describe('countTemplateSets', () => {
  it('sums sets across exercises', () => {
    expect(countTemplateSets([{ sets: [1, 2, 3, 4] }, { sets: [1, 2, 3] }])).toBe(7);
  });
  it('survives a malformed template', () => {
    expect(countTemplateSets(null)).toBe(0);
    expect(countTemplateSets([{ sets: null }, {}])).toBe(0);
  });
});

describe('resolveRunPace', () => {
  it('says so when there is no history rather than passing off a default as measured', () => {
    const r = resolveRunPace([]);
    expect(r.source).toBe('default');
    expect(r.paceMinPerKm).toBe(DEFAULT_RUN_PACE_MIN_PER_KM);
  });

  it('does not read a null pace as zero', () => {
    // Number(null) is 0, which would pass a "> 0" test on the far side of the
    // conversion and drag the median toward an impossible pace.
    const r = resolveRunPace([null, undefined, '' as any, 5.5, 6.5]);
    expect(r.samples).toBe(2);
    expect(r.paceMinPerKm).toBe(6);
  });

  it('rejects paces no human ran', () => {
    expect(resolveRunPace([0, 0.5, 90]).source).toBe('default');
  });
});

describe('estimateRunDuration', () => {
  it('is distance times pace', () => {
    expect(estimateRunDuration(8, 6.5)).toBe(52);
  });
  it('returns nothing for no distance', () => {
    expect(estimateRunDuration(0, 6.5)).toBe(0);
    expect(estimateRunDuration(NaN, 6.5)).toBe(0);
  });
});

describe('formatPace', () => {
  it('formats minutes per km', () => {
    expect(formatPace(6.5)).toBe('6:30 /km');
    expect(formatPace(5)).toBe('5:00 /km');
  });
  it('carries instead of printing :60', () => {
    expect(formatPace(5.999)).toBe('6:00 /km');
  });
});

describe('ride duration and TSS', () => {
  it('holds the defining relationship, TSS = hours x IF^2 x 100', () => {
    // An hour at threshold is close to 100 TSS by definition.
    expect(rideTssFromDuration(60, 'threshold')).toBe(96);
    expect(rideDurationFromTss(96, 'threshold')).toBe(60);
  });

  it('round-trips within a minute', () => {
    for (const type of ['recovery', 'endurance', 'sweetspot', 'threshold', 'vo2max']) {
      const mins = rideDurationFromTss(rideTssFromDuration(75, type), type);
      expect(Math.abs(mins - 75)).toBeLessThanOrEqual(1);
    }
  });

  it('makes an easier ride take longer for the same TSS', () => {
    expect(rideDurationFromTss(65, 'endurance')).toBeGreaterThan(rideDurationFromTss(65, 'vo2max'));
  });

  it('treats an unknown zone as moderate rather than crashing', () => {
    expect(rideDurationFromTss(65, 'nonsense')).toBe(rideDurationFromTss(65, 'custom'));
  });
});

describe('resolveCurrentFtp', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const day = 86400000;
  const ride = (daysAgo: number, eFTP: any) => ({ date: now.getTime() - daysAgo * day, metadata: { eFTP } });

  it('prefers a measured threshold over the profile default', () => {
    // profiles.ftp_watts defaults to 220 and no account has ever changed it.
    const r = resolveCurrentFtp([ride(10, 158), ride(3, 152)], 220, now);
    expect(r).toEqual({ watts: 158, source: 'measured' });
  });

  it('is not dragged down by one easy ride', () => {
    const r = resolveCurrentFtp([ride(20, 158), ride(1, 86)], 220, now);
    expect(r.watts).toBe(158);
  });

  it('lets an old peak expire', () => {
    const r = resolveCurrentFtp([ride(200, 250), ride(5, 158)], 220, now);
    expect(r.watts).toBe(158);
  });

  it('falls back to the profile, then to a constant', () => {
    expect(resolveCurrentFtp([], 240, now)).toEqual({ watts: 240, source: 'profile' });
    expect(resolveCurrentFtp([], null, now).source).toBe('default');
  });

  it('does not read a missing eFTP as zero watts', () => {
    expect(resolveCurrentFtp([ride(5, null), ride(4, '')], 220, now).source).toBe('profile');
  });
});

describe('plannedEnergyKcal', () => {
  it('costs a ride against the measured threshold, not the profile default', () => {
    const plan = { discipline: 'aero' as const, durationMinutes: 180, plannedTss: 156, distanceKm: null };
    expect(plannedEnergyKcal(plan, 80, 158)).toBe(887);
    expect(plannedEnergyKcal(plan, 80, 220)).toBe(1236);
  });

  it('costs a run from distance and a gym session from time', () => {
    expect(plannedEnergyKcal({ discipline: 'stride', durationMinutes: 52, plannedTss: 0, distanceKm: 8 }, 80, 158)).toBe(640);
    expect(plannedEnergyKcal({ discipline: 'kratos', durationMinutes: 45, plannedTss: 0, distanceKm: null }, 80, 158)).toBe(270);
  });
});

describe('fulfilledPlanIds', () => {
  const plan = (id: string, date: string, discipline: any, templateId: string | null = null) =>
    ({ id, date, discipline, templateId });

  it('marks a plan done when the session was carried out that day', () => {
    const plans = [plan('p1', '2026-08-31', 'kratos', 'push')];
    const done = fulfilledPlanIds(plans, [
      { discipline: 'kratos', dateKey: '2026-08-31', templateId: 'push' }
    ]);
    expect(done.has('p1')).toBe(true);
  });

  it('does not let one session tick off two plans', () => {
    // Two rides planned, one ridden: the second still has to be fuelled for.
    const plans = [plan('p1', '2026-08-31', 'aero'), plan('p2', '2026-08-31', 'aero')];
    const done = fulfilledPlanIds(plans, [{ discipline: 'aero', dateKey: '2026-08-31' }]);
    expect(done.size).toBe(1);
  });

  it('pairs a plan with the routine it actually named', () => {
    // PUSH and PULL planned, PULL done: PUSH must stay outstanding, not whichever
    // plan happened to come first in the list.
    const plans = [plan('push', '2026-08-31', 'kratos', 'tpl-push'), plan('pull', '2026-08-31', 'kratos', 'tpl-pull')];
    const done = fulfilledPlanIds(plans, [
      { discipline: 'kratos', dateKey: '2026-08-31', templateId: 'tpl-pull' }
    ]);
    expect(done.has('pull')).toBe(true);
    expect(done.has('push')).toBe(false);
  });

  it('still counts a gym session that did not follow the planned routine', () => {
    const plans = [plan('p1', '2026-08-31', 'kratos', 'tpl-push')];
    const done = fulfilledPlanIds(plans, [
      { discipline: 'kratos', dateKey: '2026-08-31', templateId: 'tpl-other' }
    ]);
    expect(done.has('p1')).toBe(true);
  });

  it('does not match across days or disciplines', () => {
    const plans = [plan('p1', '2026-08-31', 'aero'), plan('p2', '2026-08-30', 'kratos')];
    const done = fulfilledPlanIds(plans, [
      { discipline: 'kratos', dateKey: '2026-08-31' },
      { discipline: 'aero', dateKey: '2026-08-29' }
    ]);
    expect(done.size).toBe(0);
  });

  it('treats a plan from before disciplines existed as a ride', () => {
    const done = fulfilledPlanIds([{ id: 'old', date: '2026-08-31' }], [
      { discipline: 'aero', dateKey: '2026-08-31' }
    ]);
    expect(done.has('old')).toBe(true);
  });

  it('honours an explicit completed_at if anything ever writes one', () => {
    const done = fulfilledPlanIds(
      [{ id: 'p1', date: '2026-08-31', discipline: 'aero', completedAt: '2026-08-31T10:00:00Z' }],
      []
    );
    expect(done.has('p1')).toBe(true);
  });

  it('stops the day being charged twice for the same session', () => {
    const plans: any[] = [
      { id: 'p1', date: '2026-08-31', discipline: 'kratos', title: 'PUSH', type: 'custom',
        durationMinutes: 45, plannedTss: 0, distanceKm: null, templateId: 'push', notes: null, completedAt: null }
    ];
    const before = outstandingPlansForDate(plans, '2026-08-31', []);
    const after = outstandingPlansForDate(plans, '2026-08-31', [
      { discipline: 'kratos', dateKey: '2026-08-31', templateId: 'push' }
    ]);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(0);
  });
});
