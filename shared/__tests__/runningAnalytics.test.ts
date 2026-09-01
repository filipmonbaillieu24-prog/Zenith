import { describe, it, expect } from 'vitest';
import {
  runsInPeriod, summarisePeriod, runningForm, intensityMix, estimateMaxHr,
  distanceBests, shoeStatuses, EASY_HR_FRACTION
} from '../services/runningAnalytics';

const run = (over: Partial<any> = {}): any => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-08-31',
  distanceKm: 6.05,
  durationSec: 2126,
  avgHeartRate: 176,
  ...over
});

const NOW = new Date('2026-09-01T09:00:00');

describe('period filtering', () => {
  it('keeps only what falls inside the window', () => {
    const runs = [run({ date: '2026-08-31' }), run({ date: '2026-08-01' }), run({ date: '2026-05-01' })];
    expect(runsInPeriod(runs, '7d', NOW)).toHaveLength(1);
    expect(runsInPeriod(runs, '90d', NOW)).toHaveLength(2);
    expect(runsInPeriod(runs, 'all', NOW)).toHaveLength(3);
  });
});

describe('period summary', () => {
  it('excludes distanceless runs from the pace, and says how many', () => {
    // The bug this replaces: two treadmill imports at 0 km alongside one 6.05 km run
    // averaged out to 12:38/km - slower than every run in the average.
    const runs = [
      run({ distanceKm: 0, durationSec: 1231, avgHeartRate: 147 }),
      run({ distanceKm: 0, durationSec: 1231, avgHeartRate: 147 }),
      run()
    ];
    const s = summarisePeriod(runs);
    expect(s.runs).toBe(3);
    expect(s.runsWithoutDistance).toBe(2);
    expect(s.avgPaceMinKm).toBeCloseTo((2126 / 60) / 6.05, 2);
    expect(s.avgPaceMinKm!).toBeLessThan(6);
  });

  it('reports no pace rather than zero when nothing recorded a distance', () => {
    expect(summarisePeriod([run({ distanceKm: 0 })]).avgPaceMinKm).toBeNull();
  });

  it('counts load even for runs with no distance', () => {
    // A treadmill session with no distance is still training.
    expect(summarisePeriod([run({ distanceKm: 0 })]).load).toBeGreaterThan(0);
  });
});

describe('running form', () => {
  it('builds fitness, fatigue and form from running alone', () => {
    const runs = Array.from({ length: 30 }, (_, i) => {
      const d = new Date('2026-09-01T12:00:00');
      d.setDate(d.getDate() - i);
      return run({ date: d.toISOString().slice(0, 10) });
    });
    const form = runningForm(runs, NOW);
    expect(form).not.toBeNull();
    expect(form!.fitness).toBeGreaterThan(0);
    expect(form!.fatigue).toBeGreaterThan(form!.fitness); // ramping up
    expect(form!.form).toBeLessThan(0);
  });

  it('shows positive form after a rest week', () => {
    const runs = Array.from({ length: 20 }, (_, i) => {
      const d = new Date('2026-09-01T12:00:00');
      d.setDate(d.getDate() - (i + 14)); // nothing in the last fortnight
      return run({ date: d.toISOString().slice(0, 10) });
    });
    expect(runningForm(runs, NOW)!.form).toBeGreaterThan(0);
  });

  it('reports how little history it has, rather than hiding it', () => {
    const form = runningForm([run({ date: '2026-08-29' })], NOW);
    expect(form!.daysOfHistory).toBeLessThan(28);
  });

  it('returns nothing with no runs', () => {
    expect(runningForm([], NOW)).toBeNull();
  });
});

describe('intensity distribution', () => {
  it('splits easy from hard at the threshold fraction of max HR', () => {
    const maxHr = 190;
    const mix = intensityMix([
      run({ avgHeartRate: 130 }),
      run({ avgHeartRate: 140 }),
      run({ avgHeartRate: 176 })
    ], maxHr);
    expect(maxHr * EASY_HR_FRACTION).toBeCloseTo(152);
    expect(mix.easyRuns).toBe(2);
    expect(mix.hardRuns).toBe(1);
    expect(mix.easyShare).toBeCloseTo(2 / 3);
  });

  it('does not count an unmonitored run as easy', () => {
    // Number(null) is 0, which is below any threshold.
    const mix = intensityMix([run({ avgHeartRate: null }), run({ avgHeartRate: undefined })], 190);
    expect(mix.easyRuns).toBe(0);
    expect(mix.unknownRuns).toBe(2);
    expect(mix.easyShare).toBeNull();
  });
});

describe('max heart rate', () => {
  it('prefers what the athlete has actually reached', () => {
    expect(estimateMaxHr([run({ maxHeartRate: 186 })], 30)).toBe(186);
  });

  it('falls back to the age formula only when nothing was recorded', () => {
    expect(estimateMaxHr([run({ avgHeartRate: null, maxHeartRate: null })], 30)).toBe(190);
  });
});

describe('distance bests', () => {
  it('reports the fastest whole run at or above each distance', () => {
    const bests = distanceBests([
      run({ distanceKm: 6, durationSec: 2160 }),   // 6:00/km
      run({ distanceKm: 6, durationSec: 1980 }),   // 5:30/km
      run({ distanceKm: 12, durationSec: 4320 })   // 6:00/km
    ]);
    const five = bests.find(b => b.minimumKm === 5)!;
    expect(five.paceMinKm).toBeCloseTo(5.5);
    const ten = bests.find(b => b.minimumKm === 10)!;
    expect(ten.paceMinKm).toBeCloseTo(6);
  });

  it('offers no band the athlete has never covered', () => {
    expect(distanceBests([run({ distanceKm: 4 })]).map(b => b.minimumKm)).toEqual([3]);
  });
});

describe('shoe wear', () => {
  const shoe = (over: Partial<any> = {}): any => ({
    id: 's', brand: 'X', model: 'Y', totalDistanceKm: 0, maxDistanceKm: 700, retired: false, ...over
  });

  it('warns before a pair is done, and again when it is', () => {
    const statuses = shoeStatuses([
      shoe({ id: 'a', totalDistanceKm: 100 }),
      shoe({ id: 'b', totalDistanceKm: 620 }),
      shoe({ id: 'c', totalDistanceKm: 750 })
    ]);
    expect(statuses.map(s => s.state)).toEqual(['due', 'approaching', 'ok']);
    expect(statuses[0].remainingKm).toBeLessThan(0);
  });

  it('ignores retired pairs and ones with no stated life', () => {
    expect(shoeStatuses([shoe({ retired: true }), shoe({ maxDistanceKm: 0 })])).toHaveLength(0);
  });
});
