import { STRIDE_RSS_HR_REFERENCE_BPM, STRIDE_RSS_SCALAR } from './trainingLoad';

/**
 * How much fatigue an endurance session leaves in each muscle.
 *
 * The heatmap scaled this from raw kilometres, and kilometres are not comparable
 * between sports. An 82 km ride charged the quadriceps 85 - the maximum - while a hard
 * 6 km run charged them 8. Running is the more muscularly damaging of the two per
 * kilometre by a wide margin, and the mapping had it the other way round by a factor
 * of ten.
 *
 * Both now scale from the same TSS-equivalent load the rest of the app uses, so a
 * ride and a run that cost the athlete the same amount of training stress leave
 * comparable amounts of fatigue behind - which is the only basis on which one heatmap
 * can show both.
 */

export interface MuscleImpact {
  [muscleSlug: string]: number;
}

/**
 * Per-muscle share of a session's load.
 *
 * Running is weighted toward the calves: the eccentric loading of each footstrike is
 * what makes running sore in a way cycling is not, and the calf complex absorbs most
 * of it. Cycling is concentric and quadriceps-dominant, with very little for the
 * calves and nothing eccentric at all.
 *
 * These are shares of load, not percentages of a muscle's capacity, which is why they
 * do not sum to 1 - several muscles are working at once.
 */
export const RUN_MUSCLE_SHARE: Readonly<MuscleImpact> = Object.freeze({
  calves: 0.90,
  quadriceps: 0.70,
  hamstring: 0.60,
  gluteal: 0.50,
  abs: 0.25,
  lowerBack: 0.20
});

export const RIDE_MUSCLE_SHARE: Readonly<MuscleImpact> = Object.freeze({
  quadriceps: 0.50,
  gluteal: 0.30,
  hamstring: 0.25,
  calves: 0.20,
  lowerBack: 0.18
});

/**
 * No single session pins a muscle at fully fatigued.
 *
 * The heatmap accumulates across a week, so one ride reaching 100 would leave no room
 * to show that a second one followed it.
 */
export const SINGLE_SESSION_CAP = 85;

/** Running load, in the same unit as a ride's TSS. The shared definition. */
export function runningLoad(durationSec: unknown, avgHeartRate: unknown): number {
  const seconds = Number(durationSec);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const minutes = seconds / 60;

  // null and '' must not reach Number(), which turns both into 0 - and a run with no
  // heart rate recorded is not a run at zero effort. It falls back to the reference,
  // which charges it as a moderate run rather than as nothing.
  const hrMissing = avgHeartRate === null || avgHeartRate === undefined || avgHeartRate === '';
  const hr = hrMissing ? NaN : Number(avgHeartRate);
  const ratio = Number.isFinite(hr) && hr > 60
    ? hr / STRIDE_RSS_HR_REFERENCE_BPM
    : 1.0;

  return Math.round(minutes * ratio * STRIDE_RSS_SCALAR);
}

function applyShare(load: number, share: Readonly<MuscleImpact>): MuscleImpact {
  const out: MuscleImpact = {};
  if (!Number.isFinite(load) || load <= 0) return out;
  for (const [muscle, factor] of Object.entries(share)) {
    const impact = Math.round(load * factor);
    if (impact > 0) out[muscle] = Math.min(SINGLE_SESSION_CAP, impact);
  }
  return out;
}

export function runMuscleImpact(load: number): MuscleImpact {
  return applyShare(load, RUN_MUSCLE_SHARE);
}

export function rideMuscleImpact(load: number): MuscleImpact {
  return applyShare(load, RIDE_MUSCLE_SHARE);
}

/**
 * When a dated activity actually happened, in local time.
 *
 * stride_activities stores the day and the clock time in separate columns, and the
 * heatmap read only the day - so `new Date('2026-08-31')` put a 17:25 run at midnight
 * UTC, seventeen hours early. Fatigue decays at 3.5% an hour, so a run lost 46% of its
 * impact before it was counted at all: exactly the "too low" the athlete noticed.
 */
export function activityTimestampMs(dateKey: unknown, timeOfDay?: unknown): number {
  const day = typeof dateKey === 'string' ? dateKey.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;

  const time = typeof timeOfDay === 'string' && /^\d{1,2}:\d{2}/.test(timeOfDay)
    ? timeOfDay.slice(0, 5)
    // Midday, not midnight. With no clock time recorded, the middle of the day is the
    // least wrong guess available - it is never more than twelve hours out, where
    // midnight is up to twenty-four.
    : '12:00';

  const at = new Date(`${day}T${time}:00`).getTime();
  return Number.isFinite(at) ? at : NaN;
}
