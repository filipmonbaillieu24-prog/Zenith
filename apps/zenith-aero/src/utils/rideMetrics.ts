import {
  RidePoint, BestEfforts, BestSpeedEfforts, RideSummary, Ride,
  EFFORT_DURATIONS, SPEED_EFFORT_DURATIONS,
} from '../types/workout';
import { calcPowerZoneTime, calcHRZoneTime, calcCaloriesPower, calcCaloriesHR, calcCaloriesMET } from './zones';
import { detectClimbs } from './climbDetector';
import { classifyDiscipline } from './localNeuralNet';
import { toDateKeyFromDate } from '@zenith/shared';

// ─── Max HR estimation (Tanaka formula) ───────────────────────────────────────

/**
 * Tanaka (2001) formula — more accurate than the classic 220−age:
 *   HRmax = 211 − (0.64 × age)
 * Valid for ages 18–80. Gender has minimal effect per Tanaka et al.
 */
export function estimatedMaxHR(age: number): number {
  return Math.round(211 - 0.64 * age);
}

// ─── Best efforts (sliding window) ───────────────────────────────────────────

/**
 * Finds the best average power for each standard duration using a sliding
 * time window. Returns watts for each duration key in EFFORT_DURATIONS.
 *
 * Time complexity: O(n) per duration using two-pointer approach.
 */
export function calcBestPowerEfforts(points: RidePoint[]): BestEfforts {
  const withPower = points.filter(p => p.power != null && p.time != null);
  if (withPower.length < 5) return {};

  const result: BestEfforts = {};

  for (const { key, seconds } of EFFORT_DURATIONS) {
    const windowMs = seconds * 1000;
    let best = 0;
    let left = 0;
    let sum  = 0;

    for (let right = 0; right < withPower.length; right++) {
      sum += withPower[right].power!;

      while (withPower[right].time - withPower[left].time > windowMs) {
        sum -= withPower[left].power!;
        left++;
      }

      const count = right - left + 1;
      const avg   = sum / count;
      if (avg > best) best = avg;
    }

    if (best > 0) (result as any)[key] = Math.round(best);
  }

  return result;
}

/**
 * Finds the best average speed (km/h) for each standard duration.
 * Used as a progression metric for riders without a power meter.
 */
export function calcBestSpeedEfforts(points: RidePoint[]): BestSpeedEfforts {
  const withSpeed = points.filter(p => p.speed != null && p.time != null);
  if (withSpeed.length < 5) return {};

  const result: BestSpeedEfforts = {};

  for (const { key, seconds } of SPEED_EFFORT_DURATIONS) {
    const windowMs = seconds * 1000;
    let best = 0;
    let left = 0;
    let sum  = 0;

    for (let right = 0; right < withSpeed.length; right++) {
      sum += withSpeed[right].speed!;

      while (withSpeed[right].time - withSpeed[left].time > windowMs) {
        sum -= withSpeed[left].speed!;
        left++;
      }

      const count = right - left + 1;
      const avg   = sum / count;
      if (avg > best) best = avg;
    }

    // Convert m/s → km/h and store
    if (best > 0) (result as any)[key] = parseFloat((best * 3.6).toFixed(1));
  }

  return result;
}

// ─── Normalized Power ─────────────────────────────────────────────────────────

/**
 * Normalized Power (NP) — Allen & Coggan formula:
 *  1. 30-second rolling average of power
 *  2. Raise each value to the 4th power
 *  3. Take the average
 *  4. Take the 4th root
 *
 * NP is a better indicator of physiological cost than average power,
 * because it accounts for the non-linear nature of effort at high intensities.
 */
export function calcNormalizedPower(points: RidePoint[]): number | undefined {
  const pwr = points.map(p => p.power ?? 0);
  if (pwr.length < 30) return undefined;

  // O(n) rolling 30-second average
  const WINDOW = 30;
  const rolling: number[] = [];
  let rollingSum = 0;

  for (let i = 0; i < pwr.length; i++) {
    rollingSum += pwr[i];
    if (i >= WINDOW) rollingSum -= pwr[i - WINDOW];
    if (i >= WINDOW - 1) rolling.push(rollingSum / WINDOW);
  }

  const fourthPowerAvg = rolling.reduce((acc, v) => acc + v ** 4, 0) / rolling.length;
  return Math.round(fourthPowerAvg ** 0.25);
}

// ─── eFTP (estimated FTP) ─────────────────────────────────────────────────────

