import { RidePoint, POWER_ZONES, HR_ZONES } from '../types/workout';

// ─── Zone time calculation ────────────────────────────────────────────────────

/**
 * Calculates seconds spent in each Coggan power zone (Z1–Z6).
 * Returns an array of 6 values, index 0 = Zone 1.
 */
export function calcPowerZoneTime(points: RidePoint[], ftp: number): number[] {
  const times = [0, 0, 0, 0, 0, 0];

  for (let i = 1; i < points.length; i++) {
    const p    = points[i];
    if (p.power == null) continue;
    const dt   = (p.time - points[i - 1].time) / 1000;
    if (dt > 60 || dt <= 0) continue;

    const pct  = (p.power / ftp) * 100;
    const zone = POWER_ZONES.findIndex(z => pct >= z.minPct && pct <= z.maxPct);
    if (zone >= 0) times[zone] += dt;
  }
  return times;
}

/**
 * Calculates seconds spent in each HR zone (Z1–Z5).
 * Uses % of LTHR (Lactate Threshold HR).
 * Returns an array of 5 values, index 0 = Zone 1.
 */
export function calcHRZoneTime(
  points: RidePoint[],
  lthr:   number,
): number[] {
  const times = [0, 0, 0, 0, 0];

  for (let i = 1; i < points.length; i++) {
    const p  = points[i];
    if (p.hr == null) continue;
    const dt = (p.time - points[i - 1].time) / 1000;
    if (dt > 60 || dt <= 0) continue;

    const pct  = (p.hr / lthr) * 100;
    const zone = HR_ZONES.findIndex(z => pct >= z.minPct && pct <= z.maxPct);
    if (zone >= 0) times[zone] += dt;
  }
  return times;
}

// ─── Calorie calculation ──────────────────────────────────────────────────────

/**
 * Power-based calorie estimate (most accurate method):
 *   kcal ≈ kJ_output / efficiency
 * Cycling mechanical efficiency is ~22–26%. We use 0.239 as the conversion
 * factor, which is the standard used by Garmin, TrainingPeaks, etc.
 * (1 kJ mechanical = 1 kcal food energy, because efficiency losses are
 *  already accounted for by the power meter measuring actual output.)
 *
 * In practice: 1 kJ of measured power ≈ 1 kcal consumed.
 */
export function calcCaloriesPower(points: RidePoint[]): number {
  let kj = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].power == null) continue;
    const dt = (points[i].time - points[i - 1].time) / 1000;
    if (dt > 60 || dt <= 0) continue;
    kj += (points[i].power! * dt) / 1000;
  }
  // 1 kJ mechanical output ≈ 1 kcal (net caloric cost for cycling)
  return Math.round(kj);
}

/**
 * HR-based calorie estimate (Keytel et al. 2005):
 *   Males:   Cal/min = (−55.0969 + 0.6309·HR + 0.1988·weight + 0.2017·age) / 4.184
 *   Females: Cal/min = (−20.4022 + 0.4472·HR − 0.1263·weight + 0.074·age)  / 4.184
 *
 * Only valid when HR > 90 bpm (aerobic range).
 */
export function calcCaloriesHR(
  points:  RidePoint[],
  weight:  number,
  age:     number,
  gender:  'male' | 'female' | 'other' = 'male',
): number {
  let totalMin = 0;
  let kcal     = 0;

  for (let i = 1; i < points.length; i++) {
    const hr = points[i].hr;
    if (hr == null || hr < 90) continue;
    const dtMin = (points[i].time - points[i - 1].time) / 60000;
    if (dtMin > 1 || dtMin <= 0) continue;

    let ratePerMin: number;
    if (gender === 'female') {
      ratePerMin = (-20.4022 + 0.4472 * hr - 0.1263 * weight + 0.074 * age) / 4.184;
    } else {
      ratePerMin = (-55.0969 + 0.6309 * hr + 0.1988 * weight + 0.2017 * age) / 4.184;
    }
    if (ratePerMin > 0) {
      kcal     += ratePerMin * dtMin;
      totalMin += dtMin;
    }
  }

  return totalMin > 1 ? Math.round(kcal) : 0;
}

/**
 * MET-based calorie estimate (fallback for GPS-only rides):
 *   kcal = MET × weight × duration_hours
 *
 * MET values for cycling:
 *   < 16 km/h → MET 4.0  (leisurely)
 *   16–19 km/h → MET 6.0  (moderate)
 *   19–22 km/h → MET 8.0  (vigorous)
 *   22–26 km/h → MET 10.0 (racing)
 *   > 26 km/h  → MET 12.0 (very fast)
 */
export function calcCaloriesMET(
  avgSpeedKmh: number,
  durationSec: number,
  weight:      number,
): number {
  let met = 6.0;
  if      (avgSpeedKmh < 16) met =  4.0;
  else if (avgSpeedKmh < 19) met =  6.0;
  else if (avgSpeedKmh < 22) met =  8.0;
  else if (avgSpeedKmh < 26) met = 10.0;
  else                       met = 12.0;

  return Math.round(met * weight * (durationSec / 3600));
}
