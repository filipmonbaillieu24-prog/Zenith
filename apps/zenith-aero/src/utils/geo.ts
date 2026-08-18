import { DirectionBias, ClimbCategory, RoutePoint } from '../types/route';

const EARTH_RADIUS = 6371000; // meters

// ─── Core Geodesy ─────────────────────────────────────────────────────────────

/**
 * Haversine distance between two GPS coordinates in meters.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Destination point given start coordinates, bearing (degrees) and distance (meters).
 * Returns [longitude, latitude].
 */
export function destinationPoint(
  lat: number, lng: number,
  bearingDeg: number,
  distanceM: number
): [number, number] {
  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const brg  = (bearingDeg * Math.PI) / 180;
  const ang  = distanceM / EARTH_RADIUS;

  const destLat = Math.asin(
    Math.sin(latR) * Math.cos(ang) +
    Math.cos(latR) * Math.sin(ang) * Math.cos(brg)
  );
  const destLng = lngR + Math.atan2(
    Math.sin(brg) * Math.sin(ang) * Math.cos(latR),
    Math.cos(ang) - Math.sin(latR) * Math.sin(destLat)
  );

  return [(destLng * 180) / Math.PI, (destLat * 180) / Math.PI];
}

// ─── Loop Waypoint Generation ─────────────────────────────────────────────────

/**
 * Perimeter of a regular n-gon inscribed in a circle of radius R.
 * Formula: P = 2 * n * R * sin(π / n)
 * Therefore R = P / (2 * n * sin(π / n))
 */
function regularPolygonRadiusDivider(n: number): number {
  return 2 * n * Math.sin(Math.PI / n);
}

/**
 * Generates loop waypoints for a regular polygon with n sides.
 *
 * Key improvements over a simple triangle/square:
 * - Uses 5 or 6 sides by default → shorter individual legs → less dead-end backtracking
 * - Applies a small random offset to each intermediate vertex so waypoints
 *   don't land on the exact same road junctions across routes
 * - Returns [longitude, latitude] pairs suitable for BRouter
 */
export function generateLoopWaypoints(
  startLat: number, startLng: number,
  targetDistanceKm: number,
  direction: DirectionBias,
  windDirection?: number,
  internalSides?: number
): [number, number][] {
  const targetM  = targetDistanceKm * 1000;

  // 6–8 sides → shorter individual legs → far less chance of dead-end backtracking
  const numSides = internalSides ?? (6 + Math.floor(Math.random() * 3)); // 6, 7, or 8
  const divider  = regularPolygonRadiusDivider(numSides);
  const radius   = targetM / divider;

  // Direction bias
  let baseBearing: number;
  const randomSkew = (Math.random() - 0.5) * 30;

  if (direction === 'wind' && windDirection !== undefined) {
    baseBearing = windDirection;
  } else if (direction === 'N') {
    baseBearing = 0   + randomSkew;
  } else if (direction === 'E') {
    baseBearing = 90  + randomSkew;
  } else if (direction === 'S') {
    baseBearing = 180 + randomSkew;
  } else if (direction === 'W') {
    baseBearing = 270 + randomSkew;
  } else {
    baseBearing = Math.random() * 360;
  }
  baseBearing = (baseBearing + 360) % 360;

  // Offset center from start by radius in the chosen direction
  const [centerLng, centerLat] = destinationPoint(startLat, startLng, baseBearing, radius);
  const startBearingFromCenter = (baseBearing + 180) % 360;
  const angleStep = 360 / numSides;

  // Maximum random offset per vertex: 4% of radius (keeps distance calibration stable)
  const maxOffsetM = radius * 0.04;

  const waypoints: [number, number][] = [[startLng, startLat]];

  for (let i = 1; i < numSides; i++) {
    const vertexBearing = (startBearingFromCenter + i * angleStep) % 360;
    const [vLng, vLat]  = destinationPoint(centerLat, centerLng, vertexBearing, radius);

    // Small random offset to avoid landing on the exact same road nodes every time
    const offsetBearing = Math.random() * 360;
    const offsetDist    = Math.random() * maxOffsetM;
    const [oLng, oLat]  = destinationPoint(vLat, vLng, offsetBearing, offsetDist);

    waypoints.push([oLng, oLat]);
  }

  // Close the loop back to start
  waypoints.push([startLng, startLat]);

  return waypoints;
}

