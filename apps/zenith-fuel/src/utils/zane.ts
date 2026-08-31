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
  /**
   * Today's estimated expenditure, and the parts it is made of.
   *
   * App.tsx used to re-implement this forward pass to render its burn card,
   * which meant two independent computations of the same quantity that could
   * (and did) disagree - the burn card showed one figure while the calorie goal
   * was derived from another, differing by a couple of hundred kcal with both
   * labelled "what you burn today".
   *
   * The model owns this calculation; the UI displays it. The components are
   * exposed so a breakdown can be rendered without recomputing anything, and
   * they always sum to todayTdee.
   */
  todayTdee: number;
  todayBreakdown: {
    bmr: number;              // resting
    neat: number;             // everyday movement (PAL uplift over BMR)
    activeCalories: number;   // cardio / running, from wearable
    gymCalories: number;      // strength training
    caffeineCalories: number;
    sleepAdjustment: number;  // relative to this athlete's own average
    weekendAdjustment: number;
    metabolicOffset: number;  // learned bmrOffset
    adaptationPenalty: number; // negative when a long deficit has down-regulated TDEE
  };
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

// ── Creatine ────────────────────────────────────────────────────────────────
//
// Muscle creatine is NOT zero before you supplement. A habitual omnivorous diet
// holds muscle stores at roughly 120 mmol/kg dry mass against a ceiling near 160,
// so the starting point is about 70% of capacity, not 0%. The previous model
// started every athlete at zero and so described someone with no creatine in
// their muscles at all - which is not a state a living person is in. It also made
// the dial read like a loading bar that never filled.
//
// Uptake is not symmetric with washout, which is why one decay constant could not
// describe both. Transport into muscle saturates as stores fill, so the rate
// depends on the headroom left; clearance is a slow first-order decay of the
// excess back toward the dietary baseline, not toward zero. Modelled separately,
// the constants below reproduce the loading protocols in the literature:
//
//   20 g/day  ->  ~96% of the achievable increase in about 5 days
//    5 g/day  ->  ~86% in about 14 days
//    3 g/day  ->  ~79% in about 21 days
//
// and a washout half-life of roughly 23 days once supplementation stops.
export const CREATINE_BASELINE_SATURATION = 0.70;
/** Fraction of the baseline-to-full span taken up per gram, before headroom scaling. */
const CREATINE_UPTAKE_PER_GRAM = 0.011;
/** Daily first-order clearance of the excess above dietary baseline. */
const CREATINE_DAILY_WASHOUT = 0.03;
/** Intracellular water gained going from dietary baseline to fully saturated. */
export const CREATINE_WATER_KG_AT_FULL = 1.2;

/**
 * One day of the creatine model. Saturation is on 0..1 where
 * CREATINE_BASELINE_SATURATION is an unsupplemented diet and 1.0 is full.
 *
 * Single source of truth: the water-retention adjustment below and every UI chart
 * must call this rather than keeping a separately tuned copy.
 */
/**
 * Caffeine thermogenesis, kcal per mg, and the range the fit is allowed to reach.
 *
 * The ceiling matters more than the prior. It used to be 0.50 kcal/mg, and the fit
 * ran to 0.451 - which credited 230 mg of caffeine with 104 kcal a day. Nothing in
 * the literature supports a figure near that; it is four to five times the plausible
 * effect, and it is what a ridge fit produces when caffeine is confounded with
 * training days, because the regression has no way to tell whose calories those are.
 *
 * That number is not cosmetic. caffeineCalories feeds the displayed daily burn and
 * therefore the calorie target, so an inflated coefficient hands back around 80 kcal
 * a day of deficit that was never actually earned.
 */
