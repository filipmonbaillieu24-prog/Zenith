/**
 * How fast the athlete's weight is actually moving, measured one way.
 *
 * Vigor and Fuel each answered this and disagreed by a factor of two - 0.24 kg/wk
 * against 0.49 - which mattered because Vigor turns its number into a target date.
 * On this athlete's data the two answers were "June 2027" and roughly January.
 *
 * Fuel regressed a 7-day EMA trend over a 28-day window. Vigor took the first and last
 * weigh-in it held and divided by the weeks between them: two single mornings, each
 * carrying a kilo of water, standing in for a month of data. Worse, when that produced
 * a small number or the "wrong" direction it substituted -0.5 kg/wk - a constant
 * labelled "standard healthy pace" - and presented it as the athlete's own measured
 * rate, with a forecast date built on top.
 *
 * This is Fuel's method, moved somewhere both can reach. It returns null rather than a
 * fallback: not knowing the rate yet is a fact worth showing, and a made-up rate that
 * looks measured is the thing worth avoiding.
 */

/** Points below this cannot support a slope. */
export const MIN_TREND_POINTS = 3;

/** Days of spread below which a slope is hydration, not a trend. */
export const MIN_TREND_SPAN_DAYS = 7;

/** Smoothing for the weight trend, matching ZANE's own EMA. */
export const TREND_EMA_ALPHA = 0.15;

export function leastSquaresSlope(points: [number, number][]): number | null {
  const n = points.length;
  if (n < MIN_TREND_POINTS) return null;
  const meanX = points.reduce((s, p) => s + p[0], 0) / n;
  const meanY = points.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) * (x - meanX);
  }
  return den === 0 ? null : num / den;
}

const dayDiff = (a: string, b: string): number =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

/**
 * Smooths daily weigh-ins into a trend, keyed by day.
 *
 * Days without a reading carry the previous trend value forward rather than being
 * interpolated, which is what an EMA does anyway and avoids inventing a weigh-in.
 */
export function buildTrendWeightMap(
  readings: { date: string; weightKg: number }[]
): Record<string, number> {
  const byDay = new Map<string, number>();
  for (const r of readings) {
    const day = String(r.date).slice(0, 10);
    const w = Number(r.weightKg);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(w) || w <= 0) continue;
    // More than one weigh-in in a day: the last one wins, as elsewhere.
    byDay.set(day, w);
  }

  const days = [...byDay.keys()].sort();
  const out: Record<string, number> = {};
  let ema: number | null = null;
  for (const day of days) {
    const w = byDay.get(day)!;
    ema = ema === null ? w : TREND_EMA_ALPHA * w + (1 - TREND_EMA_ALPHA) * ema;
    out[day] = Math.round(ema * 100) / 100;
  }
  return out;
}

/**
 * Weekly rate of change from the trend, or null when it cannot be measured.
 *
 * Negative is losing.
 */
export function measuredWeeklyRateKg(
  trendWeightMap: Record<string, number>,
  lookbackDays: number = 28
): number | null {
  const dates = Object.keys(trendWeightMap).sort();
  if (dates.length < MIN_TREND_POINTS) return null;

  const last = dates[dates.length - 1];
  const windowDates = dates.filter(d => dayDiff(d, last) <= lookbackDays);
  if (windowDates.length < MIN_TREND_POINTS) return null;

  const span = dayDiff(windowDates[0], windowDates[windowDates.length - 1]);
  if (span < MIN_TREND_SPAN_DAYS) return null;

  const slope = leastSquaresSlope(
    windowDates.map(d => [dayDiff(windowDates[0], d), trendWeightMap[d]] as [number, number])
  );
  return slope === null ? null : slope * 7;
}
