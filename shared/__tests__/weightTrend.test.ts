import { describe, it, expect } from 'vitest';
import { buildTrendWeightMap, measuredWeeklyRateKg, MIN_TREND_SPAN_DAYS } from '../services/weightTrend';

/** This athlete's real vigor_weight rows, which the two apps disagreed about. */
const REAL_WEIGH_INS = [
  ['2026-08-02', 88.5], ['2026-08-03', 89], ['2026-08-04', 88.4], ['2026-08-05', 87.2],
  ['2026-08-06', 87.15], ['2026-08-07', 86.9], ['2026-08-08', 86.7], ['2026-08-09', 88.15],
  ['2026-08-10', 87.6], ['2026-08-11', 87.5], ['2026-08-12', 86.4], ['2026-08-13', 86.2],
  ['2026-08-14', 86.1], ['2026-08-15', 86.9], ['2026-08-16', 87.1], ['2026-08-17', 86.8],
  ['2026-08-18', 87.1], ['2026-08-19', 86.6], ['2026-08-20', 86], ['2026-08-21', 86.6],
  ['2026-08-24', 89.4], ['2026-08-25', 87.6], ['2026-08-26', 86.5], ['2026-08-27', 86.3],
  ['2026-08-28', 86.1], ['2026-08-31', 88.5], ['2026-09-01', 87.5]
].map(([date, weightKg]) => ({ date: date as string, weightKg: weightKg as number }));

describe('one weekly rate, measured one way', () => {
  it('reports a plausible loss rate from real weigh-ins', () => {
    const rate = measuredWeeklyRateKg(buildTrendWeightMap(REAL_WEIGH_INS), 28);
    expect(rate).not.toBeNull();
    // Losing, and at a rate a human body can actually produce.
    expect(rate!).toBeLessThan(0);
    expect(Math.abs(rate!)).toBeLessThan(1.5);
  });

  it('is unmoved by a single bad morning', () => {
    // 2026-08-24 reads 89.4 between two days near 86.6 - a water swing, not 3 kg of
    // tissue. The old two-endpoint method let one such day set the whole rate.
    const withoutSpike = REAL_WEIGH_INS.filter(r => r.date !== '2026-08-24');
    const a = measuredWeeklyRateKg(buildTrendWeightMap(REAL_WEIGH_INS), 28)!;
    const b = measuredWeeklyRateKg(buildTrendWeightMap(withoutSpike), 28)!;
    expect(Math.abs(a - b)).toBeLessThan(0.15);
  });

  it('says nothing rather than guessing when the span is too short', () => {
    const short = REAL_WEIGH_INS.slice(-3);
    expect(measuredWeeklyRateKg(buildTrendWeightMap(short), 28)).toBeNull();
  });

  it('needs a real spread of days, not just a count of readings', () => {
    const sameWeek = [
      { date: '2026-09-01', weightKg: 87.5 },
      { date: '2026-09-02', weightKg: 87.3 },
      { date: '2026-09-03', weightKg: 87.1 },
      { date: '2026-09-04', weightKg: 87.0 }
    ];
    expect(sameWeek.length).toBeGreaterThan(3);
    expect(measuredWeeklyRateKg(buildTrendWeightMap(sameWeek), 28)).toBeNull();
    expect(MIN_TREND_SPAN_DAYS).toBe(7);
  });

  it('ignores junk readings without poisoning the trend', () => {
    const withJunk = [
      ...REAL_WEIGH_INS,
      { date: 'not-a-date', weightKg: 87 },
      { date: '2026-09-02', weightKg: 0 },
      { date: '2026-09-03', weightKg: Number.NaN }
    ];
    const clean = measuredWeeklyRateKg(buildTrendWeightMap(REAL_WEIGH_INS), 28)!;
    const dirty = measuredWeeklyRateKg(buildTrendWeightMap(withJunk), 28)!;
    expect(dirty).toBeCloseTo(clean, 6);
  });

  it('takes the last reading when a day has more than one', () => {
    const map = buildTrendWeightMap([
      { date: '2026-09-01', weightKg: 90 },
      { date: '2026-09-01', weightKg: 87.5 }
    ]);
    expect(map['2026-09-01']).toBe(87.5);
  });
});
