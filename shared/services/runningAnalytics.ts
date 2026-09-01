import { runningLoad } from './muscleLoad';

/**
 * The analytical layer Stride did not have.
 *
 * It was a logbook: three all-time totals, a searchable table, a detail modal. Every
 * other app in the ecosystem has something that answers a question - Aero has the
 * performance management chart, Kratos has per-exercise progression, Fuel has ZANE -
 * and running had a list of what happened.
 *
 * Everything here works from the fields a run actually carries, and returns null
 * rather than a number whenever the data cannot support one.
 */

export interface RunLike {
  id: string;
  date: string;            // YYYY-MM-DD
  timeOfDay?: string;      // HH:mm
  title?: string;
  distanceKm: number;
  durationSec: number;
  avgPaceMinKm?: number;
  avgHeartRate?: number;
  isTreadmill?: boolean;
  type?: string;
  shoeId?: string;
}

// ── Periods ──────────────────────────────────────────────────────────────────

export type StridePeriod = '7d' | '30d' | '90d' | 'all';

export const STRIDE_PERIOD_LABELS: Record<StridePeriod, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time'
};

const PERIOD_DAYS: Record<Exclude<StridePeriod, 'all'>, number> = {
  '7d': 7, '30d': 30, '90d': 90
};

/**
 * Runs inside a period.
 *
 * The dashboard's headline was total distance since the beginning of time, a number
 * that can only ever grow and therefore says nothing about how the athlete is running
 * now.
 */
export function runsInPeriod<T extends RunLike>(runs: T[], period: StridePeriod, now: Date = new Date()): T[] {
  if (period === 'all') return [...runs];
  const cutoff = now.getTime() - PERIOD_DAYS[period] * 86400000;
  return runs.filter(r => {
    const at = new Date(`${String(r.date).slice(0, 10)}T12:00:00`).getTime();
    return Number.isFinite(at) && at >= cutoff;
  });
}

export interface PeriodSummary {
  runs: number;
  distanceKm: number;
  durationSec: number;
  /** Across the runs that recorded a distance. Null when none did. */
  avgPaceMinKm: number | null;
  /** How many runs were left out of the pace figure for having no distance. */
  runsWithoutDistance: number;
  load: number;
}

export function summarisePeriod(runs: RunLike[]): PeriodSummary {
  // A treadmill session imported without a distance contributes minutes and no
  // kilometres. Averaging total time over total distance across the two produced a
  // pace slower than every run in the average.
  const withDistance = runs.filter(r => r.distanceKm > 0 && r.durationSec > 0);
  const km = withDistance.reduce((sum, r) => sum + r.distanceKm, 0);
  const pacedSec = withDistance.reduce((sum, r) => sum + r.durationSec, 0);

  return {
    runs: runs.length,
    distanceKm: Math.round(runs.reduce((sum, r) => sum + (r.distanceKm || 0), 0) * 10) / 10,
    durationSec: runs.reduce((sum, r) => sum + (r.durationSec || 0), 0),
    avgPaceMinKm: km > 0 ? (pacedSec / 60) / km : null,
    runsWithoutDistance: runs.length - withDistance.length,
    load: runs.reduce((sum, r) => sum + runningLoad(r.durationSec, r.avgHeartRate), 0)
  };
}

// ── Fitness, fatigue and form, from running alone ────────────────────────────

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

export interface RunningForm {
  fitness: number;   // CTL
  fatigue: number;   // ATL
  form: number;      // TSB
  /** Days of history the figures are built from. Below ~28 they mean little. */
  daysOfHistory: number;
}

/**
 * Running-only fitness, fatigue and form.
 *
 * Aero shows this for cycling and the shared pool already computes a running load, so
 * the numbers existed - Stride simply never displayed them. Kept separate from the
 * combined pool deliberately: an athlete wants to know whether their RUNNING is
 * progressing, and a figure dominated by their riding cannot tell them.
 */
export function runningForm(runs: RunLike[], now: Date = new Date()): RunningForm | null {
  if (runs.length === 0) return null;

  const byDay = new Map<string, number>();
  let earliest = Infinity;
  for (const run of runs) {
    const day = String(run.date).slice(0, 10);
    const at = new Date(`${day}T12:00:00`).getTime();
    if (!Number.isFinite(at)) continue;
    earliest = Math.min(earliest, at);
    byDay.set(day, (byDay.get(day) ?? 0) + runningLoad(run.durationSec, run.avgHeartRate));
  }
  if (!Number.isFinite(earliest)) return null;

  const today = new Date(now);
  today.setHours(12, 0, 0, 0);

  let ctl = 0;
  let atl = 0;
  for (let at = earliest; at <= today.getTime(); at += 86400000) {
    const key = new Date(at).toISOString().slice(0, 10);
    const load = byDay.get(key) ?? 0;
    ctl += (load - ctl) / CTL_DAYS;
    atl += (load - atl) / ATL_DAYS;
  }

  return {
    fitness: Math.round(ctl * 10) / 10,
    fatigue: Math.round(atl * 10) / 10,
    form: Math.round((ctl - atl) * 10) / 10,
    daysOfHistory: Math.max(1, Math.round((today.getTime() - earliest) / 86400000) + 1)
  };
}

