import { invoke } from '@tauri-apps/api/core';
import {
  RouteProfile, RoutePoint, RouteStats, GeneratedRoute,
  WindData, DirectionBias, RouteOptions
} from '../types/route';
import {
  haversineDistance, generateLoopWaypoints,
  analyzeElevationStats, detectBacktracking, findBacktrackLocations,
  removeSpikes
} from './geo';
import { snapAllWaypoints } from './overpass';

// ─── Profile Mapping ──────────────────────────────────────────────────────────

function mapProfile(profile: RouteProfile): string {
  switch (profile) {
    case 'road':     return 'fastbike';
    case 'trekking': return 'trekking';
    case 'gravel':   return 'gravel';
    case 'mtb':      return 'mtb';
    default:         return 'trekking';
  }
}

/**
 * Builds BRouter profile: extra params from user-selected route options.
 */
function buildExtraParams(options: Partial<RouteOptions>): string {
  const params: string[] = [];
  if (options.surfacePreference === 'asphalt') params.push('profile:avoid_unpaved=1');
  if (options.preferCycleroutes)               params.push('profile:stick_to_cycleroutes=1');
  if (options.avoidHills) {
    params.push('profile:uphillcost=120');
    params.push('profile:uphill_penalty_min=2');
  }
  return params.length > 0 ? '&' + params.join('&') : '';
}

/**
 * Builds a BRouter nogo query string from a list of backtrack locations.
 * Each location becomes a 200 m radius nogo circle, forcing BRouter to
 * route around the dead-end that caused the backtrack.
 */
function buildNogoParam(locs: { lat: number; lng: number }[], radiusM = 200): string {
  if (!locs.length) return '';
  const circles = locs
    .map(l => `${l.lng.toFixed(6)},${l.lat.toFixed(6)},${radiusM}`)
    .join(';');
  return `&nogos=${circles}`;
}

// ─── Fetch Helper ─────────────────────────────────────────────────────────────

