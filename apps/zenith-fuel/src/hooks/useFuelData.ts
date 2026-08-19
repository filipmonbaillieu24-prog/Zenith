import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { ZaneProfile, ZaneOutput } from '../utils/zane';
import { Ingredient, Recipe, FoodLog, DayState } from '../types/fuel';

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

export function useFuelData() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('Athlete');
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => getMonday(new Date()));
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => formatDateString(new Date()));

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
  const [bodyMeasurementsLogs, setBodyMeasurementsLogs] = useState<any[]>([]);
  const [activeCaloriesMap, setActiveCaloriesMap] = useState<{ [date: string]: number }>({});
  const [gymVolumeMap, setGymVolumeMap] = useState<{ [date: string]: number }>({});
  const [zaneHistory, setZaneHistory] = useState<any[]>([]);

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

  // Handle Session Handshake
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

  // Load User Name
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

  // Fetch Database Records
  const fetchData = useCallback(async () => {
    if (!userId) return;

    try {
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

      setProfile({
        height: heightVal,
        gender: ssotProfile?.gender || 'other',
        birthDate: ssotProfile?.birth_date || '1990-01-01',
        targetWeight: targetWeightVal,
        targetRateKgPerWeek: profileData?.target_rate_kg_per_week ?? 0.5,
        dietType: profileData?.diet_type ?? 'balanced'
      });

      const { data: ingData } = await supabase
        .from('fuel_ingredients')
        .select('*')
        .eq('user_id', userId)
        .order('name');
      setIngredients(ingData || []);

      const { data: recData } = await supabase
        .from('fuel_recipes')
        .select('*')
        .eq('user_id', userId)
        .order('name');
      setRecipes(recData || []);

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

      const startOfWeekStr = formatDateString(startOfWeek);
      const endOfWeekStr = formatDateString(addDays(startOfWeek, 6));

      const { data: completeData } = await supabase
        .from('fuel_days')
        .select('date, is_complete')
        .eq('user_id', userId)
        .gte('date', startOfWeekStr)
        .lte('date', endOfWeekStr);
      setWeeklyDayStates(completeData || []);

      const startOf30Days = new Date();
      startOf30Days.setDate(startOf30Days.getDate() - 30);

      const { data: wLogs } = await supabase
        .from('vigor_weight')
        .select('weight, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startOf30Days.toISOString())
        .order('logged_at');
      setWeightLogs(wLogs || []);

      const { data: bMeasureLogs } = await supabase
        .from('vigor_body_measurements')
        .select('body_fat_pct, muscle_mass_kg, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startOf30Days.toISOString())
        .order('logged_at');
      setBodyMeasurementsLogs(bMeasureLogs || []);

      const { data: sLogs } = await supabase
        .from('vigor_sleep')
        .select('duration_minutes, quality_score, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', startOf30Days.toISOString())
        .order('logged_at');
      setSleepLogs(sLogs || []);

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
          activeCalMap[dStr] += Number(s.calories ?? 0);
        }
      });

      setActiveCaloriesMap(activeCalMap);

      const volumeMap: { [date: string]: number } = {};
      kratosData?.forEach((k: any) => {
        const dStr = formatDateString(new Date(k.completed_at));
        volumeMap[dStr] = (volumeMap[dStr] || 0) + Number(k.volume || 0);
      });
      setGymVolumeMap(volumeMap);

      // Fetch 30-day food logs for ZANE calibration
      const { data: logs30 } = await supabase
        .from('fuel_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', startOf30Days.toISOString())
        .order('logged_at');
      setThirtyDayFoodLogs(logs30 || []);

      const { data: zHist } = await supabase
        .from('fuel_zane_history')
        .select('*')
        .eq('user_id', userId)
        .order('calculated_at', { ascending: false });
      setZaneHistory(zHist || []);
    } catch (e) {
      console.error('Error fetching Fuel data:', e);
    }
  }, [userId, currentWeekMonday]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    loadingSession,
    userId,
    userName,
    currentWeekMonday,
    setCurrentWeekMonday,
    selectedDateStr,
    setSelectedDateStr,
    profile,
    setProfile,
    ingredients,
    setIngredients,
    recipes,
    setRecipes,
    weeklyFoodLogs,
    setWeeklyFoodLogs,
    thirtyDayFoodLogs,
    supplementsLogs,
    weeklyDayStates,
    setWeeklyDayStates,
    weightLogs,
    sleepLogs,
    bodyMeasurementsLogs,
    activeCaloriesMap,
    gymVolumeMap,
    zaneHistory,
    zaneResult,
    setZaneResult,
    refetch: fetchData
  };
}
