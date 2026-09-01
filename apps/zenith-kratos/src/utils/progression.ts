import { toKg } from '@zenith/shared';

/**
 * Per-exercise progression across sessions of the same routine.
 *
 * Web only, deliberately. Kratos Pilot on the phone is for logging a session while
 * standing in front of a rack; this is for looking back at a month of them.
 *
 * ## Why the comparison is not just "best ever"
 *
 * Comparing every session against an all-time best sounds obvious and produces
 * nonsense on real data. Early sessions in this athlete's log show the HIGHEST
 * estimated 1RM on several lifts, then a drop that never recovers - which reads as
 * months of regression. The likelier explanation is that RIR is guessed badly when
 * you first start recording it, and an optimistic RIR inflates the estimate: a set
 * logged as "3 left in the tank" that really had none is credited with three reps
 * nobody did.
 *
 * There is no way to tell those apart from the data, so the honest response is not
 * to build an alarm on top of it. A stall is judged on the RECENT run of sessions -
 * has anything moved in the last three - not on the distance from a single early
 * number that may never have been real.
 */

export interface ExerciseMeta {
  id: string;
  name: string;
  weight_unit?: string | null;
  is_bodyweight?: boolean | null;
  primary_muscle?: string | null;
}

export interface WorkoutRow {
  id: string;
  name: string;
  template_id?: string | null;
  completed_at: string;
  sets: unknown;
  is_off_day?: boolean | null;
}

/** One exercise's showing in one session. */
export interface ExerciseSession {
  date: string;
  workoutId: string;
  workoutName: string;
  templateId: string | null;
  exerciseId: string;
  exerciseName: string;
  unit: string;
  /** Best working set, estimated 1RM, in KILOGRAMS. */
  bestE1rmKg: number;
  /** The set that produced it, in the exercise's own display unit. */
  bestSet: { weight: number; reps: number; rir: number } | null;
  workingSets: number;
  /** Sets taken to within one rep of failure. */
  hardSets: number;
  volumeKg: number;
  /**
   * The position this exercise was actually performed in, when recorded.
   *
   * Null for every session logged before Kratos Pilot began recording it. An
   * exercise pushed later in a session - because the machine was busy - is worked
   * on muscles that are already tired, so a dip there is not the same thing as
   * getting weaker. Without this the two are indistinguishable.
   */
  performedOrder: number | null;
  /** The athlete marked this session as unrepresentative. */
  isOffDay: boolean;
}

/** Epley, extended to count reps left in reserve as reps not performed. */
export function estimate1RM(weightKg: number, reps: number, rir: number): number {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  const effectiveReps = reps + Math.max(0, rir);
  return weightKg * (1 + effectiveReps / 30);
}

/**
 * Flattens raw workout rows into one entry per exercise per session.
 *
 * Weights are converted to kilograms via the exercise's configured unit. Skipping
 * that is how session volume came to add a 100 lb stack as 100 kg, which overstated
 * this athlete's tonnage by up to 111%.
 */
