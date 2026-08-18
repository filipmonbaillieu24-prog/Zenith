import { useState, useEffect, useMemo } from 'react';
import { predictProgressiveOverload, predictAutoregWeight, trainAutoregModel, kratosAutoregModel } from '../../../shared/ml/SharedModels';
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
  Calendar
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
  Line 
} from 'recharts';

// Type Definitions
interface Exercise {
  id: string;
  user_id: string;
  name: string;
  category: 'Quads' | 'Hamstrings' | 'Calves' | 'Glutes' | 'Chest' | 'Lats' | 'Upper Back' | 'Lower Back' | 'Shoulders' | 'Biceps' | 'Triceps' | 'Abs' | 'Obliques' | 'Traps' | 'Forearms';
  primary_muscle?: string;
  secondary_muscles?: string[];
  notes?: string;
  increment_weight: number;
  increment_per_side: boolean;
  is_bodyweight: boolean;
  default_rir: number;
  weight_unit: 'kg' | 'lbs';
  deleted: boolean;
}

interface TemplateSet {
  type: 'warmup' | 'working';
  min_reps: number;
  max_reps: number;
  target_rir: number;
}

interface TemplateExercise {
  exercise_id: string;
  sets: TemplateSet[];
}

interface Template {
  id: string;
  user_id: string;
  name: string;
  exercises: TemplateExercise[];
  created_at: string;
}

interface WorkoutLoggedSet {
  type: 'warmup' | 'working';
  weight: number;
  reps: number;
  rir: number;
  rest_seconds?: number;
}

interface WorkoutExerciseLog {
  exercise_id: string;
  sets: WorkoutLoggedSet[];
}

interface Workout {
  id: string;
  user_id: string;
  template_id?: string;
  name: string;
  started_at: string;
  completed_at: string;
  volume: number;
  cardio_stress_factor: number;
  sets: WorkoutExerciseLog[];
  created_at: string;
}

interface PMCPoint {
  date: number;
  ctl: number;
  atl: number;
  tsb: number;
  sleepDeficit?: number;
}

