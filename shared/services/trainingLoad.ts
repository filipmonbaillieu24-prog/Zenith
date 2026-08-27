import type { SupabaseClient } from '@supabase/supabase-js';
import { toDateKey } from '../dateKey';

/**
 * Same heuristic Zenith Hub's PMC uses to fold a Kratos strength session
 * into the shared training-load pool (see
 * apps/zenith-hub/src/pages/hub/ZenithHubPage.tsx). Duplicated here as
 * constants — Hub's copy is app-local — so any other consumer (Vigor's ACWR
 * forecaster) stays in lockstep with Hub's numbers instead of inventing its
 * own scale.
 */
export const KRATOS_STSS_VOLUME_SCALAR = 0.012; // kg lifted (sets*reps*weight) -> "strength TSS"
export const KRATOS_STSS_MIN = 15; // floor so any completed session registers some load
export const KRATOS_STSS_MAX = 80; // ceiling so one huge-volume day doesn't dominate

export function estimateKratosSessionLoad(volume: number): number {
  return Math.min(KRATOS_STSS_MAX, Math.max(KRATOS_STSS_MIN, Math.round(volume * KRATOS_STSS_VOLUME_SCALAR)));
}

// ── Effort weighting (reps in reserve) ───────────────────────────────────────
//
// Raw tonnage - sets x reps x weight - is what Kratos stores as `volume`, and
// until now it was the ONLY thing every downstream model knew about a gym
// session. Tonnage measures kilos moved, not how hard the session was, and on
// real logged data the two come apart badly: across this athlete's sessions the
// correlation between tonnage and mean RIR is +0.66, meaning the sessions with
// the MOST tonnage were consistently the EASIEST ones. Their heaviest session on
// record by tonnage (9,505 kg) had one working set out of twelve taken anywhere
// near failure; a lighter arms session with nine hard sets was charged as the
// easier of the two.
//
// The reason is that tonnage is dominated by whichever exercise uses the largest
// absolute load. One machine exercise at 100 kg contributed 54% of a session's
// tonnage while a genuinely brutal set of curls near failure contributed 2%.
//
// Kratos has always recorded reps-in-reserve per set. This is where that finally
// gets used.

/** RIR assumed for a set that has none recorded - Kratos's own default. */
export const RIR_DEFAULT = 2;

/**
 * Fatigue cost of a working set relative to the same set taken to failure.
 *
 * Linear in RIR with a floor: a set left 5+ reps short still costs something
 * (you did move the weight) but nothing like one taken to failure.
 *   RIR 0 -> 1.00   RIR 1 -> 0.83   RIR 2 -> 0.66
 *   RIR 3 -> 0.49   RIR 4 -> 0.32   RIR 5+ -> 0.20
 */
export function rirEffortFactor(rir: unknown): number {
  // null and '' must be rejected BEFORE Number(), which turns both into 0 - and 0
  // is a perfectly valid RIR meaning "taken to failure". A set with no RIR
  // recorded would otherwise be charged as the single most costly kind there is.
  const missing = rir === null || rir === undefined || rir === '';
  const r = missing ? NaN : Number(rir);
  const safe = Number.isFinite(r) ? Math.max(0, r) : RIR_DEFAULT;
  return Math.max(0.2, Math.min(1, 1 - 0.17 * safe));
}

/**
 * Fraction of a session's tonnage that represents real, near-failure work.
 *
 * Returns a dimensionless 0.2..1.0 multiplier rather than a kg figure so callers
 * can apply it to the session's STORED `volume`. That matters: stored volume
 * folds in bodyweight for bodyweight exercises, which the per-set `weight` field
 * does not, so recomputing kg from the set list would quietly under-count pull-ups
 * and dips. Weighting the stored figure keeps that handling intact.
 *
 * Warm-up sets are excluded, exactly as they are from stored volume.
 */
export function kratosSessionEffortRatio(sets: unknown): number {
  let weighted = 0;
  let plain = 0;

  if (Array.isArray(sets)) {
    for (const exercise of sets as any[]) {
      const setList = exercise?.sets;
      if (!Array.isArray(setList)) continue;
      for (const set of setList) {
        if (set?.type !== 'working') continue;
        const reps = Number(set?.reps);
        const weight = Number(set?.weight);
        if (!Number.isFinite(reps) || !Number.isFinite(weight)) continue;
        // A bodyweight set stores weight 0 (the bodyweight lives in the session
        // total). Its effort still counts, so fall back to reps as the tonnage
        // proxy for the purpose of the weighted AVERAGE - the ratio is scale-free.
        const setTonnage = weight > 0 ? reps * weight : reps;
        if (setTonnage <= 0) continue;
        plain += setTonnage;
        weighted += setTonnage * rirEffortFactor(set?.rir);
      }
    }
  }

  // No usable set detail (an old row, or a workout saved before RIR existed):
  // treat it as an ordinary moderate session rather than assuming the extreme in
  // either direction.
  if (plain <= 0) return rirEffortFactor(RIR_DEFAULT);
  return weighted / plain;
}

/**
 * A gym session's load in "effort kg" - its stored tonnage discounted by how far
 * from failure the work actually was. This is what recovery and fatigue models
 * should consume in place of raw `volume`.
 */
export function kratosEffortVolume(volume: unknown, sets: unknown): number {
  const kg = Number(volume);
  if (!Number.isFinite(kg) || kg <= 0) return 0;
  return kg * kratosSessionEffortRatio(sets);
}

