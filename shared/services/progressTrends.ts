import { toKg, RIR_DEFAULT } from './trainingLoad';

/**
 * Are we actually getting better?
 *
 * Adherence and progress are different questions, and the calendar only answered the
 * first: a perfect 100%-of-plan week where the athlete is getting weaker looks exactly
 * like one where they are getting stronger. These are the measures that answer the
 * second, each comparing a recent window against the window before it.
 *
 * Every trend can come back as "not enough data". That is a real answer and is shown
 * as one - inventing a direction from two data points is how a dashboard starts
 * lying to the person reading it.
 */

export type TrendDirection = 'up' | 'flat' | 'down' | 'unknown';

export interface Trend {
  key: string;
  label: string;
  /** Current value, or null when it cannot be computed. */
  value: number | null;
  /** The comparison window's value. */
  previous: number | null;
  unit: string;
  direction: TrendDirection;
  /** Percentage change, positive meaning movement in the helpful direction. */
  changePct: number | null;
  /** Why there is no number, when there is none. */
  note?: string;
  /** Days on each side of the comparison, so the card can say what it compared. */
  windowDays: number | null;
}

/** Below this, a change is noise rather than progress. */
export const MEANINGFUL_CHANGE_PCT = 2.5;

function classify(
  current: number | null,
  previous: number | null
): { direction: TrendDirection; changePct: number | null } {
  if (current === null || previous === null || previous === 0) {
    return { direction: 'unknown', changePct: null };
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < MEANINGFUL_CHANGE_PCT) return { direction: 'flat', changePct: pct };
  return { direction: pct > 0 ? 'up' : 'down', changePct: pct };
}

export interface TrendWindow {
  /** Epoch ms of the boundary between "now" and "before". */
  splitMs: number;
  /** Epoch ms before which data is ignored entirely. */
  fromMs: number;
  /** Days on each side. */
  halfDays: number;
}

/** Shortest and longest half-window worth comparing over. */
export const MIN_HALF_WINDOW_DAYS = 7;
export const MAX_HALF_WINDOW_DAYS = 42;

/**
 * Size the comparison to the history that exists.
 *
 * A fixed six-weeks-versus-six is the conventional choice and it is wrong for anyone
 * who has not been logging for three months: this athlete's entire gym history spans
 * four weeks, so a six-week split puts all of it on one side and leaves the card
 * saying "not enough data" until October, even though there is a perfectly good
 * fortnight-against-fortnight comparison sitting in the data.
 *
 * So the window is half of whatever history the metric has, floored at a week (below
 * that a single session dominates) and capped at six (beyond that it stops being a
 * read on current form). Each metric gets its own, and the card says which it used.
 */
export function resolveTrendWindow(
  timestampsMs: number[],
  now: number = Date.now(),
  minHalfDays: number = MIN_HALF_WINDOW_DAYS,
  maxHalfDays: number = MAX_HALF_WINDOW_DAYS
): TrendWindow | null {
  const valid = timestampsMs.filter(t => Number.isFinite(t) && t <= now);
  if (valid.length < 2) return null;

  const spanDays = (now - Math.min(...valid)) / 86400000;
  const halfDays = Math.min(maxHalfDays, Math.max(minHalfDays, spanDays / 2));

  return {
    splitMs: now - halfDays * 86400000,
    fromMs: now - 2 * halfDays * 86400000,
    halfDays: Math.round(halfDays)
  };
}

/** Best eFTP in each window: the honest read on cycling fitness. */
export function eftpTrend(
  rides: { date: number; metadata?: any }[] | null | undefined,
  w?: TrendWindow | null,
  now: number = Date.now()
): Trend {
  const samples: { at: number; eftp: number }[] = [];

  for (const ride of rides ?? []) {
    const at = Number(ride?.date);
    if (!Number.isFinite(at)) continue;

    let meta = ride?.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { meta = {}; }
    }
    // null and '' must not reach Number(), which turns both into 0.
    const raw = meta?.eFTP ?? meta?.eftp;
    if (raw === null || raw === undefined || raw === '') continue;
    const eftp = Number(raw);
    if (!Number.isFinite(eftp) || eftp <= 0) continue;

    samples.push({ at, eftp });
  }

  const win = w ?? resolveTrendWindow(samples.map(x => x.at), now);
  if (!win) {
    return {
      key: 'eftp', label: 'Cycling threshold', value: null, previous: null, unit: 'W',
      direction: 'unknown', changePct: null, windowDays: null,
      note: 'Needs rides with a threshold estimate in two separate periods.'
    };
  }

  let recent = 0;
  let prior = 0;
  for (const { at, eftp } of samples) {
    if (at < win.fromMs) continue;
    if (at >= win.splitMs) recent = Math.max(recent, eftp);
    else prior = Math.max(prior, eftp);
  }

  const value = recent > 0 ? Math.round(recent) : null;
  const previous = prior > 0 ? Math.round(prior) : null;
  const { direction, changePct } = classify(value, previous);

  return {
    key: 'eftp',
    label: 'Cycling threshold',
    value,
    previous,
    unit: 'W',
    direction,
    changePct,
    windowDays: win.halfDays,
    note: value === null
      ? 'No ride with a threshold estimate in this period.'
      : previous === null ? 'Nothing to compare against yet.' : undefined
  };
}

