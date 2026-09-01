import { declareModel, DeclaredModel } from '../declareModel';

/**
 * Aero's three saturated predictors, declared against references that can be checked.
 *
 * All three shipped pinned near an extreme, and all three are on screen:
 *
 *   RPE            9 for an easy hour, 10 for a hard three. A recovery spin and a
 *                  race both came back as maximal effort.
 *   Route duration a 10 km route "took" 4.7 hours; 200 km took 8.0. The whole curve
 *                  was compressed into the top half of a 0-8 hour range.
 *   Cadence        96 rpm at 100 W, 106 rpm at 400 W. Ten rpm of spread across a
 *                  fourfold change in power, inside a 60-120 rpm range, advising
 *                  96 rpm to someone soft-pedalling.
 */

// ── Perceived exertion ───────────────────────────────────────────────────────

/**
 * RPE from intensity and duration.
 *
 * The session-RPE convention: intensity factor sets the base, and duration adds to it,
 * because three hours at a given intensity is harder than one. An hour at threshold is
 * about a 7; three hours at endurance pace is about a 6; twenty minutes easy is a 2.
 */
function rpeReference(raw: number[]): number {
  const [intensityFactor, hours] = raw;
  // IF 0.55 -> ~2, IF 1.0 -> ~8 before the duration term.
  const fromIntensity = 2 + (intensityFactor - 0.55) * 13.3;
  // Up to two points for a long day.
  const fromDuration = Math.min(2, hours * 0.5);
  return Math.max(1, Math.min(10, fromIntensity + fromDuration));
}

export const rpeModel: DeclaredModel = declareModel({
  key: 'aero_rpe_v2',
  purpose: 'perceived exertion 1-10 from intensity and duration',
  hiddenSize: 8,
  outputRange: [0.5, 10.5],
  reference: rpeReference,
  inputs: [
    { name: 'intensity factor', scale: v => Math.min(1, v / 1.2), sampleRange: [0.4, 1.15] },
    { name: 'duration hours', scale: v => Math.min(1, v / 6), sampleRange: [0.25, 6] }
  ]
});

export function predictRideRpe(intensityFactor: number, durationSeconds: number): number {
  const hours = Math.max(0, Number(durationSeconds) || 0) / 3600;
  const intensity = Number(intensityFactor);
  if (!Number.isFinite(intensity) || intensity <= 0 || hours <= 0) return 0;
  return Math.round(Math.max(1, Math.min(10, rpeModel.predict([intensity, hours]))));
}

// ── Route duration ───────────────────────────────────────────────────────────

/**
 * Speed on rolling terrain, predicted rather than duration.
 *
 * A rider's speed is far more stable than their ride length, so predicting speed and
 * dividing generalises to a 5 km route and a 200 km one alike. The model this replaced
 * predicted duration directly on a 0-8 hour scale, which is why a 10 km route came out
 * at 4.7 hours: the bottom of the range was unreachable.
 *
 * Speed on rolling terrain, in km/h, as a function of threshold watts per kilogram.
 *
 * Checked against this athlete's seven recorded rides, and the check found two errors
 * cancelling each other. The first constants were steeper - a 4.2 km/h swing per W/kg -
 * and they looked accurate only because the call site fed them the profile's untouched
 * default of 220 W rather than the 158 W the athlete's rides actually measure. Given
 * the real threshold, the same constants predicted every ride 12 to 19 percent slow.
 *
 * A rider's speed depends on their threshold far less than a naive reading suggests:
 * traffic, junctions, wind and terrain set most of it. These constants give 24.7 km/h
 * at 1.8 W/kg and 30.4 at 4 - and across those seven rides, with the measured
 * threshold, they land within 5% worst case and half a percent on average.
 */
export const FLAT_SPEED_INTERCEPT = 20;
export const FLAT_SPEED_PER_WKG = 2.6;
/** Every metre of climbing per kilometre costs this share of speed. */
export const CLIMB_SPEED_PENALTY = 0.006;

function routeSpeedReference(raw: number[]): number {
  const [wattsPerKg, metresPerKm] = raw;
  const flatSpeed = FLAT_SPEED_INTERCEPT + FLAT_SPEED_PER_WKG * wattsPerKg;
  const climbPenalty = Math.min(0.45, metresPerKm * CLIMB_SPEED_PENALTY);
  return Math.max(8, flatSpeed * (1 - climbPenalty));
}

export const routeSpeedModel: DeclaredModel = declareModel({
  key: 'aero_route_speed_v1',
  purpose: 'average speed in km/h for a planned route',
  hiddenSize: 8,
  outputRange: [6, 42],
  reference: routeSpeedReference,
  inputs: [
    { name: 'watts per kilogram at threshold', scale: v => Math.min(1, v / 6), sampleRange: [1.2, 5.5] },
    { name: 'climbing metres per kilometre', scale: v => Math.min(1, v / 40), sampleRange: [0, 35] }
  ]
});

export function predictRouteDurationSeconds(
  distanceKm: number,
  elevationGainM: number,
  ftpWatts: number,
  weightKg: number
): number {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) return 0;

  const weight = Number(weightKg) > 30 ? Number(weightKg) : 75;
  const ftp = Number(ftpWatts) > 50 ? Number(ftpWatts) : 200;
  const metresPerKm = Math.max(0, Number(elevationGainM) || 0) / km;

  const speed = routeSpeedModel.predict([ftp / weight, metresPerKm]);
  return Math.round((km / Math.max(6, speed)) * 3600);
}

// ── Cadence ──────────────────────────────────────────────────────────────────

/**
 * A self-selected cadence, which rises modestly with power.
 *
 * Around 80 rpm at endurance power and into the low 90s at threshold is what most
 * trained riders settle on. The old model returned 96 rpm at 100 W - advice nobody
 * would give someone soft-pedalling - and only reached 106 at 400 W, so it was both
 * wrong and almost flat.
 */
function cadenceReference(raw: number[]): number {
  const [wattsPerKg] = raw;
  return Math.max(70, Math.min(100, 72 + wattsPerKg * 5));
}

export const cadenceModel: DeclaredModel = declareModel({
  key: 'aero_cadence_v2',
  purpose: 'a rider\'s self-selected cadence in rpm at a given relative power',
  hiddenSize: 6,
  outputRange: [60, 110],
  reference: cadenceReference,
  inputs: [
    { name: 'watts per kilogram', scale: v => Math.min(1, v / 6), sampleRange: [0.8, 5.5] }
  ]
});

export function predictCadence(avgPowerWatts: number, weightKg: number): number | null {
  const power = Number(avgPowerWatts);
  const weight = Number(weightKg);
  // Without a weight there is no watts per kilogram, and guessing one would put a
  // fabricated number behind a recommendation.
  if (!Number.isFinite(power) || power <= 0 || !Number.isFinite(weight) || weight < 30) return null;
  return Math.round(cadenceModel.predict([power / weight]));
}