/**
 * eFTP = 95% of best 20-minute power.
 * This is the standard field estimate used by Strava, TrainingPeaks, etc.
 * Requires at least one ride with ≥20 minutes of power data.
 */
export function estimateFTP(bestEfforts: BestEfforts): number | undefined {
  if (!bestEfforts.m20) return undefined;
  return Math.round(bestEfforts.m20 * 0.95);
}

/**
 * Estimates FTP across ALL rides by finding the global best 20-min effort.
 * Returns the most current eFTP.
 */
export function estimateGlobalFTP(allBests: BestEfforts[]): number | undefined {
  const best20 = Math.max(...allBests.map(b => b.m20 ?? 0));
  if (best20 === 0) return undefined;
  return Math.round(best20 * 0.95);
}

// ─── LTHR (Lactate Threshold Heart Rate) ──────────────────────────────────────

/**
 * eLTHR = best 20-minute average heart rate × 0.95
 * Similar logic to eFTP but applied to HR.
 *
 * "Best 20-min HR" means the highest average HR maintained for 20 minutes —
 * found in threshold/race efforts, not easy recovery rides.
 */
export function estimateLTHR(points: RidePoint[]): number | undefined {
  const withHR = points.filter(p => p.hr != null && p.hr! > 60 && p.time != null);
  if (withHR.length < 5) return undefined;

  const windowMs = 20 * 60 * 1000; // 20 min
  let best = 0;
  let left = 0;
  let sum  = 0;

  for (let right = 0; right < withHR.length; right++) {
    sum += withHR[right].hr!;
    while (withHR[right].time - withHR[left].time > windowMs) {
      sum -= withHR[left].hr!;
      left++;
    }
    const avg = sum / (right - left + 1);
    if (avg > best) best = avg;
  }

  return best > 0 ? Math.round(best * 0.95) : undefined;
}

// ─── hrTSS (HR-based Training Stress Score) ───────────────────────────────────

/**
 * hrTSS via Banister TRIMP — gender-specific coefficients (Banister 1991):
 *
 *   Males:   load = δt × HRR × 0.64 × e^(1.92 × HRR)
 *   Females: load = δt × HRR × 0.86 × e^(1.67 × HRR)
 *
 * HRR = (HR − HRrest) / (LTHR − HRrest)  — Heart Rate Reserve ratio.
 * Normalised to 100 = 1 hour at threshold effort (same scale as TSS).
 */
export function calcHrTSS(
  points:  RidePoint[],
  lthr:    number,
  hrRest = 50,
  gender: 'male' | 'female' | 'other' = 'male',
): number | undefined {
  const withHR = points.filter(p => p.hr != null && p.hr! > hrRest && p.time != null);
  if (withHR.length < 5) return undefined;

  // Banister coefficients
  const a = gender === 'female' ? 0.86 : 0.64;
  const b = gender === 'female' ? 1.67 : 1.92;

  let trimp = 0;
  for (let i = 1; i < withHR.length; i++) {
    const dtSec = (withHR[i].time - withHR[i - 1].time) / 1000;
    if (dtSec > 60) continue;
    const hrr     = (withHR[i].hr! - hrRest) / (lthr - hrRest);
    const clamped = Math.max(0, Math.min(hrr, 1.5));
    trimp += (dtSec / 60) * clamped * a * Math.exp(b * clamped);
  }

  const normHour = 60 * 1 * a * Math.exp(b * 1);
  return Math.round((trimp / normHour) * 100);
}

// ─── Power-based TSS ──────────────────────────────────────────────────────────

/**
 * TSS = (duration_s × NP × IF) / (FTP × 3600) × 100
 * 100 TSS ≈ 1 hour at FTP.
 */
export function calcTSS(durationSec: number, normPower: number, ftp: number): number {
  const intensityFactor = normPower / ftp;
  return Math.round((durationSec * normPower * intensityFactor) / (ftp * 3600) * 100);
}

// ─── VO₂max estimate ─────────────────────────────────────────────────────────

/**
 * Looks up the user's weight for a specific date.
 * Checks the profile's weightHistory array for the most recent measurement
 * on or before the given date (in milliseconds).
 */
export function getWeightForDate(profile: any, dateMs: number): number | undefined {
  if (profile.weightHistory && Array.isArray(profile.weightHistory) && profile.weightHistory.length > 0) {
    // Sort history by date (newest to oldest)
    const sorted = [...profile.weightHistory].sort((a, b) => b.date.localeCompare(a.date));
    const targetDate = toDateKeyFromDate(new Date(dateMs));
    // Find the first measurement that is <= targetDate
    const entry = sorted.find(e => e.date <= targetDate);
    if (entry) return entry.weight;
  }
  return profile.weight;
}

