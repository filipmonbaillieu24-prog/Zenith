import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Planned sessions, across all three disciplines.
 *
 * The table was built for cycling - `type` holds cycling zones and everything else
 * hangs off planned_tss, ftp and lthr - so a planned gym session or run had nowhere
 * to live. That mattered beyond the calendar: Fuel had no idea a hard ride was
 * scheduled for tomorrow, so its calorie and macro targets treated a 3-hour ride day
 * exactly like a rest day until the ride had already happened.
 */

export type Discipline = 'aero' | 'kratos' | 'stride';

export interface PlannedWorkout {
  id: string;
  date: string;                 // local calendar day, YYYY-MM-DD
  discipline: Discipline;
  title: string;
  type: string;                 // cycling zone for aero; free text otherwise
  durationMinutes: number;
  plannedTss: number;           // aero only
  distanceKm: number | null;    // stride only
  templateId: string | null;    // kratos only
  notes: string | null;
  completedAt: string | null;
}

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  aero: 'Ride',
  kratos: 'Gym',
  stride: 'Run'
};

/**
 * What a planned session is expected to cost, in kilocalories.
 *
 * Estimates, and deliberately simple ones. They exist so a training day's target is
 * not identical to a rest day's, not to be accurate to the calorie - anyone reading
 * one of these as exact is being misled, so the UI says "planned" wherever it shows.
 *
 *  - Cycling: 100 TSS is one hour at FTP by definition, and an hour at FTP for a
 *    210 W rider is 210 W x 3600 s = 756 kJ. Human efficiency of roughly 24% makes
 *    kJ and kcal near enough interchangeable for this purpose, so kcal comes out at
 *    TSS x FTP x 0.036.
 *  - Running: about 1 kcal per kilogram per kilometre, which is the standard field
 *    approximation and barely varies with pace. Falls back to duration when no
 *    distance is planned.
 *  - Strength: roughly 6 kcal a minute of session time. Lower than either of the
 *    above per minute, because most of a gym session is spent resting.
 */
export const KCAL_PER_MIN_STRENGTH = 6;
export const KCAL_PER_KG_PER_KM_RUNNING = 1.0;
export const KCAL_PER_MIN_RUNNING_FALLBACK = 11;

export function plannedEnergyKcal(
  plan: Pick<PlannedWorkout, 'discipline' | 'durationMinutes' | 'plannedTss' | 'distanceKm'>,
  bodyWeightKg: number,
  ftpWatts: number
): number {
  const minutes = Math.max(0, Number(plan.durationMinutes) || 0);

  if (plan.discipline === 'aero') {
    const tss = Math.max(0, Number(plan.plannedTss) || 0);
    const ftp = ftpWatts > 0 ? ftpWatts : 200;
    return Math.round(tss * ftp * 0.036);
  }

  if (plan.discipline === 'stride') {
    const km = Number(plan.distanceKm);
    if (Number.isFinite(km) && km > 0) {
      return Math.round(km * Math.max(40, bodyWeightKg) * KCAL_PER_KG_PER_KM_RUNNING);
    }
    return Math.round(minutes * KCAL_PER_MIN_RUNNING_FALLBACK);
  }

  return Math.round(minutes * KCAL_PER_MIN_STRENGTH);
}

/**
 * How the day's carbohydrate need shifts because of what is planned.
 *
 * Returns extra grams of carbohydrate to recommend. Endurance work is the case that
 * actually moves it: a long ride runs largely on glycogen, and the standard guidance
 * is a few grams per kilogram on a hard endurance day. Strength work barely touches
 * it by comparison, which is why it is weighted so much lower here.
 */
export function plannedCarbShiftGrams(
  plan: Pick<PlannedWorkout, 'discipline' | 'durationMinutes' | 'plannedTss' | 'distanceKm'>,
  bodyWeightKg: number,
  ftpWatts: number
): number {
  const kcal = plannedEnergyKcal(plan, bodyWeightKg, ftpWatts);
  // Endurance work draws most of its fuel from carbohydrate; strength work is short,
  // intermittent and largely phosphocreatine and glycogen in small amounts.
  const carbFraction = plan.discipline === 'kratos' ? 0.35 : 0.6;
  return Math.round((kcal * carbFraction) / 4);
}