// ─── Elevation Analysis ───────────────────────────────────────────────────────

/**
 * Analyzes gradient data from route points using a 150 m rolling window
 * to smooth out GPS elevation noise.
 */
export function analyzeElevationStats(points: RoutePoint[]): {
  maxGradient: number;
  avgGradient: number;
  climbCategory: ClimbCategory;
} {
  if (points.length < 2) {
    return { maxGradient: 0, avgGradient: 0, climbCategory: 'flat' };
  }

  const WINDOW_METERS = 150;
  let maxGradient     = 0;
  let totalAscentDist = 0;
  let totalAscentGain = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const distAhead = points[i].distance + WINDOW_METERS;
    let j = i + 1;
    while (j < points.length - 1 && points[j].distance < distAhead) j++;

    if (j >= points.length) continue;

    const horizDist = points[j].distance - points[i].distance;
    if (horizDist < 20) continue;

    const eleChange = points[j].ele - points[i].ele;
    const gradient  = Math.abs((eleChange / horizDist) * 100);

    if (gradient > maxGradient) maxGradient = gradient;

    if (eleChange > 0) {
      totalAscentDist += horizDist;
      totalAscentGain += eleChange;
    }
  }

  const avgGradient = totalAscentDist > 0
    ? (totalAscentGain / totalAscentDist) * 100
    : 0;

  // Derive total elevation gain from the points array directly
  let elevGain = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].ele - points[i - 1].ele;
    if (diff > 0) elevGain += diff;
  }

  let climbCategory: ClimbCategory;
  if      (elevGain <  300 && maxGradient <  4) climbCategory = 'flat';
  else if (elevGain <  800 && maxGradient <  8) climbCategory = 'rolling';
  else if (elevGain < 2000 && maxGradient < 15) climbCategory = 'hilly';
  else                                           climbCategory = 'mountainous';

  return {
    maxGradient: parseFloat(maxGradient.toFixed(1)),
    avgGradient: parseFloat(avgGradient.toFixed(1)),
    climbCategory,
  };
}

// ─── Backtrack Detection ──────────────────────────────────────────────────────

/**
 * Detects whether a route reuses road segments (backtracking / out-and-back sections).
 *
 * Algoridehm: Sample the route at ~150 evenly-spaced points.
 * For any two sampled points that are ≥ 600 m apart along the route but
 * ≤ PROXIMITY_THRESHOLD meters apart geographically, a backtrack is flagged.
 *
 * A strict threshold (22 m) avoids false positives from roundabouts / chicanes.
 */
export function findBacktrackLocations(points: RoutePoint[]): { lat: number; lng: number }[] {
  if (points.length < 10) return [];

  const PROXIMITY_THRESHOLD = 22;
  const MIN_ROUTE_GAP       = 600;
  const MAX_SAMPLES         = 150;

  const step = Math.max(1, Math.floor(points.length / MAX_SAMPLES));
  const sampled: RoutePoint[] = [];
  for (let i = 0; i < points.length; i += step) sampled.push(points[i]);

  const seen  = new Set<string>();
  const locs: { lat: number; lng: number }[] = [];

  for (let i = 0; i < sampled.length - 1; i++) {
    for (let j = i + 1; j < sampled.length; j++) {
      if (sampled[j].distance - sampled[i].distance < MIN_ROUTE_GAP) continue;

      const d = haversineDistance(
        sampled[i].lat, sampled[i].lng,
        sampled[j].lat, sampled[j].lng
      );

      if (d < PROXIMITY_THRESHOLD) {
        // Record midpoint of the two near-identical positions
        const midLat = (sampled[i].lat + sampled[j].lat) / 2;
        const midLng = (sampled[i].lng + sampled[j].lng) / 2;
        const key = `${midLat.toFixed(4)},${midLng.toFixed(4)}`;
        if (!seen.has(key)) {
          seen.add(key);
          locs.push({ lat: midLat, lng: midLng });
        }
        break; // one backtrack per i is enough
      }
    }
  }

  return locs;
}

