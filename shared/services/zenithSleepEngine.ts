/**
 * Zenith Sleep & Recovery Engine (ZSE v1.0)
 * Advanced ML & Biowithric Sleep Analysis for Zenith Vigor & Zenith Hub
 */

export interface SleepLogItem {
  id?: string;
  logged_at: string;
  duration_minutes: number;
  deep_minutes?: number;
  light_minutes?: number;
  rem_minutes?: number;
  awake_minutes?: number;
  quality_score?: number;
  hrv_ms?: number;
  resting_hr?: number;
}

export interface SleepAnalysisResult {
  score: number; // 0 - 100
  rating: 'Excellent' | 'Good' | 'Optimal' | 'Fair' | 'Poor';
  ratingColor: string;
  breakdown: {
    durationScore: number; // Max 35
    deepSleepScore: number; // Max 25
    remSleepScore: number; // Max 25
    efficiencyScore: number; // Max 15
  };
  withrics: {
    totalHours: number;
    totalMins: number;
    deepMins: number;
    remMins: number;
    lightMins: number;
    awakeMins: number;
    deepPct: number;
    remPct: number;
    lightPct: number;
    awakePct: number;
    efficiencyPct: number;
  };
  sleepDebtHours: number; // Cumulative 7-day sleep debt in hours
  personalBaselineHours: number; // 14-day rolling average sleep duration in hours
  zScore: number; // Z-score relative to personal baseline
  recommendation: string;
}

/**
 * Calculates a comprehensive Zenith Sleep Score and recovery analysis from sleep logs.
 */
