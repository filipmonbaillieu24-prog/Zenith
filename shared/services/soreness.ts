import type { SupabaseClient } from '@supabase/supabase-js';
import { toDateKeyFromDate } from '../dateKey';

/**
 * Muscle soreness, per day, per muscle group.
 *
 * Readiness (see readiness.ts) asks how the whole athlete feels. Soreness is local,
 * and for someone who lifts it is the signal that decides whether today's session
 * should go heavy. Weekly tonnage cannot tell a fresh chest from one still wrecked
 * from Monday, and until now nothing in the ecosystem recorded the difference - the
 * only subjective figure in the entire database was a running RPE.
 *
 * What this deliberately is NOT: a model input dressed up as one. Soreness feeds a
 * stated, visible rule that reduces the suggested weight for exercises hitting a
 * sore muscle, and the athlete is told the rule applied and why. Once enough days
 * accumulate it can become a real input to the autoregulation model, whose target -
 * achieved e1RM - is genuine feedback. Until there is data to justify that, a rule
 * that says what it does beats a network that has learned nothing.
 */

export type Severity = 1 | 2 | 3;

export const SEVERITY_LABELS: Record<Severity, string> = {
  1: 'Mild',
  2: 'Moderate',
  3: 'Severe'
};

export const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  1: 'Aware of it, moves fine',
  2: 'Noticeable through the warm-up',
  3: 'Limits how I move'
};

export interface SorenessGroup {
  slug: string;
  label: string;
}

/**
 * The groups worth asking about.
 *
 * A curated subset of the 32 slugs in MuscleMapPaths - that list includes head,
 * hair, hands and ankles, which nobody reports lifting soreness for. Slugs are kept
 * verbatim so this can drive the existing anatomical heatmap directly.
 */
export const SORENESS_GROUPS: SorenessGroup[] = [
  { slug: 'chest', label: 'Chest' },
  { slug: 'upperBack', label: 'Upper back' },
  { slug: 'lowerBack', label: 'Lower back' },
  { slug: 'deltoids', label: 'Shoulders' },
  { slug: 'biceps', label: 'Biceps' },
  { slug: 'triceps', label: 'Triceps' },
  { slug: 'forearm', label: 'Forearms' },
  { slug: 'abs', label: 'Abs' },
  { slug: 'quadriceps', label: 'Quads' },
  { slug: 'hamstring', label: 'Hamstrings' },
  { slug: 'gluteal', label: 'Glutes' },
  { slug: 'calves', label: 'Calves' }
];

export interface SorenessEntry {
  local_date: string;
  groups: Record<string, Severity>;
}

/** Reads the last `days` of check-ins, keyed by local calendar day. */
export async function fetchSoreness(
  supabase: SupabaseClient,
  userId: string,
  days = 30
): Promise<Record<string, SorenessEntry>> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('vigor_soreness')
    .select('local_date, groups')
    .eq('user_id', userId)
    .gte('local_date', toDateKeyFromDate(since));

  if (error || !data) return {};

  const byDate: Record<string, SorenessEntry> = {};
  for (const row of data as any[]) {
    if (row?.local_date) {
      byDate[row.local_date] = { local_date: row.local_date, groups: row.groups || {} };
    }
  }
  return byDate;
}

export async function saveSoreness(
  supabase: SupabaseClient,
  userId: string,
  groups: Record<string, Severity>,
  date: Date = new Date()
): Promise<boolean> {
  const { error } = await supabase
    .from('vigor_soreness')
    .upsert({
      user_id: userId,
      local_date: toDateKeyFromDate(date),
      groups
    }, { onConflict: 'user_id,local_date' });

  return !error;
}

/**
 * How much to hold back on an exercise, given how sore the muscles it works are.
 *
 * Returns a multiplier applied to the suggested weight, and the reason to show for
 * it. A stated rule, not a learned one - so the numbers are here in the open where
 * they can be argued with:
 *
 *   mild     -> 97%   barely a change; you can usually train through it
 *   moderate -> 92%   enough to matter, not enough to skip
 *   severe   -> 85%   train, but do not try to progress on it today
 *
 * Secondary muscles count for half, because an exercise that merely involves a sore
 * muscle is not the same as one built around it. The worst affected muscle sets the
 * result rather than an average - a wrecked chest is not offset by fresh triceps.
 */
const SEVERITY_MULTIPLIER: Record<Severity, number> = {
  1: 0.97,
  2: 0.92,
  3: 0.85
};

export interface SorenessAdjustment {
  multiplier: number;
  /** Null when nothing relevant is sore. */
  reason: string | null;
  worstSlug: string | null;
  worstSeverity: Severity | null;
}

export function sorenessAdjustment(
  soreness: Record<string, Severity> | undefined | null,
  primaryMuscle?: string | null,
  secondaryMuscles?: string[] | null
): SorenessAdjustment {
  const none: SorenessAdjustment = { multiplier: 1, reason: null, worstSlug: null, worstSeverity: null };
  if (!soreness || Object.keys(soreness).length === 0) return none;

  // Tracked as one object rather than three separate lets: assigning them inside a
  // closure defeats TypeScript's narrowing, and the alternative is a cast that
  // asserts away exactly the null case worth being sure about.
  let worst: { multiplier: number; slug: string; severity: Severity } | null = null;

  const consider = (slug: string | null | undefined, weight: number) => {
    if (!slug) return;
    const severity = soreness[slug];
    if (!severity || !(severity in SEVERITY_MULTIPLIER)) return;
    // Half effect for a secondary muscle: 0.92 becomes 0.96, not 0.92.
    const multiplier = 1 - (1 - SEVERITY_MULTIPLIER[severity]) * weight;
    if (worst === null || multiplier < worst.multiplier) {
      worst = { multiplier, slug, severity };
    }
  };

  consider(primaryMuscle, 1);
  for (const m of secondaryMuscles ?? []) consider(m, 0.5);

  if (worst === null) return none;
  const hit: { multiplier: number; slug: string; severity: Severity } = worst;

  const label = SORENESS_GROUPS.find(g => g.slug === hit.slug)?.label ?? hit.slug;
  const pct = Math.round((1 - hit.multiplier) * 100);
  return {
    multiplier: hit.multiplier,
    reason: pct > 0
      ? `Held back ${pct}% — you said your ${label.toLowerCase()} is ${SEVERITY_LABELS[hit.severity].toLowerCase()}ly sore`
      : null,
    worstSlug: hit.slug,
    worstSeverity: hit.severity
  };
}

/**
 * Whole-body soreness on 0..1, for anything that wants one number.
 *
 * Averaged over the groups reported sore rather than over all twelve: one severely
 * sore muscle out of twelve is a real signal, and dividing it by twelve would erase
 * it. Scaled so three severe groups reads as fully sore.
 */
export function overallSoreness(groups: Record<string, Severity> | undefined | null): number {
  if (!groups) return 0;
  const values = Object.values(groups).filter(v => v >= 1 && v <= 3);
  if (values.length === 0) return 0;
  const total = values.reduce((sum, v) => sum + v, 0);
  return Math.max(0, Math.min(1, total / 9));
}