/**
 * Detects whether a route reuses road segments (returns boolean for quick checks).
 * Uses the same algoridehm as findBacktrackLocations.
 */
export function detectBacktracking(points: RoutePoint[]): boolean {
  return findBacktrackLocations(points).length > 0;
}

// ─── Bearing helpers (used by spike removal) ──────────────────────────────────

function calcBearing(from: RoutePoint, to: RoutePoint): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat  * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y    = Math.sin(dLng) * Math.cos(lat2);
  const x    = Math.cos(lat1) * Math.sin(lat2)
              - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function bearingDiff(b1: number, b2: number): number {
  const diff = Math.abs(b1 - b2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Returns true if there is at least one bearing change > 120° inside [startIdx..endIdx].
 * This distinguishes a genuine U-turn spike from two parallel roads in the same direction:
 *   - Spike: route goes out (bearing A), turns around (+180°), comes back → reversal found
 *   - Parallel roads: route goes east on road A, transitions to road B going east → no reversal
 */
function hasDirectionReversal(
  points: RoutePoint[],
  startIdx: number,
  endIdx: number,
): boolean {
  const REVERSAL_DEG = 120;
  const step = Math.max(1, Math.floor((endIdx - startIdx) / 30));
  let prevB  = -1;

  for (let k = startIdx; k < endIdx - step; k += step) {
    const b = calcBearing(points[k], points[Math.min(k + step, endIdx)]);
    if (prevB >= 0 && bearingDiff(prevB, b) > REVERSAL_DEG) return true;
    prevB = b;
  }
  return false;
}

export function removeSpikes(points: RoutePoint[]): RoutePoint[] {
  if (points.length < 10) return points;

  // ── Tuning ──────────────────────────────────────────────────────────────────
  const PROXIMITY      = 22;   // m  — same physical road within GPS noise
  const MIN_SPIKE      = 60;   // m  — minimum round-trip spike (30 m each way)
  const MAX_SPIKE_DIST = 5000; // m  — max spike we scan for; excludes loop closure
  //   Loop closure (50 km start ≈ end) is 50 000 m >> MAX_SPIKE_DIST → never matched

  let result  = points;
  let changed = true;

  while (changed) {
    changed = false;
    const n = result.length;

    // Outer loop: step = 1 so every point is tested as a potential spike entry.
    // This ensures that exact junction points (not just sampled approximations) are found.
    outerLoop:
    for (let oi = 0; oi < n - 1; oi++) {

      // Inner loop: step = 1, bounded by MAX_SPIKE_DIST for performance.
      for (let ij = oi + 1; ij < n; ij++) {

        const routeGap = result[ij].distance - result[oi].distance;
        if (routeGap < MIN_SPIKE)      continue;  // not far enough — skip
        if (routeGap > MAX_SPIKE_DIST) break;      // beyond window — stop inner loop

        const geoDist = haversineDistance(
          result[oi].lat, result[oi].lng,
          result[ij].lat, result[ij].lng,
        );

        if (geoDist < PROXIMITY) {
          // Geographic match — verify there's a U-turn inside the segment.
          // This filters out false positives where two parallel roads happen
          // to be < PROXIMITY apart (they never reverse direction).
          if (!hasDirectionReversal(result, oi, ij)) continue;

          // Walk endIdx forward while still within PROXIMITY (smooth junction)
          let endIdx = ij;
          while (endIdx + 1 < n) {
            const d = haversineDistance(
              result[oi].lat, result[oi].lng,
              result[endIdx + 1].lat, result[endIdx + 1].lng,
            );
            if (d < PROXIMITY) endIdx++; else break;
          }

          if (endIdx <= oi + 1) continue;

          // Cut the spike segment and rebase downstream distances
          const spikeLen = result[endIdx].distance - result[oi].distance;
          const before   = result.slice(0, oi + 1);
          const after    = result.slice(endIdx).map(p => ({
            ...p,
            distance: p.distance - spikeLen,
          }));

          result  = [...before, ...after];
          changed = true;
          break outerLoop; // restart on freshly cleaned array
        }
      }
    }
  }

  return result;
}
