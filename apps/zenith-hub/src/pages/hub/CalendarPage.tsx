import React, { useEffect, useMemo, useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Plus, 
  Trash2,
  Dumbbell,
  Bike,
  Footprints
} from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { PlannedWorkoutItem } from '../../utils/pmc';
import { computeSimulatedPMC, interpretTSB } from '@zenith/shared';
import './CalendarPage.css';
import {
  DISCIPLINE_LABELS, Discipline, countTemplateSets, estimateGymDuration,
  resolveRunPace, estimateRunDuration, formatPace, rideDurationFromTss, rideTssFromDuration,
  MIN_PER_SET_FALLBACK, fulfilledPlanIds, CompletedActivity,
  summariseWeekLoad, buildTrainingLoadPool, estimateKratosSessionLoadFromSets,
  matchPlansToActivities, plannedTrainingLoad, suggestedWeeklyLoad, weekStartKey,
  fetchWeeklyLoadTargets, saveWeeklyLoadTarget,
  eftpTrend, strengthTrend, runningEconomyTrend, loadTrend, Trend
} from '@zenith/shared';

interface CalendarPageProps {
  userId: string;
  onOpenRideInAero?: (rideId: string) => void;
}

type WorkoutType = 'recovery' | 'endurance' | 'sweetspot' | 'threshold' | 'vo2max' | 'custom';

interface CompletedRide {
  id: string;
  name: string;
  date: number; // timestamp
  distance: number;
  duration: number; // seconds
  elevGain: number;
  avgSpeed: number;
  avgPower?: number;
  avgHR?: number;
  hasPower: boolean;
  hasHR: boolean;
  bestEfforts?: Record<string, number>;
  bestSpeedEfforts?: Record<string, number>;
  tss?: number;
}

interface KratosWorkout {
  id: string;
  name: string;
  started_at: string;
  completed_at: string;
  volume: number;
  sets: {
    exercise_id: string;
    sets: {
      type: 'warmup' | 'working' | 'drop';
      weight: number;
      reps: number;
      rir?: number;
    }[];
  }[];
}

interface StrideRun {
  id: string;
  title: string;
  date: string;
  distanceKm: number;
  durationSec: number;
  avgPaceMinKm: number | null;
  avgHeartRate: number | null;
  isTreadmill: boolean;
}

type CalendarItem = 
  | { category: 'planned'; dateStr: string; raw: PlannedWorkoutItem }
  | { category: 'ride'; dateStr: string; raw: CompletedRide }
  | { category: 'kratos'; dateStr: string; raw: KratosWorkout }
  // Runs were fetched for pace and for the load totals, and then never turned into
  // calendar items - so a logged run counted toward the week's load while showing
  // nothing at all on the day it was run.
  | { category: 'stride'; dateStr: string; raw: StrideRun };

