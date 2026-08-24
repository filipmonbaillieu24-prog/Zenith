import { Workout } from '../utils/workouts';
import { CustomBlock, zoneColors } from '../types/training';
import { savePlannedWorkout, saveRoute } from './db';
import { GeneratedRoute } from '../types/route';
import { FitnessProfile } from '../types/workout';

// ─── Custom Workout Builder Helper ───────────────────────────────────────────

export function customToWorkout(blocks: CustomBlock[], title: string): Workout {
  return {
    title: title || 'Aangepaste Workout',
    description: 'Aangepast via de interval builder.',
    type: 'sweetspot',
    blocks: blocks.map(b => ({
      name: b.name,
      duration: b.durationMin * 60,
      powerPct: b.powerPct / 100,
      zone: b.zone,
      color: zoneColors[b.zone - 1],
    })),
  };
}

// ─── Calendar Planning Helper ─────────────────────────────────────────────────

export async function planWorkoutInCalendar(
  workout: Workout,
  dateStr: string,
  durationMin: number,
  profile: FitnessProfile,
  route?: GeneratedRoute
): Promise<void> {
  const tssMap: Record<string, number> = {
    recovery: 0.4, endurance: 0.8, sweetspot: 1.1, threshold: 1.25, vo2max: 1.4,
  };
  const tssPerMin = tssMap[workout.type] ?? 1.0;
  
  let routeId: string | undefined = undefined;
  if (route) {
    routeId = 'route_' + Date.now();
    await saveRoute({
      id: routeId,
      name: route.stats.climbCategory === 'flat' ? 'Flat ride' : 'Hilly ride',
      distance: route.stats.distance,
      duration: route.stats.duration,
      elevGain: route.stats.elevationGain,
      points: route.points
    });
  }

  const newItem = {
    id: 'planned_' + Date.now(),
    date: dateStr,
    title: workout.title,
    type: workout.type as any,
    durationMinutes: durationMin,
    plannedTSS: Math.round(durationMin * tssPerMin),
    notes: workout.description,
    steps: workout.blocks.map(b => ({
      name: b.name,
      duration: b.duration,
      powerPct: b.powerPct,
      zone: b.zone,
      color: b.color
    })),
    routeId,
    ftp: profile.ftp,
    lthr: profile.lthr
  };

  await savePlannedWorkout(newItem);
}