async function fetchUrl(url: string): Promise<string> {
  try {
    return await invoke<string>('fetch_route', { url });
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Server error (${res.status})`);
    return res.text();
  }
}

// ─── Wind ─────────────────────────────────────────────────────────────────────

function getDutchCardinal(deg: number): string {
  const dirs = ['N','NNO','NO','ONO','O','OZO','ZO','ZZO','Z','ZZW','ZW','WZW','W','WNW','NW','NNW'];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
}

export async function fetchWindData(
  lat: number, lng: number, timeSlotKey: string
): Promise<WindData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=wind_speed_10m,wind_direction_10m` +
    `&hourly=wind_speed_10m,wind_direction_10m&windspeed_unit=kmh&forecast_days=3`;

  const data = JSON.parse(await fetchUrl(url));
  let speed = 0, direction = 0, slotName = 'Nu (Huidige Wind)';

  if (timeSlotKey === 'now') {
    speed     = data.current.wind_speed_10m;
    direction = data.current.wind_direction_10m;
  } else {
    const slotMap: Record<string, { dayOffset: number; hour: number; label: string }> = {
      today_afternoon:              { dayOffset: 0, hour: 14, label: 'Today Afternoon (14:00)' },
      today_evening:                { dayOffset: 0, hour: 19, label: 'Today Evening (19:00)' },
      tomorrow_morning:             { dayOffset: 1, hour:  9, label: 'Tomorrow Morning (09:00)' },
      tomorrow_afternoon:           { dayOffset: 1, hour: 14, label: 'Tomorrow Afternoon (14:00)' },
      day_after_tomorrow_morning:   { dayOffset: 2, hour:  9, label: 'Day After Tomorrow Morning (09:00)' },
      day_after_tomorrow_afternoon: { dayOffset: 2, hour: 14, label: 'Day After Tomorrow Afternoon (14:00)' },
    };
    const slot = slotMap[timeSlotKey];
    if (slot) {
      slotName = slot.label;
      const target = new Date();
      target.setDate(target.getDate() + slot.dayOffset);
      target.setHours(slot.hour, 0, 0, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      const prefix = `${target.getFullYear()}-${pad(target.getMonth()+1)}-${pad(target.getDate())}T${pad(target.getHours())}`;
      const idx = data.hourly.time.findIndex((t: string) => t.startsWith(prefix));
      speed     = idx !== -1 ? data.hourly.wind_speed_10m[idx]     : data.current.wind_speed_10m;
      direction = idx !== -1 ? data.hourly.wind_direction_10m[idx] : data.current.wind_direction_10m;
    } else {
      speed     = data.current.wind_speed_10m;
      direction = data.current.wind_direction_10m;
    }
  }

  return { speed: Math.round(speed), direction, cardinal: getDutchCardinal(direction), timeSlot: slotName };
}

// ─── Single Route Fetch ───────────────────────────────────────────────────────

/**
 * Fetches one route from BRouter for the given waypoints.
 * Optional `nogos` string (BRouter nogo format: "lon,lat,radius;...")
 * forces BRouter to avoid specific locations — used to fix backtrack segments.
 */
export async function calculateRoute(
  waypoints: [number, number][],
  profile: RouteProfile,
  alternativeidx = 0,
  options: Partial<RouteOptions> = {},
  nogos = ''
): Promise<GeneratedRoute> {
  if (waypoints.length < 2) throw new Error('Minimaal twee waypoints vereist.');

  const lonlats     = waypoints.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join('|');
  const extraParams = buildExtraParams(options);
  const url =
    `https://brouter.de/brouter?lonlats=${lonlats}` +
    `&profile=${mapProfile(profile)}&alternativeidx=${alternativeidx}` +
    `&format=geojson${extraParams}${nogos}`;

  const geojson = JSON.parse(await fetchUrl(url));
  const feature  = geojson.features?.find((f: any) => f.geowithry?.type === 'LineString');
  if (!feature) throw new Error('No route found in BRouter response.');

  const coords: number[][] = feature.geowithry.coordinates;
  if (!coords?.length) throw new Error('Lege route ontvangen.');

  const points: RoutePoint[] = [];
  let cumulativeDist = 0, elevGain = 0, elevLoss = 0;

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat, ele = 0] = coords[i];
    if (i > 0) {
      const prev = points[i - 1];
      cumulativeDist += haversineDistance(prev.lat, prev.lng, lat, lng);
      const diff = ele - prev.ele;
      if (diff > 0) elevGain += diff; else elevLoss += Math.abs(diff);
    }
    points.push({ lat, lng, ele, distance: cumulativeDist });
  }

  // ── Remove lollipop spikes (out-and-back detours) ──
  // Runs iteratively until all spike segments are gone. The cleaned points
  // are used for both stats and map display. The GeoJSON is also rebuilt
  // from the cleaned coordinates so the Leaflet map shows no spikes.
  const cleanedPoints = removeSpikes(points);

  // Recompute elevation stats from cleaned points
  elevGain = 0; elevLoss = 0;
  for (let i = 1; i < cleanedPoints.length; i++) {
    const diff = cleanedPoints[i].ele - cleanedPoints[i - 1].ele;
    if (diff > 0) elevGain += diff; else elevLoss += Math.abs(diff);
  }

  // Rebuild GeoJSON LineString coordinates from cleaned points so the
  // map polyline exactly matches the cleaned elevation profile.
  const cleanedCoords = cleanedPoints.map(p => [p.lng, p.lat, p.ele]);
  const cleanedGeojson = {
    ...geojson,
    features: geojson.features?.map((f: any) =>
      f.geowithry?.type === 'LineString'
        ? { ...f, geowithry: { ...f.geowithry, coordinates: cleanedCoords } }
        : f
    ) ?? [],
  };

  const { maxGradient, avgGradient, climbCategory } = analyzeElevationStats(cleanedPoints);
  const hasBacktrack = detectBacktracking(cleanedPoints);
  const totalKm   = cleanedPoints[cleanedPoints.length - 1].distance / 1000;
  const speedKmh  = profile === 'road' ? 28 : profile === 'trekking' ? 18 : profile === 'gravel' ? 22 : 16;

  const stats: RouteStats = {
    distance:      parseFloat(totalKm.toFixed(2)),
    elevationGain: Math.round(elevGain),
    elevationLoss: Math.round(elevLoss),
    duration:      Math.round((totalKm / speedKmh) * 3600),
    maxGradient,
    avgGradient,
    climbCategory,
    hasBacktrack,
  };

  return { points: cleanedPoints, stats, geojson: cleanedGeojson };
}

// ─── Single Candidate: Calibrate + Nogo Retry ────────────────────────────────

/**
 * Calibrates a single loop route to the target distance using an iterative
 * scaling loop (≤3 iterations, ≤1.5 km tolerance).
 *
 * If the calibrated route has backtracking, automatically retries once with
 * nogo circles placed at the detected backtrack locations, forcing BRouter to
 * find a clean path around the problematic road segment.
 */
