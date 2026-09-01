/**
 * Heart Rate Variability (HRV) Autonomic Nervous System (ANS) State & CNS Fatigue Tracker.
 * Normalizes daily rMSSD values to detect sympathovagal tone shift, CNS fatigue, or training readiness.
 *
 * This was scaling an athlete's lifting targets to 0.8x off a duplicated database row.
 *
 * Health Connect sync had been filing one night's sleep under two dates, so the same
 * rMSSD appeared twice, and a stale night landed on today. The z-score then did the
 * rest of the damage on its own: a history of [159, 160, 161, 160, 159] has a standard
 * deviation under 1 ms, which the old floor of 1.5 barely raised, so a reading of 54.7
 * scored roughly -70 standard deviations. Nothing about "-70" is a physiological
 * statement - it is what happens when you divide by a number that small.
 *
 * The sync bug is fixed at source (see shared/22_sleep_night_date.sql), but the shape
 * of the arithmetic is what turned a data glitch into a training instruction, so the
 * guards below matter independently:
 *
 *   - a repeated reading is dropped rather than treated as confirmation
 *   - the spread floor scales with the athlete's own mean, not a fixed 1.5 ms
 *   - a swing too large to be physiological is reported as a suspect reading rather
 *     than acted on
 *   - more than three days are required before any of this speaks at all
 */

export interface AnsState {
  zScore: number;
  tone: 'sympathetic' | 'balanced' | 'parasympathetic';
  insight: string;
  intensityMultiplier: number;
  calorieAdjustmentMultiplier: number;
}

/** Nights of usable history before a baseline means anything. */
export const MIN_BASELINE_NIGHTS = 7;

/**
 * Night-to-night rMSSD moves; a swing beyond this is a measurement change.
 *
 * Genuine overnight drops of 30-40% happen - illness, alcohol, a hard session. Ratios
 * beyond this one do not: they mark a changed source, a units difference, or a stuck
 * record. Treating those as CNS fatigue is how a sync bug became a deload.
 */
export const IMPLAUSIBLE_SWING_RATIO = 0.5;

/** Collapse runs of identical readings; a repeat is a copy, not a confirmation. */
function withoutRepeats(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (out.length === 0 || out[out.length - 1] !== v) out.push(v);
  }
  return out;
}

export class HrvAnsTracker {
  /**
   * Calculates the Z-score and ANS autonomic tone for a given daily HRV reading
   * based on a rolling history of HRV values (rMSSD in ms).
   */
  public static calculateAnsState(
    hrvHistory: number[], // list of previous rMSSD values (last 7-14 days)
    todayHrv: number // today's rMSSD value
  ): AnsState {
    const balanced = (insight: string): AnsState => ({
      zScore: 0,
      tone: 'balanced',
      insight,
      intensityMultiplier: 1.0,
      calorieAdjustmentMultiplier: 1.0
    });

    const history = withoutRepeats(
      (hrvHistory ?? []).filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0)
    );
    const today = Number(todayHrv);

    if (!Number.isFinite(today) || today <= 0) {
      return balanced('No HRV reading for today yet.');
    }

    if (history.length < MIN_BASELINE_NIGHTS) {
      return balanced(
        `Establishing HRV baseline — ${history.length} of ${MIN_BASELINE_NIGHTS} nights. Keep logging wearable metrics.`
      );
    }

    const mean = history.reduce((sum, val) => sum + val, 0) / history.length;

    // A reading this far from the athlete's own baseline is far more likely to be a
    // different sensor, a different unit, or a repeated row than a real overnight
    // change. Say so, and change nothing.
    if (mean > 0 && Math.abs(today - mean) / mean > IMPLAUSIBLE_SWING_RATIO) {
      return balanced(
        `Today's HRV (${today.toFixed(0)} ms) is too far from your ${Math.round(mean)} ms baseline to trust — `
        + 'check the wearable is syncing the same measurement. Training targets left unscaled.'
      );
    }

    const variance = history.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / history.length;
    // Floor the spread against the athlete's own scale. A fixed 1.5 ms floor meant a
    // steady sleeper had a divisor near zero, and every ordinary fluctuation became a
    // double-digit z-score.
    const stdDev = Math.max(Math.sqrt(variance), mean * 0.05, 3);

    const zScore = parseFloat(((today - mean) / stdDev).toFixed(2));

    let tone: 'sympathetic' | 'balanced' | 'parasympathetic' = 'balanced';
    let insight = 'Balanced sympathovagal tone. Ready for scheduled training.';
    let intensityMultiplier = 1.0;
    let calorieAdjustmentMultiplier = 1.0;

    if (zScore < -1.5) {
      tone = 'sympathetic';
      insight = '⚡ Sympathetic Overdrive / CNS Fatigue: HRV is significantly below baseline. Recommended deload workout; focus on recovery protocols.';
      intensityMultiplier = 0.80; // deload intensity by 20%
      calorieAdjustmentMultiplier = 1.05; // boost calories by 5% for recovery tissue repair
    } else if (zScore > 1.0) {
      tone = 'parasympathetic';
      insight = '🟢 Parasympathetic Readiness: HRV is elevated. PR Window is open. Ready for peak capacity or high-intensity workloads.';
      intensityMultiplier = 1.05; // open up for extra capacity
      calorieAdjustmentMultiplier = 1.00;
    }

    return {
      zScore,
      tone,
      insight,
      intensityMultiplier,
      calorieAdjustmentMultiplier
    };
  }
}