export default function App() {
  // Session & Authentication
  const [session, setSession] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'routines' | 'exercises' | 'logs' | 'download' | 'hypertrophy'>('dashboard');

  // Database State
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
  const calculateWorkoutTSS = (workout: any, listEx: Exercise[], historyWorkouts: Workout[]) => {
    if (!workout.sets || !Array.isArray(workout.sets)) return 0;
    const localMap = new Map(listEx.map(e => [e.id, e]));
    let totalTSS = 0;
    
    for (const exLog of workout.sets) {
      const exerciseId = exLog.exercise_id;
      const ex = localMap.get(exerciseId);
      if (!ex) continue;
      
      let e1RM = ex.is_bodyweight ? 80.0 : 60.0;
      let maxAchieved = 0;
      
      for (const w of historyWorkouts) {
        if (!w.sets || w.id === workout.id) continue;
        const matchingEx = w.sets.find((s: any) => s.exercise_id === exerciseId);
        if (matchingEx && matchingEx.sets) {
          for (const s of matchingEx.sets) {
            if (s.weight > 0 && s.reps > 0) {
              const est = s.weight * (1.0 + s.reps / 30.0);
              if (est > maxAchieved) maxAchieved = est;
            }
          }
        }
      }
      
      if (maxAchieved > 0) {
        e1RM = maxAchieved;
      }
      
      for (const s of exLog.sets) {
        if (s.type === 'warmup') continue;
        let load = Number(s.weight || 0);
        if (ex.is_bodyweight) {
          load += latestBodyweight > 0 ? latestBodyweight : 75.0;
        }
        if (load === 0 || s.reps === 0) continue;
        
        const reps = Number(s.reps);
        const rir = Math.max(0, Math.min(10, Number(s.rir ?? 2)));
        const intensity = load / e1RM;
        const setStress = intensity * reps * (1.0 - 0.05 * rir) * 0.5;
        totalTSS += setStress;
      }
    }
    
    return Math.round(totalTSS * 10) / 10;
  };

  const retrainAutoregModel = async (uid: string, historyWorkouts: any[]) => {
    try {
      const trainingPairs: { x: number[]; y: number }[] = [];
      const sorted = [...historyWorkouts].sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());

      for (const w of sorted) {
        if (!w.sets || !Array.isArray(w.sets)) continue;
        for (const exLog of w.sets) {
          if (!exLog.sets || exLog.sets.length < 2) continue;
          for (let i = 1; i < exLog.sets.length; i++) {
            const prev = exLog.sets[i - 1];
            const curr = exLog.sets[i];
            if (prev.type === 'warmup' || curr.type === 'warmup') continue;
            if (!prev.weight || !prev.reps || !curr.weight || !curr.reps) continue;

            const currE1RM = curr.weight * (1.0 + (curr.reps + (curr.rir ?? 2)) / 30.0);
            const x = [
              Math.min(1.0, (i - 1) / 5.0),
              Math.min(1.5, prev.weight / 200.0),
              Math.min(1.5, prev.reps / 20.0),
              Math.min(1.0, (prev.rir ?? 2) / 10.0),
              Math.min(1.5, (prev.rest_seconds ?? 90) / 300.0)
            ];
            const target = Math.max(0.0, Math.min(1.0, currE1RM / 200.0));
            trainingPairs.push({ x, y: target });
          }
        }
      }

      if (trainingPairs.length === 0) return;

      await kratosAutoregModel.loadFromSupabase(supabase, uid);
      const lr = 0.05;
      for (let epoch = 0; epoch < 50; epoch++) {
        trainingPairs.sort(() => Math.random() - 0.5);
        for (const pair of trainingPairs) {
          await kratosAutoregModel.train(supabase, uid, pair.x, [pair.y], lr);
        }
      }
      console.log("Kratos Autoreg model retrained with", trainingPairs.length, "samples.");
    } catch (err) {
      console.error("Retrain error:", err);
    }
  };

  const fetchData = async () => {
    if (!session?.user?.id) return;
    const uid = session.user.id;

    // Load exercises
    const { data: exData } = await supabase
      .from('kratos_exercises')
      .select('*')
      .eq('user_id', uid)
      .eq('deleted', false);
    if (exData) setExercises(exData);

    // Load templates
    const { data: tempData } = await supabase
      .from('kratos_templates')
      .select('*')
      .eq('user_id', uid);
    if (tempData) setTemplates(tempData);

    // Load workouts
    const { data: woData } = await supabase
      .from('kratos_workouts')
      .select('*')
      .eq('user_id', uid)
      .order('completed_at', { ascending: false });
    let localWorkouts: Workout[] = [];
    if (woData) {
      setWorkouts(woData);
      localWorkouts = woData;
    }

    // Load latest body weight
    const { data: weightData } = await supabase
      .from('vigor_weight')
      .select('weight')
      .eq('user_id', uid)
      .order('logged_at', { ascending: false })
      .limit(1);
    if (weightData && weightData.length > 0) {
      setLatestBodyweight(Number(weightData[0].weight));
    }

    // Load body measurements
    const { data: bMeasData } = await supabase
      .from('vigor_body_measurements')
      .select('*')
      .eq('user_id', uid)
      .order('logged_at', { ascending: true });
    if (bMeasData) {
      setMeasurements(bMeasData);
    }

    // Load athlete profile
    const { data: profData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (profData) setProfile(profData);

    // Load today's sleep quality from vigor_sleep
    const { data: sleepData } = await supabase
      .from('vigor_sleep')
      .select('*')
      .eq('user_id', uid)
      .order('logged_at', { ascending: false })
      .limit(1);
    if (sleepData && sleepData.length > 0) {
      setTodaySleepQuality(Number(sleepData[0].quality_score ?? sleepData[0].quality ?? 0));
    }

    // Load today's steps from vigor_steps
    const { data: stepsData } = await supabase
      .from('vigor_steps')
      .select('*')
      .eq('user_id', uid)
      .order('logged_at', { ascending: false })
      .limit(1);
    if (stepsData && stepsData.length > 0) {
      setTodaySteps(Number(stepsData[0].step_count ?? stepsData[0].steps ?? 0));
    }

    // Load rides for PMC
    const { data: rideData } = await supabase
      .from('rides')
      .select('date, metadata')
      .eq('user_id', uid)
      .order('date', { ascending: true });

    // Load all sleep logs for last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sleepDataAll } = await supabase
      .from('vigor_sleep')
      .select('logged_at, duration_minutes, quality_score')
      .eq('user_id', uid)
      .gte('logged_at', ninetyDaysAgo)
      .order('logged_at', { ascending: true });

    // Load vigor_profile
    const { data: vigorProfile } = await supabase
      .from('vigor_profile')
      .select('target_sleep_hours')
      .eq('user_id', uid)
      .maybeSingle();

    const targetSleep = Number(vigorProfile?.target_sleep_hours ?? 8.0);

    if (rideData) {
      computeCombinedStress(rideData, localWorkouts, exData || [], sleepDataAll || [], targetSleep);
    }

    if (localWorkouts.length > 0) {
      retrainAutoregModel(uid, localWorkouts);
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
    exData: Exercise[],
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

    // Group TSS by Day
    const tssPerDay = new Map<string, number>();
    for (const r of parsedRides) {
      const key = new Date(r.date).toISOString().split('T')[0];
      tssPerDay.set(key, (tssPerDay.get(key) ?? 0) + r.tss);
    }

    // Include Strength Training TSS
    for (const w of woData) {
      if (!w.completed_at) continue;
      const key = new Date(w.completed_at).toISOString().split('T')[0];
      const strengthTSS = calculateWorkoutTSS(w, exData, woData);
      tssPerDay.set(key, (tssPerDay.get(key) ?? 0) + strengthTSS);
    }

    // Group Sleep logs by Day
    const sleepPerDay = new Map<string, { duration: number; quality: number }>();
    for (const s of sleepData) {
      const key = new Date(s.logged_at).toISOString().split('T')[0];
      sleepPerDay.set(key, {
        duration: Number(s.duration_minutes || 0) / 60.0,
        quality: Number(s.quality_score ?? 0)
      });
    }

    // Determine range: first activity to today
    const dates = [
      ...parsedRides.map(r => r.date),
      ...woData.map(w => new Date(w.completed_at).getTime())
    ].filter(Boolean);
    if (dates.length === 0) return;

    const firstDate = new Date(Math.min(...dates));
    const today = new Date();
    firstDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);

    const K_CTL = 1 - Math.exp(-1 / 42);
    const K_ATL = 1 - Math.exp(-1 / 7);

    const points: PMCPoint[] = [];
    let ctl = 0;
    let atl = 0;
    const cur = new Date(firstDate);

    while (cur <= today) {
      const key = cur.toISOString().split('T')[0];
      const tss = tssPerDay.get(key) ?? 0;
      ctl = ctl + K_CTL * (tss - ctl);
      atl = atl + K_ATL * (tss - atl);

      // Sleep deficit calculation
      const sleep = sleepPerDay.get(key);
      let sleepDeficit = 0;
      if (sleep) {
        sleepDeficit = Math.max(0, targetSleep - sleep.duration);
      }

      points.push({
        date: cur.getTime(),
        ctl,
        atl,
        tsb: ctl - atl,
        sleepDeficit
      });

      cur.setDate(cur.getDate() + 1);
    }

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

        const factor = zScore > 1.0 ? 1.0 + 0.15 * zScore : 1.0;

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
    recommendedRestSeconds: number = 120
  ) => {
    return predictAutoregWeight(
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
      todaySleepQuality || 80
    );
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
    (window as any).kratosAutoreg2 = {
      compute: computeAutoregRecommendation,
      train: trainAutoreg
    };
  }, [todaySleepQuality, session?.user?.id]);

  // Unified fatigue detection & rest extension computation for Cross-Talk and PMC widget
  const isSleepFatigued = !!(todaySleepQuality && todaySleepQuality < 75);
  const isStepsFatigued = !!(todaySteps && todaySteps > 12000);
  const isCardioFatigued = !!(currentPMC && currentPMC.tsb < -10);
  const isZScoreFatigued = !!(aiStressConfig && aiStressConfig.factor > 1.0);

  const isAnyFatigueDetected = isSleepFatigued || isStepsFatigued || isCardioFatigued || isZScoreFatigued;

  const fatigueSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (isSleepFatigued) parts.push(`Sleep: ${todaySleepQuality}%`);
    if (isStepsFatigued) parts.push(`Stappen: ${todaySteps?.toLocaleString()}`);
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

  // Helper for exercise name resolution
  const exerciseMap = useMemo(() => {
    return new Map(exercises.map(e => [e.id, e]));
  }, [exercises]);

  // 4. Exercise Manager Actions
  const handleSaveExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id || !exerciseForm.name) return;

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
        .eq('id', editingExercise.id);
      
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
    if (!window.confirm("Are you sure you want to delete this exercise?")) return;
    const { error } = await supabase
      .from('kratos_exercises')
      .update({ deleted: true })
      .eq('id', id);

    if (!error) fetchData();
  };

  const handleDeleteWorkout = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this workout from the logbook?")) return;
    const { error } = await supabase
      .from('kratos_workouts')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchData();
    } else {
      alert("Error deleting: " + error.message);
    }
  };

  const handleEditWorkoutClick = (w: Workout) => {
    setEditingWorkout(w);
    setWorkoutForm({
      name: w.name,
      completed_at: new Date(new Date(w.completed_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      started_at: new Date(new Date(w.started_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      sets: JSON.parse(JSON.stringify(w.sets))
    });
    setIsWorkoutModalOpen(true);
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
          const weight = Number(s.weight || 0);
          const reps = Number(s.reps || 0);
          const effectiveWeight = isBodyweight ? (latestBodyweight + weight) : weight;
          newVolume += effectiveWeight * reps;
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
      .eq('id', editingWorkout.id);

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

  const handleRemoveExerciseFromLog = (exIdx: number) => {
    if (!window.confirm("Are you sure you want to delete this exercise from the workout?")) return;
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
        .eq('id', editingTemplate.id);
      
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
    if (!window.confirm("Are you sure you want to delete this template?")) return;
    const { error } = await supabase
      .from('kratos_templates')
      .delete()
      .eq('id', id);

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
            dateStr: new Date(w.completed_at).toLocaleDateString('nl-NL', { month: 'short', day: 'numeric' }),
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

  // Loading screen
  if (loadingSession) {
    return (
      <div className="kratos-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
          Kratos initialiseren...
        </div>
      </div>
    );
  }

  // Not logged in fallback
  if (!session) {
    return (
      <div className="kratos-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 24, textAlign: 'center' }}>
        <Dumbbell size={48} style={{ color: '#cbd5e1', marginBottom: 20 }} />
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 900, color: '#fff', margin: '0 0 10px' }}>ZENITH KRATOS</h1>
        <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 360, margin: '0 0 24px', lineHeight: 1.6 }}>
          Log in via the main screen of Zenith Hub to access the Kratos Strength & Conditioning extension.
        </p>
      </div>
    );
  }

  const renderHypertrophyTab = () => {
    const dataPoints = measurements
      .map(m => {
        const mDate = new Date(m.logged_at);
        const cumVolume = workouts
          .filter(w => new Date(w.completed_at) <= mDate)
          .reduce((sum, w) => sum + (w.volume || 0), 0);

        return {
          dateStr: new Date(m.logged_at).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }),
          rawDate: mDate,
          measurement: m[selectedCircumference] !== null ? Number(m[selectedCircumference]) : null,
          volume: cumVolume
        };
      })
      .filter(d => d.measurement !== null)
      .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

    let rValue = 0;
    let rStatus = 'Onvoldoende data';
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

      if (selectedCircumference === 'waist_cm' || selectedCircumference === 'body_fat_pct') {
        if (rValue <= -0.5) {
          rStatus = 'Sterke Recompositie (Perfect!)';
          rColor = 'var(--accent-neon)';
          rExplanation = 'Geweldig! Je vetpercentage/tailleomtrek daalt gestaag naarmate je totale volume toeneemt.';
        } else if (rValue < 0) {
          rStatus = 'Gunstige Trend';
          rColor = '#3b82f6';
          rExplanation = 'Slight decrease in body fat/waist circumference correlated with your training volume.';
        } else {
          rStatus = 'Neutraal / Stagnatie';
          rColor = '#ff9f43';
          rExplanation = 'Your waist circumference/body fat is increasing or remaining plateaued relative to volume. Consider adjusting nutrition.';
        }
      } else {
        if (rValue >= 0.6) {
          rStatus = 'Sterk Hypertrofisch Antwoord';
          rColor = 'var(--accent-neon)';
          rExplanation = 'Excellent! Your muscle circumference is increasing directly in proportion to your cumulative volume.';
        } else if (rValue >= 0.3) {
          rStatus = 'Matige Correlatie';
          rColor = '#3b82f6';
          rExplanation = 'A positive muscle hypertrophy trend is visible linked to your training volume.';
        } else if (rValue > -0.3) {
          rStatus = 'Zwakke Correlatie / Plateau';
          rColor = '#94a3b8';
          rExplanation = 'Little change in muscle circumference relative to volume increase. Intensity (RIR) may be too low or recovery (sleep/protein) insufficient.';
        } else {
          rStatus = 'Krimp / Atrofie';
          rColor = '#ef4444';
          rExplanation = 'Negative correlation: muscle circumference decreases despite volume increase. Pay close attention to overtraining or extreme calorie deficits.';
        }
      }
    }

    const metricNames: { [key: string]: string } = {
      body_fat_pct: 'Vetpercentage (%)',
      muscle_mass_kg: 'Muscle Mass (kg)',
      waist_cm: 'Tailleomtrek (cm)',
      chest_cm: 'Chestomtrek (cm)',
      shoulders_cm: 'Schouderomtrek (cm)',
      hips_cm: 'Heupomtrek (cm)',
      biceps_l_cm: 'Left Biceps (cm)',
      biceps_r_cm: 'Right Biceps (cm)',
      thigh_l_cm: 'Bovenbeen Links (cm)',
      thigh_r_cm: 'Bovenbeen Rechts (cm)',
      calves_l_cm: 'Kuit Links (cm)',
      calves_r_cm: 'Kuit Rechts (cm)',
      neck_cm: 'Nekomtrek (cm)'
    };

    return (
      <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="kratos-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 className="kratos-card-title" style={{ margin: 0 }}>Hypertrophy & Volume Correlatie</h3>
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
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', padding: 16, borderRadius: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Current Measurement</span>
              <strong style={{ fontSize: 20, color: '#fff', display: 'block', marginTop: 4 }}>
                {dataPoints.length > 0 ? `${dataPoints[dataPoints.length - 1].measurement} cm/%` : 'No data'}
              </strong>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', padding: 16, borderRadius: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Cumulatief Kratos Volume</span>
              <strong style={{ fontSize: 20, color: 'var(--accent-neon)', display: 'block', marginTop: 4 }}>
                {workouts.reduce((sum, w) => sum + (w.volume || 0), 0).toLocaleString('nl-NL')} kg
              </strong>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', padding: 16, borderRadius: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Pearson r Correlatie</span>
              <strong style={{ fontSize: 20, color: rColor, display: 'block', marginTop: 4 }}>
                {dataPoints.length >= 3 ? `${rValue.toFixed(3)}` : 'Onvoldoende data'}
              </strong>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', borderLeft: `4px solid ${rColor}`, padding: 14, borderRadius: '0 8px 8px 0', marginBottom: 24 }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: 12, fontWeight: 900, color: '#fff', textTransform: 'uppercase' }}>{rStatus}</h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{rExplanation}</p>
          </div>

          <div style={{ height: 300, width: '100%' }}>
            {dataPoints.length < 2 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                Not enough data to plot the chart. Add measurements in Zenith Vigor.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dataPoints} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="dateStr" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} stroke="var(--border-color)" />
                  <YAxis yAxisId="left" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} stroke="rgba(255,255,255,0.15)" domain={['auto', 'auto']} label={{ value: 'Measurement', angle: -90, position: 'insideLeft', fill: '#fff', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} stroke="rgba(57, 255, 20, 0.15)" domain={['auto', 'auto']} label={{ value: 'Cumulatief Volume (kg)', angle: 90, position: 'insideRight', fill: 'var(--accent-neon)', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#1c1c23', border: '1px solid var(--border-color)', borderRadius: 10 }}
                    labelStyle={{ color: '#fff', fontSize: 11, fontWeight: 700 }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="measurement" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} name={metricNames[selectedCircumference]} />
                  <Line yAxisId="right" type="monotone" dataKey="volume" stroke="var(--accent-neon)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Cumulatief Volume" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    );
  };

  const userName = session?.user?.user_metadata?.name || session?.user?.user_metadata?.fitness_profile?.name || 'Atleet';

  return (
    <div className="kratos-container">
      <div className="kratos-background">
        <div className="kratos-glow-radial" />
        <div className="kratos-glow-purple" />
      </div>
      {/* Header */}
      <header className="kratos-header animate-slide-down" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)', 
        padding: '16px 24px', 
        background: 'transparent',
        height: '70px',
        boxSizing: 'border-box',
        flexShrink: 0,
        marginBottom: '24px'
      }}>
        <div className="kratos-brand">
          <div>
            <h1 className="zh-hub-title" style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '0.5px', lineHeight: '1.2' }}>
              ZENITH <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>KRATOS</span>
            </h1>
            <p className="zh-hub-subtitle" style={{ fontSize: '9px', color: 'var(--text-muted)', margin: '4px 0 0', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Strength & Conditioning for {userName}
            </p>
          </div>
        </div>
      </header>

      {/* Navigation tabs bar in Vigor-style */}
      <nav className="kratos-nav" style={{ 
        display: 'flex', 
        gap: 8, 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid rgba(255,255,255,0.05)', 
        padding: '6px', 
        borderRadius: '14px', 
        margin: '0 28px 24px',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)'
      }}>
        <button 
          className={`kratos-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <LayoutDashboard size={13} /> Dashboard
        </button>
        <button 
          className={`kratos-nav-btn ${activeTab === 'routines' ? 'active' : ''}`}
          onClick={() => setActiveTab('routines')}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Settings size={13} /> Routines
        </button>
        <button 
          className={`kratos-nav-btn ${activeTab === 'exercises' ? 'active' : ''}`}
          onClick={() => setActiveTab('exercises')}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Dumbbell size={13} /> Exercises
        </button>
        <button 
          className={`kratos-nav-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <FileText size={13} /> Workout Log
        </button>
        <button 
          className={`kratos-nav-btn ${activeTab === 'hypertrophy' ? 'active' : ''}`}
          onClick={() => setActiveTab('hypertrophy')}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <TrendingUp size={13} /> Hypertrophy
        </button>
      </nav>      {/* Content */}
      <main className="kratos-content animate-fade-in">
        {/* ----------------- DASHBOARD TAB ----------------- */}
        {activeTab === 'dashboard' && (
          <div className="animate-slide-up">
            {/* PMC Widget */}
            <section className="kratos-pmc-card">
              <div className="kratos-pmc-metric">
                <span className="kratos-pmc-label">Fitness (CTL)</span>
                <span className="kratos-pmc-value">{currentPMC.ctl}</span>
              </div>
              <div className="kratos-pmc-metric">
                <span className="kratos-pmc-label">Fatigue (ATL)</span>
                <span className="kratos-pmc-value" style={{ color: '#ff7675' }}>{currentPMC.atl}</span>
              </div>
              <div className="kratos-pmc-metric">
                <span className="kratos-pmc-label">Form (TSB)</span>
                <span className="kratos-pmc-value" style={{ color: currentPMC.tsb >= 0 ? '#cbd5e1' : '#eccc68' }}>
                  {currentPMC.tsb >= 0 ? `+${currentPMC.tsb}` : currentPMC.tsb}
                </span>
              </div>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis dataKey="week" stroke="#94a3b8" style={{ fontSize: 10 }} />
                      <YAxis stroke="#94a3b8" style={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ background: '#1c1c23', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                        labelStyle={{ color: '#fff', fontWeight: 700 }}
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
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Detailweergave</span>
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
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                          <XAxis dataKey="dateStr" stroke="#64748b" style={{ fontSize: 8 }} />
                          <YAxis stroke="#64748b" style={{ fontSize: 8 }} />
                          <Tooltip contentStyle={{ background: '#1c1c23', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 10 }} />
                          <Line type="monotone" dataKey="estimated1RM" stroke="#cbd5e1" strokeWidth={2} activeDot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
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
                  <h3 className="kratos-card-title">Templates Bibliotheek</h3>
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
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>
                    No routines found. Create a new template to use in your strength workouts!
                  </div>
                ) : (
                  <table className="kratos-table">
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
                            <td style={{ fontWeight: 700, color: '#fff' }}>{temp.name}</td>
                            <td>
                              {temp.exercises.map(ex => exerciseMap.get(ex.exercise_id)?.name).filter(Boolean).join(', ')}
                            </td>
                            <td>{totalWorkingSets} sets</td>
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
                  <label className="kratos-label">Routine Naam</label>
                  <input 
                    type="text" 
                    className="kratos-input" 
                    value={templateName} 
                    onChange={(e) => setTemplateName(e.target.value)} 
                    placeholder="Atv. Push B, Leg Day, Fullbody" 
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
                                    <option value="working">Werkset</option>
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
                    <Check size={14} /> Routine Save
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
                  <h3 className="kratos-card-title">Exercisesbibliotheek</h3>
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
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>
                    No exercises found. Add one to start building routines!
                  </div>
                ) : (
                  <table className="kratos-table">
                    <thead>
                      <tr>
                        <th>Naam</th>
                        <th>Muscle Group</th>
                        <th>Stap (kg/lbs)</th>
                        <th>Eenheid</th>
                        <th>Target RIR</th>
                        <th>Cues / Notities</th>
                        <th style={{ textAlign: 'right' }}>Acties</th>
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
                            <td style={{ fontWeight: 700, color: '#fff' }}>{ex.name}</td>
                            <td>
                              <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.03)', padding: '2px 8px', borderRadius: 4 }}>{ex.category}</span>
                            </td>
                            <td>
                              +{ex.increment_weight} {ex.increment_per_side ? '(per side)' : '(total)'}{' '}
                              <span style={{ color: 'var(--accent-neon)', fontSize: 11, marginLeft: 4 }}>
                                {aiIncrementText}
                              </span>
                            </td>
                            <td style={{ textTransform: 'uppercase', fontWeight: 700 }}>{ex.weight_unit}</td>
                            <td>RIR {ex.default_rir}</td>
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
                      placeholder="Atv. Bench Press, Squat, Lat Pulldown"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="kratos-input-group">
                      <label className="kratos-label">Muscle Group / Categorie (Primaire Spier)</label>
                      <select 
                        className="kratos-select" 
                        value={exerciseForm.category} 
                        onChange={(e) => setExerciseForm({ ...exerciseForm, category: e.target.value as any })}
                      >
                        <option value="Chest">Chest</option>
                        <option value="Shoulders">Shoulders</option>
                        <option value="Biceps">Biceps (Upper Arms)</option>
                        <option value="Triceps">Triceps (Back of Arms)</option>
                        <option value="Forearms">Forearms (Onderarmen)</option>
                        <option value="Upper Back">Upper Back (Bovenrug)</option>
                        <option value="Lats">Lats (Latissimus Dorsi / Zijkant Rug)</option>
                        <option value="Lower Back">Lower Back (Lendenrug / Onderrug)</option>
                        <option value="Traps">Traps (Monnikskapspier)</option>
                        <option value="Quads">Quads (Front Thighs)</option>
                        <option value="Hamstrings">Hamstrings (Back Thighs)</option>
                        <option value="Glutes">Glutes (Zitvlak / Bilspieren)</option>
                        <option value="Calves">Calves</option>
                        <option value="Abs">Abs (Buikspieren)</option>
                        <option value="Obliques">Obliques (Schuine Buikspieren)</option>
                      </select>
                    </div>

                    <div className="kratos-input-group">
                      <label className="kratos-label">Eenheid (kg of lbs)</label>
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
                      <span>Secundaire Muscle Groupen (Optioneel)</span>
                      <span style={{ color: 'var(--accent-neon)', fontSize: 10 }}>Heatmap Coupling (50% impact)</span>
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {[
                        { key: 'chest', label: 'Chest' },
                        { key: 'deltoids', label: 'Shoulders' },
                        { key: 'biceps', label: 'Biceps' },
                        { key: 'triceps', label: 'Triceps' },
                        { key: 'upperBack', label: 'Bovenrug / Lats' },
                        { key: 'trapezius', label: 'Monnikskap' },
                        { key: 'lowerBack', label: 'Lendenrug' },
                        { key: 'quadriceps', label: 'Quads' },
                        { key: 'hamstring', label: 'Hamstrings' },
                        { key: 'gluteal', label: 'Zitvlak' },
                        { key: 'calves', label: 'Calves' },
                        { key: 'abs', label: 'Buikspieren' },
                        { key: 'obliques', label: 'Schuine Buik' },
                        { key: 'forearm', label: 'Onderarmen' }
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
                        placeholder="Atv. 2.5 of 1.0"
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
                            Stappen per kant
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
                            Lichaamsgewicht
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="kratos-input-group">
                      <label className="kratos-label">Standaard Target RIR</label>
                      <input 
                        type="number" 
                        className="kratos-input" 
                        required 
                        value={exerciseForm.default_rir} 
                        onChange={(e) => setExerciseForm({ ...exerciseForm, default_rir: Number(e.target.value) })}
                        placeholder="Atv. 2"
                      />
                    </div>
                  </div>

                  <div className="kratos-input-group" style={{ marginBottom: 24 }}>
                    <label className="kratos-label">Cues / Vorm Notities</label>
                    <textarea 
                      className="kratos-input" 
                      rows={3} 
                      value={exerciseForm.notes} 
                      onChange={(e) => setExerciseForm({ ...exerciseForm, notes: e.target.value })}
                      placeholder="Atv. Touch chest en druk explosief omhoog, ellebogen onder 45 graden."
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
            <div className="kratos-card">
              <h3 className="kratos-card-title">Training Logbook</h3>

              {workouts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>
                  No completed workouts logged. Start Kratos Pilot on your Android and log your first workout!
                </div>
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
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {new Date(w.completed_at).toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-secondary)' }} />
                              <span>Duration: {durationMins} min</span>
                              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-secondary)' }} />
                              <button onClick={() => handleEditWorkoutClick(w)} style={{ background: 'none', border: 'none', color: 'var(--accent-neon)', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 'bold' }}>Wijzig</button>
                              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-secondary)' }} />
                              <button onClick={() => handleDeleteWorkout(w.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 'bold' }}>Delete</button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 16, textAlign: 'right' }}>
                            <div>
                              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, display: 'block' }}>Total Volume</span>
                              <strong style={{ fontSize: 14, color: 'var(--accent-neon)' }}>{w.volume} kg</strong>
                            </div>
                            <div>
                              <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, display: 'block' }}>Cardio Recovery</span>
                              <strong style={{ fontSize: 14, color: '#fff' }}>
                                {w.cardio_stress_factor > 1.0 ? `+${Math.round((w.cardio_stress_factor - 1) * 100)}% rust` : 'Normaal'}
                              </strong>
                            </div>
                          </div>
                        </div>

                        {/* Exercise Sets breakdown */}
                        <div style={{ display: 'flex', flexFlow: 'row wrap', gap: 16 }}>
                          {w.sets.map((exLog, idx) => {
                            const ex = exerciseMap.get(exLog.exercise_id);
                            if (!ex) return null;
                            return (
                              <div key={idx} style={{ minWidth: 220, background: 'rgba(9,9,11,0.3)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
                                <strong style={{ fontSize: 12, color: '#fff', display: 'block', marginBottom: 6 }}>{ex.name}</strong>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {exLog.sets.map((s, sIdx) => (
                                    <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: s.type === 'warmup' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                                      <span>
                                        Set {sIdx + 1} {s.type === 'warmup' && <span style={{ fontSize: 9, opacity: 0.6 }}>(W)</span>}:
                                      </span>
                                      <strong>
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
              <div className="kratos-input-group">
                <label className="kratos-label">Workout Naam</label>
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
                  <label className="kratos-label">Start Datum/Tijd</label>
                  <input 
                    type="datetime-local" 
                    className="kratos-input" 
                    required 
                    value={workoutForm.started_at} 
                    onChange={(e) => setWorkoutForm({ ...workoutForm, started_at: e.target.value })}
                  />
                </div>
                <div className="kratos-input-group" style={{ flex: 1 }}>
                  <label className="kratos-label">Eind Datum/Tijd</label>
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
                  Wijzigingen Save
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
