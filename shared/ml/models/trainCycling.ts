import { rpeModel, cadenceModel, routeSpeedModel } from './cyclingModels';

/**
 * Fitting the cycling models to the rider's own rides.
 *
 * When these three were rebuilt I removed their old training loops along with the
 * saturated networks they fed, and left a comment saying they had no training path.
 * That was wrong, and checking the data said so: every one of this athlete's rides
 * carries a logged RPE, an average cadence and a distance with a duration. The signal
 * was there the whole time; I had thrown away the pipeline with the model.
 *
 * Each target here is something the rider or their computer actually recorded, not a
 * formula over the model's own inputs:
 *
 *   RPE          what they said the ride felt like, on a 1-10 scale
 *   cadence      the cadence they actually chose at that power
 *   route speed  the speed they actually averaged over that distance and climbing
 *
 * The last one is worth being careful about. Predicting the cadence a rider will
 * choose, from the cadences they have chosen, is personalisation rather than
 * circularity: the model is asked about a power they have not ridden at yet.
 */

export interface RideForTraining {
  /** Epoch milliseconds. */
  date: number;
  distanceKm: number;
  durationSeconds: number;
  elevationGainM: number;
  avgPowerWatts?: number | null;
  normalisedPowerWatts?: number | null;
  avgCadenceRpm?: number | null;
  /** What the athlete said it felt like, 1-10. */
  rpe?: number | null;
}

export interface CyclingTrainingResult {
  rpeSamples: number;
  cadenceSamples: number;
  speedSamples: number;
}

const num = (v: unknown): number | null => {
  // null and '' must not reach Number(), which turns both into 0 - and a ride with no
  // cadence recorded is not a ride at zero cadence.
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Refits all three from history.
 *
 * retrainFromScratch rather than incremental training: replaying a month of rides on
 * top of last week's replay applies the same gradients twice, which is how a score
 * walks a few points every time a page loads.
 */
export async function trainCyclingModelsFromRides(
  supabase: any,
  userId: string,
  rides: RideForTraining[],
  weightKg: number,
  currentFtpWatts: number
): Promise<CyclingTrainingResult> {
  const weight = num(weightKg);
  const ftp = num(currentFtpWatts);
  if (!weight || weight < 30 || !ftp || ftp < 50) {
    return { rpeSamples: 0, cadenceSamples: 0, speedSamples: 0 };
  }

  const rpeSamples: { x: number[]; targets: number[] }[] = [];
  const cadenceSamples: { x: number[]; targets: number[] }[] = [];
  const speedSamples: { x: number[]; targets: number[] }[] = [];

  for (const ride of rides ?? []) {
    const km = num(ride.distanceKm);
    const seconds = num(ride.durationSeconds);
    const power = num(ride.normalisedPowerWatts) ?? num(ride.avgPowerWatts);
    const hours = seconds !== null ? seconds / 3600 : null;

    // ── Perceived exertion ──────────────────────────────────────────────────
    const rpe = num(ride.rpe);
    if (rpe !== null && rpe >= 1 && rpe <= 10 && power !== null && hours !== null && hours > 0) {
      rpeSamples.push(rpeModel.toTrainingPair([power / ftp, hours], rpe));
    }

    // ── Cadence ─────────────────────────────────────────────────────────────
    const cadence = num(ride.avgCadenceRpm);
    const avgPower = num(ride.avgPowerWatts);
    // A coasting-heavy ride reports a cadence that is an artefact of the recording,
    // not a choice; below 40 rpm it is not telling us what the rider selected.
    if (cadence !== null && cadence >= 40 && cadence <= 130 && avgPower !== null && avgPower > 0) {
      cadenceSamples.push(cadenceModel.toTrainingPair([avgPower / weight], cadence));
    }

    // ── Route speed ─────────────────────────────────────────────────────────
    if (km !== null && km >= 5 && hours !== null && hours > 0.15) {
      const speed = km / hours;
      const metresPerKm = Math.max(0, num(ride.elevationGainM) ?? 0) / km;
      // A speed outside this band is a stopped clock or a car; either way it is not a
      // ride to learn a pace from.
      if (speed >= 8 && speed <= 50) {
        speedSamples.push(routeSpeedModel.toTrainingPair([ftp / weight, metresPerKm], speed));
      }
    }
  }

  await Promise.all([
    rpeSamples.length > 0 ? rpeModel.mlp.retrainFromScratch(supabase, userId, rpeSamples) : Promise.resolve(),
    cadenceSamples.length > 0 ? cadenceModel.mlp.retrainFromScratch(supabase, userId, cadenceSamples) : Promise.resolve(),
    speedSamples.length > 0 ? routeSpeedModel.mlp.retrainFromScratch(supabase, userId, speedSamples) : Promise.resolve()
  ]);

  return {
    rpeSamples: rpeSamples.length,
    cadenceSamples: cadenceSamples.length,
    speedSamples: speedSamples.length
  };
}
