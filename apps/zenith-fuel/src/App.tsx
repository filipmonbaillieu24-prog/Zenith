import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Plus, Trash2, Edit, BookOpen, ChefHat, Sparkles, Check, 
  ShieldAlert, Clock, Barcode, Activity, ChevronLeft, ChevronRight
} from 'lucide-react';
import { supabase } from './utils/supabaseClient';
import { calculateZenithSleepScore, ZenithFusionNet } from '@zenith/shared';
import { runZaneCalibration, ZaneProfile, ZaneOutput, DailyLogData, saveZaneCoefficients, calculateMifflinBmr, calculateAge } from './utils/zane';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Ingredient {
  id: string;
  name: string;
  barcode?: string;
  calories_per_100g: number;
  carbs_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  portion_name?: string;
  portion_weight_grams?: number;
  portions_per_package?: number;
  caffeine_mg_per_100g?: number;
}

interface Recipe {
  id: string;
  name: string;
  description: string;
  category: string;
  serving_size: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  caffeine_mg?: number;
  ingredients: any[];
  instructions: string[];
}

interface FoodLog {
  id: string;
  logged_at: string;
  meal_type: string;
  custom_name?: string;
  recipe_id?: string;
  quantity: number;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  caffeine_mg?: number;
}

interface DayState {
  date: string;
  is_complete: boolean;
}

