import { useState, useEffect, useMemo } from 'react';
import type { Exercise, TemplateSet, TemplateExercise, Template, WorkoutExerciseLog, Workout, PMCPoint } from './types';
import { predictProgressiveOverload, predictAutoregWeight, trainAutoregModel, kratosAutoregModel, buildAutoregFeatureVector, computeAutoregRestRatio, computeAutoregE1RMTarget, HrvAnsTracker, AcwrForecaster, ExtensionSessionGate, ZenithStatusPill, ZenithHeroStat, ZenithPageHeader, ZenithHeaderTab, ZenithEmptyState, ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE, computePMC, buildTrainingLoadPool, interpretTSB, tsbContext, toDateKey, toDateKeyFromDate, zenithConfirm, fetchSoreness, saveSoreness, sorenessAdjustment, overallSoreness, SORENESS_GROUPS, SEVERITY_LABELS, SEVERITY_DESCRIPTIONS, Severity, toKg } from '@zenith/shared';
import { supabase } from './utils/supabaseClient';
import {
  Dumbbell,
  LayoutDashboard,
  FileText,
  Settings,
  Activity,
  Heart,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  TrendingUp,
  Info,
  Calendar,
  Sparkles,
  ListChecks,
  NotebookText,
  BarChart3
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  ComposedChart
} from 'recharts';
import { buildExerciseSessions, analyseAllExercises, compareToPreviousSession, TREND_WINDOW } from './utils/progression';