/** Epley, the same estimate Kratos uses everywhere else. */
export function estimate1RM(weightKg: number, reps: number, rir: number): number {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  return weightKg * (1 + (reps + rir) / 30);
}

export interface StrengthTrend extends Trend {
  /** Per-exercise movement, biggest change first. */
  movers: { exerciseId: string; current: number; previous: number; changePct: number }[];
  improved: number;
  declined: number;
}

/**
 * Strength, as the sum of each exercise's best estimated 1RM.
 *
 * Summed rather than averaged so that dropping an exercise from the routine cannot
 * read as a strength gain, and only exercises present in BOTH windows count -
 * otherwise adding a new lift would look like progress on the day it was added.
 */
export function strengthTrend(
  workouts: { completed_at: string; sets: any; is_off_day?: boolean }[] | null | undefined,
  unitByExerciseId: Record<string, string | null | undefined>,
  w?: TrendWindow | null,
  now: number = Date.now()
): StrengthTrend {
  const sessions: { at: number; lifts: { exId: string; e1rm: number }[] }[] = [];

  for (const workout of workouts ?? []) {
    if (workout?.is_off_day) continue;
    const at = new Date(workout?.completed_at).getTime();
    if (!Number.isFinite(at)) continue;
    if (!Array.isArray(workout?.sets)) continue;

    const lifts: { exId: string; e1rm: number }[] = [];
    for (const exercise of workout.sets as any[]) {
      const exId = exercise?.exercise_id;
      if (!exId || !Array.isArray(exercise?.sets)) continue;
      const unit = unitByExerciseId[exId];

      for (const set of exercise.sets) {
        if (set?.type !== 'working') continue;
        const reps = Number(set?.reps);
        if (!Number.isFinite(reps) || reps <= 0) continue;
        // A missing RIR is not 0 - 0 means taken to failure, which would overstate
        // the estimate rather than leave it unknown.
        const rawRir = set?.rir;
        const rir = (rawRir === null || rawRir === undefined || rawRir === '' || !Number.isFinite(Number(rawRir)))
          ? RIR_DEFAULT
          : Math.max(0, Number(rawRir));
        const kg = toKg(Number(set?.weight) || 0, unit);
        const e1rm = estimate1RM(kg, reps, rir);
        if (e1rm > 0) lifts.push({ exId, e1rm });
      }
    }
    if (lifts.length > 0) sessions.push({ at, lifts });
  }

  const win = w ?? resolveTrendWindow(sessions.map(x => x.at), now);
  const empty: StrengthTrend = {
    key: 'strength', label: 'Estimated strength', value: null, previous: null,
    unit: 'kg e1RM', direction: 'unknown', changePct: null, windowDays: win?.halfDays ?? null,
    movers: [], improved: 0, declined: 0,
    note: 'Needs the same exercise logged in two separate periods.'
  };
  if (!win) return empty;

  const best: Record<string, { recent: number; prior: number }> = {};
  for (const session of sessions) {
    if (session.at < win.fromMs) continue;
    for (const lift of session.lifts) {
      const entry = (best[lift.exId] ||= { recent: 0, prior: 0 });
      if (session.at >= win.splitMs) entry.recent = Math.max(entry.recent, lift.e1rm);
      else entry.prior = Math.max(entry.prior, lift.e1rm);
    }
  }

  let currentSum = 0;
  let previousSum = 0;
  const movers: StrengthTrend['movers'] = [];

  for (const [exerciseId, entry] of Object.entries(best)) {
    if (entry.recent <= 0 || entry.prior <= 0) continue;
    currentSum += entry.recent;
    previousSum += entry.prior;
    movers.push({
      exerciseId,
      current: Math.round(entry.recent * 10) / 10,
      previous: Math.round(entry.prior * 10) / 10,
      changePct: ((entry.recent - entry.prior) / entry.prior) * 100
    });
  }

  if (movers.length === 0) return empty;

  movers.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  const value = Math.round(currentSum);
  const previous = Math.round(previousSum);
  const { direction, changePct } = classify(value, previous);

  return {
    key: 'strength',
    label: 'Estimated strength',
    value,
    previous,
    unit: 'kg e1RM',
    direction,
    changePct,
    windowDays: win.halfDays,
    movers,
    improved: movers.filter(m => m.changePct >= MEANINGFUL_CHANGE_PCT).length,
    declined: movers.filter(m => m.changePct <= -MEANINGFUL_CHANGE_PCT).length
  };
}

