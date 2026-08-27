import { TSB_FATIGUED_ABOVE, TSB_OPTIMAL_ABOVE, TSB_PEAK_ABOVE, TSB_FRESH_ABOVE, buildTrainingLoadPool } from '@zenith/shared';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { FitnessProfile, RideSummaryWithBests } from '../types/workout';
import {
  WorkoutLogEntry, CustomBlock, WorkoutType, TrainingPhase,
  loadLog, saveLog, getPhase, phaseCap, intensityOrder, phaseConfig
} from '../types/training';
import { generateWorkout } from '../utils/workouts';
import { computePMC, interpretTSB } from '../utils/pmc';
import { analyzeNotesLocally, predictRecommendedWorkout, trainCoachModel, predictInjuryRisk } from '../utils/localNeuralNet';
import { customToWorkout } from '../utils/trainingHelpers';
import { supabase } from '../utils/supabaseClient';

export function useTrainingState(
  profile: FitnessProfile,
  rides: RideSummaryWithBests[],
  kratosWorkouts: any[] = []
) {
  // ── Smart training state ──
  const [duration, setDuration] = useState<number>(60);
  const [intensityProfile, setIntensityProfile] = useState<'road' | 'gravel' | 'mtb'>('road');
  const [selectedStartLoc, setSelectedStartLoc] = useState<string>('default');
  const [hrMode, setHrMode] = useState(false);
  const [showRpeModal, setShowRpeModal] = useState(false);
  const [rpeValue, setRpeValue] = useState(6);
  const [rpeNotes, setRpeNotes] = useState('');
  const [planConfirm, setPlanConfirm] = useState<string | null>(null);

  // Vigor sleep & steps tracking for AI overrides (CR4 & CR5)
  const [todaySleepQuality, setTodaySleepQuality] = useState<number | null>(null);
  const [dailySteps, setDailySteps] = useState(8000);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id;
      if (!userId) return;

      // Fetch today's sleep quality (CR4)
      supabase
        .from('vigor_sleep')
        .select('quality_score')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(1)
        .then(({ data: sleepData }) => {
          if (sleepData && sleepData.length > 0) {
            setTodaySleepQuality(Number(sleepData[0].quality_score));
          }
        });

      // Fetch today's steps (CR5)
      supabase
        .from('vigor_steps')
        .select('step_count')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .then(({ data: stepsData }) => {
          if (stepsData && stepsData.length > 0) {
            setDailySteps(Number(stepsData[0].step_count) || 0);
          }
        });
    });
  }, []);

  // ── Workout log ──
  const [workoutLog, setWorkoutLog] = useState<WorkoutLogEntry[]>(() => loadLog());

  const addLogEntry = useCallback((entry: WorkoutLogEntry) => {
    const updated = [entry, ...workoutLog].slice(0, 50);
    setWorkoutLog(updated);
    saveLog(updated);
  }, [workoutLog]);

  // ── Custom builder state ──
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>([
    { id: '1', name: 'Warm-up',    durationMin: 10, powerPct: 55, zone: 1 },
    { id: '2', name: 'Interval 1', durationMin: 15, powerPct: 88, zone: 3 },
    { id: '3', name: 'Recovery',    durationMin:  5, powerPct: 50, zone: 1 },
    { id: '4', name: 'Interval 2', durationMin: 15, powerPct: 88, zone: 3 },
    { id: '5', name: 'Cool-down',  durationMin: 10, powerPct: 45, zone: 1 },
  ]);
  const [customTitle, setCustomTitle] = useState('My Sweet Spot Workout');
  const [buildPlanned, setBuildPlanned] = useState(false);

  const addCustomBlock = () => {
    setCustomBlocks(prev => [...prev, {
      id: Date.now().toString(), name: 'New Block', durationMin: 5, powerPct: 70, zone: 2,
    }]);
  };

  const updateBlock = (id: string, field: keyof CustomBlock, value: any) => {
    setCustomBlocks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const removeBlock = (id: string) => {
    setCustomBlocks(prev => prev.filter(b => b.id !== id));
  };

  const customWorkout = useMemo(() => customToWorkout(customBlocks, customTitle), [customBlocks, customTitle]);
  const customTotalMin = customBlocks.reduce((s, b) => s + b.durationMin, 0);

  // ── Periodization state ──
  const [eventDate, setEventDate] = useState(() => {
    const saved = localStorage.getItem('zenith_event_date');
    if (saved) return saved;
    const d = new Date(); d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [eventName, setEventName] = useState(() => {
    return localStorage.getItem('zenith_event_name') ?? 'My Event';
  });
  const [goalType, setGoalType] = useState<'event' | 'continuous'>(() => {
    return (localStorage.getItem('zenith_goal_type') as any) ?? 'event';
  });
  const [activeFocus, setActiveFocus] = useState<'ftp' | 'endurance' | 'recovery' | 'vo2max'>(() => {
    return (localStorage.getItem('zenith_active_focus') as any) ?? 'endurance';
  });

  useEffect(() => {
    localStorage.setItem('zenith_event_date', eventDate);
    localStorage.setItem('zenith_event_name', eventName);
    localStorage.setItem('zenith_goal_type', goalType);
    localStorage.setItem('zenith_active_focus', activeFocus);
  }, [eventDate, eventName, goalType, activeFocus]);

  const phaseInfo = useMemo(() => {
    if (goalType === 'continuous') {
      let mappedPhase: TrainingPhase = 'base';
      if (activeFocus === 'ftp') mappedPhase = 'build';
      else if (activeFocus === 'vo2max') mappedPhase = 'peak';
      else if (activeFocus === 'recovery') mappedPhase = 'recovery';

      return {
        phase: mappedPhase,
        daysToEvent: 0,
        weekLabel: 'Continuous focus'
      };
    }
    return getPhase(eventDate);
  }, [goalType, activeFocus, eventDate]);

  const phase = useMemo(() => {
    if (goalType === 'continuous') {
      if (activeFocus === 'ftp') {
        return {
          color: '#fdcb6e',
          emoji: '⚡',
          label: 'Increase FTP',
          description: 'Targeted progression of your FTP and threshold power.',
          weekFocus: ['Endurance', 'Sweet Spot', 'Rest', 'Threshold', 'Endurance', 'Sweet Spot', 'Rest']
        };
      } else if (activeFocus === 'recovery') {
        return {
          color: '#94a3b8',
          emoji: '💤',
          label: 'Active Recovery',
          description: 'Recovery and base maintenance without stress.',
          weekFocus: ['Rest', 'Recovery', 'Rest', 'Recovery', 'Rest', 'Recovery', 'Rest']
        };
      } else if (activeFocus === 'vo2max') {
        return {
          color: '#ff7675',
          emoji: '🚀',
          label: 'VO2max Focus',
          description: 'Short explosive efforts to raise your aerobic ceiling.',
          weekFocus: ['VO2max', 'Rest', 'VO2max', 'Rest', 'Endurance', 'Rest', 'Rest']
        };
      } else {
        // endurance
        return {
          color: '#00b894',
          emoji: '🌱',
          label: 'Fitness Building',
          description: 'Targeted build of aerobic fitness and endurance.',
          weekFocus: ['Endurance (Z2)', 'Endurance (Z2)', 'Rest', 'Endurance (Z2)', 'Recovery', 'Endurance (Z2)', 'Rest']
        };
      }
    }
    return phaseConfig[phaseInfo.phase];
  }, [goalType, activeFocus, phaseInfo.phase]);

  // ── Rides per day map ──
  const ridesByDay = useMemo(() => {
    const map = new Map<string, { tss: number; distance: number; name: string }>();
    for (const r of rides) {
      const key = new Date(r.date).toISOString().slice(0, 10);
      const existing = map.get(key);
      const tss = r.tss ?? r.hrTSS ?? 0;
      if (existing) {
        map.set(key, { tss: existing.tss + tss, distance: existing.distance + r.distance, name: existing.name });
      } else {
        map.set(key, { tss, distance: r.distance, name: r.name });
      }
    }
    return map;
  }, [rides]);

  // ── PMC ──
  const pmcStatus = useMemo(() => {
    // Built by the shared pool, not assembled here. This block had its own copy
    // of the Kratos conversion, on raw tonnage, and never received the
    // reps-in-reserve weighting - so four of nine sessions saturated its 80-point
    // ceiling and Aero showed CTL 19 / ATL 31 / TSB -12 where Hub showed
    // 15 / 25 / -9 from the same data on the same day.
    const tssList = buildTrainingLoadPool({ rides, kratosWorkouts }, 'all');

    if (tssList.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
    const points = computePMC(tssList);
    return points[points.length - 1] ?? { ctl: 0, atl: 0, tsb: 0 };
  }, [rides, kratosWorkouts]);

  const latestTSB = pmcStatus.tsb;

  // ── Sporadic trainer detection ──
  const trainingProfile = useMemo(() => {
    const fourWeeksAgo = Date.now() - 28 * 86400000;
    const recentRides  = rides.filter(r => r.date >= fourWeeksAgo);
    const avgPerWeek   = recentRides.length / 4;
    const sortedDates = rides.map(r => r.date).sort((a, b) => b - a);
    const lastRideTs  = sortedDates[0] ?? null;
    const daysSinceLast = lastRideTs
      ? Math.floor((Date.now() - lastRideTs) / 86400000)
      : null;

    const activeWeeks = new Set<string>();
    const eightWeeksAgo = Date.now() - 56 * 86400000;
    for (const r of rides) {
      if (r.date < eightWeeksAgo) continue;
      const d = new Date(r.date);
      const weekKey = `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`;
      activeWeeks.add(weekKey);
    }
    const isFlexible = avgPerWeek < 3;
    return { avgPerWeek, daysSinceLast, activeWeeks: activeWeeks.size, isFlexible, lastRideTs };
  }, [rides]);

  // ── Recommendation for flexible trainers ──
  const flexibleRecommendation = useMemo((): {
    type: WorkoutType; emoji: string; title: string; reason: string;
  } => {
    const days = trainingProfile.daysSinceLast;
    if (days === null || days === 0) {
      return { type: 'recovery', emoji: '💙', title: 'Recovery or rest', reason: 'You already rode today. Tomorrow you can train again.' };
    }
    if (days === 1) {
      return { type: 'endurance', emoji: '🟢', title: 'Easy endurance ride', reason: '1 day after your last ride. Easy Z2 ride.' };
    }
    if (days <= 3) {
      return { type: 'sweetspot', emoji: '🟡', title: 'Sweet Spot', reason: `${days} days rest. You are recovered — make it a quality session.` };
    }
    if (days <= 7) {
      return { type: 'threshold', emoji: '🔴', title: 'Threshold Training', reason: `${days} days not ridden. Good day for a solid workout..` };
    }
    return { type: 'endurance', emoji: '🟢', title: 'Easy start', reason: `${days} days not ridden. Start easy — rebuild consistency.` };
  }, [trainingProfile]);

  function capByPhase(type: WorkoutType): WorkoutType {
    const cap    = phaseCap[phaseInfo.phase];
    const capIdx = intensityOrder.indexOf(cap);
    const idx    = intensityOrder.indexOf(type);
    return idx <= capIdx ? type : cap;
  }

  const avgRpeLast3 = useMemo(() => {
    const withRpe = rides.filter(r => r.rpe != null);
    if (withRpe.length === 0) return 6.0;
    const last3 = withRpe.slice(0, 3);
    const sum = last3.reduce((s, r) => s + r.rpe!, 0);
    return sum / last3.length;
  }, [rides]);

  const recommendedType = useMemo(() => {
    if (trainingProfile.isFlexible) {
      return flexibleRecommendation.type;
    }
    let predicted = predictRecommendedWorkout(
      pmcStatus.ctl,
      pmcStatus.atl,
      pmcStatus.tsb,
      profile.trainingGoal ?? 'general',
      avgRpeLast3
    );

    // CR4: Sleep Override
    if (todaySleepQuality !== null && todaySleepQuality < 50) {
      predicted = 'recovery';
    } else if (todaySleepQuality !== null && todaySleepQuality < 70) {
      if (intensityOrder.indexOf(predicted as WorkoutType) > intensityOrder.indexOf('endurance')) {
        predicted = 'endurance';
      }
    }

    return capByPhase(predicted as WorkoutType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmcStatus, profile.trainingGoal, avgRpeLast3, trainingProfile.isFlexible, flexibleRecommendation.type, phaseInfo.phase, todaySleepQuality]);

  const [selectedType, setSelectedType] = useState<WorkoutType | null>(null);

  const handleSelectType = useCallback((type: WorkoutType | null) => {
    setSelectedType(type);
    if (type && type !== recommendedType) {
      trainCoachModel(
        pmcStatus.ctl,
        pmcStatus.atl,
        pmcStatus.tsb,
        profile.trainingGoal ?? 'general',
        avgRpeLast3,
        type as any
      );
    }
  }, [recommendedType, pmcStatus, profile.trainingGoal, avgRpeLast3]);

  const rpeOverride = useMemo((): WorkoutType | null => {
    const logEntries = workoutLog.map(e => ({ date: e.date, rpe: e.rpe }));
    const rideEntries = rides
      .filter(r => r.rpe != null)
      .map(r => ({
        date: new Date(r.date).toISOString().slice(0, 10),
        rpe: r.rpe!
      }));
    const allEntries = [...logEntries, ...rideEntries].sort((a, b) => b.date.localeCompare(a.date));
    if (allEntries.length === 0) return null;
    const lastEntry = allEntries[0];
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
    if ((lastEntry.date === yesterday || lastEntry.date === today) && lastEntry.rpe >= 8) return 'recovery';
    if (lastEntry.date === yesterday && lastEntry.rpe >= 6) return 'endurance';
    return null;
  }, [workoutLog, rides]);

  // ── Local AI Analysis of Ride Notes ──
  const localAiAdvice = useMemo(() => {
    const nowMs = Date.now();
    const fortyEightHoursAgo = nowMs - 48 * 3600 * 1000;
    const recentRidesWithNotes = rides.filter(r => r.date >= fortyEightHoursAgo && r.notes && r.notes.trim().length > 0);
    for (const r of recentRidesWithNotes) {
      const analysis = analyzeNotesLocally(r.notes!);
      if (analysis.illness >= 0.5) {
        return { type: 'rest' as const, reason: `Illness or acute pain detected in your ride notes. Take complete rest today.`, score: analysis.illness };
      }
      if (analysis.fatigue >= 0.65) {
        return { type: 'recovery' as const, reason: `Increased muscle fatigue detected in ride notes. Workout adjusted to recovery ride.`, score: analysis.fatigue };
      }
    }
    return null;
  }, [rides]);

  const coachTargetType = useMemo((): WorkoutType => {
    let baseType = recommendedType;
    if (rpeOverride === 'recovery') {
      baseType = 'recovery';
    } else if (rpeOverride === 'endurance' && (baseType === 'sweetspot' || baseType === 'threshold' || baseType === 'vo2max')) {
      baseType = 'endurance';
    }
    if (localAiAdvice?.type === 'rest' || localAiAdvice?.type === 'recovery') {
      baseType = 'recovery';
    }
    return baseType;
  }, [recommendedType, rpeOverride, localAiAdvice]);

  const effectiveType = useMemo(() => {
    return trainingProfile.isFlexible
      ? (selectedType ?? coachTargetType)
      : capByPhase((selectedType ?? coachTargetType) as WorkoutType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingProfile.isFlexible, selectedType, coachTargetType, phaseInfo.phase]);

  const activeWorkout = useMemo(() => generateWorkout(effectiveType, duration), [effectiveType, duration]);

  const pmcData = useMemo(() => {
    const tssList: { date: number; tss: number }[] = rides
      .filter(r => (r.tss ?? r.hrTSS) != null)
      .map(r => ({ date: r.date, tss: (r.tss ?? r.hrTSS)! }));

    kratosWorkouts.forEach((k: any) => {
      if (k.completed_at && k.volume) {
        const ts = new Date(k.completed_at).getTime();
        const volume = Number(k.volume);
        const sTSS = Math.min(80, Math.max(15, Math.round(volume * 0.012)));
        tssList.push({ date: ts, tss: sTSS });
      }
    });

    if (tssList.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
    const pts = computePMC(tssList);
    return pts[pts.length - 1] ?? { ctl: 0, atl: 0, tsb: 0 };
  }, [rides, kratosWorkouts]);

  const tsbStatus = useMemo(() => interpretTSB(latestTSB), [latestTSB]);

  // ── Week Plan ──
  const weekPlan = useMemo(() => {
    const tsb = latestTSB;
    type RW = WorkoutType | 'rest';
    // Bucketed by the shared TSB breakpoints (shared/pmc.ts) rather than local
    // literals — this grid had drifted to its own top boundary (20 vs 25).
    const tsbRow: RW[] = (() => {
      if      (tsb < TSB_FATIGUED_ABOVE) return ['rest','recovery','recovery','rest','endurance','recovery','rest'] as RW[];
      else if (tsb < TSB_OPTIMAL_ABOVE)  return ['recovery','endurance','recovery','sweetspot','rest','endurance','rest'] as RW[];
      else if (tsb < TSB_PEAK_ABOVE)     return ['endurance','sweetspot','rest','sweetspot','endurance','threshold','rest'] as RW[];
      else if (tsb < TSB_FRESH_ABOVE)    return ['sweetspot','threshold','rest','sweetspot','threshold','endurance','rest'] as RW[];
      else                               return ['threshold','sweetspot','threshold','rest','sweetspot','threshold','rest'] as RW[];
    })();

    const phaseRows: Record<TrainingPhase, RW[]> = {
      base:     ['endurance','endurance','rest','sweetspot','endurance','endurance','rest'],
      build:    ['endurance','sweetspot','rest','threshold','endurance','sweetspot','rest'],
      peak:     ['endurance','recovery', 'rest','sweetspot','rest','recovery','rest'],
      race:     ['recovery', 'rest',     'recovery','rest','recovery','rest','rest'],
      recovery: ['rest',     'recovery', 'rest','recovery','rest','recovery','rest'],
    };
    const phaseRow = phaseRows[phaseInfo.phase];

    const combined: RW[] = tsbRow.map((tsbDay, i) => {
      const phaseDay = phaseRow[i];
      if (tsbDay === 'rest' || phaseDay === 'rest') return 'rest';
      const tIdx = intensityOrder.indexOf(tsbDay as WorkoutType);
      const pIdx = intensityOrder.indexOf(phaseDay as WorkoutType);
      return intensityOrder[Math.min(tIdx, pIdx)];
    });

    const now = new Date(); now.setHours(0, 0, 0, 0);
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

    return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => {
      const date = new Date(monday); date.setDate(monday.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      const rideInfo = ridesByDay.get(key);
      return { day: d, type: combined[i], date: key, rideInfo };
    });
  }, [latestTSB, phaseInfo.phase, ridesByDay]);

  const lthr = profile.lthr ?? 175;
  const hrZoneBounds = [0.6, 0.72, 0.82, 0.87, 0.92, 1.05].map(f => Math.round(f * lthr));
  const powerPctToHR = useCallback((pct: number): string => {
    const approxHrPct = 0.55 + pct * 0.45;
    return `${Math.round(approxHrPct * lthr)} bpm`;
  }, [lthr]);

  // ── Streak ──
  const streak = useMemo(() => {
    let count = 0;
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = 0; i < 60; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const hasRide = ridesByDay.has(key);
      const hasLog  = workoutLog.some(e => e.date === key);
      if (hasRide || hasLog) count++;
      else if (i > 0) break;
    }
    return count;
  }, [ridesByDay, workoutLog]);

  // ── TSS Impact preview ──
  const tssImpact = useMemo(() => {
    const ftp = profile.ftp ?? 200;
    const blocks = activeWorkout.blocks ?? [];
    const totalMin = blocks.reduce((s: number, b: any) => s + b.durationMinutes, 0) || duration;
    const weightedPower4 = blocks.reduce((s: number, b: any) => s + b.durationMinutes * Math.pow((b.powerPct / 100) * ftp, 4), 0);
    const normPower = Math.round(Math.pow(weightedPower4 / totalMin, 0.25)) || Math.round(0.75 * ftp);
    const IF = normPower / ftp;
    const durationSec = duration * 60;
    const estimatedTSS = Math.round((durationSec * normPower * IF) / (ftp * 3600) * 100);
    const ctl = pmcData.ctl;
    const atl = pmcData.atl;
    const decay_ctl = 1 - 1/42;
    const decay_atl = 1 - 1/7;
    const newATL = Math.round(atl * decay_atl + estimatedTSS * (1 - decay_atl));
    const newCTL = Math.round(ctl * decay_ctl + estimatedTSS * (1 - decay_ctl));
    const newTSB = Math.round(newCTL - newATL);
    return { estimatedTSS, newATL, newCTL, newTSB, IF: IF.toFixed(2), normPower };
  }, [activeWorkout, duration, pmcData, profile.ftp]);

  // ── Week Load Data ──
  const weekLoadData = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label, i) => {
      const date = new Date(monday); date.setDate(monday.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      const rideInfo = ridesByDay.get(key);
      const logEntries = workoutLog.filter(e => e.date === key);
      const tss = (rideInfo?.tss ?? 0) + logEntries.reduce((s, e) => s + e.rpe * e.durationMinutes * 0.1, 0);
      return { label, tss: Math.round(tss), isToday: key === now.toISOString().slice(0, 10), date: key };
    });
    const maxTSS = Math.max(...days.map(d => d.tss), 100);
    const weekTSS = days.reduce((s, d) => s + d.tss, 0);
    const weekGoal = Math.round(pmcData.ctl * 7 * 0.9);
    return { days, maxTSS, weekTSS, weekGoal };
  }, [ridesByDay, workoutLog, pmcData.ctl]);

  // Gym volume last 7 days (CR8)
  const gymVolume7d = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return kratosWorkouts
      .filter((w: any) => w.completed_at && new Date(w.completed_at).getTime() >= sevenDaysAgo)
      .reduce((sum, w) => sum + Number(w.volume || 0), 0);
  }, [kratosWorkouts]);

  // Calculate dynamic injury risk (CR5 & CR8)
  const injuryRiskScore = useMemo(() => {
    const acwr = pmcData.ctl > 0 ? pmcData.atl / pmcData.ctl : 1.0;
    const tsb = pmcData.tsb;
    const fatigueProxy = Math.min(1.0, Math.max(0, (pmcData.atl - pmcData.ctl) / 50));
    const illnessProxy = acwr > 1.3 ? 0.6 : 0.1;
    return predictInjuryRisk(
      pmcData.ctl,
      pmcData.atl,
      tsb,
      fatigueProxy,
      illnessProxy,
      dailySteps,
      gymVolume7d
    );
  }, [pmcData, dailySteps, gymVolume7d]);

  const overtrainingRisk = injuryRiskScore > 0.7 ? 'high' : injuryRiskScore > 0.4 ? 'moderate' : null;

  // ── Type counts ──
  const weekTypeCount = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const mon = monday.toISOString().slice(0, 10);
    const counts: Record<string, number> = {};
    for (const r of rides) {
      const key = new Date(r.date).toISOString().slice(0, 10);
      if (key >= mon) {
        const ftp = profile.ftp ?? 200;
        const ratio = (r.normPower ?? r.avgPower ?? 0) / ftp;
        const type = ratio < 0.6 ? 'recovery' : ratio < 0.75 ? 'endurance' : ratio < 0.88 ? 'sweetspot' : 'threshold';
        counts[type] = (counts[type] ?? 0) + 1;
      }
    }
    return counts;
  }, [rides, profile.ftp]);

  const typeCountWarning = (weekTypeCount[effectiveType] ?? 0) >= 2
    ? `You have already done ${weekTypeCount[effectiveType]}x ${effectiveType} workouts this week`
    : null;

  return {
    duration, setDuration,
    intensityProfile, setIntensityProfile,
    selectedStartLoc, setSelectedStartLoc,
    hrMode, setHrMode,
    showRpeModal, setShowRpeModal,
    rpeValue, setRpeValue,
    rpeNotes, setRpeNotes,
    planConfirm, setPlanConfirm,
    workoutLog, setWorkoutLog,
    addLogEntry,
    customBlocks, setCustomBlocks,
    customTitle, setCustomTitle,
    buildPlanned, setBuildPlanned,
    addCustomBlock, updateBlock, removeBlock,
    customWorkout, customTotalMin,
    eventDate, setEventDate,
    eventName, setEventName,
    phaseInfo, phase,
    ridesByDay,
    latestTSB,
    trainingProfile,
    flexibleRecommendation,
    recommendedType,
    selectedType, setSelectedType: handleSelectType,
    rpeOverride,
    localAiAdvice,
    coachTargetType,
    effectiveType,
    activeWorkout,
    pmcData,
    tsbStatus,
    weekPlan,
    lthr,
    hrZoneBounds,
    powerPctToHR,
    streak,
    tssImpact,
    weekLoadData,
    overtrainingRisk,
    typeCountWarning,
    todaySleepQuality,
    dailySteps,
    goalType, setGoalType,
    activeFocus, setActiveFocus,
  };
}
