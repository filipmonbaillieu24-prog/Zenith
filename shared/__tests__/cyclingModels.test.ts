import { describe, it, expect } from 'vitest';
import { predictRideRpe, predictRouteDurationSeconds, predictCadence, rpeModel, routeSpeedModel, cadenceModel } from '../ml/models/cyclingModels';

describe('these three were saturated on screen', () => {
  it('fits its own reference', () => {
    for (const m of [rpeModel, routeSpeedModel, cadenceModel]) {
      expect(m.calibration.rmse).toBeLessThan(0.05);
      expect(m.calibration.maxWeight).toBeLessThan(12);
    }
  });
});

describe('perceived exertion', () => {
  it('separates an easy hour from a hard three', () => {
    // It returned 9 and 10 for these two.
    const easy = predictRideRpe(0.60, 3600);
    const hard = predictRideRpe(0.92, 10800);
    expect(easy).toBeLessThan(5);
    expect(hard).toBeGreaterThan(7);
  });

  it('rises with both intensity and duration', () => {
    expect(predictRideRpe(0.9, 3600)).toBeGreaterThan(predictRideRpe(0.6, 3600));
    expect(predictRideRpe(0.75, 14400)).toBeGreaterThan(predictRideRpe(0.75, 1800));
  });

  it('stays on the 1-10 scale it claims', () => {
    for (const intensity of [0.4, 0.8, 1.15]) {
      for (const secs of [900, 7200, 21600]) {
        const rpe = predictRideRpe(intensity, secs);
        expect(rpe).toBeGreaterThanOrEqual(1);
        expect(rpe).toBeLessThanOrEqual(10);
      }
    }
  });

  it('says nothing without an intensity', () => {
    expect(predictRideRpe(0, 3600)).toBe(0);
  });
});

describe('route duration', () => {
  const ftp = 200, weight = 87;

  it('gives a short flat route a short time', () => {
    // This returned 4.7 hours for 10 km.
    const secs = predictRouteDurationSeconds(10, 50, ftp, weight);
    expect(secs / 60).toBeGreaterThan(15);
    expect(secs / 60).toBeLessThan(40);
  });

  it('scales roughly linearly with distance', () => {
    const short = predictRouteDurationSeconds(20, 100, ftp, weight);
    const long = predictRouteDurationSeconds(80, 400, ftp, weight);
    const ratio = long / short;
    // Four times the distance at the same terrain should take about four times as
    // long. The old model went from 5.3 to 7.4 hours - a ratio of 1.4.
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });

  it('costs climbing time', () => {
    const flat = predictRouteDurationSeconds(50, 100, ftp, weight);
    const hilly = predictRouteDurationSeconds(50, 1200, ftp, weight);
    expect(hilly).toBeGreaterThan(flat);
  });

  it('makes a stronger rider faster', () => {
    const weak = predictRouteDurationSeconds(50, 300, 150, 87);
    const strong = predictRouteDurationSeconds(50, 300, 320, 87);
    expect(strong).toBeLessThan(weak);
  });

  it('matches this athlete\'s own rides within reason', () => {
    // Their 82 km ride at 168 TSS and their 35 km ride at 35 TSS, against an eFTP of
    // 158 W and 87 kg. Real rides include stops and traffic, so this checks the
    // estimate is in the right neighbourhood rather than exact.
    const hours82 = predictRouteDurationSeconds(82, 500, 158, 87) / 3600;
    expect(hours82).toBeGreaterThan(2.5);
    expect(hours82).toBeLessThan(5);
  });
});

describe('cadence', () => {
  it('does not tell a soft-pedalling rider to spin at 96', () => {
    const easy = predictCadence(100, 87)!;
    expect(easy).toBeLessThan(85);
  });

  it('rises with power across a useful range', () => {
    const low = predictCadence(100, 87)!;
    const high = predictCadence(400, 87)!;
    // The old model moved ten rpm across this whole span, from 96 to 106.
    expect(high - low).toBeGreaterThan(10);
    expect(high).toBeLessThan(105);
  });

  it('says nothing rather than guessing without a weight', () => {
    expect(predictCadence(250, 0)).toBeNull();
    expect(predictCadence(0, 87)).toBeNull();
  });
});