/**
 * Is a correlation of this size, from this many points, worth reporting at all?
 *
 * A raw |r| threshold cannot answer that, because the same r means completely
 * different things at n = 8 and n = 80. Ten nights of resting heart rate spanning
 * 49-51 bpm produce r = 0.31 with nothing behind it - three distinct integer
 * values is the quantisation floor of the measurement, not a signal - and a flat
 * "0.3 counts as a link" rule would have announced it as one.
 *
 * Standard two-tailed t-test on the correlation coefficient at p < 0.05. The
 * critical-t approximation is accurate to about 0.02 for df >= 4, which is far
 * finer than the decision needs.
 */
export function isCorrelationMeaningful(r: number, n: number): boolean {
  const df = n - 2;
  if (!Number.isFinite(r) || df < 3) return false;
  const rr = Math.min(0.9999, Math.abs(r));
  const t = rr * Math.sqrt(df / (1 - rr * rr));
  const tCrit = 1.96 + 2.36 / df + 3.5 / (df * df);
  return t > tCrit;
}

/**
 * Sleep duration, in kcal per hour away from this athlete's own average night.
 *
 * An hour asleep replaces an hour awake, and the difference is the whole effect.
 * Sleeping metabolic rate runs about 0.93 x BMR; an awake hour, mostly sedentary,
 * about 1.15-1.3 x. At this athlete's ~1,850 kcal BMR that is roughly 72 kcal/h
 * asleep against 89-100 awake, so somewhere between -17 and -29 kcal per hour.
 * Deliberate exercise is already subtracted from the regression target, so the
 * residual this coefficient should carry is at the smaller end.
 *
 * It was previously bounded at +/-50 with a prior of zero, and the fit ran to
 * exactly -50 and stopped there. A coefficient sitting precisely on its clamp is
 * not a measurement, it is the bound being reported back - and -50 claims that
 * every extra hour of sleep costs 50 kcal, so a nine-hour night against a
 * six-hour one would be worth 150.
 *
 * Two things drove it there. Sleep duration correlates with rest days, exactly as
 * caffeine correlates with training days. And more subtly, the two sleep features
 * are collinear by construction: Zenith's sleep SCORE already contains a duration
 * component (see zenithSleepEngine), so quality and duration are close to the same
 * column of the design matrix. Ridge splits collinear columns unstably, which is
 * why they ended up pulling in opposite directions - quality at +0.9 kcal/point
 * while duration sat at -50 kcal/hour.
 */
export const SLEEP_DURATION_KCAL_PER_HOUR_PRIOR = -20;
export const SLEEP_DURATION_KCAL_MIN = -40;
export const SLEEP_DURATION_KCAL_MAX = 5;

/**
 * Sleep quality, in kcal per point of a 0-100 score, away from this athlete's own
 * average night.
 *
 * There is no direct thermic effect of sleeping well; whatever exists runs through
 * moving about more the next day. Its typical spread is about 20 points, so a bound
 * of +/-1.5 still allows a whole standard deviation of sleep quality to be worth
 * +/-30 kcal, which is generous for an indirect effect. The old bound of +/-10
 * allowed that same swing to be worth 200 kcal in either direction.
 */
export const SLEEP_QUALITY_KCAL_PER_POINT_MAX = 1.5;

export const CAFFEINE_KCAL_PER_MG_PRIOR = 0.10;
export const CAFFEINE_KCAL_PER_MG_MIN = 0.02;
export const CAFFEINE_KCAL_PER_MG_MAX = 0.18;

export function creatineSaturationStep(previousSaturation: number, intakeGrams: number): number {
  const span = 1 - CREATINE_BASELINE_SATURATION;
  // Work in "fraction of the achievable increase", which is the quantity that
  // actually behaves exponentially - raw saturation does not, because it starts
  // from a non-zero floor.
  const prior = Number.isFinite(previousSaturation) ? previousSaturation : CREATINE_BASELINE_SATURATION;
  const x = Math.max(0, Math.min(1, (prior - CREATINE_BASELINE_SATURATION) / span));
  const grams = Math.max(0, intakeGrams || 0);

  const uptake = (grams * CREATINE_UPTAKE_PER_GRAM / span) * (1 - x);
  const washout = CREATINE_DAILY_WASHOUT * x;
  const next = Math.max(0, Math.min(1, x + uptake - washout));

  return CREATINE_BASELINE_SATURATION + next * span;
}

