export type RouteProfile = 'road' | 'trekking' | 'gravel' | 'mtb';

export type RouteType = 'loop' | 'point-to-point';

export type DirectionBias = 'N' | 'E' | 'S' | 'W' | 'random' | 'wind';

export type SurfacePreference = 'asphalt' | 'mixed' | 'unpaved';

export type ClimbCategory = 'flat' | 'rolling' | 'hilly' | 'mountainous';

export interface WindData {
  speed: number;        // km/h
  direction: number;   // degrees (0 = North)
  cardinal: string;    // e.g. "WNW"
  timeSlot: string;
}

export interface RouteStats {
  distance: number;      // km
  elevationGain: number; // m
  elevationLoss: number; // m
  duration: number;      // seconds
  maxGradient: number;   // steepest segment in %
  avgGradient: number;   // average gradient of all climbing segments in %
  climbCategory: ClimbCategory;
  hasBacktrack: boolean; // true if the route reuses road segments (detected via proximity)
}

export interface RoutePoint {
  lat: number;
  lng: number;
  ele: number;      // meters
  distance: number; // cumulative meters from start
}

export interface GeneratedRoute {
  points: RoutePoint[];
  stats: RouteStats;
  geojson: any;
}

export interface RouteOptions {
  profile: RouteProfile;
  surfacePreference: SurfacePreference;
  preferCycleroutes: boolean;
  avoidHills: boolean;
  maxElevationGain: number; // 0 = no limit
}

export interface SavedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  savedAt: number; // Unix timestamp
}
