import React, { useState, useEffect, useMemo } from 'react';
import { Scale, Moon, Footprints, Dumbbell, Bike, Activity, Heart } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { predictRecoveryScore, recoveryModel } from '../../../../../shared/ml/RecoveryScore';
import { calculateZenithSleepScore } from '../../../../../shared/services/zenithSleepEngine';
import { computeSimulatedPMC, PlannedWorkoutItem, interpretTSB } from '../../utils/pmc';
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
  const [weeklyRidesCount, setWeeklyRidesCount] = useState<number>(0);
  const [weeklyRidesDistance, setWeeklyRidesDistance] = useState<number>(0);
  const [weeklyStrideCount, setWeeklyStrideCount] = useState<number>(0);
  const [weeklyStrideDistance, setWeeklyStrideDistance] = useState<number>(0);
  const [weeklyKratosCount, setWeeklyKratosCount] = useState<number>(0);
  const [weeklyGymVolume, setWeeklyGymVolume] = useState<number>(0);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const fetchDashboardData = async () => {
    setLoadingDashboard(true);
    try {
      // 1. Fetch latest weight log
      const { data: wData } = await supabase
        .from('vigor_weight')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(1);
      if (wData && wData.length > 0) {
        setLatestWeight(wData[0]);
      } else {
        setLatestWeight(null);
      }

      // 2. Fetch latest 14 sleep logs for ML baseline & debt analysis
      const { data: sData } = await supabase
        .from('vigor_sleep')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(14);
      if (sData && sData.length > 0) {
        setLatestSleep(sData[0]);
        setAllSleeps(sData);
      } else {
        setLatestSleep(null);
        setAllSleeps([]);
      }

      // 3. Fetch today's steps log
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data: stData } = await supabase
        .from('vigor_steps')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', todayStart.toISOString())
        .lte('logged_at', todayEnd.toISOString())
        .order('logged_at', { ascending: false });
      if (stData && stData.length > 0) {
        setTodaySteps(Number(stData[0].step_count) || 0);
      } else {
        setTodaySteps(0);
      }

      // 4. Calculate start of current week (Monday)
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(now.setDate(diff));
      startOfWeek.setHours(0, 0, 0, 0);

      // 5. Fetch weekly rides count & distance
      const { data: rData } = await supabase
        .from('rides')
        .select('distance')
        .eq('user_id', userId)
        .gte('date', startOfWeek.getTime());

      if (rData) {
        setWeeklyRidesCount(rData.length);
        const totalDist = rData.reduce((sum, r) => sum + Number(r.distance || 0), 0);
        setWeeklyRidesDistance(totalDist);
      } else {
        setWeeklyRidesCount(0);
        setWeeklyRidesDistance(0);
      }

      // 5b. Fetch weekly Stride runs count & distance
      const { data: stRunData } = await supabase
        .from('stride_activities')
        .select('distance_km, date, created_at')
        .eq('user_id', userId);
      
      if (stRunData) {
        const startOfWeekMs = startOfWeek.getTime();
        const thisWeekRuns = stRunData.filter(s => {
          const t = s.date ? new Date(s.date).getTime() : new Date(s.created_at).getTime();
          return t >= startOfWeekMs;
        });
        setWeeklyStrideCount(thisWeekRuns.length);
        const totalDist = thisWeekRuns.reduce((sum, r) => sum + Number(r.distance_km || 0), 0);
        setWeeklyStrideDistance(totalDist);
      } else {
        setWeeklyStrideCount(0);
        setWeeklyStrideDistance(0);
      }

      // 6. Fetch weekly Kratos workouts count and volume
      const { data: kData } = await supabase
        .from('kratos_workouts')
        .select('id, volume')
        .eq('user_id', userId)
        .gte('completed_at', startOfWeek.toISOString());
      
      if (kData) {
        setWeeklyKratosCount(kData.length);
        const totalVolume = kData.reduce((sum, w) => sum + Number(w.volume || 0), 0);
        setWeeklyGymVolume(totalVolume);
      } else {
        setWeeklyKratosCount(0);
        setWeeklyGymVolume(0);
      }

      // 7. Fetch planned workouts for PMC simulation
      const { data: plannedData } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', userId);
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

      // 8. Fetch completed rides for PMC simulation & Muscle Heatmap
      const { data: ridesData } = await supabase
        .from('rides')
        .select('date, distance, metadata')
        .eq('user_id', userId);
      if (ridesData) {
        setAllRides(ridesData.map((r: any) => {
          const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {};
          return {
            date: Number(r.date),
            distance: Number(r.distance || 0),
            tss: meta?.tss ?? meta?.hrTSS ?? 0
          };
        }));
      }

      // 9. Fetch Stride running activities for PMC simulation & Cardio Volume
      const { data: strideData } = await supabase
        .from('stride_activities')
        .select('*')
        .eq('user_id', userId);
      if (strideData) {
        setAllStride(strideData);
      }

      // 10. Fetch Kratos workouts for PMC simulation & Muscle Heatmap
      const { data: allKData } = await supabase
        .from('kratos_workouts')
        .select('id, name, completed_at, sets, volume')
        .eq('user_id', userId);
      if (allKData) {
        setAllKratos(allKData);
      }

      // 11. Fetch Kratos exercises catalog to map exercise IDs -> Categories, Primary & Secondary Muscles
      const { data: exCatalog } = await supabase
        .from('kratos_exercises')
        .select('id, name, category, primary_muscle, secondary_muscles')
        .eq('user_id', userId);
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
    }
  }, [userId]);

  // ── PMC Simulation Logic ──
  const simPMC = useMemo(() => {
    const tssList: { date: number; tss: number }[] = [];

    allRides.forEach(r => {
      if (r.tss > 0) {
        tssList.push({ date: r.date, tss: r.tss });
      }
    });

    allStride.forEach(s => {
      const dateMs = new Date(s.date).getTime();
      const durMins = (s.duration_sec || 1200) / 60;
      const hrRatio = (s.avg_heart_rate || 147) / 150;
      const rss = Math.round(durMins * hrRatio * 1.1);
      if (rss > 0) {
        tssList.push({ date: dateMs, tss: rss });
      }
    });

    allKratos.forEach(k => {
      if (k.completed_at && k.volume) {
        const ts = new Date(k.completed_at).getTime();
        const volume = Number(k.volume);
        const sTSS = Math.min(80, Math.max(15, Math.round(volume * 0.012)));
        tssList.push({ date: ts, tss: sTSS });
      }
    });

    return computeSimulatedPMC(tssList, plannedWorkouts, 35);
  }, [allRides, allKratos, plannedWorkouts]);

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
      dateStr: new Date(pt.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
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
      deltoids: { name: 'Schouders (Deltoideus)', fatigueRaw: 0, lastTrainedMs: 0, exercisesWithDates: [] },
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
              addImpact(secSlug, baseFatigue * 0.5, dateMs, `${exName} (Secundair)`);
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
          exCategory === 'schouders' ||
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
          exCategory === 'borst' ||
          nameLower.includes('chest') ||
          nameLower.includes('bench') ||
          nameLower.includes('pushup')
        ) {
          addImpact('chest', baseFatigue, dateMs, exName);
          addImpact('deltoids', baseFatigue * 0.4, dateMs, exName);
          addImpact('triceps', baseFatigue * 0.4, dateMs, `${exName} (Secundair)`);
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
          exCategory === 'dijen' ||
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
          exCategory === 'kuiten' ||
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

  // Calculate recovery score (CR11 ML Model)
  const recoveryScore = useMemo(() => {
    if (!recoveryModel.loaded) {
      return null;
    }
    const sQual = sleepAnalysis.score;
    const sDur = sleepAnalysis.metrics.totalHours;
    const weightVal = latestWeight?.weight ?? fitnessProfile.weight ?? 75;
    
    return predictRecoveryScore(
      tsb,
      sQual,
      sDur,
      weeklyGymVolume,
      todaySteps,
      0, // calorieBalance default
      weightVal,
      atl
    );
  }, [tsb, sleepAnalysis, latestWeight, fitnessProfile.weight, weeklyGymVolume, todaySteps, atl, mlModelsLoaded]);

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

  const recoveryNote = useMemo(() => {
    if (recoveryScore === null) {
      return 'Calculating recovery...';
    }
    
    if (tsb < -25) {
      return `⚠️ Overtraining risk flagged by PMC (Form: ${tsb}). Adjust workload despite recovery score.`;
    }
    
    if (recoveryScore >= 80) {
      return '🏆 Excellent recovery. Ready for high-intensity training!';
    } else if (recoveryScore >= 50) {
      return '💪 Well recovered. Normal training workload is optimal.';
    } else {
      return '⚠️ Fatigue detected. Focus on active recovery or rest.';
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">
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
              </p>
              <div className="zh-stats-grid">
                <div className="zh-stat-item">
                  <span className="zh-stat-label">Fitness (CTL)</span>
                  <strong className="zh-stat-value" style={{ color: '#cbd5e1' }}>{ctl}</strong>
                </div>
                <div className="zh-stat-item">
                  <span className="zh-stat-label">Fatigue (ATL)</span>
                  <strong className="zh-stat-value" style={{ color: '#ff7675' }}>{atl}</strong>
                </div>
                <div className="zh-stat-item">
                  <span className="zh-stat-label">Form (TSB)</span>
                  <strong className="zh-stat-value" style={{ color: tsb >= 0 ? '#cbd5e1' : '#eccc68' }}>{tsb >= 0 ? `+${tsb}` : tsb}</strong>
                </div>
              </div>
              
              {/* Recharts PMC Prediction Chart */}
              <div className="wd-calendar-chart-wrapper" style={{ marginTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Periodization & Forecast (+35 days)
                  </span>
                  <span style={{ fontSize: 10, color: currentFormStatus.color, fontWeight: 700 }}>
                    Status: {currentFormStatus.label} {currentFormStatus.emoji}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="dateStr" tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.05)" />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.05)" />
                    <Tooltip
                      contentStyle={{ background: '#09090b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#fff' }}
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
                <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 700 }}>
                  {recoveryNote}
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
                        {(todaySteps || 0).toLocaleString()} / {(stepsGoal || 10000).toLocaleString()}
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
          <AnatomicalMuscleHeatmap customFatigueData={calculatedMuscleDataMap} />
        </div>
    </div>
  );
};
