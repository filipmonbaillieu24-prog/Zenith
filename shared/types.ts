// ==========================================================
// ZENITH ECOSYSTEM - UNIFIED TYPES & SCHEMAS
// ==========================================================

export interface Profile {
  id: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  ftp?: number;
  weight?: number;
  height?: number;
  target_calories?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Ride {
  id: string;
  user_id: string;
  title: string;
  date: number;
  duration_seconds: number;
  distance_km: number;
  elevation_gain_m: number;
  tss: number;
  np: number;
  if_score: number;
  avg_hr?: number;
  max_hr?: number;
  avg_power?: number;
  max_power?: number;
  gpx_data?: string;
  created_at?: string;
}

export interface RidePoint {
  time:     number;   // Unix ms
  lat?:     number;
  lng?:     number;
  ele?:     number;   // meters
  speed?:   number;   // m/s
  power?:   number;   // Watts
  hr?:      number;   // bpm
  cadence?: number;   // rpm
  distance?: number;  // cumulative meters
}

export interface WeightLog {
  id?: string;
  user_id: string;
  weight: number;
  body_fat?: number;
  water_percentage?: number;
  impedance?: number;
  source?: 'ble_scale' | 'manual';
  recorded_at: string;
}

export interface ColmiRingData {
  steps: {
    timestamp: number;
    step_count: number;
  }[];
  sleep: {
    timestamp: number;
    duration_minutes: number;
    deep_minutes?: number;
    light_minutes?: number;
    rem_minutes?: number;
    awake_minutes?: number;
    quality_score: number;
  }[];
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_size: string;
}

export interface MealLog {
  id: string;
  user_id: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  food_item_id?: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged_at: string;
}

export interface WorkoutStep {
  id: string;
  name: string;
  target_reps: number;
  target_weight_kg: number;
  completed_reps?: number;
  completed_weight_kg?: number;
  rir?: number;
  is_warmup?: boolean;
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  date: string;
  duration_minutes?: number;
  steps: WorkoutStep[];
  notes?: string;
  created_at?: string;
}

export interface PMCData {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  tss: number;
}
