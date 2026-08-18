// ─── Core data types for workout tracking ────────────────────────────────────

export interface NeuralAnalysis {
  fatigue: number;  // 0 t/m 1 (spiervermoeidheid / stijfheid)
  recovery: number; // 0 t/m 1 (fitheid / frisheid)
  illness: number;  // 0 t/m 1 (ziekte / acute pijn)
}

/**
 * One data sample from a ride (typically 1-second resolution from FIT/GPX).
 * All fields are optional — not every device records all metrics.
 */
export interface RidePoint {
  time:      number;   // Unix timestamp (ms)
  lat?:      number;
  lng?:      number;
  ele?:      number;   // m
  distance?: number;   // cumulative meters
  power?:    number;   // watts
  hr?:       number;   // bpm
  cadence?:  number;   // rpm
  speed?:    number;   // m/s
}

/** Best average power (watts) held for each duration. */
export interface BestEfforts {
  s5?:  number;
  s15?: number;
  s30?: number;
  m1?:  number;
  m2?:  number;
  m5?:  number;
  m10?: number;
  m20?: number;
  m60?: number;
}

/** Best average speed (km/h) held for each duration — for GPS-only riders. */
export interface BestSpeedEfforts {
  s30?: number;
  m1?:  number;
  m5?:  number;
  m10?: number;
  m20?: number;
  m60?: number;
}

/** Cached summary stored in the DB index (no points — fast to list). */
export interface RideSummary {
  id:               string;
  name:             string;
  date:             number;   // Unix ms
  distance:         number;   // km
  duration:         number;   // seconds moving
  elevGain:         number;   // m
  avgSpeed:         number;   // km/h
  maxSpeed?:        number;   // km/h

  // Power (optional — only if device has power meter)
  avgPower?:        number;   // W
  normPower?:       number;   // W — Normalized Power
  maxPower?:        number;   // W
  tss?:             number;   // Training Stress Score (power-based)
  intensityFactor?: number;   // IF = NP / FTP
  eFTP?:            number;   // W — eFTP at time of ride
  isEstimatedPower?: boolean; // of het vermogen is geschat

  // Heart rate (optional — only if HR sensor present)
  avgHR?:           number;   // bpm
  maxHR?:           number;   // bpm
  hrTSS?:           number;   // HR-based Training Stress Score
  efficiencyFactor?: number;  // EF = NP/avgHR (or speed/avgHR normalized)
  decoupling?:      number;   // % cardiac drift — aerobic fitness indicator

  // Cadence
  avgCadence?:      number;   // rpm

  // VAM
  vam?:             number;   // m/h

  // Zone time distribution (seconds per zone, index 0 = zone 1)
  powerZoneTime?:   number[];  // 6 zones (Coggan)
  hrZoneTime?:      number[];  // 5 zones

  // Calories (kcal)
  calories?:        number;

  // Rate of Perceived Exertion (Inspanning 1-10)
  rpe?:             number;

  // Pacing & fatigue
  variabilityIndex?: number;   // NP / avgPower — 1.0 = perfect pacing, >1.05 = variable
  firstHalfPower?:  number;    // avg watts first 50% of ride
  secondHalfPower?: number;    // avg watts second 50% — if lower = fatigue
  firstHalfHR?:     number;    // avg bpm first 50%
  secondHalfHR?:    number;    // avg bpm second 50% — if higher = cardiac drift
  firstHalfSpeed?:  number;    // avg km/h first 50%
  secondHalfSpeed?: number;    // avg km/h second 50%

  // Heart rate recovery
  hrRecovery60?:    number;    // bpm drop in 60s after peak HR — higher = fitter

