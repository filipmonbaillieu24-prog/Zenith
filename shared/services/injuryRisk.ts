import type { Severity } from './soreness';
import { SORENESS_GROUPS } from './soreness';

/**
 * Training-load risk, as the rule it has always actually been.
 *
 * ## What this replaces
 *
 * There was an eight-input neural network here. It could not learn anything, for
 * three separate reasons:
 *
 *  1. Its training target was `acwr > 1.5 || acwr < 0.5`, computed from CTL and ATL
 *     - which are its own inputs. Six of the eight features were functions of those
 *     same two numbers (TSB is CTL-ATL, the fatigue proxy is (ATL-CTL)/50, the
 *     illness proxy is a threshold on the ratio). A network fitted to a threshold
 *     rule over its own inputs cannot beat the rule. It can only approximate it less
 *     exactly, and it did.
 *
 *  2. The two features that DID carry outside information - daily steps and recent
 *     gym volume - were passed at training time only as their defaults, zero. So the
 *     model never saw a non-zero value in those slots, yet prediction fed it live
 *     ones. Their weights were untrained priors applied to data the model had never
 *     been shown.
 *
 *  3. `trainInjuryModel` takes an `actualInjuryOccurred` flag, and no table in the
 *     database has ever recorded an injury. The one path that could have taught it
 *     something real was never called with a real outcome.
 *
 * ## Why more feedback would not have fixed it
 *
 * Readiness and soreness became learnable by asking daily - a year gives 365
 * observations. Injuries are rare. One athlete produces maybe one or two a year, and
 * no per-athlete classifier learns from two positive examples. Collecting injury
 * outcomes is worth doing for other reasons, but it would not have rescued this
 * model, and pretending otherwise would just have deferred the problem.
 *
 * ## What is here instead
 *
 * The acute:chronic workload ratio, applied directly and labelled as what it is: a
 * workload guideline from the training-load literature, not a personalised
 * prediction. Same information, no approximation error, no drift, and it says where
 * the number came from.
 *
 * Plus one thing the network never had: a soreness that will not go away. That IS
 * frequent enough to observe, it is the closest thing to an early warning an app can
 * actually collect, and the data now exists (see soreness.ts).
 */

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface LoadRiskAssessment {
  /** Acute:chronic workload ratio. Null when there is no chronic base to divide by. */
  acwr: number | null;
  level: RiskLevel;
  headline: string;
  detail: string;
  /** A muscle sore for several days running, if any. */
  persistentSoreness: { slug: string; label: string; days: number } | null;
}

/**
 * Below this CTL there is no meaningful chronic base, and the ratio says nothing.
 * Dividing a normal week by a near-zero base produces an enormous number that means
 * only "this athlete does not usually do this", which is not the same as risk.
 */
const MEANINGFUL_CTL = 15;

/**
 * How many days of continuous soreness in one place stops being training and starts
 * being worth attention. Ordinary DOMS from a hard session clears in two to three
 * days; past four in the same muscle is a different pattern.
 */
export const PERSISTENT_SORENESS_DAYS = 4;

/**
 * Finds a muscle reported sore on most of the recent days.
 *
 * `sorenessByDate` is the map from fetchSoreness - local day to muscle/severity.
 * Days with no check-in are skipped rather than counted as not-sore, so a gap in
 * logging cannot break a streak that is really there.
 */
export function findPersistentSoreness(
  sorenessByDate: Record<string, { groups: Record<string, Severity> }>,
  windowDays = 7
): { slug: string; label: string; days: number } | null {
  const dates = Object.keys(sorenessByDate).sort().slice(-windowDays);
  if (dates.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const d of dates) {
    for (const slug of Object.keys(sorenessByDate[d]?.groups ?? {})) {
      counts[slug] = (counts[slug] ?? 0) + 1;
    }
  }

  let worstSlug: string | null = null;
  let worstDays = 0;
  for (const [slug, n] of Object.entries(counts)) {
    if (n > worstDays) { worstDays = n; worstSlug = slug; }
  }

  if (worstSlug === null || worstDays < PERSISTENT_SORENESS_DAYS) return null;
  const label = SORENESS_GROUPS.find(g => g.slug === worstSlug)?.label ?? worstSlug;
  return { slug: worstSlug, label, days: worstDays };
}

export function assessLoadRisk(
  ctl: number,
  atl: number,
  sorenessByDate?: Record<string, { groups: Record<string, Severity> }>
): LoadRiskAssessment {
  const persistentSoreness = sorenessByDate ? findPersistentSoreness(sorenessByDate) : null;

  const base: Omit<LoadRiskAssessment, 'acwr' | 'level' | 'headline' | 'detail'> = { persistentSoreness };

  if (!Number.isFinite(ctl) || !Number.isFinite(atl) || ctl < MEANINGFUL_CTL) {
    // No chronic base to compare against. Say so rather than dividing by almost
    // nothing and reporting the enormous number that falls out.
    return {
      ...base,
      acwr: null,
      level: persistentSoreness ? 'moderate' : 'low',
      headline: persistentSoreness ? 'Watch that niggle' : 'Not enough training history',
      detail: persistentSoreness
        ? `Your ${persistentSoreness.label.toLowerCase()} has been sore on ${persistentSoreness.days} of the last 7 days. Ordinary soreness clears in two or three; this is worth easing off on.`
        : 'Your training load is too low to compare a hard week against a normal one. This starts working once you have a few consistent weeks behind you.'
    };
  }

  const acwr = Math.round((atl / ctl) * 100) / 100;

  // The bands are from the training-load literature: comfortably inside 0.8-1.3 is
  // the range these ratios are usually held in, and both a sharp spike and a sharp
  // drop are associated with higher injury rates.
  let level: RiskLevel = 'low';
  let headline = 'Workload is in a sensible range';
  let detail = `You are training about ${Math.round(acwr * 100)}% of what you are used to. That is the range to stay in.`;

  if (acwr > 1.5) {
    level = 'high';
    headline = 'Sharp jump in workload';
    detail = `This week is ${Math.round(acwr * 100)}% of your usual load. Ramping this fast is where injuries cluster - back off or hold steady rather than adding more.`;
  } else if (acwr > 1.3) {
    level = 'moderate';
    headline = 'Building faster than usual';
    detail = `This week is ${Math.round(acwr * 100)}% of your usual load. Fine for a planned overload week, worth watching if it was not planned.`;
  } else if (acwr < 0.5) {
    level = 'moderate';
    headline = 'Workload has dropped sharply';
    detail = `This week is only ${Math.round(acwr * 100)}% of your usual load. Fitness decays, and coming back at the old volume after a gap is its own risk - rebuild gradually.`;
  }

  // A niggle that will not clear outranks a comfortable ratio. The ratio describes
  // the training; this describes the athlete.
  if (persistentSoreness && level === 'low') {
    level = 'moderate';
    headline = 'Workload fine, but watch that niggle';
    detail = `${detail} Your ${persistentSoreness.label.toLowerCase()} has been sore on ${persistentSoreness.days} of the last 7 days though - ordinary soreness clears in two or three.`;
  } else if (persistentSoreness) {
    detail = `${detail} Your ${persistentSoreness.label.toLowerCase()} has also been sore on ${persistentSoreness.days} of the last 7 days.`;
  }

  return { ...base, acwr, level, headline, detail };
}
