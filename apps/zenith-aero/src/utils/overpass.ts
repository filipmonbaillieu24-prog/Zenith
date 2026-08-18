import { RouteProfile } from '../types/route';
import { haversineDistance } from './geo';

// ─── Highway types per profile ────────────────────────────────────────────────

const HIGHWAY_BY_PROFILE: Record<RouteProfile, string> = {
  road:     'primary|secondary|tertiary|residential|cycleway|unclassified',
  gravel:   'secondary|tertiary|residential|cycleway|unclassified|track',
  trekking: 'secondary|tertiary|residential|cycleway|unclassified|path',
  mtb:      'track|path|cycleway|tertiary|residential|unclassified',
};

// Use public Overpass instances with fallback
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function queryOverpass(ql: string): Promise<any> {
  const body = `data=${encodeURIComponent(ql)}`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      continue; // try next mirror
    }
  }
  return null;
}

// ─── Road node scoring ────────────────────────────────────────────────────────

interface RoadNode {
  lat: number;
  lon: number;
  count: number; // how many ways share this node — higher = better intersection
}

/**
 * From way geometrics returned by Overpass, build a map of road nodes
 * keyed by rounded coordinates. Nodes shared between multiple ways
 * (intersections) receive a higher count.
 */
function extractNodes(ways: { geowithry?: { lat: number; lon: number }[] }[]): Map<string, RoadNode> {
  const map = new Map<string, RoadNode>();
  for (const way of ways) {
    if (!way.geowithry?.length) continue;
    for (const pt of way.geowithry) {
      const key = `${pt.lat.toFixed(5)},${pt.lon.toFixed(5)}`; // ~1 m precision
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, { lat: pt.lat, lon: pt.lon, count: 1 });
      }
    }
  }
  return map;
}

/**
 * Selects the best road node from a node map given a target position.
 *
 * Scoring formula:
 *   score = connectivityBonus - distancePenalty
 *
 * where:
 *   connectivityBonus = count × 3   (intersections win over dead-ends)
 *   distancePenalty   = dist / 100  (closer is better, in 100 m units)
 *
 * This strongly prefers intersections over dead-ends, while still
 * favouring nodes close to our geometric target waypoint.
 */
function selectBestNode(
  nodes: Map<string, RoadNode>,
  targetLat: number,
  targetLng: number,
): [number, number] | null {
  if (!nodes.size) return null;

  let bestLat  = 0, bestLng = 0;
  let bestScore = -Infinity;

  for (const node of nodes.values()) {
    const dist  = haversineDistance(targetLat, targetLng, node.lat, node.lon);
    const score = node.count * 3 - dist / 100;
    if (score > bestScore) {
      bestScore = score;
      bestLat   = node.lat;
      bestLng   = node.lon;
    }
  }

  return bestScore > -Infinity ? [bestLng, bestLat] : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Snaps a single geometric waypoint to the nearest suitable road intersection.
 *
 * 1. Queries Overpass for all road ways of the appropriate type within `radiusM`
 * 2. Extracts all road nodes and counts how many ways each belongs to
 * 3. Scores nodes by (intersection degree × 3) − (distance / 100m)
 * 4. Returns the highest-scoring node as [longitude, latitude]
 *
 * Falls back silently to the original position if Overpass is unavailable.
 */
export async function snapToRoadNode(
  targetLat: number,
  targetLng: number,
  profile: RouteProfile,
  radiusM = 500,
): Promise<[number, number]> {
  const highways = HIGHWAY_BY_PROFILE[profile];
  const ql = `
    [out:json][timeout:10];
    way(around:${radiusM},${targetLat.toFixed(6)},${targetLng.toFixed(6)})
      [highway~"^(${highways})$"]
      [!area];
    out geom qt;
  `;

  try {
    const data = await queryOverpass(ql);
    if (!data?.elements?.length) return [targetLng, targetLat];

    const nodes = extractNodes(data.elements);
    const best  = selectBestNode(nodes, targetLat, targetLng);
    return best ?? [targetLng, targetLat];
  } catch {
    return [targetLng, targetLat]; // silent fallback
  }
}

/**
 * Snaps all *intermediate* waypoints of a loop to real road intersections
 * using parallel Overpass queries (one per waypoint, concurrent).
 *
 * Start and end points are left unchanged (they are the user's chosen location).
 * This takes ~200–400 ms total thanks to parallelism.
 */
export async function snapAllWaypoints(
  waypoints: [number, number][],
  profile: RouteProfile,
): Promise<[number, number][]> {
  if (waypoints.length < 3) return waypoints;

  const start = waypoints[0];
  const end   = waypoints[waypoints.length - 1];
  const middle = waypoints.slice(1, -1); // intermediate only

  const snapped = await Promise.all(
    middle.map(([lng, lat]) => snapToRoadNode(lat, lng, profile, 500))
  );

  return [start, ...snapped, end];
}