  // Geavanceerde progressie metrics (Fase 2)
  phenotype?:             string;    // Fysiologische classificatie: Sprinter, Puncheur, Tijdridespecialist, Climber
  kjTotal?:               number;    // Totale energieverbruik in kJ
  fresh5minPower?:        number;    // Beste 5 min vermogen (fris, <1000 kJ)
  fatigued5minPower?:     number;    // Beste 5 min vermogen (vermoeid, >=1000 kJ)
  fresh20minPower?:       number;    // Beste 20 min vermogen (fris, <1000 kJ)
  fatigued20minPower?:    number;    // Beste 20 min vermogen (vermoeid, >=1000 kJ)
  cardiacCost?:           number;    // Cardiale kosten per meter (beats/meter)
  climbingAvgHR?:         number;    // Averagee hartslag tijdens beklimmingen
  activeHRDecayRate?:     number;    // Speed van hartslagherstel tijdens actieve rust (bpm/min)
  cadenceEfficiencySweetspot?: number; // Optimale cadans with laagste hartslag/vermogen ratio

  // User-added metadata
  notes?:   string;   // free-text notes per ride
  label?:   RideLabel; // categorisation tag

  // Weather (fetched lazily from Open-Meteo and persisted)
  weather?: {
    tempC: number; windKmh: number; windDir: number;
    precipitation: number; weatherCode: number; description: string;
  };

  // Weight at time of ride
  weight?:          number;

  // What data this ride contains
  hasPower: boolean;
  hasHR:    boolean;
  hasGPS:   boolean;
  gearId?:  string; // gekoppelde gear
  aiAnalysis?: NeuralAnalysis;
  discipline?: 'road' | 'gravel' | 'mtb';
}

export type RideLabel =
  | 'duurride'
  | 'interval'
  | 'wedstrijd'
  | 'herstel'
  | 'groepsride'
  | 'pendel'
  | 'berg';

export const RIDE_LABELS: { key: RideLabel; label: string; icon: string; color: string }[] = [
  { key: 'duurride',   label: 'Endurance',   icon: '🟢', color: '#00b894' },
  { key: 'interval',  label: 'Interval',    icon: '🔴', color: '#ff7675' },
  { key: 'wedstrijd', label: 'Race',        icon: '🏁', color: '#fdcb6e' },
  { key: 'herstel',   label: 'Recovery',    icon: '💙', color: '#74b9ff' },
  { key: 'groepsride', label: 'Group Ride',  icon: '👥', color: '#a29bfe' },
  { key: 'pendel',    label: 'Commute',     icon: '🏙️', color: '#55efc4' },
  { key: 'berg',      label: 'Climb',       icon: '⛰️', color: '#e17055' },
];

/** Full ride including all data points (stored in IndexedDB). */
export interface Ride extends RideSummary {
  points:           RidePoint[];
  bestEfforts:      BestEfforts;
  bestSpeedEfforts: BestSpeedEfforts;
}

/**
 * User fitness profile — stored in localStorage.
 * Users can enter known values or let the app estimate them automatically.
 */
export interface FitnessProfile {
  // Personal
  name?:      string;   // display name
  gender?:    'male' | 'female' | 'other';
  birthDate?: string;   // ISO date (YYYY-MM-DD) — age is derived from this
  height?:    number;   // cm — used for BMI
  weight?:    number;   // kg — used for W/kg and BMI
  weightHistory?: WeightEntry[]; // gewichtshistorie over tijd

  // Training thresholds (manual or auto-estimated)
  ftp?:       number;   // W — Functional Threshold Power
  lthr?:      number;   // bpm — Lactate Threshold HR
  maxHR?:     number;   // bpm — max heart rate (overrides age estimate)

  // Estimation preferences
  autoEFTP:   boolean;  // compute eFTP from ride history
  autoLTHR:   boolean;  // compute LTHR from ride history

  // Goal settings
  trainingGoal?: TrainingGoal;
  bodyFat?:      number;   // % body fat - used for climb power and composition estimations
}

export type TrainingGoal = 'general' | 'climbing' | 'speed' | 'endurance';

export interface WeightEntry {
  date: string;   // YYYY-MM-DD
  weight: number; // kg
}

