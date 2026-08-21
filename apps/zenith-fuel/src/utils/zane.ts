export interface ZaneProfile {
  height?: number; // in cm
  gender?: string; // male, female, other
  birthDate?: string; // YYYY-MM-DD
  targetWeight?: number; // in kg
  targetRateKgPerWeek?: number; // default 0.5
  dietType?: string; // balanced, high-carb, low-carb
  todayTrainingType?: 'intense' | 'endurance' | 'rest' | null;
  priorBmrOffset?: number;
  priorSleepQualityCoeff?: number;
  priorSleepDurationCoeff?: number;
  priorGymVolumeCoeff?: number;
  priorCaffeineCoeff?: number;
  priorConfidence?: number; // 0.0–1.0
  priorWeekendCoeff?: number;
}

export interface DailyLogData {
  date: string; // YYYY-MM-DD
  weight: number | null;
  calories: number;
  activeCalories: number;
  sleepQuality: number | null;
  sleepDurationHours: number | null;
  isComplete: boolean;
  gymVolume: number; // in kg
  creatine?: number; // in grams
  caffeine?: number; // in mg
  bodyFat?: number | null; // body fat %
  muscleMass?: number | null; // muscle mass kg
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface ZaneOutput {
  bmrOffset: number;
  sleepQualityCoeff: number;
  sleepDurationCoeff: number;
  gymVolumeCoeff: number;
  caffeineCoeff: number;
  weekendCoeff: number;
  adaptationFactor: number;
  sustainedCutDays: number;
  calculatedAt: string;
  isCalibrated: boolean;
  calibrationDays: number;
  dailyCalorieTarget: number;
  dailyCarbTarget: number;
  dailyProteinTarget: number;
  dailyFatTarget: number;
  trendWeightMap?: { [date: string]: number };
  currentTrendWeight?: number;
  // Exported baselines so App.tsx uses the exact same reference points
  sleepQualityAvg: number;
  sleepDurationAvg: number;
  // Body-composition-aware energy density (kcal/kg) used in regression
  energyPerKgTissue: number;
}

/**
 * Calculates Mifflin-St Jeor BMR for a user.
 */
export function calculateMifflinBmr(weightKg: number, heightCm: number, ageYears: number, gender: string = ''): number {
  const genderTerm = gender === 'male' ? 5 : gender === 'female' ? -161 : -78;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + genderTerm;
}

/**
 * Calculates Katch-McArdle BMR based on Lean Body Mass (LBM) in kg.
 */
export function calculateKatchMcArdleBmr(lbmKg: number): number {
  return 370 + 21.6 * lbmKg;
}

/**
 * Calculates the age of a user given their birthdate string.
 */
export function calculateAge(birthDateStr?: string): number {
  if (!birthDateStr) return 35; // Default age fallback
  const birthDate = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// Creatine loading model: slower, physiologically accurate rate.
// Full saturation takes ~28 days at 5g/day; daily washout ~3% (half-life ~23 days).
// Single source of truth - both the calorie/water-retention model below and any
// UI chart of creatine saturation must use this, not a separately hand-tuned copy.
const CREATINE_DAILY_DECAY = 0.97;
const CREATINE_SATURATION_DIVISOR = 140;

export function creatineSaturationStep(previousSaturation: number, intakeGrams: number): number {
  return Math.min(1.0, (previousSaturation * CREATINE_DAILY_DECAY) + (intakeGrams / CREATINE_SATURATION_DIVISOR));
}

/**
 * ZANE Core Engine.
 * Implements linear interpolation for weight, screens out incomplete days,
 * and performs local multivariable ridge regression to learn metabolic & sleep coefficients.
 */
export function runZaneCalibration(
  logs: DailyLogData[],
  profile: ZaneProfile,
  latestWeightMeasured: number | null,
  selectedDateStr?: string
): ZaneOutput {
  // Sort logs chronologically
  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  // 1. Calculate Creatine Saturation (0.0 to 1.0) based on intake history.
  let currentSaturation = 0;
  const saturationMap: { [date: string]: number } = {};
  sortedLogs.forEach(log => {
    currentSaturation = creatineSaturationStep(currentSaturation, log.creatine || 0);
    saturationMap[log.date] = currentSaturation;
  });

  // 2. Linearly interpolate missing weights
  const weightsWithInterpolation = interpolateWeights(sortedLogs, latestWeightMeasured);
  
  // Create a mapped list with interpolated weights adjusted for creatine water retention
  const logsWithWeight = sortedLogs.map((log, idx) => {
    const rawWeight = weightsWithInterpolation[idx];
    const saturation = saturationMap[log.date] || 0;
    // Creatine water retention estimate: 1.2kg at 100% saturation
    // Post-workout gym fluid retention: up to 0.8kg on heavy gym volume days
    const gymFluidOffset = Math.min(0.8, (log.gymVolume || 0) * 0.00004);
    const adjustedWeight = rawWeight !== null ? rawWeight - (1.2 * saturation) - gymFluidOffset : null;
    return {
      ...log,
      weight: adjustedWeight
    };
  });

  // 3. Exponential Moving Average (EMA) Weight Trend (alpha = 0.15)
  // FIX 10: Use profile target weight as fallback instead of hardcoded 75 kg
  const weightFallback = latestWeightMeasured ?? (profile.targetWeight ?? 75);
  let emaWeight = logsWithWeight.find(l => l.weight !== null)?.weight ?? weightFallback;
  const trendWeights: number[] = [];
  logsWithWeight.forEach(l => {
    if (l.weight !== null) {
      emaWeight = 0.15 * l.weight + 0.85 * emaWeight;
    }
    trendWeights.push(emaWeight);
  });

  // 4. Identify complete days
  const completeLogs = logsWithWeight.filter(log => log.isComplete && log.calories >= 1000 && log.weight !== null);
  const calibrationDays = completeLogs.length;
  const isCalibrated = calibrationDays >= 14;

  let bmrOffset = 0;
  let sleepQualityCoeff = 0;
  let sleepDurationCoeff = 0;
  let gymVolumeCoeff = 0.025; // baseline prior (0.025 kcal per kg moved in strength training)
  let caffeineCoeff = 0.15; // baseline prior (0.15 kcal per mg)
  let weekendCoeff = 0; // baseline weekend coefficient (0 kcal)

  // BMR / profile params
  // FIX 10: Use profile target weight as fallback instead of hardcoded 75 kg
  const currentWeight = latestWeightMeasured ?? (logsWithWeight[logsWithWeight.length - 1]?.weight ?? weightFallback);
  const height = profile.height || 181;
  const age = calculateAge(profile.birthDate);
  const gender = profile.gender || 'male';
  // FIX 3: PAL 1.2 (NEAT-only baseline). Exercise calories are added explicitly from
  // wearable data so the multiplier must not include structured exercise activity.
  const palFactor = 1.2;

  // Find target log for the selected date
  const targetDate = selectedDateStr || logsWithWeight[logsWithWeight.length - 1]?.date;
  const targetLog = logsWithWeight.find(l => l.date === targetDate) || logsWithWeight[logsWithWeight.length - 1];
  // FIX 5: Cap active calories at 1,500 kcal/day to guard against wearable sensor spikes
  const targetActiveCalories = Math.min(1500, targetLog?.activeCalories ?? 0);
  const targetGymVolume = targetLog?.gymVolume ?? 0;
  const targetCaffeine = targetLog?.caffeine ?? 0;
  
  // 5. Multivariable Ridge Regression Solver
  // We solve for Y = X * theta where:
  // theta = [bmr_offset, sleep_quality_coeff, sleep_duration_coeff, delta_gym_coeff, delta_caffeine_coeff, weekend_coeff]

  // FIX 1+4: Feature normalization scale constants.
  // Dividing each feature by its typical std ensures lambda=15 provides equal
  // regularization strength across all coefficient dimensions.
  const SLEEP_Q_SCALE  = 20;   // typical σ of sleep-quality scores (0-100)
  const SLEEP_D_SCALE  = 1.0;  // typical σ of sleep-duration deviations (hours)
  const GYM_VOL_SCALE  = 3000; // typical σ of session gym volume (kg lifted)
  const CAFFEINE_SCALE = 150;  // typical σ of daily caffeine intake (mg)
  
  // Calculate averages for sleep
  const validSleepQualityLogs = completeLogs.filter(l => l.sleepQuality !== null);
  const sleepQualityAvg = validSleepQualityLogs.length > 0 
    ? validSleepQualityLogs.reduce((sum, l) => sum + (l.sleepQuality ?? 0), 0) / validSleepQualityLogs.length 
    : 75;

  const validSleepDurationLogs = completeLogs.filter(l => l.sleepDurationHours !== null);
  const sleepDurationAvg = validSleepDurationLogs.length > 0 
    ? validSleepDurationLogs.reduce((sum, l) => sum + (l.sleepDurationHours ?? 0), 0) / validSleepDurationLogs.length 
    : 8;

  const X: number[][] = [];
  const Y: number[] = [];

  let lastBodyFat: number | null = null;

  // Track the last date in logs to calculate daysAgo for recency weighting
  const lastDate = logsWithWeight.length > 0 ? logsWithWeight[logsWithWeight.length - 1].date : new Date().toISOString().split('T')[0];
  const lastDateMs = new Date(lastDate + 'T12:00:00').getTime();

  for (let i = 1; i < logsWithWeight.length; i++) {
    const todayLog = logsWithWeight[i];
    const yesterdayLog = logsWithWeight[i - 1];

    if (todayLog.bodyFat !== undefined && todayLog.bodyFat !== null) {
      lastBodyFat = todayLog.bodyFat;
    }

    // Invariant check: isComplete is a hard gate. Incomplete days are never loaded.
    if (todayLog.isComplete && todayLog.calories >= 1000 && todayLog.weight !== null && yesterdayLog.weight !== null) {
      // Recency weight: exponential decay with half-weight at ~23 days (λ = 0.97)
      const daysAgo = (lastDateMs - new Date(todayLog.date + 'T12:00:00').getTime()) / 86400000;
      const recencyWeight = Math.pow(0.97, Math.max(0, daysAgo));

      // Data quality weight: 0.0 - 1.0 based on signal presence
      const hasWeight  = todayLog.weight !== null ? 0.40 : 0;
      const hasSleepQ  = todayLog.sleepQuality !== null ? 0.25 : 0;
      const hasSleepD  = todayLog.sleepDurationHours !== null ? 0.25 : 0;
      const hasBodyFat = (todayLog.bodyFat !== null && todayLog.bodyFat !== undefined) ? 0.10 : 0;
      const dataQuality = hasWeight + hasSleepQ + hasSleepD + hasBodyFat;

      const rowWeight = recencyWeight * dataQuality;
      
      // Skip day if it has no data quality at all
      if (rowWeight < 1e-4) continue;

      const sqrtW = Math.sqrt(rowWeight);

      // 7-day EMA trend slope (kg per day) to eliminate single-day water retention fluctuations
      const windowStartIdx = Math.max(0, i - 7);
      const daysSpan = i - windowStartIdx;
      const trendRatePerDay = daysSpan > 0 
        ? (trendWeights[i] - trendWeights[windowStartIdx]) / daysSpan
        : 0;
      
      let todayBaselineBmr = 0;
      if (lastBodyFat !== null && todayLog.weight !== null) {
        const lbm = todayLog.weight * (1 - lastBodyFat / 100);
        todayBaselineBmr = calculateKatchMcArdleBmr(lbm);
      } else {
        todayBaselineBmr = calculateMifflinBmr(todayLog.weight, height, age, gender);
      }

      // FIX 5: Cap active calories to exclude wearable outlier days from the regression
      const safeActiveCalories = Math.min(1500, todayLog.activeCalories);
      const todayBaseTdee = todayBaselineBmr * palFactor + safeActiveCalories;
      const baseGymCalories = todayLog.gymVolume * 0.025;
      const todayCaffeine = todayLog.caffeine || 0;
      const baseCaffeineCalories = todayCaffeine * 0.15;

      // Improvement 1: Macro-specific TEF instead of flat 10%
      const macroTef = ((todayLog.protein || 0) * 4 * 0.25)
                     + ((todayLog.carbs || 0) * 4 * 0.08)
                     + ((todayLog.fat || 0) * 9 * 0.03);

      // Improvement 5: Energy-equivalent weight change based on body composition split
      let energyPerKg = 7700;
      if (lastBodyFat !== null) {
        const fatFraction  = Math.max(0.05, Math.min(0.60, lastBodyFat / 100));
        const leanFraction = 1 - fatFraction;
        energyPerKg = fatFraction * 7700 + leanFraction * 900;
      }

      // Realized daily energy balance from trend slope
      const yVal = (trendRatePerDay * energyPerKg) - (todayLog.calories - macroTef - (todayBaseTdee + baseGymCalories + baseCaffeineCalories));

      const qVal = todayLog.sleepQuality !== null ? todayLog.sleepQuality : sleepQualityAvg;
      const dVal = todayLog.sleepDurationHours !== null ? todayLog.sleepDurationHours : sleepDurationAvg;

      // DOW: Weekend coefficient feature (Feature 5)
      const isWeekend = [0, 6].includes(new Date(todayLog.date + 'T12:00:00').getDay()) ? 1 : 0;

      // FIX 1+4: Use correct signs (+intercept, +deviations) and normalize all
      // features so ridge regularization is equally effective across dimensions.
      const x0 = 1;                                               // intercept
      const x1 = (qVal - sleepQualityAvg) / SLEEP_Q_SCALE;      // sleep quality (normalized)
      const x2 = (dVal - sleepDurationAvg) / SLEEP_D_SCALE;     // sleep duration (normalized)
      const x3 = todayLog.gymVolume / GYM_VOL_SCALE;            // gym volume (normalized)
      const x4 = todayCaffeine / CAFFEINE_SCALE;                 // caffeine (normalized)
      const x5 = isWeekend;                                     // weekend flag

      X.push([x0, x1, x2, x3, x4, x5].map(v => v * sqrtW));
      Y.push(yVal * sqrtW);
    }
  }

  // Improvement 4: Bayesian Warm-Starting Anchor Rows
  if (profile.priorBmrOffset !== undefined && X.length >= 5) {
    const anchorWeight = Math.sqrt((profile.priorConfidence ?? 0.5) * X.length);
    
    // Anchor for bmrOffset (Feature 0)
    X.push([anchorWeight, 0, 0, 0, 0, 0]);
    Y.push((profile.priorBmrOffset ?? 0) * anchorWeight);

    // Anchor for sleepQualityCoeff (Feature 1: normalized prior)
    if (profile.priorSleepQualityCoeff !== undefined) {
      const priorNormQ = profile.priorSleepQualityCoeff * SLEEP_Q_SCALE;
      X.push([0, anchorWeight, 0, 0, 0, 0]);
      Y.push(priorNormQ * anchorWeight);
    }

    // Anchor for sleepDurationCoeff (Feature 2: normalized prior)
    if (profile.priorSleepDurationCoeff !== undefined) {
      const priorNormD = profile.priorSleepDurationCoeff * SLEEP_D_SCALE;
      X.push([0, 0, anchorWeight, 0, 0, 0]);
      Y.push(priorNormD * anchorWeight);
    }

    // Anchor for gymVolumeCoeff (Feature 3: normalized delta prior)
    if (profile.priorGymVolumeCoeff !== undefined) {
      const priorNormG = (profile.priorGymVolumeCoeff - 0.025) * GYM_VOL_SCALE;
      X.push([0, 0, 0, anchorWeight, 0, 0]);
      Y.push(priorNormG * anchorWeight);
    }

    // Anchor for caffeineCoeff (Feature 4: normalized delta prior)
    if (profile.priorCaffeineCoeff !== undefined) {
      const priorNormC = (profile.priorCaffeineCoeff - 0.15) * CAFFEINE_SCALE;
      X.push([0, 0, 0, 0, anchorWeight, 0]);
      Y.push(priorNormC * anchorWeight);
    }

    // Anchor for weekendCoeff (Feature 5)
    if (profile.priorWeekendCoeff !== undefined) {
      X.push([0, 0, 0, 0, 0, anchorWeight]);
      Y.push(profile.priorWeekendCoeff * anchorWeight);
    }
  }

  // Calculate regression coefficients if we have at least 5 equations
  if (X.length >= 5) {
    const lambda = 15.0; // Regularization strength (equal across normalized features)
    const coefficients = solveRidgeRegression(X, Y, lambda);

    // FIX 1+4: Un-normalize on retrieval: coeff_raw = coeff_normalized / scale
    // so that the forward pass can use raw feature values directly.
    bmrOffset          = Math.min(250,  Math.max(-250, Math.round(coefficients[0] || 0)));
    sleepQualityCoeff  = Math.min(10,   Math.max(-10,  (coefficients[1] || 0) / SLEEP_Q_SCALE));
    sleepDurationCoeff = Math.min(50,   Math.max(-50,  (coefficients[2] || 0) / SLEEP_D_SCALE));

    const deltaGymCoeff      = (coefficients[3] || 0) / GYM_VOL_SCALE;
    gymVolumeCoeff  = Math.min(0.10, Math.max(0.01, 0.025 + deltaGymCoeff));

    const deltaCaffeineCoeff = (coefficients[4] || 0) / CAFFEINE_SCALE;
    caffeineCoeff   = Math.min(0.50, Math.max(0.02, 0.15 + deltaCaffeineCoeff));

    // DOW Weekend coefficient retrieval
    weekendCoeff       = Math.min(400,  Math.max(-400, Math.round(coefficients[5] || 0)));
  }

  // 5. Calculate today's dynamic calorie target
  const todaySleepQuality = targetLog?.sleepQuality !== null ? targetLog.sleepQuality : sleepQualityAvg;
  const todaySleepDuration = targetLog?.sleepDurationHours !== null ? targetLog.sleepDurationHours : sleepDurationAvg;

  // Find latest body fat in entire logs history
  let finalBodyFat = lastBodyFat;
  if (finalBodyFat === null) {
    const logsWithFat = logs.filter(l => l.bodyFat !== null && l.bodyFat !== undefined);
    if (logsWithFat.length > 0) {
      finalBodyFat = logsWithFat[logsWithFat.length - 1].bodyFat!;
    }
  }

  let todayBmr = 0;
  if (finalBodyFat !== null) {
    const lbm = currentWeight * (1 - finalBodyFat / 100);
    todayBmr = calculateKatchMcArdleBmr(lbm);
  } else {
    todayBmr = calculateMifflinBmr(currentWeight, height, age, gender);
  }
  let gymCalories = 0;
  let caffeineCalories = 0;
  
  if (isCalibrated) {
    gymCalories = targetGymVolume * gymVolumeCoeff;
    caffeineCalories = targetCaffeine * caffeineCoeff;
  } else {
    gymCalories = Math.min(400, Math.max(100, targetGymVolume * 0.15));
    if (targetGymVolume === 0) gymCalories = 0;
    caffeineCalories = targetCaffeine * 0.15;
  }

  let todayTdee;

  if (isCalibrated) {
    todayTdee = todayBmr * palFactor + targetActiveCalories + gymCalories + caffeineCalories + bmrOffset;
    const sleepQualityDiff = (todaySleepQuality ?? sleepQualityAvg) - sleepQualityAvg;
    const sleepDurationDiff = (todaySleepDuration ?? sleepDurationAvg) - sleepDurationAvg;
    const isTargetWeekend = [0, 6].includes(new Date(targetDate + 'T12:00:00').getDay()) ? 1 : 0;
    todayTdee += (sleepQualityCoeff * sleepQualityDiff) + (sleepDurationCoeff * sleepDurationDiff) + (weekendCoeff * isTargetWeekend);
  } else {
    // FIX 8: In uncalibrated mode, do not apply a sleep penalty/bonus.
    todayTdee = todayBmr * palFactor + targetActiveCalories + gymCalories + caffeineCalories;
  }

  // Improvement 7: Metabolic Adaptation Modeling (Adaptive Thermogenesis)
  let adaptationFactor = 1.0;
  let sustainedCutDays = 0;
  if (completeLogs.length >= 21) {
    const recentLogs = [...completeLogs].reverse();
    for (const log of recentLogs) {
      const logBaselineBmr = calculateMifflinBmr(log.weight ?? currentWeight, height, age, gender);
      const logTdee = logBaselineBmr * palFactor + Math.min(1500, log.activeCalories);
      if (log.calories < logTdee - 150) {
        sustainedCutDays++;
      } else {
        break; // break on first non-deficit day
      }
    }
    if (sustainedCutDays >= 21) {
      // Max adaptation: 10% TDEE down-regulation at 60 days of cut
      const adaptationDays = sustainedCutDays - 21;
      const maxAdaptation = 0.10;
      adaptationFactor = 1.0 - Math.min(maxAdaptation, adaptationDays * (maxAdaptation / 39));
    }
  }

  todayTdee = Math.round(todayTdee * adaptationFactor);

  const trendWeightMap: { [date: string]: number } = {};
  logsWithWeight.forEach((l, idx) => {
    trendWeightMap[l.date] = Math.round(trendWeights[idx] * 100) / 100;
  });
  const currentTrendWeight = trendWeights.length > 0 
    ? Math.round(trendWeights[trendWeights.length - 1] * 100) / 100 
    : currentWeight;

  // Compute body-composition-aware energy density (kcal/kg) for projection in App.tsx
  let energyPerKgTissue = 7700; // default: pure adipose tissue
  if (finalBodyFat !== null) {
    const fatFraction  = Math.max(0.05, Math.min(0.60, finalBodyFat / 100));
    const leanFraction = 1 - fatFraction;
    energyPerKgTissue = Math.round(fatFraction * 7700 + leanFraction * 900);
  }

  // FIX 7: Pass todayBmr so the safety floor uses the same formula (Katch-McArdle
  // or Mifflin) as the TDEE calculation — no more inconsistency.
  return generateTargets(todayTdee, todayBmr, currentWeight, profile, bmrOffset, sleepQualityCoeff, sleepDurationCoeff, gymVolumeCoeff, caffeineCoeff, weekendCoeff, adaptationFactor, sustainedCutDays, calibrationDays, isCalibrated, trendWeightMap, currentTrendWeight, sleepQualityAvg, sleepDurationAvg, energyPerKgTissue);
}

/**
 * Performs linear interpolation for missing weight values.
 */
function interpolateWeights(logs: DailyLogData[], latestWeight: number | null): (number | null)[] {
  const weights = logs.map(l => l.weight);
  
  // Find first non-null weight index
  let firstIdx = weights.findIndex(w => w !== null);
  if (firstIdx === -1) {
    // If no weight logged in the array, use the latest weight or default to null
    return weights.map(() => latestWeight);
  }

  // Fill in any leading nulls with the first known weight
  for (let i = 0; i < firstIdx; i++) {
    weights[i] = weights[firstIdx];
  }

  // Interpolate gaps
  let i = firstIdx;
  while (i < weights.length) {
    if (weights[i] === null) {
      // Find next non-null index
      let nextIdx = -1;
      for (let j = i + 1; j < weights.length; j++) {
        if (weights[j] !== null) {
          nextIdx = j;
          break;
        }
      }

      if (nextIdx !== -1) {
        // Interpolate between i-1 and nextIdx
        const wStart = weights[i - 1]!;
        const wEnd = weights[nextIdx]!;
        const steps = nextIdx - (i - 1);
        const stepVal = (wEnd - wStart) / steps;
        
        for (let k = i; k < nextIdx; k++) {
          weights[k] = wStart + stepVal * (k - (i - 1));
        }
        i = nextIdx + 1;
      } else {
        // No subsequent weights, fill the rest with the last known weight
        const lastWeight = weights[i - 1]!;
        for (let k = i; k < weights.length; k++) {
          weights[k] = lastWeight;
        }
        break;
      }
    } else {
      i++;
    }
  }

  return weights;
}

/**
 * Solves OLS regression with Ridge regularization (X^T * X + lambda * I)^-1 * X^T * Y
 * for a model of arbitrary dimensions.
 */
function solveRidgeRegression(X: number[][], Y: number[], lambda: number): number[] {
  const N = X.length;
  if (N === 0) return [];
  const M = X[0].length; // number of features (parameters)

  // Initialize XtX (MxM matrix)
  const XtX: number[][] = Array.from({ length: M }, () => Array(M).fill(0));
  // Initialize XtY (Mx1 vector)
  const XtY: number[] = Array(M).fill(0);

  // Compute X^T * X and X^T * Y
  for (let i = 0; i < N; i++) {
    const x = X[i];
    const y = Y[i];
    
    for (let r = 0; r < M; r++) {
      XtY[r] += x[r] * y;
      for (let c = 0; c < M; c++) {
        XtX[r][c] += x[r] * x[c];
      }
    }
  }

  // Add Ridge Regularization lambda to the diagonal
  for (let r = 0; r < M; r++) {
    XtX[r][r] += lambda;
  }

  // Solve the linear system XtX * theta = XtY using Gaussian Elimination
  const coeff = solveLinearSystem(XtX, XtY);
  return coeff || Array(M).fill(0);
}

/**
 * Solves a linear system A * x = B using Gauss-Jordan elimination.
 */
function solveLinearSystem(A: number[][], B: number[]): number[] | null {
  const n = A.length;
  // Create augmented matrix [A | B]
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    M.push([...A[i], B[i]]);
  }

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxEl = Math.abs(M[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > maxEl) {
        maxEl = Math.abs(M[k][i]);
        maxRow = k;
      }
    }

    // Swap maximum row with current row
    const temp = M[maxRow];
    M[maxRow] = M[i];
    M[i] = temp;

    if (Math.abs(M[i][i]) < 1e-8) {
      return null; // Singular matrix
    }

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const c = -M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) {
          M[k][j] = 0;
        } else {
          M[k][j] += c * M[i][j];
        }
      }
    }
  }

  // Back substitution
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) {
      M[k][n] -= M[k][i] * x[i];
    }
  }

  return x;
}

