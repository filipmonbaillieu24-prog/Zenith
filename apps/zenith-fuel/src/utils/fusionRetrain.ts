/**
 * Rebuilds ZenithFusionNet from the athlete's own logged history.
 *
 * The network learns from an *independently measured* outcome, not from the
 * TDEE figure the app already displays. Training it to reproduce its own
 * neighbour would be circular - the "ML" output could never be more accurate
 * than the formula it was copying. Instead each day's target is the empirical
 * TDEE implied by the energy balance: average intake over a window, minus the
 * measured rate of weight change over that same window converted to calories.
 *
 * That is the same principle the online one-day-at-a-time loop uses, applied
 * per historical day so a whole month can be replayed at once.
 */

import { strengthCaloriesFromVolume } from '@zenith/shared';

export interface FusionDaySample {
  date: string;
  rawInputs: number[];
  actualTdee: number;
  /** Null on a day with no readiness answer: the output then receives no gradient. */
  actualRecovery: number | null;
  actualCapacity: number | null;
}

export interface BuildSamplesArgs {
  /** YYYY-MM-DD -> kcal consumed that day. */
  dailyCaloriesMap: Record<string, number>;
  /** YYYY-MM-DD -> whether the day was fully logged. Missing means complete. */
  dailyCompletionMap: Record<string, boolean>;
  /** YYYY-MM-DD -> kg lifted. */
  gymVolumeMap: Record<string, number>;
  /** YYYY-MM-DD -> active kcal burned. */
  activeCaloriesMap: Record<string, number>;
  /** YYYY-MM-DD -> caffeine mg. */
  caffeineMap: Record<string, number>;
  /** YYYY-MM-DD -> whether creatine was taken. */
  creatineMap: Record<string, boolean>;
  /** YYYY-MM-DD -> EMA of measured scale weight. */
  trendWeightMap: Record<string, number>;
  /** Sleep rows, used for quality/duration/stage ratios and HRV. */
  /** How the athlete said they felt, by day. The only independent read on recovery. */
  readinessScoreByDay?: Record<string, number>;
  sleepLogs: {
    logged_at: string;
    quality_score?: number | null;
    duration_minutes?: number | null;
    deep_minutes?: number | null;
    rem_minutes?: number | null;
    hrv_ms?: number | null;
  }[];
  energyPerKgTissue: number;
}

/**
 * Window used to derive a day's implied TDEE.
 *
 * At ~7700 kcal/kg a 0.1kg day-to-day wobble in the weight EMA swings the
 * implied TDEE by ~770 kcal, so a single day's change is far too noisy to be a
 * training target. Averaging both sides of the energy balance over a week
 * damps that while still tracking real change.
 */
const TREND_WINDOW_DAYS = 7;
const MIN_TREND_POINTS = 3;
const MIN_COMPLETE_DAYS_IN_WINDOW = 3;
/**
 * How much of the weight window the intake days have to actually cover.
 *
 * The weight slope is measured across the whole window - up to a fortnight - while the
 * intake average was taken over however many days inside it happened to be logged, and
 * three was enough to qualify. Those are not the same period, and energy balance only
 * works when they are: the weight change reflects everything the athlete ate, including
 * the days they did not log.
 *
 * This athlete logged 21 days of 30. If the nine unlogged ones ran higher - which is
 * usually why a day goes unlogged - then every window mixing them in understated the
 * intake side and so understated the expenditure it implies.
 */
const MIN_WINDOW_COVERAGE = 0.6;

/**
 * Trend points to ignore at the very start of the series.
 *
 * The weight EMA begins at the first weigh-in and converges toward the true mean
 * over the following days, so its early slope reflects that convergence rather
 * than any real change. On this athlete's history those first days implied a
 * ~0.12 kg/day loss that was purely an artefact of the filter warming up.
 */
const EMA_WARMUP_POINTS = 4;

/**
 * Largest daily rate of change treated as real tissue change.
 *
 * Body weight swings by a kilo or more from hydration, food in transit and
 * weighing at a different time of day. This athlete's log contains a +2.8 kg
 * jump between consecutive weigh-ins - at 7700 kcal/kg, taking that literally
 * implies a ~770 kcal/day error, which is how a window containing it produced
 * a 774 kcal "TDEE". Beyond this rate the window is discarded rather than
 * believed.
 */
const MAX_PLAUSIBLE_KG_PER_DAY = 0.15;

/**
 * Bounds a derived target to something a human can plausibly expend.
 *
 * A target outside this range means the weight trend or the intake log for
 * that window is wrong, not that the athlete burned 400 or 9000 kcal. Feeding
 * it in would teach the network noise, so the day is dropped instead.
 */
