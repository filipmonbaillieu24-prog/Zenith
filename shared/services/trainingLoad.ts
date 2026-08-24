import type { SupabaseClient } from '@supabase/supabase-js';

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

export interface DailyTrainingLoad {
  date: string; // YYYY-MM-DD (UTC calendar day)
  stepsLoad: number; // steps/100
  kratosVolume: number; // raw kg volume lifted that day (sets*reps*weight)
  kratosLoad: number; // estimateKratosSessionLoad(kratosVolume)
  cardioTss: number; // Aero rides.metadata.tss/hrTSS that day
  load: number; // blended total = stepsLoad + kratosLoad + cardioTss
}

const dateKeyOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

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
      .select('volume, completed_at')
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
      addTo(kratosVolumeByDay, dateKeyOf(new Date(k.completed_at).getTime()), Number(k.volume));
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
    const key = cursor.toISOString().slice(0, 10);
    const stepsLoad = Math.round((stepsByDay.get(key) ?? 0) * 10) / 10;
    const kratosVolume = Math.round(kratosVolumeByDay.get(key) ?? 0);
    const kratosLoad = kratosVolume > 0 ? estimateKratosSessionLoad(kratosVolume) : 0;
    const cardioTss = Math.round(cardioByDay.get(key) ?? 0);
    result.push({
      date: key,
      stepsLoad,
      kratosVolume,
      kratosLoad,
      cardioTss,
      load: Math.round((stepsLoad + kratosLoad + cardioTss) * 10) / 10
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