/**
 * Running economy: pace at a comparable heart rate.
 *
 * Pace alone says nothing - running harder is not the same as running better - so
 * only runs whose average heart rate falls in the same band are compared, and
 * nothing is reported when there are none.
 */
export function runningEconomyTrend(
  runs: { date: string; avg_pace_min_km?: any; avg_heart_rate?: any }[] | null | undefined,
  w?: TrendWindow | null,
  hrBand: [number, number] = [125, 155],
  now: number = Date.now()
): Trend {
  const samples: { at: number; pace: number }[] = [];

  for (const run of runs ?? []) {
    const at = new Date(run?.date).getTime();
    if (!Number.isFinite(at)) continue;
    const hr = Number(run?.avg_heart_rate);
    const pace = Number(run?.avg_pace_min_km);
    if (!Number.isFinite(hr) || hr < hrBand[0] || hr > hrBand[1]) continue;
    if (!Number.isFinite(pace) || pace < 2 || pace > 15) continue;
    samples.push({ at, pace });
  }

  const win = w ?? resolveTrendWindow(samples.map(x => x.at), now);
  if (!win) {
    return {
      key: 'running', label: 'Pace at steady effort', value: null, previous: null,
      unit: 'min/km', direction: 'unknown', changePct: null, windowDays: null,
      note: `Needs runs in two separate periods with an average heart rate between ${hrBand[0]} and ${hrBand[1]}.`
    };
  }

  const recent: number[] = [];
  const prior: number[] = [];
  for (const { at, pace } of samples) {
    if (at < win.fromMs) continue;
    (at >= win.splitMs ? recent : prior).push(pace);
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const value = mean(recent);
  const previous = mean(prior);

  // A lower pace is faster, so the sign is flipped to keep "up" meaning improvement.
  const raw = classify(value, previous);
  const changePct = raw.changePct === null ? null : -raw.changePct;
  const direction: TrendDirection =
    raw.direction === 'up' ? 'down' : raw.direction === 'down' ? 'up' : raw.direction;

  return {
    key: 'running',
    label: 'Pace at steady effort',
    value: value === null ? null : Math.round(value * 100) / 100,
    previous: previous === null ? null : Math.round(previous * 100) / 100,
    unit: 'min/km',
    direction,
    changePct,
    windowDays: win.halfDays,
    note: value === null
      ? `No runs logged with an average heart rate between ${hrBand[0]} and ${hrBand[1]}.`
      : previous === null ? 'Nothing to compare against yet.' : undefined
  };
}

/** Weekly training load, recent window against the one before, per week either side. */
export function loadTrend(
  loads: { dateKey: string; tss: number }[] | null | undefined,
  w?: TrendWindow | null,
  now: number = Date.now()
): Trend {
  // Midday, so a day key cannot land on the wrong side of a boundary.
  const samples = (loads ?? [])
    .map(entry => ({ at: new Date(`${entry.dateKey}T12:00:00`).getTime(), tss: entry.tss }))
    .filter(x => Number.isFinite(x.at));

  const win = w ?? resolveTrendWindow(samples.map(x => x.at), now);
  if (!win) {
    return {
      key: 'load', label: 'Weekly load', value: null, previous: null, unit: 'load/wk',
      direction: 'unknown', changePct: null, windowDays: null,
      note: 'Needs training logged in two separate periods.'
    };
  }

  let recent = 0;
  let prior = 0;
  for (const { at, tss } of samples) {
    if (at < win.fromMs) continue;
    if (at >= win.splitMs) recent += tss;
    else prior += tss;
  }

  const weeks = win.halfDays / 7;
  const value = recent > 0 ? Math.round(recent / weeks) : null;
  const previous = prior > 0 ? Math.round(prior / weeks) : null;
  const { direction, changePct } = classify(value, previous);

  return {
    key: 'load',
    label: 'Weekly load',
    value,
    previous,
    unit: 'load/wk',
    direction,
    changePct,
    windowDays: win.halfDays,
    note: value === null ? 'Nothing logged in this period.' : undefined
  };
}
