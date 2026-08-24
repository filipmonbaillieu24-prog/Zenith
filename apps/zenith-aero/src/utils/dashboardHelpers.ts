import { RideSummaryWithBests } from '../types/workout';

export function fmtShortDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

export function computeEFTrend(rides: RideSummaryWithBests[]) {
  const ef = rides.filter(r => r.efficiencyFactor != null);
  if (ef.length < 4) return null;
  const half = Math.floor(ef.length / 2);
  const r = ef.slice(0, half).reduce((s, x) => s + x.efficiencyFactor!, 0) / half;
  const o = ef.slice(half).reduce((s, x) => s + x.efficiencyFactor!, 0) / (ef.length - half);
  return { trend: ((r - o) / o) * 100 };
}

export function getRidePRLabels(
  ride: RideSummaryWithBests,
  globalBests: Record<string, number>,
  field: 'bestEfforts' | 'bestSpeedEfforts',
  durations: { key: string; label: string }[]
): string[] {
  const be = (ride as any)[field];
  if (!be) return [];
  return durations
    .filter(({ key }) => {
      const v = be[key];
      return typeof v === 'number' && globalBests[key] && v >= globalBests[key];
    })
    .map(({ label }) => label);
}

export function buildWeeklyTSS(rides: RideSummaryWithBests[]) {
  const weeklyMap = new Map<string, number>();
  for (const r of rides) {
    const d = new Date(r.date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday of that week
    const key = d.toISOString().slice(0, 10);
    const tss = r.tss ?? r.hrTSS ?? 0;
    weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + tss);
  }
  return Array.from(weeklyMap.entries())
    .map(([date, tss]) => ({ date, tss: Math.round(tss) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildMonthlyStats(rides: RideSummaryWithBests[]) {
  const monthlyMap = new Map<string, { distance: number; duration: number; count: number }>();
  for (const r of rides) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cur = monthlyMap.get(key) ?? { distance: 0, duration: 0, count: 0 };
    monthlyMap.set(key, {
      distance: cur.distance + r.distance,
      duration: cur.duration + r.duration,
      count: cur.count + 1
    });
  }
  return Array.from(monthlyMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => b.month.localeCompare(a.month)) // desc
    .slice(0, 6)
    .reverse();
}

export function computeGlobalBests(rides: RideSummaryWithBests[], field: 'bestEfforts' | 'bestSpeedEfforts') {
  const bests: Record<string, number> = {};
  for (const r of rides) {
    const rBests = (r as any)[field];
    if (rBests) {
      for (const [k, v] of Object.entries(rBests)) {
        if (typeof v === 'number') {
          bests[k] = Math.max(bests[k] ?? 0, v);
        }
      }
    }
  }
  return bests;
}
