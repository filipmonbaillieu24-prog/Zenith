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