// Date helper functions
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toYYYYMMDD(dateTimeStr: string | undefined | null): string {
  if (!dateTimeStr) return '';
  return dateTimeStr.substring(0, 10);
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
    sleepQualityCoeff: 0,
    sleepDurationCoeff: 0,
    gymVolumeCoeff: 0.15,
    caffeineCoeff: 0.15,
    calculatedAt: '',
    isCalibrated: false,
    calibrationDays: 0,
    dailyCalorieTarget: 2000,
    dailyCarbTarget: 250,
    dailyProteinTarget: 100,
    dailyFatTarget: 67
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
  const [logSuppType, setLogSuppType] = useState<'creatine' | 'caffeine'>('creatine');
  const [logSuppAmount, setLogSuppAmount] = useState('5');
  const [logSuppHour, setLogSuppHour] = useState('08:00');
  const [quickProtein, setQuickProtein] = useState('');
  const [quickFat, setQuickFat] = useState('');

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
  const [recServingSize, setRecServingSize] = useState('1 portie');
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

      const { data: vigorProfile } = await supabase
        .from('vigor_profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      const heightVal = vigorProfile?.height || profileData?.height || 175;
      const targetWeightVal = vigorProfile?.target_weight || profileData?.target_weight || 75;

      setProfile({
        height: heightVal,
        gender: vigorProfile?.gender || 'other',
        birthDate: vigorProfile?.birth_date || '1990-01-01',
        targetWeight: targetWeightVal,
        targetRateKgPerWeek: profileData?.target_rate_kg_per_week ?? 0.5,
        dietType: profileData?.diet_type ?? 'balanced'
      });

      // 2. Fetch Ingredients
      const { data: ingData } = await supabase
        .from('fuel_ingredients')
        .select('*')
        .eq('user_id', userId)
        .order('name');
      setIngredients(ingData || []);

      // 3. Fetch Recipes
      const { data: recData } = await supabase
        .from('fuel_recipes')
        .select('*')
        .eq('user_id', userId)
        .order('name');
      setRecipes(recData || []);

      // 4. Fetch Food Logs for the Viewed Week
      const startOfWeek = new Date(currentWeekMonday);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = addDays(startOfWeek, 7);

      const { data: logData } = await supabase
        .from('fuel_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', startOfWeek.toISOString())
        .lt('logged_at', endOfWeek.toISOString())
        .order('logged_at');
      setWeeklyFoodLogs(logData || []);

      const startOf30DaysForSupp = new Date();
      startOf30DaysForSupp.setDate(startOf30DaysForSupp.getDate() - 30);

      const { data: suppLogData } = await supabase
        .from('fuel_supplements_log')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', startOf30DaysForSupp.toISOString())
        .order('logged_at');
      setSupplementsLogs(suppLogData || []);

      // 5. Fetch Daily Completeness Status for the Viewed Week
      const startOfWeekStr = formatDateString(startOfWeek);
      const endOfWeekStr = formatDateString(addDays(startOfWeek, 6));

      const { data: completeData } = await supabase
        .from('fuel_days')
        .select('date, is_complete')
        .eq('user_id', userId)
        .gte('date', startOfWeekStr)
        .lte('date', endOfWeekStr);
      setWeeklyDayStates(completeData || []);

      // 6. Fetch 30-Day weight logs from Vigor
      const startOf30Days = new Date();
      startOf30Days.setDate(startOf30Days.getDate() - 30);

      const { data: wLogs } = await supabase
        .from('vigor_weight')
        .select('weight, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startOf30Days.toISOString())
        .order('logged_at');
      setWeightLogs(wLogs || []);

      // 6b. Fetch 30-Day body measurements from Vigor
      const { data: bMeasureLogs } = await supabase
        .from('vigor_body_measurements')
        .select('body_fat_pct, muscle_mass_kg, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startOf30Days.toISOString())
        .order('logged_at');
      setBodyMeasurementsLogs(bMeasureLogs || []);

      // 7. Fetch 30-Day sleep logs from Vigor
      const { data: sLogs } = await supabase
        .from('vigor_sleep')
        .select('duration_minutes, quality_score, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startOf30Days.toISOString())
        .order('logged_at');
      setSleepLogs(sLogs || []);

      // 8. Fetch active training calories for the viewed week (Aero Rides & Stride Runs)
      const { data: ridesData } = await supabase
        .from('rides')
        .select('date, metadata')
        .eq('user_id', userId)
        .gte('date', startOfWeek.getTime())
        .lt('date', endOfWeek.getTime());

      const { data: strideData } = await supabase
        .from('stride_activities')
        .select('date, calories, duration_sec')
        .eq('user_id', userId)
        .gte('date', startOfWeekStr)
        .lte('date', endOfWeekStr);

      const { data: kratosData } = await supabase
        .from('kratos_workouts')
        .select('volume, completed_at')
        .eq('user_id', userId)
        .gte('completed_at', startOfWeek.toISOString())
        .lt('completed_at', endOfWeek.toISOString());

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
        if (activeCalMap[dStr] !== undefined) {
          const cal = Number(s.calories || 0) || Math.round(((s.duration_sec || 1231) / 60) * 11.5);
          activeCalMap[dStr] += cal;
        }
      });

      const gymVolMap: { [date: string]: number } = {};
      for (let i = 0; i < 7; i++) {
        gymVolMap[formatDateString(addDays(startOfWeek, i))] = 0;
      }

      kratosData?.forEach((k: any) => {
        const dStr = k.completed_at.split('T')[0];
        if (gymVolMap[dStr] !== undefined) {
          gymVolMap[dStr] += Number(k.volume || 0);
        }
      });

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

  // Complete status map
  const dailyCompletionMap = useMemo(() => {
    const map: { [date: string]: boolean } = {};
    weeklyDayStates.forEach(s => {
      map[s.date] = s.is_complete;
    });
    return map;
  }, [weeklyDayStates]);

  const selectedDateActiveCalories = useMemo(() => activeCaloriesMap[selectedDateStr] || 0, [activeCaloriesMap, selectedDateStr]);
  const selectedDateGymVolume = useMemo(() => gymVolumeMap[selectedDateStr] || 0, [gymVolumeMap, selectedDateStr]);
  const selectedDateCaloriesIntake = useMemo(() => dailyCaloriesMap[selectedDateStr] || 0, [dailyCaloriesMap, selectedDateStr]);
  const selectedDateComplete = useMemo(() => dailyCompletionMap[selectedDateStr] ?? true, [dailyCompletionMap, selectedDateStr]);

  // Run ZANE Adaptive Calibration
  useEffect(() => {
    if (!userId) return;

    const logsMap: { [date: string]: DailyLogData } = {};
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      logsMap[dateStr] = {
        date: dateStr,
        weight: null,
        calories: 0,
        activeCalories: 0,
        sleepQuality: null,
        sleepDurationHours: null,
        isComplete: true,
        gymVolume: 0,
        creatine: 0,
        caffeine: 0
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
        logsMap[dStr].sleepQuality = Number(s.quality_score);
        logsMap[dStr].sleepDurationHours = Number(s.duration_minutes) / 60;
      }
    });

    const fetchCalibrationLogs = async () => {
      const startOf30Days = new Date();
      startOf30Days.setDate(startOf30Days.getDate() - 30);
      const startOf30DaysMs = startOf30Days.getTime();

      const { data: foodHist } = await supabase
        .from('fuel_logs')
        .select('logged_at, calories, caffeine_mg')
        .eq('user_id', userId)
        .gte('logged_at', startOf30Days.toISOString());

      setThirtyDayFoodLogs(foodHist || []);

      foodHist?.forEach(f => {
        const dStr = toYYYYMMDD(f.logged_at);
        if (logsMap[dStr]) {
          logsMap[dStr].calories += Number(f.calories);
          logsMap[dStr].caffeine = (logsMap[dStr].caffeine || 0) + Number(f.caffeine_mg || 0);
        }
      });

      const { data: daysHist } = await supabase
        .from('fuel_days')
        .select('date, is_complete')
        .eq('user_id', userId)
        .gte('date', startOf30Days.toISOString().split('T')[0]);

      daysHist?.forEach(d => {
        if (logsMap[d.date]) {
          logsMap[d.date].isComplete = d.is_complete;
        }
      });

      // CR2: Fetch 30-Day rides for active calories calibration
      const { data: ridesHist } = await supabase
        .from('rides')
        .select('date, metadata')
        .eq('user_id', userId)
        .gte('date', startOf30DaysMs);

      ridesHist?.forEach(r => {
        const dStr = new Date(Number(r.date)).toISOString().split('T')[0];
        if (logsMap[dStr]) {
          let witha = r.metadata;
          if (typeof witha === 'string') {
            try { witha = JSON.parse(witha); } catch { witha = {}; }
          }
          logsMap[dStr].activeCalories += Number(witha?.calories ?? 0);
        }
      });

      // CR3: Fetch 30-Day Kratos gym workouts for active calories calibration
      const { data: gymHist } = await supabase
        .from('kratos_workouts')
        .select('volume, completed_at')
        .eq('user_id', userId)
        .gte('completed_at', startOf30Days.toISOString());

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

      if (logsMap[selectedDateStr]) {
        logsMap[selectedDateStr].calories = selectedDateCaloriesIntake;
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

      const activeProfile = {
        ...profile,
        todayTrainingType
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
        saveLearnedState(zOutput.bmrOffset, zOutput.sleepQualityCoeff, zOutput.sleepDurationCoeff, zOutput.gymVolumeCoeff, zOutput.caffeineCoeff);
      }
    };

    fetchCalibrationLogs();
  }, [userId, weightLogs, sleepLogs, weeklyFoodLogs, supplementsLogs, bodyMeasurementsLogs, selectedDateActiveCalories, selectedDateGymVolume, selectedDateCaloriesIntake, selectedDateComplete, profile, selectedDateStr]);

  // Save ZANE coefficients to database
  const saveLearnedState = async (offset: number, qCoeff: number, dCoeff: number, gCoeff: number, cCoeff: number) => {
    try {
      const todayDateStr = new Date().toISOString().split('T')[0];
      
      // Save to ml_weights (Fase 3 persistent backup)
      await saveZaneCoefficients(supabase, userId, offset, qCoeff, dCoeff, gCoeff, cCoeff);

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
      if (userId) {
        const net = ZenithFusionNet.getInstance();
        await net.init(supabase, userId);
        
        const inputVec = [
          selectedDateCaloriesIntake,
          selectedDateGymVolume,
          selectedDateActiveCalories > 0 ? 80 : 0, // TSS proxy
          todaySleepQuality !== null ? todaySleepQuality : 80,
          todaySleepDuration !== null ? todaySleepDuration : 8.0,
          0.25, // Deep sleep % proxy
          0.18, // REM sleep % proxy
          todaySleepQuality !== null ? (55 + (todaySleepQuality - 75) * 0.8) : 65, // HRV rMSSD proxy
          0, // Delta RHR proxy
          caffeineStats.activeDateCaffeine,
          activeDateCreatine > 0 ? 1.0 : 0.0,
          zaneResult.currentTrendWeight || latestWeight
        ];

        const actualTdee = totalTdee;
        const actualRecovery = todaySleepQuality !== null ? todaySleepQuality : 80;
        const actualCapacity = todaySleepQuality !== null ? Math.min(100, Math.max(30, todaySleepQuality + 5)) : 75;

        await net.train(supabase, userId, inputVec, actualTdee, actualRecovery, actualCapacity);
        console.log("[ZenithFusionNet] Backpropagation online training loop complete for user:", userId);
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
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ingBarcode}.json`);
      const data = await response.json();

      if (data.status === 1 && data.product) {
        const prod = data.product;
        setIngName(prod.product_name || '');
        
        const kcal = prod.nutriments?.['energy-kcal_100g'] || prod.nutriments?.energy_100g || '';
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
          setIngPortionName("Portie");
          const sizeGramss = parseFloat(prod.serving_size);
          if (!isNaN(sizeGramss)) {
            setIngPortionWeight(sizeGramss.toString());
          }
        }
        triggerNotification("Product gevonden en geladen!");
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
        triggerNotification("Ingredient toegevoegd!");
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
        .eq('id', id);

      if (error) throw error;
      setIngredients(ingredients.filter(i => i.id !== id));
      triggerNotification("Ingredient verwijderd.");
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
    setRecServingSize(rec.serving_size);
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
        .eq('id', id);

      if (error) throw error;
      setRecipes(recipes.filter(r => r.id !== id));
      triggerNotification("Recipe verwijderd.");
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
    setRecServingSize('1 portie');
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
      quantity: 1.0
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

      const servings = parseFloat(logRecipeServings) || 1.0;
      entry.recipe_id = rec.id;
      entry.custom_name = rec.name;
      entry.quantity = servings;
      entry.calories = Math.round(rec.calories * servings);
      entry.carbs = Math.round(rec.carbs * servings);
      entry.protein = Math.round(rec.protein * servings);
      entry.fat = Math.round(rec.fat * servings);
      entry.caffeine_mg = Math.round((Number(rec.caffeine_mg) || 0) * servings);
    }

    try {
      if (editingLogEntry) {
        const { data, error } = await supabase
          .from('fuel_logs')
          .update(entry)
          .eq('id', editingLogEntry.id)
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
  };

  // Delete Log Entry
  const handleDeleteLog = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fuel_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setWeeklyFoodLogs(weeklyFoodLogs.filter(f => f.id !== id));
      triggerNotification("Log verwijderd.");
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
    
    setShowLogModal(true);
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
      triggerNotification("Supplement geregistreerd!");
      
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
        .eq('id', id);

      if (error) throw error;
      setSupplementsLogs(prev => prev.filter(s => s.id !== id));
      triggerNotification("Log verwijderd.");
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
      dates30Days.push(d.toISOString().split('T')[0]);
    }

    const intakeMap: { [date: string]: number } = {};
    dates30Days.forEach(date => { intakeMap[date] = 0; });
    sortedLogs.forEach(s => {
      const dStr = toYYYYMMDD(s.logged_at);
      if (s.supplement_type === 'creatine' && dStr in intakeMap) {
        intakeMap[dStr] += Number(s.amount);
      }
    });

    let currentSat = 0;
    const chartData: any[] = [];
    dates30Days.forEach(date => {
      const intake = intakeMap[date] || 0;
      currentSat = Math.min(1.0, (currentSat * 0.92) + (intake / 15));
      chartData.push({
        dateStr: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
        intake: intake,
        saturation: Math.round(currentSat * 100),
        waterWeight: Math.round(currentSat * 1.2 * 100) / 100
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
      dates30Days.push(d.toISOString().split('T')[0]);
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

    const sleepMap: { [date: string]: number } = {};
    sleepLogs.forEach(s => {
      const dStr = toYYYYMMDD(s.logged_at);
      sleepMap[dStr] = Number(s.quality_score);
    });

    const chartData = dates30Days.map(date => {
      const caffeine = intakeMap[date] || 0;
      const sleepQuality = sleepMap[date] || 75;
      
      const caffeineEffect = caffeine * 0.02;
      const sleepEffect = Math.max(0, (80 - sleepQuality) * 0.12);
      const heartRate = Math.round(58 + caffeineEffect + sleepEffect);

      return {
        dateStr: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
        caffeine: caffeine,
        heartRate: heartRate
      };
    });

    const activeDateCaffeine = intakeMap[selectedDateStr] || 0;
    const metabolicBoost = Math.round(activeDateCaffeine * (zaneResult.caffeineCoeff || 0.15));

    return {
      chartData,
      activeDateCaffeine,
      metabolicBoost
    };
  }, [supplementsLogs, thirtyDayFoodLogs, sleepLogs, selectedDateStr, zaneResult.caffeineCoeff]);

  const intakeCalories = useMemo(() => filteredFoodLogs.reduce((sum, f) => sum + f.calories, 0), [filteredFoodLogs]);
  const intakeCarbs = useMemo(() => filteredFoodLogs.reduce((sum, f) => sum + f.carbs, 0), [filteredFoodLogs]);
  const intakeProtein = useMemo(() => filteredFoodLogs.reduce((sum, f) => sum + f.protein, 0), [filteredFoodLogs]);
  const intakeFat = useMemo(() => filteredFoodLogs.reduce((sum, f) => sum + f.fat, 0), [filteredFoodLogs]);

  const caloriesPercentage = Math.min(100, Math.round((intakeCalories / zaneResult.dailyCalorieTarget) * 100)) || 0;
  const carbsPercentage = Math.min(100, Math.round((intakeCarbs / zaneResult.dailyCarbTarget) * 100)) || 0;
  const proteinPercentage = Math.min(100, Math.round((intakeProtein / zaneResult.dailyProteinTarget) * 100)) || 0;
  const fatPercentage = Math.min(100, Math.round((intakeFat / zaneResult.dailyFatTarget) * 100)) || 0;

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (caloriesPercentage / 100) * circumference;

  const latestWeight = weightLogs[weightLogs.length - 1]?.weight || 75;
  const height = profile.height || 175;
  const age = calculateAge(profile.birthDate);
  const gender = profile.gender || 'other';
  
  const baseBmr = Math.round(calculateMifflinBmr(latestWeight, height, age, gender));
  const palFactor = 1.25;
  const baseTdee = Math.round(baseBmr * palFactor);
  const bmrOffset = zaneResult.isCalibrated ? (zaneResult.bmrOffset || 0) : 0;
  const activeCalories = selectedDateActiveCalories;
  
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

  // Sleep adjustment
  let sleepAdjustment = 0;
  if (zaneResult.isCalibrated) {
    const qDiff = (todaySleepQuality ?? sleepQualityAvg) - sleepQualityAvg;
    const dDiff = (todaySleepDuration ?? sleepDurationAvg) - sleepDurationAvg;
    sleepAdjustment = (zaneResult.sleepQualityCoeff * qDiff) + (zaneResult.sleepDurationCoeff * dDiff);
  } else {
    let fallbackTdee = baseTdee + activeCalories;
    let tdeeMultiplier = 1.0;
    if (todaySleepQuality !== null && todaySleepQuality < 60) {
      tdeeMultiplier *= 0.95;
    }
    if (todaySleepDuration !== null && todaySleepDuration < 6.5) {
      tdeeMultiplier *= 0.95;
    }
    sleepAdjustment = (fallbackTdee * tdeeMultiplier) - fallbackTdee;
  }
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

  const tef = Math.round(intakeCalories * 0.1);

  // SOTA ML wearable active calorie cross-calibration coefficient (beta_wearable)
  const wearableCalibration = activeCalories > 0
    ? Math.max(0.70, Math.min(1.25, 1.0 + (bmrOffset / Math.max(200, activeCalories))))
    : 1.0;

  const totalTdee = Math.round(baseTdee + (activeCalories * wearableCalibration) + bmrOffset + sleepAdjustment + tef + gymCalories + caffeineCalories);

  // SOTA ML ZenithFusionNet prediction
  const activeDateCreatine = supplementsLogs
    .filter(s => toYYYYMMDD(s.logged_at) === selectedDateStr && s.supplement_type === 'creatine')
    .reduce((sum, curr) => sum + Number(curr.amount), 0);

  const fusionPredict = ZenithFusionNet.getInstance().predict(
    intakeCalories,
    selectedDateGymVolume,
    selectedDateActiveCalories > 0 ? 80 : 0, // TSS proxy
    todaySleepQuality !== null ? todaySleepQuality : 80,
    todaySleepDuration !== null ? todaySleepDuration : 8.0,
    0.25, // Deep sleep % proxy
    0.18, // REM sleep % proxy
    todaySleepQuality !== null ? (55 + (todaySleepQuality - 75) * 0.8) : 65, // HRV rMSSD proxy
    0, // delta RHR proxy
    caffeineStats.activeDateCaffeine,
    activeDateCreatine > 0 ? 1.0 : 0.0,
    zaneResult.currentTrendWeight || latestWeight
  );

  // Weight Projection
  const netDailyBalance = intakeCalories - totalTdee;
  const projectedWeightChange = (netDailyBalance * 28) / 7700;
  const weeklyWeightRate = (netDailyBalance * 7) / 7700;
  const projectedWeight = Math.round((latestWeight + projectedWeightChange) * 100) / 100;

  // Build the list of 7 days in the viewed week
  const weekDays = useMemo(() => {
    const days = [];
    const weekdaysLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdaysShort = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
    
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
      const dateStr = d.toISOString().split('T')[0];
      baseLogsMap[dateStr] = {
        date: dateStr,
        weight: null,
        calories: 0,
        activeCalories: 0,
        sleepQuality: null,
        sleepDurationHours: null,
        isComplete: true,
        gymVolume: 0,
        creatine: 0,
        caffeine: 0
      };
    }
    weightLogs.forEach(w => {
      const dStr = w.logged_at.split('T')[0];
      if (baseLogsMap[dStr]) baseLogsMap[dStr].weight = Number(w.weight);
    });
    sleepLogs.forEach(s => {
      const dStr = s.logged_at.split('T')[0];
      if (baseLogsMap[dStr]) {
        baseLogsMap[dStr].sleepQuality = Number(s.quality_score);
        baseLogsMap[dStr].sleepDurationHours = Number(s.duration_minutes) / 60;
      }
    });
    weeklyFoodLogs.forEach(f => {
      const dStr = f.logged_at.split('T')[0];
      if (baseLogsMap[dStr]) {
        baseLogsMap[dStr].calories += Number(f.calories);
        baseLogsMap[dStr].caffeine = (baseLogsMap[dStr].caffeine || 0) + Number(f.caffeine_mg || 0);
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
      const activeCalories = activeCaloriesMap[dateStr] || 0;
      let todayTrainingType: 'intense' | 'endurance' | 'rest' | null = 'rest';
      if (activeCalories > 450) {
        todayTrainingType = 'intense';
      } else if (activeCalories > 150) {
        todayTrainingType = 'endurance';
      }

      const activeProfile = {
        ...profile,
        todayTrainingType
      };

      // Run calibration up to this day
      const dayLogsMap = { ...baseLogsMap };
      if (dayLogsMap[dateStr]) {
        dayLogsMap[dateStr].calories = dayCalories;
        dayLogsMap[dateStr].activeCalories = activeCalories;
      }

      const zOutput = runZaneCalibration(Object.values(dayLogsMap), activeProfile, latestWeight, dateStr);

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
        const diff = Math.abs(dayCalories - zOutput.dailyCalorieTarget) / zOutput.dailyCalorieTarget;
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
      carbsPercent: totalTargetCarbs > 0 ? Math.min(100, Math.round((totalIntakeCarbs / totalTargetCarbs) * 100)) : 0,
      proteinPercent: totalTargetProtein > 0 ? Math.min(100, Math.round((totalIntakeProtein / totalTargetProtein) * 100)) : 0,
      fatPercent: totalTargetFat > 0 ? Math.min(100, Math.round((totalIntakeFat / totalTargetFat) * 100)) : 0,
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
          Zenith Fuel laden...
        </div>
      </div>
    );
  }



  return (
    <div className="fuel-container animate-fade-in" style={{ padding: 0 }}>
      <div className="fuel-glow" />
      {/* TOP HEADER */}
      <header className="fuel-header animate-slide-down" style={{ 
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
        <div className="fuel-brand">
          <div>
            <h1 className="zh-hub-title" style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '0.5px', lineHeight: '1.2' }}>
              ZENITH <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>FUEL</span>
            </h1>
            <p className="zh-hub-subtitle" style={{ fontSize: '9px', color: 'var(--text-muted)', margin: '4px 0 0', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Food Diary & Energy Balance for {userName}
            </p>
          </div>
        </div>
      </header>

      <div style={{ padding: '0 28px 28px' }}>
        {/* Navigation tabs bar in Vigor-style */}
      <div className="fuel-tabs" style={{ 
        display: 'flex', 
        gap: 8, 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid rgba(255,255,255,0.05)', 
        padding: '6px', 
        borderRadius: '14px', 
        marginBottom: '24px',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)'
      }}>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: <Sparkles size={14} /> },
          { id: 'logbook', label: 'Logbook', icon: <BookOpen size={14} /> },
          { id: 'ingredients', label: 'Ingredients', icon: <Barcode size={14} /> },
          { id: 'recipes', label: 'Recipes', icon: <ChefHat size={14} /> },
          { id: 'supplements', label: 'Supplements', icon: <Activity size={14} /> }
        ].map(tab => (
          <button
            key={tab.id}
            className={`fuel-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id as any)}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
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
          {/* Main Calorie Ring */}
          <div className="fuel-card col-6">
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
                    stroke="var(--color-primary)"
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90 70 70)"
                    style={{ transition: 'stroke-dashoffset 0.3s' }}
                  />
                </svg>
                <div className="cal-circle-text">
                  <span className="cal-circle-val">{intakeCalories}</span>
                  <span className="cal-circle-lbl">kcal in</span>
                </div>
              </div>

              <div className="cal-details">
                <div className="cal-detail-row">
                  <span style={{ color: 'var(--text-muted)' }}>Zenith Calorie Goal</span>
                  <span className="cal-detail-val">{zaneResult.dailyCalorieTarget} kcal</span>
                </div>
                <div className="cal-detail-row">
                  <span style={{ color: 'var(--text-muted)' }}>Total Intake</span>
                  <span className="cal-detail-val">{intakeCalories} kcal</span>
                </div>
                <div className="cal-detail-row">
                  <span style={{ color: 'var(--text-muted)' }}>Remaining</span>
                  <span className="cal-detail-val" style={{ color: 'var(--color-primary)' }}>
                    {zaneResult.dailyCalorieTarget - intakeCalories} kcal
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Macros Progress Card */}
          <div className="fuel-card col-6">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> Macronutrients
            </h3>
            <div className="macro-list">
              <div className="macro-bar-item">
                <div className="macro-header">
                  <span className="macro-name" style={{ color: 'var(--color-carb)' }}>Carbohydrates</span>
                  <span className="macro-amounts">
                    {intakeCarbs}g <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>/ {zaneResult.dailyCarbTarget}g</span>
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
                    {intakeProtein}g <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>/ {zaneResult.dailyProteinTarget}g</span>
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
                    {intakeFat}g <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>/ {zaneResult.dailyFatTarget}g</span>
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

          {/* Zenith Calibration Card */}
          <div className="fuel-card col-5">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> Zenith Status & Insights
            </h3>
            <div className="zane-insights-wrap">
              <div className="zane-stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="zane-stat-item">
                  <span className="zane-stat-lbl">BMR Offset</span>
                  <div className="zane-stat-val" style={{ color: zaneResult.bmrOffset >= 0 ? '#55efc4' : '#ff7675' }}>
                    {zaneResult.bmrOffset >= 0 ? `+${zaneResult.bmrOffset}` : zaneResult.bmrOffset} kcal
                  </div>
                </div>
                <div className="zane-stat-item">
                  <span className="zane-stat-lbl">Sleep Quality</span>
                  <div className="zane-stat-val" style={{ color: '#a855f7' }}>
                    {zaneResult.isCalibrated 
                      ? `${zaneResult.sleepQualityCoeff >= 0 ? '+' : ''}${zaneResult.sleepQualityCoeff} kcal/%` 
                      : (todaySleepQuality !== null ? `${todaySleepQuality}%` : `${Math.round(sleepQualityAvg)}%`)}
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    {zaneResult.isCalibrated ? 'Coefficient' : (todaySleepQuality !== null ? 'Current measurement' : 'Baseline average')}
                  </span>
                </div>
                <div className="zane-stat-item">
                  <span className="zane-stat-lbl">Sleep Duration</span>
                  <div className="zane-stat-val" style={{ color: '#a855f7' }}>
                    {zaneResult.isCalibrated 
                      ? `${zaneResult.sleepDurationCoeff >= 0 ? '+' : ''}${zaneResult.sleepDurationCoeff} kcal/u` 
                      : (todaySleepDuration !== null ? `${Math.floor(todaySleepDuration)}u ${Math.round((todaySleepDuration % 1) * 60)}m` : `${Math.floor(sleepDurationAvg)}u`)}
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    {zaneResult.isCalibrated ? 'Coefficient' : 'Current measurement'}
                  </span>
                </div>
                <div className="zane-stat-item">
                  <span className="zane-stat-lbl">Gym Coeff</span>
                  <div className="zane-stat-val" style={{ color: 'var(--color-protein)' }}>
                    {zaneResult.isCalibrated ? `${zaneResult.gymVolumeCoeff.toFixed(3)}` : '0.150'}
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    {zaneResult.isCalibrated ? 'Learned' : 'Prior baseline'}
                  </span>
                </div>
                <div className="zane-stat-item">
                  <span className="zane-stat-lbl">Caffeine Coeff</span>
                  <div className="zane-stat-val" style={{ color: 'var(--color-carb)' }}>
                    {zaneResult.isCalibrated ? `${zaneResult.caffeineCoeff.toFixed(3)}` : '0.150'}
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    {zaneResult.isCalibrated ? 'Learned' : 'Prior baseline'}
                  </span>
                </div>
              </div>

              <div className="zane-feedback-text">
                {zaneResult.isCalibrated ? (
                  <>
                    Zenith is fully calibrated based on <strong>{zaneResult.calibrationDays} days</strong> of data. 
                    The algorithm directly adjusts your energy needs based on your actual metabolic variance and sleep quality.
                  </>
                ) : (
                  <>
                    Calibration status: <strong>{zaneResult.calibrationDays}/14 days</strong> completely logged. 
                    Sleep quality and duration factor into recovery matrices. After 14 days Zenith adapts to your personalized personalized sleep coefficients.
                  </>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                <input
                  type="checkbox"
                  id="dayIncompleteCheck"
                  checked={!selectedDateComplete}
                  onChange={handleToggleDayIncomplete}
                  style={{ width: 18, height: 18, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
                <label htmlFor="dayIncompleteCheck" style={{ fontSize: 12, fontWeight: 700, cursor: 'pointer', color: !selectedDateComplete ? '#ff9f43' : 'var(--text-muted)' }}>
                  Mark this day as INCOMPLETE (exclude from Zenith regression)
                </label>
              </div>
            </div>
          </div>

          {/* Zenith Evolution Chart Card */}
          <div className="fuel-card col-7">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> Zenith Parameter Evolution
            </h3>
            {zaneHistory.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, minHeight: 180, textAlign: 'center' }}>
                Start logging meals to display the Zenith evolution chart.
              </div>
            ) : (
              <div style={{ width: '100%', height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={zaneHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.03)" />
                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ background: '#121218', borderColor: 'var(--border-color)', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ fontWeight: 800, color: 'var(--color-primary)' }}
                      formatter={(value: any, name: any) => {
                        if (name && typeof name === 'string' && name.includes("Foutmarge") && Array.isArray(value)) {
                          return [`${value[0]} tot ${value[1]} kcal`, "BMR Offset Range"];
                        }
                        return [value, name];
                      }}
                    />
                    <Area name="BMR Offset Margin of Error" type="monotone" dataKey="offsetRange" stroke="none" fill="rgba(255, 159, 67, 0.08)" />
                    <Line name="BMR Offset (kcal)" type="monotone" dataKey="offset" stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line name="Sleep Quality Coeff" type="monotone" dataKey="quality" stroke="var(--color-protein)" strokeWidth={2} dot={false} />
                    <Line name="Sleep Duration Coeff" type="monotone" dataKey="duration" stroke="var(--color-fat)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Card 1: TDEE Energy Breakdown */}
          <div className="fuel-card col-4 animate-fade-in">
            <h3 className="fuel-card-title">
              <Activity size={14} style={{ color: 'var(--color-primary)' }} /> TDEE Energy Expenditure
            </h3>
            <div className="zane-insights-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Mifflin-St Jeor BMR:</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>{baseBmr} kcal</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>PAL Activity (x1.25):</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>+{baseTdee - baseBmr} kcal</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Cardio & Running (Aero & Stride):</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>
                  +{activeCalories} kcal
                  {activeCalories > 0 && (
                    <span style={{ fontSize: '9px', color: '#38bdf8', marginLeft: '6px', background: 'rgba(56, 189, 248, 0.12)', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                      Calibrated: {wearableCalibration.toFixed(2)}x
                    </span>
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Strength Training (Kratos):</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>
                  +{gymCalories} kcal <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    ({selectedDateGymVolume} kg{zaneResult.isCalibrated ? ` @ ${zaneResult.gymVolumeCoeff.toFixed(3)}/kg` : ''})
                  </span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Caffeine Thermogenesis:</span>
                <span style={{ fontWeight: 700, color: '#ff9f43' }}>
                  +{caffeineCalories} kcal <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    ({caffeineStats.activeDateCaffeine} mg{zaneResult.isCalibrated ? ` @ ${zaneResult.caffeineCoeff.toFixed(3)}/mg` : ''})
                  </span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Zenith Metabolism Offset:</span>
                <span style={{ fontWeight: 700, color: bmrOffset >= 0 ? '#55efc4' : '#ff7675' }}>
                  {bmrOffset >= 0 ? `+${bmrOffset}` : bmrOffset} kcal
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sleep Influence:</span>
                <span style={{ fontWeight: 700, color: sleepAdjustment >= 0 ? '#55efc4' : '#ff7675' }}>
                  {sleepAdjustment >= 0 ? `+${sleepAdjustment}` : sleepAdjustment} kcal
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Thermic Effect of Food (TEF):</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>+{tef} kcal</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 900, paddingBottom: '4px' }}>
                <span style={{ color: 'var(--color-primary)' }}>Total TDEE Expenditure:</span>
                <span style={{ color: 'var(--color-primary)' }}>{totalTdee} kcal</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#38bdf8', paddingTop: '6px', borderTop: '1px dashed var(--border-color)' }}>
                <span>ZenithFusionNet prediction (SOTA ML):</span>
                <span style={{ fontWeight: 800 }}>{fusionPredict.tdeeKcal} kcal</span>
              </div>
            </div>
          </div>

          {/* Card 2: Weight Prediction Forecaster */}
          <div className="fuel-card col-4 animate-fade-in">
            <h3 className="fuel-card-title">
              <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> Weight Predictor (4 weeks)
            </h3>
            <div className="zane-insights-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Current Balance:</span>
                <span style={{ fontWeight: 700, color: netDailyBalance <= 0 ? '#55efc4' : '#ff7675' }}>
                  {netDailyBalance > 0 ? `+${netDailyBalance}` : netDailyBalance} kcal/day
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Weekly Change:</span>
                <span style={{ fontWeight: 700, color: weeklyWeightRate <= 0 ? '#55efc4' : '#ff7675' }}>
                  {weeklyWeightRate > 0 ? `+${weeklyWeightRate.toFixed(2)}` : weeklyWeightRate.toFixed(2)} kg
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Current Scale Weight:</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>{latestWeight} kg</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>True Fat Trend Weight:</span>
                <span style={{ fontWeight: 800, color: '#38bdf8' }}>{zaneResult.currentTrendWeight || latestWeight} kg</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Projected Weight (28d):</span>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{projectedWeight} kg</span>
              </div>
              <div className="zane-feedback-text" style={{ fontSize: '11px', marginTop: '4px', lineHeight: '1.4' }}>
                {netDailyBalance <= -100 ? (
                  <>You are in an energy deficit of {Math.abs(netDailyBalance)} kcal. This stimulates fat oxidation at a healthy, sustainable rate.</>
                ) : netDailyBalance >= 100 ? (
                  <>You are in an energy surplus of {netDailyBalance} kcal. This supports muscle growth and recovery after heavy training.</>
                ) : (
                  <>Your energy balance is stable. Weight is expected to fluctuate near maintenance.</>
                )}
              </div>
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
                <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Macro Target Behaald:</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', width: '24px', color: 'var(--color-carb)', fontWeight: 800 }}>CAR:</span>
                    <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${weeklyStats.carbsPercent}%`, height: '100%', background: 'var(--color-carb)' }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff' }}>{weeklyStats.carbsPercent}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', width: '24px', color: 'var(--color-protein)', fontWeight: 800 }}>PRO:</span>
                    <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${weeklyStats.proteinPercent}%`, height: '100%', background: 'var(--color-protein)' }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff' }}>{weeklyStats.proteinPercent}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', width: '24px', color: 'var(--color-fat)', fontWeight: 800 }}>FAT:</span>
                    <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${weeklyStats.fatPercent}%`, height: '100%', background: 'var(--color-fat)' }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff' }}>{weeklyStats.fatPercent}%</span>
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
          {/* Week Selector Header */}
          <div className="fuel-card col-12" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <button className="fuel-nav-btn" onClick={handlePrevWeek} style={{ padding: '8px 14px' }}>
              <ChevronLeft size={16} /> Previous Week
            </button>
            <strong style={{ fontSize: 14, color: 'var(--text-main)', letterSpacing: '0.5px' }}>
              {formattedWeekRange}
            </strong>
            <button className="fuel-nav-btn" onClick={handleNextWeek} style={{ padding: '8px 14px' }}>
              Next Week <ChevronRight size={16} />
            </button>
          </div>

          {/* 7 Days Selector cards row */}
          <div className="col-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
            {weekDays.map(day => {
              const isSelected = day.dateStr === selectedDateStr;
              return (
                <div 
                  key={day.dateStr}
                  onClick={() => setSelectedDateStr(day.dateStr)}
                  style={{
                    background: isSelected ? 'rgba(255, 159, 67, 0.08)' : 'var(--bg-card)',
                    border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--border-color)'}`,
                    borderRadius: '12px',
                    padding: '12px 10px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  {!day.isComplete && (
                    <div style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: '#ff9f43' }} title="Zenith Excluded (Incomplete)" />
                  )}
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>
                    {day.dayShortName}
                  </span>
                  <strong style={{ fontSize: 20, color: isSelected ? 'var(--color-primary)' : 'var(--text-main)', display: 'block', margin: '4px 0', fontFamily: 'Outfit, sans-serif' }}>
                    {day.dayNum}
                  </strong>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>
                    {day.calories > 0 ? `${day.calories} kcal` : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Timeline of Logs for Selected Date */}
          <div className="fuel-card col-12">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 className="fuel-card-title" style={{ margin: 0, textTransform: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} style={{ color: 'var(--color-primary)' }} /> {selectedDateLongName}
                </h3>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                  Selected date intake: <strong>{intakeCalories} kcal</strong>
                  {!selectedDateComplete && <span style={{ color: '#ff9f43', marginLeft: 8 }}>⚠️ Zenith Excluded (Incomplete)</span>}
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
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No meals logged for this date. Click the button to log.
              </div>
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
                <h2 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fff', margin: 0 }}>
                  Ingredients Database
                </h2>
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
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No ingredients found. Create ingredients to build your database.
              </div>
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
                            <span style={{ background: 'rgba(255, 159, 67, 0.1)', color: 'var(--color-primary)', border: '1px solid rgba(255,159,67,0.2)', fontSize: 9, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 800, textTransform: 'uppercase' }}>
                              1 {ing.portion_name} ({ing.portion_weight_grams}g)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="recipe-macros" style={{ margin: '4px 0', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: 8 }}>
                        <div>
                          <div className="recipe-macro-val" style={{ fontSize: 13, fontWeight: 700 }}>{ing.calories_per_100g}</div>
                          <div className="recipe-macro-lbl" style={{ fontSize: 8, color: 'var(--text-muted)' }}>kcal</div>
                        </div>
                        <div>
                          <div className="recipe-macro-val" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-carb)' }}>{ing.carbs_per_100g}g</div>
                          <div className="recipe-macro-lbl" style={{ fontSize: 8, color: 'var(--text-muted)' }}>carbs</div>
                        </div>
                        <div>
                          <div className="recipe-macro-val" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-protein)' }}>{ing.protein_per_100g}g</div>
                          <div className="recipe-macro-lbl" style={{ fontSize: 8, color: 'var(--text-muted)' }}>prot</div>
                        </div>
                        <div>
                          <div className="recipe-macro-val" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-fat)' }}>{ing.fat_per_100g}g</div>
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
            <h2 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fff', margin: 0 }}>
              My Sport Recipes
            </h2>
            <button className="btn-submit" style={{ padding: '8px 16px', fontSize: 11 }} onClick={() => { resetRecipeForm(); setShowRecipeModal(true); }}>
              <Plus size={14} /> New Recipe
            </button>
          </div>

          {recipes.length === 0 ? (
            <div className="fuel-card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
              You have not created any recipes yet. Create your first recipe!
            </div>
          ) : (
            <div className="recipes-grid">
              {recipes.map(rec => (
                <div key={rec.id} className="recipe-card">
                  <span className="recipe-badge">{rec.category}</span>
                  <h4 className="recipe-title">{rec.name}</h4>
                  <p className="recipe-desc">{rec.description || 'No description'}</p>
                  
                  <div className="recipe-macros" style={{ marginBottom: 12 }}>
                    <div>
                      <div className="recipe-macro-val">{rec.calories}</div>
                      <div className="recipe-macro-lbl">kcal</div>
                    </div>
                    <div>
                      <div className="recipe-macro-val">{rec.carbs}g</div>
                      <div className="recipe-macro-lbl">carbs</div>
                    </div>
                    <div>
                      <div className="recipe-macro-val">{rec.protein}g</div>
                      <div className="recipe-macro-lbl">prot</div>
                    </div>
                    <div>
                      <div className="recipe-macro-val">{rec.fat}g</div>
                      <div className="recipe-macro-lbl">fat</div>
                    </div>
                  </div>

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
          {/* Week Selector Header */}
          <div className="fuel-card col-12" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row', marginBottom: 0 }}>
            <button className="fuel-nav-btn" onClick={handlePrevWeek} style={{ padding: '8px 14px' }}>
              <ChevronLeft size={16} /> Previous Week
            </button>
            <strong style={{ fontSize: 14, color: 'var(--text-main)', letterSpacing: '0.5px' }}>
              {formattedWeekRange}
            </strong>
            <button className="fuel-nav-btn" onClick={handleNextWeek} style={{ padding: '8px 14px' }}>
              Next Week <ChevronRight size={16} />
            </button>
          </div>

          {/* 7 Days Selector cards row */}
          <div className="col-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 12 }}>
            {weekDays.map(day => {
              const isSelected = day.dateStr === selectedDateStr;
              const daySupps = supplementsLogs.filter(s => toYYYYMMDD(s.logged_at) === day.dateStr);
              const dayCreatine = daySupps.filter(s => s.supplement_type === 'creatine').reduce((sum, s) => sum + Number(s.amount), 0);
              const dayCaffeine = daySupps.filter(s => s.supplement_type === 'caffeine').reduce((sum, s) => sum + Number(s.amount), 0);
              return (
                <div 
                  key={day.dateStr}
                  onClick={() => setSelectedDateStr(day.dateStr)}
                  style={{
                    background: isSelected ? 'rgba(255, 159, 67, 0.08)' : 'var(--bg-card)',
                    border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--border-color)'}`,
                    borderRadius: '12px',
                    padding: '12px 10px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>
                    {day.dayShortName}
                  </span>
                  <strong style={{ fontSize: 20, color: isSelected ? 'var(--color-primary)' : 'var(--text-main)', display: 'block', margin: '4px 0', fontFamily: 'Outfit, sans-serif' }}>
                    {day.dayNum}
                  </strong>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dayCreatine > 0 || dayCaffeine > 0 ? (
                      <span style={{ color: 'var(--color-primary)', fontWeight: 800 }}>
                        {dayCreatine > 0 ? `${dayCreatine}g` : ''}
                        {dayCreatine > 0 && dayCaffeine > 0 ? ' | ' : ''}
                        {dayCaffeine > 0 ? `${dayCaffeine}mg` : ''}
                      </span>
                    ) : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* QUICK LOG SUPPLEMENTS */}
          <div className="fuel-card col-4">
            <h2 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fff', marginBottom: 20 }}>
              Quick Log ({new Date(selectedDateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })})
            </h2>
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
                  Hoeveelheid ({logSuppType === 'creatine' ? 'gram' : 'mg'})
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
            <h2 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fff', marginBottom: 20 }}>
              Creatine Saturation
            </h2>
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
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</div>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Geschatte waterretentie:</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--color-carb)', margin: '4px 0' }}>
                  +{creatineStats.latestWaterWeight.toFixed(2)} kg
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: '14px', margin: '8px 0 0 0' }}>
                  ZANE automatically adjusts your scale weight to compensate for water retention fluctuations.
                </p>
              </div>
            </div>
          </div>

          {/* CAFFEINE METABOLIC BOOST CARD */}
          <div className="fuel-card col-4">
            <h2 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fff', marginBottom: 20 }}>
              Metabole Impact Caffeine
            </h2>
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

              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: '14px', textAlign: 'center' }}>
                Learnede coëfficiënt: <strong>{zaneResult.caffeineCoeff || 0.15} kcal</strong> per mg cafeïne.
              </div>
            </div>
          </div>

          {/* CREATINE CHART */}
          <div className="fuel-card col-6">
            <h2 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fff', marginBottom: 20 }}>
              Creatine Loading & Saturation (30 Days)
            </h2>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={creatineStats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="dateStr" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} stroke="rgba(255,255,255,0.1)" />
                  <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} stroke="rgba(255,255,255,0.1)" label={{ value: 'Intake (g)', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 9 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} stroke="rgba(255,255,255,0.1)" label={{ value: 'Saturation (%)', angle: 90, position: 'insideRight', fill: 'var(--text-muted)', fontSize: 9 }} />
                  <Tooltip 
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10 }}
                    labelStyle={{ color: '#fff', fontSize: 11, fontWeight: 700 }}
                    itemStyle={{ fontSize: 11 }}
                  />
                  <Area yAxisId="right" type="monotone" dataKey="saturation" fill="rgba(255, 159, 67, 0.15)" stroke="var(--color-primary)" strokeWidth={2} name="Saturation (%)" />
                  <Line yAxisId="left" type="monotone" dataKey="intake" stroke="var(--color-carb)" strokeWidth={1.5} dot={{ r: 2 }} name="Intake (g)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CAFFEINE CHART */}
          <div className="fuel-card col-6">
            <h2 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fff', marginBottom: 20 }}>
              Caffeine vs. Resting Heart Rate Trend (30 Days)
            </h2>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={caffeineStats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="dateStr" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} stroke="rgba(255,255,255,0.1)" />
                  <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} stroke="rgba(255,255,255,0.1)" label={{ value: 'Caffeine (mg)', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 9 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[50, 75]} tick={{ fill: 'var(--text-muted)', fontSize: 9 }} stroke="rgba(255,255,255,0.1)" label={{ value: 'Heart Rate (bpm)', angle: 90, position: 'insideRight', fill: 'var(--text-muted)', fontSize: 9 }} />
                  <Tooltip 
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10 }}
                    labelStyle={{ color: '#fff', fontSize: 11, fontWeight: 700 }}
                    itemStyle={{ fontSize: 11 }}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="caffeine" fill="rgba(84, 160, 255, 0.1)" stroke="var(--color-carb)" strokeWidth={1} name="Caffeine (mg)" />
                  <Line yAxisId="right" type="monotone" dataKey="heartRate" stroke="rgba(255, 107, 107, 1)" strokeWidth={2} dot={{ r: 2 }} name="Resting Heart Rate (bpm)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SUPPLEMENTS LOG HISTORY */}
          <div className="fuel-card col-12">
            <h2 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fff', marginBottom: 20 }}>
              Logged Supplements on {new Date(selectedDateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })}
            </h2>
            {supplementsLogs.filter(s => toYYYYMMDD(s.logged_at) === selectedDateStr).length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No supplements logged for this date.
              </div>
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
                          Hoeveelheid: <strong>{s.amount} {s.supplement_type === 'creatine' ? 'g' : 'mg'}</strong>
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
                      <label className="form-label">Zoek Ingredient</label>
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
                          <label className="form-label">Hoeveelheid</label>
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
                      <label className="form-label">Zoek Recipe</label>
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
                        <label className="form-label">Portions / Factor</label>
                        <input 
                          type="number" 
                          step="any"
                          className="form-input"
                          value={logRecipeServings}
                          onChange={e => setLogRecipeServings(e.target.value)}
                          required
                        />
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
                  <label className="form-label">Caffeine Gehalte (mg per 100g/ml)</label>
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
                    <label className="form-label">Portion size (textual)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. 4 bars" 
                      value={recServingSize}
                      onChange={e => setRecServingSize(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 10 }}>
                  <h4 className="form-label" style={{ marginBottom: 10 }}>Add Ingredients</h4>
                  
                  {recIngredients.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {recIngredients.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
                          <span>
                            {item.name} - <strong>{item.amount_g}g</strong> 
                            {item.use_portion && ` (${item.portion_count} porties)`}
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
                      <label className="form-label" style={{ fontSize: 9 }}>Hoeveelheid</label>
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