/** Effort-weighted equivalent of estimateKratosSessionLoad. */
export function estimateKratosSessionLoadFromSets(volume: unknown, sets: unknown): number {
  const effort = kratosEffortVolume(volume, sets);
  if (effort <= 0) return 0;
  return estimateKratosSessionLoad(effort);
}

export interface DailyTrainingLoad {
  date: string; // YYYY-MM-DD (local calendar day, see shared/dateKey.ts)
  stepsLoad: number; // steps/100
  kratosVolume: number; // raw kg volume lifted that day (sets*reps*weight)
  kratosEffortVolume: number; // kratosVolume discounted by reps in reserve - what recovery/fatigue models read
  kratosLoad: number; // estimateKratosSessionLoad(kratosEffortVolume)
  cardioTss: number; // Aero rides.metadata.tss/hrTSS that day
  load: number; // blended total = stepsLoad + kratosLoad + cardioTss
}

// Local calendar day, matching shared/pmc.ts and every other day-bucketed
// series in the ecosystem. This was previously a UTC key, which put a day's
// training load in a different bucket than that same day's PMC point for any
// user not at UTC+0 - joins between the two silently missed.
const dateKeyOf = (ms: number): string => toDateKey(ms);

/**
 * Blends daily steps, Kratos strength sessions, and Aero rides into one
 * daily training-load series for the last `days` days — real cross-app
 * training stress, not just a steps proxy.
 *
 * Returns a per-source breakdown (not just the blended total) so callers
 * needing an isolated signal — e.g. the shared recoveryModel, which wants
 * cardio-only TSB/ATL plus gym volume as separate inputs to avoid
 * double-counting Kratos — can derive it from this same single fetch
 * instead of querying again.
 *
 * Intended primarily for AcwrForecaster.calculateWorkloadInsight() (wants
 * ~28 days of the blended `load`) and for feeding the recoveryModel's
 * cardio/gym-volume inputs.
 */
export async function fetchRecentDailyTrainingLoads(
  supabase: SupabaseClient,
  userId: string,
  days: number = 28
): Promise<DailyTrainingLoad[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  const stepsByDay = new Map<string, number>();
  const kratosVolumeByDay = new Map<string, number>();
  const kratosEffortByDay = new Map<string, number>();
  const cardioByDay = new Map<string, number>();
  const addTo = (map: Map<string, number>, dateKey: string | null, amount: number) => {
    if (!dateKey || !Number.isFinite(amount) || amount <= 0) return;
    map.set(dateKey, (map.get(dateKey) ?? 0) + amount);
  };

  const [stepsRes, kratosRes, ridesRes] = await Promise.all([
    supabase
      .from('vigor_steps')
      .select('step_count, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', sinceISO),
    supabase
      .from('kratos_workouts')
      // `sets` carries the per-set reps-in-reserve the effort weighting needs.
      .select('volume, sets, completed_at')
      .eq('user_id', userId)
      .gte('completed_at', sinceISO),
    supabase
      .from('rides')
      .select('date, metadata')
      .eq('user_id', userId)
      .gte('date', since.getTime())
  ]);

  (stepsRes.data || []).forEach((s: any) => {
    if (typeof s.step_count === 'number' && s.logged_at) {
      addTo(stepsByDay, dateKeyOf(new Date(s.logged_at).getTime()), s.step_count / 100);
    }
  });

  (kratosRes.data || []).forEach((k: any) => {
    if (k.completed_at && k.volume) {
      const key = dateKeyOf(new Date(k.completed_at).getTime());
      addTo(kratosVolumeByDay, key, Number(k.volume));
      addTo(kratosEffortByDay, key, kratosEffortVolume(k.volume, k.sets));
    }
  });

  (ridesRes.data || []).forEach((r: any) => {
    let metadata = r.metadata;
    if (typeof metadata === 'string') {
      try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
    }
    const tss = Number(metadata?.tss ?? metadata?.hrTSS ?? 0);
    if (tss > 0 && typeof r.date === 'number') {
      addTo(cardioByDay, dateKeyOf(r.date), tss);
    }
  });

  const result: DailyTrainingLoad[] = [];
  const cursor = new Date(since);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (cursor <= today) {
    // toDateKey, not toISOString - every map above is keyed by LOCAL day. Reading
    // them back with a UTC key silently shifted the whole series by a day
    // depending on what time of day the page happened to load.
    const key = toDateKey(cursor.getTime());
    const stepsLoad = Math.round((stepsByDay.get(key) ?? 0) * 10) / 10;
    const kratosVolume = Math.round(kratosVolumeByDay.get(key) ?? 0);
    const kratosEffort = Math.round(kratosEffortByDay.get(key) ?? 0);
    // Load comes off the EFFORT figure: an easy high-tonnage session used to be
    // charged to fitness and fatigue as though it had been taken to failure.
    const kratosLoad = kratosEffort > 0 ? estimateKratosSessionLoad(kratosEffort) : 0;
    const cardioTss = Math.round(cardioByDay.get(key) ?? 0);
    result.push({
      date: key,
      stepsLoad,
      kratosVolume,
      kratosEffortVolume: kratosEffort,
      kratosLoad,
      cardioTss,
      load: Math.round((stepsLoad + kratosLoad + cardioTss) * 10) / 10
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
