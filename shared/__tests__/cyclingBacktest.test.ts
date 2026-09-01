import { describe, it, expect } from 'vitest';
import { predictRideRpe, predictRouteDurationSeconds, predictCadence } from '../ml/models/cyclingModels';

/**
 * The cycling models against this athlete's seven recorded rides.
 *
 * Backtesting them is what found the fault worth finding: the route model looked
 * accurate, and was accurate only because the call site fed it the profile's untouched
 * 220 W default while their rides measure 158. Two errors cancelling. Given the real
 * threshold, the same constants ran 12 to 19 percent slow on every ride.
 */
const WEIGHT = 87.5;
/** Their best estimated threshold over the last 90 days of riding. */
const MEASURED_FTP = 158;

const RIDES = [
  { date: '2026-08-16', km: 77, minutes: 191, elevation: 436, power: 142, cadence: 84, tss: 156 },
  { date: '2026-08-09', km: 82, minutes: 205, elevation: 489, power: 141, cadence: 83, tss: 168 },
  { date: '2026-08-04', km: 35, minutes: 93,  elevation: 211, power: 88,  cadence: 76, tss: 35 },
  { date: '2026-07-31', km: 42, minutes: 103, elevation: 210, power: 73,  cadence: 79, tss: 29 },
  { date: '2026-07-22', km: 51, minutes: 124, elevation: 359, power: 85,  cadence: 81, tss: 49 },
  { date: '2026-07-19', km: 60, minutes: 156, elevation: 358, power: 71,  cadence: 78, tss: 46 },
  { date: '2026-07-17', km: 32, minutes: 83,  elevation: 138, power: 64,  cadence: 82, tss: 17 }
];

describe('route duration, against rides that actually happened', () => {
  const errors = RIDES.map(r => {
    const predicted = predictRouteDurationSeconds(r.km, r.elevation, MEASURED_FTP, WEIGHT) / 60;
    return (predicted - r.minutes) / r.minutes;
  });

  it('is within 10% on every ride', () => {
    for (let i = 0; i < errors.length; i++) {
      expect(Math.abs(errors[i]), `${RIDES[i].date} ${RIDES[i].km}km`).toBeLessThan(0.10);
    }
  });

  it('is unbiased across them, rather than accurate on average by cancelling', () => {
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
  });

  it('does not depend on the threshold as strongly as it used to', () => {
    // The old constants swung 4.2 km/h per W/kg, so the difference between a real
    // threshold and a defaulted one moved a 3-hour ride by 25 minutes. Traffic,
    // junctions and terrain set far more of a rider's speed than their FTP does.
    const atMeasured = predictRouteDurationSeconds(80, 450, 158, WEIGHT);
    const atDefault = predictRouteDurationSeconds(80, 450, 220, WEIGHT);
    expect(Math.abs(atMeasured - atDefault) / 60).toBeLessThan(20);
  });
});

describe('cadence, against what they actually pedalled', () => {
  it('is within 6 rpm on every ride', () => {
    for (const r of RIDES) {
      const predicted = predictCadence(r.power, WEIGHT)!;
      expect(Math.abs(predicted - r.cadence), `${r.date} ${r.power}W`).toBeLessThanOrEqual(6);
    }
  });
});

describe('perceived exertion, ranked against training stress', () => {
  it('orders the rides the way their TSS does', () => {
    // No logged RPE to compare against, so the check is ordering rather than value:
    // a harder ride by training stress should not come back easier.
    const scored = RIDES.map(r => ({
      tss: r.tss,
      rpe: predictRideRpe(r.power / MEASURED_FTP, r.minutes * 60)
    })).sort((a, b) => a.tss - b.tss);

    for (let i = 1; i < scored.length; i++) {
      expect(scored[i].rpe).toBeGreaterThanOrEqual(scored[i - 1].rpe - 1);
    }
  });

  it('separates their easiest ride from their hardest', () => {
    const easiest = predictRideRpe(64 / MEASURED_FTP, 83 * 60);
    const hardest = predictRideRpe(142 / MEASURED_FTP, 191 * 60);
    expect(hardest - easiest).toBeGreaterThan(2);
  });
});