/**
 * Estimate VO₂max from FTP and body weight (Coggan / Hawley):
 *   VO₂max ≈ (eFTP / weight) × 10.8 + 7      [Hawley & Noakes 1992]
 * Typical values: untrained 30–40, amateur 45–55, elite 60–75, pro >75 ml/kg/min.
 */
export function estimateVO2max(ftpW: number, weightKg: number): number {
  return parseFloat(((ftpW / weightKg) * 10.8 + 7).toFixed(1));
}

/**
 * Cycling W/kg performance category (based on peak 5-min W/kg):
 * Pro >5.7 | Cat1 4.7-5.7 | Cat2 4.0-4.7 | Cat3 3.2-4.0 | Cat4 2.5-3.2 | Cat5 <2.5
 */
export function cyclingCategory(wpkg: number): { label: string; color: string } {
  if (wpkg >= 5.7) return { label: 'Pro / World Tour',  color: '#6c5ce7' };
  if (wpkg >= 4.7) return { label: 'Cat 1',             color: '#a29bfe' };
  if (wpkg >= 4.0) return { label: 'Cat 2',             color: '#00b894' };
  if (wpkg >= 3.2) return { label: 'Cat 3',             color: '#fdcb6e' };
  if (wpkg >= 2.5) return { label: 'Cat 4',             color: '#e17055' };
  return                   { label: 'Cat 5 / Recreational', color: '#b2bec3' };
}

// ─── Efficiency Factor ────────────────────────────────────────────────────────

/**
 * Efficiency Factor (EF) shows how much work output you get per heartbeat.
 *
 *   With power:   EF = NP / avgHR          (higher = more efficient)
 *   Without power: EF = avgSpeed / avgHR   (km/h per bpm — normalized)
 *
 * Increasing EF over time is the clearest sign of aerobic improvement
 * for riders without a power meter.
 */
export function calcEfficiencyFactor(
  normPowerOrSpeed: number,
  avgHR: number,
): number {
  if (avgHR <= 0) return 0;
  return parseFloat((normPowerOrSpeed / avgHR).toFixed(3));
}

// ─── Cardiac Decoupling ───────────────────────────────────────────────────────

/**
 * Cardiac decoupling (Pw:HR or Pa:HR) measures aerobic efficiency during a ride.
 *
 * Compares the EF of the first half vs the second half:
 *   decoupling (%) = ((EF_first - EF_second) / EF_first) × 100
 *
 * < 5%  = good aerobic conditioning (HR stays stable relative to output)
 * > 5%  = cardiac drift — HR rising while output stays same (fatigue / heat)
 *
 * Improving decoupling over weeks = improving aerobic base fitness.
 */
export function calcDecoupling(points: RidePoint[], hasPower: boolean): number | undefined {
  const withData = points.filter(p =>
    p.hr != null && p.hr! > 50 && p.time != null &&
    (hasPower ? p.power != null : p.speed != null)
  );
  if (withData.length < 60) return undefined;

  const mid  = Math.floor(withData.length / 2);
  const first  = withData.slice(0, mid);
  const second = withData.slice(mid);

  const efOf = (arr: RidePoint[]) => {
    const avgOutput = arr.reduce((s, p) => s + (hasPower ? (p.power ?? 0) : (p.speed ?? 0)), 0) / arr.length;
    const avgHR     = arr.reduce((s, p) => s + p.hr!, 0) / arr.length;
    return avgHR > 0 ? avgOutput / avgHR : 0;
  };

  const ef1 = efOf(first);
  const ef2 = efOf(second);
  if (ef1 === 0) return undefined;

  return parseFloat(((ef1 - ef2) / ef1 * 100).toFixed(1));
}

// ─── VAM (Velocità Ascensionale Media) ───────────────────────────────────────

/**
 * VAM = total elevation gained (m) / time (hours)
 * Useful for comparing climbing performance on hills without power or HR.
 * Elite climbers: 1200–1600 m/h. Amateur: 500–900 m/h.
 */