/**
 * Functional threshold power to cost a planned ride against.
 *
 * ## Why measured eFTP wins over the profile
 *
 * profiles.ftp_watts DEFAULTS to 220, and in this database every account still holds
 * exactly 220 - it is the column default rather than anything an athlete typed. Using
 * it would have costed this athlete's planned rides against 220 W when their rides
 * actually measure around 158, overstating every planned ride by nearly 40% and
 * feeding that straight into a calorie target.
 *
 * So a threshold estimated from real rides is preferred, and the profile is the
 * fallback rather than the authority. If someone has genuinely set their FTP, their
 * riding will reflect it and the two will agree.
 *
 * ## Why the best of a window, not the latest
 *
 * Per-ride eFTP reflects how hard that particular ride was, not the athlete's
 * capacity: this athlete's runs 79, 85, 106, 86, 109, 158, 152 - the 86 came from an
 * easy day, not a bad one. Taking the most recent would let one gentle ride collapse
 * the estimate; taking the all-time best would keep crediting a peak reached last
 * winter. The best of a recent window is the usual compromise and behaves sensibly
 * in both directions.
 */
export const FTP_ESTIMATE_WINDOW_DAYS = 90;

/** Last-resort figure, used only when there is neither a ride nor a profile value. */
export const FTP_FALLBACK_WATTS = 200;

export interface RideForFtp {
  /** Epoch milliseconds. */
  date: number;
  metadata?: any;
}

export function resolveCurrentFtp(
  rides: RideForFtp[] | null | undefined,
  profileFtpWatts?: number | null,
  now: Date = new Date()
): { watts: number; source: 'measured' | 'profile' | 'default' } {
  const cutoff = now.getTime() - FTP_ESTIMATE_WINDOW_DAYS * 86400000;

  let bestRecent = 0;
  for (const ride of rides ?? []) {
    const at = Number(ride?.date);
    if (!Number.isFinite(at) || at < cutoff) continue;

    let meta = ride?.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { meta = {}; }
    }
    // null and '' must not reach Number(), which turns both into 0 - harmless for a
    // max, but it would mask a genuinely absent reading as a real zero elsewhere.
    const raw = meta?.eFTP ?? meta?.eftp;
    if (raw === null || raw === undefined || raw === '') continue;
    const eftp = Number(raw);
    if (Number.isFinite(eftp) && eftp > bestRecent) bestRecent = eftp;
  }

  if (bestRecent > 0) return { watts: Math.round(bestRecent), source: 'measured' };

  const profile = Number(profileFtpWatts);
  if (Number.isFinite(profile) && profile > 0) return { watts: Math.round(profile), source: 'profile' };

  return { watts: FTP_FALLBACK_WATTS, source: 'default' };
}

const rowToPlan = (row: any): PlannedWorkout => ({
  id: String(row.id),
  date: String(row.date),
  discipline: (['aero', 'kratos', 'stride'].includes(row.discipline) ? row.discipline : 'aero') as Discipline,
  title: row.title ?? '',
  type: row.type ?? 'custom',
  durationMinutes: Number(row.duration_minutes) || 0,
  plannedTss: Number(row.planned_tss) || 0,
  // null and '' must be rejected before Number(), which turns both into 0 - and 0 km
  // is a different statement from "no distance planned".
  distanceKm: row.distance_km === null || row.distance_km === undefined || row.distance_km === ''
    ? null
    : (Number.isFinite(Number(row.distance_km)) ? Number(row.distance_km) : null),
  templateId: row.template_id ?? null,
  notes: row.notes ?? null,
  completedAt: row.completed_at ?? null
});

