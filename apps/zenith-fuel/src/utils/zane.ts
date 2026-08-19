export interface ZaneProfile {
  height?: number; // in cm
  gender?: string; // male, female, other
  birthDate?: string; // YYYY-MM-DD
  targetWeight?: number; // in kg
  targetRateKgPerWeek?: number; // default 0.5
  dietType?: string; // balanced, high-carb, low-carb
  todayTrainingType?: 'intense' | 'endurance' | 'rest' | null;
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
}

export interface ZaneOutput {
  bmrOffset: number;
  sleepQualityCoeff: number;
  sleepDurationCoeff: number;
  gymVolumeCoeff: number;
  caffeineCoeff: number;
  calculatedAt: string;
  isCalibrated: boolean;
  calibrationDays: number;
  dailyCalorieTarget: number;
  dailyCarbTarget: number;
  dailyProteinTarget: number;
  dailyFatTarget: number;
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

/**
 * ZANE Core Engine.
 * Implements linear interpolation for weight, screens out incomplete days,
 * and performs local multivariable ridge regression to learn withabolic & sleep coefficients.
 */
export function runZaneCalibration(
  logs: DailyLogData[],
  profile: ZaneProfile,
  latestWeightMeasured: number | null,
  selectedDateStr?: string
): ZaneOutput {
  // Sort logs chronologically
  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  // 1. Calculate Creatine Saturation (0.0 to 1.0) based on intake history
  // Daily intake of 5g increases saturation by +0.33 (fully loaded in 3 days)
  // 8% daily washout/decay when not taken
  let currentSaturation = 0;
  const saturationMap: { [date: string]: number } = {};
  sortedLogs.forEach(log => {
    const intake = log.creatine || 0;
    currentSaturation = Math.min(1.0, (currentSaturation * 0.92) + (intake / 15));
    saturationMap[log.date] = currentSaturation;
  });

  // 2. Linearly interpolate missing weights
  const weightsWithInterpolation = interpolateWeights(sortedLogs, latestWeightMeasured);
  
  // Create a mapped list with interpolated weights adjusted for creatine water retention
  const logsWithWeight = sortedLogs.map((log, idx) => {
    const rawWeight = weightsWithInterpolation[idx];
    const saturation = saturationMap[log.date] || 0;
    // Creatine water retention estimate: 1.2kg at 100% saturation
    const adjustedWeight = rawWeight !== null ? rawWeight - (1.2 * saturation) : null;
    return {
      ...log,
      weight: adjustedWeight
    };
  });

  // 3. Exponential Moving Average (EMA) Weight Trend (alpha = 0.15)
  let emaWeight = logsWithWeight.find(l => l.weight !== null)?.weight ?? (latestWeightMeasured || 75);
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

  // Mifflin-St Jeor params
  const currentWeight = latestWeightMeasured || (logsWithWeight[logsWithWeight.length - 1]?.weight ?? 75);
  const height = profile.height || 181;
  const age = calculateAge(profile.birthDate);
  const gender = profile.gender || 'male';
  const palFactor = 1.25; // PAL baseline

  // Find target log for the selected date
  const targetDate = selectedDateStr || logsWithWeight[logsWithWeight.length - 1]?.date;
  const targetLog = logsWithWeight.find(l => l.date === targetDate) || logsWithWeight[logsWithWeight.length - 1];
  const targetActiveCalories = targetLog?.activeCalories ?? 0;
  const targetGymVolume = targetLog?.gymVolume ?? 0;
  const targetCaffeine = targetLog?.caffeine ?? 0;
  
  // 5. Multivariable Ridge Regression Solver
  // We solve for Y = X * theta where:
  // theta = [bmr_offset, sleep_quality_coeff, sleep_duration_coeff, delta_gym_coeff, delta_caffeine_coeff]
  
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

  for (let i = 1; i < logsWithWeight.length; i++) {
    const todayLog = logsWithWeight[i];
    const yesterdayLog = logsWithWeight[i - 1];

    if (todayLog.bodyFat !== undefined && todayLog.bodyFat !== null) {
      lastBodyFat = todayLog.bodyFat;
    }

    if (todayLog.isComplete && todayLog.calories >= 1000 && todayLog.weight !== null && yesterdayLog.weight !== null) {
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

      const todayBaseTdee = todayBaselineBmr * palFactor + todayLog.activeCalories;
      const baseGymCalories = todayLog.gymVolume * 0.025;
      const todayCaffeine = todayLog.caffeine || 0;
      const baseCaffeineCalories = todayCaffeine * 0.15;

      // Realized daily energy balance from 7-day trend slope
      const yVal = (trendRatePerDay * 7700) - (todayLog.calories - (todayBaseTdee + baseGymCalories + baseCaffeineCalories));

      const qVal = todayLog.sleepQuality !== null ? todayLog.sleepQuality : sleepQualityAvg;
      const dVal = todayLog.sleepDurationHours !== null ? todayLog.sleepDurationHours : sleepDurationAvg;

      const x0 = -1;
      const x1 = -(qVal - sleepQualityAvg);
      const x2 = -(dVal - sleepDurationAvg);
      const x3 = -todayLog.gymVolume;
      const x4 = -todayCaffeine;

      X.push([x0, x1, x2, x3, x4]);
      Y.push(yVal);
    }
  }

  // Calculate regression coefficients if we have at least 5 equations
  if (X.length >= 5) {
    const lambda = 15.0; // Regularization
    const coefficients = solveRidgeRegression(X, Y, lambda);
    // Clamp BMR offset to realistic physiological limits (+/- 250 kcal)
    bmrOffset = Math.min(250, Math.max(-250, Math.round(coefficients[0] || 0)));
    sleepQualityCoeff = Math.min(10, Math.max(-10, coefficients[1] || 0));
    sleepDurationCoeff = Math.min(50, Math.max(-50, coefficients[2] || 0));
    
    const deltaGymCoeff = coefficients[3] || 0;
    gymVolumeCoeff = Math.min(0.10, Math.max(0.01, 0.025 + deltaGymCoeff));

    const deltaCaffeineCoeff = coefficients[4] || 0;
    caffeineCoeff = Math.min(0.50, Math.max(0.02, 0.15 + deltaCaffeineCoeff));
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
    todayTdee += (sleepQualityCoeff * sleepQualityDiff) + (sleepDurationCoeff * sleepDurationDiff);
  } else {
    todayTdee = todayBmr * palFactor + targetActiveCalories + gymCalories + caffeineCalories;
    if (todaySleepQuality !== null && todaySleepQuality < 60) {
      todayTdee *= 0.95;
    }
    if (todaySleepDuration !== null && todaySleepDuration < 6.5) {
      todayTdee *= 0.95;
    }
  }

  return generateTargets(todayTdee, currentWeight, profile, bmrOffset, sleepQualityCoeff, sleepDurationCoeff, gymVolumeCoeff, caffeineCoeff, calibrationDays, isCalibrated);
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
 */
function generateTargets(
  tdee: number,
  weight: number,
  profile: ZaneProfile,
  bmrOffset: number,
  sleepQualityCoeff: number,
  sleepDurationCoeff: number,
  gymVolumeCoeff: number,
  caffeineCoeff: number,
  calibrationDays: number,
  isCalibrated: boolean
): ZaneOutput {
  // Apply calorie surplus or deficit to reach target weight
  let dailyCalorieTarget = tdee;
  const targetWeight = profile.targetWeight;
  const targetRate = profile.targetRateKgPerWeek ?? 0.5;
  let phase: 'cut' | 'bulk' | 'maintain' = 'maintain';

  if (targetWeight) {
    const weightMargin = 0.2; // 200 grams margin
    const diff = currentWeightDiff(weight, targetWeight);
    
    if (diff > weightMargin) {
      // Lose weight: deficit (each kg is 7700 kcal, so 0.5kg/week = 3850 kcal/week = 550 kcal/day deficit)
      const deficit = (targetRate * 7700) / 7;
      dailyCalorieTarget = Math.max(1200, tdee - deficit); // Ensure minimum 1200 kcal/day safety limit
      phase = 'cut';
    } else if (diff < -weightMargin) {
      // Gain weight: surplus
      const surplus = (targetRate * 7700) / 7;
      dailyCalorieTarget = tdee + surplus;
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

  // 4. Safe guards: hormonal fat safety minimum (0.6g/kg) and glycogen minimum (30g)
  const minFatCalories = (weight * 0.6) * 9;
  if (finalFatCalories < minFatCalories) {
    const diff = minFatCalories - finalFatCalories;
    finalFatCalories = minFatCalories;
    finalCarbCalories = Math.max(30 * 4, finalCarbCalories - diff);
  }

  const minCarbCalories = 30 * 4;
  if (finalCarbCalories < minCarbCalories) {
    const diff = minCarbCalories - finalCarbCalories;
    finalCarbCalories = minCarbCalories;
    finalFatCalories = Math.max(minFatCalories, finalFatCalories - diff);
  }

  const dailyCarbTarget = Math.round(finalCarbCalories / 4);
  const dailyFatTarget = Math.round(finalFatCalories / 9);

  return {
    bmrOffset: Math.round(bmrOffset),
    sleepQualityCoeff: Math.round(sleepQualityCoeff * 10) / 10,
    sleepDurationCoeff: Math.round(sleepDurationCoeff * 10) / 10,
    gymVolumeCoeff: Math.round(gymVolumeCoeff * 1000) / 1000,
    caffeineCoeff: Math.round(caffeineCoeff * 1000) / 1000,
    calculatedAt: new Date().toISOString(),
    isCalibrated,
    calibrationDays,
    dailyCalorieTarget,
    dailyCarbTarget,
    dailyProteinTarget,
    dailyFatTarget
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
  caffeineCoeff: number
): Promise<void> {
  await supabase.from('ml_weights').upsert({
    user_id: userId,
    model_name: 'zane_withabolic_coefficients',
    weights: { bmrOffset, sleepQualityCoeff, sleepDurationCoeff, gymVolumeCoeff, caffeineCoeff },
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,model_name' });
}

export async function loadZaneCoefficients(
  supabase: any,
  userId: string
): Promise<{ bmrOffset: number; sleepQualityCoeff: number; sleepDurationCoeff: number; gymVolumeCoeff: number; caffeineCoeff?: number } | null> {
  const { data } = await supabase.from('ml_weights')
    .select('weights')
    .eq('user_id', userId)
    .eq('model_name', 'zane_withabolic_coefficients')
    .maybeSingle();
  return data?.weights ?? null;
}