export function calcVAM(points: RidePoint[]): number | undefined {
  const withEle = points.filter(p => p.ele != null);
  if (withEle.length < 10) return undefined;

  let totalGain = 0;
  for (let i = 1; i < withEle.length; i++) {
    const diff = withEle[i].ele! - withEle[i - 1].ele!;
    if (diff > 0) totalGain += diff;
  }

  const durationHours =
    (withEle[withEle.length - 1].time - withEle[0].time) / 3_600_000;

  if (durationHours <= 0 || totalGain < 10) return undefined;
  return Math.round(totalGain / durationHours);
}

// ─── Advanced progression algorithms (Phase 2) ───────────────────────────────

export function determinePhenotype(bestEfforts: BestEfforts, weight?: number): string {
  const w = weight ?? 75; // fallback weight
  const p5s = bestEfforts.s5 ?? 0;
  const p1m = bestEfforts.m1 ?? 0;
  const p5m = bestEfforts.m5 ?? 0;
  const p20m = bestEfforts.m20 ?? 0;

  if (p5s === 0 && p1m === 0 && p5m === 0 && p20m === 0) return 'Allrounder';

  const w5s = p5s / w;
  const w1m = p1m / w;
  const w5m = p5m / w;
  const w20m = p20m / w;

  // Schaling volgens Coggan's vermogensprofiel-tabel
  const sprinterScore = w5s / 16.0;
  const puncheurScore = w1m / 8.5;
  const vo2maxScore = w5m / 5.5;
  const timeTrialScore = w20m / 4.8;

  const maxScore = Math.max(sprinterScore, puncheurScore, vo2maxScore, timeTrialScore);

  if (maxScore === sprinterScore) return 'Sprinter';
  if (maxScore === puncheurScore) return 'Puncheur';
  if (maxScore === timeTrialScore) return 'Time Trial Specialist';
  return 'Climber';
}

export function calcPowerUnderFatigue(
  points: RidePoint[],
  durationSecs: number
): { fresh?: number; fatigued?: number } {
  const hasPower = points.some(p => p.power != null);
  if (!hasPower) return {};

  const pwrPts = points.filter(p => p.power != null && p.time != null);
  if (pwrPts.length < durationSecs) return {};

  const windowMs = durationSecs * 1000;
  let freshBest = 0;
  let fatiguedBest = 0;
  let left = 0;
  let sum = 0;

  // Bereken cumulatieve kJ op elk punt
  const kjAtPoint = new Array<number>(pwrPts.length).fill(0);
  let kjAccum = 0;
  for (let i = 0; i < pwrPts.length; i++) {
    if (i > 0) {
      const dt = (pwrPts[i].time - pwrPts[i - 1].time) / 1000;
      if (dt > 0 && dt < 10) {
        kjAccum += (pwrPts[i].power! * dt) / 1000;
      }
    }
    kjAtPoint[i] = kjAccum;
  }

  for (let right = 0; right < pwrPts.length; right++) {
    sum += pwrPts[right].power!;

    while (pwrPts[right].time - pwrPts[left].time > windowMs) {
      sum -= pwrPts[left].power!;
      left++;
    }

    const count = right - left + 1;
    const avg = sum / count;

    // Dynamische vermoeidheidsthreshold: 1000 kJ voor lange rides, 50% van totaal kJ voor kortere rides
    const fatigueThreshold = kjAccum > 1200 ? 1000 : (kjAccum * 0.5);
    const startKJ = kjAtPoint[left];
    if (startKJ < fatigueThreshold) {
      if (avg > freshBest) freshBest = avg;
    } else {
      if (avg > fatiguedBest) fatiguedBest = avg;
    }
  }

  return {
    fresh: freshBest > 0 ? Math.round(freshBest) : undefined,
    fatigued: fatiguedBest > 0 ? Math.round(fatiguedBest) : undefined,
  };
}

// ─── Full ride computation ────────────────────────────────────────────────────

/**
 * Computes all metrics from raw RidePoint[] and returns a complete Ride object.
 * Profile fields (gender, age, weight) improve TRIMP, VO₂max, and W/kg accuracy.
 */
/**
 * Schat het geleverde vermogen (wattage) voor elk punt in de ride op basis van
 * een natuurkundig model (rolweerstand, luchtweerstand en zwaartekracht) en hartslag.
 */