const MIN_PLAUSIBLE_TDEE = 1200;
const MAX_PLAUSIBLE_TDEE = 5000;

/**
 * The standard error of that slope, in kg/day.
 *
 * Worth having because a month of this athlete's weigh-ins gives a slope of -0.015
 * kg/day with a standard error of 0.021 - a 95% interval running from -0.057 to +0.027,
 * which in energy terms is a TDEE anywhere between 1760 and 2405 kcal. The point
 * estimate alone is presented as "the most reliable number we have for you", and on
 * data this noisy that is a considerably stronger claim than the arithmetic supports.
 *
 * Day-to-day body weight moves by 0.6 kg on the median in this series and by 2.8 kg at
 * the extreme - hydration and gut content, not tissue - so a real trend takes weeks to
 * emerge from it.
 */
export function slopeStandardError(points: [number, number][]): number | null {
  const n = points.length;
  if (n < MIN_TREND_POINTS + 1) return null;
  const slope = leastSquaresSlope(points);
  if (slope === null) return null;

  const meanX = points.reduce((sum, p) => sum + p[0], 0) / n;
  const meanY = points.reduce((sum, p) => sum + p[1], 0) / n;
  const intercept = meanY - slope * meanX;

  let residualSum = 0;
  let spreadX = 0;
  for (const [x, y] of points) {
    const residual = y - (intercept + slope * x);
    residualSum += residual * residual;
    spreadX += (x - meanX) * (x - meanX);
  }
  if (spreadX === 0) return null;
  return Math.sqrt(residualSum / (n - 2) / spreadX);
}

/** kg/day slope of a set of (dayOffset, kg) points; null when undefined. */
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
  Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000
  );

export function buildFusionTrainingSamples(args: BuildSamplesArgs): FusionDaySample[] {
  const {
    dailyCaloriesMap, dailyCompletionMap, gymVolumeMap, activeCaloriesMap, readinessScoreByDay,
    caffeineMap, creatineMap, trendWeightMap, sleepLogs, energyPerKgTissue,
  } = args;

  const trendDates = Object.keys(trendWeightMap).sort();
  if (trendDates.length < 2) return [];

  // Index sleep by day once rather than scanning per candidate day.
  const sleepByDate = new Map<string, BuildSamplesArgs['sleepLogs'][number]>();
  for (const s of sleepLogs) {
    if (!s?.logged_at) continue;
    sleepByDate.set(s.logged_at.split('T')[0], s);
  }

  const energyPerKg = energyPerKgTissue || 7700;
  const samples: FusionDaySample[] = [];

  const candidateDates = Object.keys(dailyCaloriesMap)
    .filter(d => (dailyCaloriesMap[d] || 0) > 0)
    .filter(d => dailyCompletionMap[d] ?? true)
    .sort();

  for (const date of candidateDates) {
    // Trend points bracketing this day, preferring a window centred on it and
    // falling back to a trailing one at the end of the series.
    const windowDates = trendDates.filter(
      d => dayDiff(d, date) <= TREND_WINDOW_DAYS && dayDiff(date, d) <= TREND_WINDOW_DAYS
    );
    if (windowDates.length < MIN_TREND_POINTS) continue;

    // Skip while the EMA is still converging on its own starting value.
    if (
      trendDates.indexOf(windowDates[0]) < EMA_WARMUP_POINTS &&
      dayDiff(trendDates[0], date) < EMA_WARMUP_POINTS
    ) continue;

    const start = windowDates[0];
    const end = windowDates[windowDates.length - 1];

    // Least-squares slope across every point in the window, not endpoint minus
    // endpoint. A single stray weigh-in at either end swings an endpoint
    // difference by its full magnitude, while a regression over the whole
    // window barely moves.
    const dailyWeightChangeKg = leastSquaresSlope(
      windowDates.map(d => [dayDiff(start, d), trendWeightMap[d]] as [number, number])
    );
    if (dailyWeightChangeKg === null) continue;
    if (Math.abs(dailyWeightChangeKg) > MAX_PLAUSIBLE_KG_PER_DAY) continue;

    let intakeSum = 0;
    let intakeDays = 0;
    for (const d of Object.keys(dailyCaloriesMap)) {
      if (dayDiff(start, d) < 0 || dayDiff(d, end) < 0) continue;
      const cal = dailyCaloriesMap[d] || 0;
      if (cal > 0 && (dailyCompletionMap[d] ?? true)) {
        intakeSum += cal;
        intakeDays++;
      }
    }
    if (intakeDays < MIN_COMPLETE_DAYS_IN_WINDOW) continue;

    // The intake days have to cover the span the weight change was measured over.
    const windowSpanDays = dayDiff(start, end) + 1;
    if (windowSpanDays > 0 && intakeDays / windowSpanDays < MIN_WINDOW_COVERAGE) continue;

    const avgIntake = intakeSum / intakeDays;
    const actualTdee = Math.round(avgIntake - dailyWeightChangeKg * energyPerKg);
    if (actualTdee < MIN_PLAUSIBLE_TDEE || actualTdee > MAX_PLAUSIBLE_TDEE) continue;

    const sleep = sleepByDate.get(date);
    const durationMin = Number(sleep?.duration_minutes ?? 0);
    const durationHours = durationMin > 0 ? durationMin / 60 : 8.0;
    const quality = Number(sleep?.quality_score ?? 0) > 0 ? Number(sleep!.quality_score) : 80;
    const deepRatio = durationMin > 0 && sleep?.deep_minutes
      ? Number(sleep.deep_minutes) / durationMin
      : 0.25;
    const remRatio = durationMin > 0 && sleep?.rem_minutes
      ? Number(sleep.rem_minutes) / durationMin
      : 0.18;
    // Only real measured HRV. There is no fabricated stand-in here: when the
    // reading is missing the population-typical 60 is used, the same neutral
    // value the live prediction path falls back to.
    const hrv = Number(sleep?.hrv_ms ?? 0) > 0 ? Number(sleep!.hrv_ms) : 60;

    samples.push({
      date,
      // Same twelve metrics, same order, as ZenithFusionNet.predict().
      rawInputs: [
        dailyCaloriesMap[date] || 0,
        // Kilocalories, matching the live path. Tonnage went in here while the
        // network's other activity input was energy, so the layer was being asked to
        // add kilograms to kilocalories.
        strengthCaloriesFromVolume(gymVolumeMap[date] || 0),
        // The day's measured active calories, matching the live path. Both used to
        // send a constant 80 for any active day, which taught the network that every
        // training day costs the same.
        activeCaloriesMap[date] || 0,
        quality,
        durationHours,
        deepRatio,
        remRatio,
        hrv,
        0, // Delta RHR: no resting-HR pipeline exists in this app
        caffeineMap[date] || 0,
        creatineMap[date] ? 1.0 : 0.0,
        trendWeightMap[date] ?? trendWeightMap[end],
      ],
      actualTdee,
      // Sleep quality is input 3 of the same network; using it as the recovery and
      // capacity target trained two outputs to reproduce one of their own inputs.
      // Without a readiness answer for the day there is no independent observation,
      // and these stay null so the outputs receive no gradient.
      actualRecovery: readinessScoreByDay?.[date] ?? null,
      actualCapacity: readinessScoreByDay?.[date] ?? null,
    });
  }

  return samples;
}


