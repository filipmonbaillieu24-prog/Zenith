import type { SupabaseClient } from '@supabase/supabase-js';
import { toDateKeyFromDate } from '../dateKey';

/**
 * How the athlete says they actually feel, and the only real feedback the recovery
 * model has.
 *
 * Every other target in that model is a formula computed from the model's own
 * inputs - recoveryHeuristic weighs sleep, cardio freshness and gym load, and the
 * network is then trained to reproduce it. A network fitted to a formula over its
 * own inputs cannot beat the formula. It can only approximate it less exactly,
 * while adding drift, storage and the appearance of having learned something.
 *
 * One honest observation a day changes that. The heuristic stays the default for
 * days with no answer, so it still governs early on when there is nothing else;
 * as answers accumulate they become the majority of the training set on their own,
 * and the model starts describing where THIS athlete departs from the average
 * rather than restating the average back to them.
 */

/** 1 wrecked … 5 flying. */
export type FeltRating = 1 | 2 | 3 | 4 | 5;

export interface ReadinessEntry {
  local_date: string;
  felt: FeltRating;
  predicted_score: number | null;
  note?: string | null;
}

export const FELT_LABELS: Record<FeltRating, string> = {
  1: 'Wrecked',
  2: 'Flat',
  3: 'OK',
  4: 'Good',
  5: 'Flying'
};

export const FELT_DESCRIPTIONS: Record<FeltRating, string> = {
  1: 'Nothing in the tank',
  2: 'Could train, would rather not',
  3: 'Normal day',
  4: 'Ready for a hard session',
  5: 'Best I have felt in a while'
};

/**
 * Five options, not a slider.
 *
 * People cannot honestly distinguish 63 from 68 about their own state, and a scale
 * that pretends they can collects noise dressed as precision. Five is about the
 * limit of what a person can report consistently about how they feel.
 */
export const FELT_OPTIONS: FeltRating[] = [1, 2, 3, 4, 5];

/**
 * The 0..1 target a felt rating implies, aligned with how the dashboard labels the
 * score: below 50 reads as fatigue, 80 and above as well recovered.
 */
const FELT_TO_TARGET: Record<FeltRating, number> = {
  1: 0.15,
  2: 0.38,
  3: 0.60,
  4: 0.80,
  5: 0.95
};

export function feltToTarget(felt: number): number | null {
  const f = Math.round(Number(felt));
  if (!(f in FELT_TO_TARGET)) return null;
  return FELT_TO_TARGET[f as FeltRating];
}

/** Reads the last `days` of answers, keyed by local calendar day. */
export async function fetchReadiness(
  supabase: SupabaseClient,
  userId: string,
  days = 60
): Promise<Record<string, ReadinessEntry>> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('vigor_readiness')
    .select('local_date, felt, predicted_score, note')
    .eq('user_id', userId)
    .gte('local_date', toDateKeyFromDate(since));

  if (error || !data) return {};

  const byDate: Record<string, ReadinessEntry> = {};
  for (const row of data as any[]) {
    if (row?.local_date) byDate[row.local_date] = row as ReadinessEntry;
  }
  return byDate;
}

/**
 * Records how today felt.
 *
 * predictedScore is stored alongside deliberately. The residual - how far the model
 * was out - cannot be reconstructed later, because the inputs keep moving through
 * the day and a recomputation would not be the number the athlete was reacting to.
 */
export async function saveReadiness(
  supabase: SupabaseClient,
  userId: string,
  felt: FeltRating,
  predictedScore: number | null,
  date: Date = new Date(),
  note?: string
): Promise<boolean> {
  const { error } = await supabase
    .from('vigor_readiness')
    .upsert({
      user_id: userId,
      local_date: toDateKeyFromDate(date),
      felt,
      predicted_score: predictedScore === null ? null : Math.round(predictedScore),
      note: note ?? null
    }, { onConflict: 'user_id,local_date' });

  return !error;
}

/**
 * What the answers say about the model, once there are enough of them to say
 * anything.
 *
 * Reports the average gap between what the model predicted and what the athlete
 * reported, in score points. A positive bias means the model reads high - it keeps
 * calling them fresher than they feel.
 */
export function summariseAccuracy(entries: ReadinessEntry[]): {
  n: number;
  meanBias: number | null;
  meanAbsError: number | null;
} {
  const paired = entries.filter(
    e => e.predicted_score !== null && e.predicted_score !== undefined && feltToTarget(e.felt) !== null
  );
  if (paired.length < 5) return { n: paired.length, meanBias: null, meanAbsError: null };

  let bias = 0;
  let abs = 0;
  for (const e of paired) {
    const felt = (feltToTarget(e.felt) as number) * 100;
    const diff = (e.predicted_score as number) - felt;
    bias += diff;
    abs += Math.abs(diff);
  }
  return {
    n: paired.length,
    meanBias: Math.round(bias / paired.length),
    meanAbsError: Math.round(abs / paired.length)
  };
}
