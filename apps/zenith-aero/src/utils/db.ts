import { PlannedWorkoutItem } from './pmc';
import type { RoutePoint } from '../types/route';
import { supabase } from './supabaseClient';
import { Ride, Gear } from '../types/workout';

// Cache the current user ID to avoid duplicate auth network requests inside loops
let currentUserId: string | null = null;

// Listen to auth state changes to keep currentUserId updated in memory
supabase.auth.onAuthStateChange((_event, session) => {
  currentUserId = session?.user?.id || null;
});

async function getUserId(): Promise<string> {
  if (currentUserId) return currentUserId;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    currentUserId = session.user.id;
    return currentUserId;
  }
  throw new Error("User is not logged in.");
}

// ─── Mapper Helpers ────────────────────────────────────────────────────────────

/**
 * Shapes of the database rows this module reads.
 *
 * These mappers took `row: any`, which meant a column being renamed, dropped or
 * changing type produced `undefined` silently at runtime instead of a compile
 * error - the exact drift between the Supabase schema and the TS types that is
 * hardest to notice, because every downstream value just quietly becomes NaN or
 * empty. Naming the row shape makes a mismatch visible here, at the boundary.
 */
interface RideRow {
  id: string;
  name: string;
  date: number | string;
  distance: number | string;
  duration: number;
  elev_gain: number;
  avg_speed: number | string;
  avg_power: number | null;
  avg_hr: number | null;
  has_power: boolean;
  has_hr: boolean;
  has_gps: boolean;
  points?: Ride['points'] | null;
  best_efforts?: Ride['bestEfforts'] | null;
  best_speed_efforts?: Ride['bestSpeedEfforts'] | null;
  metadata?: Record<string, unknown> | null;
}

interface GearRow {
  id: string;
  name: string;
  type: Gear['type'];
  brand?: string | null;
  model?: string | null;
  weight?: number | string | null;
  active: boolean;
  components?: Gear['components'] | null;
}

function mapSupabaseRide(row: RideRow): Ride {
  return {
    id: row.id,
    name: row.name,
    date: Number(row.date),
    distance: Number(row.distance),
    duration: row.duration,
    elevGain: row.elev_gain,
    avgSpeed: Number(row.avg_speed),
    // Nullable in the database, optional in the Ride type: converted here so a
    // null never reaches code that only guards for undefined. Typing the row
    // shape is what surfaced this - it was flowing straight through before.
    avgPower: row.avg_power ?? undefined,
    avgHR: row.avg_hr ?? undefined,
    hasPower: row.has_power,
    hasHR: row.has_hr,
    hasGPS: row.has_gps,
    points: row.points || [],
    bestEfforts: row.best_efforts || {},
    bestSpeedEfforts: row.best_speed_efforts || {},
    ...(row.metadata || {})
  };
}

async function rideToRow(ride: Ride) {
  const userId = await getUserId();
  
  const {
    id, name, date, distance, duration, elevGain, avgSpeed, avgPower, avgHR,
    hasPower, hasHR, hasGPS, points, bestEfforts, bestSpeedEfforts,
    ...metadata
  } = ride;

  return {
    id,
    user_id: userId,
    name,
    date,
    distance,
    duration,
    elev_gain: elevGain,
    avg_speed: avgSpeed,
    avg_power: avgPower ?? null,
    avg_hr: avgHR ?? null,
    has_power: hasPower,
    has_hr: hasHR,
    has_gps: hasGPS,
    points: points || null,
    best_efforts: bestEfforts || null,
    best_speed_efforts: bestSpeedEfforts || null,
    metadata
  };
}

function mapSupabaseGear(row: GearRow): Gear {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    brand: row.brand || undefined,
    model: row.model || undefined,
    weight: row.weight ? Number(row.weight) : undefined,
    active: row.active,
    distance: 0,
    components: row.components || []
  };
}

