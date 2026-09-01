import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Trash2, Edit, BookOpen, ChefHat, Sparkles, Check,
  ShieldAlert, Clock, Barcode, Activity,
  AlertTriangle, Pill
} from 'lucide-react';
import { supabase } from './utils/supabaseClient';
import { calculateZenithSleepScore, ZenithFusionNet, ZenithPageHeader, ZenithHeaderTab, ZenithEmptyState, ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE, fetchPlannedWorkouts, outstandingPlansForDate, CompletedActivity, fetchReadiness, feltToTarget, ReadinessEntry, plannedEnergyKcal, KCAL_PER_MIN_RUNNING_FALLBACK, strengthCaloriesFromVolume, plannedCarbShiftGrams, DISCIPLINE_LABELS, PlannedWorkout, resolveCurrentFtp, FTP_ESTIMATE_WINDOW_DAYS, FTP_FALLBACK_WATTS } from '@zenith/shared';
import { runZaneCalibration, generateTargets, ZaneProfile, ZaneOutput, DailyLogData, saveZaneCoefficients, loadZaneCoefficients, calculateMifflinBmr, calculateKatchMcArdleBmr, calculateAge, creatineSaturationStep, creatineWaterRetentionKg, isCorrelationMeaningful, CREATINE_BASELINE_SATURATION, CAFFEINE_KCAL_PER_MG_PRIOR } from './utils/zane';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import type { Ingredient, Recipe, FoodLog, DayState } from './types';
import { getMonday, addDays, formatDateString, toYYYYMMDD } from './utils/dates';
import { toDateKey, toDateKeyFromDate } from '@zenith/shared';
import { buildFusionTrainingSamples, measuredWeeklyRateKg } from './utils/fusionRetrain';
import { WeekDateSelector } from './components/WeekDateSelector';