/**
 * The athlete's actually-measured rate of weight change, in kg per week.
 *
 * The Weight Predictor extrapolates a *formula-derived* energy balance 28 days
 * forward. That formula can drift from reality - under-logged days understate
 * intake, and the TDEE estimate carries its own error - so this gives the
 * measured counterpart to compare against: a least-squares fit over the weight
 * EMA the scale actually produced.
 *
 * Returns null when there isn't enough spread to fit a line.
 */
/**
 * How wide the uncertainty on that weekly rate is, in kg/week at 95%.
 *
 * Body weight moves half a kilo a day on hydration alone, so a month of weighing pins
 * a trend far less tightly than the point estimate suggests. On this athlete's 26
 * weigh-ins the rate is -0.10 kg/week with a band of roughly +/-0.29 - which spans
 * zero, and which in energy terms is a daily expenditure anywhere across a 600 kcal
 * range. Presenting the midpoint of that as "the most reliable number we have" is a
 * stronger claim than the arithmetic supports.
 */
export function measuredWeeklyRateUncertaintyKg(
  trendWeightMap: Record<string, number>,
  lookbackDays: number = 28
): number | null {
  const dates = Object.keys(trendWeightMap).sort();
  if (dates.length < MIN_TREND_POINTS + 1) return null;

  const last = dates[dates.length - 1];
  const windowDates = dates.filter(d => dayDiff(d, last) <= lookbackDays);
  if (windowDates.length < MIN_TREND_POINTS + 1) return null;

  const error = slopeStandardError(
    windowDates.map(d => [dayDiff(windowDates[0], d), trendWeightMap[d]] as [number, number])
  );
  return error === null ? null : error * 1.96 * 7;
}

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
  // A few days of spread can't distinguish a trend from a hydration swing.
  if (span < 7) return null;

  const slope = leastSquaresSlope(
    windowDates.map(d => [dayDiff(windowDates[0], d), trendWeightMap[d]] as [number, number])
  );
  return slope === null ? null : slope * 7;
}