export function buildExerciseSessions(
  workouts: WorkoutRow[],
  exercises: ExerciseMeta[],
  bodyWeightKg = 0
): ExerciseSession[] {
  const metaById = new Map(exercises.map(e => [e.id, e]));
  const out: ExerciseSession[] = [];

  for (const w of workouts) {
    if (!w.completed_at || !Array.isArray(w.sets)) continue;

    for (const exLog of w.sets as any[]) {
      const exId = exLog?.exercise_id;
      const meta = exId ? metaById.get(exId) : undefined;
      if (!exId) continue;

      const unit = meta?.weight_unit ?? 'kg';
      const setList = Array.isArray(exLog?.sets) ? exLog.sets : [];

      let bestE1rmKg = 0;
      let bestSet: ExerciseSession['bestSet'] = null;
      let workingSets = 0;
      let hardSets = 0;
      let volumeKg = 0;

      for (const st of setList) {
        if (st?.type !== 'working') continue;
        const weight = Number(st?.weight);
        const reps = Number(st?.reps);
        if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0) continue;

        // RIR may legitimately be 0 (taken to failure), so a missing value has to be
        // told apart from zero rather than defaulted through `|| 2`.
        const rawRir = st?.rir;
        const rir = (rawRir === null || rawRir === undefined || rawRir === '' || !Number.isFinite(Number(rawRir)))
          ? 2
          : Number(rawRir);

        const addedKg = toKg(weight, unit);
        const effectiveKg = meta?.is_bodyweight ? bodyWeightKg + addedKg : addedKg;

        workingSets++;
        if (rir <= 1) hardSets++;
        volumeKg += effectiveKg * reps;

        const e1rm = estimate1RM(effectiveKg, reps, rir);
        if (e1rm > bestE1rmKg) {
          bestE1rmKg = e1rm;
          bestSet = { weight, reps, rir };
        }
      }

      if (workingSets === 0) continue;

      out.push({
        date: w.completed_at,
        workoutId: w.id,
        workoutName: w.name,
        templateId: w.template_id ?? null,
        exerciseId: exId,
        exerciseName: meta?.name ?? exLog?.name ?? 'Unknown exercise',
        unit,
        bestE1rmKg: Math.round(bestE1rmKg * 10) / 10,
        bestSet,
        workingSets,
        hardSets,
        volumeKg: Math.round(volumeKg),
        // null and undefined must be rejected BEFORE Number(), which turns both into
        // 0 - and 0 is the valid, meaningful value "done first". A session logged
        // before the order was recorded would otherwise claim to have been first.
        performedOrder: (() => {
          const raw = exLog?.performed_order;
          if (raw === null || raw === undefined || raw === '') return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : null;
        })(),
        isOffDay: w.is_off_day === true
      });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type TrendVerdict = 'progressing' | 'stalled' | 'regressing' | 'new';

export interface ExerciseTrend {
  exerciseId: string;
  exerciseName: string;
  unit: string;
  sessions: ExerciseSession[];
  verdict: TrendVerdict;
  /** Change in best e1RM across the recent window, as a percentage. */
  recentChangePct: number | null;
  /**
   * Change between the last two sessions alone.
   *
   * Reported separately because the two can disagree and the difference matters:
   * 174 -> 153 -> 161 is down across the window but up since last time. Calling
   * that "regressing" and stopping there tells the athlete to worry about
   * something they have already started fixing.
   */
  lastChangePct: number | null;
  headline: string;
  detail: string;
}

/**
 * How many recent sessions decide the verdict.
 *
 * Three is the smallest number that can distinguish "held steady once" from "has
 * not moved". Two would call every repeated weight a stall, which for anyone
 * running a weekly split means crying wolf constantly.
 */
export const TREND_WINDOW = 3;

/**
 * Movement smaller than this is not progress, it is the same weight logged with a
 * different rep or a different guess at RIR. One rep at ten kilos moves an Epley
 * estimate by about 3%.
 */
const MEANINGFUL_CHANGE_PCT = 2.5;

function ordinal(n: number): string {
  const i = Math.round(n) + 1; // performedOrder is 0-based; people count from one
  const suffix = i % 10 === 1 && i % 100 !== 11 ? 'st'
    : i % 10 === 2 && i % 100 !== 12 ? 'nd'
    : i % 10 === 3 && i % 100 !== 13 ? 'rd' : 'th';
  return `${i}${suffix}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function analyseExerciseTrend(sessions: ExerciseSession[]): ExerciseTrend {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const base = {
    exerciseId: latest.exerciseId,
    exerciseName: latest.exerciseName,
    unit: latest.unit,
    sessions: sorted
  };

  if (sorted.length < TREND_WINDOW) {
    return {
      ...base,
      verdict: 'new',
      recentChangePct: null,
      lastChangePct: null,
      headline: 'Not enough sessions yet',
      detail: `${sorted.length} session${sorted.length === 1 ? '' : 's'} logged. Three is enough to tell a plateau from a normal week.`
    };
  }

  // Only the recent run. Comparing against an all-time best would report a
  // permanent regression on any lift whose first session was logged with an
  // optimistic RIR, which no amount of good training afterwards can undo.
  const window = sorted.slice(-TREND_WINDOW);

  // A session the athlete flagged, or one where this exercise was pushed later than
  // usual because a machine was taken, is not evidence of getting weaker - it is
  // evidence of a worse position to lift from. Noted so the verdict can say so
  // rather than quietly counting it as decline.
  const typicalOrder = median(sorted.map(x => x.performedOrder).filter((n): n is number => n !== null));
  const mostRecent = window[window.length - 1];
  const displaced = typicalOrder !== null && mostRecent.performedOrder !== null
    && mostRecent.performedOrder > typicalOrder + 1;
  const flagged = window.some(x => x.isOffDay);
  // Prefixed onto a decline verdict so a worse position to lift from is not read as
  // getting weaker.
  const caveat = displaced
    ? ` Note that you did this ${ordinal(mostRecent.performedOrder as number)} last time rather than your usual ${ordinal(typicalOrder as number)} - later in the session, on muscles that were already tired.`
    : flagged
      ? ' One of these sessions is marked as not representative.'
      : '';
  const first = window[0].bestE1rmKg;
  const last = window[window.length - 1].bestE1rmKg;
  const changePct = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0;

  const prev = window[window.length - 2].bestE1rmKg;
  const lastChangePct = prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : 0;

  // When the window and the most recent step disagree, say both. A lift that dipped
  // and is climbing back is a different situation from one still falling, and the
  // window figure alone cannot tell them apart.
  const recovering = changePct < 0 && lastChangePct >= MEANINGFUL_CHANGE_PCT;
  const fading = changePct > 0 && lastChangePct <= -MEANINGFUL_CHANGE_PCT;

  const dates = window.map(s => new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
  const span = `${dates[0]} to ${dates[dates.length - 1]}`;

  if (changePct >= MEANINGFUL_CHANGE_PCT) {
    return {
      ...base,
      verdict: 'progressing',
      recentChangePct: changePct,
      lastChangePct,
      headline: `Up ${changePct}%`,
      detail: fading
        ? `Up ${changePct}% across the last ${TREND_WINDOW} sessions (${span}), but down ${Math.abs(lastChangePct)}% since last time. Worth watching rather than acting on yet.`
        : `Your best set has climbed over the last ${TREND_WINDOW} sessions (${span}). Keep doing what you are doing.`
    };
  }

  if (changePct <= -MEANINGFUL_CHANGE_PCT) {
    const stillHard = window[window.length - 1].hardSets > 0;
    return {
      ...base,
      verdict: recovering ? 'progressing' : 'regressing',
      recentChangePct: changePct,
      lastChangePct,
      headline: recovering ? `Climbing back (+${lastChangePct}%)` : `Down ${Math.abs(changePct)}%`,
      detail: (recovering
        ? `Still ${Math.abs(changePct)}% below where this window started (${span}), but up ${lastChangePct}% since last time - it is moving in the right direction again.`
        : stillHard
        ? `Your best set has dropped over the last ${TREND_WINDOW} sessions (${span}) even though you are still taking sets near failure. Worth checking recovery, or whether the weight jumped too fast earlier.`
        : `Your best set has dropped over the last ${TREND_WINDOW} sessions (${span}), and none of the recent sets went near failure. This may be effort rather than capacity.`) + caveat
    };
  }

  const hardSets = window.reduce((n, s) => n + s.hardSets, 0);

  // "Same weight" is a claim about the bar, and this verdict is about the estimated
  // 1RM. On this athlete's lateral raise the two disagreed: 8 kg, then 6 kg, then
  // 8 kg again, with the e1RM flat across them - and the card said "Same weight for
  // 3 sessions" directly above a table showing all three different. Only say the
  // weight is unchanged when it actually is.
  const weights = window.map(w => w.bestSet?.weight).filter((w): w is number => typeof w === 'number');
  const weightHeld = weights.length > 0 && weights.every(w => w === weights[0]);
  const opening = weightHeld
    ? `Same weight for ${TREND_WINDOW} sessions (${span})`
    : `Your best set is no stronger than ${TREND_WINDOW} sessions ago (${span})`;

  return {
    ...base,
    verdict: 'stalled',
    recentChangePct: changePct,
    lastChangePct,
    headline: 'Not moving',
    detail: hardSets === 0
      ? `${opening}, and no set has gone within one rep of failure. There is probably room to push before adding load.`
      : `${opening} despite ${hardSets} hard set${hardSets === 1 ? '' : 's'}. Time to change something - load, reps, or the exercise.`
  };
}

export function analyseAllExercises(sessions: ExerciseSession[]): ExerciseTrend[] {
  const byExercise = new Map<string, ExerciseSession[]>();
  for (const s of sessions) {
    const list = byExercise.get(s.exerciseId) ?? [];
    list.push(s);
    byExercise.set(s.exerciseId, list);
  }

  const order: Record<TrendVerdict, number> = { stalled: 0, regressing: 1, progressing: 2, new: 3 };
  return [...byExercise.values()]
    .map(analyseExerciseTrend)
    .sort((a, b) => order[a.verdict] - order[b.verdict] || a.exerciseName.localeCompare(b.exerciseName));
}

export interface ExerciseComparison {
  exerciseName: string;
  unit: string;
  current: ExerciseSession;
  previous: ExerciseSession | null;
  e1rmChangePct: number | null;
  volumeChangePct: number | null;
}

export interface SessionComparison {
  workoutId: string;
  workoutName: string;
  date: string;
  previousDate: string | null;
  volumeKg: number;
  previousVolumeKg: number | null;
  volumeChangePct: number | null;
  exercises: ExerciseComparison[];
}

/**
 * This session against the previous run of the SAME routine.
 *
 * Matched on template_id, falling back to the workout name for sessions logged
 * before templates were linked. Comparing a PUSH day against whatever happened to
 * come before it - which might be PULL - answers nothing.
 */
export function compareToPreviousSession(
  workoutId: string,
  allSessions: ExerciseSession[]
): SessionComparison | null {
  const current = allSessions.filter(s => s.workoutId === workoutId);
  if (current.length === 0) return null;

  const { templateId, workoutName, date } = current[0];

  const previousCandidates = allSessions.filter(s =>
    s.workoutId !== workoutId &&
    s.date < date &&
    (templateId ? s.templateId === templateId : s.workoutName === workoutName)
  );

  const previousDate = previousCandidates.length > 0
    ? previousCandidates[previousCandidates.length - 1].date
    : null;
  const previous = previousDate ? previousCandidates.filter(s => s.date === previousDate) : [];

  const prevByExercise = new Map(previous.map(s => [s.exerciseId, s]));
  const pct = (now: number, before: number) =>
    before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;

  const volumeKg = current.reduce((n, s) => n + s.volumeKg, 0);
  const previousVolumeKg = previous.length > 0 ? previous.reduce((n, s) => n + s.volumeKg, 0) : null;

  return {
    workoutId,
    workoutName,
    date,
    previousDate,
    volumeKg,
    previousVolumeKg,
    volumeChangePct: previousVolumeKg !== null ? pct(volumeKg, previousVolumeKg) : null,
    exercises: current.map(c => {
      const prev = prevByExercise.get(c.exerciseId) ?? null;
      return {
        exerciseName: c.exerciseName,
        unit: c.unit,
        current: c,
        previous: prev,
        e1rmChangePct: prev ? pct(c.bestE1rmKg, prev.bestE1rmKg) : null,
        volumeChangePct: prev ? pct(c.volumeKg, prev.volumeKg) : null
      };
    })
  };
}
