/**
 * Acute-to-Chronic Workload Ratio (ACWR) Injury Forecaster.
 * Monitors relative workload density to forecast overtraining and injury risk.
 */

export interface WorkloadInsight {
  acwr: number;
  /** True when fewer than 28 days of history exist, so the ratio is not yet stable. */
  provisional: boolean;
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
    // Daily DELIBERATE TRAINING load - DailyTrainingLoad.trainingLoad, not .load.
    // Passing the steps-inclusive figure makes this a step-count ratio: on real
    // data steps supplied two thirds of the total, so the number tracked how much
    // the athlete had walked rather than how much they had trained.
    dailyLoads: number[]
  ): WorkloadInsight {
    // A short history is NOT padded with invented training. This used to fill the
    // missing days with 40 TSS each, which manufactures a chronic load the athlete
    // never built - and since the padding lands at the START of the window it
    // inflates chronic while leaving acute alone, pushing every new user's ratio
    // down toward a false "underprepared" verdict on their first four weeks.
    // Average over the days that actually exist instead, and say the ratio is
    // provisional.
    const provisional = dailyLoads.length < 28;
    const chronicDays = dailyLoads.slice(-28);
    const acuteDays = dailyLoads.slice(-7);

    const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((sum, v) => sum + v, 0) / xs.length : 0);
    const acuteLoad = mean(acuteDays);
    const chronicLoad = mean(chronicDays);

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

    if (provisional) {
      insight += ' (Based on less than four weeks of history, so this will move as more days are logged.)';
    }

    return {
      acwr,
      provisional,
      riskZone,
      insight,
      recommendation,
      shouldDeload
    };
  }
}