async function gearToRow(gear: Gear) {
  const userId = await getUserId();

  const { id, name, type, brand, model, weight, active, components } = gear;
  return {
    id,
    user_id: userId,
    name,
    type,
    brand: brand || null,
    model: model || null,
    weight: weight ?? null,
    active,
    components
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function saveRide(ride: Ride): Promise<void> {
  const row = await rideToRow(ride);
  const { error } = await supabase.from('rides').upsert(row);
  if (error) throw error;
}

export async function getRide(id: string): Promise<Ride | undefined> {
  const userId = await getUserId();
  const { data, error } = await supabase.from('rides').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? mapSupabaseRide(data) : undefined;
}

export async function getAllRideSummaries(): Promise<(Omit<Ride, 'points'>)[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('rides')
    .select('id, name, date, distance, duration, elev_gain, avg_speed, avg_power, avg_hr, has_power, has_hr, has_gps, best_efforts, best_speed_efforts, metadata')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw error;

  return (data || []).map(row => {
    const { points: _p, ...rest } = mapSupabaseRide(row);
    return rest;
  });
}

export async function getAllRides(): Promise<Ride[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapSupabaseRide);
}

export async function deleteRide(id: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from('rides').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

/**
 * Page size for ride reads that carry `points`.
 *
 * PostgREST caps rows per response (1000 by default), so a single unpaged
 * select silently TRUNCATES for a long-tenured rider - the heatmap and the
 * recalculation would just quietly skip the oldest rides. Paging also avoids
 * building one enormous response body, since `points` holds the full GPS track.
 */
const RIDE_PAGE_SIZE = 200;

/**
 * Every ride including its GPS track, fetched in pages.
 *
 * Prefer {@link getRideTracks} when only the track is needed - this returns
 * every column, which is a lot of payload per row.
 */
export async function getAllRidesFull(): Promise<Ride[]> {
  const userId = await getUserId();
  const all: Ride[] = [];

  for (let from = 0; ; from += RIDE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range(from, from + RIDE_PAGE_SIZE - 1);

    if (error) throw error;
    const rows = data || [];
    all.push(...rows.map(mapSupabaseRide));
    if (rows.length < RIDE_PAGE_SIZE) break;
  }

  return all;
}

/** Minimal shape the heatmap needs: identity plus the GPS track. */
export interface RideTrack {
  id: string;
  name: string;
  date: number;
  points: { lat?: number | null; lng?: number | null }[];
}

/**
 * Rides that have GPS, carrying only the columns a map needs.
 *
 * The heatmap used to call getAllRidesFull() and throw away almost all of it,
 * pulling every column of every ride ever recorded just to read coordinates.
 * `sinceMs` pushes the date window into the query instead of filtering client
 * side, so a non-Pro user viewing 30 days doesn't download years of tracks.
 */
export async function getRideTracks(sinceMs?: number): Promise<RideTrack[]> {
  const userId = await getUserId();
  const all: RideTrack[] = [];

  for (let from = 0; ; from += RIDE_PAGE_SIZE) {
    let query = supabase
      .from('rides')
      .select('id, name, date, points')
      .eq('user_id', userId)
      .eq('has_gps', true);

    if (sinceMs != null) query = query.gte('date', sinceMs);

    const { data, error } = await query
      .order('date', { ascending: false })
      .range(from, from + RIDE_PAGE_SIZE - 1);

    if (error) throw error;
    const rows = data || [];
    for (const row of rows) {
      all.push({
        id: row.id,
        name: row.name,
        date: Number(row.date),
        points: Array.isArray(row.points) ? row.points : [],
      });
    }
    if (rows.length < RIDE_PAGE_SIZE) break;
  }

  return all;
}

export async function rideExists(id: string): Promise<boolean> {
  const userId = await getUserId();
  const { data, error } = await supabase.from('rides').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function updateRideMeta(
  id: string,
  patch: Partial<Pick<import('../types/workout').Ride, 'notes' | 'label' | 'weather' | 'gearId' | 'rpe' | 'aiAnalysis'>>
): Promise<void> {
  const userId = await getUserId();
  const { data, error: getErr } = await supabase.from('rides').select('metadata').eq('id', id).eq('user_id', userId).maybeSingle();
  if (getErr || !data) return;
  const newMetadata = { ...(data.metadata || {}), ...patch };
  const { error } = await supabase.from('rides').update({ metadata: newMetadata }).eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// ─── Gear Tracker API ─────────────────────────────────────────────────────────

export async function saveGear(gear: Gear): Promise<void> {
  const row = await gearToRow(gear);
  const { error } = await supabase.from('gear').upsert(row);
  if (error) throw error;
}

export async function getGear(id: string): Promise<Gear | undefined> {
  const userId = await getUserId();
  const { data, error } = await supabase.from('gear').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? mapSupabaseGear(data) : undefined;
}

export async function getAllGear(): Promise<Gear[]> {
  const userId = await getUserId();
  const { data: gearsData, error: gearsErr } = await supabase.from('gear').select('*').eq('user_id', userId);
  if (gearsErr) throw gearsErr;

  const { data: ridesData, error: ridesErr } = await supabase.from('rides').select('date, distance, metadata').eq('user_id', userId);
  if (ridesErr) throw ridesErr;

  const gears = (gearsData || []).map(mapSupabaseGear);
  const rides = (ridesData || []).map(r => ({
    date: Number(r.date),
    distance: Number(r.distance),
    gearId: r.metadata?.gearId
  }));

  return gears.map(g => {
    const gearRides = rides.filter(r => r.gearId === g.id);
    const totalDist = gearRides.reduce((sum, r) => sum + r.distance, 0);

    const updatedComponents = g.components.map(c => {
      const installTime = c.installedAt || 0;
      const compRides = gearRides.filter(r => r.date >= installTime);
      const compDist = compRides.reduce((sum, r) => sum + r.distance, 0);
      return { ...c, distance: compDist };
    });

    return {
      ...g,
      distance: totalDist,
      components: updatedComponents
    };
  });
}

export async function deleteGear(id: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from('gear').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// ─── Planned Workouts Supabase API ──────────────────────────────────────────

export async function savePlannedWorkout(workout: PlannedWorkoutItem & { ftp?: number; lthr?: number }): Promise<void> {
  const userId = await getUserId();
  const row = {
    id: workout.id,
    user_id: userId,
    date: workout.date,
    title: workout.title,
    type: workout.type,
    duration_minutes: workout.durationMinutes,
    planned_tss: workout.plannedTSS,
    notes: workout.notes,
    steps: workout.steps || [],
    route_id: workout.routeId,
    ftp: workout.ftp ?? null,
    lthr: workout.lthr ?? null
  };
  const { error } = await supabase.from('planned_workouts').upsert(row);
  if (error) throw error;
}

export async function getAllPlannedWorkouts(): Promise<(PlannedWorkoutItem & { ftp?: number; lthr?: number })[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('planned_workouts')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) throw error;
  
  return (data || []).map(row => ({
    id: row.id,
    date: row.date,
    title: row.title,
    type: row.type as PlannedWorkoutItem['type'],
    durationMinutes: row.duration_minutes,
    plannedTSS: row.planned_tss,
    notes: row.notes,
    steps: row.steps,
    routeId: row.route_id,
    ftp: row.ftp ?? undefined,
    lthr: row.lthr ?? undefined
  }));
}

export async function deletePlannedWorkout(id: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from('planned_workouts').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// ─── Routes Supabase API ──────────────────────────────────────────────────────

export async function saveRoute(route: {
  id: string;
  name: string;
  distance: number;
  duration: number;
  elevGain: number;
  points: RoutePoint[];
}): Promise<void> {
  const userId = await getUserId();
  const row = {
    id: route.id,
    user_id: userId,
    name: route.name,
    distance: route.distance,
    duration: route.duration,
    elev_gain: route.elevGain,
    points: route.points
  };
  const { error } = await supabase.from('routes').upsert(row);
  if (error) throw error;
}

export async function getRoute(id: string): Promise<any | undefined> {
  const userId = await getUserId();
  const { data, error } = await supabase.from('routes').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return {
    id: data.id,
    name: data.name,
    distance: Number(data.distance),
    duration: Number(data.duration),
    elevGain: Number(data.elev_gain),
    points: data.points || []
  };
}