/** Trims a portion count for display: 1, 1.5, 0.25 - never "1.0000000002". */
function formatPortions(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * One portion's worth of a recipe.
 *
 * The stored columns are totals for the whole recipe, which is exactly the trap
 * this exists to close - reading them as a portion overstated every logged meal
 * by however many portions the recipe made.
 */
export function perPortion(recipe: {
  calories: number; carbs: number; protein: number; fat: number;
  caffeine_mg?: number; servings?: number;
}) {
  const makes = Math.max(0.1, Number(recipe.servings) || 1);
  return {
    calories: recipe.calories / makes,
    carbs: recipe.carbs / makes,
    protein: recipe.protein / makes,
    fat: recipe.fat / makes,
    caffeine_mg: (Number(recipe.caffeine_mg) || 0) / makes,
    makes
  };
}

function App() {
  // Auth & Session
  const [loadingSession, setLoadingSession] = useState(true);
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('Athlete');

  // Active Tab: dashboard, logbook, ingredients, recipes, supplements
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logbook' | 'ingredients' | 'recipes' | 'supplements'>('dashboard');

  // Weekly Navigation States
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => getMonday(new Date()));
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => formatDateString(new Date()));

  // Database Data
  const [profile, setProfile] = useState<ZaneProfile>({
    height: 175,
    gender: 'other',
    birthDate: '1990-01-01',
    targetWeight: 75,
    targetRateKgPerWeek: 0.5,
    dietType: 'balanced'
  });
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [weeklyFoodLogs, setWeeklyFoodLogs] = useState<FoodLog[]>([]);
  const [thirtyDayFoodLogs, setThirtyDayFoodLogs] = useState<any[]>([]);
  const [supplementsLogs, setSupplementsLogs] = useState<any[]>([]);
  const [weeklyDayStates, setWeeklyDayStates] = useState<DayState[]>([]);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [sleepLogs, setSleepLogs] = useState<any[]>([]);
  const [gymLogs, setGymLogs] = useState<any[]>([]);
  const [bodyMeasurementsLogs, setBodyMeasurementsLogs] = useState<any[]>([]);
  const [activeCaloriesMap, setActiveCaloriesMap] = useState<{ [date: string]: number }>({});
  const [gymVolumeMap, setGymVolumeMap] = useState<{ [date: string]: number }>({});
  const [zaneHistory, setZaneHistory] = useState<any[]>([]);

  // ZANE Output
  const [zaneResult, setZaneResult] = useState<ZaneOutput>({
    bmrOffset: 0,
    todayTdee: 0,
    todayBreakdown: {
      bmr: 0, neat: 0, activeCalories: 0, gymCalories: 0, caffeineCalories: 0,
      sleepAdjustment: 0, weekendAdjustment: 0, metabolicOffset: 0, adaptationPenalty: 0
    },
    sleepQualityCoeff: 0,
    sleepDurationCoeff: 0,
    gymVolumeCoeff: 0.025, // matches the engine's own baseline prior in zane.ts
    caffeineCoeff: 0.15,
    weekendCoeff: 0,
    adaptationFactor: 1.0,
    sustainedCutDays: 0,
    calculatedAt: '',
    isCalibrated: false,
    calibrationDays: 0,
    dailyCalorieTarget: 2000,
    dailyCarbTarget: 250,
    dailyProteinTarget: 100,
    dailyFatTarget: 67,
    sleepQualityAvg: 75,
    sleepDurationAvg: 8,
    energyPerKgTissue: 7700
  });

  // UI States
  const [showLogModal, setShowLogModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [showCopyDayModal, setShowCopyDayModal] = useState(false);
  const [notification, setNotification] = useState<{ text: string; isError: boolean } | null>(null);

  // Editing States
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingLogEntry, setEditingLogEntry] = useState<any | null>(null);

  // Autocomplete / Search States
  const [logIngredientSearch, setLogIngredientSearch] = useState('');
  const [showLogIngDropdown, setShowLogIngDropdown] = useState(false);
  
  const [logRecipeSearch, setLogRecipeSearch] = useState('');
  const [showLogRecDropdown, setShowLogRecDropdown] = useState(false);
  
  const [recipeIngSearch, setRecipeIngSearch] = useState('');
  const [showRecipeIngDropdown, setShowRecipeIngDropdown] = useState(false);

  const [ingDatabaseSearch, setIngDatabaseSearch] = useState('');

  // Copy Day Fields
  const [copyTargetDate, setCopyTargetDate] = useState('');

  // Quick Log Fields
  const [logMealType, setLogMealType] = useState('breakfast');
  const [logHour, setLogHour] = useState('08:00');
  const [logSource, setLogSource] = useState<'quick' | 'ingredient' | 'recipe'>('quick');
  const [quickName, setQuickName] = useState('');
  const [quickCalories, setQuickCalories] = useState('');
  const [quickCarbs, setQuickCarbs] = useState('');
  
  // Supplement Log Fields
  // What is scheduled but not yet done. Fuel had no idea a hard ride was planned for
  // today, so a 3-hour ride day got the same calorie and macro targets as a rest day
  // right up until the ride had already happened - which is exactly backwards, since
  // the point of a target is to eat for the day ahead.
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  /** What was actually done, so a plan that has been carried out stops being counted. */
  const [completedActivities, setCompletedActivities] = useState<CompletedActivity[]>([]);
  const [readinessByDay, setReadinessByDay] = useState<Record<string, ReadinessEntry>>({});
  /** Completeness flags over the whole calibration window, not just this week. */
  const [thirtyDayStates, setThirtyDayStates] = useState<{ date: string; is_complete: boolean }[]>([]);
  // Threshold power for costing a planned ride. Resolved from real rides rather than
  // the profile field, which defaults to 220 W and nobody has changed - see
  // resolveCurrentFtp.
  const [currentFtp, setCurrentFtp] = useState<{ watts: number; source: 'measured' | 'profile' | 'default' }>(
    { watts: FTP_FALLBACK_WATTS, source: 'default' }
  );

  const [logSuppType, setLogSuppType] = useState<'creatine' | 'caffeine'>('creatine');
  const [logSuppAmount, setLogSuppAmount] = useState('5');
  const [logSuppHour, setLogSuppHour] = useState('08:00');
  const [quickProtein, setQuickProtein] = useState('');
  const [quickFat, setQuickFat] = useState('');

  // Edit quantity and base macros states
  const [logQuantity, setLogQuantity] = useState('1.0');
  const [logGrams, setLogGrams] = useState('100');
  const [baseMacros, setBaseMacros] = useState<{ calories: number; carbs: number; protein: number; fat: number } | null>(null);

  // Log Ingredient Selection
  const [selectedLogIngredient, setSelectedLogIngredient] = useState<string>('');
  const [logIngredientWeightMode, setLogIngredientWeightMode] = useState<'grams' | 'portions'>('grams');
  const [logIngredientWeightValue, setLogIngredientWeightValue] = useState('100');

  // Log Recipe Selection
  const [selectedLogRecipe, setSelectedLogRecipe] = useState<string>('');
  const [logRecipeServings, setLogRecipeServings] = useState('1.0');

  // Ingredient Form Fields
  const [ingName, setIngName] = useState('');
  const [ingBarcode, setIngBarcode] = useState('');
  const [ingKcal, setIngKcal] = useState('');
  const [ingCarbs, setIngCarbs] = useState('');
  const [ingProtein, setIngProtein] = useState('');
  const [ingFat, setIngFat] = useState('');
  const [ingPortionName, setIngPortionName] = useState('');
  const [ingPortionWeight, setIngPortionWeight] = useState('');
  const [ingPortionsPackage, setIngPortionsPackage] = useState('');
  const [ingCaffeine, setIngCaffeine] = useState('0');
  const [barcodeSearching, setBarcodeSearching] = useState(false);

  // Recipe Form Fields
  const [recName, setRecName] = useState('');
  const [recDesc, setRecDesc] = useState('');
  const [recCategory, setRecCategory] = useState('baseline');
  const [recServingSize, setRecServingSize] = useState('1 portion');
  const [recServings, setRecServings] = useState('1');
  const [recIngredients, setRecIngredients] = useState<any[]>([]);
  const [recInstructions, setRecInstructions] = useState<string[]>(['']);

  // Dynamic helper values
  const [selectedRecipeIngId, setSelectedRecipeIngId] = useState('');
  const [recipeIngQty, setRecipeIngQty] = useState('100');
  const [recipeIngMode, setRecipeIngMode] = useState<'grams' | 'portions'>('grams');

  // Auth Handshake via Hash params
  useEffect(() => {
    async function handleAuthHandshake() {
      const hash = window.location.hash;
      let token: string | null = null;
      let refresh: string | null = null;

      if (hash) {
        const params = new URLSearchParams(hash.replace('#', '?'));
        token = params.get('access_token');
        refresh = params.get('refresh_token');
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      if (token && refresh) {
        const { data, error } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: refresh
        });

        if (!error && data?.session) {
          setUserId(data.session.user.id);
          setLoadingSession(false);
          return;
        }
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession) {
        setUserId(currentSession.user.id);
      }
      setLoadingSession(false);
    }

    handleAuthHandshake();
  }, []);

  // Fetch username on userId change
  useEffect(() => {
    async function loadUserName() {
      if (!userId) return;
      try {
        const { data: userDetails } = await supabase.auth.getUser();
        const name = userDetails?.user?.user_metadata?.name || userDetails?.user?.user_metadata?.fitness_profile?.name || 'Athlete';
        setUserName(name);
      } catch (e) {
        console.error(e);
      }
    }
    loadUserName();
  }, [userId]);

  // Show Temporary Notifications
  const triggerNotification = (text: string, isError = false) => {
    setNotification({ text, isError });
    setTimeout(() => setNotification(null), 3500);
  };

  // Fetch Database Data
  const fetchData = useCallback(async () => {
    if (!userId) return;

    try {
      // Initialize SOTA ML ZenithFusionNet weights
      await ZenithFusionNet.getInstance().init(supabase, userId);

      // 1. Fetch Profile
      let { data: profileData, error: pError } = await supabase
        .from('fuel_profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (pError && pError.code === 'PGRST116') {
        const { data: userDetails } = await supabase.auth.getUser();
        const profileMeta = userDetails?.user?.user_metadata || {};
        const fitProfile = profileMeta.fitness_profile || {};

        const defaultProfile = {
          user_id: userId,
          target_weight: fitProfile.weight || 75.0,
          target_rate_kg_per_week: 0.5,
          diet_type: 'balanced',
          learned_bmr_offset: 0.0,
          learned_sleep_quality_coeff: 0.0,
          learned_sleep_duration_coeff: 0.0
        };

        const { data: inserted, error: insertError } = await supabase
          .from('fuel_profile')
          .insert(defaultProfile)
          .select()
          .single();

        if (!insertError) {
          profileData = inserted;
        }
      }

      const { data: ssotProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const heightVal = ssotProfile?.height_cm || 175;
      const targetWeightVal = profileData?.target_weight || 75;
      const priorWeights = await loadZaneCoefficients(supabase, userId);

      setProfile({
        height: heightVal,
        gender: ssotProfile?.gender || 'other',
        birthDate: ssotProfile?.birth_date || '1990-01-01',
        targetWeight: targetWeightVal,
        targetRateKgPerWeek: profileData?.target_rate_kg_per_week ?? 0.5,
        dietType: profileData?.diet_type ?? 'balanced',
        priorBmrOffset: priorWeights?.bmrOffset ?? profileData?.learned_bmr_offset ?? undefined,
        priorSleepQualityCoeff: priorWeights?.sleepQualityCoeff ?? profileData?.learned_sleep_quality_coeff ?? undefined,
        priorSleepDurationCoeff: priorWeights?.sleepDurationCoeff ?? profileData?.learned_sleep_duration_coeff ?? undefined,
        priorGymVolumeCoeff: priorWeights?.gymVolumeCoeff ?? undefined,
        priorCaffeineCoeff: priorWeights?.caffeineCoeff ?? undefined,
        priorWeekendCoeff: priorWeights?.weekendCoeff ?? undefined
      });

      // 2-8. The viewed week's food/supplement/completeness data plus 30-day Vigor/
      // Aero/Stride/Kratos history — 11 reads, all independent of each other and of
      // the profile resolution above. Batched in groups of 3 (not fired all 11 at
      // once, and not run fully sequentially): this project's Supabase compute tier
      // has been observed to time out otherwise-trivial queries under a full
      // simultaneous burst, while 11 sequential round trips made mount noticeably slow.
      const startOfWeek = new Date(currentWeekMonday);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = addDays(startOfWeek, 7);
      const startOfWeekStr = formatDateString(startOfWeek);
      const endOfWeekStr = formatDateString(addDays(startOfWeek, 6));
      const startOf30Days = new Date();
      startOf30Days.setDate(startOf30Days.getDate() - 30);

      const chunk = <T,>(arr: T[], size: number): T[][] =>
        Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

      const bulkQueries = [
        () => supabase.from('fuel_ingredients').select('*').eq('user_id', userId).order('name'),
        () => supabase.from('fuel_recipes').select('*').eq('user_id', userId).order('name'),
        () => supabase.from('fuel_logs').select('*').eq('user_id', userId).gte('logged_at', startOfWeek.toISOString()).lt('logged_at', endOfWeek.toISOString()).order('logged_at'),
        () => supabase.from('fuel_supplements_log').select('*').eq('user_id', userId).gte('logged_at', startOf30Days.toISOString()).order('logged_at'),
        () => supabase.from('fuel_days').select('date, is_complete').eq('user_id', userId).gte('date', startOfWeekStr).lte('date', endOfWeekStr),
        () => supabase.from('vigor_weight').select('weight, logged_at').eq('user_id', userId).gte('logged_at', startOf30Days.toISOString()).order('logged_at'),
        () => supabase.from('vigor_body_measurements').select('body_fat_pct, muscle_mass_kg, logged_at').eq('user_id', userId).gte('logged_at', startOf30Days.toISOString()).order('logged_at'),
        () => supabase.from('vigor_sleep').select('duration_minutes, quality_score, deep_minutes, rem_minutes, hrv_ms, resting_hr, logged_at').eq('user_id', userId).gte('logged_at', startOf30Days.toISOString()).order('logged_at'),
        () => supabase.from('rides').select('date, metadata').eq('user_id', userId).gte('date', startOfWeek.getTime()).lt('date', endOfWeek.getTime()),
        () => supabase.from('stride_activities').select('date, calories, duration_sec').eq('user_id', userId).gte('date', startOfWeekStr).lte('date', endOfWeekStr),
        () => supabase.from('kratos_workouts').select('volume, completed_at, template_id, is_off_day').eq('user_id', userId).gte('completed_at', startOfWeek.toISOString()).lt('completed_at', endOfWeek.toISOString()),
      ];

      const bulkResults: any[] = [];
      for (const batch of chunk(bulkQueries, 3)) {
        bulkResults.push(...await Promise.all(batch.map(q => q())));
      }

      const [
        { data: ingData },
        { data: recData },
        { data: logData },
        { data: suppLogData },
        { data: completeData },
        { data: wLogs },
        { data: bMeasureLogs },
        { data: sLogs },
        { data: ridesData },
        { data: strideData },
        { data: kratosData },
      ] = bulkResults;

      setIngredients(ingData || []);
      setRecipes(recData || []);
      setWeeklyFoodLogs(logData || []);
      setSupplementsLogs(suppLogData || []);
      setWeeklyDayStates(completeData || []);
      setWeightLogs(wLogs || []);
      setBodyMeasurementsLogs(bMeasureLogs || []);
      setSleepLogs(sLogs || []);

      // A fortnight either side, so moving a plan in the calendar is reflected here
      // without needing a particular week to be open.
      const planFrom = formatDateString(addDays(startOfWeek, -14));
      const planTo = formatDateString(addDays(startOfWeek, 14));
      setPlannedWorkouts(await fetchPlannedWorkouts(supabase, userId, planFrom, planTo));

      // How the athlete said they felt. The only independent read on recovery this
      // app has - everything else it could use is already one of the model's inputs.
      setReadinessByDay(await fetchReadiness(supabase, userId, 60));

      // Rides over the FTP window, purely to resolve a current threshold. The weekly
      // ride query above is too narrow: a week with no riding would drop the estimate
      // to the profile default, which is 220 W for everyone because nobody has ever
      // edited it.
      const ftpSince = Date.now() - FTP_ESTIMATE_WINDOW_DAYS * 86400000;
      const { data: ftpRides } = await supabase
        .from('rides').select('date, metadata')
        .eq('user_id', userId).gte('date', ftpSince);
      const { data: profileRow } = await supabase
        .from('profiles').select('ftp_watts').eq('id', userId).maybeSingle();
      setCurrentFtp(resolveCurrentFtp(ftpRides as any, profileRow?.ftp_watts));

      const activeCalMap: { [date: string]: number } = {};
      for (let i = 0; i < 7; i++) {
        activeCalMap[formatDateString(addDays(startOfWeek, i))] = 0;
      }

      ridesData?.forEach((r: any) => {
        let witha = r.metadata;
        if (typeof witha === 'string') {
          try { witha = JSON.parse(witha); } catch { witha = {}; }
        }
        const dStr = formatDateString(new Date(Number(r.date)));
        if (activeCalMap[dStr] !== undefined) {
          activeCalMap[dStr] += Number(witha?.calories ?? 0);
        }
      });

      strideData?.forEach((s: any) => {
        const dStr = s.date;
        if (activeCalMap[dStr] === undefined) return;
        // `s.duration_sec || 1231` invented a twenty-minute run for any record
        // missing a duration - and 1231 is not a neutral guess, it is the length of
        // one particular treadmill session that happened to be in the data. A run
        // with neither a calorie figure nor a duration is unknown, and unknown adds
        // nothing rather than adding a number lifted from somebody's Tuesday.
        const kcal = Number(s.calories) > 0
          ? Number(s.calories)
          : Math.round(((Number(s.duration_sec) || 0) / 60) * KCAL_PER_MIN_RUNNING_FALLBACK);
        if (kcal > 0) activeCalMap[dStr] += kcal;
      });

      const gymVolMap: { [date: string]: number } = {};
      for (let i = 0; i < 7; i++) {
        gymVolMap[formatDateString(addDays(startOfWeek, i))] = 0;
      }

      kratosData?.forEach((k: any) => {
        const dStr = formatDateString(new Date(k.completed_at));
        if (gymVolMap[dStr] !== undefined) {
          gymVolMap[dStr] += Number(k.volume || 0);
        }
      });

      // What was actually done this week. planned_workouts.completed_at is never
      // written, so without matching these against the plans a session that has been
      // finished keeps being charged twice: once as a planned estimate and again as
      // the real activity, on exactly the days the athlete trained hardest.
      setCompletedActivities([
        ...(ridesData || []).map((r: any) => ({
          discipline: 'aero' as const,
          dateKey: formatDateString(new Date(Number(r.date)))
        })),
        ...(kratosData || []).filter((k: any) => !k.is_off_day).map((k: any) => ({
          discipline: 'kratos' as const,
          dateKey: formatDateString(new Date(k.completed_at)),
          templateId: k.template_id ?? null
        })),
        ...(strideData || []).map((s: any) => ({
          discipline: 'stride' as const,
          dateKey: String(s.date)
        }))
      ]);

      setActiveCaloriesMap(activeCalMap);
      setGymVolumeMap(gymVolMap);

      // Parameter history is now calculated dynamically in fetchCalibrationLogs client-side.

    } catch (err) {
      console.error("Error fetching data:", err);
    }
  }, [userId, currentWeekMonday]);

  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId, fetchData]);

  // Group food logs by date for card stats
  const dailyCaloriesMap = useMemo(() => {
    const map: { [date: string]: number } = {};
    weeklyFoodLogs.forEach(log => {
      const dStr = log.logged_at.split('T')[0];
      map[dStr] = (map[dStr] || 0) + log.calories;
    });
    return map;
  }, [weeklyFoodLogs]);

  const dailyProteinMap = useMemo(() => {
    const map: { [date: string]: number } = {};
    weeklyFoodLogs.forEach(log => {
      const dStr = log.logged_at.split('T')[0];
      map[dStr] = (map[dStr] || 0) + Number(log.protein || 0);
    });
    return map;
  }, [weeklyFoodLogs]);

  const dailyCarbsMap = useMemo(() => {
    const map: { [date: string]: number } = {};
    weeklyFoodLogs.forEach(log => {
      const dStr = log.logged_at.split('T')[0];
      map[dStr] = (map[dStr] || 0) + Number(log.carbs || 0);
    });
    return map;
  }, [weeklyFoodLogs]);

  const dailyFatMap = useMemo(() => {
    const map: { [date: string]: number } = {};
    weeklyFoodLogs.forEach(log => {
      const dStr = log.logged_at.split('T')[0];
      map[dStr] = (map[dStr] || 0) + Number(log.fat || 0);
    });
    return map;
  }, [weeklyFoodLogs]);

  /**
   * Which days the athlete has explicitly marked incomplete.
   *
   * fuel_days records EXCLUSIONS: a day with no row is a normal day and counts, which
   * is why every reader here is `map[date] ?? true`.
   *
   * This used to be built from weeklyDayStates - the current week only - and then
   * handed to a THIRTY-day retrain. Every day excluded before this week looked like a
   * day nobody had said anything about, so it was trained on regardless. This athlete
   * has nine such days between 3 and 30 August; eight of them were being used to fit
   * the daily burn model after being explicitly ruled out.
   */
  const dailyCompletionMap = useMemo(() => {
    const map: { [date: string]: boolean } = {};
    for (const s of thirtyDayStates) map[s.date] = s.is_complete;
    // The current week is fetched separately and is fresher: a day toggled a moment
    // ago is here before the 30-day read catches up.
    for (const s of weeklyDayStates) map[s.date] = s.is_complete;
    return map;
  }, [thirtyDayStates, weeklyDayStates]);

  const selectedDateActiveCalories = useMemo(() => activeCaloriesMap[selectedDateStr] || 0, [activeCaloriesMap, selectedDateStr]);
  const selectedDateGymVolume = useMemo(() => gymVolumeMap[selectedDateStr] || 0, [gymVolumeMap, selectedDateStr]);
  const selectedDateCaloriesIntake = useMemo(() => dailyCaloriesMap[selectedDateStr] || 0, [dailyCaloriesMap, selectedDateStr]);
  const selectedDateProtein = useMemo(() => dailyProteinMap[selectedDateStr] || 0, [dailyProteinMap, selectedDateStr]);
  const selectedDateCarbs = useMemo(() => dailyCarbsMap[selectedDateStr] || 0, [dailyCarbsMap, selectedDateStr]);
  const selectedDateFat = useMemo(() => dailyFatMap[selectedDateStr] || 0, [dailyFatMap, selectedDateStr]);
  const selectedDateComplete = useMemo(() => dailyCompletionMap[selectedDateStr] ?? true, [dailyCompletionMap, selectedDateStr]);

  // Run ZANE Adaptive Calibration
  useEffect(() => {
    if (!userId) return;

    // Debounced: this effect does an O(n^2) regression re-solve (one full
    // ridge-regression call per historical day, for the trend chart) plus
    // four Supabase fetches, and several of the dependencies below change on
    // every keystroke while editing today's log. Coalesce rapid edits into a
    // single recompute after a short pause instead of re-running the whole
    // pipeline on every keystroke. Indentation below is left as-is (not
    // re-indented into the new closure) to keep this diff reviewable.
    const zaneDebounceId = setTimeout(() => {

    const logsMap: { [date: string]: DailyLogData } = {};
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = toDateKeyFromDate(d);
      logsMap[dateStr] = {
        date: dateStr,
        weight: null,
        calories: 0,
        activeCalories: 0,
        sleepQuality: null,
        sleepDurationHours: null,
        // Default true (a day counts unless explicitly marked incomplete), matching
        // selectedDateComplete's own default a few lines up and the "mark day
        // incomplete" toggle's own framing ("excluded from Zenith"). The prior
        // "Bug #1 fix" comment here inverted this to default false, which meant a
        // day only ever counted toward calibration if the user had explicitly
        // clicked "mark complete" on it via fuel_days - so real users who never
        // touch that toggle could never reach the 14-day calibration threshold
        // no matter how much they'd actually logged. The calories>=1000 && weight
        // check below already guards against empty/placeholder days counting.
        isComplete: true,
        gymVolume: 0,
        creatine: 0,
        caffeine: 0,
        protein: 0,
        carbs: 0,
        fat: 0
      };
    }

    weightLogs.forEach(w => {
      const dStr = w.logged_at.split('T')[0];
      if (logsMap[dStr]) {
        logsMap[dStr].weight = Number(w.weight);
      }
    });

    bodyMeasurementsLogs.forEach(b => {
      const dStr = b.logged_at.split('T')[0];
      if (logsMap[dStr]) {
        logsMap[dStr].bodyFat = b.body_fat_pct !== null ? Number(b.body_fat_pct) : null;
        logsMap[dStr].muscleMass = b.muscle_mass_kg !== null ? Number(b.muscle_mass_kg) : null;
      }
    });

    sleepLogs.forEach(s => {
      const dStr = s.logged_at.split('T')[0];
      if (logsMap[dStr]) {
        // Two bugs lived on this line.
        //
        // Number(null) is 0, not null - so every night the wearable didn't
        // supply a quality score was handed to the regression as a score of
        // ZERO. ZANE only falls back to the athlete's average when the value is
        // strictly null, so a real-looking 0 sailed through: on this athlete,
        // 12 of 17 nights, each an ~85-point negative deviation from their own
        // average. That is what the learned sleep-quality coefficient was
        // mostly fitting.
        //
        // And Zenith computes its own sleep score from the stage data
        // (calculateZenithSleepScore) - the same fallback used for today's
        // figure a few hundred lines below - but the calibration path ignored
        // it and read the raw column only. Use the score when the wearable
        // gives one, fall back to Zenith's own, and only then admit we don't
        // know.
        // Only score a night we can actually score. Without stage data the
        // engine has nothing to judge but duration and returns 98-100 for
        // almost anything, so filling those in would swap one fake signal
        // (a literal 0) for another (a near-constant 99). Left null, ZANE
        // falls back to this athlete's own average, which is what it is
        // designed to do for a night it doesn't know about.
        const rawScore = Number(s.quality_score);
        const hasStageData = s.deep_minutes != null || s.rem_minutes != null;
        const derived = rawScore > 0
          ? rawScore
          : (hasStageData && Number(s.duration_minutes) > 0
              ? calculateZenithSleepScore(s, sleepLogs).score
              : 0);
        logsMap[dStr].sleepQuality = derived > 0 ? derived : null;
        logsMap[dStr].sleepDurationHours = Number(s.duration_minutes) / 60;
      }
    });

    const fetchCalibrationLogs = async () => {
      const startOf30Days = new Date();
      startOf30Days.setDate(startOf30Days.getDate() - 30);
      const startOf30DaysMs = startOf30Days.getTime();

      // These 5 reads are independent of each other (each only feeds its own slice
      // of logsMap below) — fired together instead of as 5 sequential round trips.
      const [
        { data: foodHist },
        { data: daysHist },
        { data: ridesHist },
        { data: gymHist },
        { data: runsHist },
      ] = await Promise.all([
        supabase.from('fuel_logs').select('logged_at, calories, caffeine_mg, protein, carbs, fat').eq('user_id', userId).gte('logged_at', startOf30Days.toISOString()),
        supabase.from('fuel_days').select('date, is_complete').eq('user_id', userId).gte('date', toDateKeyFromDate(startOf30Days)),
        supabase.from('rides').select('date, metadata').eq('user_id', userId).gte('date', startOf30DaysMs),
        supabase.from('kratos_workouts').select('volume, completed_at').eq('user_id', userId).gte('completed_at', startOf30Days.toISOString()),
        // Runs. This history is what the adaptive burn is regressed against, and it
        // has never contained a single run - only rides and gym sessions. So every
        // day the athlete ran was fed to the model as a day they did nothing, and the
        // model duly concluded they burn less than they do.
        supabase.from('stride_activities').select('date, calories, duration_sec').eq('user_id', userId).gte('date', toDateKeyFromDate(startOf30Days)),
      ]);

      setThirtyDayFoodLogs(foodHist || []);

      foodHist?.forEach(f => {
        const dStr = toYYYYMMDD(f.logged_at);
        if (logsMap[dStr]) {
          logsMap[dStr].calories += Number(f.calories);
          logsMap[dStr].caffeine = (logsMap[dStr].caffeine || 0) + Number(f.caffeine_mg || 0);
          logsMap[dStr].protein = (logsMap[dStr].protein || 0) + Number(f.protein || 0);
          logsMap[dStr].carbs = (logsMap[dStr].carbs || 0) + Number(f.carbs || 0);
          logsMap[dStr].fat = (logsMap[dStr].fat || 0) + Number(f.fat || 0);
        }
      });

      setThirtyDayStates((daysHist ?? []) as { date: string; is_complete: boolean }[]);

      daysHist?.forEach(d => {
        if (logsMap[d.date]) {
          logsMap[d.date].isComplete = d.is_complete;
        }
      });

      ridesHist?.forEach(r => {
        const dStr = toDateKey(Number(r.date));
        if (logsMap[dStr]) {
          let witha = r.metadata;
          if (typeof witha === 'string') {
            try { witha = JSON.parse(witha); } catch { witha = {}; }
          }
          logsMap[dStr].activeCalories += Number(witha?.calories ?? 0);
        }
      });

      runsHist?.forEach(r => {
        const dStr = String(r.date);
        if (!logsMap[dStr]) return;
        // The same fallback the weekly view uses: a run with no calorie figure is
        // costed from its duration rather than counted as zero.
        const kcal = Number(r.calories) > 0
          ? Number(r.calories)
          : Math.round(((Number(r.duration_sec) || 0) / 60) * KCAL_PER_MIN_RUNNING_FALLBACK);
        if (kcal > 0) logsMap[dStr].activeCalories += kcal;
      });

      setGymLogs(gymHist || []);

      gymHist?.forEach(k => {
        const dStr = toYYYYMMDD(k.completed_at);
        if (logsMap[dStr]) {
          logsMap[dStr].gymVolume += Number(k.volume || 0);
        }
      });

      supplementsLogs.forEach(s => {
        const dStr = toYYYYMMDD(s.logged_at);
        if (logsMap[dStr]) {
          if (s.supplement_type === 'creatine') {
            logsMap[dStr].creatine = (logsMap[dStr].creatine || 0) + Number(s.amount);
          } else if (s.supplement_type === 'caffeine') {
            logsMap[dStr].caffeine = (logsMap[dStr].caffeine || 0) + Number(s.amount);
          }
        }
      });

      // Bug #7 fix: only override today's slot with live state. For historical dates the
      // DB data is authoritative — overriding it with the currently-viewed date's values
      // would corrupt that day's historical regression row.
      const todayDateStrForOverride = toDateKeyFromDate(new Date());
      if (selectedDateStr === todayDateStrForOverride && logsMap[selectedDateStr]) {
        logsMap[selectedDateStr].calories = selectedDateCaloriesIntake;
        logsMap[selectedDateStr].protein = selectedDateProtein;
        logsMap[selectedDateStr].carbs = selectedDateCarbs;
        logsMap[selectedDateStr].fat = selectedDateFat;
        logsMap[selectedDateStr].activeCalories = selectedDateActiveCalories;
        logsMap[selectedDateStr].gymVolume = selectedDateGymVolume;
        logsMap[selectedDateStr].isComplete = selectedDateComplete;
      }

      // CR7: Determine today's training type dynamically for macro timing
      let todayTrainingType: 'intense' | 'endurance' | 'rest' | null = 'rest';
      if (selectedDateActiveCalories > 450) {
        todayTrainingType = 'intense';
      } else if (selectedDateActiveCalories > 150) {
        todayTrainingType = 'endurance';
      }

      const completeLogsCount = Object.values(logsMap).filter(log => log.isComplete && log.calories >= 1000 && log.weight !== null).length;

      const activeProfile = {
        ...profile,
        todayTrainingType,
        priorConfidence: Math.min(1.0, completeLogsCount / 30)
      };

      const latestWeight = weightLogs[weightLogs.length - 1]?.weight || null;
      const zOutput = runZaneCalibration(Object.values(logsMap), activeProfile, latestWeight, selectedDateStr);
      setZaneResult(zOutput);

      // Calculate dynamic day-by-day parameter evolution and confidence intervals
      const sortedLogs = Object.values(logsMap).sort((a, b) => a.date.localeCompare(b.date));
      const formattedHist = [];

      for (let i = 2; i < sortedLogs.length; i++) {
        const subLogs = sortedLogs.slice(0, i + 1);
        const targetDateStr = subLogs[subLogs.length - 1].date;
        const subOutput = runZaneCalibration(subLogs, activeProfile, latestWeight, targetDateStr);
        
        const calibrationDays = subOutput.calibrationDays;
        
        // Calculate error margin for BMR offset: starts at 600, scales down to 40 at 14 days, and goes lower as calibrationDays grows
        const margin = Math.round(600.0 * (1.0 - Math.min(calibrationDays, 14) / 15.0));
        const offset = subOutput.bmrOffset;
        
        formattedHist.push({
          date: new Date(targetDateStr + 'T12:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
          offset: offset,
          offsetRange: [offset - margin, offset + margin],
          quality: subOutput.sleepQualityCoeff,
          duration: subOutput.sleepDurationCoeff,
          calibrationDays: calibrationDays,
        });
      }
      setZaneHistory(formattedHist);

      if (zOutput.isCalibrated) {
        saveLearnedState(zOutput.bmrOffset, zOutput.sleepQualityCoeff, zOutput.sleepDurationCoeff, zOutput.gymVolumeCoeff, zOutput.caffeineCoeff, zOutput.weekendCoeff);
      }
    };

    fetchCalibrationLogs();

    }, 500);

    return () => clearTimeout(zaneDebounceId);
  }, [userId, weightLogs, sleepLogs, weeklyFoodLogs, supplementsLogs, bodyMeasurementsLogs, selectedDateActiveCalories, selectedDateGymVolume, selectedDateCaloriesIntake, selectedDateProtein, selectedDateCarbs, selectedDateFat, selectedDateComplete, profile, selectedDateStr]);

  // Save ZANE coefficients to database
  const saveLearnedState = async (offset: number, qCoeff: number, dCoeff: number, gCoeff: number, cCoeff: number, wCoeff: number) => {
    try {
      const todayDateStr = toDateKeyFromDate(new Date());
      
      // Save to ml_weights (Fase 3 persistent backup)
      await saveZaneCoefficients(supabase, userId, offset, qCoeff, dCoeff, gCoeff, cCoeff, wCoeff);

      await supabase
        .from('fuel_profile')
        .update({
          learned_bmr_offset: offset,
          learned_sleep_quality_coeff: qCoeff,
          learned_sleep_duration_coeff: dCoeff,
          last_calculated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      const { data: existingHist } = await supabase
        .from('fuel_zane_history')
        .select('id')
        .eq('user_id', userId)
        .gte('calculated_at', todayDateStr + 'T00:00:00.000Z')
        .limit(1);

      if (!existingHist || existingHist.length === 0) {
        await supabase
          .from('fuel_zane_history')
          .insert({
            user_id: userId,
            bmr_offset: offset,
            sleep_quality_coeff: qCoeff,
            sleep_duration_coeff: dCoeff,
            calculated_at: new Date().toISOString()
          });
      }

      // Self-Correction Loop: Backpropagate learning targets to SOTA ZenithFusionNet
      // Bug fix #3: skip entirely on days marked incomplete (the same "mark day
      // incomplete" flag ZANE's own calibration already respects via completeLogsCount
      // above) — an incomplete day's selectedDateCaloriesIntake is known-partial, not a
      // real measurement, so training on it would feed the network a fabricated ground
      // truth for that day no matter how the weight-trend side is computed.
      if (userId && selectedDateComplete) {
        const net = ZenithFusionNet.getInstance();
        await net.init(supabase, userId);
        
        const inputVec = [
          selectedDateCaloriesIntake,
          // Kilocalories, not kilograms of tonnage - and from the shared definition,
          // so the value the network trains on is the value it later predicts from.
          // Fuel's own display figure switches formula once ZANE calibrates, which
          // would have moved this input under the model for no physical reason.
          strengthCaloriesFromVolume(selectedDateGymVolume),
          // The measured figure, not a flag. This was `> 0 ? 80 : 0` here, in the
          // prediction below and in the retrain builder - so a 544 kcal run and a
          // walk to the shops trained the network as the same day.
          selectedDateActiveCalories,
          todaySleepQuality !== null ? todaySleepQuality : 80,
          todaySleepDuration !== null ? todaySleepDuration : 8.0,
          todayDeepSleepRatio, // real deep sleep ratio from vigor_sleep
          todayRemSleepRatio, // real REM sleep ratio from vigor_sleep
          todayHrvRmssd, // real hrv_ms when available, else an explicitly-labeled sleep-quality estimate (never fabricated as measured HRV)
          0, // Delta RHR: no real data source anywhere in this app (see fusionPredict call above)
          caffeineStats.activeDateCaffeine,
          activeDateCreatine > 0 ? 1.0 : 0.0,
          zaneResult.currentTrendWeight || latestWeight
        ];

        // Bug fix: actualTdee used to be `totalTdee` itself — training the network to
        // reproduce the exact manually-computed figure displayed right next to its own
        // prediction (circular; the "SOTA ML" output could never be more accurate than
        // the formula it was chasing). Instead derive a genuinely independent outcome:
        // the empirical TDEE implied by the user's actual measured weight-trend change
        // (zaneResult.trendWeightMap, an EMA of real scale weighings) versus actual
        // intake, i.e. intake - (measured weight change * kcal/kg). This is a real,
        // independently-measured outcome rather than an echo of the displayed estimate.
        //
        // Bug fix #2: pairing a SINGLE day's intake (often 0 on days nothing was logged
        // yet) with the weight-change between just the two most recent EMA points was
        // wildly noisy — at ~7700 kcal/kg, a ~0.1kg day-to-day EMA wobble swings the
        // implied TDEE by ~770 kcal, and an unlogged (0 kcal) day gets misread as "TDEE
        // achieved on zero food," producing implausible training targets (e.g. ~1225
        // kcal next to a genuine ~2144 kcal estimate). Average both sides of the energy
        // balance over the same multi-day window instead, so the training target stays
        // internally consistent.
        const trendMap = zaneResult.trendWeightMap || {};
        const trendDates = Object.keys(trendMap).filter(d => d <= selectedDateStr).sort();
        let actualTdee: number | null = null;
        const WEIGHT_TREND_WINDOW_DAYS = 7;
        if (trendDates.length >= 2) {
          const lastDate = trendDates[trendDates.length - 1];
          const startIdx = Math.max(0, trendDates.length - 1 - WEIGHT_TREND_WINDOW_DAYS);
          const prevDate = trendDates[startIdx];
          const daysBetween = Math.max(1, Math.round(
            (new Date(lastDate + 'T12:00:00').getTime() - new Date(prevDate + 'T12:00:00').getTime()) / 86400000
          ));
          // Require a few real days of spread before trusting the implied rate at all.
          if (daysBetween >= 3) {
            const dailyWeightChangeKg = (trendMap[lastDate] - trendMap[prevDate]) / daysBetween;
            const energyPerKg = zaneResult.energyPerKgTissue || 7700;

            let windowIntakeSum = 0;
            let windowIntakeDays = 0;
            for (let i = startIdx; i <= trendDates.length - 1; i++) {
              const d = trendDates[i];
              const dayCal = dailyCaloriesMap[d] || 0;
              const dayComplete = dailyCompletionMap[d] ?? true;
              if (dayCal > 0 && dayComplete) {
                windowIntakeSum += dayCal;
                windowIntakeDays++;
              }
            }

            if (windowIntakeDays > 0) {
              const avgIntake = windowIntakeSum / windowIntakeDays;
              actualTdee = Math.round(avgIntake - dailyWeightChangeKg * energyPerKg);
            }
          }
        }

        // Recovery and capacity: only where the athlete has actually said.
        //
        // These were `todaySleepQuality` and `todaySleepQuality + 5`. Sleep quality is
        // input 3 of this same network, so two of its three outputs were being trained
        // to return one of their own inputs, and one of them plus a constant. A model
        // can learn that perfectly and has learned nothing - whatever "recovery" and
        // "athletic capacity" were presented as, they were sleep quality wearing two
        // other labels.
        //
        // The readiness answers the athlete gives in Hub are a real, independent
        // observation of how they felt. Where a day has one, it is the target. Where it
        // does not, the outputs are left untrained for that day rather than fed a
        // stand-in, because a stand-in derived from the inputs is exactly what was
        // wrong before.
        const feltToday = readinessByDay[selectedDateStr]?.felt;
        const observedRecovery = feltToday === undefined ? null : feltToTarget(feltToday);

        if (actualTdee !== null && actualTdee > 0) {
          await net.train(
            supabase, userId, inputVec, actualTdee,
            observedRecovery, observedRecovery
          );
          console.log("[ZenithFusionNet] Backpropagation online training loop complete for user:", userId);
        } else {
          console.log("[ZenithFusionNet] Skipping training this cycle: not enough measured weight-trend history yet to derive a genuine independent TDEE outcome.");
        }
      }
    } catch (err) {
      console.error("Failed to save ZANE status:", err);
    }
  };

  // Toggle Selected Day Complete/Incomplete status
  const handleToggleDayIncomplete = async () => {
    const newIsCompleteStatus = !selectedDateComplete;

    try {
      const updatedStates = weeklyDayStates.some(s => s.date === selectedDateStr)
        ? weeklyDayStates.map(s => s.date === selectedDateStr ? { ...s, is_complete: newIsCompleteStatus } : s)
        : [...weeklyDayStates, { date: selectedDateStr, is_complete: newIsCompleteStatus }];
      setWeeklyDayStates(updatedStates);

      const { error } = await supabase
        .from('fuel_days')
        .upsert({
          user_id: userId,
          date: selectedDateStr,
          is_complete: newIsCompleteStatus
        }, { onConflict: 'user_id,date' });

      if (error) throw error;
      triggerNotification(newIsCompleteStatus ? "Daily log marked as complete!" : "Daily log marked as incomplete (excluded from Zenith).");
    } catch (err) {
      console.error("Incompleteness toggle failed:", err);
      setWeeklyDayStates(weeklyDayStates);
      triggerNotification("Action failed. Please try again.", true);
    }
  };

  // Switch Weeks
  const handlePrevWeek = () => {
    const prevMon = addDays(currentWeekMonday, -7);
    setCurrentWeekMonday(prevMon);
    setSelectedDateStr(formatDateString(prevMon));
  };

  const handleNextWeek = () => {
    const nextMon = addDays(currentWeekMonday, 7);
    setCurrentWeekMonday(nextMon);
    setSelectedDateStr(formatDateString(nextMon));
  };

  // Barcode Lookup via Open Food Facts API
  const handleBarcodeLookup = async () => {
    if (!ingBarcode.trim()) {
      triggerNotification("Please enter a barcode first.", true);
      return;
    }

    setBarcodeSearching(true);
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(ingBarcode)}.json`);
      const data = await response.json();

      if (data.status === 1 && data.product) {
        const prod = data.product;
        setIngName(prod.product_name || '');
        
        // Open Food Facts' energy-kcal_100g is already kcal, but its energy_100g
        // fallback is in kJ, not kcal — using it directly (as this used to) inflated
        // the calorie count by ~4.18x for any product missing the kcal field.
        const kcalDirect = prod.nutriments?.['energy-kcal_100g'];
        const kjFallback = prod.nutriments?.energy_100g;
        const kcal = kcalDirect != null ? kcalDirect : (kjFallback != null ? Math.round(kjFallback / 4.184) : '');
        setIngKcal(kcal.toString());
        setIngCarbs((prod.nutriments?.carbohydrates_100g || 0).toString());
        setIngProtein((prod.nutriments?.proteins_100g || 0).toString());
        setIngFat((prod.nutriments?.fat_100g || 0).toString());
        
        let caffeineValue = 0;
        const rawCaffeine = prod.nutriments?.caffeine_100g || prod.nutriments?.caffeine;
        if (rawCaffeine !== undefined) {
          const val = parseFloat(rawCaffeine);
          if (!isNaN(val)) {
            // E.g. 0.032g per 100g/ml -> 32mg
            caffeineValue = val < 1.0 ? val * 1000 : val;
          }
        }
        setIngCaffeine(Math.round(caffeineValue).toString());
        
        if (prod.serving_size) {
          setIngPortionName("Portion");
          // Open Food Facts serving_size is free text: "30 g", "2 biscuits (18g)",
          // "1 cup (240 ml)". A bare parseFloat grabs the FIRST number, which for
          // "2 biscuits (18g)" is the biscuit count (2), not the 18g weight - the
          // portion weight then silently corrupts every per-portion macro below.
          // Prefer an explicit gram/millilitre quantity anywhere in the string,
          // and only fall back to a leading number if it is itself a g/ml value.
          const servingText = String(prod.serving_size);
          const gramMatch = servingText.match(/(\d+(?:[.,]\d+)?)\s*(?:grams|gram|ml|g)(?![a-z])/i);
          const parsedWeight = gramMatch
            ? parseFloat(gramMatch[1].replace(',', '.'))
            : NaN;
          if (Number.isFinite(parsedWeight) && parsedWeight > 0) {
            setIngPortionWeight(parsedWeight.toString());
          }
        }
        triggerNotification("Product found and loaded!");
      } else {
        triggerNotification("Product not found on Open Food Facts.", true);
      }
    } catch (err) {
      console.error("EAN lookup failed:", err);
      triggerNotification("Error in barcode network request.", true);
    } finally {
      setBarcodeSearching(false);
    }
  };

  // Create or Update Ingredient
  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName.trim()) return;

    try {
      const ingPayload = {
        user_id: userId,
        name: ingName,
        barcode: ingBarcode || null,
        calories_per_100g: parseFloat(ingKcal) || 0,
        carbs_per_100g: parseFloat(ingCarbs) || 0,
        protein_per_100g: parseFloat(ingProtein) || 0,
        fat_per_100g: parseFloat(ingFat) || 0,
        portion_name: ingPortionName || null,
        portion_weight_grams: parseFloat(ingPortionWeight) || null,
        portions_per_package: parseInt(ingPortionsPackage) || null,
        caffeine_mg_per_100g: parseFloat(ingCaffeine) || 0
      };

      if (editingIngredientId) {
        const { data, error } = await supabase
          .from('fuel_ingredients')
          .update(ingPayload)
          .eq('id', editingIngredientId)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) throw error;
        setIngredients(ingredients.map(i => i.id === editingIngredientId ? data : i).sort((a, b) => a.name.localeCompare(b.name)));
        triggerNotification("Ingredient updated!");
      } else {
        const { data, error } = await supabase
          .from('fuel_ingredients')
          .insert(ingPayload)
          .select()
          .single();

        if (error) throw error;
        setIngredients([...ingredients, data].sort((a, b) => a.name.localeCompare(b.name)));
        triggerNotification("Ingredient added!");
      }

      setShowIngredientModal(false);
      resetIngredientForm();
    } catch (err) {
      console.error("Error saving ingredient:", err);
      triggerNotification("Error saving ingredient.", true);
    }
  };

  // Edit Ingredient Trigger
  const handleEditIngredient = (ing: Ingredient) => {
    setEditingIngredientId(ing.id);
    setIngName(ing.name);
    setIngBarcode(ing.barcode || '');
    setIngKcal(ing.calories_per_100g.toString());
    setIngCarbs(ing.carbs_per_100g.toString());
    setIngProtein(ing.protein_per_100g.toString());
    setIngFat(ing.fat_per_100g.toString());
    setIngPortionName(ing.portion_name || '');
    setIngPortionWeight(ing.portion_weight_grams?.toString() || '');
    setIngPortionsPackage(ing.portions_per_package?.toString() || '');
    setIngCaffeine(ing.caffeine_mg_per_100g?.toString() || '0');
    setShowIngredientModal(true);
  };

  // Delete Ingredient
  const handleDeleteIngredient = async (id: string) => {
    if (!confirm("Are you sure you want to delete this ingredient? This will not affect existing logged meals.")) return;
    try {
      const { error } = await supabase
        .from('fuel_ingredients')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      setIngredients(ingredients.filter(i => i.id !== id));
      triggerNotification("Ingredient deleted.");
    } catch (err) {
      console.error("Error deleting ingredient:", err);
      triggerNotification("Delete failed.", true);
    }
  };

  const resetIngredientForm = () => {
    setEditingIngredientId(null);
    setIngName('');
    setIngBarcode('');
    setIngKcal('');
    setIngCarbs('');
    setIngProtein('');
    setIngFat('');
    setIngPortionName('');
    setIngPortionWeight('');
    setIngPortionsPackage('');
    setIngCaffeine('0');
  };

  // Add Ingredient to Recipe Form
  const handleAddRecipeIngredient = () => {
    if (!selectedRecipeIngId) return;
    const ing = ingredients.find(i => i.id === selectedRecipeIngId);
    if (!ing) return;

    const qty = parseFloat(recipeIngQty) || 0;
    
    let finalGramss = qty;
    if (recipeIngMode === 'portions' && ing.portion_weight_grams) {
      finalGramss = qty * ing.portion_weight_grams;
    }

    const ratio = finalGramss / 100;
    const item = {
      ingredient_id: ing.id,
      name: ing.name,
      amount_g: finalGramss,
      portion_count: recipeIngMode === 'portions' ? qty : 0,
      use_portion: recipeIngMode === 'portions',
      calories: Math.round(ing.calories_per_100g * ratio),
      carbs: Math.round(ing.carbs_per_100g * ratio),
      protein: Math.round(ing.protein_per_100g * ratio),
      fat: Math.round(ing.fat_per_100g * ratio),
      caffeine_mg: Math.round((ing.caffeine_mg_per_100g || 0) * ratio)
    };

    setRecIngredients([...recIngredients, item]);
    setSelectedRecipeIngId('');
    setRecipeIngSearch('');
    setRecipeIngQty('100');
  };

  const handleRemoveRecipeIngredient = (idx: number) => {
    setRecIngredients(recIngredients.filter((_, i) => i !== idx));
  };

  // Create or Update Recipe
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recName.trim() || recIngredients.length === 0) {
      triggerNotification("Please enter a name and add at least one ingredient.", true);
      return;
    }

    const totalCal = recIngredients.reduce((sum, item) => sum + item.calories, 0);
    const totalCarb = recIngredients.reduce((sum, item) => sum + item.carbs, 0);
    const totalProt = recIngredients.reduce((sum, item) => sum + item.protein, 0);
    const totalFat = recIngredients.reduce((sum, item) => sum + item.fat, 0);
    const totalCaffeine = recIngredients.reduce((sum, item) => sum + (item.caffeine_mg || 0), 0);

    try {
      const recPayload = {
        user_id: userId,
        name: recName,
        description: recDesc,
        category: recCategory,
        serving_size: recServingSize,
        // The number the maths uses. serving_size beside it is prose.
        servings: Math.max(0.1, parseFloat(recServings) || 1),
        calories: totalCal,
        carbs: totalCarb,
        protein: totalProt,
        fat: totalFat,
        caffeine_mg: totalCaffeine,
        ingredients: recIngredients,
        instructions: recInstructions.filter(i => i.trim() !== '')
      };

      if (editingRecipeId) {
        const { data, error } = await supabase
          .from('fuel_recipes')
          .update(recPayload)
          .eq('id', editingRecipeId)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) throw error;
        setRecipes(recipes.map(r => r.id === editingRecipeId ? data : r).sort((a, b) => a.name.localeCompare(b.name)));
        triggerNotification("Recipe updated!");
      } else {
        const { data, error } = await supabase
          .from('fuel_recipes')
          .insert(recPayload)
          .select()
          .single();

        if (error) throw error;
        setRecipes([...recipes, data].sort((a, b) => a.name.localeCompare(b.name)));
        triggerNotification("Recipe saved!");
      }

      setShowRecipeModal(false);
      resetRecipeForm();
    } catch (err) {
      console.error("Failed to save recipe:", err);
      triggerNotification("Error saving recipe.", true);
    }
  };

  // Edit Recipe Trigger
  const handleEditRecipe = (rec: Recipe) => {
    setEditingRecipeId(rec.id);
    setRecName(rec.name);
    setRecDesc(rec.description);
    setRecCategory(rec.category);
    setRecServingSize(rec.serving_size === '1 portie' ? '1 portion' : rec.serving_size);
    setRecServings(String(rec.servings ?? 1));
    setRecIngredients(rec.ingredients);
    setRecInstructions(rec.instructions.length > 0 ? rec.instructions : ['']);
    setShowRecipeModal(true);
  };

  // Delete Recipe
  const handleDeleteRecipe = async (id: string) => {
    if (!confirm("Are you sure you want to delete this recipe?")) return;
    try {
      const { error } = await supabase
        .from('fuel_recipes')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      setRecipes(recipes.filter(r => r.id !== id));
      triggerNotification("Recipe deleted.");
    } catch (err) {
      console.error("Error deleting recipe:", err);
      triggerNotification("Delete failed.", true);
    }
  };

  const resetRecipeForm = () => {
    setEditingRecipeId(null);
    setRecName('');
    setRecDesc('');
    setRecCategory('baseline');
    setRecServingSize('1 portion');
    setRecServings('1');
    setRecIngredients([]);
    setRecInstructions(['']);
    setRecipeIngSearch('');
  };

  // Copy Food Logs from Active Day to Target Day
  const handleCopyDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (filteredFoodLogs.length === 0) {
      triggerNotification("No meals to copy.", true);
      return;
    }
    if (!copyTargetDate) {
      triggerNotification("Please select a target date.", true);
      return;
    }

    const newLogs = filteredFoodLogs.map(log => {
      const timePart = log.logged_at.includes('T') ? log.logged_at.split('T')[1] : log.logged_at.substring(11);
      return {
        user_id: userId,
        logged_at: `${copyTargetDate}T${timePart}`,
        meal_type: log.meal_type,
        custom_name: log.custom_name,
        recipe_id: log.recipe_id || null,
        quantity: log.quantity,
        calories: log.calories,
        carbs: log.carbs,
        protein: log.protein,
        fat: log.fat,
        caffeine_mg: log.caffeine_mg || 0
      };
    });

    try {
      const { data, error } = await supabase
        .from('fuel_logs')
        .insert(newLogs)
        .select();

      if (error) throw error;

      // Update weekly logs state if target date is in the viewed week range
      const startOfWeek = new Date(currentWeekMonday);
      const endOfWeek = addDays(startOfWeek, 7);
      const targetDateObj = new Date(copyTargetDate);

      if (targetDateObj >= startOfWeek && targetDateObj < endOfWeek) {
        setWeeklyFoodLogs(prev => [...prev, ...data].sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
      }

      setShowCopyDayModal(false);
      triggerNotification(`${newLogs.length} meals copied to ${new Date(copyTargetDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}!`);
    } catch (err) {
      console.error("Error copying day:", err);
      triggerNotification("Copy failed. Please try again.", true);
    }
  };

  // Add Log Entry
  const handleAddFoodLog = async (e: React.FormEvent) => {
    e.preventDefault();

    const logTimestamp = new Date(`${selectedDateStr}T${logHour}:00`).toISOString();

    let entry: any = {
      user_id: userId,
      logged_at: logTimestamp,
      meal_type: logMealType,
      quantity: parseFloat(logQuantity) || 1.0
    };

    if (logSource === 'quick') {
      if (!quickName.trim()) return;
      entry.custom_name = quickName;
      entry.calories = parseFloat(quickCalories) || 0;
      entry.carbs = parseFloat(quickCarbs) || 0;
      entry.protein = parseFloat(quickProtein) || 0;
      entry.fat = parseFloat(quickFat) || 0;
    } else if (logSource === 'ingredient') {
      const ing = ingredients.find(i => i.id === selectedLogIngredient);
      if (!ing) return;
      
      const qty = parseFloat(logIngredientWeightValue) || 0;
      let grams = qty;
      if (logIngredientWeightMode === 'portions' && ing.portion_weight_grams) {
        grams = qty * ing.portion_weight_grams;
      }

      const ratio = grams / 100;
      entry.custom_name = ing.name;
      entry.quantity = logIngredientWeightMode === 'portions' ? qty : grams / 100;
      entry.calories = Math.round(ing.calories_per_100g * ratio);
      entry.carbs = Math.round(ing.carbs_per_100g * ratio);
      entry.protein = Math.round(ing.protein_per_100g * ratio);
      entry.fat = Math.round(ing.fat_per_100g * ratio);
      entry.caffeine_mg = Math.round((Number(ing.caffeine_mg_per_100g) || 0) * ratio);
    } else if (logSource === 'recipe') {
      const rec = recipes.find(r => r.id === selectedLogRecipe);
      if (!rec) return;

      // Portions eaten, divided by the portions the recipe makes. This used to
      // multiply the WHOLE recipe's totals by this field while labelling it
      // "servings", so eating one portion of a four-portion bake required typing
      // 0.25 - and typing 1, which the label invites, logged the entire dish.
      const portionsEaten = parseFloat(logRecipeServings) || 1.0;
      const recipeMakes = Math.max(0.1, Number(rec.servings) || 1);
      const share = portionsEaten / recipeMakes;

      entry.recipe_id = rec.id;
      entry.custom_name = recipeMakes > 1
        ? `${rec.name} (${formatPortions(portionsEaten)} of ${formatPortions(recipeMakes)} portions)`
        : rec.name;
      entry.quantity = portionsEaten;
      entry.calories = Math.round(rec.calories * share);
      entry.carbs = Math.round(rec.carbs * share);
      entry.protein = Math.round(rec.protein * share);
      entry.fat = Math.round(rec.fat * share);
      entry.caffeine_mg = Math.round((Number(rec.caffeine_mg) || 0) * share);
    }

    try {
      if (editingLogEntry) {
        const { data, error } = await supabase
          .from('fuel_logs')
          .update(entry)
          .eq('id', editingLogEntry.id)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) throw error;
        setWeeklyFoodLogs(weeklyFoodLogs.map(f => f.id === editingLogEntry.id ? data : f).sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
        setShowLogModal(false);
        setEditingLogEntry(null);
        resetLogForm();
        triggerNotification("Log changed!");
      } else {
        const { data, error } = await supabase
          .from('fuel_logs')
          .insert(entry)
          .select()
          .single();

        if (error) throw error;
        setWeeklyFoodLogs([...weeklyFoodLogs, data].sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
        setShowLogModal(false);
        resetLogForm();
        triggerNotification("Meal logged!");
      }
    } catch (err) {
      console.error("Logging failed:", err);
      triggerNotification("Error saving log.", true);
    }
  };

  const resetLogForm = () => {
    setQuickName('');
    setQuickCalories('');
    setQuickCarbs('');
    setQuickProtein('');
    setQuickFat('');
    setSelectedLogIngredient('');
    setLogIngredientSearch('');
    setSelectedLogRecipe('');
    setLogRecipeSearch('');
    setLogRecipeServings('1.0');
    setLogIngredientWeightValue('100');
    setLogQuantity('1.0');
    setLogGrams('100');
    setBaseMacros(null);
  };

  // Delete Log Entry
  const handleDeleteLog = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fuel_logs')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      setWeeklyFoodLogs(weeklyFoodLogs.filter(f => f.id !== id));
      triggerNotification("Log deleted.");
    } catch (err) {
      console.error("Error deleting:", err);
      triggerNotification("Action failed.", true);
    }
  };

  // Edit Log Entry
  const handleEditLogClick = (log: any) => {
    setEditingLogEntry(log);
    setLogMealType(log.meal_type);
    
    const logTime = new Date(log.logged_at);
    const timeStr = `${String(logTime.getHours()).padStart(2, '0')}:${String(logTime.getMinutes()).padStart(2, '0')}`;
    setLogHour(timeStr);
    
    setLogSource('quick');
    setQuickName(log.custom_name);
    setQuickCalories(String(log.calories));
    setQuickCarbs(String(log.carbs));
    setQuickProtein(String(log.protein || 0));
    setQuickFat(String(log.fat || 0));

    const qty = log.quantity || 1.0;
    setLogQuantity(String(qty));
    setLogGrams(String(Math.round(qty * 100)));
    setBaseMacros({
      calories: log.calories / qty,
      carbs: log.carbs / qty,
      protein: (log.protein || 0) / qty,
      fat: (log.fat || 0) / qty
    });
    
    setShowLogModal(true);
  };

  const handleQuantityChange = (valStr: string) => {
    setLogQuantity(valStr);
    const val = parseFloat(valStr) || 0;
    setLogGrams(String(Math.round(val * 100)));
    if (baseMacros) {
      setQuickCalories(String(Math.round(baseMacros.calories * val)));
      setQuickCarbs(String(Math.round(baseMacros.carbs * val * 10) / 10));
      setQuickProtein(String(Math.round(baseMacros.protein * val * 10) / 10));
      setQuickFat(String(Math.round(baseMacros.fat * val * 10) / 10));
    }
  };

  const handleGramsChange = (valStr: string) => {
    setLogGrams(valStr);
    const grams = parseFloat(valStr) || 0;
    const val = grams / 100;
    setLogQuantity(String(val));
    if (baseMacros) {
      setQuickCalories(String(Math.round(baseMacros.calories * val)));
      setQuickCarbs(String(Math.round(baseMacros.carbs * val * 10) / 10));
      setQuickProtein(String(Math.round(baseMacros.protein * val * 10) / 10));
      setQuickFat(String(Math.round(baseMacros.fat * val * 10) / 10));
    }
  };

  // Supplement Handlers
  const handleAddSupplementLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const logTimestamp = new Date(`${selectedDateStr}T${logSuppHour}:00`).toISOString();
    const amountVal = parseFloat(logSuppAmount) || 0;

    const entry = {
      user_id: userId,
      supplement_type: logSuppType,
      amount: amountVal,
      logged_at: logTimestamp
    };

    try {
      const { data, error } = await supabase
        .from('fuel_supplements_log')
        .insert(entry)
        .select()
        .single();

      if (error) throw error;
      setSupplementsLogs(prev => [...prev, data].sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
      triggerNotification("Supplement logged!");
      
      // Reset form default based on type
      setLogSuppAmount(logSuppType === 'creatine' ? '5' : '80');
    } catch (err) {
      console.error("Error saving supplement log:", err);
      triggerNotification("Action failed.", true);
    }
  };

  const handleDeleteSupplementLog = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fuel_supplements_log')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      setSupplementsLogs(prev => prev.filter(s => s.id !== id));
      triggerNotification("Log deleted.");
    } catch (err) {
      console.error("Error deleting:", err);
      triggerNotification("Action failed.", true);
    }
  };

  // Filter food logs for active date
  const filteredFoodLogs = useMemo(() => {
    return weeklyFoodLogs.filter(log => toYYYYMMDD(log.logged_at) === selectedDateStr);
  }, [weeklyFoodLogs, selectedDateStr]);

  // Supplements Calculations & Stats
  const creatineStats = useMemo(() => {
    const sortedLogs = [...supplementsLogs].sort((a, b) => a.logged_at.localeCompare(b.logged_at));
    const today = new Date();
    const dates30Days: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      dates30Days.push(toDateKeyFromDate(d));
    }

    const intakeMap: { [date: string]: number } = {};
    dates30Days.forEach(date => { intakeMap[date] = 0; });
    sortedLogs.forEach(s => {
      const dStr = toYYYYMMDD(s.logged_at);
      if (s.supplement_type === 'creatine' && dStr in intakeMap) {
        intakeMap[dStr] += Number(s.amount);
      }
    });

    // Wind the model forward over everything logged BEFORE the visible window, so
    // the chart starts where the athlete actually is rather than at the dietary
    // baseline. Without this the 30-day view re-ran loading from scratch every day,
    // so someone six months into a protocol still saw a ramp - and the figure on the
    // dial disagreed with the one ZANE uses to adjust scale weight, because ZANE
    // walks the full history.
    const windowStart = dates30Days[0];
    let currentSat = CREATINE_BASELINE_SATURATION;
    const priorIntakeByDate: { [date: string]: number } = {};
    sortedLogs.forEach(supp => {
      if (supp.supplement_type !== 'creatine') return;
      const dStr = toYYYYMMDD(supp.logged_at);
      if (dStr < windowStart) {
        priorIntakeByDate[dStr] = (priorIntakeByDate[dStr] || 0) + Number(supp.amount);
      }
    });
    const priorDates = Object.keys(priorIntakeByDate).sort();
    if (priorDates.length > 0) {
      // Step every calendar day from the first log, not only the days with an entry:
      // the washout between doses is part of the model.
      const cursor = new Date(priorDates[0] + 'T12:00:00');
      const stopAt = new Date(windowStart + 'T12:00:00');
      while (cursor < stopAt) {
        const key = toDateKeyFromDate(cursor);
        currentSat = creatineSaturationStep(currentSat, priorIntakeByDate[key] || 0);
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const chartData: any[] = [];
    dates30Days.forEach(date => {
      const intake = intakeMap[date] || 0;
      currentSat = creatineSaturationStep(currentSat, intake);
      chartData.push({
        dateStr: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
        intake: intake,
        saturation: Math.round(currentSat * 100),
        waterWeight: Math.round(creatineWaterRetentionKg(currentSat) * 100) / 100
      });
    });

    const latestSaturation = chartData[chartData.length - 1]?.saturation ?? 0;
    const latestWaterWeight = chartData[chartData.length - 1]?.waterWeight ?? 0;

    return {
      chartData,
      latestSaturation,
      latestWaterWeight
    };
  }, [supplementsLogs]);

  const caffeineStats = useMemo(() => {
    const today = new Date();
    const dates30Days: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      dates30Days.push(toDateKeyFromDate(d));
    }

    const intakeMap: { [date: string]: number } = {};
    dates30Days.forEach(date => { intakeMap[date] = 0; });
    supplementsLogs.forEach(s => {
      const dStr = toYYYYMMDD(s.logged_at);
      if (s.supplement_type === 'caffeine' && dStr in intakeMap) {
        intakeMap[dStr] += Number(s.amount);
      }
    });

    thirtyDayFoodLogs.forEach(f => {
      const dStr = toYYYYMMDD(f.logged_at);
      if (dStr in intakeMap) {
        intakeMap[dStr] += Number(f.caffeine_mg || 0);
      }
    });

    // Measured resting heart rate. This line used to be computed as
    //   58 + caffeine * 0.02 + sleepDeficit * 0.12
    // which means a chart captioned "caffeine vs resting heart rate" was plotting
    // caffeine against a function of caffeine. Any apparent relationship was
    // guaranteed by construction and could never have shown anything else - the
    // worst kind of chart, because it looks like evidence. Real resting_hr sat in
    // vigor_sleep the whole time and was not even being selected.
    const restingHrMap: { [date: string]: number } = {};
    sleepLogs.forEach(s => {
      const hr = Number((s as any).resting_hr);
      if (Number.isFinite(hr) && hr > 0) {
        restingHrMap[toYYYYMMDD(s.logged_at)] = hr;
      }
    });

    const chartData = dates30Days.map(date => ({
      dateStr: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
      caffeine: intakeMap[date] || 0,
      // null, not a filled-in guess: a day with no measurement leaves a gap in the
      // line rather than inventing a reading to keep the curve smooth.
      heartRate: restingHrMap[date] ?? null
    }));

    // Whether the two actually move together, over the days where both were
    // measured. Stated rather than left to the eye, because two lines on twin axes
    // will look related whatever they do.
    const paired = chartData.filter(d => d.heartRate !== null);
    let correlation: number | null = null;
    if (paired.length >= 5) {
      const xs = paired.map(d => d.caffeine);
      const ys = paired.map(d => d.heartRate as number);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let num = 0, dx2 = 0, dy2 = 0;
      for (let i = 0; i < xs.length; i++) {
        const dx = xs[i] - mx, dy = ys[i] - my;
        num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
      }
      const den = Math.sqrt(dx2 * dy2);
      if (den > 0) correlation = num / den;
    }

    const activeDateCaffeine = intakeMap[selectedDateStr] || 0;
    const metabolicBoost = Math.round(activeDateCaffeine * (zaneResult.caffeineCoeff || CAFFEINE_KCAL_PER_MG_PRIOR));

    return {
      chartData,
      correlation,
      pairedDays: paired.length,
      activeDateCaffeine,
      metabolicBoost,
      // Per-day totals, reused by the FusionNet retrain so it trains on the
      // same caffeine figures the live prediction path sees.
      byDate: intakeMap
    };
  }, [supplementsLogs, thirtyDayFoodLogs, sleepLogs, selectedDateStr, zaneResult.caffeineCoeff]);

  const intakeCalories = useMemo(() => filteredFoodLogs.reduce((sum, f) => sum + f.calories, 0), [filteredFoodLogs]);
  const intakeCarbs = useMemo(() => filteredFoodLogs.reduce((sum, f) => sum + f.carbs, 0), [filteredFoodLogs]);
  const intakeProtein = useMemo(() => filteredFoodLogs.reduce((sum, f) => sum + f.protein, 0), [filteredFoodLogs]);
  const intakeFat = useMemo(() => filteredFoodLogs.reduce((sum, f) => sum + f.fat, 0), [filteredFoodLogs]);


  const latestWeight = weightLogs[weightLogs.length - 1]?.weight || 75;

  /**
   * Whether the goal is a deficit, a surplus, or maintenance.
   *
   * Mirrors the phase logic in generateTargets(): a 200 g margin around the
   * target weight counts as "there already", so the card doesn't tell someone
   * essentially at goal that they are cutting.
   */
  const goalRateKgPerWeek = profile.targetRateKgPerWeek ?? 0.5;

  const goalPhase: 'cut' | 'bulk' | 'maintain' = (() => {
    const target = profile.targetWeight;
    if (!target || !latestWeight) return 'maintain';
    if (latestWeight - target > 0.2) return 'cut';
    if (latestWeight - target < -0.2) return 'bulk';
    return 'maintain';
  })();

  const height = profile.height || 175;
  const age = calculateAge(profile.birthDate);
  const gender = profile.gender || 'other';
  
  // Design #9 fix: mirror zane.ts — use Katch-McArdle BMR when body fat data exists
  // so that adaptationFactor is applied to the same BMR formula used during calibration.
  const latestBodyMeasurement = bodyMeasurementsLogs[bodyMeasurementsLogs.length - 1];
  const latestBodyFatPct = latestBodyMeasurement?.body_fat_pct != null
    ? Number(latestBodyMeasurement.body_fat_pct)
    : null;
  let baseBmr: number;
  if (latestBodyFatPct !== null) {
    const lbm = latestWeight * (1 - latestBodyFatPct / 100);
    baseBmr = Math.round(calculateKatchMcArdleBmr(lbm));
  } else {
    baseBmr = Math.round(calculateMifflinBmr(latestWeight, height, age, gender));
  }
  // FIX 3: PAL 1.2 (NEAT-only baseline) — matches zane.ts. Exercise calories come from wearable.
  const palFactor = 1.2;
  const baseTdee = Math.round(baseBmr * palFactor);
  // Same floor generateTargets() applies: clinical minimum, or 95% of BMR.
  const calorieSafetyFloor = Math.max(
    profile.gender === 'female' ? 1200 : 1500,
    Math.round(baseBmr * 0.95)
  );

  const bmrOffset = zaneResult.isCalibrated ? (zaneResult.bmrOffset || 0) : 0;
  // FIX 5: Cap active calories at 1,500 kcal to guard against wearable sensor spikes
  const activeCalories = Math.min(1500, selectedDateActiveCalories);
  
  // Sleep average (excluding unrated 0 quality_score entries)
  const validSleepQualities = sleepLogs.map(s => Number(s.quality_score)).filter(q => !isNaN(q) && q > 0);
  const sleepQualityAvg = validSleepQualities.length > 0
    ? validSleepQualities.reduce((sum, q) => sum + q, 0) / validSleepQualities.length
    : 80;
  const validSleepDurations = sleepLogs.map(s => Number(s.duration_minutes) / 60).filter(d => !isNaN(d) && d > 0);
  const sleepDurationAvg = validSleepDurations.length > 0
    ? validSleepDurations.reduce((sum, d) => sum + d, 0) / validSleepDurations.length
    : 8;

  // Today's sleep & Zenith ML Sleep Score Calculation
  const todaySleep = sleepLogs.find(s => s.logged_at.split('T')[0] === selectedDateStr);
  const todaySleepScoreResult = todaySleep ? calculateZenithSleepScore(todaySleep, sleepLogs) : null;
  const rawQuality = todaySleep ? Number(todaySleep.quality_score) : 0;
  const todaySleepQuality = todaySleep 
    ? (rawQuality > 0 ? rawQuality : (todaySleepScoreResult ? todaySleepScoreResult.score : 80))
    : null;
  const todaySleepDuration = todaySleep ? Number(todaySleep.duration_minutes) / 60 : null;

  // Bug fix: deep/REM sleep ratios are real data from vigor_sleep (synced from the
  // wearable by Pulse's authenticated Health Connect ingest, whose Supabase trigger
  // persists deep_minutes/rem_minutes - see shared/09_secure_health_connect_ingest.sql).
  // Previously these were hardcoded constants (0.25 / 0.18) fed into ZenithFusionNet
  // forever, even though the real per-day values were sitting in the same table.
  // Fall back to the population-average defaults only when today's log lacks the fields
  // (e.g. older synced sessions before deep/rem tracking was added).
  const todayDurationMinutes = todaySleep ? Number(todaySleep.duration_minutes) : 0;
  const todayDeepSleepRatio = todaySleep && todayDurationMinutes > 0 && todaySleep.deep_minutes != null
    ? Math.min(1, Math.max(0, Number(todaySleep.deep_minutes) / todayDurationMinutes))
    : 0.25;
  const todayRemSleepRatio = todaySleep && todayDurationMinutes > 0 && todaySleep.rem_minutes != null
    ? Math.min(1, Math.max(0, Number(todaySleep.rem_minutes) / todayDurationMinutes))
    : 0.18;

  // Bug fix: HRV fed into ZenithFusionNet was fabricated via `55 + (quality-75)*0.8` —
  // the same fake-HRV formula Vigor and Kratos had, presented as if it were real rMSSD.
  // vigor_sleep has a genuine hrv_ms column (synced from a paired wearable/smart ring);
  // use it when present. Matches Vigor/Kratos's fix: the sleep-quality-derived number is
  // only ever used as an explicitly-labeled ESTIMATE fallback, never presented as measured HRV.
  const todayHasRealHrv = !!todaySleep && typeof todaySleep.hrv_ms === 'number' && todaySleep.hrv_ms > 0;
  const todayHrvRmssd = todayHasRealHrv
    ? todaySleep.hrv_ms
    : (todaySleepQuality !== null ? Math.round(Math.max(30, Math.min(110, 55 + (todaySleepQuality - 75) * 0.8))) : 65); // sleep-quality ESTIMATE, not measured HRV

  // Sleep adjustment
  let sleepAdjustment = 0;
  if (zaneResult.isCalibrated) {
    const qDiff = (todaySleepQuality ?? sleepQualityAvg) - sleepQualityAvg;
    const dDiff = (todaySleepDuration ?? sleepDurationAvg) - sleepDurationAvg;
    sleepAdjustment = (zaneResult.sleepQualityCoeff * qDiff) + (zaneResult.sleepDurationCoeff * dDiff);
  }
  // FIX 8: No fallback sleep adjustment in uncalibrated mode.
  // Direction of sleep effect on TDEE is ambiguous before ZANE learns it from data.
  sleepAdjustment = Math.round(sleepAdjustment);

  let gymCalories = 0;
  if (selectedDateGymVolume > 0) {
    gymCalories = zaneResult.isCalibrated
      ? Math.round(selectedDateGymVolume * zaneResult.gymVolumeCoeff)
      : Math.min(280, Math.max(50, Math.round(selectedDateGymVolume * 0.025)));
  }

  let caffeineCalories = 0;
  if (caffeineStats.activeDateCaffeine > 0) {
    caffeineCalories = zaneResult.isCalibrated
      ? Math.round(caffeineStats.activeDateCaffeine * zaneResult.caffeineCoeff)
      : Math.round(caffeineStats.activeDateCaffeine * 0.15);
  }

  // FIX 9: Apply active calories directly (trust wearable at 1.0×).
  // bmrOffset already corrects for all systematic TDEE underestimation.
  // Conflating metabolic offset with wearable calibration adds a compounding error.
  // FIX 2: TEF removed from totalTdee. TEF is already implicit in the net balance:
  // higher intake → more TEF → less stored — captured naturally without adding it to TDEE.
  const isTargetWeekend = [0, 6].includes(new Date(selectedDateStr + 'T12:00:00').getDay()) ? 1 : 0;
  const weekendAdjustment = zaneResult.isCalibrated ? ((zaneResult.weekendCoeff || 0) * isTargetWeekend) : 0;
  // ── What is still planned for this day ──────────────────────────────────────
  //
  // Added to the day's burn so the target reflects the day ahead rather than the day
  // behind. Without it a 3-hour ride day was fuelled identically to a rest day right
  // up until the ride was already over, which is the wrong way round: a target is
  // for deciding what to eat, and that decision happens first.
  //
  // Only sessions not yet done are counted. Once a planned ride is completed the
  // real activity calories arrive through activeCalories, and adding the estimate on
  // top would inflate the target on precisely the hardest days.
  const outstandingPlans = useMemo(
    () => outstandingPlansForDate(plannedWorkouts, selectedDateStr, completedActivities),
    [plannedWorkouts, selectedDateStr, completedActivities]
  );
  const plannedBurn = useMemo(
    () => outstandingPlans.reduce(
      (sum, plan) => sum + plannedEnergyKcal(plan, latestWeight, currentFtp.watts), 0),
    [outstandingPlans, latestWeight, currentFtp]
  );
  const plannedCarbShift = useMemo(
    () => outstandingPlans.reduce(
      (sum, plan) => sum + plannedCarbShiftGrams(plan, latestWeight, currentFtp.watts), 0),
    [outstandingPlans, latestWeight, currentFtp]
  );

  // Planned work is deliberately NOT in here. It was, and it did nothing: the line
  // below prefers ZANE's own todayTdee whenever ZANE is calibrated, which is the
  // normal case, so the planned figure was dropped on the floor - the card said
  // "includes 246 kcal for training you have planned" above a total that did not.
  // And folding it into this side alone would have halved it, because the displayed
  // burn is the average of this figure and the model's, and the model knows nothing
  // about a session that has not happened. It is added once, after the blend.
  const preAdaptationTdee = Math.round(baseTdee + activeCalories + bmrOffset + sleepAdjustment + gymCalories + caffeineCalories + weekendAdjustment);
  const adaptationFactor = zaneResult.adaptationFactor ?? 1.0;
  const adaptationPenalty = Math.round(preAdaptationTdee * (1 - adaptationFactor));
  const totalTdee = preAdaptationTdee - adaptationPenalty;
  // The expenditure the goal was actually derived from. Falls back to the card's
  // own figure before ZANE has run, so this never renders as "0 kcal burned".
  const goalDerivedFromTdee = zaneResult.todayTdee > 0 ? zaneResult.todayTdee : totalTdee;

  /**
   * Today's burn, as one number, taken from the model that also sets the goal.
   *
   * The burn card used to render App.tsx's own totalTdee while the calorie goal
   * was derived from ZANE's - two independent forward passes over the same
   * inputs, which drifted apart (2206 vs 2475) and left two figures on screen
   * both labelled "what you burn today". zaneResult.todayBreakdown carries the
   * parts, so the rows below are displayed rather than recomputed and always
   * sum to this total.
   */
  const burnParts = zaneResult.todayBreakdown;
  const hasBurnBreakdown = zaneResult.todayTdee > 0;


  // ── FusionNet retrain inputs ────────────────────────────────────────────
  // dailyCaloriesMap covers the visible week only; the retrain wants the full
  // 30-day window, so it is rebuilt here from thirtyDayFoodLogs.
  const thirtyDayCaloriesMap = useMemo(() => {
    const map: { [date: string]: number } = {};
    thirtyDayFoodLogs.forEach(log => {
      const dStr = toYYYYMMDD(log.logged_at);
      if (!dStr) return;
      map[dStr] = (map[dStr] || 0) + Number(log.calories || 0);
    });
    return map;
  }, [thirtyDayFoodLogs]);

  const creatineByDate = useMemo(() => {
    const map: { [date: string]: boolean } = {};
    supplementsLogs.forEach(sup => {
      if (sup.supplement_type !== 'creatine') return;
      const dStr = toYYYYMMDD(sup.logged_at);
      if (dStr && Number(sup.amount) > 0) map[dStr] = true;
    });
    return map;
  }, [supplementsLogs]);

  const [retrainState, setRetrainState] = useState<{
    running: boolean;
    message: string | null;
    error: boolean;
  }>({ running: false, message: null, error: false });

  const handleRetrainFusion = async () => {
    if (retrainState.running) return;
    // Fuel renders this dashboard before a session exists, so the button is
    // reachable while signed out - say so rather than silently doing nothing.
    if (!userId) {
      setRetrainState({
        running: false,
        error: true,
        message: 'Sign in through Zenith Hub first — the retrain reads your own logged history.',
      });
      return;
    }
    setRetrainState({ running: true, message: 'Reading your logged history…', error: false });
    try {
      const samples = buildFusionTrainingSamples({
        readinessScoreByDay: Object.fromEntries(
          Object.entries(readinessByDay)
            .map(([day, entry]) => [day, feltToTarget(entry.felt)])
            .filter(([, score]) => score !== null) as [string, number][]
        ),
        dailyCaloriesMap: thirtyDayCaloriesMap,
        dailyCompletionMap,
        gymVolumeMap,
        activeCaloriesMap,
        caffeineMap: caffeineStats.byDate || {},
        creatineMap: creatineByDate,
        trendWeightMap: zaneResult.trendWeightMap || {},
        sleepLogs,
        energyPerKgTissue: zaneResult.energyPerKgTissue || 7700,
      });

      if (samples.length < 5) {
        setRetrainState({
          running: false,
          error: true,
          message: `Only ${samples.length} usable day${samples.length === 1 ? '' : 's'} of history. `
            + 'A retrain needs at least 5 fully-logged days that also have scale weight around them.',
        });
        return;
      }

      const net = ZenithFusionNet.getInstance();
      await net.init(supabase, userId);
      const before = net.getDiagnostics();
      const result = await net.retrainFromHistory(supabase, userId, samples, 25);
      const after = net.getDiagnostics();

      setRetrainState({
        running: false,
        error: false,
        message: `Retrained on ${result.samples} logged days × ${result.epochs} passes. `
          + `Fit error ${result.finalMse.toFixed(4)}, weight scale ${before.maxAbsWeight.toFixed(2)} → ${after.maxAbsWeight.toFixed(2)}.`,
      });
    } catch (err) {
      console.error('FusionNet retrain failed:', err);
      setRetrainState({
        running: false,
        error: true,
        message: 'Retrain failed. Check your connection and try again.',
      });
    }
  };

  // SOTA ML ZenithFusionNet prediction
  const activeDateCreatine = supplementsLogs
    .filter(s => toYYYYMMDD(s.logged_at) === selectedDateStr && s.supplement_type === 'creatine')
    .reduce((sum, curr) => sum + Number(curr.amount), 0);

  const fusionPredict = ZenithFusionNet.getInstance().predict(
    intakeCalories,
    strengthCaloriesFromVolume(selectedDateGymVolume),
    selectedDateActiveCalories,
    todaySleepQuality !== null ? todaySleepQuality : 80,
    todaySleepDuration !== null ? todaySleepDuration : 8.0,
    todayDeepSleepRatio, // real deep sleep ratio from vigor_sleep (falls back to 0.25 default only if unavailable)
    todayRemSleepRatio, // real REM sleep ratio from vigor_sleep (falls back to 0.18 default only if unavailable)
    todayHrvRmssd, // real hrv_ms when available, else an explicitly-labeled sleep-quality estimate (never fabricated as measured HRV)
    // Delta RHR: no resting-heart-rate pipeline exists anywhere in this app (Health Connect
    // sync defines a resting_heart_rate payload field but never persists it to Supabase), so
    // there is no real signal to wire in. Removing this input dimension would require resizing
    // ZenithFusionNet's input layer, which means reindexing generateDefaultWeights — out of
    // scope here per instructions not to touch that function. Left as a neutral/inert 0.
    0,
    caffeineStats.activeDateCaffeine,
    activeDateCreatine > 0 ? 1.0 : 0.0,
    zaneResult.currentTrendWeight || latestWeight
  );

  // Build the list of 7 days in the viewed week
  const todayDateStr = toDateKeyFromDate(new Date());

  const weekDays = useMemo(() => {
    const days = [];
    const weekdaysLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdaysShort = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    
    for (let i = 0; i < 7; i++) {
      const d = addDays(currentWeekMonday, i);
      const dStr = formatDateString(d);
      days.push({
        dateStr: dStr,
        dayNum: d.getDate(),
        dayShortName: weekdaysShort[d.getDay()],
        dayLongName: weekdaysLong[d.getDay()],
        calories: dailyCaloriesMap[dStr] || 0,
        isComplete: dailyCompletionMap[dStr] ?? true
      });
    }
    return days;
  }, [currentWeekMonday, dailyCaloriesMap, dailyCompletionMap]);

  // SOTA ML / ZANE robust average weekly net balance
  // Use the baselines that ZANE learned, not hardcoded constants
  const zSleepQualityAvg = zaneResult.sleepQualityAvg ?? sleepQualityAvg;
  const zSleepDurationAvg = zaneResult.sleepDurationAvg ?? sleepDurationAvg;

  const averageWeeklyNetBalance = useMemo(() => {
    let totalIntake = 0;
    let totalTdeeVal = 0;
    let loggedDays = 0;

    weekDays.forEach(day => {
      const dateStr = day.dateStr;
      const dayLogs = weeklyFoodLogs.filter(log => log.logged_at.split('T')[0] === dateStr);
      const dayCalories = dayLogs.reduce((sum, f) => sum + f.calories, 0);

      // Skip only days the user themselves marked incomplete. This used to count
      // every day with a logged item, ignoring the same flag that ZANE's
      // calibration and the FusionNet training loop both respect; a day the user
      // knows is half-logged then looks like a huge deficit, and since this
      // figure is extrapolated 28 days forward it becomes roughly a kilo of
      // predicted loss.
      //
      // The flag is the ONLY signal used. A low-intake day is not treated as
      // suspect: skipping meals is a normal pattern - intermittent fasting, or
      // simply not being hungry - so unless the user says otherwise, a light day
      // is real data and belongs in the average.
      const dayIsComplete = dailyCompletionMap[dateStr] ?? true;

      if (dayCalories > 0 && dayIsComplete) {
        loggedDays++;
        totalIntake += dayCalories;

        // Calculate TDEE for this day using the same model as totalTdee
        const dayActiveCalories = activeCaloriesMap[dateStr] || 0;
        const daySleepLog = sleepLogs.find(s => s.logged_at.split('T')[0] === dateStr);
        const daySleepQuality = daySleepLog ? Number(daySleepLog.quality_score) : null;
        const daySleepDuration = daySleepLog ? Number(daySleepLog.duration_minutes) / 60 : null;

        // Bug #5 fix: use ZANE-learned baselines, not hardcoded 80/8.0
        const daySleepAdjustment = daySleepQuality !== null && daySleepDuration !== null
          ? Math.round(
              (daySleepQuality - zSleepQualityAvg) * (zaneResult.sleepQualityCoeff || 0) +
              (daySleepDuration - zSleepDurationAvg) * (zaneResult.sleepDurationCoeff || 0)
            )
          : 0;

        const safeActive = Math.min(1500, dayActiveCalories);
        const dayGymVolume = gymVolumeMap[dateStr] || 0;
        // Design #10 fix: use 0.025 fallback (ZANE prior), not 0
        const dayGymCalories = Math.round(dayGymVolume * (zaneResult.gymVolumeCoeff || 0.025));
        const dayCaffeineLog = supplementsLogs.filter(s => s.logged_at.split('T')[0] === dateStr && s.supplement_type === 'caffeine');
        const dayCaffeineAmount = dayCaffeineLog.reduce((sum, curr) => sum + Number(curr.amount), 0) +
          (weeklyFoodLogs.filter(f => f.logged_at.split('T')[0] === dateStr).reduce((sum, f) => sum + Number(f.caffeine_mg || 0), 0));
        const dayCaffeineCalories = Math.round(dayCaffeineAmount * (zaneResult.caffeineCoeff || 0));

        // Bug #4 fix: include weekendAdjustment and adaptationPenalty — they are part of totalTdee
        const dayIsWeekend = [0, 6].includes(new Date(dateStr + 'T12:00:00').getDay()) ? 1 : 0;
        const dayWeekendAdj = zaneResult.isCalibrated ? ((zaneResult.weekendCoeff || 0) * dayIsWeekend) : 0;
        const dayPreAdaptTdee = Math.round(
          baseTdee + safeActive + (zaneResult.bmrOffset || 0) +
          daySleepAdjustment + dayGymCalories + dayCaffeineCalories + dayWeekendAdj
        );
        const dayAdaptFactor = zaneResult.adaptationFactor ?? 1.0;
        const dayTdee = dayPreAdaptTdee - Math.round(dayPreAdaptTdee * (1 - dayAdaptFactor));
        totalTdeeVal += dayTdee;
      }
    });

    if (loggedDays > 0) {
      return {
        balance: Math.round((totalIntake / loggedDays) - (totalTdeeVal / loggedDays)),
        avgIntake: Math.round(totalIntake / loggedDays),
        loggedDays
      };
    }

    // Fallback to today's balance if no data logged this week
    return { balance: intakeCalories - totalTdee, avgIntake: intakeCalories, loggedDays: 0 };
  }, [weekDays, weeklyFoodLogs, dailyCompletionMap, activeCaloriesMap, sleepLogs, gymVolumeMap, supplementsLogs, zaneResult, baseTdee, intakeCalories, totalTdee, zSleepQualityAvg, zSleepDurationAvg]);

  // Weight Projection (Using average weekly balance for stability)
  // Bug #6 fix: use body-composition-aware energy density from ZANE instead of flat 7700
  const projectionEnergyPerKg = zaneResult.energyPerKgTissue ?? 7700;
  /**
   * Energy balance averaged over the same 28-day window the measured weight
   * trend covers.
   *
   * The weekly figure above answers "how am I doing this week", which is the
   * right question for the day-to-day view but the wrong one to hold against a
   * four-week weight trend. Comparing a three-day intake average with a 28-day
   * trend compares two different periods, and the difference between them shows
   * up as a permanent "your log disagrees with your scale" warning even when the
   * model is accurate. Measured over matched windows on this athlete's data the
   * two agree to 0.03 kg/week; compared as week-vs-month they look 0.22 apart.
   */
  const longRunNetBalance = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const cutoffStr = toDateKeyFromDate(cutoff);

    let totalIntake = 0;
    let totalTdeeVal = 0;
    let days = 0;

    for (const dateStr of Object.keys(thirtyDayCaloriesMap)) {
      if (dateStr < cutoffStr) continue;
      const dayCalories = thirtyDayCaloriesMap[dateStr] || 0;
      if (dayCalories <= 0) continue;
      if (!(dailyCompletionMap[dateStr] ?? true)) continue;

      const dayActiveCalories = activeCaloriesMap[dateStr] || 0;
      const daySleepLog = sleepLogs.find(sl => toYYYYMMDD(sl.logged_at) === dateStr);
      const daySleepQuality = daySleepLog ? Number(daySleepLog.quality_score) : null;
      const daySleepDuration = daySleepLog ? Number(daySleepLog.duration_minutes) / 60 : null;
      const daySleepAdjustment = daySleepQuality !== null && daySleepDuration !== null
        ? Math.round(
            (daySleepQuality - zSleepQualityAvg) * (zaneResult.sleepQualityCoeff || 0) +
            (daySleepDuration - zSleepDurationAvg) * (zaneResult.sleepDurationCoeff || 0)
          )
        : 0;

      const safeActive = Math.min(1500, dayActiveCalories);
      const dayGymCalories = Math.round((gymVolumeMap[dateStr] || 0) * (zaneResult.gymVolumeCoeff || 0.025));
      const dayCaffeineCalories = Math.round((caffeineStats.byDate?.[dateStr] || 0) * (zaneResult.caffeineCoeff || 0));
      const dayIsWeekend = [0, 6].includes(new Date(dateStr + 'T12:00:00').getDay()) ? 1 : 0;
      const dayWeekendAdj = zaneResult.isCalibrated ? ((zaneResult.weekendCoeff || 0) * dayIsWeekend) : 0;

      const dayPreAdaptTdee = Math.round(
        baseTdee + safeActive + (zaneResult.bmrOffset || 0) +
        daySleepAdjustment + dayGymCalories + dayCaffeineCalories + dayWeekendAdj
      );
      const dayAdaptFactor = zaneResult.adaptationFactor ?? 1.0;
      totalTdeeVal += dayPreAdaptTdee - Math.round(dayPreAdaptTdee * (1 - dayAdaptFactor));
      totalIntake += dayCalories;
      days++;
    }

    if (days === 0) return null;
    return {
      balance: Math.round(totalIntake / days - totalTdeeVal / days),
      avgIntake: Math.round(totalIntake / days),
      days
    };
  }, [thirtyDayCaloriesMap, dailyCompletionMap, activeCaloriesMap, sleepLogs, gymVolumeMap, caffeineStats, zaneResult, baseTdee, zSleepQualityAvg, zSleepDurationAvg]);

  const netDailyBalance = averageWeeklyNetBalance.balance;
  const balanceSampleDays = averageWeeklyNetBalance.loggedDays;
  const projectedWeightChange = (netDailyBalance * 28) / projectionEnergyPerKg;
  const weeklyWeightRate = (netDailyBalance * 7) / projectionEnergyPerKg;

  const startingWeightForProjection = zaneResult.currentTrendWeight || latestWeight;
  const projectedWeight = Math.round((startingWeightForProjection + projectedWeightChange) * 100) / 100;

  // What the scale actually did over the last four weeks, for comparison with
  // the formula-derived projection above. When the two disagree materially the
  // formula's inputs are usually at fault - typically under-logged days, which
  // understate intake and so overstate the deficit.
  const measuredWeeklyRate = useMemo(
    () => measuredWeeklyRateKg(zaneResult.trendWeightMap || {}, 28),
    [zaneResult.trendWeightMap]
  );

  // Expenditure worked back from the measurement: what the athlete must actually
  // be burning for their logged intake to have produced the weight change the
  // scale recorded. This is measured rather than estimated, so it is preferred
  // over the formula wherever both exist.
  //
  // Note the completeness flag is the user's own declaration and nothing here
  // second-guesses it. Skipping meals is a normal eating pattern - intermittent
  // fasting, or simply not being hungry - so a light day that was not flagged
  // incomplete is real data and belongs in the average.
  const measuredDailyBalance = measuredWeeklyRate !== null
    ? Math.round((measuredWeeklyRate * projectionEnergyPerKg) / 7)
    : null;
  // Averaged over the same window as the measured rate: pairing a 28-day weight
  // trend with a three-day intake average produced an expenditure figure that
  // was really just a reflection of one unusual week.
  const impliedActualTdee = measuredDailyBalance !== null && longRunNetBalance !== null
    ? longRunNetBalance.avgIntake - measuredDailyBalance
    : null;

  // There is deliberately no "your log disagrees with your scale" warning.
  //
  // It was unactionable: the projection is driven by the ZANE formula, while the
  // button it told you to press retrains ZenithFusionNet, which does not feed
  // the projection at all - so the warning could never clear, however many times
  // you retrained. Rather than tune its threshold, the card now tells one
  // coherent story: once the scale has enough history the burn is taken FROM the
  // measurement, so there are no longer two rival numbers to reconcile. The
  // formula's own estimate stays visible in the burn card.
  const hasMeasuredBurn = impliedActualTdee !== null && impliedActualTdee > 0;

  // Percent of bodyweight per week. ~1%/week is the usual upper bound for a
  // rate that preserves lean mass; beyond that the copy shouldn't call it
  // "healthy, sustainable".
  //
  // Judged on the MEASURED rate whenever the scale provides one, falling back
  // to the projection only when it doesn't. Telling someone to eat more should
  // rest on what their body is actually doing, not on an estimate that can be
  // several hundred kcal off - on this athlete's data the projection implied
  // 1.1%/week while the scale showed 0.5%.
  // The headline figure. Prefer the measured trend: it observes the outcome
  // directly, where the logged-intake projection has to infer it through both
  // an intake log and an expenditure estimate, either of which can drift.
  const headlineProjectedWeight = measuredWeeklyRate !== null
    ? startingWeightForProjection + measuredWeeklyRate * 4
    : projectedWeight;

  // An untrained FusionNet saturates: its priors are all positive, so the
  // weighted sum pins the sigmoid near 1 and the output sits at the top of its
  // 1000..5000 range regardless of input. Rather than present that as a real
  // estimate, detect the divergence from the formula and say it needs fitting.
  const fusionDivergence = totalTdee > 0
    ? Math.abs(fusionPredict.tdeeKcal - totalTdee) / totalTdee
    : 0;
  const fusionLooksUnfitted = fusionDivergence > 0.4;

  /**
   * Today's burn: the formula and the learning model, averaged.
   *
   * The model was previously computed, trained, stored and displayed - and then
   * consumed by nothing at all. Its output moved no target and no forecast.
   *
   * On this athlete's logged days, evaluated leave-one-out against the
   * expenditure implied by their measured weight change, mean absolute error
   * came out at 626 kcal for the formula alone, 537 for the model alone and 554
   * for the average of the two. The model alone scored best, but it is trained
   * on targets derived from that same weight-trend method and then scored
   * against them, so some of that edge is circular - and a network with twelve
   * inputs fitted on a few weeks of days can fail badly and quietly. It did
   * exactly that until recently, saturating at the top of its output range.
   * Averaging keeps most of the accuracy and halves the damage when the model
   * is wrong.
   *
   * Gated on the model looking fitted at all: while it is still saturating or
   * wildly out of line with the formula, the formula is used on its own.
   */
  const blendedBurnToday = !fusionLooksUnfitted && fusionPredict.tdeeKcal > 0
    ? Math.round((goalDerivedFromTdee + fusionPredict.tdeeKcal) / 2)
    : goalDerivedFromTdee;
  const burnIsBlended = blendedBurnToday !== goalDerivedFromTdee;

  // Added at full value to whichever figure the blend produced. Neither the formula
  // nor the model has any way to know about a session that has not happened yet.
  const displayedBurnToday = blendedBurnToday + plannedBurn;

  /**
   * Targets re-derived from the blended burn, using ZANE's own generateTargets.
   *
   * Blending the model into the displayed burn was not enough on its own: the
   * calorie goal is produced inside ZANE from ZANE's TDEE, so the goal - and
   * the macros under it - still came from the formula alone. The card ended up
   * showing "today's total 2384" beside "what you burn today 2289", and the
   * model still moved nothing that mattered.
   *
   * generateTargets is exported and pure, so it is called a second time with
   * the blended figure rather than reimplementing the deficit caps and the
   * safety floor here. One implementation, two inputs.
   */
  const blendedTargets = useMemo(() => {
    if ((!burnIsBlended && plannedBurn <= 0) || !zaneResult.isCalibrated) return null;
    return generateTargets(
      displayedBurnToday,
      burnParts.bmr,
      latestWeight,
      profile,
      zaneResult.bmrOffset,
      zaneResult.sleepQualityCoeff,
      zaneResult.sleepDurationCoeff,
      zaneResult.gymVolumeCoeff,
      zaneResult.caffeineCoeff,
      zaneResult.weekendCoeff,
      zaneResult.adaptationFactor,
      zaneResult.sustainedCutDays,
      zaneResult.calibrationDays,
      zaneResult.isCalibrated,
      zaneResult.trendWeightMap,
      zaneResult.currentTrendWeight,
      zaneResult.sleepQualityAvg,
      zaneResult.sleepDurationAvg,
      zaneResult.energyPerKgTissue,
      burnParts
    );
  }, [burnIsBlended, displayedBurnToday, burnParts, latestWeight, profile, zaneResult]);

  /**
   * The targets actually shown. Falls back to ZANE's own when the model is not
   * fitted, so nothing changes until the blend is trustworthy.
   */
  const effectiveTargets = blendedTargets ?? zaneResult;

  /**
   * Each day of the week's calorie target, so the strip can show eaten against it.
   *
   * No target is stored per day - fuel_days holds only a date and a completeness
   * flag - so this reconstructs each day's from the same pieces today's is built
   * from: the athlete's base, that day's activity, gym work, caffeine, sleep and
   * whether it was a weekend. It is the same generateTargets used for today, given a
   * different day's expenditure.
   *
   * That means it is the target this athlete's CURRENT calibration implies for that
   * day, not necessarily the number the app displayed at the time - ZANE's
   * coefficients move as it learns. Worth knowing before reading a red day as a
   * verdict on a Tuesday three weeks ago.
   *
   * Days ZANE has not calibrated for get nothing rather than a guess.
   */
  const weekDayTargets = useMemo((): Record<string, number> => {
    if (!zaneResult.isCalibrated || baseTdee <= 0) return {};
    const out: Record<string, number> = {};

    for (const day of weekDays) {
      const d = day.dateStr;

      const dayActive = Math.min(1500, activeCaloriesMap[d] || 0);
      const dayGymVolume = gymVolumeMap[d] || 0;
      const dayGym = dayGymVolume > 0 ? Math.round(dayGymVolume * zaneResult.gymVolumeCoeff) : 0;

      const dayCaffeine = supplementsLogs
        .filter(sup => sup.supplement_type === 'caffeine' && toYYYYMMDD(sup.logged_at) === d)
        .reduce((sum, sup) => sum + Number(sup.amount || 0), 0);
      const dayCaffeineKcal = dayCaffeine > 0 ? Math.round(dayCaffeine * zaneResult.caffeineCoeff) : 0;

      const daySleep = sleepLogs.find(sl => sl.logged_at?.split('T')[0] === d);
      let daySleepAdj = 0;
      if (daySleep) {
        const rawQ = Number(daySleep.quality_score);
        const q = rawQ > 0 ? rawQ : calculateZenithSleepScore(daySleep, sleepLogs).score;
        const hours = Number(daySleep.duration_minutes) / 60;
        daySleepAdj = Math.round(
          zaneResult.sleepQualityCoeff * (q - zaneResult.sleepQualityAvg) +
          zaneResult.sleepDurationCoeff * (hours - zaneResult.sleepDurationAvg)
        );
      }

      const isWeekend = [0, 6].includes(new Date(d + 'T12:00:00').getDay()) ? 1 : 0;
      const dayWeekend = Math.round((zaneResult.weekendCoeff || 0) * isWeekend);

      const preAdaptation = baseTdee + zaneResult.bmrOffset + dayActive + dayGym
        + dayCaffeineKcal + daySleepAdj + dayWeekend;
      const dayTdee = Math.round(preAdaptation * (zaneResult.adaptationFactor ?? 1.0));
      if (dayTdee <= 0) continue;

      const targets = generateTargets(
        dayTdee,
        burnParts.bmr,
        latestWeight,
        profile,
        zaneResult.bmrOffset,
        zaneResult.sleepQualityCoeff,
        zaneResult.sleepDurationCoeff,
        zaneResult.gymVolumeCoeff,
        zaneResult.caffeineCoeff,
        zaneResult.weekendCoeff,
        zaneResult.adaptationFactor,
        zaneResult.sustainedCutDays,
        zaneResult.calibrationDays,
        zaneResult.isCalibrated,
        zaneResult.trendWeightMap,
        zaneResult.currentTrendWeight,
        zaneResult.sleepQualityAvg,
        zaneResult.sleepDurationAvg,
        zaneResult.energyPerKgTissue,
        burnParts
      );
      if (targets?.dailyCalorieTarget > 0) out[d] = Math.round(targets.dailyCalorieTarget);
    }

    return out;
  }, [weekDays, zaneResult, baseTdee, activeCaloriesMap, gymVolumeMap, supplementsLogs, sleepLogs, burnParts, latestWeight, profile]);

  // Progress rings and remaining amounts, all measured against the targets that
  // are actually displayed - which means the blended ones when the learning
  // model is trusted. Placed after effectiveTargets for that reason.
  const caloriesPercentage = Math.min(100, Math.round((intakeCalories / effectiveTargets.dailyCalorieTarget) * 100)) || 0;
  const carbsPercentage = Math.min(100, Math.round((intakeCarbs / effectiveTargets.dailyCarbTarget) * 100)) || 0;
  const proteinPercentage = Math.min(100, Math.round((intakeProtein / effectiveTargets.dailyProteinTarget) * 100)) || 0;
  const fatPercentage = Math.min(100, Math.round((intakeFat / effectiveTargets.dailyFatTarget) * 100)) || 0;

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (caloriesPercentage / 100) * circumference;

  const remainingCalories = effectiveTargets.dailyCalorieTarget - intakeCalories;
  const calorieRingColor = remainingCalories < 0 ? '#ff7675' : 'var(--color-primary)';


  const rateForHealthJudgement = measuredWeeklyRate ?? weeklyWeightRate;
  const weeklyRatePercent = startingWeightForProjection > 0
    ? Math.abs(rateForHealthJudgement) / startingWeightForProjection * 100
    : 0;
  const lossRateIsAggressive = rateForHealthJudgement < 0 && weeklyRatePercent > 1.0;

  const weeklyStats = useMemo(() => {
    let totalIntakeCalories = 0;
    let totalTargetCalories = 0;
    let daysWithData = 0;

    let totalIntakeCarbs = 0;
    let totalTargetCarbs = 0;
    let totalIntakeProtein = 0;
    let totalTargetProtein = 0;
    let totalIntakeFat = 0;
    let totalTargetFat = 0;

    const differences: number[] = [];

    // We need logsMap to run calibration for each day of the week
    // Let's rebuild the logsMap for the 30 days up to each week day
    const latestWeight = weightLogs[weightLogs.length - 1]?.weight || 75;
    
    // Create base logsMap
    const baseLogsMap: { [date: string]: DailyLogData } = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = toDateKeyFromDate(d);
      baseLogsMap[dateStr] = {
        date: dateStr,
        weight: null,
        calories: 0,
        activeCalories: 0,
        sleepQuality: null,
        sleepDurationHours: null,
        // Bug #2 fix: default false, same as main calibration useEffect
        isComplete: false,
        gymVolume: 0,
        creatine: 0,
        caffeine: 0,
        // Bug #3 fix: include macro fields so TEF calculation is correct
        protein: 0,
        carbs: 0,
        fat: 0
      };
    }
    weightLogs.forEach(w => {
      const dStr = w.logged_at.split('T')[0];
      if (baseLogsMap[dStr]) baseLogsMap[dStr].weight = Number(w.weight);
    });
    sleepLogs.forEach(s => {
      const dStr = s.logged_at.split('T')[0];
      if (baseLogsMap[dStr]) {
        // Same fallback as the calibration path above: a missing wearable score
        // becomes Zenith's own computed score, never a literal 0.
        const rawScore = Number(s.quality_score);
        const hasStageData = s.deep_minutes != null || s.rem_minutes != null;
        const derived = rawScore > 0
          ? rawScore
          : (hasStageData && Number(s.duration_minutes) > 0
              ? calculateZenithSleepScore(s, sleepLogs).score
              : 0);
        baseLogsMap[dStr].sleepQuality = derived > 0 ? derived : null;
        baseLogsMap[dStr].sleepDurationHours = Number(s.duration_minutes) / 60;
      }
    });
    // Bug #3 fix: accumulate protein/carbs/fat so macro TEF in ZANE is not always 0
    weeklyFoodLogs.forEach(f => {
      const dStr = f.logged_at.split('T')[0];
      if (baseLogsMap[dStr]) {
        baseLogsMap[dStr].calories += Number(f.calories);
        baseLogsMap[dStr].caffeine = (baseLogsMap[dStr].caffeine || 0) + Number(f.caffeine_mg || 0);
        baseLogsMap[dStr].protein = (baseLogsMap[dStr].protein || 0) + Number(f.protein || 0);
        baseLogsMap[dStr].carbs = (baseLogsMap[dStr].carbs || 0) + Number(f.carbs || 0);
        baseLogsMap[dStr].fat = (baseLogsMap[dStr].fat || 0) + Number(f.fat || 0);
      }
    });
    gymLogs.forEach(k => {
      const dStr = k.completed_at.split('T')[0];
      if (baseLogsMap[dStr]) baseLogsMap[dStr].gymVolume += Number(k.volume || 0);
    });
    supplementsLogs.forEach(s => {
      const dStr = s.logged_at.split('T')[0];
      if (baseLogsMap[dStr]) {
        if (s.supplement_type === 'creatine') {
          baseLogsMap[dStr].creatine = (baseLogsMap[dStr].creatine || 0) + Number(s.amount);
        } else if (s.supplement_type === 'caffeine') {
          baseLogsMap[dStr].caffeine = (baseLogsMap[dStr].caffeine || 0) + Number(s.amount);
        }
      }
    });

    // Bug fix (perf): runZaneCalibration's ridge-regression solve depends only on the
    // 30-day historical logs (baseLogsMap, identical for every day of the displayed week),
    // not on which day's target we're composing for — this block used to call it once per
    // day (7x), re-solving the same regression every time just to get a different day's
    // target composition. Fit the regression ONCE here, then reuse its coefficients for
    // each day's genuinely-different composition (active calories/gym/caffeine/sleep do
    // legitimately vary per day, so the final targets below still differ day to day).
    const weekRegressionProfile = { ...profile, todayTrainingType: 'rest' as const };
    const weekZaneOutput = runZaneCalibration(Object.values(baseLogsMap), weekRegressionProfile, latestWeight, weekDays[weekDays.length - 1]?.dateStr);
    // baseLogsMap never carries body-fat data (unlike the top-level zaneResult calibration),
    // so runZaneCalibration would always fall back to Mifflin-St Jeor BMR here too — this
    // matches exactly what each of the 7 removed per-day calls computed internally.
    const weekBaseBmr = calculateMifflinBmr(latestWeight, profile.height || 181, calculateAge(profile.birthDate), profile.gender || 'male');

    // Loop through the 7 days of the viewed week
    weekDays.forEach(day => {
      const dateStr = day.dateStr;

      // Calculate intake for this day
      const dayLogs = weeklyFoodLogs.filter(log => log.logged_at.split('T')[0] === dateStr);
      const dayCalories = dayLogs.reduce((sum, f) => sum + f.calories, 0);
      const dayCarbs = dayLogs.reduce((sum, f) => sum + f.carbs, 0);
      const dayProtein = dayLogs.reduce((sum, f) => sum + f.protein, 0);
      const dayFat = dayLogs.reduce((sum, f) => sum + f.fat, 0);

      // Determine today's training type for calibration
      const dayActiveCalories = activeCaloriesMap[dateStr] || 0;
      let todayTrainingType: 'intense' | 'endurance' | 'rest' | null = 'rest';
      if (dayActiveCalories > 450) {
        todayTrainingType = 'intense';
      } else if (dayActiveCalories > 150) {
        todayTrainingType = 'endurance';
      }

      const activeProfile = {
        ...profile,
        todayTrainingType
      };

      // Compose this day's TDEE from the shared fitted coefficients (same formula
      // runZaneCalibration used internally, mirrors averageWeeklyNetBalance above).
      const daySleepLog = sleepLogs.find(s => s.logged_at.split('T')[0] === dateStr);
      const daySleepQuality = daySleepLog ? Number(daySleepLog.quality_score) : null;
      const daySleepDuration = daySleepLog ? Number(daySleepLog.duration_minutes) / 60 : null;
      const daySleepAdjustment = daySleepQuality !== null && daySleepDuration !== null
        ? Math.round(
            (daySleepQuality - weekZaneOutput.sleepQualityAvg) * weekZaneOutput.sleepQualityCoeff +
            (daySleepDuration - weekZaneOutput.sleepDurationAvg) * weekZaneOutput.sleepDurationCoeff
          )
        : 0;

      const safeActive = Math.min(1500, dayActiveCalories);
      const dayGymVolume = gymVolumeMap[dateStr] || 0;
      const dayGymCalories = Math.round(dayGymVolume * (weekZaneOutput.gymVolumeCoeff || 0.025));
      const dayCaffeineLog = supplementsLogs.filter(s => s.logged_at.split('T')[0] === dateStr && s.supplement_type === 'caffeine');
      const dayCaffeineAmount = dayCaffeineLog.reduce((sum, curr) => sum + Number(curr.amount), 0) +
        (weeklyFoodLogs.filter(f => f.logged_at.split('T')[0] === dateStr).reduce((sum, f) => sum + Number(f.caffeine_mg || 0), 0));
      const dayCaffeineCalories = Math.round(dayCaffeineAmount * (weekZaneOutput.caffeineCoeff || 0));

      const dayIsWeekend = [0, 6].includes(new Date(dateStr + 'T12:00:00').getDay()) ? 1 : 0;
      const dayWeekendAdj = weekZaneOutput.isCalibrated ? ((weekZaneOutput.weekendCoeff || 0) * dayIsWeekend) : 0;
      const dayPreAdaptTdee = Math.round(
        weekBaseBmr * 1.2 + safeActive + (weekZaneOutput.bmrOffset || 0) +
        daySleepAdjustment + dayGymCalories + dayCaffeineCalories + dayWeekendAdj
      );
      const dayAdaptFactor = weekZaneOutput.adaptationFactor ?? 1.0;
      const dayTdee = dayPreAdaptTdee - Math.round(dayPreAdaptTdee * (1 - dayAdaptFactor));

      const zOutput = generateTargets(
        dayTdee, weekBaseBmr, latestWeight, activeProfile,
        weekZaneOutput.bmrOffset, weekZaneOutput.sleepQualityCoeff, weekZaneOutput.sleepDurationCoeff,
        weekZaneOutput.gymVolumeCoeff, weekZaneOutput.caffeineCoeff, weekZaneOutput.weekendCoeff,
        weekZaneOutput.adaptationFactor, weekZaneOutput.sustainedCutDays, weekZaneOutput.calibrationDays,
        weekZaneOutput.isCalibrated, weekZaneOutput.trendWeightMap, weekZaneOutput.currentTrendWeight,
        weekZaneOutput.sleepQualityAvg, weekZaneOutput.sleepDurationAvg, weekZaneOutput.energyPerKgTissue
      );

      totalIntakeCalories += dayCalories;
      totalTargetCalories += zOutput.dailyCalorieTarget;

      totalIntakeCarbs += dayCarbs;
      totalTargetCarbs += zOutput.dailyCarbTarget;
      totalIntakeProtein += dayProtein;
      totalTargetProtein += zOutput.dailyProteinTarget;
      totalIntakeFat += dayFat;
      totalTargetFat += zOutput.dailyFatTarget;

      if (dayCalories > 0) {
        daysWithData++;
        // Bug fix: guard against dailyCalorieTarget being 0/falsy (e.g. pathological
        // weight/profile input), which would otherwise divide by zero and propagate NaN
        // into the rendered weekly consistency score. Treat that day as perfectly
        // consistent (0 deviation) rather than corrupting the whole week's average.
        const diff = zOutput.dailyCalorieTarget > 0
          ? Math.abs(dayCalories - zOutput.dailyCalorieTarget) / zOutput.dailyCalorieTarget
          : 0;
        differences.push(diff);
      }
    });

    const averageIntakeCal = daysWithData > 0 ? Math.round(totalIntakeCalories / daysWithData) : 0;
    const averageTargetCal = Math.round(totalTargetCalories / 7);

    // Consistency score (0 to 100%)
    let consistencyScore = 100;
    if (differences.length > 0) {
      const avgDiff = differences.reduce((sum, d) => sum + d, 0) / differences.length;
      consistencyScore = Math.max(0, Math.min(100, Math.round(100 - avgDiff * 100)));
    }

    return {
      averageIntakeCal,
      averageTargetCal,
      consistencyScore,
      // Bug fix: don't clamp the underlying percentage — overeating a macro by 80% used
      // to render identically to hitting it exactly (both showed "100%" / "Achieved").
      // Keep the real value here; only the progress-bar WIDTH gets capped at render time.
      carbsPercent: totalTargetCarbs > 0 ? Math.round((totalIntakeCarbs / totalTargetCarbs) * 100) : 0,
      proteinPercent: totalTargetProtein > 0 ? Math.round((totalIntakeProtein / totalTargetProtein) * 100) : 0,
      fatPercent: totalTargetFat > 0 ? Math.round((totalIntakeFat / totalTargetFat) * 100) : 0,
    };
  }, [weekDays, weeklyFoodLogs, supplementsLogs, profile, weightLogs, sleepLogs, gymLogs, activeCaloriesMap, gymVolumeMap]);

  const formattedWeekRange = useMemo(() => {
    const mondayStr = currentWeekMonday.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    const sundayStr = addDays(currentWeekMonday, 6).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    return `Week of ${mondayStr} to ${sundayStr}`;
  }, [currentWeekMonday]);

  const selectedDateLongName = useMemo(() => {
    const match = weekDays.find(d => d.dateStr === selectedDateStr);
    if (!match) return '';
    return `${match.dayLongName} ${new Date(selectedDateStr).toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}`;
  }, [weekDays, selectedDateStr]);

  if (loadingSession) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b' }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
          Loading Zenith Fuel...
        </div>
      </div>
    );
  }

  const fuelNavItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <Sparkles size={14} /> },
    { key: 'logbook', label: 'Logbook', icon: <BookOpen size={14} /> },
    { key: 'ingredients', label: 'Ingredients', icon: <Barcode size={14} /> },
    { key: 'recipes', label: 'Recipes', icon: <ChefHat size={14} /> },
    { key: 'supplements', label: 'Supplements', icon: <Activity size={14} /> }
  ];

  return (
    <div className="fuel-container animate-fade-in" style={{ padding: 0 }}>
      <div className="fuel-glow" />
      {/* TOP HEADER — shared shell used by every Zenith app */}
      <ZenithPageHeader
        appName="FUEL"
        subtitle={`Food Diary & Energy Balance for ${userName}`}
        tabs={fuelNavItems as unknown as ZenithHeaderTab[]}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as any)}
      />

      <div style={{ padding: '0 24px 24px' }}>
        {/* NOTIFICATION TOAST BANNER */}
      {notification && (
        <div 
          className={`notification-banner ${notification.isError ? 'error' : ''} animate-slide-down`}
          style={{ position: 'fixed', top: 20, right: 32, zIndex: 110 }}
        >
          {notification.isError ? <ShieldAlert size={16} /> : <Check size={16} />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* DASHBOARD VIEW */}
      {activeTab === 'dashboard' && (
        <div className="fuel-grid">
          {/* The dashboard is where most of the reading happens and it had no date
              control at all: every figure on it is for the selected day, and the only
              way to change that day was to go to another tab and come back. */}
          <WeekDateSelector
            weekDays={weekDays}
            selectedDateStr={selectedDateStr}
            onSelect={setSelectedDateStr}
            formattedWeekRange={formattedWeekRange}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            showIncompleteFlag
            todayDateStr={todayDateStr}
            renderDayTitle={day => {
              const target = day.dateStr === selectedDateStr
                ? effectiveTargets?.dailyCalorieTarget
                : weekDayTargets[day.dateStr];
              if (!target || target <= 0) return `${day.dayLongName}: no target — ZANE has not calibrated for this day`;
              const eaten = day.calories > 0 ? `${day.calories} kcal logged` : 'nothing logged';
              const diff = day.calories > 0 ? ` (${day.calories - target >= 0 ? '+' : ''}${day.calories - target})` : '';
              return `${day.dayLongName}: ${eaten} against a ${target} kcal target${diff}`;
            }}
            footnote={
              Object.keys(weekDayTargets).length > 0 ? (
                <>Eaten against that day&apos;s target.{' '}
                  <span style={{ color: '#55efc4', fontWeight: 700 }}>on target</span>,{' '}
                  <span style={{ color: '#ff7675', fontWeight: 700 }}>over</span>,{' '}
                  <span style={{ color: '#74b9ff', fontWeight: 700 }}>under</span>.
                  Past days are recomputed from your current calibration, so they show what
                  that day would be targeted at today &mdash; not necessarily the number shown at
                  the time.</>
              ) : null
            }
            renderDayNote={day => {
              // The selected day's target is the live one, which accounts for planned
              // work and the model blend; other days are reconstructed. Using the
              // reconstruction for today too would show a different number from the
              // one on the card immediately below it.
              const target = day.dateStr === selectedDateStr
                ? effectiveTargets?.dailyCalorieTarget
                : weekDayTargets[day.dateStr];

              if (!target || target <= 0) {
                return day.calories > 0 ? `${day.calories} kcal` : '—';
              }
              if (day.calories <= 0) {
                // Nothing logged is not the same as nothing eaten, and colouring it
                // green for being "under" would congratulate an empty page.
                return <span style={{ color: 'var(--text-muted)' }}>— / {target}</span>;
              }

              const over = day.calories - target;
              // Within 5% is on target; a hundred kilocalories either way is noise in
              // a figure built from logged portions.
              const onTarget = Math.abs(over) <= target * 0.05;
              const colour = onTarget ? '#55efc4' : over > 0 ? '#ff7675' : '#74b9ff';
              return (
                <span style={{ color: colour, fontWeight: 800 }}>
                  {day.calories} / {target}
                </span>
              );
            }}
          />

          {/* Hero row: Calorie Balance is the single "am I on track today" number,
              so it gets the tinted zenith-hero-card treatment and the wider span;
              Macronutrients is demoted to a narrower supporting column beside it. */}
          <div className="zenith-grid-12 col-12">
          {/* Main Calorie Ring */}
          <div className="fuel-card zenith-hero-card zenith-span-8">
            <h3 className="fuel-card-title">
              <Activity size={14} style={{ color: 'var(--color-primary)' }} /> Calorie Balance ({new Date(selectedDateStr).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })})
            </h3>
            <div className="cal-balance-wrap">
              <div className="cal-circle-container">
                <svg width="140" height="140">
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="transparent"
                    stroke="rgba(255, 255, 255, 0.04)"
                    strokeWidth="10"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="transparent"
                    stroke={calorieRingColor}
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90 70 70)"
                    style={{ transition: 'stroke-dashoffset 0.3s, stroke 0.3s' }}
                  />
                </svg>
                <div className="cal-circle-text">
                  <span className="cal-circle-val">{intakeCalories}</span>
                  <span className="cal-circle-lbl">kcal in</span>
                </div>
              </div>

              <div className="cal-details">
                <div className="cal-detail-row">
                  <span style={{ color: 'var(--text-muted)' }}>
                    Today&apos;s goal
                    {goalPhase !== 'maintain' && (
                      <span style={{ display: 'block', fontSize: '10px' }}>
                        to {goalPhase === 'cut' ? 'lose' : 'gain'} {goalRateKgPerWeek} kg a week,
                        heading for {profile.targetWeight} kg
                      </span>
                    )}
                  </span>
                  <span className="cal-detail-val">{effectiveTargets.dailyCalorieTarget} kcal</span>
                </div>
                <div className="cal-detail-row">
                  <span style={{ color: 'var(--text-muted)' }}>Eaten so far</span>
                  <span className="cal-detail-val">{intakeCalories} kcal</span>
                </div>
                <div className="cal-detail-row">
                  <span style={{ color: 'var(--text-muted)' }}>{remainingCalories < 0 ? 'Over your goal by' : 'Still to eat'}</span>
                  <span className="cal-detail-val" style={{ color: calorieRingColor }}>
                    {remainingCalories < 0 ? Math.abs(remainingCalories) : remainingCalories} kcal
                  </span>
                </div>

                {/* Where the goal comes from, on demand. It is the number the whole
                    card is built around and nothing previously said how it was
                    arrived at, which made it look arbitrary. */}
                {hasBurnBreakdown && (
                <details style={{ marginTop: '4px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)' }}>
                    How is this goal worked out?
                  </summary>
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>What you burn today</span>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{displayedBurnToday} kcal</span>
                    </div>
                    {goalPhase === 'cut' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          Eat less, to lose {goalRateKgPerWeek} kg a week
                        </span>
                        <span style={{ fontWeight: 700, color: '#55efc4' }}>
                          &minus;{Math.max(0, displayedBurnToday - effectiveTargets.dailyCalorieTarget)} kcal
                        </span>
                      </div>
                    )}
                    {goalPhase === 'bulk' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          Eat more, to gain {goalRateKgPerWeek} kg a week
                        </span>
                        <span style={{ fontWeight: 700, color: '#ff7675' }}>
                          +{Math.max(0, effectiveTargets.dailyCalorieTarget - displayedBurnToday)} kcal
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '6px', fontWeight: 800 }}>
                      <span style={{ color: 'var(--color-primary)' }}>Your goal</span>
                      <span style={{ color: 'var(--color-primary)' }}>{effectiveTargets.dailyCalorieTarget} kcal</span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      {goalPhase === 'cut' ? (
                        <>A kilo of body fat is roughly 7,700 kcal, so losing {goalRateKgPerWeek} kg a
                        week means eating about {Math.round((goalRateKgPerWeek * 7700) / 7)} kcal a day
                        less than you burn. Zenith caps that gap at 600 kcal and never sets a goal below{' '}
                        {calorieSafetyFloor} kcal for you, because bigger gaps cost muscle rather than fat.</>
                      ) : goalPhase === 'bulk' ? (
                        <>Gaining {goalRateKgPerWeek} kg a week means eating above what you burn.
                        Zenith caps the surplus at 500 kcal a day, since beyond that you mostly add fat
                        rather than muscle.</>
                      ) : (
                        <>You are at your target weight, so your goal simply matches what you burn.
                        Change your target weight to switch to losing or gaining.</>
                      )}
                    </p>
                  </div>
                </details>
                )}
              </div>
            </div>
          </div>

          {/* Macros Progress Card */}
          <div className="fuel-card zenith-span-4">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> Macronutrients
            </h3>
            <div className="macro-list">
              <div className="macro-bar-item">
                <div className="macro-header">
                  <span className="macro-name" style={{ color: 'var(--color-carb)' }}>Carbohydrates</span>
                  <span className="macro-amounts">
                    {intakeCarbs}g <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>/ {effectiveTargets.dailyCarbTarget}g</span>
                    <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>
                      {Math.max(0, effectiveTargets.dailyCarbTarget - Math.round(intakeCarbs))}g to go
                    </span>
                  </span>
                </div>
                <div className="macro-track">
                  <div 
                    className="macro-fill" 
                    style={{ width: `${carbsPercentage}%`, background: 'var(--color-carb)' }} 
                  />
                </div>
              </div>

              <div className="macro-bar-item">
                <div className="macro-header">
                  <span className="macro-name" style={{ color: 'var(--color-protein)' }}>Protein</span>
                  <span className="macro-amounts">
                    {intakeProtein}g <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>/ {effectiveTargets.dailyProteinTarget}g</span>
                    <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>
                      {Math.max(0, effectiveTargets.dailyProteinTarget - Math.round(intakeProtein))}g to go
                    </span>
                  </span>
                </div>
                <div className="macro-track">
                  <div 
                    className="macro-fill" 
                    style={{ width: `${proteinPercentage}%`, background: 'var(--color-protein)' }} 
                  />
                </div>
              </div>

              <div className="macro-bar-item">
                <div className="macro-header">
                  <span className="macro-name" style={{ color: 'var(--color-fat)' }}>Fats</span>
                  <span className="macro-amounts">
                    {intakeFat}g <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>/ {effectiveTargets.dailyFatTarget}g</span>
                    <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>
                      {Math.max(0, effectiveTargets.dailyFatTarget - Math.round(intakeFat))}g to go
                    </span>
                  </span>
                </div>
                <div className="macro-track">
                  <div 
                    className="macro-fill" 
                    style={{ width: `${fatPercentage}%`, background: 'var(--color-fat)' }} 
                  />
                </div>
              </div>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '10px', lineHeight: 1.45, color: 'var(--text-muted)' }}>
              Protein is set from your bodyweight{goalPhase === 'cut' ? ', kept high while you are losing weight to protect muscle' : ''}.
              The rest of your calories are split between carbs and fat, leaning toward carbs on
              training days and fat on rest days.
            </p>
          </div>
          </div>

          {/* Active Calories Integration banner */}
          {selectedDateActiveCalories > 0 && (
            <div className="fuel-card col-12" style={{ padding: 14 }}>
              <div className="integration-card">
                <Activity className="integration-icon" size={18} />
                <div className="integration-text">
                  Ecosystem Sync: active workouts detected for this date from Aero/Kratos. 
                  Baseline energy target has been automatically increased by <strong>+{selectedDateActiveCalories} kcal</strong>.
                </div>
              </div>
            </div>
          )}

          {/* What Zenith has learned */}
          <div className="fuel-card col-5">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> What Zenith Has Learned About You
            </h3>
            <div className="zane-insights-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {zaneResult.isCalibrated ? (
                <>
                  {/* These were previously shown as raw regression coefficients -
                      "-6.6 kcal/%", "0.064", labelled "Coefficient" and "Learned".
                      Each is now stated as the effect it actually has, at a size a
                      person can picture. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Your metabolism runs</span>
                    <span style={{ fontWeight: 700, color: zaneResult.bmrOffset >= 0 ? '#55efc4' : '#ff7675', textAlign: 'right' }}>
                      {Math.abs(Math.round(zaneResult.bmrOffset))} kcal/day{' '}
                      {zaneResult.bmrOffset >= 0 ? 'faster' : 'slower'}
                      <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
                        than the textbook estimate
                      </span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Every 1,000 kg you lift</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-protein)' }}>
                      burns ~{Math.round(zaneResult.gymVolumeCoeff * 1000)} kcal
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Every 100 mg of caffeine</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-carb)' }}>
                      burns ~{Math.round(zaneResult.caffeineCoeff * 100)} kcal
                    </span>
                  </div>

                  {/* Stated as an observed association, not a causal claim: the
                      regression finds the pattern, it does not explain it. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      An hour {zaneResult.sleepDurationCoeff <= 0 ? 'less' : 'more'} sleep than your usual
                    </span>
                    <span style={{ fontWeight: 700, color: '#a855f7' }}>
                      goes with ~{Math.abs(Math.round(zaneResult.sleepDurationCoeff))} kcal more
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Sleep 10 points {zaneResult.sleepQualityCoeff <= 0 ? 'worse' : 'better'} than usual
                    </span>
                    <span style={{ fontWeight: 700, color: '#a855f7' }}>
                      goes with ~{Math.abs(Math.round(zaneResult.sleepQualityCoeff * 10))} kcal more
                    </span>
                  </div>

                  <p style={{ margin: '6px 0 0', fontSize: '11px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                    Measured from <strong>{zaneResult.calibrationDays} days</strong> of your own logs, so your
                    calorie target follows your body rather than a generic formula.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55 }}>
                    Zenith is still working out how your body responds. It needs about 14 fully-logged
                    days; you have <strong>{zaneResult.calibrationDays}</strong> so far.
                  </p>
                  <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                    Until then your targets come from a standard formula. Once it has enough days it
                    will show what it has learned about your metabolism, your training and your sleep.
                  </p>
                </>
              )}

              <label
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                  borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '2px',
                  fontSize: '11px', color: 'var(--text-muted)'
                }}
              >
                <input
                  type="checkbox"
                  checked={!selectedDateComplete}
                  onChange={handleToggleDayIncomplete}
                  style={{ cursor: 'pointer' }}
                />
                <span>
                  I didn&apos;t log everything today
                  <span style={{ display: 'block', fontSize: '10px' }}>
                    Leaves today out, so a half-logged day can&apos;t skew what Zenith learns.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* How well Zenith knows you */}
          <div className="fuel-card col-7">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> How Well Zenith Knows You
            </h3>
            {zaneHistory.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, minHeight: 180, textAlign: 'center' }}>
                Log a few days of meals and this will show Zenith learning your metabolism.
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 6px', fontSize: '11px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                  How far your metabolism sits from the textbook estimate, and how sure Zenith is.
                  The shaded band is its margin of error &mdash; it narrows as you log more days.
                </p>
                {/* Previously this plotted three coefficients together: the metabolic
                    offset in kcal alongside sleep-quality (~-7) and sleep-duration
                    (~-36) coefficients, which share no unit or scale. With the error
                    band forcing a +/-600 axis, all three rendered as flat lines on
                    zero, with no legend to tell them apart. Only the offset and its
                    band are plotted now - that is the series the band belongs to. */}
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={zaneHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid {...ZENITH_CHART_GRID} />
                      <XAxis dataKey="date" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                      <YAxis
                        stroke="var(--text-muted)"
                        tick={ZENITH_CHART_AXIS_TICK}
                        tickLine={false}
                        label={{ value: 'kcal/day', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 10 } }}
                      />
                      <Tooltip
                        contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                        labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                        formatter={(value: any) => {
                          if (Array.isArray(value)) {
                            return [`${value[0]} to ${value[1]} kcal/day`, 'Still could be anywhere in'];
                          }
                          const n = Number(value);
                          return [
                            `${Math.abs(n)} kcal/day ${n >= 0 ? 'faster' : 'slower'} than textbook`,
                            'Zenith\u2019s estimate'
                          ];
                        }}
                      />
                      <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                      <Area name="Margin of error" type="monotone" dataKey="offsetRange" stroke="none" fill="rgba(255, 159, 67, 0.10)" />
                      <Line name="Zenith&rsquo;s estimate" type="monotone" dataKey="offset" stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 14, height: 2, background: 'var(--color-primary)', display: 'inline-block' }} />
                    Zenith&rsquo;s estimate of your metabolism
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 14, height: 9, background: 'rgba(255, 159, 67, 0.25)', display: 'inline-block', borderRadius: 2 }} />
                    How unsure it still is
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 14, height: 0, borderTop: '2px dashed var(--text-muted)', display: 'inline-block' }} />
                    Textbook estimate
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Card 1: Daily burn */}
          <div className="fuel-card col-4 animate-fade-in">
            <h3 className="fuel-card-title">
              <Activity size={14} style={{ color: 'var(--color-primary)' }} /> Your Daily Burn
            </h3>
            <div className="zane-insights-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* One headline number. Three internal estimates of daily expenditure
                  shown side by side just asked the user to adjudicate between them,
                  so show the most trustworthy and put the rest behind a disclosure. */}
              <div style={{
                background: 'rgba(56,189,248,0.07)',
                border: '1px solid rgba(56,189,248,0.22)',
                borderRadius: '10px',
                padding: '14px'
              }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  You burn about
                </div>
                {/* Deliberately NOT toLocaleString(): on a Dutch or German locale it
                    renders 1903 as "1.903", which reads as one-point-nine. A plain
                    integer is unambiguous everywhere and matches the rest of the app. */}
                <div style={{ fontSize: '30px', fontWeight: 800, color: '#38bdf8', lineHeight: 1.05 }}>
                  {impliedActualTdee ?? displayedBurnToday}{' '}
                  <span style={{ fontSize: '15px', fontWeight: 700 }}>kcal a day</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.45 }}>
                  {impliedActualTdee !== null
                    ? 'Worked out from how your weight has actually changed, so this is the most reliable number we have for you.'
                    : 'Estimated from your body and activity. It gets more accurate once you have a few weigh-ins.'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Today specifically:</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>{displayedBurnToday} kcal</span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '-6px', lineHeight: 1.45 }}>
                {plannedBurn > 0
                  ? `Includes ${plannedBurn} kcal for training you have planned but not done yet.`
                  : burnParts.activeCalories + burnParts.gymCalories > 0
                    ? 'Higher than usual because of the training you logged today.'
                    : 'Lower than your average because no training is logged today, which is normal on a rest day.'}
              </div>

              {/* Planned work, shown separately from what has actually happened.
                  It is an estimate of something that has not occurred yet, so it is
                  labelled as such rather than folded silently into the total - and it
                  stops counting the moment the session is marked done, or the day
                  would be charged twice. */}
              {outstandingPlans.length > 0 && (
                <div style={{
                  background: 'rgba(56,189,248,0.06)',
                  border: '1px solid rgba(56,189,248,0.2)',
                  borderRadius: 10,
                  padding: '10px 12px'
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    Planned today &mdash; not done yet
                  </div>
                  {outstandingPlans.map(plan => (
                    <div key={plan.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {DISCIPLINE_LABELS[plan.discipline]} &middot; {plan.title || plan.type}
                        {plan.distanceKm ? ` (${plan.distanceKm} km)` : plan.durationMinutes ? ` (${plan.durationMinutes} min)` : ''}
                      </span>
                      <span className="zenith-tnum" style={{ fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                        ~{plannedEnergyKcal(plan, latestWeight, currentFtp.watts)} kcal
                      </span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                    Counted toward today&apos;s target so you can eat for the session before doing it.
                    {outstandingPlans.some(p => p.discipline === 'aero') && (
                      <> Rides are costed against{' '}
                        <strong style={{ color: '#cbd5e1' }}>{currentFtp.watts} W</strong>
                        {currentFtp.source === 'measured'
                          ? ', your best estimated threshold from the last 90 days of riding.'
                          : currentFtp.source === 'profile'
                            ? ', the threshold set on your profile — no recent rides to estimate from.'
                            : ', a default — set your FTP or log a ride to improve this.'}
                      </>
                    )}
                    {plannedCarbShift > 0 && <> Roughly <strong style={{ color: 'var(--color-carb)' }}>{plannedCarbShift}g</strong> of that should come from carbohydrate.</>}
                    {' '}It drops off automatically once the session is logged.
                  </div>
                </div>
              )}

              {hasBurnBreakdown && (
              <details style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Where today&apos;s number comes from
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Just being alive</span>
                    <span style={{ fontWeight: 700, color: '#fff' }}>{burnParts.bmr} kcal</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Everyday moving about</span>
                    <span style={{ fontWeight: 700, color: '#fff' }}>+{burnParts.neat} kcal</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Cardio &amp; running</span>
                    <span style={{ fontWeight: 700, color: '#fff' }}>+{burnParts.activeCalories} kcal</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Strength training</span>
                    <span style={{ fontWeight: 700, color: '#fff' }}>+{burnParts.gymCalories} kcal</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Caffeine</span>
                    <span style={{ fontWeight: 700, color: '#ff9f43' }}>+{burnParts.caffeineCalories} kcal</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Sleep</span>
                    <span style={{ fontWeight: 700, color: burnParts.sleepAdjustment < 0 ? '#ff7675' : '#55efc4' }}>
                      {burnParts.sleepAdjustment >= 0 ? '+' : ''}{burnParts.sleepAdjustment} kcal
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Learned from your own data</span>
                    <span style={{ fontWeight: 700, color: burnParts.metabolicOffset < 0 ? '#ff7675' : '#55efc4' }}>
                      {burnParts.metabolicOffset >= 0 ? '+' : ''}{burnParts.metabolicOffset} kcal
                    </span>
                  </div>
                  {burnParts.weekendAdjustment !== 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Weekend pattern</span>
                      <span style={{ fontWeight: 700, color: burnParts.weekendAdjustment < 0 ? '#ff7675' : '#55efc4' }}>
                        {burnParts.weekendAdjustment >= 0 ? '+' : ''}{burnParts.weekendAdjustment} kcal
                      </span>
                    </div>
                  )}
                  {burnParts.adaptationPenalty !== 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Long diet slowdown</span>
                      <span style={{ fontWeight: 700, color: '#ff7675' }}>{burnParts.adaptationPenalty} kcal</span>
                    </div>
                  )}
                  {burnIsBlended && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        What the learning model adds
                        <span style={{ display: 'block', fontSize: '10px' }}>
                          it reads today as {fusionPredict.tdeeKcal} kcal; we take the middle
                        </span>
                      </span>
                      <span style={{ fontWeight: 700, color: blendedBurnToday - goalDerivedFromTdee < 0 ? '#ff7675' : '#55efc4' }}>
                        {blendedBurnToday - goalDerivedFromTdee >= 0 ? '+' : ''}
                        {blendedBurnToday - goalDerivedFromTdee} kcal
                      </span>
                    </div>
                  )}
                  {plannedBurn > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Training planned, not done yet
                        <span style={{ display: 'block', fontSize: '10px' }}>
                          drops off as soon as the session is logged
                        </span>
                      </span>
                      <span style={{ fontWeight: 700, color: '#38bdf8' }}>+{plannedBurn} kcal</span>
                    </div>
                  )}
                  {/* The rows above have to add up to this. They did not: the planned
                      figure was announced in the sentence at the top of the card and
                      then appeared in none of the lines beneath it, nor in the total. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', fontWeight: 800 }}>
                    <span style={{ color: 'var(--color-primary)' }}>Today&apos;s total</span>
                    <span style={{ color: 'var(--color-primary)' }}>{displayedBurnToday} kcal</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Digesting food burns energy too, but that is already built into your calorie
                    targets, so it is not counted twice here.
                  </p>
                  {fusionLooksUnfitted && (
                    <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      Zenith&apos;s learning model isn&apos;t trained on enough of your data yet, so
                      today&apos;s figure comes from the formula alone. Once it has learned from your
                      history it gets folded in too.
                    </p>
                  )}
                </div>
              </details>
              )}

              <div style={{ paddingTop: '4px' }}>
                <button
                  type="button"
                  onClick={handleRetrainFusion}
                  disabled={retrainState.running}
                  style={{
                    width: '100%',
                    background: retrainState.running ? 'rgba(56,189,248,0.10)' : 'rgba(56,189,248,0.16)',
                    border: '1px solid rgba(56,189,248,0.35)',
                    color: '#38bdf8',
                    padding: '8px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: retrainState.running ? 'default' : 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  {retrainState.running ? 'Learning\u2026' : 'Learn from my history'}
                </button>
                <p style={{ margin: '6px 0 0', fontSize: '10px', lineHeight: 1.45, color: 'var(--text-muted)' }}>
                  Goes back over every day you logged fully and compares it with what your weight
                  actually did, so these numbers fit you.
                </p>
                {retrainState.message && (
                  <p
                    role="status"
                    style={{
                      margin: '6px 0 0',
                      fontSize: '10px',
                      lineHeight: 1.45,
                      color: retrainState.error ? '#f87171' : '#4ade80'
                    }}
                  >
                    {retrainState.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Weight forecast */}
          <div className="fuel-card col-4 animate-fade-in">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> Weight Forecast
            </h3>
            <div className="zane-insights-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* Now -> then, as one sentence in numbers. Previously this card showed
                  two current weights and two forecasts and left the reader to work
                  out which pair to believe. */}
              <div style={{
                background: 'rgba(56,189,248,0.07)',
                border: '1px solid rgba(56,189,248,0.22)',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Now</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{latestWeight} kg</div>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '18px' }}>&rarr;</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>In 4 weeks</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8', lineHeight: 1.1 }}>
                    {headlineProjectedWeight.toFixed(1)} kg
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '12px', lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {measuredWeeklyRate !== null ? (
                  Math.abs(measuredWeeklyRate) < 0.1 ? (
                    <>Your weight is holding steady at the moment.</>
                  ) : (
                    <>
                      You are {measuredWeeklyRate < 0 ? 'losing' : 'gaining'}{' '}
                      <strong style={{ color: '#38bdf8' }}>{Math.abs(measuredWeeklyRate).toFixed(2)} kg a week</strong>{' '}
                      based on your actual weigh-ins.
                    </>
                  )
                ) : (
                  <>Keep weighing in for a couple of weeks and we can forecast from your real trend
                  instead of from your food log.</>
                )}
              </div>

              {lossRateIsAggressive && (
                <div style={{
                  background: 'rgba(232,191,107,0.08)',
                  border: '1px solid rgba(232,191,107,0.25)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '11px',
                  lineHeight: 1.5,
                  color: '#e8bf6b'
                }}>
                  That is quite fast for your size. Losing more than about 1% of your bodyweight a
                  week tends to cost muscle as well as fat, so consider eating a little more.
                </div>
              )}

              <details style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)' }}>
                  The detail behind this
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Smoothed weight</span>
                    <span style={{ fontWeight: 700, color: '#fff' }}>{startingWeightForProjection} kg</span>
                  </div>
                  <p style={{ margin: '-2px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Weight swings day to day with water and food, so the forecast uses a smoothed
                    version rather than a single morning&apos;s reading.
                  </p>

                  {hasMeasuredBurn && longRunNetBalance !== null ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>You eat, on average</span>
                        <span style={{ fontWeight: 700, color: '#fff' }}>{longRunNetBalance.avgIntake} kcal a day</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>You burn, on average</span>
                        <span style={{ fontWeight: 700, color: '#fff' }}>{impliedActualTdee} kcal a day</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Difference</span>
                        <span style={{ fontWeight: 700, color: (longRunNetBalance.avgIntake - impliedActualTdee!) <= 0 ? '#55efc4' : '#ff7675' }}>
                          {longRunNetBalance.avgIntake - impliedActualTdee! > 0 ? '+' : ''}
                          {longRunNetBalance.avgIntake - impliedActualTdee!} kcal a day
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                        Your burn is worked back from what your weight actually did over the last
                        four weeks, rather than estimated, so this is the figure to trust.
                        Real loss usually slows as you get lighter, so treat the forecast as a
                        direction rather than a promise.
                      </p>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Eating vs burning</span>
                        <span style={{ fontWeight: 700, color: netDailyBalance <= 0 ? '#55efc4' : '#ff7675' }}>
                          {netDailyBalance > 0 ? `+${netDailyBalance}` : netDailyBalance} kcal a day
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                        {balanceSampleDays > 0 && balanceSampleDays < 4
                          ? `Based on ${balanceSampleDays} day${balanceSampleDays === 1 ? '' : 's'} logged this week, so it will move as more come in. `
                          : ''}
                        Once you have a few weeks of weigh-ins we can work your burn back from what
                        your weight actually does, which is more accurate than estimating it.
                      </p>
                    </>
                  )}
                </div>
              </details>
            </div>
          </div>

          {/* Card 3: Weekly Trends & Consistency */}
          <div className="fuel-card col-4 animate-fade-in">
            <h3 className="fuel-card-title">
              <Check size={14} style={{ color: 'var(--color-primary)' }} /> Weekly Trends & Consistency
            </h3>
            <div className="zane-insights-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Average Intake:</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>{weeklyStats.averageIntakeCal} kcal/day</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Average Target:</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>{weeklyStats.averageTargetCal} kcal/day</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Consistency Score:</span>
                <span style={{ fontWeight: 900, color: weeklyStats.consistencyScore >= 85 ? '#55efc4' : weeklyStats.consistencyScore >= 65 ? '#ff9f43' : '#ff7675' }}>
                  {weeklyStats.consistencyScore}%
                </span>
              </div>
              <div style={{ marginTop: '4px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Macro Target Achieved:</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', width: '24px', color: 'var(--color-carb)', fontWeight: 800 }}>CAR:</span>
                    <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, weeklyStats.carbsPercent)}%`, height: '100%', background: 'var(--color-carb)' }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: weeklyStats.carbsPercent > 100 ? '#ff9f43' : '#fff' }}>{weeklyStats.carbsPercent}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', width: '24px', color: 'var(--color-protein)', fontWeight: 800 }}>PRO:</span>
                    <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, weeklyStats.proteinPercent)}%`, height: '100%', background: 'var(--color-protein)' }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: weeklyStats.proteinPercent > 100 ? '#ff9f43' : '#fff' }}>{weeklyStats.proteinPercent}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', width: '24px', color: 'var(--color-fat)', fontWeight: 800 }}>FAT:</span>
                    <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, weeklyStats.fatPercent)}%`, height: '100%', background: 'var(--color-fat)' }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: weeklyStats.fatPercent > 100 ? '#ff9f43' : '#fff' }}>{weeklyStats.fatPercent}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOGBOOK VIEW */}
      {activeTab === 'logbook' && (
        <div className="fuel-grid animate-fade-in">
          <WeekDateSelector
            weekDays={weekDays}
            selectedDateStr={selectedDateStr}
            onSelect={setSelectedDateStr}
            formattedWeekRange={formattedWeekRange}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            showIncompleteFlag
            todayDateStr={todayDateStr}
          />

          {/* Timeline of Logs for Selected Date */}
          <div className="fuel-card col-12">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 className="fuel-card-title" style={{ margin: 0, textTransform: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} style={{ color: 'var(--color-primary)' }} /> {selectedDateLongName}
                </h3>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                  Selected date intake: <strong>{intakeCalories} kcal</strong>
                  {!selectedDateComplete && (
                    <span style={{ color: '#ff9f43', marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={13} /> Zenith Excluded (Incomplete)
                    </span>
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer', color: !selectedDateComplete ? '#ff9f43' : 'var(--text-muted)', fontWeight: 700, margin: 0, userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={!selectedDateComplete}
                    onChange={handleToggleDayIncomplete}
                    style={{ width: 15, height: 15, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                  />
                  Mark as Incomplete
                </label>
                {filteredFoodLogs.length > 0 && (
                  <button 
                    className="btn-barcode-lookup" 
                    style={{ padding: '6px 12px', fontSize: 11, margin: 0 }}
                    onClick={() => {
                      setCopyTargetDate(formatDateString(addDays(new Date(selectedDateStr), 1)));
                      setShowCopyDayModal(true);
                    }}
                  >
                    Copy Day
                  </button>
                )}
                <button className="btn-submit" style={{ padding: '6px 12px', fontSize: 11, margin: 0 }} onClick={() => { setEditingLogEntry(null); resetLogForm(); setLogSource('quick'); setShowLogModal(true); }}>
                  <Plus size={12} /> Log Meal
                </button>
              </div>
            </div>

            {filteredFoodLogs.length === 0 ? (
              <ZenithEmptyState
                icon={<BookOpen size={20} />}
                title="No meals logged for this date"
                message="Log a meal to start tracking today's calories and macros."
                action={
                  <button className="btn-submit" style={{ padding: '8px 16px', fontSize: 11 }} onClick={() => { setEditingLogEntry(null); resetLogForm(); setLogSource('quick'); setShowLogModal(true); }}>
                    <Plus size={12} /> Log Meal
                  </button>
                }
              />
            ) : (
              <div className="timeline">
                {filteredFoodLogs.map(log => {
                  const timeStr = new Date(log.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={log.id} className="timeline-item">
                      <div className="timeline-time">{timeStr}</div>
                      <div className="timeline-content">
                        <div className="timeline-title">{log.custom_name}</div>
                        <div className="timeline-desc" style={{ textTransform: 'capitalize' }}>
                          {log.meal_type} {log.quantity !== 1 && `(${log.quantity}x)`}
                        </div>
                        <div className="timeline-macros">
                          <span className="timeline-macro">Kcal: <span>{log.calories}</span></span>
                          <span className="timeline-macro">Carbs: <span>{log.carbs}g</span></span>
                          <span className="timeline-macro">Prot: <span>{log.protein}g</span></span>
                          <span className="timeline-macro">Fat: <span>{log.fat}g</span></span>
                        </div>
                      </div>
                      <div className="timeline-actions" style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-barcode-lookup" style={{ padding: '6px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => handleEditLogClick(log)}>
                          <Edit size={13} />
                        </button>
                        <button className="btn-delete" style={{ padding: '6px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => handleDeleteLog(log.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INGREDIENTS VIEW (SEPARATE TAB) */}
      {activeTab === 'ingredients' && (
        <div className="fuel-grid animate-fade-in">
          <div className="fuel-card col-12">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 className="fuel-card-title" style={{ margin: 0 }}>
                  <Barcode size={14} style={{ color: 'var(--color-primary)' }} /> Ingredients Database
                </h3>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                  Manage your custom foods and portion sizes
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search database..." 
                  value={ingDatabaseSearch} 
                  onChange={e => setIngDatabaseSearch(e.target.value)}
                  style={{ width: 220, height: 36, padding: '8px 12px', fontSize: 12 }}
                />
                <button className="btn-submit" style={{ padding: '8px 16px', fontSize: 11, margin: 0 }} onClick={() => { resetIngredientForm(); setShowIngredientModal(true); }}>
                  <Plus size={12} /> New Ingredient
                </button>
              </div>
            </div>

            {ingredients.length === 0 ? (
              <ZenithEmptyState
                icon={<Barcode size={20} />}
                title="No ingredients yet"
                message="Create ingredients to build your database, or scan a barcode to import one automatically."
                action={
                  <button className="btn-submit" style={{ padding: '8px 16px', fontSize: 11 }} onClick={() => { resetIngredientForm(); setShowIngredientModal(true); }}>
                    <Plus size={12} /> New Ingredient
                  </button>
                }
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {ingredients
                  .filter(ing => ing.name.toLowerCase().includes(ingDatabaseSearch.toLowerCase()))
                  .map(ing => (
                    <div key={ing.id} className="recipe-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <strong style={{ fontSize: 13, color: 'var(--text-main)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ing.name}>
                          {ing.name}
                        </strong>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 10 }}>
                          {ing.barcode ? (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              EAN: {ing.barcode}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>No barcode</span>
                          )}
                          {ing.portion_name && (
                            <span className="zenith-pill zenith-pill--info" style={{ whiteSpace: 'nowrap' }}>
                              {`1 ${ing.portion_name === 'Portie' ? 'Portion' : ing.portion_name} (${ing.portion_weight_grams}g)`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="recipe-macros" style={{ margin: '4px 0', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: 8 }}>
                        <div>
                          <div className="recipe-macro-val" style={{ fontSize: 13, fontWeight: 700 }}>{Math.round(ing.calories_per_100g)}</div>
                          <div className="recipe-macro-lbl" style={{ fontSize: 8, color: 'var(--text-muted)' }}>kcal</div>
                        </div>
                        <div>
                          <div className="recipe-macro-val" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-carb)' }}>{Math.round(ing.carbs_per_100g * 10) / 10}g</div>
                          <div className="recipe-macro-lbl" style={{ fontSize: 8, color: 'var(--text-muted)' }}>carbs</div>
                        </div>
                        <div>
                          <div className="recipe-macro-val" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-protein)' }}>{Math.round(ing.protein_per_100g * 10) / 10}g</div>
                          <div className="recipe-macro-lbl" style={{ fontSize: 8, color: 'var(--text-muted)' }}>prot</div>
                        </div>
                        <div>
                          <div className="recipe-macro-val" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-fat)' }}>{Math.round(ing.fat_per_100g * 10) / 10}g</div>
                          <div className="recipe-macro-lbl" style={{ fontSize: 8, color: 'var(--text-muted)' }}>fat</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                        <button 
                          className="recipe-btn-log" 
                          style={{ margin: 0, flex: 3 }}
                          onClick={() => {
                            setEditingLogEntry(null);
                            setSelectedLogIngredient(ing.id);
                            setLogIngredientSearch(ing.name);
                            setLogSource('ingredient');
                            setLogMealType('snack');
                            setShowLogModal(true);
                          }}
                        >
                          Log Item
                        </button>
                        <button 
                          className="btn-barcode-lookup" 
                          style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={() => handleEditIngredient(ing)}
                        >
                          <Edit size={13} style={{ color: 'var(--text-muted)' }} />
                        </button>
                        <button 
                          className="btn-delete" 
                          style={{ width: 34, height: 34, padding: 0 }}
                          onClick={() => handleDeleteIngredient(ing.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RECIPES VIEW */}
      {activeTab === 'recipes' && (
        <div style={{ zIndex: 1, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 className="fuel-card-title" style={{ margin: 0 }}>
              <ChefHat size={14} style={{ color: 'var(--color-primary)' }} /> My Sport Recipes
            </h3>
            <button className="btn-submit" style={{ padding: '8px 16px', fontSize: 11 }} onClick={() => { resetRecipeForm(); setShowRecipeModal(true); }}>
              <Plus size={14} /> New Recipe
            </button>
          </div>

          {recipes.length === 0 ? (
            <ZenithEmptyState
              icon={<ChefHat size={20} />}
              title="You have not created any recipes yet"
              message="Save your go-to meals as recipes for one-tap logging."
              action={
                <button className="btn-submit" style={{ padding: '8px 16px', fontSize: 11 }} onClick={() => { resetRecipeForm(); setShowRecipeModal(true); }}>
                  <Plus size={12} /> New Recipe
                </button>
              }
            />
          ) : (
            <div className="recipes-grid">
              {recipes.map(rec => (
                <div key={rec.id} className="recipe-card">
                  <span className="recipe-badge">{rec.category}</span>
                  <h4 className="recipe-title">{rec.name}</h4>
                  <p className="recipe-desc">{rec.description || 'No description'}</p>
                  
                  {/* Per portion, not per batch. These four numbers used to be the
                      whole recipe's totals with no label saying so, which reads as a
                      serving and is what made a four-portion bake look like a
                      2,400 kcal meal. */}
                  {(() => {
                    const per = perPortion(rec);
                    return (
                      <>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                          Per portion{rec.serving_size ? ` · ${rec.serving_size}` : ''}
                        </div>
                        <div className="recipe-macros" style={{ marginBottom: 6 }}>
                          <div>
                            <div className="recipe-macro-val">{Math.round(per.calories)}</div>
                            <div className="recipe-macro-lbl">kcal</div>
                          </div>
                          <div>
                            <div className="recipe-macro-val">{Math.round(per.carbs)}g</div>
                            <div className="recipe-macro-lbl">carbs</div>
                          </div>
                          <div>
                            <div className="recipe-macro-val">{Math.round(per.protein)}g</div>
                            <div className="recipe-macro-lbl">prot</div>
                          </div>
                          <div>
                            <div className="recipe-macro-val">{Math.round(per.fat)}g</div>
                            <div className="recipe-macro-lbl">fat</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
                          Makes {formatPortions(per.makes)} portion{per.makes === 1 ? '' : 's'}
                          {per.makes !== 1 ? ` · ${Math.round(rec.calories)} kcal for the batch` : ''}
                        </div>
                      </>
                    );
                  })()}

                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <button 
                      className="recipe-btn-log"
                      style={{ margin: 0, flex: 3 }}
                      onClick={() => {
                        setEditingLogEntry(null);
                        setSelectedLogRecipe(rec.id);
                        setLogRecipeSearch(rec.name);
                        setLogSource('recipe');
                        setLogMealType('snack');
                        setShowLogModal(true);
                      }}
                    >
                      Log Recipe
                    </button>
                    <button 
                      className="btn-barcode-lookup" 
                      style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => handleEditRecipe(rec)}
                    >
                      <Edit size={13} style={{ color: 'var(--text-muted)' }} />
                    </button>
                    <button 
                      className="btn-delete" 
                      style={{ width: 34, height: 34, padding: 0 }}
                      onClick={() => handleDeleteRecipe(rec.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUPPLEMENTEN VIEW */}
      {activeTab === 'supplements' && (
        <div className="fuel-grid animate-fade-in">
          <WeekDateSelector
            weekDays={weekDays}
            selectedDateStr={selectedDateStr}
            onSelect={setSelectedDateStr}
            formattedWeekRange={formattedWeekRange}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            todayDateStr={todayDateStr}
            renderDayNote={day => {
              const daySupps = supplementsLogs.filter(sup => toYYYYMMDD(sup.logged_at) === day.dateStr);
              const dayCreatine = daySupps.filter(sup => sup.supplement_type === 'creatine').reduce((sum, sup) => sum + Number(sup.amount), 0);
              const dayCaffeine = daySupps.filter(sup => sup.supplement_type === 'caffeine').reduce((sum, sup) => sum + Number(sup.amount), 0);
              if (dayCreatine <= 0 && dayCaffeine <= 0) return '—';
              return (
                <span style={{ color: 'var(--color-primary)', fontWeight: 800 }}>
                  {dayCreatine > 0 ? `${dayCreatine}g` : ''}
                  {dayCreatine > 0 && dayCaffeine > 0 ? ' | ' : ''}
                  {dayCaffeine > 0 ? `${dayCaffeine}mg` : ''}
                </span>
              );
            }}
          />

          {/* QUICK LOG SUPPLEMENTS */}
          <div className="fuel-card col-4">
            <h3 className="fuel-card-title">
              <Pill size={14} style={{ color: 'var(--color-primary)' }} /> Quick Log ({new Date(selectedDateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })})
            </h3>
            <form onSubmit={handleAddSupplementLog}>
              <div className="form-group">
                <label className="form-label">Supplement Type</label>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {[
                    { id: 'creatine', label: 'Creatine Monohydrate' },
                    { id: 'caffeine', label: 'Caffeine' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="fuel-tab-btn"
                      style={{
                        flex: 1,
                        background: logSuppType === t.id ? 'var(--color-primary-dim)' : 'transparent',
                        border: `1px solid ${logSuppType === t.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                        color: logSuppType === t.id ? 'var(--color-primary)' : 'var(--text-muted)'
                      }}
                      onClick={() => {
                        setLogSuppType(t.id as any);
                        setLogSuppAmount(t.id === 'creatine' ? '5' : '80');
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Amount ({logSuppType === 'creatine' ? 'gram' : 'mg'})
                </label>
                <input
                  type="number"
                  step="any"
                  className="form-input"
                  value={logSuppAmount}
                  onChange={e => setLogSuppAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={logSuppHour}
                  onChange={e => setLogSuppHour(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-submit" style={{ width: '100%', marginTop: 8 }}>
                Log Intake
              </button>
            </form>
          </div>

          {/* CREATINE SATURATION CARD */}
          <div className="fuel-card col-4">
            <h3 className="fuel-card-title">
              <Activity size={14} style={{ color: 'var(--color-primary)' }} /> Creatine Saturation
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
              <div style={{ position: 'relative', width: 100, height: 100, marginBottom: 16 }}>
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.03)" strokeWidth="8" fill="transparent" />
                  <circle 
                    cx="50" 
                    cy="50" 
                    r="42" 
                    stroke="var(--color-primary)" 
                    strokeWidth="8" 
                    fill="transparent" 
                    strokeDasharray="264"
                    strokeDashoffset={264 - (264 * creatineStats.latestSaturation) / 100}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{creatineStats.latestSaturation}%</div>
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>of full</div>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                  {creatineStats.latestSaturation >= 95 ? 'Topped up'
                    : creatineStats.latestSaturation >= 85 ? 'Nearly there'
                    : creatineStats.latestSaturation > Math.round(CREATINE_BASELINE_SATURATION * 100) + 2 ? 'Still filling'
                    : 'At your normal dietary level'}
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: '14px', margin: '6px 0 0 0' }}>
                  Everyone starts around {Math.round(CREATINE_BASELINE_SATURATION * 100)}% from food alone. Supplementing fills the rest.
                </p>

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Extra water your muscles are holding:</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--color-carb)', margin: '4px 0' }}>
                    +{creatineStats.latestWaterWeight.toFixed(2)} kg
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: '14px', margin: '4px 0 0 0' }}>
                    Subtracted from your scale weight before the fat-loss trend is worked out, so filling up doesn&apos;t read as gaining fat.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CAFFEINE METABOLIC BOOST CARD */}
          <div className="fuel-card col-4">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> Metabolic Impact – Caffeine
            </h3>
            <div style={{ padding: '10px 0' }}>
              <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '10px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ingested today:</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: '4px 0' }}>
                  {caffeineStats.activeDateCaffeine} mg
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '10px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Extra energy expenditure:</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-primary)', margin: '4px 0' }}>
                  +{caffeineStats.metabolicBoost} kcal
                </div>
              </div>

              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: '15px' }}>
                Worked out at about <strong style={{ color: '#cbd5e1' }}>
                  {Math.round((zaneResult.caffeineCoeff || CAFFEINE_KCAL_PER_MG_PRIOR) * 100)} kcal per 100 mg
                </strong>{' '}
                &mdash; roughly a cup of coffee.
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer' }}>Why so small?</summary>
                  <div style={{ marginTop: 6, lineHeight: '15px' }}>
                    Caffeine does raise how much you burn, but only by a few percent for a
                    couple of hours, and less once you are used to it. It is a real effect
                    and a minor one.
                    <br /><br />
                    Zenith learns the size of it from your own data, within limits. The
                    limits are there because you tend to take caffeine on days you train,
                    and without them the maths credits caffeine for calories your training
                    burned &mdash; which would quietly raise the amount you are told you
                    can eat.
                  </div>
                </details>
              </div>
            </div>
          </div>

          {/* CREATINE CHART */}
          <div className="fuel-card col-6">
            <h3 className="fuel-card-title">
              <Activity size={14} style={{ color: 'var(--color-primary)' }} /> Creatine Loading & Saturation (30 Days)
            </h3>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={creatineStats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid {...ZENITH_CHART_GRID} />
                  <XAxis dataKey="dateStr" tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.1)" />
                  <YAxis yAxisId="left" tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.1)" label={{ value: 'Intake (g)', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 9 }} />
                  <YAxis yAxisId="right" orientation="right" tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.1)" label={{ value: 'Saturation (%)', angle: 90, position: 'insideRight', fill: 'var(--text-muted)', fontSize: 9 }} />
                  <Tooltip
                    contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                    labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={{ fontSize: 11 }}
                  />
                  <Area yAxisId="right" type="monotone" dataKey="saturation" fill="rgba(255, 159, 67, 0.15)" stroke="var(--color-primary)" strokeWidth={2} name="Saturation (%)" />
                  <Line yAxisId="left" type="monotone" dataKey="intake" stroke="var(--color-carb)" strokeWidth={1.5} dot={{ r: 2 }} name="Intake (g)" />
                  <Legend wrapperStyle={{ fontSize: 10, color: 'var(--text-muted)' }} />
                  <ReferenceLine yAxisId="right" y={Math.round(CREATINE_BASELINE_SATURATION * 100)}
                    stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3"
                    label={{ value: 'diet alone', position: 'insideBottomRight', fill: 'var(--text-muted)', fontSize: 9 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CAFFEINE CHART */}
          <div className="fuel-card col-6">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> Does caffeine move your resting heart rate?
            </h3>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
              {caffeineStats.correlation === null
                ? `Not enough nights measured yet to say — ${caffeineStats.pairedDays} day${caffeineStats.pairedDays === 1 ? '' : 's'} so far with both a caffeine total and a recorded resting heart rate. Gaps in the red line are nights with no measurement.`
                : !isCorrelationMeaningful(caffeineStats.correlation, caffeineStats.pairedDays)
                  ? `Nothing you could call a link yet — ${caffeineStats.pairedDays} nights measured, and what movement there is could easily be chance. Gaps in the red line are nights with no measurement.`
                  : caffeineStats.correlation > 0
                    ? `Across ${caffeineStats.pairedDays} measured nights your resting heart rate does run higher after bigger caffeine days. Worth watching — it still isn't proof caffeine caused it, since plenty else moves together with how much coffee you drink.`
                    : `Across ${caffeineStats.pairedDays} measured nights your resting heart rate runs lower after bigger caffeine days. Caffeine almost certainly isn't doing that — something else is moving alongside your coffee.`}
            </p>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={caffeineStats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid {...ZENITH_CHART_GRID} />
                  <XAxis dataKey="dateStr" tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.1)" />
                  <YAxis yAxisId="left" tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.1)" label={{ value: 'Caffeine (mg)', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 9 }} />
                  {/* Auto-scaled, not pinned to 50-75. The fixed range was chosen to
                      frame a formula that always produced 58-65; real resting heart
                      rate sits lower and moves less, and a fixed window either
                      flattens it or crops it. */}
                  <YAxis yAxisId="right" orientation="right" domain={['dataMin - 3', 'dataMax + 3']} allowDecimals={false} tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.1)" label={{ value: 'Resting HR (bpm)', angle: 90, position: 'insideRight', fill: 'var(--text-muted)', fontSize: 9 }} />
                  <Tooltip
                    contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                    labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={{ fontSize: 11 }}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="caffeine" fill="rgba(84, 160, 255, 0.1)" stroke="var(--color-carb)" strokeWidth={1} name="Caffeine (mg)" />
                  {/* connectNulls={false}: days with no measurement stay as gaps.
                      Bridging them would draw a confident line through nights that
                      were never recorded. */}
                  <Line yAxisId="right" type="monotone" dataKey="heartRate" stroke="rgba(255, 107, 107, 1)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} name="Resting HR (measured)" />
                  <Legend wrapperStyle={{ fontSize: 10, color: 'var(--text-muted)' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SUPPLEMENTS LOG HISTORY */}
          <div className="fuel-card col-12">
            <h3 className="fuel-card-title">
              <Pill size={14} style={{ color: 'var(--color-primary)' }} /> Logged Supplements on {new Date(selectedDateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })}
            </h3>
            {supplementsLogs.filter(s => toYYYYMMDD(s.logged_at) === selectedDateStr).length === 0 ? (
              <ZenithEmptyState
                icon={<Pill size={20} />}
                title="No supplements logged for this date"
                message="Use Quick Log to record creatine or caffeine intake."
              />
            ) : (
              <div className="timeline">
                {supplementsLogs.filter(s => toYYYYMMDD(s.logged_at) === selectedDateStr).map(s => {
                  const timeStr = new Date(s.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={s.id} className="timeline-item">
                      <div className="timeline-time">{timeStr}</div>
                      <div className="timeline-content">
                        <div className="timeline-title" style={{ textTransform: 'capitalize' }}>
                          {s.supplement_type === 'creatine' ? 'Creatine Monohydrate' : 'Caffeine'}
                        </div>
                        <div className="timeline-desc">
                          Amount: <strong>{s.amount} {s.supplement_type === 'creatine' ? 'g' : 'mg'}</strong>
                        </div>
                      </div>
                      <div className="timeline-actions">
                        <button className="btn-delete" onClick={() => handleDeleteSupplementLog(s.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: ADD FOOD LOG */}
      {showLogModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-slide-up">
            <div className="modal-header">
              <h3 className="modal-title">
                <Clock size={16} /> {editingLogEntry ? 'Edit Food Log' : 'Log Food Log'}
              </h3>
              <button className="modal-close" onClick={() => setShowLogModal(false)}>Close</button>
            </div>
            <form onSubmit={handleAddFoodLog}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Meal Type</label>
                  <select 
                    className="form-select" 
                    value={logMealType} 
                    onChange={e => setLogMealType(e.target.value)}
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                    <option value="pre-ride">Pre-Ride Carb loading</option>
                    <option value="on-the-bike">Intra-Workout Fuel</option>
                    <option value="post-ride">Post-Ride Recovery</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Consumption Time</label>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={logHour} 
                    onChange={e => setLogHour(e.target.value)} 
                    required 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Log Source</label>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    {[
                      { id: 'quick', label: 'Quick Entry' },
                      { id: 'ingredient', label: 'Ingredient' },
                      { id: 'recipe', label: 'Recipe' }
                    ].map(src => (
                      <button
                        key={src.id}
                        type="button"
                        className="fuel-tab-btn"
                        style={{ 
                          flex: 1, 
                          background: logSource === src.id ? 'var(--color-primary-dim)' : 'transparent',
                          border: `1px solid ${logSource === src.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                          color: logSource === src.id ? 'var(--color-primary)' : 'var(--text-muted)'
                        }}
                        onClick={() => {
                          setLogSource(src.id as any);
                          setSelectedLogIngredient('');
                          setLogIngredientSearch('');
                          setSelectedLogRecipe('');
                          setLogRecipeSearch('');
                        }}
                      >
                        {src.label}
                      </button>
                    ))}
                  </div>
                </div>

                {logSource === 'quick' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Meal / Product Name</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. Energy bar, Banana" 
                        value={quickName}
                        onChange={e => setQuickName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Servings / Multiplier</label>
                        <input 
                          type="number" 
                          step="any" 
                          min="0"
                          className="form-input" 
                          placeholder="1.0" 
                          value={logQuantity}
                          onChange={e => handleQuantityChange(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Weight (grams)</label>
                        <input 
                          type="number" 
                          step="any" 
                          min="0"
                          className="form-input" 
                          placeholder="100" 
                          value={logGrams}
                          onChange={e => handleGramsChange(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    {baseMacros && (
                      <p className="form-note" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '-12px', marginBottom: '14px', paddingLeft: '4px' }}>
                        Changing servings or grams scales calories and macronutrients automatically.
                      </p>
                    )}
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Calories (kcal)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          placeholder="0" 
                          value={quickCalories}
                          onChange={e => setQuickCalories(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Carbs (g)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          placeholder="0" 
                          value={quickCarbs}
                          onChange={e => setQuickCarbs(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Protein (g)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          placeholder="0" 
                          value={quickProtein}
                          onChange={e => setQuickProtein(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Fats (g)</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          placeholder="0" 
                          value={quickFat}
                          onChange={e => setQuickFat(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {logSource === 'ingredient' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Search Ingredient</label>
                      <div className="search-dropdown-wrap">
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Type ingredient name to search..." 
                          value={logIngredientSearch} 
                          onChange={e => {
                            setLogIngredientSearch(e.target.value);
                            setShowLogIngDropdown(true);
                          }}
                          onFocus={() => setShowLogIngDropdown(true)}
                          onBlur={() => setTimeout(() => setShowLogIngDropdown(false), 220)}
                          required
                        />
                        {showLogIngDropdown && (
                          <div className="search-dropdown-list">
                            {ingredients.filter(i => i.name.toLowerCase().includes(logIngredientSearch.toLowerCase())).length === 0 ? (
                              <div className="search-dropdown-item disabled">No ingredients found</div>
                            ) : (
                              ingredients.filter(i => i.name.toLowerCase().includes(logIngredientSearch.toLowerCase())).map(i => (
                                <div 
                                  key={i.id} 
                                  className="search-dropdown-item" 
                                  onClick={() => {
                                    setSelectedLogIngredient(i.id);
                                    setLogIngredientSearch(i.name);
                                    setShowLogIngDropdown(false);
                                  }}
                                >
                                  {i.name} {i.portion_name && `(per ${i.portion_name}: ${i.portion_weight_grams}g)`}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedLogIngredient && (
                      <div className="form-row" style={{ alignItems: 'flex-end', marginTop: 8 }}>
                        <div className="form-group">
                          <label className="form-label">Input Method</label>
                          <select 
                            className="form-select"
                            value={logIngredientWeightMode}
                            onChange={e => setLogIngredientWeightMode(e.target.value as any)}
                          >
                            <option value="grams">Gramss</option>
                            {ingredients.find(i => i.id === selectedLogIngredient)?.portion_name && (
                              <option value="portions">
                                Portions ({ingredients.find(i => i.id === selectedLogIngredient)?.portion_name})
                              </option>
                            )}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Amount</label>
                          <input 
                            type="number" 
                            step="any"
                            className="form-input"
                            value={logIngredientWeightValue}
                            onChange={e => setLogIngredientWeightValue(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {logSource === 'recipe' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Search Recipe</label>
                      <div className="search-dropdown-wrap">
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Type recipe name to search..." 
                          value={logRecipeSearch} 
                          onChange={e => {
                            setLogRecipeSearch(e.target.value);
                            setShowLogRecDropdown(true);
                          }}
                          onFocus={() => setShowLogRecDropdown(true)}
                          onBlur={() => setTimeout(() => setShowLogRecDropdown(false), 220)}
                          required
                        />
                        {showLogRecDropdown && (
                          <div className="search-dropdown-list">
                            {recipes.filter(r => r.name.toLowerCase().includes(logRecipeSearch.toLowerCase())).length === 0 ? (
                              <div className="search-dropdown-item disabled">No recipes found</div>
                            ) : (
                              recipes.filter(r => r.name.toLowerCase().includes(logRecipeSearch.toLowerCase())).map(r => (
                                <div 
                                  key={r.id} 
                                  className="search-dropdown-item" 
                                  onClick={() => {
                                    setSelectedLogRecipe(r.id);
                                    setLogRecipeSearch(r.name);
                                    setShowLogRecDropdown(false);
                                  }}
                                >
                                  {r.name} ({r.calories} kcal)
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedLogRecipe && (
                      <div className="form-group" style={{ marginTop: 8 }}>
                        <label className="form-label">How many portions did you eat?</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="form-input"
                          value={logRecipeServings}
                          onChange={e => setLogRecipeServings(e.target.value)}
                          required
                        />
                        {/* What is about to be logged, before it is logged. The old
                            field was labelled "Portions / Factor" and multiplied the
                            WHOLE recipe by it, so the honest entry for one portion of
                            a four-portion bake was 0.25 and nothing on screen said so. */}
                        {(() => {
                          const rec = recipes.find(r => r.id === selectedLogRecipe);
                          if (!rec) return null;
                          const per = perPortion(rec);
                          const eaten = parseFloat(logRecipeServings) || 0;
                          return (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                              Makes <strong>{formatPortions(per.makes)}</strong> portion{per.makes === 1 ? '' : 's'} at{' '}
                              <strong>{Math.round(per.calories)} kcal</strong> each.
                              {eaten > 0 && (
                                <> Logging <strong style={{ color: 'var(--color-primary)' }}>{Math.round(per.calories * eaten)} kcal</strong>
                                  {' '}&middot; {Math.round(per.carbs * eaten)}g C &middot; {Math.round(per.protein * eaten)}g P &middot; {Math.round(per.fat * eaten)}g F</>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div style={{ padding: '0 24px 24px' }}>
                <button type="submit" className="btn-submit" style={{ width: '100%' }}>
                  {editingLogEntry ? 'Save Changes' : 'Add to Logbook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT INGREDIENT */}
      {showIngredientModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-slide-up">
            <div className="modal-header">
              <h3 className="modal-title">
                <Barcode size={16} /> {editingIngredientId ? 'Ingredient Edit' : 'New Ingredient Aanmaken'}
              </h3>
              <button className="modal-close" onClick={() => setShowIngredientModal(false)}>Close</button>
            </div>
            <form onSubmit={handleSaveIngredient}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Scan Barcode / Search via OFF</label>
                  <div className="barcode-lookup-group">
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Barcode (EAN)" 
                      value={ingBarcode}
                      onChange={e => setIngBarcode(e.target.value)}
                    />
                    <button 
                      type="button" 
                      className="btn-barcode-lookup" 
                      disabled={barcodeSearching}
                      onClick={handleBarcodeLookup}
                    >
                      {barcodeSearching ? 'Search...' : 'Search'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Naam Ingredient</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Oatmeal, Peanut Butter" 
                    value={ingName}
                    onChange={e => setIngName(e.target.value)}
                    required
                  />
                </div>

                <h4 style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.5px', marginTop: 10 }}>
                  Nutrition facts per 100g
                </h4>
                
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Energy (kcal)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="0" 
                      value={ingKcal}
                      onChange={e => setIngKcal(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Carbs (g)</label>
                    <input 
                      type="number" 
                      step="any"
                      className="form-input" 
                      placeholder="0" 
                      value={ingCarbs}
                      onChange={e => setIngCarbs(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Protein (g)</label>
                    <input 
                      type="number" 
                      step="any"
                      className="form-input" 
                      placeholder="0" 
                      value={ingProtein}
                      onChange={e => setIngProtein(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fats (g)</label>
                    <input 
                      type="number" 
                      step="any"
                      className="form-input" 
                      placeholder="0" 
                      value={ingFat}
                      onChange={e => setIngFat(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <h4 style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.5px', marginTop: 10 }}>
                  Portion sizes & Packaging (Optional)
                </h4>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Portion Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Atv. Slice, Banana, Piece" 
                      value={ingPortionName}
                      onChange={e => setIngPortionName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Portion weight (g)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="Atv. 35" 
                      value={ingPortionWeight}
                      onChange={e => setIngPortionWeight(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Servings per Package</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="Atv. 12" 
                    value={ingPortionsPackage}
                    onChange={e => setIngPortionsPackage(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Caffeine Content (mg per 100g/ml)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="e.g. 32 for energy drink, 80 for espresso" 
                    value={ingCaffeine}
                    onChange={e => setIngCaffeine(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ padding: '0 24px 24px' }}>
                <button type="submit" className="btn-submit" style={{ width: '100%' }}>
                  {editingIngredientId ? 'Ingredient Atwerken' : 'Save ingredient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CREATE / EDIT RECIPE */}
      {showRecipeModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-slide-up" style={{ maxWidth: 660 }}>
            <div className="modal-header">
              <h3 className="modal-title">
                <ChefHat size={16} /> {editingRecipeId ? 'Recipe Edit' : 'Create New Sport Recipe'}
              </h3>
              <button className="modal-close" onClick={() => setShowRecipeModal(false)}>Close</button>
            </div>
            <form onSubmit={handleSaveRecipe}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Naam Recipe</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Zenith Rice Cakes" 
                    value={recName}
                    onChange={e => setRecName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description / Notes</label>
                  <textarea 
                    className="form-textarea" 
                    placeholder="Short description..." 
                    value={recDesc}
                    onChange={e => setRecDesc(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select 
                      className="form-select"
                      value={recCategory}
                      onChange={e => setRecCategory(e.target.value)}
                    >
                      <option value="pre-ride">Pre-Ride Carb-loading</option>
                      <option value="on-the-bike">On-the-Bike Fuel</option>
                      <option value="post-ride">Post-Ride Recovery</option>
                      <option value="baseline">Baseline Healthy</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Makes how many portions?</label>
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      className="form-input"
                      placeholder="e.g. 4"
                      value={recServings}
                      onChange={e => setRecServings(e.target.value)}
                      required
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Ingredients below are for the whole recipe. This is what they get divided by.
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">What one portion looks like (optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. one bowl, 2 slices"
                      value={recServingSize}
                      onChange={e => setRecServingSize(e.target.value)}
                    />
                  </div>
                </div>

                {/* The per-portion figure, live, while the recipe is being built.
                    Without it the only number on screen while adding ingredients is
                    the whole-batch total, which is not the number anyone eats. */}
                {recIngredients.length > 0 && (() => {
                  const makes = Math.max(0.1, parseFloat(recServings) || 1);
                  const tot = recIngredients.reduce((a: any, i: any) => ({
                    calories: a.calories + i.calories,
                    carbs: a.carbs + i.carbs,
                    protein: a.protein + i.protein,
                    fat: a.fat + i.fat,
                    grams: a.grams + (Number(i.amount_g) || 0)
                  }), { calories: 0, carbs: 0, protein: 0, fat: 0, grams: 0 });
                  const per = (v: number) => Math.round(v / makes);
                  return (
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '12px 14px', marginTop: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                        One portion{makes !== 1 ? ` (1 of ${formatPortions(makes)})` : ''}
                        {tot.grams > 0 ? ` · about ${Math.round(tot.grams / makes)} g` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <div><strong style={{ fontSize: 20 }}>{per(tot.calories)}</strong> <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>kcal</span></div>
                        <div><strong style={{ fontSize: 14, color: 'var(--color-carb)' }}>{per(tot.carbs)}g</strong> <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>carbs</span></div>
                        <div><strong style={{ fontSize: 14, color: 'var(--color-protein)' }}>{per(tot.protein)}g</strong> <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>protein</span></div>
                        <div><strong style={{ fontSize: 14, color: 'var(--color-fat)' }}>{per(tot.fat)}g</strong> <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>fat</span></div>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                        Whole recipe: {Math.round(tot.calories)} kcal &middot; {Math.round(tot.carbs)}g C &middot; {Math.round(tot.protein)}g P &middot; {Math.round(tot.fat)}g F
                      </div>
                    </div>
                  );
                })()}

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 10 }}>
                  <h4 className="form-label" style={{ marginBottom: 10 }}>Add Ingredients</h4>
                  
                  {recIngredients.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {recIngredients.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
                          <span>
                            {item.name} - <strong>{item.amount_g}g</strong> 
                            {item.use_portion && ` (${item.portion_count} portions)`}
                          </span>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ color: 'var(--color-carb)', fontWeight: 800 }}>{item.carbs}g carbs</span>
                            <button type="button" className="btn-delete" style={{ width: 22, height: 22 }} onClick={() => handleRemoveRecipeIngredient(idx)}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ position: 'relative' }}>
                      <label className="form-label" style={{ fontSize: 9 }}>Search ingredient</label>
                      <div className="search-dropdown-wrap">
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Type to search..." 
                          value={recipeIngSearch} 
                          onChange={e => {
                            setRecipeIngSearch(e.target.value);
                            setShowRecipeIngDropdown(true);
                          }}
                          onFocus={() => setShowRecipeIngDropdown(true)}
                          onBlur={() => setTimeout(() => setShowRecipeIngDropdown(false), 220)}
                          style={{ height: 38 }}
                        />
                        {showRecipeIngDropdown && (
                          <div className="search-dropdown-list" style={{ zIndex: 110 }}>
                            {ingredients.filter(i => i.name.toLowerCase().includes(recipeIngSearch.toLowerCase())).length === 0 ? (
                              <div className="search-dropdown-item disabled">No ingredients found</div>
                            ) : (
                              ingredients.filter(i => i.name.toLowerCase().includes(recipeIngSearch.toLowerCase())).map(i => (
                                <div 
                                  key={i.id} 
                                  className="search-dropdown-item" 
                                  onClick={() => {
                                    setSelectedRecipeIngId(i.id);
                                    setRecipeIngSearch(i.name);
                                    setShowRecipeIngDropdown(false);
                                  }}
                                >
                                  {i.name}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: 9 }}>Unit</label>
                      <select 
                        className="form-select"
                        value={recipeIngMode}
                        onChange={e => setRecipeIngMode(e.target.value as any)}
                        disabled={!selectedRecipeIngId}
                        style={{ height: 38 }}
                      >
                        <option value="grams">Grams</option>
                        {ingredients.find(i => i.id === selectedRecipeIngId)?.portion_name && (
                          <option value="portions">
                            {ingredients.find(i => i.id === selectedRecipeIngId)?.portion_name}
                          </option>
                        )}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: 9 }}>Amount</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={recipeIngQty}
                        onChange={e => setRecipeIngQty(e.target.value)}
                        disabled={!selectedRecipeIngId}
                        style={{ height: 38 }}
                      />
                    </div>

                    <button 
                      type="button" 
                      className="btn-barcode-lookup" 
                      onClick={handleAddRecipeIngredient}
                      style={{ height: 38 }}
                      disabled={!selectedRecipeIngId}
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 10 }}>
                  <h4 className="form-label" style={{ marginBottom: 10 }}>Preparation Steps</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {recInstructions.map((step, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-primary)', alignSelf: 'center' }}>
                          {idx + 1}.
                        </span>
                        <input
                          type="text"
                          className="form-input"
                          style={{ flex: 1 }}
                          placeholder="Step description..."
                          value={step}
                          onChange={e => {
                            const copy = [...recInstructions];
                            copy[idx] = e.target.value;
                            setRecInstructions(copy);
                          }}
                        />
                        {recInstructions.length > 1 && (
                          <button 
                            type="button" 
                            className="btn-delete"
                            onClick={() => setRecInstructions(recInstructions.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-barcode-lookup"
                      style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 11 }}
                      onClick={() => setRecInstructions([...recInstructions, ''])}
                    >
                      <Plus size={12} /> Add step
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ padding: '0 24px 24px' }}>
                <button type="submit" className="btn-submit" style={{ width: '100%' }}>
                  {editingRecipeId ? 'Recipe Atwerken' : 'Save recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: COPY DAY LOGS */}
      {showCopyDayModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-slide-up" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">
                <Clock size={16} /> Copy Day
              </h3>
              <button className="modal-close" onClick={() => setShowCopyDayModal(false)}>Close</button>
            </div>
            <form onSubmit={handleCopyDay}>
              <div className="modal-body">
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: '1.4' }}>
                  Copy all <strong>{filteredFoodLogs.length}</strong> meals from <strong>{new Date(selectedDateStr).toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}</strong> to another date. The consumption times will be preserved.
                </p>
                <div className="form-group">
                  <label className="form-label">Select Target Date</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={copyTargetDate} 
                    onChange={e => setCopyTargetDate(e.target.value)} 
                    required 
                  />
                </div>
              </div>
              <div style={{ padding: '0 24px 24px' }}>
                <button type="submit" className="btn-submit" style={{ width: '100%' }}>
                  Copy meals
                </button>
              </div>
            </form>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

export default App;