/**
 * Generates nutritional macro targets based on TDEE, weight, and user profile parameters.
 * FIX 7: todayBmr is now received so the safety floor uses the same BMR formula
 * (Katch-McArdle or Mifflin-St Jeor) as the TDEE — no formula mismatch.
 */
function generateTargets(
  tdee: number,
  todayBmr: number,
  weight: number,
  profile: ZaneProfile,
  bmrOffset: number,
  sleepQualityCoeff: number,
  sleepDurationCoeff: number,
  gymVolumeCoeff: number,
  caffeineCoeff: number,
  weekendCoeff: number,
  adaptationFactor: number,
  sustainedCutDays: number,
  calibrationDays: number,
  isCalibrated: boolean,
  trendWeightMap: { [date: string]: number } = {},
  currentTrendWeight: number = weight,
  sleepQualityAvg: number = 75,
  sleepDurationAvg: number = 8,
  energyPerKgTissue: number = 7700
): ZaneOutput {
  // Apply calorie surplus or deficit to reach target weight
  let dailyCalorieTarget = tdee;
  const targetWeight = profile.targetWeight;
  const targetRate = profile.targetRateKgPerWeek ?? 0.5;
  let phase: 'cut' | 'bulk' | 'maintain' = 'maintain';

  // FIX 7: Safety floor uses todayBmr (same formula as TDEE) + gender-aware absolute minimum.
  // Clinical guidelines (ACSM/AND): men ≥ 1500 kcal/day, women ≥ 1200 kcal/day.
  const absoluteFloor = (profile.gender === 'female') ? 1200 : 1500;
  const bmrSafetyFloor = Math.max(absoluteFloor, Math.round(todayBmr * 0.95));
  // 25% Max Deficit Cap (max 600 kcal/day deficit to preserve LBM)
  const maxAllowableDeficit = Math.min(600, Math.round(tdee * 0.25));

  if (targetWeight) {
    const weightMargin = 0.2; // 200 grams margin
    const diff = currentWeightDiff(weight, targetWeight);
    
    if (diff > weightMargin) {
      // Lose weight: deficit capped at maxAllowableDeficit and bounded by bmrSafetyFloor
      const desiredDeficit = (targetRate * 7700) / 7;
      const safeDeficit = Math.min(desiredDeficit, maxAllowableDeficit);
      dailyCalorieTarget = Math.max(bmrSafetyFloor, tdee - safeDeficit);
      phase = 'cut';
    } else if (diff < -weightMargin) {
      // FIX 6: Cap lean-bulk surplus at 500 kcal/day.
      // Exceeding this primarily adds fat rather than muscle (Helms et al. 2014).
      const desiredSurplus = (targetRate * 7700) / 7;
      const cappedSurplus = Math.min(500, desiredSurplus);
      dailyCalorieTarget = tdee + cappedSurplus;
      phase = 'bulk';
    }
  }

  dailyCalorieTarget = Math.round(dailyCalorieTarget);

  // Macro target calculations (Sports-Science Weight-Based Model)
  const diet = profile.dietType || 'balanced';

  // 1. Establish Protein Target based on body weight (g/kg) and phase to preserve LBM
  let proteinGramsPerKg = 2.0; // default/balanced
  if (diet === 'high-carb') {
    proteinGramsPerKg = 1.7;
  } else if (diet === 'low-carb') {
    proteinGramsPerKg = 2.3;
  }

  // Adjust protein based on goal phase (Cut = higher protein to preserve muscle, Bulk = lower protein as energy is high)
  if (phase === 'cut') {
    proteinGramsPerKg += 0.2;
  } else if (phase === 'bulk') {
    proteinGramsPerKg -= 0.2;
  }

  const dailyProteinTarget = Math.round(weight * proteinGramsPerKg);
  const proteinCalories = dailyProteinTarget * 4;

  // 2. Allocate remaining calories to Carbs and Fat
  const caloriesForCarbsAndFat = Math.max(500, dailyCalorieTarget - proteinCalories);

  // Base split ratio of remaining calories
  let carbRatioOfRemaining = 0.65; // balanced
  if (diet === 'high-carb') {
    carbRatioOfRemaining = 0.78;
  } else if (diet === 'low-carb') {
    carbRatioOfRemaining = 0.35;
  }

  // 3. Dynamic timing adjustments based on training type
  // Shift energy ratio towards carbs on intense days, and fat on rest days
  let carbAdjustmentGrams = 0;
  const todayTrainingType = profile.todayTrainingType;
  if (todayTrainingType === 'intense') {
    carbAdjustmentGrams = weight * 1.5;
  } else if (todayTrainingType === 'endurance') {
    carbAdjustmentGrams = weight * 0.7;
  } else if (todayTrainingType === 'rest') {
    carbAdjustmentGrams = -weight * 0.5;
  }

  const baseCarbCalories = caloriesForCarbsAndFat * carbRatioOfRemaining;
  const baseFatCalories = caloriesForCarbsAndFat * (1 - carbRatioOfRemaining);

  const adjustmentCalories = carbAdjustmentGrams * 4;
  let finalCarbCalories = baseCarbCalories + adjustmentCalories;
  let finalFatCalories = baseFatCalories - adjustmentCalories;

  // Safeguard: Ensure fat doesn't drop below 0.6g/kg for hormonal health
  const minFatGrams = Math.round(weight * 0.6);
  const minFatCalories = minFatGrams * 9;
  if (finalFatCalories < minFatCalories) {
    finalFatCalories = minFatCalories;
    finalCarbCalories = Math.max(0, caloriesForCarbsAndFat - finalFatCalories);
  }

  const dailyCarbTarget = Math.round(finalCarbCalories / 4);
  const dailyFatTarget = Math.round(finalFatCalories / 9);

  // energyPerKgTissue is passed in from runZaneCalibration (computed from finalBodyFat)

  return {
    bmrOffset: Math.round(bmrOffset),
    sleepQualityCoeff: Math.round(sleepQualityCoeff * 10) / 10,
    sleepDurationCoeff: Math.round(sleepDurationCoeff * 10) / 10,
    gymVolumeCoeff: Math.round(gymVolumeCoeff * 1000) / 1000,
    caffeineCoeff: Math.round(caffeineCoeff * 1000) / 1000,
    weekendCoeff: Math.round(weekendCoeff),
    adaptationFactor: Math.round(adaptationFactor * 100) / 100,
    sustainedCutDays,
    calculatedAt: new Date().toISOString(),
    isCalibrated,
    calibrationDays,
    dailyCalorieTarget,
    dailyCarbTarget,
    dailyProteinTarget,
    dailyFatTarget,
    trendWeightMap,
    currentTrendWeight,
    sleepQualityAvg,
    sleepDurationAvg,
    energyPerKgTissue
  };
}

function currentWeightDiff(current: number, target: number): number {
  return current - target;
}

export async function saveZaneCoefficients(
  supabase: any,
  userId: string,
  bmrOffset: number,
  sleepQualityCoeff: number,
  sleepDurationCoeff: number,
  gymVolumeCoeff: number,
  caffeineCoeff: number,
  weekendCoeff: number
): Promise<void> {
  await supabase.from('ml_weights').upsert({
    user_id: userId,
    model_name: 'zane_metabolic_coefficients',
    weights: { bmrOffset, sleepQualityCoeff, sleepDurationCoeff, gymVolumeCoeff, caffeineCoeff, weekendCoeff },
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,model_name' });
}

export async function loadZaneCoefficients(
  supabase: any,
  userId: string
): Promise<{ bmrOffset: number; sleepQualityCoeff: number; sleepDurationCoeff: number; gymVolumeCoeff: number; caffeineCoeff?: number; weekendCoeff?: number } | null> {
  const { data } = await supabase.from('ml_weights')
    .select('weights')
    .eq('user_id', userId)
    .eq('model_name', 'zane_metabolic_coefficients')
    .maybeSingle();
  return data?.weights ?? null;
}
