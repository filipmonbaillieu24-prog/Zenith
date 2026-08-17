// ─── Training Types ───────────────────────────────────────────────────────────
// Extracted from TrainingPage.tsx for reuse across training sub-components.

export interface WorkoutLogEntry {
  id: string;
  date: string;           // YYYY-MM-DD
  workoutType: string;
  durationMinutes: number;
  rpe: number;            // 1–10
  notes: string;
}

export type SubTab = 'coach' | 'periodization';

export type TrainingPhase = 'base' | 'build' | 'peak' | 'race' | 'recovery';

export interface PhaseConfig {
  color: string;
  emoji: string;
  label: string;
  description: string;
  weekFocus: string[];
}

export const phaseConfig: Record<TrainingPhase, PhaseConfig> = {
  base:     { color: '#00b894', emoji: '🌱', label: 'Basisopbouw',  description: 'Opbouw van aerobe basis. Veel Z2, minimale intensiteit. Volume is koning.', weekFocus: ['Duur (Z2)','Duur (Z2)','Rust','Duur (Z2)','Sweet Spot','Duur (Z2)','Rust'] },
  build:    { color: '#fdcb6e', emoji: '🔨', label: 'Build Phase',   description: 'Opbouw van vermogen. Sweet spot en drempel centraal, volume stabiel.', weekFocus: ['Duur','Sweet Spot','Rust','Threshold','Duur','Sweet Spot','Rust'] },
  peak:     { color: '#ff7675', emoji: '⚡', label: 'Piek / Taper', description: 'Verlaag volume, behoud intensiteit. Laat het lichaam supercompenseren.', weekFocus: ['Sweet Spot','Rust','Threshold','Rust','Duur','Rust','Rust'] },
  race:     { color: '#6c5ce7', emoji: '🏁', label: 'Race Week',    description: 'Minimale belasting. Slechts 1 activeringsride. Rust is training.', weekFocus: ['Recovery','Rust','Recovery','Rust','Activering','Rust','RACE'] },
  recovery: { color: '#94a3b8', emoji: '💤', label: 'Recovery',      description: 'Event voorbij. Neem minimaal 1-2 weken volledig herstel voor je weer opbouwt.', weekFocus: ['Rust','Recovery','Rust','Recovery','Rust','Recovery','Rust'] },
};

export function getPhase(eventDate: string): { phase: TrainingPhase; daysToEvent: number; weekLabel: string } {
  const now   = new Date(); now.setHours(0,0,0,0);
  const event = new Date(eventDate); event.setHours(0,0,0,0);
  const days  = Math.round((event.getTime() - now.getTime()) / 86400000);

  if (days < 0)   return { phase: 'recovery',   daysToEvent: days, weekLabel: 'Event voorbij' };
  if (days < 7)   return { phase: 'race',        daysToEvent: days, weekLabel: 'Race week!' };
  if (days < 21)  return { phase: 'peak',        daysToEvent: days, weekLabel: `Tapering (${days}d)` };
  if (days < 63)  return { phase: 'build',       daysToEvent: days, weekLabel: `Build fase (${Math.ceil(days/7)}w)` };
  return            { phase: 'base',        daysToEvent: days, weekLabel: `Basisopbouw (${Math.ceil(days/7)}w)` };
}

export interface CustomBlock {
  id: string;
  name: string;
  durationMin: number;
  powerPct: number;
  zone: 1 | 2 | 3 | 4 | 5;
}

export const zoneColors = ['#94a3b8','#00b894','#fdcb6e','#ff7675','#d63031'];

export const intensityOrder = ['recovery', 'endurance', 'sweetspot', 'threshold', 'vo2max'] as const;
export type WorkoutType = typeof intensityOrder[number];

export const phaseCap: Record<TrainingPhase, WorkoutType> = {
  base:     'sweetspot',
  build:    'vo2max',
  peak:     'endurance',
  race:     'recovery',
  recovery: 'recovery',
};

// ─── Workout Log Storage Helpers ─────────────────────────────────────────────

export const LOG_KEY = 'cyclo_workout_log';
export const CAL_KEY = 'cyclo_planned_workouts';

export function loadLog(): WorkoutLogEntry[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]'); } catch { return []; }
}

export function saveLog(entries: WorkoutLogEntry[]) {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries));
}

export function todayStr() { return new Date().toISOString().slice(0, 10); }
