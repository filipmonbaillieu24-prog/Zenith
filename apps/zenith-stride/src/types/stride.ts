export type RunType = 'easy' | 'long_run' | 'intervals' | 'tempo' | 'treadmill' | 'trail' | 'race';
export type ActivitySource = 'manual' | 'gpx' | 'polar' | 'strava';

export interface RouteCoordinate {
  lat: number;
  lng: number;
  ele?: number;
  hr?: number;
  time?: string;
}

export interface KmSplit {
  km: number;
  paceMinKm: number;
  hr?: number;
  elevationGain?: number;
}

export interface RunActivity {
  id: string;
  user_id?: string;
  title: string;
  date: string; // YYYY-MM-DD
  timeOfDay?: string; // HH:mm
  type: RunType;
  isTreadmill: boolean;
  inclinePercent?: number; // E.g. 1.5% loopband helling
  distanceKm: number;
  durationSec: number;
  avgPaceMinKm: number; // Decimal pace min/km (4.5 = 4:30 min/km)
  maxPaceMinKm?: number;
  gapMinKm?: number; // Grade-Adjusted Pace
  elevationGainM: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadenceSpm?: number; // Steps per minute (bijv. 174 spm)
  runningPowerWatts?: number;
  calories?: number;
  rpe?: number; // Rate of Perceived Exertion (1-10)
  shoeId?: string;
  shoeName?: string;
  source: ActivitySource;
  notes?: string;
  routeCoordinates?: RouteCoordinate[];
  splits?: KmSplit[];
  created_at?: string;
}

export interface RunningShoe {
  id: string;
  brand: string;
  model: string;
  nickname?: string;
  totalDistanceKm: number;
  maxDistanceKm: number; // e.g. 700 km
  retired: boolean;
  purchaseDate?: string;
}

export interface PaceZone {
  name: string;
  rangeMinKm: string;
  percentTime: number;
  color: string;
}