export function estimatePowerForPoints(
  points: RidePoint[],
  opts: {
    weight?: number;
    ftp?: number;
    maxHR?: number;
    hrRest?: number;
  }
) {
  const weight = opts.weight ?? 75;
  const ftp = opts.ftp ?? 250;
  const maxHR = opts.maxHR ?? 190;
  const hrRest = opts.hrRest ?? 50;

  // Systeemgewicht (atleet + kleding + fiets + uitrusting)
  const sysMass = weight + 9.5; 
  const CdA = 0.32; // aerodynamische coefficient voor sportieve fietser
  const rho = 1.226; // luchtdichtheid in kg/m3
  const Cr = 0.004; // rolweerstandcoefficient

  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const prev = points[i - 1];

    const dtMs = curr.time - prev.time;
    if (dtMs <= 0 || dtMs > 15000) {
      curr.power = 0;
      continue;
    }

    const dDist = (curr.distance ?? 0) - (prev.distance ?? 0);
    
    // Bereken snelheid (m/s)
    let v = curr.speed != null ? curr.speed : (dDist / (dtMs / 1000));
    if (v < 0 || isNaN(v)) v = 0;
    if (v > 25) v = 25; // max 90 km/h

    // Bereken helling
    let slope = 0;
    if (dDist > 0.5 && curr.ele != null && prev.ele != null) {
      slope = (curr.ele - prev.ele) / dDist;
      slope = Math.max(-0.15, Math.min(0.25, slope));
    }

    // Natuurkundig model (weerstandskrachten)
    const F_gravity = sysMass * 9.81 * slope;
    const F_rolling = Cr * sysMass * 9.81;
    const F_air = 0.5 * CdA * rho * (v ** 2);
    
    const F_total = F_gravity + F_rolling + F_air;
    let P_physics = F_total * v;
    P_physics = Math.max(0, Math.min(1000, P_physics));

    // Heart Ratemodel (indien HR data beschikbaar is)
    let P_hr: number | undefined;
    if (curr.hr != null && curr.hr > hrRest) {
      const hrPct = Math.max(0, Math.min(1.0, (curr.hr - hrRest) / (maxHR - hrRest)));
      // Kwadratisch model voor hartslag-vermogen relatie
      P_hr = ftp * (hrPct ** 1.4) * 1.25;
      P_hr = Math.max(0, Math.min(1000, P_hr));
    }

    // Gewogen combinatie
    let P_final = P_physics;
    if (P_hr !== undefined) {
      P_final = 0.65 * P_physics + 0.35 * P_hr;
    }

    curr.power = Math.round(P_final);
  }

  // Eerste punt krijgt dezelfde waarde als het tweede punt
  if (points.length > 1) {
    points[0].power = points[1].power;
  }
}

function isGenericFilename(name: string): boolean {
  const lower = name.toLowerCase();
  
  // Check if it matches the auto-generated pattern so we can re-generate/update it on recalculate
  const isAutoPattern = /^(Morning|Afternoon|Evening|Night) (Road ride|Gravel ride|MTB ride|ride) \(\d+(\.\d+)? km\)$/.test(name);
  if (isAutoPattern) return true;

  return (
    lower.startsWith('geoid') ||
    lower.startsWith('activity') ||
    lower.startsWith('fit_') ||
    lower.startsWith('gpx_') ||
    /^\d+$/.test(name) ||
    /^\d{4}-\d{2}-\d{2}/.test(name) ||
    (name.length > 25 && (name.includes('_') || name.includes('-'))) ||
    name.endsWith('.fit') || name.endsWith('.gpx') || name.endsWith('.tcx')
  );
}

function getAutoRideName(dateMs: number, discipline: string, distanceKm: number): string {
  const date = new Date(dateMs);
  const hour = date.getHours();
  let tod = "Night";
  if (hour >= 5 && hour < 12) tod = "Morning";
  else if (hour >= 12 && hour < 17) tod = "Afternoon";
  else if (hour >= 17 && hour < 22) tod = "Evening";

  let disc = "ride";
  if (discipline === 'road') disc = "Road ride";
  else if (discipline === 'gravel') disc = "Gravel ride";
  else if (discipline === 'mtb') disc = "MTB ride";

  return `${tod} ${disc} (${distanceKm.toFixed(1)} km)`;
}