// Type Definitions
export default function App() {
  // Session & Authentication
  const [session, setSession] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'routines' | 'exercises' | 'logs' | 'download' | 'hypertrophy'>('dashboard');

  // Database State
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [latestBodyweight, setLatestBodyweight] = useState<number>(80.0);
  const [measurements, setMeasurements] = useState<any[]>([]);

  // Workout edit form states
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [isWorkoutModalOpen, setIsWorkoutModalOpen] = useState(false);
  const [workoutForm, setWorkoutForm] = useState<{
    name: string;
    completed_at: string;
    started_at: string;
    sets: WorkoutExerciseLog[];
  }>({
    name: '',
    completed_at: '',
    started_at: '',
    sets: []
  });

  // PMC & AI calculations
  const [currentPMC, setCurrentPMC] = useState<{ ctl: number; atl: number; tsb: number }>({ ctl: 0, atl: 0, tsb: 0 });
  const [aiStressConfig, setAiStressConfig] = useState<{ zScore: number; factor: number; avgAtl: number; stdDevAtl: number }>({ zScore: 0, factor: 1.0, avgAtl: 0, stdDevAtl: 10.0 });
  const [_profile, setProfile] = useState<any>(null);
  const [todaySleepQuality, setTodaySleepQuality] = useState<number | null>(null);
  const [todaySteps, setTodaySteps] = useState<number | null>(null);
  const [ansIntensityMultiplier, setAnsIntensityMultiplier] = useState<number>(1.0);

  // Which muscles the athlete says are sore today. The only local recovery signal
  // in the ecosystem - weekly tonnage cannot tell a fresh chest from one still
  // wrecked from Monday. See shared/services/soreness.ts.
  const [todaySoreness, setTodaySoreness] = useState<Record<string, Severity>>({});
  const [sorenessLoaded, setSorenessLoaded] = useState(false);
  const [savingSoreness, setSavingSoreness] = useState(false);
  const [ansToneInsight, setAnsToneInsight] = useState<string>('');
  const [todayAcwr, setTodayAcwr] = useState<number>(1.0);
  const [isDeloadAccepted, setIsDeloadAccepted] = useState<boolean>(false);
  const [baselineWorkoutFormSets, setBaselineWorkoutFormSets] = useState<any[]>([]);
  const [sleepLogs, setSleepLogs] = useState<any[]>([]);

  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [exerciseForm, setExerciseForm] = useState<Partial<Exercise>>({
    name: '',
    category: 'Chest',
    notes: '',
    increment_weight: 2.5,
    increment_per_side: false,
    is_bodyweight: false,
    default_rir: 2,
    weight_unit: 'kg'
  });

  // UI state - Routine Builder
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateExercises, setTemplateExercises] = useState<TemplateExercise[]>([]);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');

  // UI state - Dashboard
  const [dashboardMetric, setDashboardMetric] = useState<'volume' | 'sets'>('volume');
  const [selectedExercise1RM, setSelectedExercise1RM] = useState<string>('');
  const [selectedCircumference, setSelectedCircumference] = useState<string>('biceps_l_cm');

  // 1. Hash-based login handler & regular check
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        }).then(({ data, error }) => {
          if (!error && data.session) {
            setSession(data.session);
            window.history.replaceState(null, '', window.location.pathname);
          }
          setLoadingSession(false);
        });
        return;
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Load data from Supabase

  const retrainAutoregModel = async (
    uid: string,
    historyWorkouts: any[],
    exList: Exercise[],
    sleepHistory: any[]
  ) => {
    try {
      const sorted = [...historyWorkouts].sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());
      if (sorted.length === 0) return;

      // Persisted "trained up to" cursor: only replay sets logged since the last
      // successful retrain instead of the FULL history on every login. Without this,
      // opening the app N times replays all historical sets through 50 SGD epochs
      // each time, over-amplifying whatever the data already showed.
      const { data: cursorRow } = await supabase
        .from('ml_weights')
        .select('weights')
        .eq('user_id', uid)
        .eq('model_name', kratosAutoregModel.modelName)
        .maybeSingle();
      const lastTrainedAtMs = cursorRow?.weights?._retrainedUpTo
        ? new Date(cursorRow.weights._retrainedUpTo).getTime()
        : 0;

      const newWorkouts = sorted.filter(w => new Date(w.completed_at).getTime() > lastTrainedAtMs);
      if (newWorkouts.length === 0) return;

      // Per-day sleep quality lookup so the sleep-quality feature reflects the
      // athlete's actual recovery state on the day of each historical set,
      // matching what live inference feeds the model.
      const sleepQualityByDay = new Map<string, number>();
      for (const s of sleepHistory) {
        if (!s.logged_at) continue;
        const key = toDateKey(new Date(s.logged_at).getTime());
        sleepQualityByDay.set(key, Number(s.quality_score ?? 80));
      }

      const exerciseDefaultRir = new Map(exList.map(e => [e.id, e.default_rir ?? 2]));
      const trainingPairs: { x: number[]; y: number }[] = [];

      for (const w of newWorkouts) {
        if (!w.sets || !Array.isArray(w.sets)) continue;
        const dayKey = w.completed_at ? toDateKey(new Date(w.completed_at).getTime()) : '';
        const sleepQualityForDay = sleepQualityByDay.get(dayKey) ?? 80;

        for (const exLog of w.sets) {
          if (!exLog.sets || exLog.sets.length < 2) continue;
          const targetRir = exerciseDefaultRir.get(exLog.exercise_id) ?? 2;

          for (let i = 1; i < exLog.sets.length; i++) {
            const prev = exLog.sets[i - 1];
            const curr = exLog.sets[i];
            if (prev.type === 'warmup' || curr.type === 'warmup') continue;
            if (!prev.weight || !prev.reps || !curr.weight || !curr.reps) continue;

            // Build the EXACT same 6-dimensional feature vector (same dimensions,
            // scaling, and sleep-quality inclusion) that live inference and online
            // training use, via the single shared builder — so the persisted
            // weights are never trained on one feature distribution and served on
            // an incompatible one.
            const rirDelta = (prev.rir ?? targetRir) - targetRir;
            const restRatio = computeAutoregRestRatio(prev.rest_seconds ?? 90, 120);
            const x = buildAutoregFeatureVector(i - 1, prev.weight, prev.reps, rirDelta, restRatio, sleepQualityForDay);
            const target = computeAutoregE1RMTarget(curr.weight, curr.reps, curr.rir ?? targetRir);
            trainingPairs.push({ x, y: target });
          }
        }
      }

      const newCursor = newWorkouts[newWorkouts.length - 1].completed_at;

      if (trainingPairs.length === 0) {
        // Nothing trainable among the new workouts (e.g. all single-set sessions),
        // but still advance the cursor so we don't keep re-scanning the same
        // already-seen workouts on every future login.
        if (cursorRow?.weights) {
          await supabase.from('ml_weights').upsert({
            user_id: uid,
            model_name: kratosAutoregModel.modelName,
            weights: { ...cursorRow.weights, _retrainedUpTo: newCursor },
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,model_name' });
        }
        return;
      }

      await kratosAutoregModel.loadFromSupabase(supabase, uid);
      const lr = 0.05;
      for (let epoch = 0; epoch < 50; epoch++) {
        // Fisher-Yates shuffle (unbiased) instead of sort-by-random-comparator.
        for (let i = trainingPairs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [trainingPairs[i], trainingPairs[j]] = [trainingPairs[j], trainingPairs[i]];
        }
        for (const pair of trainingPairs) {
          // Train locally (synchronous, no network call) for every sample/epoch;
          // only the final result needs to be persisted to Supabase.
          kratosAutoregModel.trainLocal(pair.x, [pair.y], lr);
        }
      }

      // Persist weights AND the advanced "trained up to" cursor together.
      await supabase.from('ml_weights').upsert({
        user_id: uid,
        model_name: kratosAutoregModel.modelName,
        weights: {
          W1: kratosAutoregModel.W1,
          B1: kratosAutoregModel.B1,
          W2: kratosAutoregModel.W2,
          B2: kratosAutoregModel.B2,
          _retrainedUpTo: newCursor
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,model_name' });

      if (import.meta.env.DEV) console.log("Kratos Autoreg model retrained with", trainingPairs.length, "new samples since", new Date(lastTrainedAtMs).toISOString());
    } catch (err) {
      console.error("Retrain error:", err);
    }
  };

  const fetchData = async () => {
    if (!session?.user?.id) return;
    const uid = session.user.id;

    const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    // Workout and ride history were fetched in full on every mount. Everything
    // downstream (PMC's 42-day CTL window, ACWR, the 14-day CNS chart, "previous
    // set" lookups) only reaches back months at most, so a long-tenured user was
    // paying to download years of rows on each load. A year covers every consumer
    // with room to spare.
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;

    // All of these reads are independent of each other. The separate "latest sleep
    // log" query that used to run here (for todaySleepQuality) was a pure duplicate
    // of the 90-day sleep query below — today's log is always within the last 90
    // days for an actively-syncing user — so it's now derived client-side instead of
    // hitting the DB twice. Batched in groups of 3 rather than fired all 10 at once
    // or run fully sequentially: this project's Supabase compute tier has been
    // observed to time out otherwise-trivial queries under a full simultaneous
    // burst, while 10 fully sequential round trips made mount noticeably slow.
    const chunk = <T,>(arr: T[], size: number): T[][] =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

    const queries = [
      () => supabase.from('kratos_exercises').select('*').eq('user_id', uid).eq('deleted', false),
      () => supabase.from('kratos_templates').select('*').eq('user_id', uid),
      () => supabase.from('kratos_workouts').select('*').eq('user_id', uid).gte('completed_at', oneYearAgo).order('completed_at', { ascending: false }),
      () => supabase.from('vigor_weight').select('weight').eq('user_id', uid).order('logged_at', { ascending: false }).limit(1),
      () => supabase.from('vigor_body_measurements').select('*').eq('user_id', uid).order('logged_at', { ascending: true }),
      () => supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      () => supabase.from('vigor_steps').select('step_count, logged_at').eq('user_id', uid).gte('logged_at', twentyEightDaysAgo).order('logged_at', { ascending: true }),
      () => supabase.from('rides').select('date, metadata').eq('user_id', uid).gte('date', oneYearAgoMs).order('date', { ascending: true }),
      () => supabase.from('vigor_sleep').select('logged_at, duration_minutes, quality_score, hrv_ms').eq('user_id', uid).gte('logged_at', ninetyDaysAgo).order('logged_at', { ascending: true }),
      () => supabase.from('vigor_profile').select('target_sleep_hours').eq('user_id', uid).maybeSingle(),
    ];

    const results: any[] = [];
    for (const batch of chunk(queries, 3)) {
      results.push(...await Promise.all(batch.map(q => q())));
    }

    // Every one of these used to destructure `data` only. A failing query (RLS
    // denial, timeout, network blip) then looked exactly like "this user has no
    // data": the UI silently rendered stale or empty state with nothing logged
    // and no way for the user to tell the difference.
    const queryNames = [
      'kratos_exercises', 'kratos_templates', 'kratos_workouts', 'vigor_weight',
      'vigor_body_measurements', 'profiles', 'vigor_steps', 'rides',
      'vigor_sleep', 'vigor_profile',
    ];
    const failed = results
      .map((r, i) => (r?.error ? queryNames[i] : null))
      .filter((n): n is string => n !== null);
    if (failed.length > 0) {
      results.forEach((r, i) => {
        if (r?.error) console.error(`Kratos fetchData: ${queryNames[i]} query failed:`, r.error);
      });
      setLoadError(
        failed.length === queryNames.length
          ? "Couldn't load your training data. Check your connection and try again."
          : `Some data couldn't be loaded (${failed.join(', ')}). What you see may be incomplete.`
      );
    } else {
      setLoadError(null);
    }

    const [
      { data: exData },
      { data: tempData },
      { data: woData },
      { data: weightData },
      { data: bMeasData },
      { data: profData },
      { data: stepsDataAll },
      { data: rideData },
      { data: sleepDataAll },
      { data: vigorProfile },
    ] = results;

    if (exData) setExercises(exData);
    if (tempData) setTemplates(tempData);

    let localWorkouts: Workout[] = [];
    if (woData) {
      setWorkouts(woData);
      localWorkouts = woData;
    }

    if (weightData && weightData.length > 0) {
      setLatestBodyweight(Number(weightData[0].weight));
    }

    if (bMeasData) {
      setMeasurements(bMeasData);
    }

    if (profData) setProfile(profData);

    if (stepsDataAll && stepsDataAll.length > 0) {
      const dailyLoads = stepsDataAll.map((st: any) => Math.round((st.step_count || 5000) / 100));
      const workloadInsight = AcwrForecaster.calculateWorkloadInsight(dailyLoads);
      setTodayAcwr(workloadInsight.acwr);
      const latestSteps = stepsDataAll[stepsDataAll.length - 1];
      if (latestSteps) {
        setTodaySteps(Number(latestSteps.step_count));
      }
      if (import.meta.env.DEV) console.log("[ZenithKratos] SOTA ML ACWR Workload calculated:", workloadInsight.acwr);
    }

    const targetSleep = Number(vigorProfile?.target_sleep_hours ?? 8.0);

    if (sleepDataAll && sleepDataAll.length > 0) {
      setTodaySleepQuality(Number(sleepDataAll[sleepDataAll.length - 1].quality_score ?? 0));
      setSleepLogs(sleepDataAll);

      // ANS/HRV readiness state must come from a REAL wearable rMSSD reading
      // (vigor_sleep.hrv_ms, synced via Zenith Pulse / Health Connect or a paired
      // smart ring) — never fabricated from the sleep quality score. If no real
      // reading exists yet for this user, we do not silently invent one; the
      // dashboard banner below falls back to an honest "connect a wearable" prompt
      // and training targets stay unscaled (ansIntensityMultiplier = 1.0).
      const realHrvSleeps = sleepDataAll.filter((s: any) => typeof s.hrv_ms === 'number' && s.hrv_ms > 0);
      if (realHrvSleeps.length > 0) {
        const hrvHistory = realHrvSleeps.slice(0, -1).map((s: any) => s.hrv_ms as number);
        const todayHrvVal = realHrvSleeps[realHrvSleeps.length - 1].hrv_ms as number;
        const ansState = HrvAnsTracker.calculateAnsState(hrvHistory, todayHrvVal);
        setAnsIntensityMultiplier(ansState.intensityMultiplier);
        setAnsToneInsight(ansState.insight);
        if (import.meta.env.DEV) console.log("[ZenithKratos] HRV ANS Tone Multiplier loaded from real wearable data:", ansState.intensityMultiplier);
      } else {
        setAnsIntensityMultiplier(1.0);
        setAnsToneInsight('');
      }
    }

    if (rideData) {
      computeCombinedStress(rideData, localWorkouts, sleepDataAll || [], targetSleep);
    }

    if (localWorkouts.length > 0) {
      retrainAutoregModel(uid, localWorkouts, exData || [], sleepDataAll || []);
    }
  };

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session]);

  // 3. AI Cardio Stress calculations (ATL Z-score & Sleep Deficit & Strength TSS)
  const computeCombinedStress = (
    rideData: any[],
    woData: Workout[],
    sleepData: any[],
    targetSleep: number
  ) => {
    if (rideData.length === 0 && woData.length === 0) return;

    // Parse Cycling TSS
    const parsedRides = rideData.map(r => {
      let witha = r.metadata;
      if (typeof witha === 'string') {
        try { witha = JSON.parse(witha); } catch { witha = {}; }
      }
      return {
        date: Number(r.date),
        tss: Number(witha?.tss ?? witha?.hrTSS ?? 0)
      };
    });

    // Built by the shared pool, so Kratos's Form numbers genuinely cannot drift
    // from Aero's and Hub's. Using the same PMC calculator was never enough on its
    // own - the three apps agreed on the Banister model and then fed it three
    // different conversions from a gym session to a load number, so on the same
    // day they showed TSB -8, -12 and -9.
    //
    // What is given up here is calculateWorkoutTSS, now removed. It scaled each
    // set against the athlete's estimated 1RM for that exercise and applied its
    // own small RIR discount - so it was the one conversion of the three that
    // already knew effort existed, though at 5% per rep in reserve it barely
    // moved the number. Relative intensity is a better idea than kilos moved, but
    // it needs the exercise catalogue, which Aero and Hub do not load, so it
    // cannot be the shared definition today. Folding relative intensity together
    // with the RIR weighting is the obvious next improvement.
    const combinedTssList = buildTrainingLoadPool(
      { rides: parsedRides, kratosWorkouts: woData },
      'all'
    );

    // Group Sleep logs by Day
    const sleepPerDay = new Map<string, { duration: number; quality: number }>();
    for (const s of sleepData) {
      const key = toDateKey(new Date(s.logged_at).getTime());
      sleepPerDay.set(key, {
        duration: Number(s.duration_minutes || 0) / 60.0,
        quality: Number(s.quality_score ?? 0)
      });
    }

    const pmcPoints = computePMC(combinedTssList);
    if (pmcPoints.length === 0) return;

    // Sleep deficit isn't part of the shared PMC model, so it's attached
    // per-day here for the Z-score/ATL baseline calculation below.
    const points: PMCPoint[] = pmcPoints.map(p => {
      const key = toDateKey(p.date);
      const sleep = sleepPerDay.get(key);
      const sleepDeficit = sleep ? Math.max(0, targetSleep - sleep.duration) : 0;
      return { date: p.date, ctl: p.ctl, atl: p.atl, tsb: p.tsb, sleepDeficit };
    });

    // Latest PMC values
    if (points.length > 0) {
      const latest = points[points.length - 1];
      setCurrentPMC({
        ctl: Math.round(latest.ctl),
        atl: Math.round(latest.atl),
        tsb: Math.round(latest.tsb)
      });

      // Calculate baseline: average and std dev of ATL over last 90 days
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const recentPoints = points.filter(p => p.date >= cutoff);
      
      if (recentPoints.length > 0) {
        const atls = recentPoints.map(p => p.atl);
        const avg = atls.reduce((sum, val) => sum + val, 0) / atls.length;
        const variance = atls.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / atls.length;
        const stdDev = Math.max(Math.sqrt(variance), 10.0);

        // Calculate Z-Score based on fatigue
        let zScore = (latest.atl - avg) / stdDev;

        // Factor in Sleep Deficit linearly (+0.5 per hour of deficit)
        if (latest.sleepDeficit && latest.sleepDeficit > 0) {
          zScore += 0.5 * latest.sleepDeficit;
        }

        // Capped at 2.0 to match the Android app's calculateCardioStressFactor
        // (WorkoutRepository.kt) — uncapped here, an extreme z-score could
        // roughly double or more the recommended rest time on web while the
        // Android app's own factor levels off at 2x.
        const factor = zScore > 1.0 ? Math.min(2.0, 1.0 + 0.15 * zScore) : 1.0;

        setAiStressConfig({
          zScore: Math.round(zScore * 100) / 100,
          factor: Math.round(factor * 100) / 100,
          avgAtl: Math.round(avg),
          stdDevAtl: Math.round(stdDev)
        });
      }
    }
  };

  // Autoregulation 2.0 helper
  const computeAutoregRecommendation = (
    setIndex: number,
    prevWeight: number,
    prevReps: number,
    prevRir: number,
    targetReps: number,
    targetRir: number,
    stepWeight: number,
    isPerSide: boolean,
    restSeconds: number = 120,
    recommendedRestSeconds: number = 120,
    hardMinWeight?: number,
    hardMaxWeight?: number,
    // Optional so the existing window.kratosAutoreg2 bridge keeps working
    // unchanged; a caller that knows what the exercise trains gets the soreness
    // hold-back, one that does not is unaffected.
    primaryMuscle?: string | null,
    secondaryMuscles?: string[] | null
  ) => {
    const rawRec = predictAutoregWeight(
      setIndex,
      prevWeight,
      prevReps,
      prevRir,
      restSeconds,
      targetReps,
      targetRir,
      stepWeight,
      isPerSide,
      recommendedRestSeconds,
      todaySleepQuality || 80,
      hardMinWeight,
      hardMaxWeight
    );

    // Scale by SOTA HRV Autonomic Tone multiplier, then re-apply the hard equipment
    // limits since this multiplier is applied after predictAutoregWeight's own clamp.
    // Whole-body autonomic tone, then local soreness. Both hold weight back, and
    // they answer different questions: the first is "how is the athlete today", the
    // second is "how is THIS muscle today". A chest still wrecked from Monday is
    // invisible to every other signal the app has.
    const sore = sorenessAdjustment(todaySoreness, primaryMuscle, secondaryMuscles);
    let scaledRec = rawRec * ansIntensityMultiplier * sore.multiplier;
    if (hardMinWeight != null) scaledRec = Math.max(scaledRec, hardMinWeight);
    if (hardMaxWeight != null) scaledRec = Math.min(scaledRec, hardMaxWeight);

    // Snap target back to the hardware equipment's weight steps (e.g. 0.5kg or 2.5kg
    // steps), anchored to hardMinWeight (the stack's actual lowest pin) when known
    // rather than to prevWeight, which may itself be an off-grid warmup weight - see
    // the matching comment in predictAutoregWeight for why that matters.
    const validStep = Math.max(0.25, stepWeight);

    // Snapping rounds to the NEAREST step, so it can round back up past
    // hardMaxWeight (by up to half a step) after the clamp above - enough to
    // recommend a weight beyond a machine's physical stack. Re-apply the
    // equipment limits to the final snapped total, stepping inward to the last
    // legal notch rather than just truncating to the raw limit (which would
    // itself usually be off-grid).
    const applyHardLimits = (total: number): number => {
      let result = total;
      if (hardMaxWeight != null && result > hardMaxWeight) {
        const anchor = hardMinWeight ?? 0;
        const stepTotal = isPerSide ? validStep * 2.0 : validStep;
        const stepsDown = Math.floor((hardMaxWeight - anchor) / stepTotal);
        const snappedMax = anchor + stepsDown * stepTotal;
        result = snappedMax >= (hardMinWeight ?? 0) ? snappedMax : hardMaxWeight;
      }
      if (hardMinWeight != null && result < hardMinWeight) result = hardMinWeight;
      return result;
    };

    if (isPerSide) {
      const perSideRaw = scaledRec / 2.0;
      const gridAnchor = hardMinWeight != null ? hardMinWeight / 2.0 : (prevWeight > 0 ? prevWeight / 2.0 : 0);
      const diff = perSideRaw - gridAnchor;
      const snappedPerSide = gridAnchor + Math.round(diff / validStep) * validStep;
      return applyHardLimits(Math.max(validStep * 2.0, snappedPerSide * 2.0));
    } else {
      const gridAnchor = hardMinWeight ?? (prevWeight > 0 ? prevWeight : 0);
      const diff = scaledRec - gridAnchor;
      const snapped = gridAnchor + Math.round(diff / validStep) * validStep;
      return applyHardLimits(Math.max(validStep, snapped));
    }
  };

  // Autoregulation 2.0 online training helper
  const trainAutoreg = async (
    setIndex: number,
    prevWeight: number,
    prevReps: number,
    prevRir: number,
    targetRir: number,
    restSeconds: number,
    recommendedRestSeconds: number,
    actualNextWeight: number,
    actualNextReps: number,
    actualNextRir: number
  ) => {
    if (!session?.user?.id) return;
    await trainAutoregModel(
      supabase,
      session.user.id,
      setIndex,
      prevWeight,
      prevReps,
      prevRir,
      targetRir,
      restSeconds,
      recommendedRestSeconds,
      actualNextWeight,
      actualNextReps,
      actualNextRir,
      todaySleepQuality || 80
    );
  };

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    (async () => {
      const rows = await fetchSoreness(supabase, uid, 30);
      setTodaySoreness(rows[toDateKeyFromDate(new Date())]?.groups ?? {});
      setSorenessLoaded(true);
    })();
  }, [session?.user?.id]);

  useEffect(() => {
    (window as any).kratosAutoreg2 = {
      compute: computeAutoregRecommendation,
      train: trainAutoreg,
      // So a caller can explain a held-back suggestion rather than just showing a
      // lower number with no reason attached.
      sorenessReason: (primaryMuscle?: string | null, secondaryMuscles?: string[] | null) =>
        sorenessAdjustment(todaySoreness, primaryMuscle, secondaryMuscles).reason
    };
  }, [todaySleepQuality, session?.user?.id, todaySoreness, ansIntensityMultiplier]);

  // Unified fatigue detection & rest extension computation for Cross-Talk and PMC widget
  const isSleepFatigued = !!(todaySleepQuality && todaySleepQuality < 75);
  const isStepsFatigued = !!(todaySteps && todaySteps > 12000);
  const isCardioFatigued = !!(currentPMC && currentPMC.tsb < -10);
  const isZScoreFatigued = !!(aiStressConfig && aiStressConfig.factor > 1.0);

  const isAnyFatigueDetected = isSleepFatigued || isStepsFatigued || isCardioFatigued || isZScoreFatigued;

  const fatigueSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (isSleepFatigued) parts.push(`Sleep: ${todaySleepQuality}%`);
    if (isStepsFatigued) parts.push(`Steps: ${todaySteps?.toLocaleString('en-US')}`);
    if (isCardioFatigued) parts.push(`TSB: ${currentPMC.tsb}`);
    if (isZScoreFatigued && !isCardioFatigued) parts.push(`Z-Score: +${aiStressConfig.zScore}`);
    return parts.join(', ');
  }, [isSleepFatigued, isStepsFatigued, isCardioFatigued, isZScoreFatigued, todaySleepQuality, todaySteps, currentPMC, aiStressConfig]);

  const restTimerExtensionPct = useMemo(() => {
    let extra = 0;
    if (isSleepFatigued) extra += Math.round((75 - (todaySleepQuality || 75)) * 1.5);
    if (isStepsFatigued) extra += 10;
    if (isCardioFatigued) extra += Math.min(25, Math.abs((currentPMC?.tsb || 0) + 10));
    if (isZScoreFatigued) extra += Math.round((aiStressConfig.factor - 1) * 100);
    return Math.max(15, extra);
  }, [isSleepFatigued, isStepsFatigued, isCardioFatigued, isZScoreFatigued, todaySleepQuality, currentPMC, aiStressConfig]);

  // Form (TSB) status for the hero stat card — same shared interpretation
  // Aero and Hub use, so the same TSB value reads the same way everywhere.
  const tsbStatus = useMemo(() => interpretTSB(currentPMC.tsb), [currentPMC.tsb]);
  const tsbContextText = useMemo(() => tsbContext(currentPMC.tsb), [currentPMC.tsb]);

  // Helper for exercise name resolution
  const exerciseMap = useMemo(() => {
    return new Map(exercises.map(e => [e.id, e]));
  }, [exercises]);

  // 4. Exercise Manager Actions
  const handleSaveExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id || !exerciseForm.name) return;

    if (
      exerciseForm.min_weight != null &&
      exerciseForm.max_weight != null &&
      Number(exerciseForm.min_weight) > Number(exerciseForm.max_weight)
    ) {
      alert("Min Weight can't be greater than Max Weight.");
      return;
    }

    const payload = {
      name: exerciseForm.name,
      category: exerciseForm.category,
      primary_muscle: exerciseForm.primary_muscle || (
        exerciseForm.category === 'Shoulders' ? 'deltoids' :
        exerciseForm.category === 'Chest' ? 'chest' :
        exerciseForm.category === 'Quads' ? 'quadriceps' :
        exerciseForm.category === 'Hamstrings' ? 'hamstring' :
        exerciseForm.category === 'Calves' ? 'calves' :
        exerciseForm.category === 'Glutes' ? 'gluteal' :
        exerciseForm.category === 'Biceps' ? 'biceps' :
        exerciseForm.category === 'Triceps' ? 'triceps' :
        exerciseForm.category === 'Abs' ? 'abs' :
        exerciseForm.category === 'Obliques' ? 'obliques' :
        exerciseForm.category === 'Lower Back' ? 'lowerBack' :
        exerciseForm.category === 'Traps' ? 'trapezius' :
        exerciseForm.category === 'Forearms' ? 'forearm' :
        'upperBack'
      ),
      secondary_muscles: exerciseForm.secondary_muscles || [],
      notes: exerciseForm.notes,
      increment_weight: Number(exerciseForm.increment_weight || 2.5),
      increment_per_side: !!exerciseForm.increment_per_side,
      min_weight: exerciseForm.min_weight != null ? Number(exerciseForm.min_weight) : null,
      max_weight: exerciseForm.max_weight != null ? Number(exerciseForm.max_weight) : null,
      is_bodyweight: !!exerciseForm.is_bodyweight,
      default_rir: Number(exerciseForm.default_rir || 2),
      weight_unit: exerciseForm.weight_unit || 'kg',
      user_id: session.user.id
    };

    if (editingExercise) {
      // Update
      const { error } = await supabase
        .from('kratos_exercises')
        .update(payload)
        .eq('id', editingExercise.id)
        .eq('user_id', session.user.id);
      
      if (!error) {
        setEditingExercise(null);
        setIsExerciseModalOpen(false);
        fetchData();
      } else {
        alert("Error saving exercise: " + error.message);
      }
    } else {
      // Create
      const { error } = await supabase
        .from('kratos_exercises')
        .insert([payload]);
      
      if (!error) {
        setIsExerciseModalOpen(false);
        fetchData();
      } else {
        alert("Error creating exercise: " + error.message);
      }
    }
  };

  const handleEditExerciseClick = (ex: Exercise) => {
    setEditingExercise(ex);
    setExerciseForm({
      ...ex,
      secondary_muscles: Array.isArray(ex.secondary_muscles) ? ex.secondary_muscles : []
    });
    setIsExerciseModalOpen(true);
  };

  const handleDeleteExercise = async (id: string) => {
    if (!await zenithConfirm("Are you sure you want to delete this exercise?")) return;
    const { error } = await supabase
      .from('kratos_exercises')
      .update({ deleted: true })
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (!error) fetchData();
  };

  const handleDeleteWorkout = async (id: string) => {
    if (!await zenithConfirm("Are you sure you want to delete this workout from the logbook?")) return;
    const { error } = await supabase
      .from('kratos_workouts')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (!error) {
      fetchData();
    } else {
      alert("Error deleting: " + error.message);
    }
  };

  const handleEditWorkoutClick = (w: Workout) => {
    setEditingWorkout(w);
    const parsedSets = JSON.parse(JSON.stringify(w.sets));
    setWorkoutForm({
      name: w.name,
      completed_at: new Date(new Date(w.completed_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      started_at: new Date(new Date(w.started_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      sets: parsedSets
    });
    setBaselineWorkoutFormSets(JSON.parse(JSON.stringify(parsedSets)));
    setIsDeloadAccepted(w.name.endsWith(' (Deload)'));
    setIsWorkoutModalOpen(true);
  };

  const handleAcceptDeload = () => {
    setIsDeloadAccepted(true);
    const updatedSets = baselineWorkoutFormSets.map(exLog => {
      const ex = exercises.find(e => e.id === exLog.exercise_id);
      const step = ex?.increment_weight || 2.5;
      const isPerSide = ex?.increment_per_side || false;

      const workingSets = exLog.sets.filter((s: any) => s.type === 'working');
      const warmups = exLog.sets.filter((s: any) => s.type === 'warmup');
      
      const newWorkingCount = Math.max(1, Math.round(workingSets.length * 0.5));
      const keptWorking = workingSets.slice(0, newWorkingCount).map((s: any) => {
        const rawWeight = s.weight * 0.70;
        let deloadWeight = rawWeight;
        
        // Snap to valid hardware increment relative to previous weight
        const validStep = Math.max(0.25, step);
        const prevWeightVal = s.weight; // previous set weight
        if (isPerSide) {
          const perSideRaw = rawWeight / 2.0;
          const perSidePrev = prevWeightVal > 0 ? prevWeightVal / 2.0 : 0;
          const diff = perSideRaw - perSidePrev;
          const snappedPerSide = perSidePrev + Math.round(diff / validStep) * validStep;
          deloadWeight = Math.max(validStep * 2.0, snappedPerSide * 2.0);
        } else {
          const prevW = prevWeightVal > 0 ? prevWeightVal : 0;
          const diff = rawWeight - prevW;
          const snapped = prevW + Math.round(diff / validStep) * validStep;
          deloadWeight = Math.max(validStep, snapped);
        }

        if (ex?.min_weight != null) deloadWeight = Math.max(deloadWeight, ex.min_weight);

        return {
          ...s,
          weight: deloadWeight,
          rir: 4 // low intensity RPE 6
        };
      });
      return {
        ...exLog,
        sets: [...warmups, ...keptWorking]
      };
    });
    setWorkoutForm(prev => ({
      ...prev,
      name: prev.name.endsWith(' (Deload)') ? prev.name : prev.name + ' (Deload)',
      sets: updatedSets
    }));
  };

  const handleDeclineDeload = () => {
    setIsDeloadAccepted(false);
    setWorkoutForm(prev => ({
      ...prev,
      name: prev.name.replace(' (Deload)', ''),
      sets: JSON.parse(JSON.stringify(baselineWorkoutFormSets))
    }));
  };

  const handleSaveWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkout) return;

    let newVolume = 0;
    workoutForm.sets.forEach(exLog => {
      const ex = exercises.find(e => e.id === exLog.exercise_id);
      const isBodyweight = ex ? !!ex.is_bodyweight : false;
      
      exLog.sets.forEach(s => {
        if (s.type === 'working') {
          const reps = Number(s.reps || 0);
          // Converted to kg before summing. Volume used to add a 100 lb stack as
          // 100, identical to 100 kg, which inflated stored tonnage by 79-111% per
          // session on a mixed metric/imperial gym floor - and that figure feeds the
          // recovery model, the PMC and the weekly total.
          const addedKg = toKg(Number(s.weight || 0), ex?.weight_unit);
          const effectiveKg = isBodyweight ? (latestBodyweight + addedKg) : addedKg;
          newVolume += effectiveKg * reps;
        }
      });
    });

    const payload = {
      name: workoutForm.name,
      started_at: new Date(workoutForm.started_at).toISOString(),
      completed_at: new Date(workoutForm.completed_at).toISOString(),
      sets: workoutForm.sets,
      volume: newVolume
    };

    const { error } = await supabase
      .from('kratos_workouts')
      .update(payload)
      .eq('id', editingWorkout.id)
      .eq('user_id', session.user.id);

    if (!error) {
      setIsWorkoutModalOpen(false);
      setEditingWorkout(null);
      fetchData();
    } else {
      alert("Error saving: " + error.message);
    }
  };

  const handleAddExerciseToLog = (exerciseId: string) => {
    if (!exerciseId) return;
    if (workoutForm.sets.some(s => s.exercise_id === exerciseId)) {
      alert("This exercise is already in this workout!");
      return;
    }
    const newExLog: WorkoutExerciseLog = {
      exercise_id: exerciseId,
      sets: [
        { type: 'working', weight: 0, reps: 0, rir: 2 }
      ]
    };
    setWorkoutForm({
      ...workoutForm,
      sets: [...workoutForm.sets, newExLog]
    });
  };

  const handleRemoveExerciseFromLog = async (exIdx: number) => {
    if (!await zenithConfirm("Are you sure you want to delete this exercise from the workout?")) return;
    const updated = [...workoutForm.sets];
    updated.splice(exIdx, 1);
    setWorkoutForm({ ...workoutForm, sets: updated });
  };

  const handleAddSetToLog = (exIdx: number) => {
    const updated = [...workoutForm.sets];
    const lastSet = updated[exIdx].sets[updated[exIdx].sets.length - 1];
    updated[exIdx].sets.push({
      type: lastSet ? lastSet.type : 'working',
      weight: lastSet ? lastSet.weight : 0,
      reps: lastSet ? lastSet.reps : 0,
      rir: lastSet ? lastSet.rir : 2
    });
    setWorkoutForm({ ...workoutForm, sets: updated });
  };

  const handleRemoveSetFromLog = (exIdx: number, sIdx: number) => {
    const updated = [...workoutForm.sets];
    updated[exIdx].sets.splice(sIdx, 1);
    setWorkoutForm({ ...workoutForm, sets: updated });
  };

  // 5. Routine Builder Actions
  const handleSaveTemplate = async () => {
    if (!session?.user?.id || !templateName) return;
    if (templateExercises.length === 0) {
      alert("Add at least one exercise to the template.");
      return;
    }

    const payload = {
      name: templateName,
      exercises: templateExercises,
      user_id: session.user.id
    };

    if (editingTemplate) {
      const { error } = await supabase
        .from('kratos_templates')
        .update(payload)
        .eq('id', editingTemplate.id)
        .eq('user_id', session.user.id);
      
      if (!error) {
        setIsTemplateModalOpen(false);
        setEditingTemplate(null);
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('kratos_templates')
        .insert([payload]);
      
      if (!error) {
        setIsTemplateModalOpen(false);
        fetchData();
      }
    }
  };

  const handleEditTemplateClick = (temp: Template) => {
    setEditingTemplate(temp);
    setTemplateName(temp.name);
    setTemplateExercises(temp.exercises);
    setIsTemplateModalOpen(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!await zenithConfirm("Are you sure you want to delete this template?")) return;
    const { error } = await supabase
      .from('kratos_templates')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (!error) fetchData();
  };

  const addExerciseToTemplate = (exId: string) => {
    // Add exercise with default sets (e.g. 1 warmup, 3 working sets)
    const defaults = exerciseMap.get(exId);
    const defaultRir = defaults?.default_rir ?? 2;
    const newEntry: TemplateExercise = {
      exercise_id: exId,
      sets: [
        { type: 'warmup', min_reps: 10, max_reps: 12, target_rir: 4 },
        { type: 'working', min_reps: 8, max_reps: 10, target_rir: defaultRir },
        { type: 'working', min_reps: 8, max_reps: 10, target_rir: defaultRir },
        { type: 'working', min_reps: 8, max_reps: 10, target_rir: defaultRir }
      ]
    };
    setTemplateExercises([...templateExercises, newEntry]);
    setExerciseSearchQuery('');
  };

  const removeExerciseFromTemplate = (index: number) => {
    const updated = [...templateExercises];
    updated.splice(index, 1);
    setTemplateExercises(updated);
  };

  const addSetToTemplateExercise = (exIndex: number) => {
    const updated = [...templateExercises];
    const sets = updated[exIndex].sets;
    const lastSet = sets[sets.length - 1] || { type: 'working', min_reps: 8, max_reps: 10, target_rir: 2 };
    sets.push({ ...lastSet });
    setTemplateExercises(updated);
  };

  const removeSetFromTemplateExercise = (exIndex: number, setIndex: number) => {
    const updated = [...templateExercises];
    updated[exIndex].sets.splice(setIndex, 1);
    setTemplateExercises(updated);
  };

  const updateTemplateSetField = (exIndex: number, setIndex: number, field: keyof TemplateSet, value: any) => {
    const updated = [...templateExercises];
    updated[exIndex].sets[setIndex] = {
      ...updated[exIndex].sets[setIndex],
      [field]: value
    };
    setTemplateExercises(updated);
  };

  // AI Base Rest Time estimation
  const getAiRestRecommendation = (exId: string) => {
    const ex = exerciseMap.get(exId);
    if (!ex) return '90s';

    // 1. Defaults based on category
    const isCompound = ['Chest', 'Lats', 'Upper Back', 'Quads', 'Hamstrings'].includes(ex.category);
    let baseRest = isCompound ? 120 : 90;

    // 2. Historical performance adaptation
    const exLogs = workouts.map(w => w.sets.find(s => s.exercise_id === exId)).filter(Boolean) as WorkoutExerciseLog[];
    if (exLogs.length >= 2) {
      let totalDropPercentage = 0;
      let countedWorkouts = 0;
      
      for (const log of exLogs) {
        const workingSets = log.sets.filter(s => s.type === 'working');
        if (workingSets.length >= 2) {
          const reps1 = workingSets[0].reps;
          const reps2 = workingSets[1].reps;
          if (reps1 > 0) {
            totalDropPercentage += ((reps1 - reps2) / reps1);
            countedWorkouts++;
          }
        }
      }

      if (countedWorkouts > 0) {
        const avgDrop = totalDropPercentage / countedWorkouts;
        if (avgDrop > 0.20) {
          // Large drop between set 1 and 2, increase rest time
          baseRest += 30;
        }
      }
    }

    // 3. Dynamic wearable & cardio stress scale overrides
    if (todaySleepQuality && todaySleepQuality < 75) {
      baseRest += 20; // Poor sleep -> extra recovery rest
    }
    if (todaySteps && todaySteps > 12000) {
      baseRest += 15; // High daily steps -> extra recovery rest
    }
    if (currentPMC && currentPMC.tsb < -10) {
      baseRest += 20; // High cardio fatigue (negative TSB) -> extra recovery rest
    }

    return `${baseRest}s`;
  };

  // 6. Analytics & Dashboard Data Calculations
  const dashboardChartsData = useMemo(() => {
    if (workouts.length === 0) return [];

    // Group workouts by week
    // key: "Year - WeekNumber"
    const weeklyMap = new Map<string, { [key: string]: number }>();

    for (const w of workouts) {
      const d = new Date(w.completed_at);
      
      // Calculate ISO week
      const dateVal = new Date(d.getTime());
      dateVal.setHours(0, 0, 0, 0);
      dateVal.setDate(dateVal.getDate() + 3 - (dateVal.getDay() + 6) % 7);
      const week1 = new Date(dateVal.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((dateVal.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
      const weekKey = `${dateVal.getFullYear()}-W${weekNum}`;

      const existing = weeklyMap.get(weekKey) ?? {
        Quads: 0, Hamstrings: 0, Calves: 0, Chest: 0, Lats: 0, 'Upper Back': 0, Shoulders: 0, Biceps: 0, Triceps: 0, Abs: 0
      };

      for (const exLog of w.sets) {
        const ex = exerciseMap.get(exLog.exercise_id);
        if (!ex) continue;
        const cat = ex.category;

        if (dashboardMetric === 'volume') {
          // Total Volume Lifted = sum(sets * reps * weight)
          const vol = exLog.sets.reduce((sum, s) => sum + (s.type === 'working' ? (s.weight * s.reps) : 0), 0);
          existing[cat] = (existing[cat] ?? 0) + vol;
        } else {
          // Hard working sets (RIR <= 3)
          const hardSets = exLog.sets.filter(s => s.type === 'working' && s.rir <= 3).length;
          existing[cat] = (existing[cat] ?? 0) + hardSets;
        }
      }

      weeklyMap.set(weekKey, existing);
    }

    // Convert map to Recharts format sorted by key ascending
    return Array.from(weeklyMap.entries())
      .map(([week, metrics]) => ({
        week,
        ...metrics
      }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-8); // Show last 8 weeks
  }, [workouts, exerciseMap, dashboardMetric]);

  // 1RM Calculation & Selection data
  const mainLifts = useMemo(() => {
    // Return top 4 exercises by logged workouts count
    const counts = new Map<string, number>();
    for (const w of workouts) {
      for (const s of w.sets) {
        counts.set(s.exercise_id, (counts.get(s.exercise_id) ?? 0) + 1);
      }
    }

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id]) => id);

    if (sorted.length > 0 && !selectedExercise1RM) {
      setSelectedExercise1RM(sorted[0]);
    }

    return sorted;
  }, [workouts, selectedExercise1RM]);

  // Generate 1RM Sparklines data
  const getSparklineData = (exId: string) => {
    const ex = exerciseMap.get(exId);
    if (!ex) return [];

    const history: { dateStr: string; estimated1RM: number }[] = [];

    // Filter workouts containing this exercise
    const relevantWorkouts = [...workouts].reverse(); // oldest first
    for (const w of relevantWorkouts) {
      const log = w.sets.find(s => s.exercise_id === exId);
      if (log) {
        let maxEst = 0;
        for (const s of log.sets) {
          if (s.type === 'working' && s.reps > 0) {
            const epley1RM = s.weight * (1 + s.reps / 30);
            if (epley1RM > maxEst) maxEst = epley1RM;
          }
        }
        if (maxEst > 0) {
          history.push({
            dateStr: new Date(w.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            estimated1RM: Math.round(maxEst * 2) / 2 // round to nearest 0.5
          });
        }
      }
    }
    return history;
  };

  // Detailed 1RM line chart data
  const detailed1RMData = useMemo(() => {
    if (!selectedExercise1RM) return [];
    return getSparklineData(selectedExercise1RM);
  }, [selectedExercise1RM, workouts]);

  // Whether this user has ANY real wearable HRV reading (vigor_sleep.hrv_ms) yet.
  // Drives both the dashboard ANS banner and the chart below — we only ever plot
  // measured HRV, or an explicitly-labeled sleep-quality ESTIMATE, never a value
  // presented as real HRV without a real reading behind it.
  const hasRealHrvData = useMemo(
    () => sleepLogs.some((s: any) => typeof s.hrv_ms === 'number' && s.hrv_ms > 0),
    [sleepLogs]
  );

  // CNS Readiness vs. Lift Volume Correlation Chart Data (last 14 days)
  const cnsVolumeCorrelationData = useMemo(() => {
    const dataList = [];
    const dateMap = new Map<string, { dateStr: string; volume: number; hrv: number | null }>();

    // Generate dates for the last 14 days
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yyyymmdd = toDateKeyFromDate(d);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      // Always null. A day is filled below only if there is something behind it -
      // a measured HRV reading, or a sleep score to derive the labelled estimate
      // from. Users without a wearable used to get a flat 65 seeded into every day
      // and then partially overwritten, so days with no sleep log at all still drew
      // a confident line at a number nothing had produced.
      dateMap.set(yyyymmdd, { dateStr, volume: 0, hrv: null });
    }

    // 1. Accumulate workout volume per day
    workouts.forEach(w => {
      if (w.completed_at) {
        try {
          const wDate = toDateKey(new Date(w.completed_at).getTime());
          if (dateMap.has(wDate)) {
            const item = dateMap.get(wDate)!;
            item.volume += w.volume || 0;
          }
        } catch (e) {
          console.error("Error parsing workout completed_at date:", e);
        }
      }
    });

    // 2. Populate daily HRV: real hrv_ms when this user has real readings,
    // otherwise an explicitly-labeled sleep-quality-derived ESTIMATE (never
    // presented as measured HRV — see the "CNS Readiness" line name below).
    sleepLogs.forEach((s: any) => {
      if (s.logged_at) {
        try {
          const sDate = toDateKey(new Date(s.logged_at).getTime());
          if (dateMap.has(sDate)) {
            const item = dateMap.get(sDate)!;
            if (hasRealHrvData) {
              if (typeof s.hrv_ms === 'number' && s.hrv_ms > 0) {
                item.hrv = s.hrv_ms;
              }
            } else {
              // `|| 80` would have turned a quality_score of 0 - which means the
              // score was never computed, not that the night was terrible - into an
              // invented above-average night. Same trap as Number(null) being 0.
              const quality = Number(s.quality_score);
              if (Number.isFinite(quality) && quality > 0) {
                const baseVal = 55;
                const offsetVal = (quality - 75) * 0.8;
                item.hrv = Math.round(Math.max(30, Math.min(110, baseVal + offsetVal)));
              }
            }
          }
        } catch (e) {
          console.error("Error parsing sleep logged_at date:", e);
        }
      }
    });

    // Convert map to array sorted chronologically
    for (const [_, val] of dateMap.entries()) {
      dataList.push(val);
    }

    return dataList;
  }, [workouts, sleepLogs, hasRealHrvData]);

  // Loading screen
  if (loadingSession) {
    return (
      <div className="kratos-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
          Initializing Kratos...
        </div>
      </div>
    );
  }

  // Not logged in fallback
  if (!session) {
    return <ExtensionSessionGate appName="Kratos" icon={<Dumbbell size={28} />} />;
  }

  // Minimum paired data points before we show a confident narrative verdict
  // ("Strong Hypertrophic Response" etc). Below this, the raw r is still shown
  // but framed as preliminary — 3-6 points is nowhere near enough to distinguish
  // a real relationship from noise.
  const MIN_CONFIDENT_CORRELATION_N = 7;

  const renderHypertrophyTab = () => {
    // Sort first, then measure volume accumulated PER INTERVAL between
    // consecutive measurements (i.e. training volume logged since the previous
    // measurement date), not cumulative all-time volume. Cumulative volume is
    // monotonically non-decreasing, so correlating it against any trending body
    // measurement produces a spuriously strong |r| regardless of real causation.
    const sortedMeasurements = [...measurements]
      .map(m => ({ ...m, rawDate: new Date(m.logged_at) }))
      .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

    const dataPoints = sortedMeasurements
      .map((m, idx) => {
        const prevDate = idx > 0 ? sortedMeasurements[idx - 1].rawDate : null;
        const intervalVolume = workouts
          .filter(w => {
            const wDate = new Date(w.completed_at);
            return wDate <= m.rawDate && (prevDate === null || wDate > prevDate);
          })
          .reduce((sum, w) => sum + (w.volume || 0), 0);

        return {
          dateStr: m.rawDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
          rawDate: m.rawDate,
          measurement: m[selectedCircumference] !== null ? Number(m[selectedCircumference]) : null,
          volume: intervalVolume
        };
      })
      .filter(d => d.measurement !== null);

    let rValue = 0;
    let rStatus = 'Insufficient Data';
    let rColor = '#94a3b8';
    let rExplanation = 'Log at least 3 body measurements in Vigor to compute correlations.';

    if (dataPoints.length >= 3) {
      const n = dataPoints.length;
      const x = dataPoints.map(d => d.volume);
      const y = dataPoints.map(d => d.measurement!);

      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const avgX = sumX / n;
      const avgY = sumY / n;

      let num = 0;
      let denX = 0;
      let denY = 0;

      for (let i = 0; i < n; i++) {
        const diffX = x[i] - avgX;
        const diffY = y[i] - avgY;
        num += diffX * diffY;
        denX += diffX * diffX;
        denY += diffY * diffY;
      }

      const den = Math.sqrt(denX * denY);
      rValue = den === 0 ? 0 : num / den;

      if (n < MIN_CONFIDENT_CORRELATION_N) {
        // Not enough paired points yet for a confident narrative verdict — show
        // the raw r with an explicit "preliminary" caveat instead.
        rStatus = `Preliminary (n=${n})`;
        rColor = '#94a3b8';
        rExplanation = `r = ${rValue.toFixed(3)} on only ${n} paired measurements. Limited data — treat as preliminary until at least ${MIN_CONFIDENT_CORRELATION_N} paired measurements are logged.`;
      } else if (selectedCircumference === 'waist_cm' || selectedCircumference === 'body_fat_pct') {
        if (rValue <= -0.5) {
          rStatus = 'Strong Recomposition (Perfect!)';
          rColor = 'var(--accent-neon)';
          rExplanation = 'Great! Your body fat percentage/waist circumference is steadily decreasing as your training volume per interval increases.';
        } else if (rValue < 0) {
          rStatus = 'Favorable Trend';
          rColor = '#3b82f6';
          rExplanation = 'Slight decrease in body fat/waist circumference correlated with your training volume.';
        } else {
          rStatus = 'Neutral / Stagnation';
          rColor = '#ff9f43';
          rExplanation = 'Your waist circumference/body fat is increasing or remaining plateaued relative to volume. Consider adjusting nutrition.';
        }
      } else {
        if (rValue >= 0.6) {
          rStatus = 'Strong Hypertrophic Response';
          rColor = 'var(--accent-neon)';
          rExplanation = 'Excellent! Your muscle circumference is increasing directly in proportion to your training volume per interval.';
        } else if (rValue >= 0.3) {
          rStatus = 'Moderate Correlation';
          rColor = '#3b82f6';
          rExplanation = 'A positive muscle hypertrophy trend is visible linked to your training volume.';
        } else if (rValue > -0.3) {
          rStatus = 'Weak Correlation / Plateau';
          rColor = '#94a3b8';
          rExplanation = 'Little change in muscle circumference relative to volume increase. Intensity (RIR) may be too low or recovery (sleep/protein) insufficient.';
        } else {
          rStatus = 'Shrinkage / Atrophy';
          rColor = '#ef4444';
          rExplanation = 'Negative correlation: muscle circumference decreases despite volume increase. Pay close attention to overtraining or extreme calorie deficits.';
        }
      }
    }

    const metricNames: { [key: string]: string } = {
      body_fat_pct: 'Fat Percentage (%)',
      muscle_mass_kg: 'Muscle Mass (kg)',
      waist_cm: 'Waist Circumference (cm)',
      chest_cm: 'Chest Circumference (cm)',
      shoulders_cm: 'Shoulder Circumference (cm)',
      hips_cm: 'Hip Circumference (cm)',
      biceps_l_cm: 'Left Biceps (cm)',
      biceps_r_cm: 'Right Biceps (cm)',
      thigh_l_cm: 'Thigh Left (cm)',
      thigh_r_cm: 'Thigh Right (cm)',
      calves_l_cm: 'Calf Left (cm)',
      calves_r_cm: 'Calf Right (cm)',
      neck_cm: 'Neck Circumference (cm)'
    };

    return (
      <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="kratos-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 className="kratos-card-title" style={{ margin: 0 }}>Hypertrophy & Volume Correlation</h3>
            <select
              className="kratos-input"
              style={{ width: 'auto', padding: '6px 12px', fontSize: 12, marginTop: 0 }}
              value={selectedCircumference}
              onChange={e => setSelectedCircumference(e.target.value)}
            >
              {Object.entries(metricNames).map(([key, name]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px', borderRadius: 12 }}>
              <div className="zenith-label">Current Measurement</div>
              <div className="zenith-stat-value" style={{ marginTop: 4 }}>
                {dataPoints.length > 0 ? `${dataPoints[dataPoints.length - 1].measurement} cm/%` : 'No data'}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px', borderRadius: 12 }}>
              <div className="zenith-label">Cumulative Kratos Volume</div>
              <div className="zenith-stat-value" style={{ marginTop: 4, color: 'var(--accent-neon)' }}>
                {workouts.reduce((sum, w) => sum + (w.volume || 0), 0).toLocaleString('en-US')} kg
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px', borderRadius: 12 }}>
              <div className="zenith-label">Pearson r Correlation</div>
              <div className="zenith-stat-value" style={{ marginTop: 4, color: rColor }}>
                {dataPoints.length >= 3 ? `${rValue.toFixed(3)}` : 'Insufficient Data'}
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', borderLeft: `4px solid ${rColor}`, padding: 14, borderRadius: '0 8px 8px 0', marginBottom: 24 }}>
            <span className="zenith-eyebrow" style={{ color: rColor }}>{rStatus}</span>
            <p className="zenith-label" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>{rExplanation}</p>
          </div>

          <div style={{ height: 300, width: '100%' }}>
            {dataPoints.length < 2 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <ZenithEmptyState
                  icon={<BarChart3 size={20} />}
                  title="Not enough data to plot"
                  message="Add measurements in Zenith Vigor to see the correlation chart."
                />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dataPoints} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                  <CartesianGrid {...ZENITH_CHART_GRID} />
                  <XAxis dataKey="dateStr" tick={ZENITH_CHART_AXIS_TICK} stroke="var(--border-color)" />
                  <YAxis yAxisId="left" tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.15)" domain={['auto', 'auto']} label={{ value: 'Measurement', angle: -90, position: 'insideLeft', fill: '#fff', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(57, 255, 20, 0.15)" domain={['auto', 'auto']} label={{ value: 'Volume Since Last Measurement (kg)', angle: 90, position: 'insideRight', fill: 'var(--accent-neon)', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                    labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="measurement" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} name={metricNames[selectedCircumference]} />
                  <Line yAxisId="right" type="monotone" dataKey="volume" stroke="var(--accent-neon)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Volume Since Last Measurement" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Per-exercise progression. Web only - the phone app is for logging a session in
  // front of a rack, this is for looking back at a month of them.
  const exerciseSessions = useMemo(
    () => buildExerciseSessions(workouts as any, exercises as any, latestBodyweight || 0),
    [workouts, exercises, latestBodyweight]
  );
  const exerciseTrends = useMemo(() => analyseAllExercises(exerciseSessions), [exerciseSessions]);
  const needsAttention = useMemo(
    () => exerciseTrends.filter(t => t.verdict === 'stalled' || t.verdict === 'regressing'),
    [exerciseTrends]
  );

  const userName = session?.user?.user_metadata?.name || session?.user?.user_metadata?.fitness_profile?.name || 'Athlete';

  const kratosNavItems = [
    { key: 'dashboard',   icon: <LayoutDashboard size={16} strokeWidth={1.6} />, label: 'Dashboard' },
    { key: 'routines',    icon: <Settings        size={16} strokeWidth={1.6} />, label: 'Routines' },
    { key: 'exercises',   icon: <Dumbbell        size={16} strokeWidth={1.6} />, label: 'Exercises' },
    { key: 'logs',        icon: <FileText        size={16} strokeWidth={1.6} />, label: 'Workout Log' },
    { key: 'hypertrophy', icon: <TrendingUp      size={16} strokeWidth={1.6} />, label: 'Hypertrophy' },
  ];

  return (
    <div className="kratos-container">
      <div className="kratos-background">
        <div className="kratos-glow-radial" />
        <div className="kratos-glow-purple" />
      </div>
      {/* Header — shared shell used by every Zenith app */}
      <ZenithPageHeader
        appName="KRATOS"
        subtitle={`Strength & Conditioning for ${userName}`}
        tabs={kratosNavItems as unknown as ZenithHeaderTab[]}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as any)}
      />

      {/* Content */}
      <main className="kratos-content animate-fade-in">
        {loadError && (
          <div
            role="alert"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.30)',
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#fca5a5',
              fontSize: '13px'
            }}
          >
            <span aria-hidden="true">⚠️</span>
            <span>{loadError}</span>
          </div>
        )}
        {/* ----------------- DASHBOARD TAB ----------------- */}
        {activeTab === 'dashboard' && (
          <div className="animate-slide-up">
            {/* HRV ANS State Banner — real wearable HRV only, otherwise an honest fallback */}
            {ansToneInsight ? (
              <div style={{
                background: 'rgba(56, 189, 248, 0.06)',
                border: '1px solid rgba(56, 189, 248, 0.20)',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <Sparkles size={16} style={{ color: '#38bdf8' }} />
                <div style={{ fontSize: '11px', color: '#e2e8f0', lineHeight: '1.4' }}>
                  <strong style={{ color: '#38bdf8' }}>HRV ANS State Sync:</strong> {ansToneInsight}
                  <span style={{ marginLeft: '6px', color: ansIntensityMultiplier < 1.0 ? '#ff7675' : '#55efc4', fontWeight: 800 }}>
                    (Workout targets auto-scaled by {ansIntensityMultiplier}x)
                  </span>
                </div>
              </div>
            ) : (!hasRealHrvData && sleepLogs.length > 0) ? (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '16px'
              }}>
                <ZenithEmptyState
                  icon={<Heart size={16} />}
                  title="No HRV data yet"
                  message="Connect a wearable via Zenith Pulse, or pair a smart ring, for real HRV-based ANS readiness scaling. Workout targets stay unscaled until then."
                />
              </div>
            ) : null}

            {/* PMC Hero Stat: Fitness (CTL) / Fatigue (ATL) / Form (TSB) */}
            <div className="zenith-grid-12" style={{ marginBottom: 24 }}>
              <div className="zenith-span-8">
                <ZenithHeroStat
                  eyebrow="Form · TSB"
                  value={currentPMC.tsb >= 0 ? `+${currentPMC.tsb}` : currentPMC.tsb}
                  sub={tsbContextText}
                  pill={
                    <span
                      className="zenith-pill"
                      style={{ background: `${tsbStatus.color}1f`, color: tsbStatus.color }}
                    >
                      {tsbStatus.emoji} {tsbStatus.label}
                    </span>
                  }
                />
              </div>
              <div className="zenith-span-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', flex: 1 }}>
                  <div className="zenith-label">Fitness · CTL</div>
                  <div className="zenith-stat-value" style={{ marginTop: 4 }}>{currentPMC.ctl}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', flex: 1 }}>
                  <div className="zenith-label">Fatigue · ATL</div>
                  <div className="zenith-stat-value" style={{ marginTop: 4, color: '#f5a623' }}>{currentPMC.atl}</div>
                </div>
              </div>
            </div>

            {/* Soreness check-in.
                The only LOCAL recovery signal the ecosystem has. Everything else -
                tonnage, TSB, sleep - describes the whole athlete, and none of it can
                tell a fresh chest from one still wrecked from Monday. What is
                collected here holds back the suggested weight on exercises that work
                a sore muscle, by a stated amount shown to the athlete. */}
            <section className="kratos-pmc-card" style={{ gridTemplateColumns: '1fr', marginBottom: 24 }}>
              <div style={{ padding: '4px 2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                  <h3 className="kratos-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <Activity size={16} style={{ color: '#38bdf8' }} /> Anything sore today?
                  </h3>
                  {Object.keys(todaySoreness).length > 0 && (
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>
                      Suggested weights are held back on affected exercises
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                  Tap a muscle to cycle mild &rarr; moderate &rarr; severe &rarr; off. Nothing sore is a valid answer &mdash; leave them all blank.
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SORENESS_GROUPS.map(g => {
                    const level = todaySoreness[g.slug];
                    const colour = level === 3 ? '#ff7675' : level === 2 ? '#f5a623' : level === 1 ? '#fdcb6e' : null;
                    return (
                      <button
                        key={g.slug}
                        disabled={savingSoreness || !sorenessLoaded}
                        title={level ? SEVERITY_DESCRIPTIONS[level] : 'Not sore'}
                        onClick={async () => {
                          const next: Record<string, Severity> = { ...todaySoreness };
                          const cur = next[g.slug];
                          // mild -> moderate -> severe -> gone. Cycling beats a
                          // separate severity picker for something answered daily.
                          if (!cur) next[g.slug] = 1;
                          else if (cur === 3) delete next[g.slug];
                          else next[g.slug] = (cur + 1) as Severity;

                          setTodaySoreness(next);
                          setSavingSoreness(true);
                          const uid = session?.user?.id;
                          if (uid) await saveSoreness(supabase, uid, next, new Date());
                          setSavingSoreness(false);
                        }}
                        style={{
                          padding: '7px 12px',
                          borderRadius: 999,
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 700,
                          border: colour ? `1px solid ${colour}` : '1px solid rgba(255,255,255,0.10)',
                          background: colour ? `${colour}22` : 'rgba(255,255,255,0.02)',
                          color: colour ?? '#94a3b8'
                        }}
                      >
                        {g.label}
                        {level ? ` · ${SEVERITY_LABELS[level]}` : ''}
                      </button>
                    );
                  })}
                </div>

                {Object.keys(todaySoreness).length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 11, color: '#94a3b8' }}>
                    Overall soreness <strong style={{ color: '#e2e8f0' }}>{Math.round(overallSoreness(todaySoreness) * 100)}%</strong>
                    {' '}&mdash; recorded against today so the pattern can be looked at over time.
                  </div>
                )}
              </div>
            </section>

            {/* AI Cardio & Recovery Link */}
            <section className="kratos-pmc-card" style={{ gridTemplateColumns: '1fr' }}>
              <div className="kratos-pmc-ai-box">
                <div className="kratos-pmc-ai-icon">
                  <Activity size={16} />
                </div>
                <div className="kratos-pmc-ai-info">
                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.5px' }}>AI Cardio & Recovery Link</span>
                  <span style={{ fontSize: 11, color: isAnyFatigueDetected ? '#eccc68' : '#94a3b8', lineHeight: 1.4 }}>
                    {isAnyFatigueDetected
                      ? `Recovery impact detected (${fatigueSummaryText}). Rest timer extended by +${restTimerExtensionPct}%.`
                      : 'Recovery status is optimal. Standard rest times applied.'}
                  </span>
                </div>
              </div>
            </section>

            {/* Grid for Volume and 1RM */}
            <div className="kratos-dashboard-grid">
              
              {/* Left Column: Weekly Volume Analysis */}
              <div className="kratos-card">
                <div className="kratos-card-header">
                  <h3 className="kratos-card-title">
                    <TrendingUp size={16} style={{ color: '#cbd5e1' }} /> Weekly Volume Analysis
                  </h3>
                  <div className="kratos-nav" style={{ padding: 2 }}>
                    <button 
                      className={`kratos-nav-btn ${dashboardMetric === 'volume' ? 'active' : ''}`}
                      onClick={() => setDashboardMetric('volume')}
                      style={{ fontSize: 9, padding: '4px 10px' }}
                    >
                      Volume (kg)
                    </button>
                    <button 
                      className={`kratos-nav-btn ${dashboardMetric === 'sets' ? 'active' : ''}`}
                      onClick={() => setDashboardMetric('sets')}
                      style={{ fontSize: 9, padding: '4px 10px' }}
                    >
                      Working Sets (RIR ≤ 3)
                    </button>
                  </div>
                </div>

                <div style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer>
                    <BarChart data={dashboardChartsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid {...ZENITH_CHART_GRID} />
                      <XAxis dataKey="week" stroke="#94a3b8" tick={ZENITH_CHART_AXIS_TICK} />
                      <YAxis stroke="#94a3b8" tick={ZENITH_CHART_AXIS_TICK} />
                      <Tooltip
                        contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                        labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                      />
                      <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                      <Bar dataKey="Chest" stackId="a" fill="#cbd5e1" />
                      <Bar dataKey="Lats" stackId="a" fill="#94a3b8" />
                      <Bar dataKey="Upper Back" stackId="a" fill="#475569" />
                      <Bar dataKey="Quads" stackId="a" fill="#3f3f46" />
                      <Bar dataKey="Hamstrings" stackId="a" fill="#71717a" />
                      <Bar dataKey="Shoulders" stackId="a" fill="#a1a1aa" />
                      <Bar dataKey="Biceps" stackId="a" fill="#d4d4d8" />
                      <Bar dataKey="Triceps" stackId="a" fill="#e4e4e7" />
                      <Bar dataKey="Calves" stackId="a" fill="#f4f4f5" />
                      <Bar dataKey="Abs" stackId="a" fill="#00cec9" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right Column: 1RM Progress */}
              <div className="kratos-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <h3 className="kratos-card-title" style={{ marginBottom: 12 }}>
                  <Heart size={15} style={{ color: '#cbd5e1' }} /> 1RM Trends (Epley)
                </h3>

                {/* Sparklines */}
                <div className="kratos-sparkline-grid">
                  {mainLifts.map(exId => {
                    const ex = exerciseMap.get(exId);
                    const sparkData = getSparklineData(exId);
                    const latest1RM = sparkData[sparkData.length - 1]?.estimated1RM ?? 0;
                    return (
                      <div key={exId} className="kratos-sparkline-card">
                        <span className="kratos-sparkline-title">{ex?.name}</span>
                        <span className="kratos-sparkline-value">
                          {latest1RM} <span className="kratos-sparkline-unit">{ex?.weight_unit}</span>
                        </span>
                        <div style={{ width: '100%', height: 40 }}>
                          <ResponsiveContainer>
                            <LineChart data={sparkData}>
                              <Line type="monotone" dataKey="estimated1RM" stroke="#cbd5e1" strokeWidth={1.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Big detailed line chart */}
                {selectedExercise1RM && (
                  <div style={{ marginTop: 24, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Detail view</span>
                      <select 
                        className="kratos-select" 
                        value={selectedExercise1RM} 
                        onChange={(e) => setSelectedExercise1RM(e.target.value)}
                        style={{ fontSize: 10, padding: '4px 10px', height: 'auto' }}
                      >
                        {exercises.map(ex => (
                          <option key={ex.id} value={ex.id}>{ex.name}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ width: '100%', height: 160 }}>
                      <ResponsiveContainer>
                        <LineChart data={detailed1RMData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                          <CartesianGrid {...ZENITH_CHART_GRID} />
                          <XAxis dataKey="dateStr" stroke="#64748b" tick={ZENITH_CHART_AXIS_TICK} />
                          <YAxis stroke="#64748b" tick={ZENITH_CHART_AXIS_TICK} />
                          <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE} />
                          <Line type="monotone" dataKey="estimated1RM" stroke="#cbd5e1" strokeWidth={2} activeDot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* CNS Readiness vs. Lift Volume Trend Card */}
            <div className="kratos-card" style={{ marginTop: '24px', width: '100%' }}>
              <div className="kratos-card-header" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <h3 className="kratos-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={16} style={{ color: '#38bdf8' }} /> CNS Readiness vs. Daily Lift Volume (Last 14 Days)
                </h3>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  {hasRealHrvData
                    ? 'Visualizes how Autonomic CNS readiness (measured wearable HRV) correlates with actual training volume'
                    : 'No wearable HRV data yet — showing a sleep-quality-derived ESTIMATE (not measured HRV) against actual training volume'}
                </span>
              </div>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <ComposedChart data={cnsVolumeCorrelationData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                    <CartesianGrid {...ZENITH_CHART_GRID} />
                    <XAxis dataKey="dateStr" stroke="#94a3b8" tick={ZENITH_CHART_AXIS_TICK} />
                    <YAxis yAxisId="left" stroke="#94a3b8" tick={ZENITH_CHART_AXIS_TICK} />
                    {/* Auto-scaled for measured HRV. The fixed 30-110 window was
                        the range of the sleep-quality ESTIMATE; real rMSSD often sits
                        far above it - this athlete's is 132-162 ms - so a measured
                        line was drawn straight off the top of the chart. The estimate
                        keeps its fixed window, where it is meaningful. */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={hasRealHrvData ? ['dataMin - 10', 'dataMax + 10'] : [30, 110]}
                      allowDecimals={false}
                      stroke="#38bdf8"
                      tick={ZENITH_CHART_AXIS_TICK}
                    />
                    <Tooltip
                      contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                      labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                    <Bar yAxisId="left" dataKey="volume" name="Lifted Volume (kg)" fill="rgba(255, 255, 255, 0.08)" radius={[4, 4, 0, 0]} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="hrv"
                      name={hasRealHrvData ? 'CNS Readiness (HRV ms rMSSD)' : 'CNS Readiness (Sleep-Quality ESTIMATE, not measured HRV)'}
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- ROUTINES TAB ----------------- */}
        {activeTab === 'routines' && (
          <div className="animate-slide-up">
            {!isTemplateModalOpen ? (
              // List View
              <div className="kratos-card">
                <div className="kratos-card-header">
                  <h3 className="kratos-card-title"><ListChecks size={16} style={{ color: '#cbd5e1' }} /> Templates Library</h3>
                  <button 
                    className="kratos-btn kratos-btn-neon"
                    onClick={() => {
                      setEditingTemplate(null);
                      setTemplateName('');
                      setTemplateExercises([]);
                      setIsTemplateModalOpen(true);
                    }}
                  >
                    <Plus size={14} /> New Template
                  </button>
                </div>

                {templates.length === 0 ? (
                  <ZenithEmptyState
                    icon={<ListChecks size={20} />}
                    title="No routines yet"
                    message="Create a template to reuse in your strength workouts."
                    action={
                      <button
                        className="kratos-btn kratos-btn-neon"
                        onClick={() => {
                          setEditingTemplate(null);
                          setTemplateName('');
                          setTemplateExercises([]);
                          setIsTemplateModalOpen(true);
                        }}
                      >
                        <Plus size={14} /> New Template
                      </button>
                    }
                  />
                ) : (
                  <table className="zenith-table">
                    <thead>
                      <tr>
                        <th>Routine Name</th>
                        <th>Exercises</th>
                        <th>Working Sets</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map(temp => {
                        const totalWorkingSets = temp.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.type === 'working').length, 0);
                        return (
                          <tr key={temp.id}>
                            <td><span className="zenith-table-name" title={temp.name}>{temp.name}</span></td>
                            <td>
                              {temp.exercises.map(ex => exerciseMap.get(ex.exercise_id)?.name).filter(Boolean).join(', ')}
                            </td>
                            <td className="zenith-tnum">{totalWorkingSets} sets</td>
                            <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button className="kratos-btn kratos-btn-secondary" style={{ padding: '6px 12px', fontSize: 10 }} onClick={() => handleEditTemplateClick(temp)}>
                                <Edit3 size={11} /> Edit
                              </button>
                              <button className="kratos-btn kratos-btn-danger" style={{ padding: '6px 12px', fontSize: 10 }} onClick={() => handleDeleteTemplate(temp.id)}>
                                <Trash2 size={11} /> Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              // Builder/Edit View
              <div className="kratos-card animate-slide-up">
                <div className="kratos-card-header">
                  <h3 className="kratos-card-title">{editingTemplate ? 'Edit Template' : 'Create New Template'}</h3>
                  <button className="kratos-btn kratos-btn-secondary" onClick={() => setIsTemplateModalOpen(false)}>
                    <X size={14} /> Cancel
                  </button>
                </div>

                <div className="kratos-input-group" style={{ marginBottom: 24 }}>
                  <label className="kratos-label">Routine Name</label>
                  <input
                    type="text"
                    className="kratos-input"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. Push B, Leg Day, Fullbody"
                    style={{ fontSize: 16, padding: '12px 16px' }}
                  />
                </div>

                {/* Add Exercise Finder */}
                <div style={{ position: 'relative', marginBottom: 28 }}>
                  <label className="kratos-label" style={{ marginBottom: 6, display: 'block' }}>Add exercise</label>
                  <input 
                    type="text" 
                    className="kratos-input" 
                    value={exerciseSearchQuery} 
                    onChange={(e) => setExerciseSearchQuery(e.target.value)}
                    placeholder="Search exercise..."
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                  {exerciseSearchQuery && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1c1c23', border: '1px solid var(--border-solid)', borderRadius: 10, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                      {exercises
                        .filter(ex => ex.name.toLowerCase().includes(exerciseSearchQuery.toLowerCase()))
                        .map(ex => (
                          <div 
                            key={ex.id} 
                            onClick={() => addExerciseToTemplate(ex.id)}
                            style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: 12 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <strong>{ex.name}</strong> <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>({ex.category})</span>
                          </div>
                        ))}
                      {exercises.filter(ex => ex.name.toLowerCase().includes(exerciseSearchQuery.toLowerCase())).length === 0 && (
                        <div style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 11 }}>
                          No exercises found. Create them first in the 'Exercises' tab!
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Added Exercises list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
                  {templateExercises.map((te, exIndex) => {
                    const ex = exerciseMap.get(te.exercise_id);
                    if (!ex) return null;
                    const aiRest = getAiRestRecommendation(te.exercise_id);
                    return (
                      <div key={exIndex} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                          <div>
                            <strong style={{ fontSize: 14, color: '#fff' }}>{ex.name}</strong>
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginLeft: 10, background: 'rgba(255,255,255,0.03)', padding: '2px 8px', borderRadius: 4 }}>
                              {ex.category}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', background: 'rgba(57, 255, 20, 0.02)', border: '1px dashed rgba(57, 255, 20, 0.1)', padding: '4px 10px', borderRadius: 6 }}>
                              <Info size={12} style={{ color: 'var(--accent-neon)' }} />
                              <span>AI Rest Time: <strong>{aiRest}</strong></span>
                            </div>
                            <button className="kratos-btn kratos-btn-danger" style={{ padding: 6 }} onClick={() => removeExerciseFromTemplate(exIndex)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Sets Editor Table */}
                        <table className="kratos-table" style={{ marginTop: 0 }}>
                          <thead>
                            <tr>
                              <th style={{ width: 80 }}>Set</th>
                              <th style={{ width: 140 }}>Type</th>
                              <th>Min Reps</th>
                              <th>Max Reps</th>
                              <th>Target RIR</th>
                              <th style={{ width: 60 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {te.sets.map((set, setIndex) => (
                              <tr key={setIndex}>
                                <td style={{ fontWeight: 800 }}>{setIndex + 1}</td>
                                <td>
                                  <select 
                                    className="kratos-select" 
                                    value={set.type} 
                                    onChange={(e) => updateTemplateSetField(exIndex, setIndex, 'type', e.target.value)}
                                    style={{ padding: '6px 10px', width: '100%', boxSizing: 'border-box' }}
                                  >
                                    <option value="warmup">Warm-up (W)</option>
                                    <option value="working">Working Set</option>
                                  </select>
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    className="kratos-input" 
                                    value={set.min_reps} 
                                    onChange={(e) => updateTemplateSetField(exIndex, setIndex, 'min_reps', Number(e.target.value))}
                                    style={{ padding: '6px 10px', width: 60 }}
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    className="kratos-input" 
                                    value={set.max_reps} 
                                    onChange={(e) => updateTemplateSetField(exIndex, setIndex, 'max_reps', Number(e.target.value))}
                                    style={{ padding: '6px 10px', width: 60 }}
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    className="kratos-input" 
                                    value={set.target_rir} 
                                    onChange={(e) => updateTemplateSetField(exIndex, setIndex, 'target_rir', Number(e.target.value))}
                                    style={{ padding: '6px 10px', width: 60 }}
                                    disabled={set.type === 'warmup'}
                                  />
                                </td>
                                <td>
                                  <button className="kratos-btn kratos-btn-danger" style={{ padding: 4 }} onClick={() => removeSetFromTemplateExercise(exIndex, setIndex)}>
                                    <X size={10} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button className="kratos-btn kratos-btn-secondary" style={{ marginTop: 10, fontSize: 10, padding: '6px 12px' }} onClick={() => addSetToTemplateExercise(exIndex)}>
                          <Plus size={10} /> Add Set
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="kratos-btn kratos-btn-neon" onClick={handleSaveTemplate} style={{ padding: '12px 28px' }}>
                    <Check size={14} /> Save Routine
                  </button>
                  <button className="kratos-btn kratos-btn-secondary" onClick={() => setIsTemplateModalOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------- EXERCISES TAB ----------------- */}
        {activeTab === 'exercises' && (
          <div className="animate-slide-up">
            {!isExerciseModalOpen ? (
              // List View
              <div className="kratos-card">
                <div className="kratos-card-header">
                  <h3 className="kratos-card-title"><Dumbbell size={16} style={{ color: '#cbd5e1' }} /> Exercises Library</h3>
                  <button 
                    className="kratos-btn kratos-btn-neon"
                    onClick={() => {
                      setEditingExercise(null);
                      setExerciseForm({
                        name: '',
                        category: 'Chest',
                        notes: '',
                        increment_weight: 2.5,
                        increment_per_side: false,
                        default_rir: 2,
                        weight_unit: 'kg'
                      });
                      setIsExerciseModalOpen(true);
                    }}
                  >
                    <Plus size={14} /> Add Exercise
                  </button>
                </div>

                {exercises.length === 0 ? (
                  <ZenithEmptyState
                    icon={<Dumbbell size={20} />}
                    title="No exercises yet"
                    message="Add one to start building routines."
                    action={
                      <button
                        className="kratos-btn kratos-btn-neon"
                        onClick={() => {
                          setEditingExercise(null);
                          setExerciseForm({
                            name: '',
                            category: 'Chest',
                            notes: '',
                            increment_weight: 2.5,
                            increment_per_side: false,
                            default_rir: 2,
                            weight_unit: 'kg'
                          });
                          setIsExerciseModalOpen(true);
                        }}
                      >
                        <Plus size={14} /> Add Exercise
                      </button>
                    }
                  />
                ) : (
                  <table className="zenith-table">
                    <colgroup>
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '19%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '17%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Muscle Group</th>
                        <th>Step (kg/lbs)</th>
                        <th>Unit</th>
                        <th>Target RIR</th>
                        <th>Cues / Notes</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                       {exercises.map(ex => {
                        const step = ex.increment_weight || 1;
                        const rawAiIncrement = predictProgressiveOverload(
                          1500, // baseline session volume
                          0,    // weight progression baseline
                          todaySleepQuality || 80,
                          currentPMC?.tsb || 0,
                          10    // standard target reps
                        );

                        let aiIncrementText = '';
                        if (ex.increment_per_side) {
                          // Per-side hardware increment: raw AI total increment divided by 2
                          const targetPerSideRaw = rawAiIncrement / 2;
                          // Round to nearest valid hardware step per side (minimum 1 step)
                          const multiplier = Math.max(1, Math.round(targetPerSideRaw / step));
                          const aiIncrementPerSide = multiplier * step;
                          aiIncrementText = `[AI: +${aiIncrementPerSide} ${ex.weight_unit} per side]`;
                        } else {
                          // Total increment: round raw AI total increment to valid hardware step
                          const multiplier = Math.max(1, Math.round(rawAiIncrement / step));
                          const aiIncrementTotal = multiplier * step;
                          aiIncrementText = `[AI: +${aiIncrementTotal} ${ex.weight_unit} total]`;
                        }

                        return (
                          <tr key={ex.id}>
                            <td>
                              <span className="zenith-table-name" title={ex.name}>{ex.name}</span>
                            </td>
                            <td>
                              <ZenithStatusPill tone="info">{ex.category}</ZenithStatusPill>
                            </td>
                            <td className="zenith-tnum">
                              +{ex.increment_weight} {ex.increment_per_side ? '(per side)' : '(total)'}{' '}
                              <span style={{ color: 'var(--accent-neon)', fontSize: 11, marginLeft: 4 }}>
                                {aiIncrementText}
                              </span>
                              {(ex.min_weight != null || ex.max_weight != null) && (
                                <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 2 }}>
                                  {ex.min_weight != null ? ex.min_weight : '–'}
                                  {'–'}
                                  {ex.max_weight != null ? ex.max_weight : '–'} {ex.weight_unit}
                                </div>
                              )}
                            </td>
                            <td style={{ textTransform: 'uppercase', fontWeight: 700 }}>{ex.weight_unit}</td>
                            <td className="zenith-tnum">RIR {ex.default_rir}</td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ex.notes || '-'}
                            </td>
                            <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button className="kratos-btn kratos-btn-secondary" style={{ padding: '6px 12px', fontSize: 10 }} onClick={() => handleEditExerciseClick(ex)}>
                                <Edit3 size={11} /> Edit
                              </button>
                              <button className="kratos-btn kratos-btn-danger" style={{ padding: '6px 12px', fontSize: 10 }} onClick={() => handleDeleteExercise(ex.id)}>
                                <Trash2 size={11} /> Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              // Add/Edit Modal Form
              <div className="kratos-card animate-slide-up" style={{ maxWidth: 600, margin: '0 auto' }}>
                <div className="kratos-card-header">
                  <h3 className="kratos-card-title">{editingExercise ? 'Edit Exercise' : 'Add New Exercise'}</h3>
                  <button className="kratos-btn kratos-btn-secondary" onClick={() => setIsExerciseModalOpen(false)}>
                    <X size={14} />
                  </button>
                </div>

                <form onSubmit={handleSaveExercise}>
                  <div className="kratos-input-group">
                    <label className="kratos-label">Exercise Name</label>
                    <input 
                      type="text" 
                      className="kratos-input" 
                      required 
                      value={exerciseForm.name} 
                      onChange={(e) => setExerciseForm({ ...exerciseForm, name: e.target.value })}
                      placeholder="e.g. Bench Press, Squat, Lat Pulldown"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="kratos-input-group">
                      <label className="kratos-label">Muscle Group / Category (Primary Muscle)</label>
                      <select 
                        className="kratos-select" 
                        value={exerciseForm.category} 
                        onChange={(e) => setExerciseForm({ ...exerciseForm, category: e.target.value as any })}
                      >
                        <option value="Chest">Chest</option>
                        <option value="Shoulders">Shoulders</option>
                        <option value="Biceps">Biceps (Upper Arms)</option>
                        <option value="Triceps">Triceps (Back of Arms)</option>
                        <option value="Forearms">Forearms</option>
                        <option value="Upper Back">Upper Back</option>
                        <option value="Lats">Lats</option>
                        <option value="Lower Back">Lower Back</option>
                        <option value="Traps">Traps</option>
                        <option value="Quads">Quads (Front Thighs)</option>
                        <option value="Hamstrings">Hamstrings (Back Thighs)</option>
                        <option value="Glutes">Glutes</option>
                        <option value="Calves">Calves</option>
                        <option value="Abs">Abs</option>
                        <option value="Obliques">Obliques</option>
                      </select>
                    </div>

                    <div className="kratos-input-group">
                      <label className="kratos-label">Unit (kg or lbs)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 38 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: exerciseForm.weight_unit === 'kg' ? '#fff' : 'var(--text-secondary)' }}>KG</span>
                        <label className="kratos-switch">
                          <input 
                            type="checkbox" 
                            checked={exerciseForm.weight_unit === 'lbs'}
                            onChange={(e) => setExerciseForm({ ...exerciseForm, weight_unit: e.target.checked ? 'lbs' : 'kg' })}
                          />
                          <span className="kratos-slider" />
                        </label>
                        <span style={{ fontSize: 11, fontWeight: 700, color: exerciseForm.weight_unit === 'lbs' ? '#fff' : 'var(--text-secondary)' }}>LBS</span>
                      </div>
                    </div>
                  </div>

                  <div className="kratos-input-group" style={{ marginBottom: 16 }}>
                    <label className="kratos-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Secondary Muscle Groups (Optional)</span>
                      <span style={{ color: 'var(--accent-neon)', fontSize: 10 }}>Heatmap Coupling (50% impact)</span>
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {[
                        { key: 'chest', label: 'Chest' },
                        { key: 'deltoids', label: 'Shoulders' },
                        { key: 'biceps', label: 'Biceps' },
                        { key: 'triceps', label: 'Triceps' },
                        { key: 'upperBack', label: 'Upper Back / Lats' },
                        { key: 'trapezius', label: 'Trapezius' },
                        { key: 'lowerBack', label: 'Lower Back' },
                        { key: 'quadriceps', label: 'Quads' },
                        { key: 'hamstring', label: 'Hamstrings' },
                        { key: 'gluteal', label: 'Glutes' },
                        { key: 'calves', label: 'Calves' },
                        { key: 'abs', label: 'Abs' },
                        { key: 'obliques', label: 'Obliques' },
                        { key: 'forearm', label: 'Forearms' }
                      ].map(m => {
                        const isSelected = (exerciseForm.secondary_muscles || []).includes(m.key as any);
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => {
                              const curr: string[] = exerciseForm.secondary_muscles || [];
                              const updated: string[] = isSelected ? curr.filter((x: string) => x !== m.key) : [...curr, m.key];
                              setExerciseForm(prev => ({ ...prev, secondary_muscles: updated }));
                            }}
                            style={{
                              padding: '4px 9px',
                              borderRadius: 6,
                              border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                              background: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                              color: isSelected ? '#60a5fa' : 'rgba(255,255,255,0.6)',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            {isSelected ? '✓ ' : '+ '}{m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="kratos-input-group">
                      <label className="kratos-label">Smallest Step (weight)</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        className="kratos-input" 
                        required 
                        value={exerciseForm.increment_weight} 
                        onChange={(e) => setExerciseForm({ ...exerciseForm, increment_weight: Number(e.target.value) })}
                        placeholder="e.g. 2.5 or 1.0"
                      />
                      <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input 
                            type="checkbox" 
                            id="increment_per_side"
                            checked={!!exerciseForm.increment_per_side}
                            onChange={(e) => setExerciseForm({ ...exerciseForm, increment_per_side: e.target.checked })}
                            style={{ accentColor: 'var(--accent-neon)' }}
                          />
                          <label htmlFor="increment_per_side" style={{ fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Steps per side
                          </label>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input 
                            type="checkbox" 
                            id="is_bodyweight"
                            checked={!!exerciseForm.is_bodyweight}
                            onChange={(e) => setExerciseForm({ ...exerciseForm, is_bodyweight: e.target.checked })}
                            style={{ accentColor: 'var(--accent-neon)' }}
                          />
                          <label htmlFor="is_bodyweight" style={{ fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Body weight
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="kratos-input-group">
                      <label className="kratos-label">Default Target RIR</label>
                      <input 
                        type="number" 
                        className="kratos-input" 
                        required 
                        value={exerciseForm.default_rir} 
                        onChange={(e) => setExerciseForm({ ...exerciseForm, default_rir: Number(e.target.value) })}
                        placeholder="e.g. 2"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="kratos-input-group">
                      <label className="kratos-label">Min Weight (optional)</label>
                      <input
                        type="number"
                        step="0.1"
                        className="kratos-input"
                        value={exerciseForm.min_weight ?? ''}
                        onChange={(e) => setExerciseForm({ ...exerciseForm, min_weight: e.target.value === '' ? undefined : Number(e.target.value) })}
                        placeholder="No minimum"
                      />
                    </div>

                    <div className="kratos-input-group">
                      <label className="kratos-label">Max Weight (optional)</label>
                      <input
                        type="number"
                        step="0.1"
                        className="kratos-input"
                        value={exerciseForm.max_weight ?? ''}
                        onChange={(e) => setExerciseForm({ ...exerciseForm, max_weight: e.target.value === '' ? undefined : Number(e.target.value) })}
                        placeholder="No maximum"
                      />
                    </div>
                  </div>

                  <div className="kratos-input-group" style={{ marginBottom: 24 }}>
                    <label className="kratos-label">Cues / Form Notes</label>
                    <textarea
                      className="kratos-input"
                      rows={3}
                      value={exerciseForm.notes}
                      onChange={(e) => setExerciseForm({ ...exerciseForm, notes: e.target.value })}
                      placeholder="e.g. Touch chest and press explosively up, elbows under 45 degrees."
                      style={{ resize: 'none', fontFamily: 'inherit' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button type="submit" className="kratos-btn kratos-btn-neon">
                      <Check size={14} /> Save
                    </button>
                    <button type="button" className="kratos-btn kratos-btn-secondary" onClick={() => setIsExerciseModalOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}


        
        {/* ----------------- LOGBOOK TAB ----------------- */}
        {activeTab === 'logs' && (
          <div className="animate-slide-up">
            {/* What is not moving.
                Listed first and separately, because it is the only part of a logbook
                that asks for a decision. Everything below is a record of what
                happened; this is the bit that says something should change. */}
            {exerciseTrends.length > 0 && (
              <div className="kratos-card" style={{ marginBottom: 20 }}>
                <h3 className="kratos-card-title">
                  <TrendingUp size={16} style={{ color: needsAttention.length > 0 ? '#f5a623' : '#55efc4' }} />
                  {needsAttention.length > 0 ? 'Worth a look' : 'Everything is moving'}
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                  Judged on your last {TREND_WINDOW} sessions of each exercise, not against an all-time best &mdash;
                  an early session logged with an optimistic RIR would otherwise read as months of decline.
                </p>

                {needsAttention.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    Nothing has stalled. {exerciseTrends.filter(t => t.verdict === 'progressing').length} of{' '}
                    {exerciseTrends.length} exercises are climbing.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {needsAttention.map(t => {
                      const colour = t.verdict === 'regressing' ? '#ff7675' : '#f5a623';
                      return (
                        <div key={t.exerciseId} style={{
                          background: `${colour}0f`, border: `1px solid ${colour}33`,
                          borderRadius: 10, padding: '12px 14px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <strong style={{ fontSize: 13, color: '#e2e8f0' }}>{t.exerciseName}</strong>
                            <span style={{ fontSize: 12, fontWeight: 800, color: colour }}>{t.headline}</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>{t.detail}</div>
                          <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                            {t.sessions.slice(-TREND_WINDOW).map(x => {
                              const w = x.bestSet;
                              return w
                                ? `${new Date(x.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ${w.weight}${t.unit} × ${w.reps} @ RIR ${w.rir}`
                                : '';
                            }).filter(Boolean).join('   →   ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {exerciseTrends.some(t => t.verdict === 'progressing') && (
                  <details style={{ marginTop: 14 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 11, color: '#94a3b8' }}>
                      What is going well ({exerciseTrends.filter(t => t.verdict === 'progressing').length})
                    </summary>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {exerciseTrends.filter(t => t.verdict === 'progressing').map(t => (
                        <div key={t.exerciseId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gap: 12 }}>
                          <span style={{ color: '#94a3b8' }}>{t.exerciseName}</span>
                          <strong style={{ color: '#55efc4' }}>{t.headline}</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            <div className="kratos-card">
              <h3 className="kratos-card-title"><NotebookText size={16} style={{ color: '#cbd5e1' }} /> Training Logbook</h3>

              {workouts.length === 0 ? (
                <ZenithEmptyState
                  icon={<NotebookText size={20} />}
                  title="No workouts logged yet"
                  message="Start Kratos Pilot on your Android device and log your first workout to see it here."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {workouts.map(w => {
                    const durationMins = Math.round((new Date(w.completed_at).getTime() - new Date(w.started_at).getTime()) / 60000);
                    return (
                      <div key={w.id} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: 12, marginBottom: 12 }}>
                          <div>
                            <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#fff' }}>{w.name}</h4>
                            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)', alignItems: 'center' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {new Date(w.completed_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-secondary)' }} />
                              <span>Duration: {durationMins} min</span>
                              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-secondary)' }} />
                              <button onClick={() => handleEditWorkoutClick(w)} style={{ background: 'none', border: 'none', color: 'var(--accent-neon)', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 'bold' }}>Edit</button>
                              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-secondary)' }} />
                              <button onClick={() => handleDeleteWorkout(w.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 'bold' }}>Delete</button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 20, textAlign: 'right' }}>
                            <div>
                              <div className="zenith-label">Total Volume</div>
                              <div className="zenith-stat-value" style={{ fontSize: 16, marginTop: 2 }}>{w.volume} kg</div>
                            </div>
                            <div>
                              <div className="zenith-label" style={{ marginBottom: 4 }}>Cardio Recovery</div>
                              <ZenithStatusPill tone={w.cardio_stress_factor > 1.0 ? 'warn' : 'good'}>
                                {w.cardio_stress_factor > 1.0 ? `+${Math.round((w.cardio_stress_factor - 1) * 100)}% rest` : 'Normal'}
                              </ZenithStatusPill>
                            </div>
                          </div>
                        </div>

                        {/* Against the previous run of the SAME routine.
                            Matched on template_id, so a PUSH is compared with the
                            last PUSH rather than with whatever session happened to
                            come before it - which is usually a different day
                            entirely and answers nothing. */}
                        {(() => {
                          const cmp = compareToPreviousSession(w.id, exerciseSessions);
                          if (!cmp || cmp.previousDate === null) return null;
                          const moved = cmp.exercises.filter(e => e.e1rmChangePct !== null);
                          if (moved.length === 0) return null;

                          const gained = moved.filter(e => (e.e1rmChangePct as number) >= 2.5);
                          const lost = moved.filter(e => (e.e1rmChangePct as number) <= -2.5);
                          const prevLabel = new Date(cmp.previousDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

                          return (
                            <div style={{
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 10, padding: '12px 14px', marginBottom: 16
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginBottom: 10 }}>
                                <strong style={{ fontSize: 12, color: '#e2e8f0' }}>
                                  vs your previous {cmp.workoutName} ({prevLabel})
                                </strong>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                  {gained.length} up, {lost.length} down, {moved.length - gained.length - lost.length} the same
                                  {cmp.volumeChangePct !== null && (
                                    <>
                                      {'  ·  volume '}
                                      <strong style={{ color: cmp.volumeChangePct >= 0 ? '#55efc4' : '#ff7675' }}>
                                        {cmp.volumeChangePct >= 0 ? '+' : ''}{cmp.volumeChangePct}%
                                      </strong>
                                    </>
                                  )}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {moved.map(e => {
                                  const pct = e.e1rmChangePct as number;
                                  const colour = pct >= 2.5 ? '#55efc4' : pct <= -2.5 ? '#ff7675' : '#94a3b8';
                                  const now = e.current.bestSet;
                                  const before = e.previous?.bestSet;
                                  return (
                                    <div key={e.exerciseName} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, alignItems: 'baseline' }}>
                                      <span style={{ color: '#94a3b8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {e.exerciseName}
                                      </span>
                                      <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                        {before ? `${before.weight}×${before.reps}` : '—'}
                                        {'  →  '}
                                        {now ? `${now.weight}×${now.reps}` : '—'} {e.unit}
                                      </span>
                                      <strong style={{ color: colour, width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {pct >= 0 ? '+' : ''}{pct}%
                                      </strong>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Exercise Sets breakdown */}
                        <div style={{ display: 'flex', flexFlow: 'row wrap', gap: 16 }}>
                          {w.sets.map((exLog, idx) => {
                            const ex = exerciseMap.get(exLog.exercise_id);
                            if (!ex) return null;
                            return (
                              <div key={idx} className="zenith-card" style={{ minWidth: 220, padding: 12, borderRadius: 10 }}>
                                <span className="zenith-table-name" style={{ display: 'block', marginBottom: 6, maxWidth: 'none' }}>{ex.name}</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {exLog.sets.map((s, sIdx) => (
                                    <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: s.type === 'warmup' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                                      <span>
                                        Set {sIdx + 1} {s.type === 'warmup' && <span style={{ fontSize: 9, opacity: 0.6 }}>(W)</span>}:
                                      </span>
                                      <strong className="zenith-tnum">
                                        {s.weight} {ex.weight_unit} x {s.reps} <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}> (RIR {s.rir})</span>
                                      </strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'hypertrophy' && renderHypertrophyTab()}

      </main>

      {isWorkoutModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(9, 9, 11, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 20
        }}>
          <div style={{
            background: '#1c1c23',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            width: '100%',
            maxWidth: 600,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>Edit Training Log</h3>
              <button 
                onClick={() => setIsWorkoutModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveWorkout} style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {todayAcwr > 1.5 && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  marginBottom: '8px'
                }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Sparkles size={16} style={{ color: '#ef4444' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#ef4444' }}>
                      Injury Risk: ACWR Overuse Alert ({todayAcwr.toFixed(2)})
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
                    Your acute workload is significantly higher than your chronic workload. We strongly recommend a deload session (70% weight, 50% working sets) to recover.
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {!isDeloadAccepted ? (
                      <button
                        type="button"
                        onClick={handleAcceptDeload}
                        style={{
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Accept Deload Recommendation
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleDeclineDeload}
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          color: '#cbd5e1',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Decline / Restore Progression
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="kratos-input-group">
                <label className="kratos-label">Workout Name</label>
                <input 
                  type="text" 
                  className="kratos-input" 
                  required 
                  value={workoutForm.name} 
                  onChange={(e) => setWorkoutForm({ ...workoutForm, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                <div className="kratos-input-group" style={{ flex: 1 }}>
                  <label className="kratos-label">Start Date/Time</label>
                  <input 
                    type="datetime-local" 
                    className="kratos-input" 
                    required 
                    value={workoutForm.started_at} 
                    onChange={(e) => setWorkoutForm({ ...workoutForm, started_at: e.target.value })}
                  />
                </div>
                <div className="kratos-input-group" style={{ flex: 1 }}>
                  <label className="kratos-label">End Date/Time</label>
                  <input 
                    type="datetime-local" 
                    className="kratos-input" 
                    required 
                    value={workoutForm.completed_at} 
                    onChange={(e) => setWorkoutForm({ ...workoutForm, completed_at: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800 }}>Exercises & Sets</h4>
                
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {workoutForm.sets.map((exLog, exIdx) => {
                    const ex = exerciseMap.get(exLog.exercise_id);
                    if (!ex) return null;

                    return (
                      <div key={exIdx} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <strong style={{ fontSize: 12, color: '#fff' }}>{ex.name}</strong>
                          <button 
                            type="button" 
                            onClick={() => handleRemoveExerciseFromLog(exIdx)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 'bold', padding: 0 }}
                          >
                            Delete Exercise
                          </button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {exLog.sets.map((s, sIdx) => (
                            <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                              <span style={{ color: 'var(--text-secondary)', width: 60 }}>
                                Set {sIdx + 1} ({s.type === 'warmup' ? 'W' : 'Work'}):
                              </span>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input 
                                  type="number" 
                                  step="any"
                                  style={{ width: 65, background: 'rgba(9,9,11,0.5)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 11 }}
                                  value={s.weight}
                                  onChange={(e) => {
                                    const updatedSets = [...workoutForm.sets];
                                    updatedSets[exIdx].sets[sIdx].weight = Number(e.target.value);
                                    setWorkoutForm({ ...workoutForm, sets: updatedSets });
                                  }}
                                />
                                <span style={{ color: 'var(--text-secondary)' }}>{ex.weight_unit}</span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input 
                                  type="number" 
                                  style={{ width: 50, background: 'rgba(9,9,11,0.5)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 11 }}
                                  value={s.reps}
                                  onChange={(e) => {
                                    const updatedSets = [...workoutForm.sets];
                                    updatedSets[exIdx].sets[sIdx].reps = Number(e.target.value);
                                    setWorkoutForm({ ...workoutForm, sets: updatedSets });
                                  }}
                                  required
                                />
                                <span style={{ color: 'var(--text-secondary)' }}>reps</span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>RIR:</span>
                                <input 
                                  type="number" 
                                  style={{ width: 45, background: 'rgba(9,9,11,0.5)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 11 }}
                                  value={s.rir}
                                  onChange={(e) => {
                                    const updatedSets = [...workoutForm.sets];
                                    updatedSets[exIdx].sets[sIdx].rir = Number(e.target.value);
                                    setWorkoutForm({ ...workoutForm, sets: updatedSets });
                                  }}
                                  required
                                />
                              </div>

                              <button 
                                type="button"
                                onClick={() => handleRemoveSetFromLog(exIdx, sIdx)}
                                disabled={exLog.sets.length <= 1}
                                style={{ background: 'none', border: 'none', color: exLog.sets.length <= 1 ? 'rgba(255,255,255,0.05)' : '#ef4444', cursor: exLog.sets.length <= 1 ? 'not-allowed' : 'pointer', fontSize: 13, padding: '0 4px', fontWeight: 'bold' }}
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>

                        <button 
                          type="button" 
                          onClick={() => handleAddSetToLog(exIdx)}
                          className="kratos-btn kratos-btn-secondary"
                          style={{ marginTop: 8, padding: '4px 10px', fontSize: 10, alignSelf: 'flex-start' }}
                        >
                          + Add Set
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Dropdown to add new exercise */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 16 }}>
                  <label className="kratos-label" style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800 }}>Add Exercise</label>
                  <select 
                    className="kratos-input" 
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddExerciseToLog(e.target.value);
                        e.target.value = ""; // Reset selection
                      }
                    }}
                  >
                    <option value="" disabled>Select an exercise to add...</option>
                    {exercises
                      .filter(ex => !ex.deleted)
                      .map(ex => (
                        <option key={ex.id} value={ex.id}>{ex.name}</option>
                      ))
                    }
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                <button type="submit" className="kratos-btn kratos-btn-neon" style={{ flex: 1 }}>
                  Save Changes
                </button>
                <button type="button" className="kratos-btn kratos-btn-secondary" onClick={() => setIsWorkoutModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
