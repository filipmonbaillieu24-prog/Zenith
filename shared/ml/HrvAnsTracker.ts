/**
 * Heart Rate Variability (HRV) Autonomic Nervous System (ANS) State & CNS Fatigue Tracker.
 * Normalizes daily rMSSD values to detect sympathovagal tone shift, CNS fatigue, or training readiness.
 */

export interface AnsState {
  zScore: number;
  tone: 'sympathetic' | 'balanced' | 'parasympathetic';
  insight: string;
  intensityMultiplier: number;
  calorieAdjustmentMultiplier: number;
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
    if (hrvHistory.length < 3) {
      // Not enough baseline history, return default balanced state
      return {
        zScore: 0,
        tone: 'balanced',
        insight: 'Establishing HRV baseline. Keep logging wearable metrics.',
        intensityMultiplier: 1.0,
        calorieAdjustmentMultiplier: 1.0
      };
    }

    // Calculate mean of historical values
    const mean = hrvHistory.reduce((sum, val) => sum + val, 0) / hrvHistory.length;

    // Calculate standard deviation of historical values
    const variance = hrvHistory.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / hrvHistory.length;
    const stdDev = Math.max(1.5, Math.sqrt(variance)); // prevent divide by zero

    // Calculate Z-Score
    const zScore = parseFloat(((todayHrv - mean) / stdDev).toFixed(2));

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