export function computeRide(
  id: string,
  name: string,
  points: RidePoint[],
  opts: {
    ftp?:    number;
    lthr?:   number;
    maxHR?:  number;
    hrRest?: number;
    gender?: 'male' | 'female' | 'other';
    age?:    number;
    weight?: number;
  } = {},
): Ride {
  const { ftp, lthr, hrRest = 50, gender = 'male', age } = opts;
  // Auto-estimate maxHR from age if not provided
  const useMaxHR = opts.maxHR ?? (age ? estimatedMaxHR(age) : undefined);

  let hasPower  = points.some(p => p.power != null);
  const hasHR     = points.some(p => p.hr    != null);
  const hasGPS    = points.some(p => p.lat   != null);
  const hasSpeed  = points.some(p => p.speed != null);

  let isEstimatedPower = false;
  if (!hasPower && points.length > 2) {
    estimatePowerForPoints(points, {
      weight: opts.weight ?? 75,
      ftp: ftp ?? 250,
      maxHR: useMaxHR,
      hrRest: hrRest
    });
    hasPower = true;
    isEstimatedPower = true;
  }

  // ── Basic stats ──────────────────────────────────────────────────────────
  const validPts  = points.filter(p => p.distance != null);
  const distance  = validPts.length > 0
    ? (validPts[validPts.length - 1].distance! / 1000)
    : 0;

  const startTime = points[0]?.time ?? 0;
  const endTime   = points[points.length - 1]?.time ?? 0;
  const duration  = (endTime - startTime) / 1000; // seconds

  // Elevation gain
  let elevGain = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].ele != null && points[i - 1].ele != null) {
      const d = points[i].ele! - points[i - 1].ele!;
      if (d > 0) elevGain += d;
    }
  }

  // Speed — stored as m/s, convert to km/h
  const speedPts  = points.filter(p => p.speed != null);
  const avgSpeed  = speedPts.length > 0
    ? parseFloat((speedPts.reduce((s, p) => s + p.speed!, 0) / speedPts.length * 3.6).toFixed(1))
    : (duration > 0 ? parseFloat((distance / (duration / 3600)).toFixed(1)) : 0);
  const maxSpeed  = speedPts.length > 0
    ? parseFloat((Math.max(...speedPts.map(p => p.speed!)) * 3.6).toFixed(1))
    : undefined;

  // ── Power metrics ────────────────────────────────────────────────────────
  const bestEfforts     = calcBestPowerEfforts(points);
  const normPower       = hasPower ? calcNormalizedPower(points) : undefined;
  const avgPower        = hasPower
    ? Math.round(points.filter(p => p.power != null).reduce((s, p) => s + p.power!, 0) /
        points.filter(p => p.power != null).length)
    : undefined;
  const maxPower        = hasPower
    ? Math.max(...points.filter(p => p.power != null).map(p => p.power!))
    : undefined;
  const eFTP            = estimateFTP(bestEfforts);
  const tss             = normPower && (ftp ?? eFTP)
    ? calcTSS(duration, normPower, ftp ?? eFTP!)
    : undefined;
  const intensityFactor = normPower && (ftp ?? eFTP)
    ? parseFloat((normPower / (ftp ?? eFTP!)).toFixed(3))
    : undefined;

  // ── HR metrics ───────────────────────────────────────────────────────────
  const hrPts    = points.filter(p => p.hr != null && p.hr! > 40);
  const avgHR    = hrPts.length > 0
    ? Math.round(hrPts.reduce((s, p) => s + p.hr!, 0) / hrPts.length)
    : undefined;
  const maxHR    = hrPts.length > 0
    ? Math.max(...hrPts.map(p => p.hr!))
    : undefined;
  const autoLTHR = estimateLTHR(points);
  const useLTHR  = lthr ?? autoLTHR
    // Fall back: if maxHR known, use 90% as LTHR estimate (Friel method)
    ?? (useMaxHR ? Math.round(useMaxHR * 0.90) : undefined);
  const hrTSS    = hasHR && useLTHR
    ? calcHrTSS(points, useLTHR, hrRest, gender)
    : undefined;

  // Efficiency Factor
  const efBase = normPower ?? (hasSpeed ? avgSpeed : undefined);
  const efficiencyFactor = efBase && avgHR
    ? calcEfficiencyFactor(efBase, avgHR)
    : undefined;

  // Cardiac decoupling
  const decoupling = hasHR
    ? calcDecoupling(points, hasPower)
    : undefined;

  // ── Cadence ──────────────────────────────────────────────────────────────
  const cadPts   = points.filter(p => p.cadence != null && p.cadence! > 0);
  const avgCadence = cadPts.length > 0
    ? Math.round(cadPts.reduce((s, p) => s + p.cadence!, 0) / cadPts.length)
    : undefined;

  // ── Speed efforts & VAM ──────────────────────────────────────────────────
  const bestSpeedEfforts = calcBestSpeedEfforts(points);
  const vam              = calcVAM(points);

  // ── Zone time ─────────────────────────────────────────────────────────────
  const useFTP         = ftp ?? eFTP;
  const powerZoneTime  = hasPower && useFTP ? calcPowerZoneTime(points, useFTP) : undefined;
  
  const hrZoneTime     = hasHR && useLTHR ? calcHRZoneTime(points, useLTHR) : undefined;

  // ── Calories ──────────────────────────────────────────────────────────────
  let calories: number | undefined;
  if (hasPower) {
    calories = calcCaloriesPower(points);
  } else if (hasHR && opts.weight && age) {
    const g = gender === 'female' ? 'female' : 'male';
    calories = calcCaloriesHR(points, opts.weight, age, g) || undefined;
  } else if (opts.weight) {
    calories = calcCaloriesMET(avgSpeed, duration, opts.weight);
  }

  // ── Variability Index ─────────────────────────────────────────────────────
  const variabilityIndex = normPower && avgPower && avgPower > 0
    ? parseFloat((normPower / avgPower).toFixed(3))
    : undefined;

  // ── First / second half splits ────────────────────────────────────────────
  const midTime    = startTime + (endTime - startTime) / 2;
  const firstHalf  = points.filter(p => p.time <= midTime);
  const secondHalf = points.filter(p => p.time >  midTime);

  const halfAvgPower = (pts: RidePoint[]) => {
    const pp = pts.filter(p => p.power != null);
    return pp.length > 0 ? Math.round(pp.reduce((s, p) => s + p.power!, 0) / pp.length) : undefined;
  };
  const halfAvgHR = (pts: RidePoint[]) => {
    const hp = pts.filter(p => p.hr != null && p.hr! > 40);
    return hp.length > 0 ? Math.round(hp.reduce((s, p) => s + p.hr!, 0) / hp.length) : undefined;
  };
  const halfAvgSpeed = (pts: RidePoint[]) => {
    const sp = pts.filter(p => p.speed != null);
    return sp.length > 0 ? parseFloat((sp.reduce((s, p) => s + p.speed!, 0) / sp.length * 3.6).toFixed(1)) : undefined;
  };

  const firstHalfPower  = hasPower ? halfAvgPower(firstHalf)  : undefined;
  const secondHalfPower = hasPower ? halfAvgPower(secondHalf) : undefined;
  const firstHalfHR     = hasHR   ? halfAvgHR(firstHalf)     : undefined;
  const secondHalfHR    = hasHR   ? halfAvgHR(secondHalf)    : undefined;
  const firstHalfSpeed  = halfAvgSpeed(firstHalf);
  const secondHalfSpeed = halfAvgSpeed(secondHalf);

  // ── Heart Rate Recovery (HRR-60) ──────────────────────────────────────────
  let hrRecovery60: number | undefined;
  if (hasHR && hrPts.length > 10) {
    // Find index of peak HR
    let peakIdx = 0;
    let peakHR  = 0;
    for (let i = 0; i < hrPts.length; i++) {
      if (hrPts[i].hr! > peakHR) { peakHR = hrPts[i].hr!; peakIdx = i; }
    }
    // Find HR ~60 seconds after peak
    const peakTime   = hrPts[peakIdx].time;
    const targetTime = peakTime + 60000;
    const after60    = hrPts.find(p => p.time >= targetTime);
    if (after60 && peakHR - after60.hr! > 0) {
      hrRecovery60 = peakHR - after60.hr!;
    }
  }

  // ── Advanced progression metrics (Phase 2) ─────────────────────────────────

  // 1. Totale kJ
  const pwrPts = points.filter(p => p.power != null && p.time != null);
  let kjAccum = 0;
  for (let i = 1; i < pwrPts.length; i++) {
    const dt = (pwrPts[i].time - pwrPts[i - 1].time) / 1000;
    if (dt > 0 && dt < 10) kjAccum += (pwrPts[i].power! * dt) / 1000;
  }
  const kjTotal = hasPower ? Math.round(kjAccum) : undefined;

  // 2. Power under fatigue (5m en 20m)
  const pwr5 = hasPower ? calcPowerUnderFatigue(points, 300) : {};
  const pwr20 = hasPower ? calcPowerUnderFatigue(points, 1200) : {};
  const fresh5minPower = pwr5.fresh;
  const fatigued5minPower = pwr5.fatigued;
  const fresh20minPower = pwr20.fresh;
  const fatigued20minPower = pwr20.fatigued;

  // 3. Phenotype
  const phenotype = determinePhenotype(bestEfforts, opts.weight);

  // 4. Cardiac Cost (beats per meter)
  const cardiacCost = avgHR && duration > 0 && distance > 0
    ? parseFloat(((avgHR * (duration / 60)) / (distance * 1000)).toFixed(4))
    : undefined;

  // 5. Climbing avg HR
  const climbs = detectClimbs(points);
  let climbingAvgHR: number | undefined;
  if (hasHR && climbs.length > 0) {
    let climbHrSum = 0;
    let climbHrCount = 0;
    for (const climb of climbs) {
      const climbPts = points.slice(climb.startIndex, climb.endIndex + 1);
      const hrs = climbPts.filter(p => p.hr != null && p.hr! > 40);
      for (const pt of hrs) {
        climbHrSum += pt.hr!;
        climbHrCount++;
      }
    }
    if (climbHrCount > 0) climbingAvgHR = Math.round(climbHrSum / climbHrCount);
  }

  // 6. Active HR Decay Rate
  let activeHRDecayRate: number | undefined;
  if (hasHR && hrPts.length > 10) {
    let peakIdx = 0;
    let peakHR = 0;
    for (let i = 0; i < hrPts.length; i++) {
      if (hrPts[i].hr! > peakHR) { peakHR = hrPts[i].hr!; peakIdx = i; }
    }
    const peakTime = hrPts[peakIdx].time;
    const targetTime = peakTime + 120000;
    const after120 = hrPts.find(p => p.time >= targetTime && p.time <= peakTime + 150000);
    if (after120 && peakHR - after120.hr! > 0) {
      activeHRDecayRate = Math.round((peakHR - after120.hr!) / 2);
    }
  }

  // 7. Cadence Efficiency Sweetspot
  let cadenceEfficiencySweetspot: number | undefined;
  if (hasPower && hasHR && points.some(p => p.cadence != null)) {
    const effPts = points.filter(p => p.power && p.power > 120 && p.hr && p.hr > 60 && p.cadence && p.cadence > 45);
    if (effPts.length > 30) {
      const buckets = new Map<number, { sumRatio: number, count: number }>();
      for (const p of effPts) {
        const bucketKey = Math.floor(p.cadence! / 10) * 10;
        if (bucketKey >= 50 && bucketKey <= 110) {
          const cur = buckets.get(bucketKey) ?? { sumRatio: 0, count: 0 };
          buckets.set(bucketKey, {
            sumRatio: cur.sumRatio + (p.hr! / p.power!),
            count: cur.count + 1,
          });
        }
      }
      let bestBucket = -1;
      let minRatio = Infinity;
      buckets.forEach((val, key) => {
        if (val.count >= 10) {
          const avg = val.sumRatio / val.count;
          if (avg < minRatio) {
            minRatio = avg;
            bestBucket = key;
          }
        }
      });
      if (bestBucket !== -1) cadenceEfficiencySweetspot = bestBucket + 5;
    }
  }

  const discipline = classifyDiscipline(avgSpeed, elevGain, distance);
  let finalName = name;
  if (isGenericFilename(name)) {
    finalName = getAutoRideName(startTime, discipline, distance);
  }

  const summary: RideSummary = {
    id, name: finalName,
    date:     startTime,
    distance: parseFloat(distance.toFixed(2)),
    duration: Math.round(duration),
    elevGain: Math.round(elevGain),
    avgSpeed: parseFloat(avgSpeed.toFixed(1)),
    maxSpeed: maxSpeed != null ? parseFloat(maxSpeed.toFixed(1)) : undefined,
    avgPower, normPower, maxPower, tss, intensityFactor, eFTP,
    avgHR, maxHR, hrTSS, efficiencyFactor, decoupling,
    avgCadence, vam,
    powerZoneTime, hrZoneTime, calories,
    variabilityIndex, firstHalfPower, secondHalfPower, firstHalfHR, secondHalfHR, firstHalfSpeed, secondHalfSpeed, hrRecovery60,
    phenotype, kjTotal, fresh5minPower, fatigued5minPower, fresh20minPower, fatigued20minPower, cardiacCost, climbingAvgHR, activeHRDecayRate, cadenceEfficiencySweetspot,
    weight: opts.weight,
    hasPower, hasHR, hasGPS,
    isEstimatedPower,
    discipline,
  };

  return { ...summary, points, bestEfforts, bestSpeedEfforts };
}

