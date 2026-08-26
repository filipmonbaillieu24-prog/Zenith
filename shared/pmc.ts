/**
 * Performance Management Chart (PMC) calculations.
 *
 * Based on Banister's Impulse-Response model, popularised by
 * TrainingPeaks / Andrew Coggan:
 *
 *   CTL (Chronic Training Load)  = 42-day exp. moving average of daily TSS
 *   ATL (Acute Training Load)    =  7-day exp. moving average of daily TSS
 *   TSB (Training Stress Balance) = CTL − ATL   ("form")
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
  const tssPerDay = new Map<string, { historical: number; planned: number; hasPlanned: boolean }>();

  // Add historical rides
  for (const r of rideTSSList) {
    const key = toDateKey(r.date);
    const existing = tssPerDay.get(key) ?? { historical: 0, planned: 0, hasPlanned: false };
    existing.historical += r.tss;
    tssPerDay.set(key, existing);
  }

  // Add planned workouts
  for (const p of plannedWorkouts) {
    const existing = tssPerDay.get(p.date) ?? { historical: 0, planned: 0, hasPlanned: false };
    existing.planned += p.plannedTSS;
    existing.hasPlanned = true;
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

  // Recent-average fallback for unplanned future days.
  //
  // Without this, any future day with no explicit planned_workouts row gets TSS=0,
  // so the "+N day forecast" always decays toward zero the moment there's nothing
  // planned — which is the common case for most athletes. That reads as "if you
  // stop training entirely" rather than a useful forecast. Instead, default an
  // unplanned future day's projected TSS to the athlete's own recent average daily
  // load (last RECENT_AVG_LOOKBACK_DAYS calendar days of *actual* historical TSS,
  // including rest days as 0 in the average), so the forecast reflects "if you keep
  // training like you have been." Days with an explicit planned_workouts entry
  // (even one planned at 0 TSS, e.g. a scheduled rest day) still take priority and
  // are used as-is.
  const RECENT_AVG_LOOKBACK_DAYS = 14;
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  let recentTssSum = 0;
  let recentDayCount = 0;
  for (let i = 0; i < RECENT_AVG_LOOKBACK_DAYS; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    if (d < firstDate) break; // don't look back further than we have any data for
    const key = toDateKey(d.getTime());
    recentTssSum += tssPerDay.get(key)?.historical ?? 0;
    recentDayCount++;
  }
  const recentAvgTss = recentDayCount > 0 ? recentTssSum / recentDayCount : 0;

  const points: SimulatedPMCPoint[] = [];
  let ctl = 0;
  let atl = 0;
  const cur = new Date(firstDate);

  while (cur <= maxFutureDate) {
    const key = toDateKey(cur.getTime());
    const dayData = tssPerDay.get(key);

    // For past/today: use historical TSS if available, else fallback to planned
    // For future: use planned TSS if a workout is explicitly planned for that day,
    // otherwise default to the recent-average load rather than 0 (see above).
    const isFuture = key > todayStr;
    const tss = isFuture
      ? (dayData?.hasPlanned ? dayData.planned : recentAvgTss)
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
 * Recovery advice based on the last ride's TSS.
 */
export function recoveryAdvice(tss: number): { hours: string; color: string; tip: string } {
  if (tss < 50)  return { hours: '< 12h',  color: '#00b894', tip: 'Fully fit tomorrow.' };
  if (tss < 150) return { hours: '12–24h', color: '#fdcb6e', tip: 'Take it easy tomorrow.' };
  if (tss < 300) return { hours: '24–48h', color: '#e17055', tip: 'Plan at least one rest day.' };
  return               { hours: '48–72h', color: '#d63031', tip: 'Heavy ride — two to three rest days.' };
}

/**
 * Interpret TSB (form).
 */
export function interpretTSB(tsb: number): { label: string; color: string; emoji: string } {
  if (tsb >  25)  return { label: 'Fresh / too little stimulus', color: '#74b9ff', emoji: '😴' };
  if (tsb >   5)  return { label: 'Peak condition',             color: '#55efc4', emoji: '🏆' };
  if (tsb >  -10) return { label: 'Optimal training period',   color: '#00b894', emoji: '💪' };
  if (tsb >  -25) return { label: 'Build phase / fatigued',    color: '#fdcb6e', emoji: '📈' };
  return                  { label: 'Overtraining risk',     color: '#d63031', emoji: '⚠️' };
}

/**
 * One-line, human-readable context sentence for a TSB value — matches the
 * tone of interpretTSB's five states without repeating the pill label
 * verbatim. Single source of truth for the "Form · TSB" hero card copy so
 * every app (Aero, Kratos, Hub) says the same thing for the same TSB.
 */
export function tsbContext(tsb: number): string {
  const { label } = interpretTSB(tsb);
  switch (label) {
    case 'Fresh / too little stimulus':
      return "You're well recovered but training load has been light — there's room to push harder.";
    case 'Peak condition':
      return "Fitness and freshness are both high right now — this is a good window for your hardest efforts.";
    case 'Optimal training period':
      return 'A healthy, sustainable balance of fitness and fatigue for consistent training.';
    case 'Build phase / fatigued':
      return "You're carrying more fatigue than fitness right now — expected mid-build, not a warning sign.";
    default:
      return tsb < -25
        ? 'Fatigue has been outpacing recovery for a while — consider prioritizing rest this week.'
        : 'Keep an eye on recovery markers over the next few sessions.';
  }
}

function toDateKey(ms: number): string {
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
