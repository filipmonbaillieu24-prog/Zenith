/**
 * Zenith Sleep & Recovery Engine (ZSE v1.0)
 * Advanced ML & Biometric Sleep Analysis for Zenith Vigor & Zenith Hub
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
  rating: 'Uitstekend' | 'Goed' | 'Voldoende' | 'Matig' | 'Onvoldoende';
  ratingColor: string;
  breakdown: {
    durationScore: number; // Max 35
    deepSleepScore: number; // Max 25
    remSleepScore: number; // Max 25
    efficiencyScore: number; // Max 15
  };
  metrics: {
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
      rating: 'Onvoldoende',
      ratingColor: '#ef4444',
      breakdown: { durationScore: 0, deepSleepScore: 0, remSleepScore: 0, efficiencyScore: 0 },
      metrics: {
        totalHours: 0, totalMins: 0, deepMins: 0, remMins: 0, lightMins: 0, awakeMins: 0,
        deepPct: 0, remPct: 0, lightPct: 0, awakePct: 0, efficiencyPct: 0
      },
      sleepDebtHours: 0,
      personalBaselineHours: targetSleepHours,
      zScore: 0,
      recommendation: 'Geen recente slaapdata beschikbaar. Synchroniseer met Health Connect of voer je slaap handmatig in.'
    };
  }

  const durationMins = currentSleep.duration_minutes;
  const totalHours = Math.round((durationMins / 60) * 10) / 10;
  const targetMins = targetSleepHours * 60;

  // 1. Duration Score (Max 35 points)
  // Optimal range: 95% - 110% of target
  let durationScore = 0;
  const durRatio = durationMins / targetMins;
  if (durRatio >= 0.95 && durRatio <= 1.15) {
    durationScore = 35;
  } else if (durRatio < 0.95) {
    durationScore = Math.max(0, Math.round(35 * (durRatio / 0.95)));
  } else {
    // Over-sleeping penalty
    durationScore = Math.max(20, Math.round(35 - (durRatio - 1.15) * 20));
  }

  // 2. Sleep Stages Breakdown
  let deepMins = currentSleep.deep_minutes ?? 0;
  let remMins = currentSleep.rem_minutes ?? 0;
  let lightMins = currentSleep.light_minutes ?? 0;
  let awakeMins = currentSleep.awake_minutes ?? 0;

  // If no detailed breakdown, apply default physiological distribution estimates
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

  // 3. Deep Sleep Score (Max 25 points - Physical / HGH recovery)
  // Target: 15% - 25% of total sleep (or >= 90 mins)
  let deepSleepScore = 0;
  if (deepMins >= 100 || deepPct >= 20) {
    deepSleepScore = 25;
  } else {
    deepSleepScore = Math.max(0, Math.round((deepMins / 100) * 25));
  }

  // 4. REM Sleep Score (Max 25 points - Mental / Nervous system recovery)
  // Target: 20% - 25% of total sleep (or >= 90 mins)
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
  let rating: 'Uitstekend' | 'Goed' | 'Voldoende' | 'Matig' | 'Onvoldoende' = 'Voldoende';
  let ratingColor = '#38bdf8'; // Cyan default

  if (score >= 88) {
    rating = 'Uitstekend';
    ratingColor = '#4ade80'; // Emerald Green
  } else if (score >= 75) {
    rating = 'Goed';
    ratingColor = '#38bdf8'; // Cyan Blue
  } else if (score >= 60) {
    rating = 'Voldoende';
    ratingColor = '#fbbf24'; // Amber Yellow
  } else if (score >= 45) {
    rating = 'Matig';
    ratingColor = '#fb923c'; // Orange
  } else {
    rating = 'Onvoldoende';
    ratingColor = '#ef4444'; // Red
  }

  // 6. ML Personal Baseline & Sleep Debt Analysis (7-14 days)
  let sleepDebtHours = 0;
  let personalBaselineHours = targetSleepHours;
  let zScore = 0;

  if (historicalSleeps.length > 0) {
    const recent7 = historicalSleeps.slice(0, 7);
    const recent14 = historicalSleeps.slice(0, 14);

    // Cumulative sleep debt over last 7 days
    let debtMins = 0;
    recent7.forEach(s => {
      const diff = targetMins - s.duration_minutes;
      if (diff > 0) debtMins += diff;
    });
    sleepDebtHours = Math.round((debtMins / 60) * 10) / 10;

    // 14-day rolling average
    const sumMins = recent14.reduce((acc, s) => acc + s.duration_minutes, 0);
    personalBaselineHours = Math.round((sumMins / recent14.length / 60) * 10) / 10;

    // Standard deviation for Z-score
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
    recommendation = `Uitstekende nachtrust! Je hebt ${deepMins}m diepe slaap en ${remMins}m REM-slaap behaald. Je zenuwstelsel en spieren zijn optimaal hersteld voor een intensieve Kratos- of Aero-training.`;
  } else if (score >= 75) {
    recommendation = `Goede slaapkwaliteit (${totalHours}u geslapen). Je fysieke herstel is solide. Blijf gefocust op een eenvormige bedtijd.`;
  } else if (sleepDebtHours >= 2.5) {
    recommendation = `⚠️ Opgebouwde slaapschuld van ${sleepDebtHours} uur gedurende de afgelopen 7 dagen. Probeer vanavond 30-45 minuten eerder naar bed te gaan om een dip in je prestaties te voorkomen.`;
  } else if (deepPct < 15) {
    recommendation = `Lage diepe slaap (${deepPct}% van totaal). Beperk zware maaltijden, cafeïne en telefoonschermen kort voor het slapengaan om de afgifte van herstelhormoon (HGH) te maximaliseren.`;
  } else if (remPct < 15) {
    recommendation = `Lage REM-slaap (${remPct}%). REM-slaap is cruciaal voor mentaal herstel en motorisch geheugen. Vermijd alcohol en zorg voor een koele slaapkamer.`;
  } else {
    recommendation = `Suboptimale slaapkwaliteit. Zorg voor voldoende verduistering en rust voor het slapengaan om je herstelscore te verhogen.`;
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
    metrics: {
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