/** Power zone definition. */
export interface PowerZone {
  zone:   number;
  name:   string;
  color:  string;
  minPct: number; // % of FTP
  maxPct: number; // % of FTP (999 = unlimited)
}

/** HR zone definition. */
export interface HRZone {
  zone:   number;
  name:   string;
  color:  string;
  minPct: number; // % of LTHR
  maxPct: number;
}

export const POWER_ZONES: PowerZone[] = [
  { zone: 1, name: 'Active Recovery',      color: '#74b9ff', minPct:   0, maxPct:  55 },
  { zone: 2, name: 'Endurance', color: '#00b894', minPct:  56, maxPct:  75 },
  { zone: 3, name: 'Tempo',               color: '#fdcb6e', minPct:  76, maxPct:  90 },
  { zone: 4, name: 'Lactaatdrempel',      color: '#e17055', minPct:  91, maxPct: 105 },
  { zone: 5, name: 'VO2max',              color: '#d63031', minPct: 106, maxPct: 120 },
  { zone: 6, name: 'Anaerobic',            color: '#6c5ce7', minPct: 121, maxPct: 999 },
];

export const HR_ZONES: HRZone[] = [
  { zone: 1, name: 'Active Recovery',      color: '#74b9ff', minPct:   0, maxPct:  68 },
  { zone: 2, name: 'Endurance', color: '#00b894', minPct:  69, maxPct:  83 },
  { zone: 3, name: 'Tempo',               color: '#fdcb6e', minPct:  84, maxPct:  94 },
  { zone: 4, name: 'Lactaatdrempel',      color: '#e17055', minPct:  95, maxPct: 105 },
  { zone: 5, name: 'VO2max',              color: '#d63031', minPct: 106, maxPct: 999 },
];

/** Duration entries for best-effort extraction and PDC. */
export const EFFORT_DURATIONS: { key: keyof BestEfforts; label: string; seconds: number }[] = [
  { key: 's5',  label: '5s',    seconds:    5 },
  { key: 's15', label: '15s',   seconds:   15 },
  { key: 's30', label: '30s',   seconds:   30 },
  { key: 'm1',  label: '1 min', seconds:   60 },
  { key: 'm2',  label: '2 min', seconds:  120 },
  { key: 'm5',  label: '5 min', seconds:  300 },
  { key: 'm10', label: '10 min',seconds:  600 },
  { key: 'm20', label: '20 min',seconds: 1200 },
  { key: 'm60', label: '60 min',seconds: 3600 },
];

export const SPEED_EFFORT_DURATIONS: { key: keyof BestSpeedEfforts; label: string; seconds: number }[] = [
  { key: 's30', label: '30s',   seconds:   30 },
  { key: 'm1',  label: '1 min', seconds:   60 },
  { key: 'm5',  label: '5 min', seconds:  300 },
  { key: 'm10', label: '10 min',seconds:  600 },
  { key: 'm20', label: '20 min',seconds: 1200 },
  { key: 'm60', label: '60 min',seconds: 3600 },
];

export type RideSummaryWithBests = Omit<Ride, 'points'>;

export interface Gear {
  id:          string;
  name:        string; // bijv. "Specialized Tarmac"
  type:        'road' | 'gravel' | 'mtb' | 'other';
  brand?:      string;
  model?:      string;
  weight?:     number; // kg
  distance:    number; // cumulatieve km
  active:      boolean;
  components:  GearComponent[];
}

export interface GearComponent {
  id:          string;
  name:        string; // bijv. "Chain", "Achterband"
  distance:    number; // km sinds installatie
  maxDistance: number; // onderhoudsinterval in km
  installedAt: number; // timestamp ms
  notes?:      string;
  history?:    GearMaintenanceRecord[];
}

export interface GearMaintenanceRecord {
  date:     number;
  distance: number; // km stand op moment van vervanging
}