export const CalendarPage: React.FC<CalendarPageProps> = ({ userId, onOpenRideInAero }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  /** What went wrong, if anything - an eternal spinner tells the athlete nothing. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [exercisesMap, setExercisesMap] = useState<Record<string, string>>({});
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);

  // ── PMC Simulation States ──
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutItem[]>([]);

  // ── Modal & Form States ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<PlannedWorkoutItem | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<PlannedWorkoutItem['type']>('sweetspot');
  // Which app the planned session belongs to. Planning was cycling-only, so a
  // scheduled gym session or run had nowhere to live - and Fuel, which now reads
  // these to work out what a training day costs, could only ever see rides.
  const [formDiscipline, setFormDiscipline] = useState<Discipline>('aero');
  const [formDistanceKm, setFormDistanceKm] = useState<string>('');
  const [formTemplateId, setFormTemplateId] = useState<string>('');
  const [kratosTemplates, setKratosTemplates] = useState<{ id: string; name: string; totalSets: number }[]>([]);
  /** Wall-clock minutes of past sessions, per routine - the best duration predictor. */
  const [gymDurationHistory, setGymDurationHistory] = useState<Record<string, number[]>>({});
  /** Sessions actually carried out, used to tell which plans have been fulfilled. */
  const [completedActivities, setCompletedActivities] = useState<CompletedActivity[]>([]);
  /** Actual training load per local day, in the same TSS-equivalent unit for all three sports. */
  const [actualLoads, setActualLoads] = useState<{ dateKey: string; tss: number; discipline: Discipline }[]>([]);
  /** Strength load of past sessions, so a planned routine is charged what it really costs. */
  const [gymLoadByTemplate, setGymLoadByTemplate] = useState<Record<string, number[]>>({});
  /** Load targets per week, so the calendar can say whether the plan is the right size. */
  const [weeklyTargets, setWeeklyTargets] = useState<Record<string, number>>({});
  const [editingTargetWeek, setEditingTargetWeek] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState('');
  /** Raw rows kept for the progress trends, which need more than the calendar chips do. */
  const [rawRides, setRawRides] = useState<any[]>([]);
  const [rawKratos, setRawKratos] = useState<any[]>([]);
  const [rawRuns, setRawRuns] = useState<any[]>([]);
  const [exerciseUnits, setExerciseUnits] = useState<Record<string, string | null>>({});
  const [showProgress, setShowProgress] = useState(false);
  const [runPace, setRunPace] = useState<{ paceMinPerKm: number; source: 'history' | 'default'; samples: number }>(
    { paceMinPerKm: 6.5, source: 'default', samples: 0 }
  );
  /** True while the athlete has typed their own duration, so estimates stop overwriting it. */
  const [durationTouched, setDurationTouched] = useState(false);
  const [formDuration, setFormDuration] = useState(60);
  const [formTSS, setFormTSS] = useState(65);
  const [formNotes, setFormNotes] = useState('');
  const [draggedWorkoutId, setDraggedWorkoutId] = useState<string | null>(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const getLocalDateString = (dateObj: Date) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatMonthName = (monthIdx: number) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthIdx];
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    const failures: string[] = [];

    // Every query reports its own failure instead of returning a silent null. A page
    // that spins forever, or quietly renders an empty month, is the same bug wearing
    // two different faces.
    const run = async <T,>(label: string, query: PromiseLike<{ data: T | null; error: any }>): Promise<T | null> => {
      try {
        const { data, error } = await query;
        if (error) {
          failures.push(`${label}: ${error.message ?? error}`);
          return null;
        }
        return data;
      } catch (err: any) {
        failures.push(`${label}: ${err?.message ?? err}`);
        return null;
      }
    };

    try {
      // 1. Fetch Planned Workouts
      // All six are independent, so they go out together rather than in a chain of
      // sequential round-trips.
      const [templateData, plannedData, ridesData, kratosData, runData, exercisesData] = await Promise.all([
        run<any[]>('routines', supabase
          .from('kratos_templates').select('id, name, exercises')
          .eq('user_id', userId).order('name')),
        run<any[]>('planned workouts', supabase
          .from('planned_workouts').select('*').eq('user_id', userId)),
        run<any[]>('rides', supabase
          .from('rides').select('*').eq('user_id', userId)),
        run<any[]>('gym sessions', supabase
          .from('kratos_workouts').select('*').eq('user_id', userId)),
        run<any[]>('runs', supabase
          .from('stride_activities')
          .select('id, title, date, distance_km, duration_sec, avg_pace_min_km, avg_heart_rate, is_treadmill')
          .eq('user_id', userId).order('date', { ascending: false }).limit(50)),
        run<any[]>('exercise names', supabase
          .from('kratos_exercises').select('id, name, weight_unit').eq('user_id', userId))
      ]);

      setRawRides(ridesData || []);
      setRawKratos(kratosData || []);
      setRawRuns(runData || []);
      setWeeklyTargets(await fetchWeeklyLoadTargets(
        supabase, userId,
        weekStartKey(getLocalDateString(new Date(currentYear, currentMonth - 1, 1))),
        weekStartKey(getLocalDateString(new Date(currentYear, currentMonth + 2, 1)))
      ));

      setKratosTemplates((templateData || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        totalSets: countTemplateSets(t.exercises)
      })));

      
      const mappedPlannedWorkouts: PlannedWorkoutItem[] = (plannedData || []).map((p: any) => ({
        id: p.id,
        date: p.date,
        title: p.title,
        type: p.type as any,
        durationMinutes: p.duration_minutes,
        plannedTSS: p.planned_tss,
        discipline: (['aero', 'kratos', 'stride'].includes(p.discipline) ? p.discipline : 'aero') as Discipline,
        distanceKm: p.distance_km === null || p.distance_km === undefined ? null : Number(p.distance_km),
        templateId: p.template_id ?? null,
        notes: p.notes,
        steps: p.steps,
        routeId: p.route_id
      }));
      setPlannedWorkouts(mappedPlannedWorkouts);
      
      const mappedPlanned: CalendarItem[] = mappedPlannedWorkouts.map((p) => ({
        category: 'planned',
        dateStr: p.date, // format YYYY-MM-DD
        raw: p
      }));

      const mappedRides: CalendarItem[] = (ridesData || []).map((r: any) => {
        const rideDate = new Date(Number(r.date));
        const witha = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {};
        return {
          category: 'ride',
          dateStr: getLocalDateString(rideDate),
          raw: {
            id: r.id,
            name: r.name,
            date: Number(r.date),
            distance: Number(r.distance),
            duration: Number(r.duration),
            elevGain: Number(r.elev_gain),
            avgSpeed: Number(r.avg_speed),
            avgPower: r.avg_power ?? undefined,
            avgHR: r.avg_hr ?? undefined,
            hasPower: !!r.has_power,
            hasHR: !!r.has_hr,
            bestEfforts: r.best_efforts ?? undefined,
            bestSpeedEfforts: r.best_speed_efforts ?? undefined,
            tss: witha?.tss ?? witha?.hrTSS ?? undefined
          }
        };
      });

      const mappedKratos: CalendarItem[] = (kratosData || []).map((k: any) => {
        const kDate = new Date(k.completed_at);
        return {
          category: 'kratos',
          dateStr: getLocalDateString(kDate),
          raw: {
            id: k.id,
            name: k.name,
            started_at: k.started_at,
            completed_at: k.completed_at,
            volume: Number(k.volume || 0),
            sets: k.sets || []
          }
        };
      });

      // How long each routine actually takes this athlete. Their own sessions are a
      // far better predictor than any formula - and consistent: PUSH has run 42 to
      // 51 minutes across four sessions, PULL 39 to 43.
      const durations: Record<string, number[]> = {};
      for (const k of (kratosData || []) as any[]) {
        if (!k.template_id || !k.started_at || !k.completed_at || k.is_off_day) continue;
        const mins = (new Date(k.completed_at).getTime() - new Date(k.started_at).getTime()) / 60000;
        if (!Number.isFinite(mins) || mins <= 5 || mins >= 300) continue;
        (durations[k.template_id] ||= []).push(mins);
      }
      // Only the last few, so a routine that has got quicker is not held to last year.
      for (const id of Object.keys(durations)) durations[id] = durations[id].slice(-6);
      setGymDurationHistory(durations);

      setRunPace(resolveRunPace((runData || []).slice(0, 20).map((r: any) => r.avg_pace_min_km)));

      // Everything that was actually done, for matching against what was planned.
      // stride_activities.date is already a local calendar day; the other two carry
      // timestamps and have to be converted rather than sliced, or a late-evening
      // session lands on tomorrow.
      const activities: CompletedActivity[] = [
        ...(ridesData || []).map((r: any) => {
          let meta = r.metadata;
          if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
          return {
            id: String(r.id),
            discipline: 'aero' as const,
            dateKey: getLocalDateString(new Date(Number(r.date))),
            load: Math.round(Number(meta?.tss ?? meta?.hrTSS ?? 0)) || undefined,
            title: r.name
          };
        }),
        ...(kratosData || []).filter((k: any) => !k.is_off_day).map((k: any) => ({
          id: String(k.id),
          discipline: 'kratos' as const,
          dateKey: getLocalDateString(new Date(k.completed_at)),
          templateId: k.template_id ?? null,
          load: estimateKratosSessionLoadFromSets(k.volume, k.sets) || undefined,
          title: k.name
        })),
        ...(runData || []).map((r: any) => ({
          discipline: 'stride' as const,
          dateKey: String(r.date),
          title: 'Run'
        }))
      ];
      setCompletedActivities(activities);

      // Actual load, through the one shared definition all four apps use, so the
      // planned-versus-done comparison is not against a number computed differently
      // here than in Aero's Form chart.
      const pool = buildTrainingLoadPool(
        { rides: ridesData, kratosWorkouts: (kratosData || []).filter((k: any) => !k.is_off_day), strideRuns: runData },
        'all'
      );
      setActualLoads(pool.map(e => ({
        dateKey: getLocalDateString(new Date(e.date)),
        tss: e.tss,
        discipline: e.source as Discipline
      })));

      const gymLoads: Record<string, number[]> = {};
      for (const k of (kratosData || []) as any[]) {
        if (!k.template_id || k.is_off_day || !k.volume) continue;
        const load = estimateKratosSessionLoadFromSets(k.volume, k.sets);
        if (load > 0) (gymLoads[k.template_id] ||= []).push(load);
      }
      setGymLoadByTemplate(gymLoads);

      if (exercisesData) {
        const exMap: Record<string, string> = {};
        const unitMap: Record<string, string | null> = {};
        exercisesData.forEach((ex: any) => {
          exMap[ex.id] = ex.name;
          unitMap[ex.id] = ex.weight_unit ?? null;
        });
        setExercisesMap(exMap);
        setExerciseUnits(unitMap);
      }

      const mappedRuns: CalendarItem[] = (runData || []).map((r: any) => ({
        category: 'stride' as const,
        dateStr: String(r.date),
        raw: {
          id: String(r.id),
          title: r.title || 'Run',
          date: String(r.date),
          distanceKm: Number(r.distance_km) || 0,
          durationSec: Number(r.duration_sec) || 0,
          // null must not become 0 here: 0.00 /km is a claim of instant running,
          // where null is the truth that no pace was recorded.
          avgPaceMinKm: r.avg_pace_min_km === null || r.avg_pace_min_km === undefined || Number(r.avg_pace_min_km) === 0
            ? null
            : Number(r.avg_pace_min_km),
          avgHeartRate: r.avg_heart_rate === null || r.avg_heart_rate === undefined ? null : Number(r.avg_heart_rate),
          isTreadmill: !!r.is_treadmill
        }
      }));

      setItems([...mappedPlanned, ...mappedRides, ...mappedKratos, ...mappedRuns]);
      if (failures.length > 0) setLoadError(failures.join(' · '));
    } catch (err: any) {
      console.error('Failed to fetch calendar data:', err);
      setLoadError(err?.message ? String(err.message) : 'Something went wrong loading the calendar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let settled = false;
    // A request that never comes back used to leave "Loading calendar data..." on
    // screen indefinitely, with nothing to act on. Give up out loud instead.
    const watchdog = window.setTimeout(() => {
      if (settled) return;
      setLoading(false);
      setLoadError('Timed out waiting for your data. Check your connection and reload.');
    }, 20000);

    fetchData().finally(() => {
      settled = true;
      window.clearTimeout(watchdog);
    });

    return () => { settled = true; window.clearTimeout(watchdog); };
  }, [userId]);

  // Which plans were actually carried out. Resolved from the logged sessions rather
  // than from planned_workouts.completed_at, which nothing has ever written to - so
  // without this a finished session and the plan for it sat on the calendar as two
  // separate entries forever.
  const fulfilledPlans = useMemo(
    () => fulfilledPlanIds(plannedWorkouts, completedActivities),
    [plannedWorkouts, completedActivities]
  );

  /** The session that met each plan, so the two can be compared side by side. */
  const planByActivityId = useMemo(() => {
    const map: Record<string, PlannedWorkoutItem> = {};
    const matched = matchPlansToActivities(plannedWorkouts, completedActivities);
    for (const plan of plannedWorkouts) {
      const activity = matched.get(plan.id);
      if (activity && (activity as any).id) map[(activity as any).id] = plan;
    }
    return map;
  }, [plannedWorkouts, completedActivities]);

  /** How a planned session is costed, in the unit the actual load uses. */
  const planLoadCtx = useMemo(() => ({
    gymLoadByTemplate,
    gymLoadOverall: Object.values(gymLoadByTemplate).flat(),
    runPaceMinPerKm: runPace.paceMinPerKm
  }), [gymLoadByTemplate, runPace]);

  /**
   * Form projected forward through what is planned.
   *
   * The plans are restated in the shared load unit first: computeSimulatedPMC reads
   * plannedTSS, which only a ride ever fills in, so without this a week of planned
   * gym work projected as though the athlete were resting.
   */
  const projectedPMC = useMemo(() => {
    if (actualLoads.length === 0) return [];
    const rideTSSList = actualLoads.map(l => ({
      date: new Date(`${l.dateKey}T12:00:00`).getTime(),
      tss: l.tss
    }));
    const simPlans = plannedWorkouts.map(p => ({
      ...p,
      plannedTSS: plannedTrainingLoad(p as any, planLoadCtx) ?? 0
    }));
    return computeSimulatedPMC(rideTSSList, simPlans, 45);
  }, [actualLoads, plannedWorkouts, planLoadCtx]);

  const projectedByDate = useMemo(() => {
    const map: Record<string, { ctl: number; atl: number; tsb: number; isSimulated?: boolean }> = {};
    for (const point of projectedPMC) map[point.date] = point as any;
    return map;
  }, [projectedPMC]);

  /**
   * Are we getting better? Adherence and progress are different questions, and the
   * week column only answers the first.
   */
  const progress = useMemo((): Trend[] => {
    // Each metric sizes its own comparison window against the history it actually
    // has. A fixed six-versus-six would put this athlete's entire gym history on one
    // side and report nothing until October.
    const now = Date.now();
    return [
      loadTrend(actualLoads, null, now),
      eftpTrend(rawRides.map((r: any) => ({ date: Number(r.date), metadata: r.metadata })), null, now),
      strengthTrend(rawKratos, exerciseUnits, null, now),
      runningEconomyTrend(rawRuns, null, undefined, now)
    ];
  }, [actualLoads, rawRides, rawKratos, rawRuns, exerciseUnits]);

  /** Disciplines whose plan for a given day has been fulfilled, for the merged badge. */
  const plannedAndDoneByDate = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const p of plannedWorkouts) {
      if (!fulfilledPlans.has(p.id)) continue;
      (map[p.date] ||= new Set()).add(p.discipline ?? 'aero');
    }
    return map;
  }, [plannedWorkouts, fulfilledPlans]);

  // ── Expected duration ───────────────────────────────────────────────────────
  //
  // Duration used to be a number the athlete guessed at, and it is not cosmetic:
  // Fuel costs gym and running plans directly from it, so guessing 60 for a session
  // that really runs 44 overstated the day's calorie target by a third. Every
  // discipline has something better than a guess available.
  const durationEstimate = useMemo((): { minutes: number; note: string } | null => {
    if (formDiscipline === 'kratos') {
      if (!formTemplateId) return null;
      const tpl = kratosTemplates.find(t => t.id === formTemplateId);
      const est = estimateGymDuration(gymDurationHistory[formTemplateId], tpl?.totalSets);
      if (est.source === 'history') {
        return {
          minutes: est.minutes,
          note: `Median of your last ${est.samples} ${tpl?.name ?? 'session'} workout${est.samples === 1 ? '' : 's'}.`
        };
      }
      if (est.source === 'structure') {
        return {
          minutes: est.minutes,
          note: `${tpl?.totalSets} sets at about ${MIN_PER_SET_FALLBACK} min each — you have not logged this routine yet.`
        };
      }
      return null;
    }

    if (formDiscipline === 'stride') {
      const km = Number(formDistanceKm);
      if (formDistanceKm.trim() === '' || !Number.isFinite(km) || km <= 0) return null;
      return {
        minutes: estimateRunDuration(km, runPace.paceMinPerKm),
        note: runPace.source === 'history'
          ? `${km} km at ${formatPace(runPace.paceMinPerKm)}, your median over ${runPace.samples} run${runPace.samples === 1 ? '' : 's'}.`
          : `${km} km at an assumed ${formatPace(runPace.paceMinPerKm)} — no runs logged yet, so adjust if that is not your pace.`
      };
    }

    // TSS is duration_hours x IF^2 x 100 by definition, so the zone ties the two
    // together and either can be read off the other.
    if (formTSS <= 0) return null;
    return {
      minutes: rideDurationFromTss(formTSS, formType),
      note: `${formTSS} TSS ridden at ${formType} intensity.`
    };
  }, [formDiscipline, formTemplateId, kratosTemplates, gymDurationHistory, formDistanceKm, runPace, formTSS, formType]);

  // Fills the field until the athlete types their own number, and then leaves it
  // alone - an estimate that overwrites what someone has just typed is a bug, not
  // a convenience.
  useEffect(() => {
    if (!isModalOpen || durationTouched || !durationEstimate) return;
    if (durationEstimate.minutes > 0) setFormDuration(durationEstimate.minutes);
  }, [isModalOpen, durationTouched, durationEstimate]);



  // ── Modal Actions ──
  const handleOpenAddModal = (dateStr: string) => {
    setEditingWorkout(null);
    setTargetDate(dateStr);
    // A cycling title was pre-filled whatever the discipline, so a gym plan opened
    // named "Sweet Spot Intervallen". Left blank instead - picking a routine fills it
    // with the routine's name, and a run does not need one.
    setFormTitle('');
    setFormType('sweetspot');
    setFormDiscipline('aero');
    setFormDistanceKm('');
    setFormTemplateId('');
    setFormDuration(60);
    setFormTSS(65);
    setDurationTouched(false);
    setFormNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: PlannedWorkoutItem) => {
    setEditingWorkout(item);
    setTargetDate(item.date);
    setFormTitle(item.title);
    setFormType(item.type);
    setFormDuration(item.durationMinutes);
    setFormTSS(item.plannedTSS);
    setDurationTouched(true);
    setFormDiscipline(item.discipline ?? 'aero');
    setFormDistanceKm(item.distanceKm != null ? String(item.distanceKm) : '');
    setFormTemplateId(item.templateId ?? '');
    setFormNotes(item.notes ?? '');
    setIsModalOpen(true);
  };

  const handleSaveWorkout = async () => {
    // The title used to be pre-filled with a cycling name, so it was never empty and
    // this guard never fired. Now that it starts blank, a gym plan whose routine
    // carries the name, or a run that simply does not need one, would have hit Save
    // and had nothing happen. Fall back to the discipline instead of refusing.
    const title = formTitle.trim()
      || kratosTemplates.find(k => k.id === formTemplateId)?.name
      || DISCIPLINE_LABELS[formDiscipline];
    // The type list is cycling zones. It is only offered for a ride, so anything else
    // would otherwise save with the untouched default of 'sweetspot'.
    const type = formDiscipline === 'aero' ? formType : 'custom';
    try {
      if (editingWorkout) {
        const updated: PlannedWorkoutItem = {
          ...editingWorkout,
          date: targetDate,
          title,
          type,
          durationMinutes: formDuration,
          plannedTSS: formDiscipline === 'aero' ? formTSS : 0,
          discipline: formDiscipline,
          distanceKm: formDiscipline === 'stride' && formDistanceKm.trim() !== '' ? Number(formDistanceKm) : null,
          templateId: formDiscipline === 'kratos' && formTemplateId ? formTemplateId : null,
          notes: formNotes,
        };
        const row = {
          id: updated.id,
          user_id: userId,
          date: updated.date,
          title: updated.title,
          type: updated.type,
          duration_minutes: updated.durationMinutes,
          planned_tss: updated.plannedTSS,
          discipline: updated.discipline ?? 'aero',
          distance_km: updated.distanceKm ?? null,
          template_id: updated.templateId ?? null,
          notes: updated.notes,
          steps: updated.steps || [],
          route_id: updated.routeId
        };
        const { error } = await supabase.from('planned_workouts').upsert(row);
        if (error) throw error;

        setPlannedWorkouts(prev => prev.map(p => p.id === editingWorkout.id ? updated : p));
      } else {
        const newWorkout: PlannedWorkoutItem = {
          id: 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          date: targetDate,
          title,
          type,
          durationMinutes: formDuration,
          plannedTSS: formDiscipline === 'aero' ? formTSS : 0,
          discipline: formDiscipline,
          distanceKm: formDiscipline === 'stride' && formDistanceKm.trim() !== '' ? Number(formDistanceKm) : null,
          templateId: formDiscipline === 'kratos' && formTemplateId ? formTemplateId : null,
          notes: formNotes,
        };
        const row = {
          id: newWorkout.id,
          user_id: userId,
          date: newWorkout.date,
          title: newWorkout.title,
          type: newWorkout.type,
          duration_minutes: newWorkout.durationMinutes,
          planned_tss: newWorkout.plannedTSS,
          discipline: newWorkout.discipline ?? 'aero',
          distance_km: newWorkout.distanceKm ?? null,
          template_id: newWorkout.templateId ?? null,
          notes: newWorkout.notes,
          steps: newWorkout.steps || [],
          route_id: newWorkout.routeId
        };
        const { error } = await supabase.from('planned_workouts').upsert(row);
        if (error) throw error;

        setPlannedWorkouts(prev => [...prev, newWorkout]);
      }
      setIsModalOpen(false);
      fetchData(); // reload
    } catch (err) {
      console.error('Error saving planned workout:', err);
    }
  };

  const handleDeleteWorkout = async (id: string) => {
    try {
      const { error } = await supabase.from('planned_workouts').delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;

      setPlannedWorkouts(prev => prev.filter(p => p.id !== id));
      setIsModalOpen(false);
      fetchData(); // reload
    } catch (err) {
      console.error('Error deleting planned workout:', err);
    }
  };

  // ── Drag & Drop Handlers ──
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedWorkoutId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggedWorkoutId;
    if (id) {
      const workout = plannedWorkouts.find(p => p.id === id);
      if (workout) {
        try {
          const updated = { ...workout, date: targetDateStr };
          const row = {
            id: updated.id,
            user_id: userId,
            date: updated.date,
            title: updated.title,
            type: updated.type,
            duration_minutes: updated.durationMinutes,
            planned_tss: updated.plannedTSS,
            discipline: updated.discipline ?? 'aero',
            distance_km: updated.distanceKm ?? null,
            template_id: updated.templateId ?? null,
            notes: updated.notes,
            steps: updated.steps || [],
            route_id: updated.routeId
          };
          const { error } = await supabase.from('planned_workouts').upsert(row);
          if (error) throw error;

          setPlannedWorkouts(prev => prev.map(p => p.id === id ? updated : p));
          fetchData(); // reload
        } catch (err) {
          console.error('Error moving planned workout:', err);
        }
      }
    }
    setDraggedWorkoutId(null);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Generate calendar grid days
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  // Adjust firstDayIndex to Monday-first (0 = Monday, 6 = Sunday)
  const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const calendarDays: { date: Date; dateStr: string; outside: boolean }[] = [];

  // Previous month outside days
  for (let i = startOffset - 1; i >= 0; i--) {
    const dVal = daysInPrevMonth - i;
    const date = new Date(currentYear, currentMonth - 1, dVal);
    calendarDays.push({
      date,
      dateStr: getLocalDateString(date),
      outside: true
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(currentYear, currentMonth, i);
    calendarDays.push({
      date,
      dateStr: getLocalDateString(date),
      outside: false
    });
  }

  // Next month outside days
  const remainingCells = 42 - calendarDays.length; // standard 6-row grid = 42 cells
  for (let i = 1; i <= remainingCells; i++) {
    const date = new Date(currentYear, currentMonth + 1, i);
    calendarDays.push({
      date,
      dateStr: getLocalDateString(date),
      outside: true
    });
  }

  // Six rows of seven, so each week can carry a summary of what was planned against
  // what was actually done - the thing a month of chips cannot tell you.
  const weeks: (typeof calendarDays)[] = [];
  for (let i = 0; i < calendarDays.length; i += 7) weeks.push(calendarDays.slice(i, i + 7));

  const weekSummaries = weeks.map(week =>
    summariseWeekLoad(
      week.map(d => d.dateStr),
      plannedWorkouts as any,
      actualLoads,
      {
        gymLoadByTemplate,
        gymLoadOverall: Object.values(gymLoadByTemplate).flat(),
        runPaceMinPerKm: runPace.paceMinPerKm
      }
    )
  );

  // Map items to dates
  const itemsByDate: Record<string, CalendarItem[]> = {};
  items.forEach(item => {
    if (!itemsByDate[item.dateStr]) {
      itemsByDate[item.dateStr] = [];
    }
    itemsByDate[item.dateStr].push(item);
  });

  const todayStr = getLocalDateString(new Date());

  const getWorkoutColor = (type: WorkoutType) => {
    const colors: Record<WorkoutType, string> = {
      recovery: '#a29bfe',
      endurance: '#cbd5e1',
      sweetspot: '#fdcb6e',
      threshold: '#ff7675',
      vo2max: '#6c5ce7',
      custom: '#cbd5e1'
    };
    return colors[type] || '#cbd5e1';
  };

  return (
    <div className="zh-calendar-container animate-slide-up">


      <div className="zh-calendar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={18} style={{ color: '#cbd5e1' }} />
          <h2 className="zh-calendar-title">
            {formatMonthName(currentMonth)} {currentYear}
          </h2>
        </div>
        <div className="zh-calendar-nav">
          <button className="zh-calendar-btn" onClick={handlePrevMonth}>
            <ChevronLeft size={16} />
          </button>
          <button className="zh-calendar-btn today" onClick={() => setCurrentDate(new Date())}>
            Today
          </button>
          <button className="zh-calendar-btn" onClick={handleNextMonth}>
            <ChevronRight size={16} />
          </button>
          <button 
            className="zh-calendar-btn plan" 
            style={{ width: 'auto', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(56, 189, 248, 0.15) 100%)', border: '1px solid #10b981', color: '#fff', fontWeight: 800, padding: '0 14px', borderRadius: 8, height: 32, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit' }}
            onClick={() => handleOpenAddModal(getLocalDateString(new Date()))}
          >
            <Plus size={14} /> Plan Workout
          </button>
        </div>
      </div>

      {/* Are we getting better? The week column answers how faithfully the plan was
          followed, which is a different question and can look identical whether the
          athlete is improving or declining. */}
      <div className="zh-progress-panel">
        <button className="zh-progress-toggle" onClick={() => setShowProgress(v => !v)}>
          <span>Are we improving?</span>
          <span className="zh-progress-toggle-hint">
            recent form vs before {showProgress ? '▲' : '▼'}
          </span>
        </button>

        {showProgress && (
          <div className="zh-progress-grid">
            {progress.map(trend => {
              const arrow = trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : trend.direction === 'flat' ? '▬' : '';
              const colour = trend.direction === 'up' ? '#22c55e'
                : trend.direction === 'down' ? '#f87171'
                : trend.direction === 'flat' ? '#94a3b8' : '#64748b';
              return (
                <div key={trend.key} className="zh-progress-card">
                  <div className="zh-progress-label">{trend.label}</div>
                  {trend.value === null ? (
                    <div className="zh-progress-empty">{trend.note ?? 'Not enough data yet.'}</div>
                  ) : (
                    <>
                      <div className="zh-progress-value">
                        {trend.value}<span className="zh-progress-unit">{trend.unit}</span>
                      </div>
                      <div className="zh-progress-delta" style={{ color: colour }}>
                        {trend.changePct === null
                          ? (trend.note ?? 'No comparison yet')
                          : `${arrow} ${trend.changePct > 0 ? '+' : ''}${trend.changePct.toFixed(1)}% vs ${trend.previous}${trend.unit === 'W' ? 'W' : ''}`}
                      </div>
                      {trend.windowDays !== null && trend.changePct !== null && (
                        <div className="zh-progress-window">
                          last {trend.windowDays} days vs the {trend.windowDays} before
                        </div>
                      )}
                      {trend.key === 'strength' && (trend as any).movers?.length > 0 && (
                        <div className="zh-progress-movers">
                          {(trend as any).movers.slice(0, 3).map((m: any) => (
                            <div key={m.exerciseId}>
                              <span>{exercisesMap[m.exerciseId] ?? 'Exercise'}</span>
                              <strong style={{ color: m.changePct >= 0 ? '#22c55e' : '#f87171' }}>
                                {m.changePct > 0 ? '+' : ''}{m.changePct.toFixed(1)}%
                              </strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {loadError && (
        <div style={{
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 12,
          color: '#fca5a5',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap'
        }}>
          <span style={{ flex: 1, minWidth: 200 }}>{loadError}</span>
          <button
            onClick={() => fetchData()}
            style={{
              padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.12)', color: '#fca5a5'
            }}
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="zh-calendar-grid-wrap" style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
          Loading calendar data...
        </div>
      ) : (
        <div className="zh-calendar-grid-wrap">
          <div className="zh-calendar-grid-header">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="zh-calendar-day-label">{day}</div>
            ))}
            <div className="zh-calendar-day-label zh-week-col">Week</div>
          </div>
          <div className="zh-calendar-grid">
            {weeks.map((week, weekIdx) => (
              <React.Fragment key={`w-${weekIdx}`}>
            {week.map(({ date, dateStr, outside }) => {
              const dayItems = itemsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;

              return (
                <div 
                  key={dateStr} 
                  className={`zh-calendar-cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''}`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, dateStr)}
                >
                  <div className="zh-calendar-date-container">
                    <span className="zh-calendar-date">{date.getDate()}</span>
                    <button
                      className="zh-calendar-cell-add-btn"
                      title="Plan workout on this day"
                      onClick={() => handleOpenAddModal(dateStr)}
                    >
                      +
                    </button>
                  </div>
                  
                  <div className="zh-calendar-badge-list">
                    {dayItems.map((item, idx) => {
                      if (item.category === 'planned') {
                        // The session happened, so the plan and the workout are one
                        // thing. The completed badge below carries the marker.
                        if (fulfilledPlans.has(item.raw.id)) return null;
                        return (
                          <div 
                            key={`p-${item.raw.id}-${idx}`}
                            className="zh-workout-badge zh-badge-planned"
                            draggable
                            onDragStart={(e) => handleDragStart(e, item.raw.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(item.raw);
                            }}
                            title={`Planned ${DISCIPLINE_LABELS[item.raw.discipline ?? 'aero']}: ${item.raw.title}\nDuration: ${item.raw.durationMinutes} min${(item.raw.discipline ?? 'aero') === 'aero' ? `\nTSS: ${item.raw.plannedTSS}` : ''}${item.raw.distanceKm ? `\nDistance: ${item.raw.distanceKm} km` : ''}\nDrag to move, click to edit.`}
                            style={{ borderLeft: `3px solid ${getWorkoutColor(item.raw.type)}`, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Calendar size={10} style={{ flexShrink: 0 }} />
                            <span>{item.raw.title} ({item.raw.durationMinutes}m)</span>
                          </div>
                        );
                      } else if (item.category === 'ride') {
                        return (
                          <div 
                            key={`r-${item.raw.id}-${idx}`}
                            className="zh-workout-badge zh-badge-ride"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenRideInAero) {
                                onOpenRideInAero(item.raw.id);
                              } else {
                                setSelectedItem(item);
                              }
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Bike size={10} style={{ flexShrink: 0 }} />
                            <span>{item.raw.name} ({item.raw.distance.toFixed(0)}km)</span>
                            {plannedAndDoneByDate[dateStr]?.has('aero') && (
                              <Calendar size={9} style={{ flexShrink: 0, opacity: 0.65 }} aria-label="Planned" />
                            )}
                          </div>
                        );
                      } else if (item.category === 'stride') {
                        const run = item.raw;
                        const pace = run.avgPaceMinKm;
                        const paceLabel = pace
                          ? `${Math.floor(pace)}:${String(Math.round((pace - Math.floor(pace)) * 60)).padStart(2, '0')}/km`
                          : `${Math.round(run.durationSec / 60)}m`;
                        return (
                          <div
                            key={`s-${run.id}-${idx}`}
                            className="zh-workout-badge zh-badge-stride"
                            onClick={() => setSelectedItem(item)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title={`${run.title}
${run.distanceKm ? run.distanceKm + ' km · ' : ''}${Math.round(run.durationSec / 60)} min${pace ? ' · ' + paceLabel : ''}`}
                          >
                            <Footprints size={10} style={{ flexShrink: 0 }} />
                            <span>
                              {run.title} ({run.distanceKm > 0 ? `${run.distanceKm.toFixed(1)}km` : paceLabel})
                            </span>
                            {plannedAndDoneByDate[dateStr]?.has('stride') && (
                              <Calendar size={9} style={{ flexShrink: 0, opacity: 0.65 }} aria-label="Planned" />
                            )}
                          </div>
                        );
                      } else {
                        return (
                          <div 
                            key={`k-${item.raw.id}-${idx}`}
                            className="zh-workout-badge zh-badge-kratos"
                            onClick={() => setSelectedItem(item)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Dumbbell size={10} style={{ flexShrink: 0 }} />
                            <span>{item.raw.name} ({item.raw.volume.toLocaleString('en-US')} kg)</span>
                            {plannedAndDoneByDate[dateStr]?.has('kratos') && (
                              <Calendar size={9} style={{ flexShrink: 0, opacity: 0.65 }} aria-label="Planned" />
                            )}
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>
              );
            })}
                {(() => {
                  const w = weekSummaries[weekIdx];
                  const weekKey = weekStartKey(week[0].dateStr);
                  const lastDay = week[6].dateStr;
                  const isFuture = lastDay > todayStr;
                  const target = weeklyTargets[weekKey] ?? null;
                  const projection = isFuture ? projectedByDate[lastDay] : null;
                  const hasAnything = w.plannedSessions > 0 || w.actualSessions > 0 || target !== null;
                  // Compliance is null, not 0, when nothing was planned: a week with
                  // three unplanned sessions is not 0% compliant, it is unplanned.
                  const pct = w.compliance === null ? null : Math.round(w.compliance * 100);
                  const tone = pct === null ? '#64748b'
                    : pct >= 90 && pct <= 115 ? '#22c55e'
                    : pct >= 70 ? '#eab308'
                    : '#f87171';
                  return (
                    <div className={`zh-week-summary ${hasAnything ? '' : 'empty'}`}>
                      {hasAnything ? (
                        <>
                          <div className="zh-week-summary-label">Week load</div>
                          <div className="zh-week-summary-rows">
                            <div><span>Planned</span><strong>{w.plannedLoad || '—'}</strong></div>
                            <div><span>Done</span><strong style={{ color: tone }}>{w.actualLoad || '—'}</strong></div>
                          </div>
                          <div className="zh-week-summary-bar">
                            <div
                              style={{
                                width: `${Math.min(100, w.plannedLoad > 0 ? (w.actualLoad / w.plannedLoad) * 100 : 0)}%`,
                                background: tone
                              }}
                            />
                          </div>
                          <div className="zh-week-summary-foot" style={{ color: tone }}>
                            {pct === null
                              ? `${w.actualSessions} session${w.actualSessions === 1 ? '' : 's'}, none planned`
                              : `${pct}% of plan · ${w.actualSessions}/${w.plannedSessions} sessions`}
                          </div>
                          {w.unknownPlans > 0 && (
                            <div className="zh-week-summary-note">
                              {w.unknownPlans} plan{w.unknownPlans === 1 ? '' : 's'} not costed yet
                            </div>
                          )}

                          {/* Where the week's load came from. Drift toward one sport
                              is invisible in a single total. */}
                          {w.actualLoad > 0 && (
                            <div className="zh-week-split" title={`Ride ${w.byDiscipline.aero} · Gym ${w.byDiscipline.kratos} · Run ${w.byDiscipline.stride}`}>
                              {(['aero', 'kratos', 'stride'] as Discipline[]).map(d => (
                                w.byDiscipline[d] > 0 ? (
                                  <div
                                    key={d}
                                    className={`zh-week-split-seg zh-split-${d}`}
                                    style={{ flexGrow: w.byDiscipline[d] }}
                                  />
                                ) : null
                              ))}
                            </div>
                          )}

                          {/* Projected Form, for weeks that have not happened yet:
                              what this plan leaves you at, rather than what last
                              week cost. */}
                          {projection && (
                            <div className="zh-week-summary-note" title="Projected Form (TSB) at the end of this week if you do what is planned">
                              Form Sun:{' '}
                              <strong style={{ color: interpretTSB(projection.tsb).color }}>
                                {projection.tsb > 0 ? '+' : ''}{Math.round(projection.tsb)}
                              </strong>{' '}
                              {interpretTSB(projection.tsb).label.toLowerCase()}
                            </div>
                          )}
                        </>
                      ) : null}

                      {/* Target for the week. Compliance says how faithfully the plan
                          was followed; it cannot say whether the plan was the right
                          size in the first place. */}
                      {editingTargetWeek === weekKey ? (
                        <div className="zh-week-target-edit">
                          <input
                            type="number"
                            autoFocus
                            min={0}
                            max={2000}
                            value={targetDraft}
                            placeholder={String(suggestedWeeklyLoad(projectedByDate[lastDay]?.ctl ?? 0) || '')}
                            onChange={e => setTargetDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Escape') setEditingTargetWeek(null);
                              if (e.key !== 'Enter') return;
                              const value = targetDraft.trim() === '' ? null : Number(targetDraft);
                              setWeeklyTargets(prev => {
                                const next = { ...prev };
                                if (value === null || !(value > 0)) delete next[weekKey];
                                else next[weekKey] = Math.round(value);
                                return next;
                              });
                              saveWeeklyLoadTarget(supabase, userId, weekKey, value);
                              setEditingTargetWeek(null);
                            }}
                            onBlur={() => setEditingTargetWeek(null)}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="zh-week-target"
                          onClick={() => {
                            setTargetDraft(target ? String(target) : '');
                            setEditingTargetWeek(weekKey);
                          }}
                          title="Set a load target for this week"
                        >
                          {target !== null ? (
                            <>
                              Target {target}
                              {w.actualLoad > 0 && <span> · {Math.round((w.actualLoad / target) * 100)}%</span>}
                            </>
                          ) : (
                            <>+ target</>
                          )}
                        </button>
                      )}

                    </div>
                  );
                })()}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Detail Modal Overlay */}
      {selectedItem && (
        <div className="wd-modal-backdrop animate-fade-in" onClick={() => setSelectedItem(null)}>
          <div className="wd-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="wd-modal-header">
              <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {selectedItem.category === 'ride' ? <Bike size={16} />
                  : selectedItem.category === 'stride' ? <Footprints size={16} />
                  : <Dumbbell size={16} />}
                {selectedItem.category === 'ride' ? 'Completed Cycling Ride'
                  : selectedItem.category === 'stride' ? (selectedItem.raw.isTreadmill ? 'Completed Treadmill Run' : 'Completed Run')
                  : 'Completed Kratos Workout'}
              </h3>
              <button className="wd-modal-close" aria-label="Close" onClick={() => setSelectedItem(null)}>✕</button>
            </div>

            <div className="wd-modal-body">
              {/* PLANNED WORKOUT DETAILS */}
              {selectedItem.category === 'planned' && (
                <>
                  <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 900 }}>{selectedItem.raw.title}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: getWorkoutColor(selectedItem.raw.type), fontWeight: 800, textTransform: 'uppercase', marginBottom: 12 }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: getWorkoutColor(selectedItem.raw.type) }} />
                    {(selectedItem.raw.discipline ?? 'aero') === 'aero'
                      ? selectedItem.raw.type
                      : DISCIPLINE_LABELS[selectedItem.raw.discipline ?? 'aero']}
                  </div>

                  <div className="zh-workout-witha-grid">
                    <div className="zh-workout-witha-item">
                      <span className="zh-workout-witha-label">Planned Duration</span>
                      <span className="zh-workout-witha-value">{selectedItem.raw.durationMinutes} minutes</span>
                    </div>
                    {(selectedItem.raw.discipline ?? 'aero') === 'aero' && (
                      <div className="zh-workout-witha-item">
                        <span className="zh-workout-witha-label">Planned TSS</span>
                        <span className="zh-workout-witha-value">{selectedItem.raw.plannedTSS} TSS</span>
                      </div>
                    )}
                    {selectedItem.raw.discipline === 'stride' && selectedItem.raw.distanceKm ? (
                      <div className="zh-workout-witha-item">
                        <span className="zh-workout-witha-label">Planned Distance</span>
                        <span className="zh-workout-witha-value">{selectedItem.raw.distanceKm} km</span>
                      </div>
                    ) : null}
                  </div>

                  {selectedItem.raw.notes && (
                    <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: 12, border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div className="zh-modal-section-title">Notes & Coach Tips</div>
                      <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{selectedItem.raw.notes}</p>
                    </div>
                  )}

                  {selectedItem.raw.steps && selectedItem.raw.steps.length > 0 && (
                    <div>
                      <div className="zh-modal-section-title">Workout Steps</div>
                      <ol className="zh-steps-list">
                        {selectedItem.raw.steps.map((step: any, sIdx: number) => (
                          <li key={sIdx}>
                            <strong>{step.duration} min</strong> at <strong>{step.intensity}% FTP</strong> {step.type === 'cooldown' ? '(Cool down)' : step.type === 'warmup' ? '(Warm up)' : '(Work set)'}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              )}

              {/* Planned against done, for this one session. A week-level figure
                  hides which session was cut short. */}
              {selectedItem.category !== 'planned' && (() => {
                const plan = planByActivityId[String(selectedItem.raw.id)];
                if (!plan) return null;
                const planned = plannedTrainingLoad(plan as any, planLoadCtx);
                const activity = completedActivities.find(a => (a as any).id === String(selectedItem.raw.id));
                const actual = activity?.load ?? null;
                const pct = planned && actual ? Math.round((actual / planned) * 100) : null;
                return (
                  <div style={{
                    background: 'rgba(56,189,248,0.06)',
                    border: '1px solid rgba(56,189,248,0.2)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 16
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      This was planned
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                      <strong style={{ color: '#e2e8f0' }}>{plan.title}</strong>
                      {plan.durationMinutes ? ` · ${plan.durationMinutes} min planned` : ''}
                      <br />
                      Load planned{' '}
                      <strong style={{ color: '#e2e8f0' }}>{planned ?? '—'}</strong>
                      {' · '}done{' '}
                      <strong style={{ color: '#e2e8f0' }}>{actual ?? '—'}</strong>
                      {pct !== null && (
                        <span style={{ color: pct >= 90 && pct <= 115 ? '#22c55e' : pct >= 70 ? '#eab308' : '#f87171', fontWeight: 800 }}>
                          {' '}({pct}%)
                        </span>
                      )}
                    </div>
                    {plan.notes && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>{plan.notes}</div>
                    )}
                  </div>
                );
              })()}

              {selectedItem.category === 'stride' ? (
                <>
                  <h4 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 12px' }}>
                    {selectedItem.raw.title}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>Distance</span>
                      <strong style={{ fontSize: 16, color: '#34d399' }}>
                        {selectedItem.raw.distanceKm > 0 ? `${selectedItem.raw.distanceKm.toFixed(2)} km` : '—'}
                      </strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>Duration</span>
                      <strong style={{ fontSize: 16, color: '#34d399' }}>{Math.round(selectedItem.raw.durationSec / 60)} min</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>Avg Pace</span>
                      <strong style={{ fontSize: 16, color: '#34d399' }}>
                        {selectedItem.raw.avgPaceMinKm
                          ? `${Math.floor(selectedItem.raw.avgPaceMinKm)}:${String(Math.round((selectedItem.raw.avgPaceMinKm % 1) * 60)).padStart(2, '0')} /km`
                          : '—'}
                      </strong>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                    {selectedItem.raw.avgHeartRate ? `Average heart rate ${selectedItem.raw.avgHeartRate} bpm. ` : ''}
                    Open Stride to edit this run.
                  </p>
                </>
              ) : null}

              {/* COMPLETED RIDE DETAILS */}
              {selectedItem.category === 'ride' ? (
                <>
                  <h4 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 12px' }}>
                    {selectedItem.raw.name}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>Distance</span>
                      <strong style={{ fontSize: 16, color: '#38bdf8' }}>{selectedItem.raw.distance.toFixed(1)} km</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>Avg Speed</span>
                      <strong style={{ fontSize: 16, color: '#fff' }}>{selectedItem.raw.avgSpeed.toFixed(1)} km/h</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>TSS</span>
                      <strong style={{ fontSize: 16, color: '#34d399' }}>{selectedItem.raw.tss ?? '--'}</strong>
                    </div>
                  </div>
                </>
              ) : selectedItem.category === 'kratos' ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>
                      {selectedItem.raw.name}
                    </h4>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Total Volume: <strong style={{ color: '#34d399' }}>{selectedItem.raw.volume.toLocaleString('en-US')} kg</strong>
                    </div>
                  </div>

                  <div>
                    <div className="zh-modal-section-title">🏋️ Logbook Details</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {selectedItem.raw.sets.map((exLog, eIdx) => {
                        const name = exercisesMap[exLog.exercise_id] || 'Exercise';
                        return (
                          <div key={eIdx} className="zh-kratos-exercise-block">
                            <div className="zh-kratos-ex-name">{name}</div>
                            <table className="zh-kratos-sets-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '15%' }}>Set</th>
                                  <th style={{ width: '25%' }}>Type</th>
                                  <th style={{ width: '30%' }}>Weight</th>
                                  <th style={{ width: '30%' }}>Reps</th>
                                </tr>
                              </thead>
                              <tbody>
                                {exLog.sets.map((s, sIdx) => (
                                  <tr key={sIdx}>
                                    <td style={{ fontWeight: 800 }}>{sIdx + 1}</td>
                                    <td>
                                      <span className={`zh-kratos-set-type zh-set-${s.type}`}>
                                        {s.type === 'warmup' ? 'Warmup' : s.type === 'working' ? 'Working' : 'Drop'}
                                      </span>
                                    </td>
                                    <td><strong>{s.weight} kg</strong></td>
                                    <td><strong>{s.reps} reps</strong> {s.rir !== undefined && s.rir !== null ? `(RIR ${s.rir})` : ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="wd-modal-backdrop animate-fade-in" onClick={() => setIsModalOpen(false)}>
          <div className="wd-modal-card" onClick={e => e.stopPropagation()}>
            <div className="wd-modal-header">
              <h3>{editingWorkout ? 'Edit Workout' : 'Plan New Workout'}</h3>
              <button className="wd-modal-close" aria-label="Close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            <div className="wd-modal-body">
              <div className="wd-form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                />
              </div>

              {/* Discipline first, because it decides which of the fields below
                  mean anything. Cycling is costed from TSS, running from distance,
                  strength from time - showing all three at once asked for numbers
                  that do not apply. */}
              <div className="wd-form-group">
                <label>What kind of session?</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['aero', 'kratos', 'stride'] as Discipline[]).map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setFormDiscipline(d);
                        // TSS is a cycling measure; carrying a stale one onto a gym
                        // plan would feed a fabricated figure into the PMC.
                        if (d !== 'aero') setFormTSS(0);
                        if (d !== 'stride') setFormDistanceKm('');
                        if (d !== 'kratos') setFormTemplateId('');
                      }}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        border: formDiscipline === d ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                        background: formDiscipline === d ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.02)',
                        color: formDiscipline === d ? '#38bdf8' : '#94a3b8'
                      }}
                    >
                      {DISCIPLINE_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="wd-form-group">
                <label>{formDiscipline === 'kratos' ? 'Title (optional — the routine name is used)' : 'Workout Title'}</label>
                <input
                  type="text"
                  placeholder={
                    formDiscipline === 'kratos' ? 'e.g. Push Day A'
                      : formDiscipline === 'stride' ? 'e.g. Easy 8k'
                      : 'e.g. Sweet Spot 2x15m'
                  }
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                />
              </div>

              {formDiscipline === 'kratos' && (
                <div className="wd-form-group">
                  <label>Routine</label>
                  <select value={formTemplateId} onChange={e => {
                    setFormTemplateId(e.target.value);
                    const t = kratosTemplates.find(k => k.id === e.target.value);
                    if (t && !formTitle.trim()) setFormTitle(t.name);
                  }}>
                    <option value="">Choose a routine…</option>
                    {kratosTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {formDiscipline === 'stride' && (
                <div className="wd-form-group">
                  <label>Distance (km, optional)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="e.g. 10"
                    value={formDistanceKm}
                    onChange={e => setFormDistanceKm(e.target.value)}
                  />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    Used to estimate the day&apos;s energy cost. Left blank, the duration is used instead.
                  </div>
                </div>
              )}

              {formDiscipline === 'aero' && (
              <div className="wd-form-group">
                <label>Training Type</label>
                <select
                  value={formType}
                  onChange={e => {
                    const t = e.target.value as PlannedWorkoutItem['type'];
                    setFormType(t);
                    if (t === 'recovery') setFormTSS(Math.round(formDuration * 0.4));
                    if (t === 'endurance') setFormTSS(Math.round(formDuration * 0.8));
                    if (t === 'sweetspot') setFormTSS(Math.round(formDuration * 1.1));
                    if (t === 'threshold') setFormTSS(Math.round(formDuration * 1.25));
                    if (t === 'vo2max') setFormTSS(Math.round(formDuration * 1.4));
                  }}
                >
                  <option value="recovery">💙 Active Recovery (Z1)</option>
                  <option value="endurance">🟢 Endurance (Z2)</option>
                  <option value="sweetspot">🟡 Sweet Spot Intervals (Z3/Z4)</option>
                  <option value="threshold">🔴 Threshold / FTP (Z4)</option>
                  <option value="vo2max">💜 VO2Max Intervals (Z5)</option>
                  <option value="custom">⚡ Custom</option>
                </select>
              </div>
              )}

              {/* TSS is a cycling measure and means nothing for a gym session or a
                  run - it was being shown, and defaulted to 0, on both. Duration is
                  asked for everywhere because every discipline is costed from it in
                  some form. */}
              <div style={{ display: 'grid', gridTemplateColumns: formDiscipline === 'aero' ? '1fr 1fr' : '1fr', gap: 12 }}>
                <div className="wd-form-group">
                  <label>Expected duration (minutes)</label>
                  <input
                    type="number"
                    min={15}
                    max={360}
                    value={formDuration}
                    onChange={e => {
                      const dur = parseInt(e.target.value) || 0;
                      setFormDuration(dur);
                      // From here on the number is theirs, so the estimate stops
                      // writing over it.
                      setDurationTouched(true);
                      // For a ride the two are the same statement about the session,
                      // so an overridden duration re-states the TSS rather than
                      // leaving a pair that cannot both be true.
                      if (formDiscipline === 'aero') setFormTSS(rideTssFromDuration(dur, formType));
                    }}
                  />
                  {durationEstimate && !durationTouched && (
                    <div style={{ fontSize: 10, color: '#38bdf8', marginTop: 4, lineHeight: 1.45 }}>
                      Estimated: {durationEstimate.note}
                    </div>
                  )}
                  {durationEstimate && durationTouched && durationEstimate.minutes !== formDuration && (
                    <button
                      type="button"
                      onClick={() => { setFormDuration(durationEstimate.minutes); setDurationTouched(false); }}
                      style={{
                        marginTop: 4, padding: 0, border: 'none', background: 'none',
                        color: '#38bdf8', fontSize: 10, cursor: 'pointer', textAlign: 'left'
                      }}
                    >
                      Use the estimate ({durationEstimate.minutes} min) — {durationEstimate.note}
                    </button>
                  )}
                  {!durationEstimate && formDiscipline === 'kratos' && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Pick a routine and this fills itself in from how long that routine actually takes you.
                    </div>
                  )}
                  {!durationEstimate && formDiscipline === 'stride' && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Enter a distance and this fills itself in from your pace.
                    </div>
                  )}
                </div>

                {formDiscipline === 'aero' && (
                <div className="wd-form-group">
                  <label>Expected TSS</label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={formTSS}
                    onChange={e => setFormTSS(parseInt(e.target.value) || 0)}
                  />
                </div>
                )}
              </div>

              <div className="wd-form-group">
                <label>Notes / Instructions</label>
                <textarea
                  rows={3}
                  placeholder={
                    formDiscipline === 'kratos' ? 'e.g. go heavier on the first press, skip the flyes if short on time'
                      : formDiscipline === 'stride' ? 'e.g. easy pace, keep HR under 150'
                      : 'e.g. Warm-up 15m, 2x 15m at 220W with 5m recovery...'
                  }
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="wd-modal-footer">
              {editingWorkout && (
                <button
                  className="wd-modal-btn wd-modal-btn--danger"
                  onClick={() => handleDeleteWorkout(editingWorkout.id)}
                >
                  <Trash2 size={13} style={{ marginRight: 4 }} /> Delete
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button
                className="wd-modal-btn wd-modal-btn--secondary"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="wd-modal-btn wd-modal-btn--primary"
                onClick={handleSaveWorkout}
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none' }}
              >
                {formDiscipline === 'aero' ? 'Save & Simulate' : 'Save to calendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