export function calculateZenithSleepScore(
  currentSleep: SleepLogItem | null,
  historicalSleeps: SleepLogItem[] = [],
  targetSleepHours: number = 8.0
): SleepAnalysisResult {
  if (!currentSleep || currentSleep.duration_minutes <= 0) {
    return {
      score: 0,
      rating: 'Poor',
      ratingColor: '#ef4444',
      breakdown: { durationScore: 0, deepSleepScore: 0, remSleepScore: 0, efficiencyScore: 0 },
      withrics: {
        totalHours: 0, totalMins: 0, deepMins: 0, remMins: 0, lightMins: 0, awakeMins: 0,
        deepPct: 0, remPct: 0, lightPct: 0, awakePct: 0, efficiencyPct: 0
      },
      sleepDebtHours: 0,
      personalBaselineHours: targetSleepHours,
      zScore: 0,
      recommendation: 'No recent sleep data available. Sync with Health Connect or manually record your sleep session.'
    };
  }

  const durationMins = currentSleep.duration_minutes;
  const totalHours = Math.round((durationMins / 60) * 10) / 10;
  const targetMins = targetSleepHours * 60;

  // 1. Duration Score (Max 35 points)
  let durationScore = 0;
  const durRatio = durationMins / targetMins;
  if (durRatio >= 0.95 && durRatio <= 1.15) {
    durationScore = 35;
  } else if (durRatio < 0.95) {
    durationScore = Math.max(0, Math.round(35 * (durRatio / 0.95)));
  } else {
    durationScore = Math.max(20, Math.round(35 - (durRatio - 1.15) * 20));
  }

  // 2. Sleep Stages Breakdown
  let deepMins = currentSleep.deep_minutes ?? 0;
  let remMins = currentSleep.rem_minutes ?? 0;
  let lightMins = currentSleep.light_minutes ?? 0;
  let awakeMins = currentSleep.awake_minutes ?? 0;

  const totalStageSum = deepMins + remMins + lightMins + awakeMins;
  if (totalStageSum === 0) {
    deepMins = Math.round(durationMins * 0.22);
    remMins = Math.round(durationMins * 0.21);
    awakeMins = Math.round(durationMins * 0.05);
    lightMins = durationMins - (deepMins + remMins + awakeMins);
  }

  const deepPct = Math.round((deepMins / durationMins) * 100);
  const remPct = Math.round((remMins / durationMins) * 100);
  const lightPct = Math.round((lightMins / durationMins) * 100);
  const awakePct = Math.round((awakeMins / (durationMins + awakeMins)) * 100);
  const timeInBedMins = durationMins + awakeMins;
  const efficiencyPct = timeInBedMins > 0 ? Math.round((durationMins / timeInBedMins) * 100) : 100;

  // 3. Deep Sleep Score (Max 25 points - Physical recovery)
  let deepSleepScore = 0;
  if (deepMins >= 100 || deepPct >= 20) {
    deepSleepScore = 25;
  } else {
    deepSleepScore = Math.max(0, Math.round((deepMins / 100) * 25));
  }

  // 4. REM Sleep Score (Max 25 points - Mental recovery)
  let remSleepScore = 0;
  if (remMins >= 95 || remPct >= 20) {
    remSleepScore = 25;
  } else {
    remSleepScore = Math.max(0, Math.round((remMins / 95) * 25));
  }

  // 5. Efficiency & Continuity Score (Max 15 points)
  let efficiencyScore = 0;
  if (efficiencyPct >= 92 && awakeMins <= 25) {
    efficiencyScore = 15;
  } else {
    efficiencyScore = Math.max(0, Math.round(15 * (efficiencyPct / 92)));
  }

  // Total Score (0 - 100)
  const rawScore = durationScore + deepSleepScore + remSleepScore + efficiencyScore;
  const score = Math.min(100, Math.max(20, rawScore));

  // Rating & Accent Color
  let rating: 'Excellent' | 'Good' | 'Optimal' | 'Fair' | 'Poor' = 'Optimal';
  let ratingColor = '#38bdf8'; // Cyan default

  if (score >= 88) {
    rating = 'Excellent';
    ratingColor = '#4ade80';
  } else if (score >= 75) {
    rating = 'Good';
    ratingColor = '#38bdf8';
  } else if (score >= 60) {
    rating = 'Optimal';
    ratingColor = '#fbbf24';
  } else if (score >= 45) {
    rating = 'Fair';
    ratingColor = '#fb923c';
  } else {
    rating = 'Poor';
    ratingColor = '#ef4444';
  }

  // 6. ML Personal Baseline & Sleep Debt Analysis (7-14 days)
  let sleepDebtHours = 0;
  let personalBaselineHours = targetSleepHours;
  let zScore = 0;

  if (historicalSleeps.length > 0) {
    const recent7 = historicalSleeps.slice(0, 7);
    const recent14 = historicalSleeps.slice(0, 14);

    let debtMins = 0;
    recent7.forEach(s => {
      const diff = targetMins - s.duration_minutes;
      if (diff > 0) debtMins += diff;
    });
    sleepDebtHours = Math.round((debtMins / 60) * 10) / 10;

    const sumMins = recent14.reduce((acc, s) => acc + s.duration_minutes, 0);
    personalBaselineHours = Math.round((sumMins / recent14.length / 60) * 10) / 10;

    const meanMins = sumMins / recent14.length;
    const variance = recent14.reduce((acc, s) => acc + Math.pow(s.duration_minutes - meanMins, 2), 0) / recent14.length;
    const stdDevMins = Math.sqrt(variance);

    if (stdDevMins > 0) {
      zScore = Math.round(((durationMins - meanMins) / stdDevMins) * 10) / 10;
    }
  }

  // Actionable AI Recommendation
  let recommendation = '';
  if (score >= 88) {
    recommendation = `Excellent sleep quality! You achieved ${deepMins}m deep sleep and ${remMins}m REM sleep. Your nervous system and muscles are fully primed for an intensive Kratos or Aero training.`;
  } else if (score >= 75) {
    recommendation = `Solid sleep quality (${totalHours}h slept). Physical recovery is strong. Maintain a consistent bedtime schedule.`;
  } else if (sleepDebtHours >= 2.5) {
    recommendation = `⚠️ Accumulated sleep debt of ${sleepDebtHours} hours over the last 7 days. Consider going to bed 30-45 minutes earlier tonight to prevent a dip in performance.`;
  } else if (deepPct < 15) {
    recommendation = `Low deep sleep (${deepPct}% of total). Limit heavy meals, caffeine, and screen time before sleep to maximize growth hormone (HGH) release.`;
  } else if (remPct < 15) {
    recommendation = `Low REM sleep (${remPct}%). REM sleep is crucial for cognitive recovery and motor memory. Avoid alcohol and keep your bedroom cool.`;
  } else {
    recommendation = `Suboptimal sleep quality. Ensure adequate darkness and relaxation before sleep to improve your recovery score.`;
  }

  return {
    score,
    rating,
    ratingColor,
    breakdown: {
      durationScore,
      deepSleepScore,
      remSleepScore,
      efficiencyScore
    },
    withrics: {
      totalHours,
      totalMins: durationMins,
      deepMins,
      remMins,
      lightMins,
      awakeMins,
      deepPct,
      remPct,
      lightPct,
      awakePct,
      efficiencyPct
    },
    sleepDebtHours,
    personalBaselineHours,
    zScore,
    recommendation
  };
}