// ── Intensity distribution ───────────────────────────────────────────────────

/**
 * The boundary between easy and hard, as a fraction of maximum heart rate.
 *
 * The polarised-training literature puts the first ventilatory threshold near 80% of
 * maximum, and the common prescription is that roughly 80% of running should sit below
 * it. Runs with no heart rate cannot be placed on either side and are counted
 * separately rather than assumed easy.
 */
export const EASY_HR_FRACTION = 0.80;

export interface IntensityMix {
  easyRuns: number;
  hardRuns: number;
  unknownRuns: number;
  /** Share of classified runs that were easy, 0..1. Null when none could be classified. */
  easyShare: number | null;
  maxHrUsed: number;
}

/**
 * Maximum heart rate, from what the athlete has actually reached.
 *
 * Preferred over 220-minus-age, which is a population average with a standard
 * deviation of about 10 beats and is wrong for most individuals. Falls back to it only
 * when no run has recorded a maximum.
 */
export function estimateMaxHr(runs: RunLike[], ageYears?: number | null): number {
  let observed = 0;
  for (const run of runs) {
    const hr = Number((run as any).maxHeartRate ?? run.avgHeartRate);
    if (Number.isFinite(hr) && hr > observed) observed = hr;
  }
  if (observed >= 150) return observed;
  const age = Number(ageYears);
  return Number.isFinite(age) && age > 0 ? Math.round(220 - age) : 190;
}

export function intensityMix(runs: RunLike[], maxHr: number): IntensityMix {
  const threshold = maxHr * EASY_HR_FRACTION;
  let easy = 0;
  let hard = 0;
  let unknown = 0;

  for (const run of runs) {
    const hr = Number(run.avgHeartRate);
    // null and '' must not reach a comparison through Number(), which makes both 0 -
    // and a run with no heart rate is not an easy run.
    if (run.avgHeartRate === null || run.avgHeartRate === undefined || !Number.isFinite(hr) || hr <= 0) {
      unknown++;
    } else if (hr < threshold) {
      easy++;
    } else {
      hard++;
    }
  }

  const classified = easy + hard;
  return {
    easyRuns: easy,
    hardRuns: hard,
    unknownRuns: unknown,
    easyShare: classified > 0 ? easy / classified : null,
    maxHrUsed: maxHr
  };
}

// ── Bests ────────────────────────────────────────────────────────────────────

export interface DistanceBest {
  minimumKm: number;
  label: string;
  run: RunLike;
  paceMinKm: number;
}

/**
 * Fastest average pace over each distance band.
 *
 * Explicitly NOT a 5 km personal best: without splits, the fastest 5 km inside a
 * 10 km run is unknowable. This is the fastest average pace across a whole run of at
 * least that distance, and the label says so. Claiming a 5 km PB from a whole-run
 * average would flatter every long run the athlete ever did.
 */
export const BEST_DISTANCE_BANDS = [
  { minimumKm: 3, label: '3 km or more' },
  { minimumKm: 5, label: '5 km or more' },
  { minimumKm: 10, label: '10 km or more' },
  { minimumKm: 21.0975, label: 'Half marathon or more' }
];

export function distanceBests(runs: RunLike[]): DistanceBest[] {
  const out: DistanceBest[] = [];
  for (const band of BEST_DISTANCE_BANDS) {
    let best: RunLike | null = null;
    let bestPace = Infinity;
    for (const run of runs) {
      if (!(run.distanceKm >= band.minimumKm) || !(run.durationSec > 0)) continue;
      const pace = (run.durationSec / 60) / run.distanceKm;
      if (pace < bestPace) {
        bestPace = pace;
        best = run;
      }
    }
    if (best) out.push({ minimumKm: band.minimumKm, label: band.label, run: best, paceMinKm: bestPace });
  }
  return out;
}

// ── Shoes ────────────────────────────────────────────────────────────────────

export interface ShoeLike {
  id: string;
  brand: string;
  model: string;
  nickname?: string;
  totalDistanceKm: number;
  maxDistanceKm: number;
  retired: boolean;
}

export type ShoeState = 'ok' | 'approaching' | 'due';

export interface ShoeStatus {
  shoe: ShoeLike;
  usedFraction: number;
  state: ShoeState;
  remainingKm: number;
}

/** Warn at 85% of a shoe's stated life; a pair is due at 100%. */
export const SHOE_WARNING_FRACTION = 0.85;

/**
 * Shoes were tracked with a mileage limit that nothing ever checked, so a pair could
 * pass its stated life without a word.
 */
export function shoeStatuses(shoes: ShoeLike[]): ShoeStatus[] {
  return shoes
    .filter(s => !s.retired && s.maxDistanceKm > 0)
    .map(shoe => {
      const usedFraction = shoe.totalDistanceKm / shoe.maxDistanceKm;
      return {
        shoe,
        usedFraction,
        state: usedFraction >= 1 ? 'due' : usedFraction >= SHOE_WARNING_FRACTION ? 'approaching' : 'ok',
        remainingKm: Math.round((shoe.maxDistanceKm - shoe.totalDistanceKm) * 10) / 10
      } as ShoeStatus;
    })
    .sort((a, b) => b.usedFraction - a.usedFraction);
}
