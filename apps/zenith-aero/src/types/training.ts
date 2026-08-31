import { toDateKeyFromDate } from '@zenith/shared';

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
  base:     { color: '#00b894', emoji: '🌱', label: 'Base Building',  description: 'Build aerobic base. Lots of Z2, minimal intensity. Volume is king.', weekFocus: ['Endurance (Z2)','Endurance (Z2)','Rest','Endurance (Z2)','Sweet Spot','Endurance (Z2)','Rest'] },
  build:    { color: '#fdcb6e', emoji: '🔨', label: 'Build Phase',   description: 'Build power. Sweet spot and threshold are key, volume stable.', weekFocus: ['Endurance','Sweet Spot','Rest','Threshold','Endurance','Sweet Spot','Rest'] },
  peak:     { color: '#ff7675', emoji: '⚡', label: 'Peak / Taper', description: 'Reduce volume, maintain intensity. Let the body supercompensate.', weekFocus: ['Sweet Spot','Rest','Threshold','Rest','Endurance','Rest','Rest'] },
  race:     { color: '#6c5ce7', emoji: '🏁', label: 'Race Week',    description: 'Minimal workload. Just 1 activation ride. Rest is training.', weekFocus: ['Recovery','Rest','Recovery','Rest','Activation','Rest','RACE'] },
  recovery: { color: '#94a3b8', emoji: '💤', label: 'Recovery',      description: 'Event finished. Take at least 1-2 weeks of full recovery before rebuilding.', weekFocus: ['Rest','Recovery','Rest','Recovery','Rest','Recovery','Rest'] },
};

export function getPhase(eventDate: string): { phase: TrainingPhase; daysToEvent: number; weekLabel: string } {
  const now   = new Date(); now.setHours(0,0,0,0);
  const event = new Date(eventDate); event.setHours(0,0,0,0);
  const days  = Math.round((event.getTime() - now.getTime()) / 86400000);

  if (days < 0)   return { phase: 'recovery',   daysToEvent: days, weekLabel: 'Event finished' };
  if (days < 7)   return { phase: 'race',        daysToEvent: days, weekLabel: 'Race week!' };
  if (days < 21)  return { phase: 'peak',        daysToEvent: days, weekLabel: `Tapering (${days}d)` };
  if (days < 63)  return { phase: 'build',       daysToEvent: days, weekLabel: `Build Phase (${Math.ceil(days/7)}w)` };
  return            { phase: 'base',        daysToEvent: days, weekLabel: `Base Building (${Math.ceil(days/7)}w)` };
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

/** Today as a LOCAL calendar day. A UTC key here made "today" read as yesterday
 *  for anyone east of UTC in the small hours, and as tomorrow for anyone west of
 *  it in the evening - which is when most people log a ride. */
export function todayStr() { return toDateKeyFromDate(new Date()); }
