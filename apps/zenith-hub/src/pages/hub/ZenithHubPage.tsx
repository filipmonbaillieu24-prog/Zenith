import React, { useState, useEffect, useMemo } from 'react';
import { Scale, Moon, Footprints, Dumbbell, Bike, Activity, Heart, AlertTriangle, Trophy, ThumbsUp, Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { predictRecoveryScore, recoveryModel, calculateZenithSleepScore, ZenithHeroStat, ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { computeSimulatedPMC, computePMC, PlannedWorkoutItem, interpretTSB } from '../../utils/pmc';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { AnatomicalMuscleHeatmap } from '../../components/AnatomicalMuscleHeatmap';
import './ZenithHub.css';

/** One-line context for the PMC hero card — mirrors the tone used in Aero/Kratos's
 * own hero-metric dashboards, which show this exact same TSB-derived status. */
function tsbContext(label: string, tsb: number): string {
  switch (label) {
    case 'Fresh / too little stimulus':
      return "You're well recovered but training load has been light — there's room to push harder.";
    case 'Peak condition':
      return 'Fitness and freshness are both high right now — a good window for your hardest efforts.';
    case 'Optimal training period':
      return 'A healthy, sustainable balance of fitness and fatigue across your linked extensions.';
    case 'Build phase / fatigued':
      return "You're carrying more fatigue than fitness right now — expected mid-build, not a warning sign.";
    default:
      return tsb < -25
        ? 'Fatigue has been outpacing recovery for a while — consider prioritizing rest this week.'
        : 'Keep an eye on recovery markers over the next few sessions.';
  }
}

interface ZenithHubPageProps {
  fitnessProfile: any;
  fitnessMetrics: { ctl: number; atl: number; tsb: number };
  userId: string;
  mlModelsLoaded?: boolean;
}

export const ZenithHubPage: React.FC<ZenithHubPageProps> = ({
  fitnessProfile,
  fitnessMetrics,
  userId,
  mlModelsLoaded,
}) => {



  // Dashboard Stats States
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutItem[]>([]);
  const [allRides, setAllRides] = useState<any[]>([]);
  const [allStride, setAllStride] = useState<any[]>([]);
  const [allKratos, setAllKratos] = useState<any[]>([]);
  const [kratosExercises, setKratosExercises] = useState<any[]>([]);
  const [latestWeight, setLatestWeight] = useState<any | null>(null);
  const [latestSleep, setLatestSleep] = useState<any | null>(null);
  const [allSleeps, setAllSleeps] = useState<any[]>([]);
  const [todaySteps, setTodaySteps] = useState<number>(0);
  const [caloriesConsumedToday, setCaloriesConsumedToday] = useState<number | null>(null);
  const [weeklyRidesCount, setWeeklyRidesCount] = useState<number>(0);
  const [weeklyRidesDistance, setWeeklyRidesDistance] = useState<number>(0);
  const [weeklyStrideCount, setWeeklyStrideCount] = useState<number>(0);
  const [weeklyStrideDistance, setWeeklyStrideDistance] = useState<number>(0);
  const [weeklyKratosCount, setWeeklyKratosCount] = useState<number>(0);
  const [weeklyGymVolume, setWeeklyGymVolume] = useState<number>(0);
  // Starts true (not false) so the dashboard never flashes zero-state PMC/Recovery
  // numbers on first paint before fetchDashboardData's effect has had a chance to run.
  const [loadingDashboard, setLoadingDashboard] = useState(true);

  const fetchDashboardData = async () => {
    setLoadingDashboard(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Start of current week (Monday)
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(now.setDate(diff));
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfWeekMs = startOfWeek.getTime();

      // All of these reads are independent of each other (none filters on a prior
      // query's result — only on userId and locally-computed date boundaries). The
      // three "weekly" queries this used to run separately (rides/stride/kratos
      // filtered to this week) were also pure duplicates of the full-history queries
      // a few lines below them — those are now derived client-side instead of
      // hitting Supabase twice per table, cutting 11 queries down to 9.
      //
      // Firing all 9 at once (via a single Promise.all) sounds strictly faster, but
      // this project runs on a small Supabase instance shared by all 6 Zenith apps —
      // Hub's dashboard, Aero, Vigor, Kratos, Fuel and Stride all mount at roughly
      // the same moment (Hub embeds the other five as iframes), so a 9-wide burst
      // from Hub alone lands on top of each of those apps' own mount-time queries.
      // That combined spike was blowing past the instance's burst capacity and
      // causing Postgres to cancel queries with "statement timeout" — on tables with
      // single-digit row counts, so it was never about query cost, only concurrency.
      // Batching into groups of 3 keeps most of the parallelization win (~3 round
      // trips instead of 11) while capping Hub's own peak concurrent connections.
      const chunk = <T,>(arr: T[], size: number): T[][] =>
        Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

      const queries = [
        () => supabase.from('vigor_weight').select('*').eq('user_id', userId).order('logged_at', { ascending: false }).limit(1),
        () => supabase.from('vigor_sleep').select('*').eq('user_id', userId).order('logged_at', { ascending: false }).limit(14),
        () => supabase.from('vigor_steps').select('*').eq('user_id', userId).gte('logged_at', todayStart.toISOString()).lte('logged_at', todayEnd.toISOString()).order('logged_at', { ascending: false }),
        () => supabase.from('fuel_logs').select('calories').eq('user_id', userId).gte('logged_at', todayStart.toISOString()).lte('logged_at', todayEnd.toISOString()),
        () => supabase.from('planned_workouts').select('*').eq('user_id', userId),
        () => supabase.from('rides').select('date, distance, metadata').eq('user_id', userId),
        () => supabase.from('stride_activities').select('*').eq('user_id', userId),
        () => supabase.from('kratos_workouts').select('id, name, completed_at, sets, volume').eq('user_id', userId),
        () => supabase.from('kratos_exercises').select('id, name, category, primary_muscle, secondary_muscles').eq('user_id', userId),
      ];

      // Safety net: a hung network request (as opposed to a clean server-side error,
      // which rejects quickly on its own) has no built-in timeout here otherwise, and
      // would leave loadingDashboard — and its full-screen overlay — stuck forever.
      const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
        Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Dashboard fetch timed out')), ms))]);

      const results: any[] = [];
      for (const batch of chunk(queries, 3)) {
        results.push(...await withTimeout(Promise.all(batch.map(q => q())), 15000));
      }
      const [
        { data: wData },
        { data: sData },
        { data: stData },
        { data: fuelLogsToday },
        { data: plannedData },
        { data: ridesData },
        { data: strideData },
        { data: allKData },
        { data: exCatalog },
      ] = results;

      if (wData && wData.length > 0) {
        setLatestWeight(wData[0]);
      } else {
        setLatestWeight(null);
      }

      if (sData && sData.length > 0) {
        setLatestSleep(sData[0]);
        setAllSleeps(sData);
      } else {
        setLatestSleep(null);
        setAllSleeps([]);
      }

      if (stData && stData.length > 0) {
        setTodaySteps(Number(stData[0].step_count) || 0);
      } else {
        setTodaySteps(0);
      }

      if (fuelLogsToday && fuelLogsToday.length > 0) {
        setCaloriesConsumedToday(fuelLogsToday.reduce((sum: number, f: any) => sum + Number(f.calories || 0), 0));
      } else {
        setCaloriesConsumedToday(null);
      }

      if (plannedData) {
        setPlannedWorkouts(plannedData.map((p: any) => ({
          id: p.id,
          date: p.date,
          title: p.title,
          type: p.type as any,
          durationMinutes: p.duration_minutes,
          plannedTSS: p.planned_tss,
          notes: p.notes,
          steps: p.steps,
          routeId: p.route_id
        })));
      }

      if (ridesData) {
        setAllRides(ridesData.map((r: any) => {
          const witha = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {};
          return {
            date: Number(r.date),
            distance: Number(r.distance || 0),
            tss: witha?.tss ?? witha?.hrTSS ?? 0
          };
        }));

        const thisWeekRides = ridesData.filter((r: any) => Number(r.date) >= startOfWeekMs);
        setWeeklyRidesCount(thisWeekRides.length);
        setWeeklyRidesDistance(thisWeekRides.reduce((sum: number, r: any) => sum + Number(r.distance || 0), 0));
      } else {
        setWeeklyRidesCount(0);
        setWeeklyRidesDistance(0);
      }

      if (strideData) {
        setAllStride(strideData);

        const thisWeekRuns = strideData.filter((s: any) => {
          const t = s.date ? new Date(s.date).getTime() : new Date(s.created_at).getTime();
          return t >= startOfWeekMs;
        });
        setWeeklyStrideCount(thisWeekRuns.length);
        setWeeklyStrideDistance(thisWeekRuns.reduce((sum: number, r: any) => sum + Number(r.distance_km || 0), 0));
      } else {
        setWeeklyStrideCount(0);
        setWeeklyStrideDistance(0);
      }

      if (allKData) {
        setAllKratos(allKData);

        const thisWeekWorkouts = allKData.filter((w: any) => w.completed_at && new Date(w.completed_at).getTime() >= startOfWeekMs);
        setWeeklyKratosCount(thisWeekWorkouts.length);
        setWeeklyGymVolume(thisWeekWorkouts.reduce((sum: number, w: any) => sum + Number(w.volume || 0), 0));
      } else {
        setWeeklyKratosCount(0);
        setWeeklyGymVolume(0);
      }

      if (exCatalog) {
        setKratosExercises(exCatalog);
      }

    } catch (err) {
      console.error('Error loading dashboard statistics:', err);
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchDashboardData();
    } else {
      // loadingDashboard defaults to true so the dashboard never flashes zero-state
      // values before this effect gets a chance to run. But if userId is ever falsy
      // here, fetchDashboardData never fires, and nothing else would ever flip
      // loadingDashboard back to false — leaving the loading overlay stuck forever
      // instead of just showing empty state like it did before that default changed.
      setLoadingDashboard(false);
    }
  }, [userId]);

  // ── Cross-app load pool calibration ──
  // Aero supplies real, device-measured tss/hrTSS. Kratos and Stride do not have an
  // equivalent measured "TSS" at all, so the two scalars below are rough heuristic
  // conversions into a TSS-like unit — NOT a statistically calibrated equivalence
  // between running/lifting stress and cycling TSS. Treat any Kratos/Stride figure
  // in this pool as an ESTIMATE. A proper fix would calibrate these per-athlete
  // against real physiological cost (HR, power, RPE-based session load, etc.) — out
  // of scope for this pass; for now we at least name and document the constants so
  // future work can find and replace them.
  const STRIDE_RSS_HR_REFERENCE_BPM = 150; // "threshold-ish" reference HR used to scale a session's average HR into an intensity ratio
  const STRIDE_RSS_SCALAR = 1.1; // duration(min) * intensity-ratio -> "RSS" (estimated running TSS-equivalent), rough heuristic
  const KRATOS_STSS_VOLUME_SCALAR = 0.012; // kg lifted (sets*reps*weight) -> "strength TSS", rough heuristic
  const KRATOS_STSS_MIN = 15; // floor so any completed session registers some load
  const KRATOS_STSS_MAX = 80; // ceiling so one huge-volume day doesn't dominate the shared pool

  // ── PMC Simulation Logic ──
  const simPMC = useMemo(() => {
    const tssList: { date: number; tss: number; source: 'aero' | 'kratos' | 'stride'; isEstimated: boolean }[] = [];

    allRides.forEach(r => {
      if (r.tss > 0) {
        tssList.push({ date: r.date, tss: r.tss, source: 'aero', isEstimated: false });
      }
    });

    allStride.forEach(s => {
      // Do NOT fabricate a default HR/duration for incomplete records (previously
      // defaulted to HR 147 / 20min, inventing a plausible-looking data point out of
      // thin air). If a session is missing the real HR or duration it needs for the
      // RSS estimate, exclude it from the shared load pool rather than guessing.
      if (!s.duration_sec || !s.avg_heart_rate) {
        return;
      }
      const dateMs = new Date(s.date).getTime();
      const durMins = s.duration_sec / 60;
      const hrRatio = s.avg_heart_rate / STRIDE_RSS_HR_REFERENCE_BPM;
      const rss = Math.round(durMins * hrRatio * STRIDE_RSS_SCALAR);
      if (rss > 0) {
        tssList.push({ date: dateMs, tss: rss, source: 'stride', isEstimated: true });
      }
    });

    allKratos.forEach(k => {
      if (k.completed_at && k.volume) {
        const ts = new Date(k.completed_at).getTime();
        const volume = Number(k.volume);
        const sTSS = Math.min(KRATOS_STSS_MAX, Math.max(KRATOS_STSS_MIN, Math.round(volume * KRATOS_STSS_VOLUME_SCALAR)));
        tssList.push({ date: ts, tss: sTSS, source: 'kratos', isEstimated: true });
      }
    });

    return computeSimulatedPMC(tssList, plannedWorkouts, 35);
  }, [allRides, allKratos, allStride, plannedWorkouts]);

  // ── Cardio-only load pool (Aero + Stride), used ONLY to feed the Recovery Score
  // model's cardioTSB/cardioATL inputs ──
  // The model (shared/ml/RecoveryScore.ts) also independently receives weeklyGymVolume
  // as its own "gymVolume7d" input. If we fed it the blended atl/tsb above (which now
  // includes Kratos's estimated sTSS via bug-1's shared pool) AND weeklyGymVolume, the
  // same Kratos training would be counted twice toward the same recovery estimate. So
  // for the recovery model specifically we compute a cardio-only ATL/TSB (Aero real TSS
  // + Stride estimated RSS) that deliberately excludes Kratos — Kratos's contribution
  // is represented exactly once, via weeklyGymVolume. The blended (Aero+Kratos+Stride)
  // simPMC above is still used for the dashboard's PMC/Periodization chart, where an
  // "overall training stress" view is what's intended.
  const cardioOnlyPMC = useMemo(() => {
    const cardioTssList: { date: number; tss: number }[] = [];

    allRides.forEach(r => {
      if (r.tss > 0) {
        cardioTssList.push({ date: r.date, tss: r.tss });
      }
    });

    allStride.forEach(s => {
      if (!s.duration_sec || !s.avg_heart_rate) {
        return;
      }
      const dateMs = new Date(s.date).getTime();
      const durMins = s.duration_sec / 60;
      const hrRatio = s.avg_heart_rate / STRIDE_RSS_HR_REFERENCE_BPM;
      const rss = Math.round(durMins * hrRatio * STRIDE_RSS_SCALAR);
      if (rss > 0) {
        cardioTssList.push({ date: dateMs, tss: rss });
      }
    });

    return computePMC(cardioTssList);
  }, [allRides, allStride]);

  const cardioToday = useMemo(() => {
    if (cardioOnlyPMC.length === 0) return { atl: 0, tsb: 0 };
    const todayKey = new Date().setHours(0, 0, 0, 0);
    const pt = cardioOnlyPMC.find(p => {
      const d = new Date(p.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === todayKey;
    });
    return pt ? { atl: pt.atl, tsb: pt.tsb } : { atl: 0, tsb: 0 };
  }, [cardioOnlyPMC]);

  // Find today's point in the simulation to show unified metrics (Aero + Kratos)
  const todayPoint = useMemo(() => {
    if (simPMC.length === 0) return { ctl: fitnessMetrics.ctl, atl: fitnessMetrics.atl, tsb: fitnessMetrics.tsb };
    const todayKey = new Date().setHours(0,0,0,0);
    const pt = simPMC.find(p => {
      const d = new Date(p.date);
      d.setHours(0,0,0,0);
      return d.getTime() === todayKey;
    });
    return pt || { ctl: fitnessMetrics.ctl, atl: fitnessMetrics.atl, tsb: fitnessMetrics.tsb };
  }, [simPMC, fitnessMetrics]);

  const currentFormStatus = useMemo(() => {
    return interpretTSB(todayPoint.tsb);
  }, [todayPoint]);

  const chartData = useMemo(() => {
    return simPMC.map(pt => ({
      dateStr: new Date(pt.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      rawDate: pt.date,
      ctl: pt.ctl,
      atl: pt.atl,
      tsb: pt.tsb,
      tss: pt.tss,
      isSimulated: pt.isSimulated,
    }));
  }, [simPMC]);

  // Dynamic Muscle Fatigue & Recovery Algorithm from actual Rides & Kratos Workouts
  const calculatedMuscleDataMap = useMemo(() => {
    const nowMs = Date.now();
    const decayPerHour = 0.035; // Exponential recovery rate

    const exerciseMap = new Map<string, any>();
    if (Array.isArray(kratosExercises)) {
      kratosExercises.forEach(e => {
        if (e && e.id) exerciseMap.set(e.id, e);
      });
    }

    const map: Record<string, {
      name: string;
      fatigueRaw: number;
      lastTrainedMs: number;
      exercisesWithDates: { name: string; dateMs: number }[];
    }> = {
      chest: { name: 'Borstspieren (Pectoralis Major)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      deltoids: { name: 'Shoulders (Deltoids)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      biceps: { name: 'Biceps (Biceps Brachii)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      triceps: { name: 'Triceps (Triceps Brachii)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      abs: { name: 'Buikspieren (Rectus Abdominis)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      obliques: { name: 'Schuine Buikspieren (Obliques)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      quadriceps: { name: 'Dijspieren (Quadriceps Femoris)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      upperBack: { name: 'Bovenrug (Rhomboids & Trapezius)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      lowerBack: { name: 'Lendenrug (Erector Spinae)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      gluteal: { name: 'Zitvlakspieren (Gluteus Maximus)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      hamstring: { name: 'Achterdijbeen (Hamstrings)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      calves: { name: 'Kuitspieren (Gastrocnemius & Soleus)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      forearm: { name: 'Onderarmen (Forearms)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
      trapezius: { name: 'Monnikskapspier (Trapezius)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] }
    };

    const addImpact = (slug: string, fatigueImpact: number, dateMs: number, exerciseName: string) => {
      if (!map[slug]) return;
      const hoursAgo = Math.max(0, (nowMs - dateMs) / (1000 * 60 * 60));
      if (hoursAgo > 168) return; // 7 days window
      const currentImpact = fatigueImpact * Math.exp(-decayPerHour * hoursAgo);
      map[slug].fatigueRaw += currentImpact;
      if (dateMs > map[slug].lastTrainedMs) {
        map[slug].lastTrainedMs = dateMs;
      }
      map[slug].exercisesWithDates.push({ name: exerciseName, dateMs });
    };

    // Process Kratos workouts
    allKratos.forEach((k: any) => {
      if (!k.completed_at) return;
      const dateMs = new Date(k.completed_at).getTime();
      const workoutName = k.name || 'Kratos Training';
      const sets = Array.isArray(k.sets) ? k.sets : [];

      if (sets.length === 0) return;

      sets.forEach((exLog: any) => {
        const exMeta = exLog.exercise_id ? exerciseMap.get(exLog.exercise_id) : null;
        const exName = exLog.name || exMeta?.name || exLog.exercise_name || workoutName;
        const exCategory = (exLog.category || exMeta?.category || '').toLowerCase();
        const nameLower = exName.toLowerCase();

        const workingSets = Array.isArray(exLog.sets)
          ? exLog.sets.filter((s: any) => s.type === 'working' || !s.type).length
          : 3;
        const baseFatigue = Math.min(65, Math.max(20, workingSets * 14));

        // 1. Direct explicit primary & secondary muscle mapping from Kratos DB
        if (exMeta?.primary_muscle) {
          addImpact(exMeta.primary_muscle, baseFatigue, dateMs, exName);
          if (Array.isArray(exMeta.secondary_muscles)) {
            exMeta.secondary_muscles.forEach((secSlug: string) => {
              addImpact(secSlug, baseFatigue * 0.5, dateMs, `${exName} (Secondary)`);
            });
          }
        } else if (
          nameLower.includes('lateral raise') ||
          nameLower.includes('rear delt') ||
          nameLower.includes('reverse fly') ||
          nameLower.includes('face pull')
        ) {
          addImpact('deltoids', baseFatigue, dateMs, exName);
          if (nameLower.includes('rear delt') || nameLower.includes('face pull')) {
            addImpact('trapezius', baseFatigue * 0.5, dateMs, exName);
            addImpact('upperBack', baseFatigue * 0.4, dateMs, exName);
          }
        } else if (
          exCategory === 'shoulders' ||
          exCategory === 'shoulders' ||
          nameLower.includes('shoulder') ||
          nameLower.includes('schouder') ||
          nameLower.includes('deltoid') ||
          nameLower.includes('arnold') ||
          nameLower.includes('military') ||
          nameLower.includes('overhead press')
        ) {
          addImpact('deltoids', baseFatigue, dateMs, exName);
          addImpact('triceps', baseFatigue * 0.4, dateMs, exName);
        } else if (
          nameLower.includes('fly') ||
          nameLower.includes('pec deck')
        ) {
          addImpact('chest', baseFatigue, dateMs, exName);
          addImpact('deltoids', baseFatigue * 0.4, dateMs, exName);
        } else if (
          exCategory === 'chest' ||
          exCategory === 'chest' ||
          nameLower.includes('chest') ||
          nameLower.includes('bench') ||
          nameLower.includes('pushup')
        ) {
          addImpact('chest', baseFatigue, dateMs, exName);
          addImpact('deltoids', baseFatigue * 0.4, dateMs, exName);
          addImpact('triceps', baseFatigue * 0.4, dateMs, `${exName} (Secondary)`);
        } else if (
          exCategory === 'triceps' ||
          nameLower.includes('tricep') ||
          nameLower.includes('triceps') ||
          nameLower.includes('pushdown') ||
          nameLower.includes('dip') ||
          nameLower.includes('skullcrusher')
        ) {
          addImpact('triceps', baseFatigue, dateMs, exName);
        } else if (
          nameLower.includes('back extension') ||
          nameLower.includes('hyperextension')
        ) {
          addImpact('lowerBack', baseFatigue, dateMs, exName);
          addImpact('upperBack', baseFatigue * 0.5, dateMs, exName);
          addImpact('gluteal', baseFatigue * 0.4, dateMs, exName);
        } else if (
          exCategory === 'quads' ||
          exCategory === 'quads' ||
          nameLower.includes('quad') ||
          nameLower.includes('squat') ||
          nameLower.includes('leg press') ||
          nameLower.includes('lunge') ||
          nameLower.includes('leg extension')
        ) {
          addImpact('quadriceps', baseFatigue, dateMs, exName);
          addImpact('gluteal', baseFatigue * 0.5, dateMs, exName);
          addImpact('lowerBack', baseFatigue * 0.3, dateMs, exName);
        } else if (
          exCategory === 'hamstrings' ||
          nameLower.includes('hamstring') ||
          nameLower.includes('rdl') ||
          nameLower.includes('deadlift') ||
          nameLower.includes('leg curl') ||
          nameLower.includes('romanian')
        ) {
          addImpact('hamstring', baseFatigue, dateMs, exName);
          addImpact('gluteal', baseFatigue * 0.6, dateMs, exName);
          addImpact('lowerBack', baseFatigue * 0.5, dateMs, exName);
          addImpact('trapezius', baseFatigue * 0.4, dateMs, exName);
        } else if (
          exCategory === 'lats' ||
          exCategory === 'upper back' ||
          exCategory === 'rug' ||
          nameLower.includes('lat') ||
          nameLower.includes('pull') ||
          nameLower.includes('row') ||
          nameLower.includes('chin')
        ) {
          addImpact('upperBack', baseFatigue, dateMs, exName);
          addImpact('trapezius', baseFatigue * 0.5, dateMs, exName);
          addImpact('biceps', baseFatigue * 0.5, dateMs, exName);
        } else if (
          exCategory === 'biceps' ||
          nameLower.includes('bicep') ||
          nameLower.includes('curl')
        ) {
          addImpact('biceps', baseFatigue, dateMs, exName);
          addImpact('forearm', baseFatigue * 0.4, dateMs, exName);
        } else if (
          exCategory === 'abs' ||
          exCategory === 'buik' ||
          nameLower.includes('abs') ||
          nameLower.includes('crunch') ||
          nameLower.includes('plank') ||
          nameLower.includes('leg raise')
        ) {
          addImpact('abs', baseFatigue, dateMs, exName);
          addImpact('obliques', baseFatigue * 0.5, dateMs, exName);
        } else if (
          exCategory === 'calves' ||
          exCategory === 'calves' ||
          nameLower.includes('calf') ||
          nameLower.includes('kuit')
        ) {
          addImpact('calves', baseFatigue, dateMs, exName);
        }
      });
    });

    // Process Aero cycling rides
    allRides.forEach((r: any) => {
      if (!r.date) return;
      const dateMs = Number(r.date);
      const distKm = Number(r.distance || 0);
      const tss = Number(r.tss || 0);
      const impactScale = distKm > 0 ? distKm : (tss > 0 ? tss * 0.5 : 20);

      const quadImpact = Math.min(85, Math.round(impactScale * 1.3));
      const calfImpact = Math.min(60, Math.round(impactScale * 0.8));
      const gluteImpact = Math.min(50, Math.round(impactScale * 0.6));
      const hamstringImpact = Math.min(45, Math.round(impactScale * 0.5));

      const rideTitle = distKm > 0 ? `Cycling Ride (${distKm.toFixed(1)} km)` : 'Cycling Ride';

      addImpact('quadriceps', quadImpact, dateMs, rideTitle);
      addImpact('calves', calfImpact, dateMs, rideTitle);
      addImpact('gluteal', gluteImpact, dateMs, rideTitle);
      addImpact('hamstring', hamstringImpact, dateMs, rideTitle);
    });

    // Process Stride running activities
    allStride.forEach((s: any) => {
      if (!s.date && !s.created_at) return;
      const dateMs = s.date ? new Date(s.date).getTime() : new Date(s.created_at).getTime();
      const distKm = Number(s.distance_km || s.distance || 0);
      const durationMin = Number(s.duration_sec || 0) / 60;
      const rpe = Number(s.rpe || 5);
      
      const impactScale = distKm > 0 ? distKm : (durationMin > 0 ? durationMin * 0.15 : 15);
      const intensityFactor = Math.max(0.8, rpe / 5.0);

      const calfImpact = Math.min(90, Math.round(impactScale * 1.6 * intensityFactor));
      const quadImpact = Math.min(85, Math.round(impactScale * 1.4 * intensityFactor));
      const hamstringImpact = Math.min(75, Math.round(impactScale * 1.1 * intensityFactor));
      const gluteImpact = Math.min(65, Math.round(impactScale * 0.9 * intensityFactor));
      const absImpact = Math.min(40, Math.round(impactScale * 0.4 * intensityFactor));

      const runTitle = s.title || (distKm > 0 ? `Run Session (${distKm.toFixed(1)} km)` : 'Run Session');

      addImpact('calves', calfImpact, dateMs, runTitle);
      addImpact('quadriceps', quadImpact, dateMs, runTitle);
      addImpact('hamstring', hamstringImpact, dateMs, runTitle);
      addImpact('gluteal', gluteImpact, dateMs, runTitle);
      addImpact('abs', absImpact, dateMs, runTitle);
    });

    const finalMap: Record<string, any> = {};

    Object.keys(map).forEach(key => {
      const item = map[key];
      const fatiguePercent = Math.min(100, Math.round(item.fatigueRaw));
      
      let lastTrainedStr = 'Fully Recovered';
      let primaryExercisesArr: string[] = ['No recent load'];

      if (item.lastTrainedMs > 0) {
        const hoursAgo = Math.round((nowMs - item.lastTrainedMs) / (1000 * 60 * 60));
        if (hoursAgo < 1) {
          lastTrainedStr = 'Just trained';
        } else if (hoursAgo < 24) {
          lastTrainedStr = `Today (${hoursAgo}h ago)`;
        } else if (hoursAgo < 48) {
          lastTrainedStr = 'Yesterday';
        } else {
          const daysAgo = Math.floor(hoursAgo / 24);
          lastTrainedStr = `${daysAgo} days ago`;
        }

        // Only include exercises performed within the latest training session (12h cutoff around lastTrainedMs)
        const sessionCutoffMs = item.lastTrainedMs - (12 * 60 * 60 * 1000);
        const latestSet = new Set<string>();
        item.exercisesWithDates.forEach(ex => {
          if (ex.dateMs >= sessionCutoffMs) {
            latestSet.add(ex.name);
          }
        });
        if (latestSet.size > 0) {
          primaryExercisesArr = Array.from(latestSet);
        }
      }

      finalMap[key] = {
        name: item.name,
        fatiguePercent,
        lastTrained: lastTrainedStr,
        primaryExercises: primaryExercisesArr
      };
    });

    return finalMap;
  }, [allRides, allKratos, kratosExercises]);

  const ctl = Math.round(todayPoint.ctl);
  const atl = Math.round(todayPoint.atl);
  const tsb = Math.round(todayPoint.tsb);

  // Zenith Sleep Engine Analysis
  const sleepAnalysis = useMemo(() => {
    return calculateZenithSleepScore(latestSleep, allSleeps, 8.0);
  }, [latestSleep, allSleeps]);

  // Rough BMR heuristic (~1 kcal per kg body weight per day, a widely-cited resting
  // metabolic rate rule of thumb) used only to turn today's logged food intake into a
  // directional calorie-balance signal. Hub does not have access to Fuel's full
  // calibrated TDEE model (apps/zenith-fuel/src/utils/zane.ts, which factors in
  // weight-trend regression, sleep, caffeine, etc.) — replicating that here is out of
  // scope for this pass. When there's no logged food data for today we return a
  // neutral 0 rather than fabricating a number, same as before, but the value is now
  // wired to real data whenever it exists instead of being permanently hardcoded.
  const CALORIE_BALANCE_BMR_KCAL_PER_KG_PER_DAY = 24;
  const calorieBalance = useMemo(() => {
    if (caloriesConsumedToday === null) return 0;
    const weightVal = latestWeight?.weight ?? fitnessProfile.weight ?? 75;
    const roughTdee = weightVal * CALORIE_BALANCE_BMR_KCAL_PER_KG_PER_DAY;
    return Math.round(caloriesConsumedToday - roughTdee);
  }, [caloriesConsumedToday, latestWeight, fitnessProfile.weight]);

  // Calculate recovery score (CR11 ML Model)
  const recoveryScore = useMemo(() => {
    if (!recoveryModel.loaded) {
      return null;
    }
    const sQual = sleepAnalysis.score;
    const sDur = sleepAnalysis.metrics.totalHours;
    const weightVal = latestWeight?.weight ?? fitnessProfile.weight ?? 75;

    // Feed the model cardio-only TSB/ATL (Aero + Stride) rather than the blended
    // Aero+Kratos+Stride tsb/atl used for the dashboard's PMC chart above. Kratos's
    // contribution is supplied via weeklyGymVolume immediately below; passing the
    // blended atl (which now includes Kratos's estimated load, per the shared pool
    // built above) AND weeklyGymVolume together would double-count the same Kratos
    // sessions toward the same recovery estimate. See cardioOnlyPMC/cardioToday above.
    return predictRecoveryScore(
      cardioToday.tsb,
      sQual,
      sDur,
      weeklyGymVolume,
      todaySteps,
      calorieBalance,
      weightVal,
      cardioToday.atl
    );
  }, [cardioToday, sleepAnalysis, latestWeight, fitnessProfile.weight, weeklyGymVolume, todaySteps, calorieBalance, mlModelsLoaded]);

  const recoveryCardStyle = useMemo(() => {
    if (recoveryScore === null) {
      return {
        bg: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(20, 20, 20, 0.8) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        color: '#cbd5e1',
        bar: 'rgba(255, 255, 255, 0.1)',
        circleBg: 'rgba(255, 255, 255, 0.05)',
        circleBorder: 'rgba(255, 255, 255, 0.1)'
      };
    }
    
    if (tsb < -25 || recoveryScore < 50) {
      return {
        bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(20, 20, 20, 0.8) 100%)',
        border: '1px solid rgba(239, 68, 68, 0.15)',
        color: '#ff7675',
        bar: 'linear-gradient(90deg, #ff7675, #ef4444)',
        circleBg: 'rgba(239, 68, 68, 0.1)',
        circleBorder: 'rgba(239, 68, 68, 0.2)'
      };
    }
    
    if (recoveryScore >= 80) {
      return {
        bg: 'linear-gradient(135deg, rgba(85, 239, 196, 0.08) 0%, rgba(20, 20, 20, 0.8) 100%)',
        border: '1px solid rgba(85, 239, 196, 0.15)',
        color: '#55efc4',
        bar: 'linear-gradient(90deg, #55efc4, #00b894)',
        circleBg: 'rgba(85, 239, 196, 0.1)',
        circleBorder: 'rgba(85, 239, 196, 0.2)'
      };
    }
    
    return {
      bg: 'linear-gradient(135deg, rgba(116, 185, 255, 0.08) 0%, rgba(20, 20, 20, 0.8) 100%)',
      border: '1px solid rgba(116, 185, 255, 0.15)',
      color: '#74b9ff',
      bar: 'linear-gradient(90deg, #74b9ff, #0984e3)',
      circleBg: 'rgba(116, 185, 255, 0.1)',
      circleBorder: 'rgba(116, 185, 255, 0.2)'
    };
  }, [recoveryScore, tsb]);

  const recoveryNote = useMemo((): { Icon: typeof AlertTriangle; text: string } => {
    if (recoveryScore === null) {
      return { Icon: Activity, text: 'Calculating recovery...' };
    }

    if (tsb < -25) {
      return { Icon: AlertTriangle, text: `Overtraining risk flagged by PMC (Form: ${tsb}). Adjust workload despite recovery score.` };
    }

    if (recoveryScore >= 80) {
      return { Icon: Trophy, text: 'Excellent recovery. Ready for high-intensity training!' };
    } else if (recoveryScore >= 50) {
      return { Icon: ThumbsUp, text: 'Well recovered. Normal training workload is optimal.' };
    } else {
      return { Icon: AlertTriangle, text: 'Fatigue detected. Focus on active recovery or rest.' };
    }
  }, [recoveryScore, tsb]);

  // Helper for steps goal percentage
  const stepsGoal = Number(fitnessProfile.target_steps || 10000);
  const stepsPercentage = Math.min(100, Math.round((todaySteps / stepsGoal) * 100));

  return (
    <div className="zh-hub-container">
      {/* Background radial glow */}
      <div className="zh-hub-glow" />

      {/* DASHBOARD VIEW */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, position: 'relative' }} className="animate-fade-in">
          {/* One loading state for the whole dashboard instead of each card popping in
              on its own — the real cards underneath still mount immediately (so layout
              doesn't jump once this clears), this just covers their zero-state values
              until fetchDashboardData resolves. */}
          {loadingDashboard && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              minHeight: 420,
              background: 'rgba(9, 9, 11, 0.78)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              borderRadius: 16,
            }}>
              <Loader2 size={28} className="zh-spin" style={{ color: '#cbd5e1' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.3px' }}>
                Loading your dashboard...
              </span>
            </div>
          )}
          {/* PMC & Recovery Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 20 }}>
            {/* PMC Card */}
            <div className="zh-stats-card">
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '1px' }}>
                  Physiological Training Load (PMC)
                </h3>
              </div>
              <p style={{ margin: '0 0 16px', fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                Calculated from your logged training workload across linked Aero, Kratos & Stride extensions.
                Aero figures come from measured ride TSS; Kratos & Stride figures are estimated from workout volume and duration/HR.
              </p>
              <ZenithHeroStat
                eyebrow="Form · TSB"
                value={tsb >= 0 ? `+${tsb}` : tsb}
                sub={tsbContext(currentFormStatus.label, tsb)}
                pill={
                  <span className="zenith-pill" style={{ background: `${currentFormStatus.color}1f`, color: currentFormStatus.color }}>
                    {currentFormStatus.emoji} {currentFormStatus.label}
                  </span>
                }
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
                  <div className="zenith-label">Fitness · CTL</div>
                  <div className="zenith-stat-value" style={{ marginTop: 4 }}>{ctl}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
                  <div className="zenith-label">Fatigue · ATL</div>
                  <div className="zenith-stat-value" style={{ marginTop: 4, color: '#f5a623' }}>{atl}</div>
                </div>
              </div>
              
              {/* Recharts PMC Prediction Chart */}
              <div className="wd-calendar-chart-wrapper" style={{ marginTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: 16 }}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Periodization & Forecast (+35 days)
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid {...ZENITH_CHART_GRID} />
                    <XAxis dataKey="dateStr" tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.05)" />
                    <YAxis tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.05)" />
                    <Tooltip
                      contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                      labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                    />
                    <ReferenceLine x={new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: 'Today', fill: '#cbd5e1', fontSize: 10 }} />
                    <Bar dataKey="tss" fill="rgba(255,255,255,0.08)" radius={[2, 2, 0, 0]} name="Daily TSS" />
                    <Line type="monotone" dataKey="ctl" stroke="#cbd5e1" strokeWidth={2} dot={false} name="Fitness (CTL)" />
                    <Line type="monotone" dataKey="atl" stroke="#ff7675" strokeWidth={1.5} dot={false} name="Fatigue (ATL)" />
                    <Line type="monotone" dataKey="tsb" stroke="#fdcb6e" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Form (TSB)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recovery Score Card */}
            <div className="zh-stats-card" style={{ background: recoveryCardStyle.bg, border: recoveryCardStyle.border, transition: 'all 0.3s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Heart size={14} style={{ color: recoveryCardStyle.color }} /> AI Recovery Score
                  </h3>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                    Real-time recovery score calculated from sleep, cardio load, and strength workouts.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: recoveryCardStyle.circleBg, border: `1px solid ${recoveryCardStyle.circleBorder}`, width: 56, height: 56, borderRadius: '50%', transition: 'all 0.3s ease' }}>
                  <strong style={{ fontSize: 20, color: recoveryCardStyle.color, fontWeight: 900 }}>
                    {recoveryScore !== null ? `${recoveryScore}%` : '--'}
                  </strong>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <div style={{ height: 6, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${recoveryScore ?? 0}%`, background: recoveryCardStyle.bar, borderRadius: 3, transition: 'width 0.5s ease-out' }} />
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#cbd5e1', fontWeight: 700 }}>
                  <recoveryNote.Icon size={12} />
                  {recoveryNote.text}
                </span>
              </div>
            </div>
          </div>

          {/* Sub Grid for health and weekly overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
            {/* Widget 1: Health & Vitality (Vigor) */}
            <div className="zh-stats-card" style={{ display: 'flex', flexDirection: 'column', justifySelf: 'stretch' }}>
              <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Scale size={14} style={{ color: '#cbd5e1' }} /> Health & Vitality (Vigor)
              </h3>
              
              {loadingDashboard ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11, minHeight: 120 }}>
                  Loading vitality...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, justifyContent: 'center' }}>
                  {/* Weight log */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div>
                      <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>Latest Weight Log</span>
                      <strong style={{ fontSize: 18, color: '#f8fafc', fontWeight: 800 }}>
                        {latestWeight ? `${latestWeight.weight} kg` : '--'}
                      </strong>
                    </div>
                    {latestWeight && (
                      <span style={{ fontSize: 10, color: '#64748b' }}>
                        {new Date(latestWeight.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>

                  {/* Sleep log */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Moon size={16} style={{ color: sleepAnalysis.ratingColor }} />
                      <div>
                        <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>ML Sleep Score</span>
                        <strong style={{ fontSize: 13, color: '#f8fafc' }}>
                          {latestSleep ? `${sleepAnalysis.metrics.totalHours} hrs` : '--'}
                        </strong>
                      </div>
                    </div>
                    {latestSleep && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {sleepAnalysis.sleepDebtHours > 2 && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#fb923c', background: 'rgba(251, 146, 60, 0.12)', padding: '2px 6px', borderRadius: 4 }}>
                            -{sleepAnalysis.sleepDebtHours}h debt
                          </span>
                        )}
                        <span style={{ fontSize: 11, fontWeight: 800, color: sleepAnalysis.ratingColor, background: `${sleepAnalysis.ratingColor}15`, padding: '3px 8px', borderRadius: 6, border: `1px solid ${sleepAnalysis.ratingColor}40` }}>
                          {sleepAnalysis.score}/100 ({sleepAnalysis.rating})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Steps Progress */}
                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Footprints size={16} style={{ color: '#cbd5e1' }} />
                        <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Today's Step Count</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1' }}>
                        {(todaySteps || 0).toLocaleString('en-US')} / {(stepsGoal || 10000).toLocaleString('en-US')}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${stepsPercentage}%`, background: 'linear-gradient(90deg, #cbd5e1, #ffffff)', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Widget 2: Weekly training summary statistics */}
            <div className="zh-stats-card" style={{ display: 'flex', flexDirection: 'column', justifySelf: 'stretch' }}>
              <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={14} style={{ color: '#cbd5e1' }} /> Weekly Performance
              </h3>

              {loadingDashboard ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11, minHeight: 120 }}>
                  Loading performance...
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, flex: 1 }}>
                  {/* Aero Cardio summary */}
                  <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Bike size={18} style={{ color: '#cbd5e1' }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Cardio (Aero)</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: 22, display: 'block', fontWeight: 900, color: '#f8fafc' }}>
                        {weeklyRidesDistance.toFixed(0)} <span style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1' }}>km</span>
                      </strong>
                      <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                        {weeklyRidesCount} {weeklyRidesCount === 1 ? 'cycling ride' : 'cycling rides'}
                      </span>
                    </div>
                  </div>

                  {/* Stride Running summary */}
                  <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Footprints size={18} style={{ color: '#38bdf8' }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Running (Stride)</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: 22, display: 'block', fontWeight: 900, color: '#f8fafc' }}>
                        {weeklyStrideDistance.toFixed(1)} <span style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1' }}>km</span>
                      </strong>
                      <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                        {weeklyStrideCount} {weeklyStrideCount === 1 ? 'run session' : 'run sessions'}
                      </span>
                    </div>
                  </div>

                  {/* Kratos Strength summary */}
                  <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Dumbbell size={18} style={{ color: '#c084fc' }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Strength (Kratos)</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: 22, display: 'block', fontWeight: 900, color: '#f8fafc' }}>
                        {weeklyKratosCount} <span style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1' }}>sessions</span>
                      </strong>
                      <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                        Completed this week
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Anatomical Human Muscle Heatmap */}
        <div style={{ marginTop: '24px' }}>
          <AnatomicalMuscleHeatmap customFatigueData={calculatedMuscleDataMap} isLoading={loadingDashboard} />
        </div>
    </div>
  );
};
