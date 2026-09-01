import { describe, it, expect } from 'vitest';
import { leastSquaresSlope, slopeStandardError } from '../../apps/zenith-fuel/src/utils/fusionRetrain';

/**
 * The daily burn model against a month of this athlete's real logging.
 *
 * 21 usable logged days, 26 weigh-ins, 3 August to 1 September. Checking it turned up
 * something more useful than an accuracy figure: on this much data the weight trend is
 * not distinguishable from flat, so the "measured" expenditure it is trained against
 * has an uncertainty of several hundred kilocalories - and the app was presenting the
 * point estimate as the most reliable number it has.
 */

/** Their weigh-ins, as day offsets from 3 August. */
const WEIGHTS: [number, number][] = [
  [0, 89.0], [1, 88.4], [2, 87.2], [3, 87.2], [4, 86.9], [5, 86.7], [6, 88.2],
  [7, 87.6], [8, 87.5], [9, 86.4], [10, 86.2], [11, 86.1], [12, 86.9], [13, 87.1],
  [14, 86.8], [15, 87.1], [16, 86.6], [17, 86.0], [18, 86.6], [21, 89.4],
  [22, 87.6], [23, 86.5], [24, 86.3], [25, 86.1], [28, 88.5], [29, 87.5]
];

/** Mean intake across the 21 days they logged and did not mark incomplete. */
const MEAN_INTAKE = 1967;
const KCAL_PER_KG = 7700;

describe('the weight trend this month', () => {
  const slope = leastSquaresSlope(WEIGHTS)!;
  const error = slopeStandardError(WEIGHTS)!;

  it('is downward, but only just', () => {
    expect(slope).toBeLessThan(0);
    expect(slope).toBeGreaterThan(-0.05);
  });

  it('is not distinguishable from flat', () => {
    // The confidence interval contains zero, which means a month of weighing has not
    // yet established that this athlete is losing weight at all.
    const low = slope - 1.96 * error;
    const high = slope + 1.96 * error;
    expect(low).toBeLessThan(0);
    expect(high).toBeGreaterThan(0);
  });

  it('leaves the implied expenditure uncertain by hundreds of kilocalories', () => {
    const bandKcal = 2 * 1.96 * error * KCAL_PER_KG;
    expect(bandKcal).toBeGreaterThan(400);
    // Which is the finding: a figure carrying a 600 kcal band should not be described
    // as the most reliable number the app has.
    expect(bandKcal).toBeLessThan(900);
  });

  it('gives a point estimate in a plausible range for this athlete', () => {
    const tdee = MEAN_INTAKE - slope * KCAL_PER_KG;
    expect(tdee).toBeGreaterThan(1800);
    expect(tdee).toBeLessThan(2600);
  });
});

describe('the noise the trend has to be dug out of', () => {
  it('moves by more day to day than a month of real change', () => {
    const jumps = WEIGHTS.slice(1).map((p, i) => Math.abs(p[1] - WEIGHTS[i][1]));
    const median = [...jumps].sort((a, b) => a - b)[Math.floor(jumps.length / 2)];
    const monthOfChange = Math.abs(leastSquaresSlope(WEIGHTS)! * 30);
    // Half a kilo of daily noise against under half a kilo of monthly trend.
    expect(median).toBeGreaterThan(monthOfChange / 2);
  });

  it('reports no error when there are too few points to have one', () => {
    expect(slopeStandardError([[0, 87], [1, 87]])).toBeNull();
    expect(slopeStandardError([])).toBeNull();
  });

  it('reports a small error for a clean trend', () => {
    const clean: [number, number][] = Array.from({ length: 20 }, (_, i) => [i, 90 - i * 0.05]);
    const error = slopeStandardError(clean)!;
    expect(error).toBeLessThan(0.001);
    expect(leastSquaresSlope(clean)!).toBeCloseTo(-0.05, 4);
  });
});