/**
 * Water held because of supplementation, in kg.
 *
 * Driven by the increase ABOVE dietary baseline, not by total saturation. The
 * water that comes with normal dietary creatine is already part of an
 * unsupplemented bodyweight, so counting it would subtract nearly a kilogram from
 * the scale reading of someone who has never taken a gram - and that adjusted
 * weight is what the fat-loss trend is measured on.
 */
export function creatineWaterRetentionKg(saturation: number): number {
  const span = 1 - CREATINE_BASELINE_SATURATION;
  const x = Math.max(0, Math.min(1, (saturation - CREATINE_BASELINE_SATURATION) / span));
  return x * CREATINE_WATER_KG_AT_FULL;
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
  // Seeded at the dietary baseline, not zero - see CREATINE_BASELINE_SATURATION.
  let currentSaturation = CREATINE_BASELINE_SATURATION;
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
    // Water from creatine SUPPLEMENTATION only - the water that comes with a normal
    // dietary intake is already in an unsupplemented bodyweight. This previously
    // multiplied total saturation by 1.2 kg, which now that saturation starts at a
    // realistic 0.70 would have silently docked 0.84 kg from every reading.
    // Post-workout gym fluid retention: up to 0.8 kg on heavy gym volume days.
    const gymFluidOffset = Math.min(0.8, (log.gymVolume || 0) * 0.00004);
    const adjustedWeight = rawWeight !== null
      ? rawWeight - creatineWaterRetentionKg(saturation) - gymFluidOffset
      : null;
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
  let sleepDurationCoeff = SLEEP_DURATION_KCAL_PER_HOUR_PRIOR;
  let gymVolumeCoeff = 0.025; // baseline prior (0.025 kcal per kg moved in strength training)
  // Caffeine's thermogenic effect, in kcal per mg. The literature puts a 100 mg dose
  // at roughly a 3-4% rise in energy expenditure for a couple of hours, which works
  // out near 0.10 kcal/mg across the day, with tolerance reducing it on repeated use.
  let caffeineCoeff = CAFFEINE_KCAL_PER_MG_PRIOR;
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
      const baseCaffeineCalories = todayCaffeine * CAFFEINE_KCAL_PER_MG_PRIOR;

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

    // Anchor for sleepDurationCoeff (Feature 2: normalized DELTA prior)
    //
    // A delta from the physiological prior, the same way gym volume and caffeine
    // are handled, rather than an absolute anchor on the previous run's output.
    // That mattered: the old form re-anchored each fit on whatever the last one
    // saved, so once the coefficient reached its clamp it kept anchoring itself
    // there and had no path back. Anchoring on the delta means a run with thin or
    // confounded data falls back toward physiology instead of toward its own
    // previous mistake.
    if (profile.priorSleepDurationCoeff !== undefined) {
      const priorNormD = (profile.priorSleepDurationCoeff - SLEEP_DURATION_KCAL_PER_HOUR_PRIOR) * SLEEP_D_SCALE;
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
      const priorNormC = (profile.priorCaffeineCoeff - CAFFEINE_KCAL_PER_MG_PRIOR) * CAFFEINE_SCALE;
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
    sleepQualityCoeff  = Math.min(SLEEP_QUALITY_KCAL_PER_POINT_MAX, Math.max(-SLEEP_QUALITY_KCAL_PER_POINT_MAX, (coefficients[1] || 0) / SLEEP_Q_SCALE));
    const deltaSleepDurationCoeff = (coefficients[2] || 0) / SLEEP_D_SCALE;
    sleepDurationCoeff = Math.min(SLEEP_DURATION_KCAL_MAX, Math.max(SLEEP_DURATION_KCAL_MIN, SLEEP_DURATION_KCAL_PER_HOUR_PRIOR + deltaSleepDurationCoeff));

    const deltaGymCoeff      = (coefficients[3] || 0) / GYM_VOL_SCALE;
    gymVolumeCoeff  = Math.min(0.10, Math.max(0.01, 0.025 + deltaGymCoeff));

    const deltaCaffeineCoeff = (coefficients[4] || 0) / CAFFEINE_SCALE;
    caffeineCoeff   = Math.min(CAFFEINE_KCAL_PER_MG_MAX, Math.max(CAFFEINE_KCAL_PER_MG_MIN, CAFFEINE_KCAL_PER_MG_PRIOR + deltaCaffeineCoeff));

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
    caffeineCalories = targetCaffeine * CAFFEINE_KCAL_PER_MG_PRIOR;
  }

  let todayTdee;
  let todaySleepAdjustment = 0;
  let todayWeekendAdjustment = 0;
  let todayMetabolicOffset = 0;

  if (isCalibrated) {
    todayMetabolicOffset = bmrOffset;
    const sleepQualityDiff = (todaySleepQuality ?? sleepQualityAvg) - sleepQualityAvg;
    const sleepDurationDiff = (todaySleepDuration ?? sleepDurationAvg) - sleepDurationAvg;
    const isTargetWeekend = [0, 6].includes(new Date(targetDate + 'T12:00:00').getDay()) ? 1 : 0;
    todaySleepAdjustment = (sleepQualityCoeff * sleepQualityDiff) + (sleepDurationCoeff * sleepDurationDiff);
    todayWeekendAdjustment = weekendCoeff * isTargetWeekend;
    todayTdee = todayBmr * palFactor + targetActiveCalories + gymCalories + caffeineCalories
              + todayMetabolicOffset + todaySleepAdjustment + todayWeekendAdjustment;
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

  const preAdaptationTdee = todayTdee;
  todayTdee = Math.round(todayTdee * adaptationFactor);
  const todayAdaptationPenalty = Math.round(todayTdee - preAdaptationTdee);

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
  // Rounded so the displayed parts sum exactly to the displayed total: the
  // breakdown is rendered directly from these, and un-rounded components would
  // visibly fail to add up.
  const roundedNeat = Math.round(todayBmr * palFactor) - Math.round(todayBmr);
  const todayBreakdown = {
    bmr: Math.round(todayBmr),
    neat: roundedNeat,
    activeCalories: Math.round(targetActiveCalories),
    gymCalories: Math.round(gymCalories),
    caffeineCalories: Math.round(caffeineCalories),
    sleepAdjustment: Math.round(todaySleepAdjustment),
    weekendAdjustment: Math.round(todayWeekendAdjustment),
    metabolicOffset: Math.round(todayMetabolicOffset),
    adaptationPenalty: todayAdaptationPenalty,
  };

  return generateTargets(todayTdee, todayBmr, currentWeight, profile, bmrOffset, sleepQualityCoeff, sleepDurationCoeff, gymVolumeCoeff, caffeineCoeff, weekendCoeff, adaptationFactor, sustainedCutDays, calibrationDays, isCalibrated, trendWeightMap, currentTrendWeight, sleepQualityAvg, sleepDurationAvg, energyPerKgTissue, todayBreakdown);
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
export function generateTargets(
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
  energyPerKgTissue: number = 7700,
  todayBreakdown: ZaneOutput['todayBreakdown'] = {
    bmr: Math.round(todayBmr), neat: 0, activeCalories: 0, gymCalories: 0,
    caffeineCalories: 0, sleepAdjustment: 0, weekendAdjustment: 0,
    metabolicOffset: 0, adaptationPenalty: 0
  }
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
    todayTdee: Math.round(tdee),
    todayBreakdown,
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