async function calibrateSingleCandidate(
  startLat: number, startLng: number,
  targetDistanceKm: number,
  direction: DirectionBias,
  options: RouteOptions,
  windDirection?: number
): Promise<GeneratedRoute | null> {
  const MAX_DIST_ITER = 3;
  const TOLERANCE     = 1.5;  // km
  let scaleFactor     = 1.35;
  let route: GeneratedRoute | null = null;
  let waypoints: [number, number][] = [];

  // ── Phase 1: distance calibration ──
  for (let iter = 0; iter < MAX_DIST_ITER; iter++) {
    waypoints = generateLoopWaypoints(
      startLat, startLng,
      targetDistanceKm / scaleFactor,
      direction, windDirection
    );

    try {
      route = await calculateRoute(waypoints, options.profile, 0, options);

      if (Math.abs(route.stats.distance - targetDistanceKm) <= TOLERANCE) break;

      const ratio = route.stats.distance / targetDistanceKm;
      scaleFactor = Math.max(1.0, Math.min(2.5, scaleFactor * ratio));
    } catch (err) {
      if (iter === 0) throw err;
      break;
    }
  }

  if (!route) return null;

  // ── Phase 2: snap calibrated waypoints to real road intersections ──
  // This replaces the geometric (field/forest-landing) waypoints with
  // actual road intersection nodes from OSM, maximising BRouter's routing
  // freedom and drastically reducing dead-end backtracking.
  let snappedWaypoints = waypoints;
  try {
    snappedWaypoints = await snapAllWaypoints(waypoints, options.profile);
    const snappedRoute = await calculateRoute(snappedWaypoints, options.profile, 0, options);
    // Accept snapped route if distance is within a relaxed ±3 km tolerance
    // (snapping may shift the route slightly but quality wins over precision here)
    if (Math.abs(snappedRoute.stats.distance - targetDistanceKm) <= TOLERANCE + 2) {
      route = snappedRoute;
    }
  } catch {
    // Snapping failed — keep calibrated route
  }

  // ── Phase 3: nogo retry if backtracking still detected ──
  if (route.stats.hasBacktrack) {
    const locs    = findBacktrackLocations(route.points);
    const nogoStr = buildNogoParam(locs, 250);

    if (nogoStr) {
      try {
        const retried = await calculateRoute(snappedWaypoints, options.profile, 0, options, nogoStr);
        const distOk  = Math.abs(retried.stats.distance - targetDistanceKm) <= TOLERANCE + 2;
        if (distOk) route = retried;
      } catch {
        // nogo retry failed — keep current best
      }
    }
  }

  return route;
}

// ─── Public: Generate 3 Independent Corrected Routes ─────────────────────────

/**
 * Generates 3 genuinely independent loop routes — each with its own fresh
 * random waypoints (not BRouter alternativeidx which shares waypoints).
 *
 * Strategy:
 *  1. Run 3 calibrations concurrently, each with a different random shape
 *  2. Each candidate automatically retries with nogo zones if backtracking found
 *  3. Sort results: clean routes (hasBacktrack=false) first
 *
 * This approach maximises the chance that at least one of the three routes
 * is completely free of out-and-back segments.
 */
export async function generateCorrectedRoutes(
  startLat: number, startLng: number,
  targetDistanceKm: number,
  direction: DirectionBias,
  options: RouteOptions,
  windDirection?: number
): Promise<GeneratedRoute[]> {

  // Run 3 independent candidates concurrently
  const candidates = await Promise.all(
    Array.from({ length: 3 }, () =>
      calibrateSingleCandidate(
        startLat, startLng, targetDistanceKm,
        direction, options, windDirection
      ).catch(() => null)
    )
  );

  const valid = candidates
    .filter((r): r is GeneratedRoute => r !== null)
    // Sort: backtrack-free first
    .sort((a, b) => Number(a.stats.hasBacktrack) - Number(b.stats.hasBacktrack));

  if (!valid.length) {
    throw new Error('Kon none geldige route genereren. Probeer een andere locatie of afstand.');
  }

  return valid;
}

// ─── Geocoding ───────────────────────────────────────────────────────────────

export async function searchAddress(query: string): Promise<{ name: string; lat: number; lng: number }[]> {
  if (!query || query.trim().length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
  try {
    const results = JSON.parse(await fetchUrl(url));
    return results.map((item: any) => ({
      name: item.display_name,
      lat:  parseFloat(item.lat),
      lng:  parseFloat(item.lon),
    }));
  } catch {
    return [];
  }
}
