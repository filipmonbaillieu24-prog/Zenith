/**
 * Acute-to-Chronic Workload Ratio (ACWR) Injury Forecaster.
 * Monitors relative workload density to forecast overtraining and injury risk.
 */

export interface WorkloadInsight {
  acwr: number;
  riskZone: 'underprepared' | 'optimal' | 'high' | 'danger';
  insight: string;
  recommendation: string;
  shouldDeload: boolean;
}

export class AcwrForecaster {
  /**
   * Computes the ACWR and predicts the injury risk window.
   */
  public static calculateWorkloadInsight(
    dailyLoads: number[] // historical workload loads (e.g. daily TSS or gymVolume, last 28 days)
  ): WorkloadInsight {
    if (dailyLoads.length < 28) {
      // Pad with baseline value (e.g. 50 TSS) if not enough history
      const padding = Array(28 - dailyLoads.length).fill(40);
      dailyLoads = [...padding, ...dailyLoads];
    }

    // Acute load: average of the last 7 days
    const acuteDays = dailyLoads.slice(-7);
    const acuteLoad = acuteDays.reduce((sum, val) => sum + val, 0) / 7;

    // Chronic load: average of the last 28 days
    const chronicLoad = dailyLoads.reduce((sum, val) => sum + val, 0) / 28;

    // Calculate ACWR
    const acwr = chronicLoad > 0 
      ? parseFloat((acuteLoad / chronicLoad).toFixed(2))
      : 1.0;

    let riskZone: 'underprepared' | 'optimal' | 'high' | 'danger' = 'optimal';
    let insight = 'Workload accumulation is in the optimal physiological conditioning zone.';
    let recommendation = 'Proceed with planned workouts and progressions.';
    let shouldDeload = false;

    if (acwr < 0.8) {
      riskZone = 'underprepared';
      insight = '⚠️ Under-preparedness Zone: Workload has dropped significantly. Fitness adaptation is decaying.';
      recommendation = 'Gradually rebuild weekly volume; avoid sudden spikes in workload.';
    } else if (acwr >= 0.8 && acwr <= 1.3) {
      riskZone = 'optimal';
      insight = '🟢 Athletic Sweet Spot: Workload progression is optimal for building aerobic fitness and power.';
      recommendation = 'Maintain consistency and follow progressive overload guidelines.';
    } else if (acwr > 1.3 && acwr <= 1.5) {
      riskZone = 'high';
      insight = '⚠️ High Workload Zone: Workload is building rapidly. Monitor fatigue markers closely.';
      recommendation = 'Focus on sleep hygiene, hydration, and nutrition. Keep tomorrow at recovery intensity.';
    } else if (acwr > 1.5) {
      riskZone = 'danger';
      insight = '🚨 Overuse Danger Zone: Workload ratio is highly elevated. Systemic injury, tendon strain, or burnout risk is high.';
      recommendation = 'Enforce structured deload immediately. Cut weekly TSS workload by 30-40% to allow tissue adaptation.';
      shouldDeload = true;
    }

    return {
      acwr,
      riskZone,
      insight,
      recommendation,
      shouldDeload
    };
  }
}