/** Planned sessions between two local calendar days, inclusive. */
export async function fetchPlannedWorkouts(
  supabase: SupabaseClient,
  userId: string,
  fromDate: string,
  toDate: string
): Promise<PlannedWorkout[]> {
  const { data, error } = await supabase
    .from('planned_workouts')
    .select('*')
    .eq('user_id', userId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date');

  if (error || !data) return [];
  return (data as any[]).map(rowToPlan);
}

/**
 * The planned sessions for one day that have NOT already been done.
 *
 * A plan whose session has been completed must stop contributing, or the day is
 * charged twice: once as an estimate and again as the real logged activity, which
 * would quietly inflate the calorie target on exactly the days the athlete trained
 * hardest.
 */
export function outstandingPlansForDate(plans: PlannedWorkout[], dateKey: string): PlannedWorkout[] {
  return plans.filter(p => p.date === dateKey && !p.completedAt);
}


/**
 * How long a planned session should be expected to take.
 *
 * Duration was a free-text number the athlete had to guess at, and it is not a
 * cosmetic field: Fuel costs strength and running plans straight from it, so a
 * guess of 60 when the session really runs 44 overstated the day's target by a
 * third. Every discipline has something better than a guess available.
 */

/**
 * Intensity factor by cycling zone. TSS is defined as duration_hours x IF^2 x 100,
 * so knowing the zone ties duration and TSS together and either can be derived from
 * the other. These are the conventional mid-band values for each zone.
 */
export const ZONE_INTENSITY_FACTOR: Record<string, number> = {
  recovery: 0.55,
  endurance: 0.68,
  sweetspot: 0.88,
  threshold: 0.98,
  vo2max: 1.08,
  custom: 0.75
};

const intensityFor = (type: string): number => ZONE_INTENSITY_FACTOR[type] ?? ZONE_INTENSITY_FACTOR.custom;

/** Minutes a ride of this TSS at this zone's intensity would take. */
export function rideDurationFromTss(plannedTss: number, type: string): number {
  const tss = Math.max(0, Number(plannedTss) || 0);
  if (tss === 0) return 0;
  const factor = intensityFor(type);
  return Math.round((tss / (factor * factor)) * 0.6);
}

/** The same relationship read the other way. */
export function rideTssFromDuration(minutes: number, type: string): number {
  const mins = Math.max(0, Number(minutes) || 0);
  const factor = intensityFor(type);
  return Math.round((mins / 60) * factor * factor * 100);
}

/**
 * Minutes per set when there is no history to go on.
 *
 * Calibrated against this athlete's own logged sessions rather than picked: their
 * three routines run 2.55, 2.61 and 2.94 minutes per set of wall-clock time. A set
 * itself takes well under a minute, so most of this is rest and setup.
 */
export const MIN_PER_SET_FALLBACK = 2.7;

export interface GymDurationEstimate {
  minutes: number;
  source: 'history' | 'structure' | 'default';
  /** How many past sessions the history estimate is based on. */
  samples: number;
}

/**
 * How long this routine takes this athlete.
 *
 * Their own past sessions of the same routine are by far the best predictor and are
 * remarkably consistent - PUSH ran 42, 43, 46 and 51 minutes, PULL 39 to 43 - so the
 * median of recent sessions is used where it exists. Set count is the fallback, and
 * a flat hour only when there is neither.
 */
export function estimateGymDuration(
  pastDurationsMinutes: number[] | null | undefined,
  totalSets?: number | null
): GymDurationEstimate {
  const clean = (pastDurationsMinutes ?? [])
    .filter(m => Number.isFinite(m) && m > 5 && m < 300)
    .sort((a, b) => a - b);

  if (clean.length > 0) {
    const mid = Math.floor(clean.length / 2);
    const median = clean.length % 2 === 1 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
    return { minutes: Math.round(median), source: 'history', samples: clean.length };
  }

  const sets = Number(totalSets);
  if (Number.isFinite(sets) && sets > 0) {
    return { minutes: Math.round(sets * MIN_PER_SET_FALLBACK), source: 'structure', samples: 0 };
  }

  return { minutes: 60, source: 'default', samples: 0 };
}

/** Sets across every exercise in a Kratos template, for the structural fallback. */
export function countTemplateSets(exercises: any): number {
  if (!Array.isArray(exercises)) return 0;
  return exercises.reduce(
    (sum, ex) => sum + (Array.isArray(ex?.sets) ? ex.sets.length : 0),
    0
  );
}

/**
 * Pace to plan a run at, in minutes per kilometre.
 *
 * Only ever the athlete's own median when they have run: a default pace presented as
 * if it were theirs would be a fabricated number driving a calorie target. The source
 * is returned so the UI can say which it is.
 */
export const DEFAULT_RUN_PACE_MIN_PER_KM = 6.5;

export function resolveRunPace(
  pastPacesMinPerKm: (number | null | undefined)[] | null | undefined
): { paceMinPerKm: number; source: 'history' | 'default'; samples: number } {
  const clean = (pastPacesMinPerKm ?? [])
    // null and '' must not reach Number(), which turns both into 0 - and a 0 pace
    // would sail through a > 0 test on the other side of the conversion.
    .filter(p => p !== null && p !== undefined && (p as any) !== '')
    .map(p => Number(p))
    .filter(p => Number.isFinite(p) && p >= 2 && p <= 15)
    .sort((a, b) => a - b);

  if (clean.length === 0) {
    return { paceMinPerKm: DEFAULT_RUN_PACE_MIN_PER_KM, source: 'default', samples: 0 };
  }
  const mid = Math.floor(clean.length / 2);
  const median = clean.length % 2 === 1 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
  return { paceMinPerKm: median, source: 'history', samples: clean.length };
}

export function estimateRunDuration(distanceKm: number, paceMinPerKm: number): number {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) return 0;
  return Math.round(km * paceMinPerKm);
}

/** "6:30 /km" from 6.5. */
export function formatPace(paceMinPerKm: number): string {
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  const carry = secs === 60;
  return `${mins + (carry ? 1 : 0)}:${String(carry ? 0 : secs).padStart(2, '0')} /km`;
}
