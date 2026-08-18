/**
 * Performance Maleagement Chart (PMC) calculations.
 *
 * Based on Banister's Impulse-Response model, popularised by
 * TrainingPeaks / Andrew Coggan:
 *
 *   CTL (Chronic Training Load)  = 42-day exp. moving average of daily TSS
 *   ATL (Acute Training Load)    =  7-day exp. moving average of daily TSS
 *   TSB (Training Stress Balance) = CTL − ATL   ("form")
 *
 * CTL ≈ "Fitness":   how much training you can absorb
 * ATL ≈ "Fatigue":   recent stress your body still feels
 * TSB ≈ "Form":      positive = fresh/peaking, negative = tired, building
 *
 * Exponential decay constants:
 *   k_CTL = 1 − e^(−1/42) ≈ 0.0233
 *   k_ATL = 1 − e^(−1/7)  ≈ 0.1330
 */

export interface PMCPoint {
  date:  number;   // Unix ms
  tss:   number;   // TSS on that day
  ctl:   number;   // Chronic Training Load (Fitness)
  atl:   number;   // Acute Training Load (Fatigue)
  tsb:   number;   // Training Stress Balance (Form)
}

export interface RideTSS {
  date: number;    // Unix ms
  tss:  number;    // TSS or hrTSS value
}

const K_CTL = 1 - Math.exp(-1 / 42);
const K_ATL = 1 - Math.exp(-1 / 7);

/**
 * Compute the full PMC from a list of ride TSS values.
 * Returns one PMCPoint per calendar day from the earliest ride to today.
 */
export function computePMC(rideTSSList: RideTSS[]): PMCPoint[] {
  if (rideTSSList.length === 0) return [];

  // Group TSS by day (YYYY-MM-DD key)
  const tssPerDay = new Map<string, number>();
  for (const r of rideTSSList) {
    const key = toDateKey(r.date);
    tssPerDay.set(key, (tssPerDay.get(key) ?? 0) + r.tss);
  }

  // Date range: from first ride to today
  const firstDate = new Date(Math.min(...rideTSSList.map(r => r.date)));
  const today     = new Date();
  firstDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const points: PMCPoint[] = [];
  let ctl = 0;
  let atl = 0;
  const cur = new Date(firstDate);

  while (cur <= today) {
    const key = toDateKey(cur.getTime());
    const tss = tssPerDay.get(key) ?? 0;

    ctl = ctl + K_CTL * (tss - ctl);
    atl = atl + K_ATL * (tss - atl);

    points.push({
      date: cur.getTime(),
      tss:  Math.round(tss),
      ctl:  Math.round(ctl * 10) / 10,
      atl:  Math.round(atl * 10) / 10,
      tsb:  Math.round((ctl - atl) * 10) / 10,
    });

    cur.setDate(cur.getDate() + 1);
  }

  return points;
}

export interface PlannedWorkoutItem {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'recovery' | 'endurance' | 'sweetspot' | 'threshold' | 'vo2max' | 'custom';
  durationMinutes: number;
  plannedTSS: number;
  notes?: string;
  steps?: any[];
  routeId?: string;
}

export interface SimulatedPMCPoint extends PMCPoint {
  isSimulated?: boolean;
}

/**
 * Computes historical + simulated future PMC up to a target future date (e.g. +30 days).
 */
export function computeSimulatedPMC(
  rideTSSList: RideTSS[],
  plannedWorkouts: PlannedWorkoutItem[],
  futureDaysCount: number = 30
): SimulatedPMCPoint[] {
  const tssPerDay = new Map<string, { historical: number; planned: number }>();

  // Add historical rides
  for (const r of rideTSSList) {
    const key = toDateKey(r.date);
    const existing = tssPerDay.get(key) ?? { historical: 0, planned: 0 };
    existing.historical += r.tss;
    tssPerDay.set(key, existing);
  }

  // Add planned workouts
  for (const p of plannedWorkouts) {
    const existing = tssPerDay.get(p.date) ?? { historical: 0, planned: 0 };
    existing.planned += p.plannedTSS;
    tssPerDay.set(p.date, existing);
  }

  const allDates = [...rideTSSList.map(r => r.date)];
  if (allDates.length === 0) {
    allDates.push(Date.now());
  }

  const firstDate = new Date(Math.min(...allDates));
  firstDate.setHours(0, 0, 0, 0);

  const maxFutureDate = new Date();
  maxFutureDate.setHours(0, 0, 0, 0);
  maxFutureDate.setDate(maxFutureDate.getDate() + futureDaysCount);

  const todayStr = toDateKey(Date.now());

  const points: SimulatedPMCPoint[] = [];
  let ctl = 0;
  let atl = 0;
  const cur = new Date(firstDate);

  while (cur <= maxFutureDate) {
    const key = toDateKey(cur.getTime());
    const dayData = tssPerDay.get(key);
    
    // For past/today: use historical TSS if available, else fallback to planned
    // For future: use planned TSS
    const isFuture = key > todayStr;
    const tss = isFuture 
      ? (dayData?.planned ?? 0)
      : (dayData?.historical && dayData.historical > 0 ? dayData.historical : (dayData?.planned ?? 0));

    ctl = ctl + K_CTL * (tss - ctl);
    atl = atl + K_ATL * (tss - atl);

    points.push({
      date: cur.getTime(),
      tss: Math.round(tss),
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
      isSimulated: isFuture,
    });

    cur.setDate(cur.getDate() + 1);
  }

  return points;
}

/**
 * Recovery advice based on the last ride's TSS:
 *   < 50  → next day fine
 *   50–150 → 24h easy
 *   150–300 → 24–48h
 *   > 300 → 48–72h
 */
export function recoveryAdvice(tss: number): { hours: string; color: string; tip: string } {
  if (tss < 50)  return { hours: '< 12u',  color: '#00b894', tip: 'Tomorrow weer volledig fit.' };
  if (tss < 150) return { hours: '12–24u', color: '#fdcb6e', tip: 'Neem het morgen rustig aan.' };
  if (tss < 300) return { hours: '24–48u', color: '#e17055', tip: 'Minimum één rustdag inplannen.' };
  return               { hours: '48–72u', color: '#d63031', tip: 'Zware ride — twee à drie rustdagen.' };
}

/**
 * Interpret TSB (form):
 *   > 25   → Mogelijk overtraind / te veel rust
 *   5–25   → Piekconditie 🏆
 *   -10–5  → Goed trainingsblok
 *   -25–-10 → Opbouw / vermoeidheid
 *   < -25  → Overtraining risico ⚠️
 */
export function interpretTSB(tsb: number): { label: string; color: string; emoji: string } {
  if (tsb >  25)  return { label: 'Vers / te weinig prikkels', color: '#74b9ff', emoji: '😴' };
  if (tsb >   5)  return { label: 'Piekconditie',             color: '#55efc4', emoji: '🏆' };
  if (tsb >  -10) return { label: 'Goede trainingsperiode',   color: '#00b894', emoji: '💪' };
  if (tsb >  -25) return { label: 'Opbouwfase / vermoeid',    color: '#fdcb6e', emoji: '📈' };
  return                  { label: 'Overtraining risico',     color: '#d63031', emoji: '⚠️' };
}

function toDateKey(ms: number): string {
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
