import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SleepStageDot } from '../components/SleepStageDot';
import { getLocalDateKey } from '../utils/dates';
import { supabase } from '../utils/supabaseClient';
import { ZenithPageHeader, ZenithHeaderTab, ZenithEmptyState, zenithConfirm } from '@zenith/shared';
import { 
  Scale, 
  Moon, 
  Footprints, 
  Settings, 
  Plus, 
  Info,
  Calendar,
  Sparkles,
  X,
  Camera,
  Trash2,
  Ruler,
  Zap,
  Droplet,
  HeartPulse,
  Wind
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';

import { ManualLogModal } from '../components/ManualLogModal';
import { ProfileSettings } from '../components/ProfileSettings';
import { ProPaywallModal } from '../components/ProPaywallModal';
import { calculateZenithSleepScore, HrvAnsTracker, AcwrForecaster, ZenithHeroStat, ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE, fetchRecentDailyTrainingLoads, DailyTrainingLoad, computePMC, recoveryModel, predictRecoveryScore, localDateToISO } from '@zenith/shared';

interface VigorDashboardProps {
  session: any;
}

// Small colored "legend dot" used in place of emoji circles (🔵/🟡/etc.) next to
// sleep-stage labels — renders consistently across platforms, unlike emoji glyphs.
export const VigorDashboard: React.FC<VigorDashboardProps> = ({ session }) => {
  const user = session?.user;

  const [dbProfile, setDbProfile] = useState<any>(null);

  // Pro status is read from profiles.is_pro (server-side source of truth,
  // set only via the activate_pro_trial() RPC), not from user_metadata —
  // any signed-in client could set arbitrary user_metadata on themselves.
  const isPro = useMemo(() => dbProfile?.isPro === true, [dbProfile]);

  const [proModal, setProModal] = useState<{ isOpen: boolean; featureName?: string; desc?: string }>({ isOpen: false });

  const handleRequestProModal = (featureName: string, desc: string) => {
    setProModal({ isOpen: true, featureName, desc });
  };
  const userName = dbProfile?.name || user.user_metadata?.name || user.user_metadata?.fitness_profile?.name || 'Athlete';

  // Navigation tab state
  const [currentTab, setCurrentTab] = useState<'home' | 'weight' | 'sleep' | 'steps' | 'progress'>('home');

  const vigorNavItems: ZenithHeaderTab[] = [
    { key: 'home',     icon: <Sparkles size={16} strokeWidth={1.6} />,   label: 'Overview' },
    { key: 'weight',   icon: <Scale size={16} strokeWidth={1.6} />,      label: 'Weight' },
    { key: 'steps',    icon: <Footprints size={16} strokeWidth={1.6} />, label: 'Steps' },
    { key: 'sleep',    icon: <Moon size={16} strokeWidth={1.6} />,       label: 'Sleep' },
    { key: 'progress', icon: <Camera size={16} strokeWidth={1.6} />,     label: 'Progress' },
  ];

  // Progress states
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [progressSubTab, setProgressSubTab] = useState<'measurements' | 'photos'>('measurements');
  const [chartMetric, setChartMetric] = useState<string>('waist_cm');

  // New Measurement form state
  const [newMeasurement, setNewMeasurement] = useState({
    logged_at: new Date().toISOString().split('T')[0],
    body_fat_pct: '',
    muscle_mass_kg: '',
    waist_cm: '',
    chest_cm: '',
    shoulders_cm: '',
    hips_cm: '',
    biceps_l_cm: '',
    biceps_r_cm: '',
    thigh_l_cm: '',
    thigh_r_cm: '',
    calves_l_cm: '',
    calves_r_cm: '',
    neck_cm: ''
  });

  // Photo form states
  const [photoAngle, setPhotoAngle] = useState<'front' | 'side' | 'back'>('front');
  const [photoNotes, setPhotoNotes] = useState('');
  const [photoDate, setPhotoDate] = useState(new Date().toISOString().split('T')[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Compare states
  const [compareAngle, setCompareAngle] = useState<'front' | 'side' | 'back'>('front');
  const [comparePhoto1, setComparePhoto1] = useState<string>('');
  const [comparePhoto2, setComparePhoto2] = useState<string>('');

  // Modals state
  const [showSettings, setShowSettings] = useState(false);
  const [showManualLog, setShowManualLog] = useState(false);

  // Profile data
  const [profile, setProfile] = useState<any>({
    height: 180,
    target_weight: 75.0,
    target_steps: 10000,
    target_sleep_hours: 8.0
  });

  // Health logs
  const [weights, setWeights] = useState<any[]>([]);
  const [sleeps, setSleeps] = useState<any[]>([]);
  const [steps, setSteps] = useState<any[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);

  // Logs management state
  const [editingLog, setEditingLog] = useState<{ type: 'weight' | 'sleep' | 'steps'; item: any } | null>(null);

  // Edit fields state
  const [editDate, setEditDate] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editBodyFat, setEditBodyFat] = useState('');
  const [editSteps, setEditSteps] = useState('');
  const [editSleepHours, setEditSleepHours] = useState('');
  const [editSleepMinutes, setEditSleepMinutes] = useState('');
  const [editSleepQuality, setEditSleepQuality] = useState('');

  const [editDeepHours, setEditDeepHours] = useState('');
  const [editDeepMinutes, setEditDeepMinutes] = useState('');
  const [editLightHours, setEditLightHours] = useState('');
  const [editLightMinutes, setEditLightMinutes] = useState('');
  const [editRemHours, setEditRemHours] = useState('');
  const [editRemMinutes, setEditRemMinutes] = useState('');
  const [editAwakeHours, setEditAwakeHours] = useState('');
  const [editAwakeMinutes, setEditAwakeMinutes] = useState('');

  const fetchProfile = useCallback(async () => {
    try {
      // Fetch public.profiles (SSOT)
      const { data: profData, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profError) throw profError;
      if (profData) {
        setDbProfile({
          height: profData.height_cm,
          gender: profData.gender,
          birthDate: profData.birth_date,
          name: profData.name,
          isPro: profData.is_pro === true
        });
      }

      const { data, error } = await supabase
        .from('vigor_profile')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      if (data) setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  }, [user.id]);

  const fetchLogs = useCallback(async () => {
    try {
      // 1. Fetch Weight Logs
      const { data: weightData, error: wError } = await supabase
        .from('vigor_weight')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(60);
      if (wError) throw wError;
      const sortedWeights = (weightData || []).sort(
        (a: any, b: any) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
      );
      setWeights(sortedWeights);

      // 2. Fetch Sleep Logs
      const { data: sleepData, error: sError } = await supabase
        .from('vigor_sleep')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(90);
      if (sError) throw sError;

      // Deduplicate sleeps by date. Prefers the row's own local_date (set server-side
      // by the same day-key every writer uses) over re-deriving a date from logged_at
      // in the browser's timezone, which could disagree with the server near a day
      // boundary. Rows are fetched newest-first, so when a second row for an
      // already-seen day turns up, fill in only the fields still missing on the kept
      // entry rather than discarding it outright - a defensive merge in case any
      // duplicate ever slips through despite the DB-level uniqueness constraint.
      const uniqueSleepsMap = new Map<string, any>();
      (sleepData || []).forEach((item: any) => {
        const dateKey = item.local_date || getLocalDateKey(item.logged_at);
        if (!dateKey) return;
        const existing = uniqueSleepsMap.get(dateKey);
        if (!existing) {
          uniqueSleepsMap.set(dateKey, item);
        } else {
          const merged = { ...existing };
          for (const key of Object.keys(item)) {
            if (merged[key] === null || merged[key] === undefined) merged[key] = item[key];
          }
          uniqueSleepsMap.set(dateKey, merged);
        }
      });
      const sortedSleeps = Array.from(uniqueSleepsMap.values()).sort(
        (a: any, b: any) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
      );
      setSleeps(sortedSleeps);

      // 3. Fetch Steps Logs
      const { data: stepData, error: stError } = await supabase
        .from('vigor_steps')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(90);
      if (stError) throw stError;

      // Deduplicate steps by date - same local_date-first, merge-not-discard approach
      // as sleep above.
      const uniqueStepsMap = new Map<string, any>();
      (stepData || []).forEach((item: any) => {
        const dateKey = item.local_date || getLocalDateKey(item.logged_at);
        if (!dateKey) return;
        const existing = uniqueStepsMap.get(dateKey);
        if (!existing) {
          uniqueStepsMap.set(dateKey, item);
        } else {
          const merged = { ...existing };
          for (const key of Object.keys(item)) {
            if (merged[key] === null || merged[key] === undefined) merged[key] = item[key];
          }
          uniqueStepsMap.set(dateKey, merged);
        }
      });
      const sortedSteps = Array.from(uniqueStepsMap.values()).sort(
        (a: any, b: any) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
      );
      setSteps(sortedSteps);

      // 4. Fetch Body Measurements Logs
      const { data: measureData, error: mError } = await supabase
        .from('vigor_body_measurements')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: true });
      if (mError) throw mError;
      setMeasurements(measureData || []);

      // 5. Fetch Progress Photos Logs
      const { data: photoData, error: pError } = await supabase
        .from('vigor_progress_photos')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: true });
      if (pError) throw pError;
      setPhotos(photoData || []);

    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  // Real cross-app training load (steps + Kratos strength sessions + Aero
  // rides) for the ACWR workload forecaster — not just a steps proxy.
  const [trainingLoads, setTrainingLoads] = useState<DailyTrainingLoad[]>([]);
  const fetchTrainingLoads = useCallback(async () => {
    try {
      const loads = await fetchRecentDailyTrainingLoads(supabase, user.id, 28);
      setTrainingLoads(loads);
    } catch (err) {
      console.error('Error fetching training loads:', err);
    }
  }, [user.id]);

  // Load profile and logs on start
  useEffect(() => {
    fetchProfile();
    fetchLogs();
    fetchTrainingLoads();
  }, [fetchProfile, fetchLogs, fetchTrainingLoads]);

  // Load the shared cross-app Recovery Score model (trained by Zenith Hub's
  // background trainer — Vigor only reads its weights here, it never trains).
  const [mlModelLoaded, setMlModelLoaded] = useState(recoveryModel.loaded);
  useEffect(() => {
    let cancelled = false;
    recoveryModel.loadOrInit(supabase, user.id).then(() => {
      if (!cancelled) setMlModelLoaded(true);
    });
    return () => { cancelled = true; };
  }, [user.id]);

  const handleEditClick = (type: 'weight' | 'sleep' | 'steps', item: any) => {
    setEditingLog({ type, item });
    setEditDate(item.logged_at.split('T')[0]);
    if (type === 'weight') {
      setEditWeight(item.weight.toString());
      setEditBodyFat(item.body_fat ? item.body_fat.toString() : '');
    } else if (type === 'steps') {
      setEditSteps(item.step_count.toString());
    } else if (type === 'sleep') {
      const dur = item.duration_minutes || 450;
      const deep = (item.deep_minutes !== undefined && item.deep_minutes !== null) ? item.deep_minutes : Math.round(dur * 0.25);
      const light = (item.light_minutes !== undefined && item.light_minutes !== null) ? item.light_minutes : Math.round(dur * 0.55);
      const rem = (item.rem_minutes !== undefined && item.rem_minutes !== null) ? item.rem_minutes : Math.round(dur * 0.18);
      const awake = (item.awake_minutes !== undefined && item.awake_minutes !== null) ? item.awake_minutes : Math.max(0, dur - (deep + light + rem));

      setEditSleepHours(Math.floor(dur / 60).toString());
      setEditSleepMinutes((dur % 60).toString());
      setEditSleepQuality(item.quality_score ? item.quality_score.toString() : '80');

      setEditDeepHours(Math.floor(deep / 60).toString());
      setEditDeepMinutes((deep % 60).toString());
      setEditLightHours(Math.floor(light / 60).toString());
      setEditLightMinutes((light % 60).toString());
      setEditRemHours(Math.floor(rem / 60).toString());
      setEditRemMinutes((rem % 60).toString());
      setEditAwakeHours(Math.floor(awake / 60).toString());
      setEditAwakeMinutes((awake % 60).toString());
    }
  };

  const handleUpdateLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;

    const { type, item } = editingLog;
    const table = `vigor_${type}`;

    const payload: any = {
      logged_at: localDateToISO(editDate)
    };

    if (type === 'weight') {
      payload.weight = parseFloat(editWeight);
      payload.body_fat = editBodyFat ? parseFloat(editBodyFat) : null;
    } else if (type === 'steps') {
      payload.step_count = parseInt(editSteps);
    } else if (type === 'sleep') {
      const deepMins = (parseInt(editDeepHours) || 0) * 60 + (parseInt(editDeepMinutes) || 0);
      const lightMins = (parseInt(editLightHours) || 0) * 60 + (parseInt(editLightMinutes) || 0);
      const remMins = (parseInt(editRemHours) || 0) * 60 + (parseInt(editRemMinutes) || 0);
      const awakeMins = (parseInt(editAwakeHours) || 0) * 60 + (parseInt(editAwakeMinutes) || 0);
      const totalMins = (deepMins + lightMins + remMins + awakeMins) || (parseInt(editSleepHours) * 60 + parseInt(editSleepMinutes));

      payload.duration_minutes = totalMins;
      payload.deep_minutes = deepMins;
      payload.light_minutes = lightMins;
      payload.rem_minutes = remMins;
      payload.awake_minutes = awakeMins;
      payload.quality_score = parseInt(editSleepQuality);
    }

    try {
      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', item.id);

      if (error) throw error;
      setEditingLog(null);
      fetchLogs();
    } catch (err: any) {
      console.error('Error updating log:', err);
      alert('Error updating: ' + err.message);
    }
  };

  const handleDeleteLog = async (type: 'weight' | 'sleep' | 'steps', id: string) => {
    const typeNames = { weight: 'weight', sleep: 'sleep', steps: 'steps' };
    if (await zenithConfirm(`Are you sure you want to delete this ${typeNames[type]} measurement?`)) {
      const table = `vigor_${type}`;
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('id', id);

        if (error) throw error;
        fetchLogs();
      } catch (err: any) {
        console.error('Error deleting log:', err);
        alert('Error deleting: ' + err.message);
      }
    }
  };

  // Progress Handlers
  const handleSaveMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        user_id: user.id,
        logged_at: localDateToISO(newMeasurement.logged_at)
      };
      
      const parseVal = (val: string) => val.trim() === '' ? null : parseFloat(val);

      payload.body_fat_pct = parseVal(newMeasurement.body_fat_pct);
      payload.muscle_mass_kg = parseVal(newMeasurement.muscle_mass_kg);
      payload.waist_cm = parseVal(newMeasurement.waist_cm);
      payload.chest_cm = parseVal(newMeasurement.chest_cm);
      payload.shoulders_cm = parseVal(newMeasurement.shoulders_cm);
      payload.hips_cm = parseVal(newMeasurement.hips_cm);
      payload.biceps_l_cm = parseVal(newMeasurement.biceps_l_cm);
      payload.biceps_r_cm = parseVal(newMeasurement.biceps_r_cm);
      payload.thigh_l_cm = parseVal(newMeasurement.thigh_l_cm);
      payload.thigh_r_cm = parseVal(newMeasurement.thigh_r_cm);
      payload.calves_l_cm = parseVal(newMeasurement.calves_l_cm);
      payload.calves_r_cm = parseVal(newMeasurement.calves_r_cm);
      payload.neck_cm = parseVal(newMeasurement.neck_cm);

      const { data, error } = await supabase
        .from('vigor_body_measurements')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      setMeasurements(prev => [...prev, data].sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
      
      setNewMeasurement({
        logged_at: new Date().toISOString().split('T')[0],
        body_fat_pct: '',
        muscle_mass_kg: '',
        waist_cm: '',
        chest_cm: '',
        shoulders_cm: '',
        hips_cm: '',
        biceps_l_cm: '',
        biceps_r_cm: '',
        thigh_l_cm: '',
        thigh_r_cm: '',
        calves_l_cm: '',
        calves_r_cm: '',
        neck_cm: ''
      });
      
      alert('Measurements successfully saved!');
    } catch (err) {
      console.error('Error saving measurements:', err);
      alert('Error saving measurements.');
    }
  };

  const handleDeleteMeasurement = async (id: string) => {
    if (!confirm('Are you sure you want to delete this measurement?')) return;
    try {
      const { error } = await supabase
        .from('vigor_body_measurements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setMeasurements(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Error deleting measurement:', err);
    }
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoFile) {
      alert('Select a photo first.');
      return;
    }
    
    setUploadingPhoto(true);
    try {
      const fileExt = photoFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}_${photoAngle}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('vigor-progress-photos')
        .upload(fileName, photoFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('vigor-progress-photos')
        .getPublicUrl(fileName);

      const { data: dbData, error: dbError } = await supabase
        .from('vigor_progress_photos')
        .insert({
          user_id: user.id,
          logged_at: localDateToISO(photoDate),
          image_url: publicUrl,
          angle: photoAngle,
          notes: photoNotes
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setPhotos(prev => [...prev, dbData].sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
      
      setPhotoFile(null);
      setPhotoNotes('');
      alert('Progress photo successfully uploaded!');
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert('Error uploading photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photo: any) => {
    if (!confirm('Are you sure you want to delete this photo?')) return;
    try {
      const urlParts = photo.image_url.split('/vigor-progress-photos/');
      if (urlParts.length > 1) {
        const storagePath = urlParts[1];
        await supabase.storage
          .from('vigor-progress-photos')
          .remove([storagePath]);
      }

      const { error } = await supabase
        .from('vigor_progress_photos')
        .delete()
        .eq('id', photo.id);

      if (error) throw error;
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
    } catch (err) {
      console.error('Error deleting photo:', err);
    }
  };

  // Derived metrics
  const latestWeight = useMemo(() => {
    if (weights.length === 0) return null;
    return weights[weights.length - 1];
  }, [weights]);

  // Weight Goal and Forecast calculations
  const goalProgress = useMemo(() => {
    if (weights.length === 0 || !profile?.target_weight) return null;

    const oldest = weights[0];
    const newest = weights[weights.length - 1];
    const oldestWeight = parseFloat(oldest.weight);
    const newestWeight = parseFloat(newest.weight);
    const targetWeight = profile.target_weight;

    const remainingWeight = Math.round((targetWeight - newestWeight) * 100) / 100;
    const isWeightLoss = targetWeight < oldestWeight;

    // Progress percentage
    // For weight loss: start_weight is oldest. Current is newest. Target is target.
    // Progress = ((oldest - newest) / (oldest - target)) * 100
    // If they have reached or exceeded the goal, cap at 100%. If they moved backwards, min is 0.
    let progressPct = 0;
    const divisor = oldestWeight - targetWeight;
    if (divisor !== 0) {
      progressPct = ((oldestWeight - newestWeight) / divisor) * 100;
    }
    progressPct = Math.min(100, Math.max(0, Math.round(progressPct * 10) / 10));

    // Calculate actual historical rate of change
    const timeDiffMs = new Date(newest.logged_at).getTime() - new Date(oldest.logged_at).getTime();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    let ratePerWeek = 0;
    let isFallbackRate = false;

    if (timeDiffMs >= 24 * 60 * 60 * 1000 && weights.length >= 2) {
      // At least 1 day has passed and we have multiple logs
      const weeksDiff = timeDiffMs / oneWeekMs;
      ratePerWeek = (newestWeight - oldestWeight) / weeksDiff;
    }

    // Fallback if rate is 0 or direction is wrong (e.g. they need to lose weight but are gaining, or vice versa)
    const isIncorrectDirection = isWeightLoss ? ratePerWeek >= 0 : ratePerWeek <= 0;
    if (Math.abs(ratePerWeek) < 0.05 || isIncorrectDirection) {
      isFallbackRate = true;
      ratePerWeek = isWeightLoss ? -0.5 : 0.25; // standard healthy pace
    }

    // Estimate weeks needed to reach goal
    const weeksNeeded = remainingWeight / ratePerWeek;
    
    // Target date forecast
    const forecastDate = new Date(new Date(newest.logged_at).getTime() + weeksNeeded * oneWeekMs);
    const forecastDateStr = forecastDate.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    return {
      oldestWeight,
      currentWeight: newestWeight,
      targetWeight,
      remainingWeight: Math.abs(remainingWeight),
      isWeightLoss,
      progressPct,
      ratePerWeek: Math.round(Math.abs(ratePerWeek) * 100) / 100,
      isFallbackRate,
      forecastDateStr,
    };
  }, [weights, profile]);

  const latestSleep = useMemo(() => {
    if (sleeps.length === 0) return null;
    return sleeps[sleeps.length - 1];
  }, [sleeps]);

  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const todayStepsItem = useMemo(() => {
    return steps.find(s => {
      if (!s.logged_at) return false;
      const dateKey = getLocalDateKey(s.logged_at);
      return dateKey === todayStr;
    }) || null;
  }, [steps, todayStr]);

  const latestStepsItem = useMemo(() => {
    if (steps.length === 0) return null;
    return steps[steps.length - 1];
  }, [steps]);

  // Determine current daily steps for today
  const currentDailySteps = todayStepsItem ? todayStepsItem.step_count : 0;
  const isTodayStepsPresent = todayStepsItem !== null;

  // Formatted chart data
  const chartWeightData = useMemo(() => {
    // Trend = exponential moving average of scale weighings (alpha = 0.15, matching
    // Zenith Fuel's ZANE trend-weight convention) — smooths out day-to-day water/
    // glycogen noise so the underlying direction is visible next to the raw readings.
    let emaWeight: number | null = null;
    return weights.map(w => {
      const weight = parseFloat(w.weight);
      const fat = w.body_fat ? parseFloat(w.body_fat) : null;
      const water = w.water_percent ? parseFloat(w.water_percent) : null;
      const muscle = w.muscle_mass ? parseFloat(w.muscle_mass) : null;
      let other = null;
      if (fat !== null && water !== null) {
        other = Math.max(0, Math.round((100 - fat - water) * 10) / 10);
      }
      if (!Number.isNaN(weight)) {
        emaWeight = emaWeight === null ? weight : 0.15 * weight + 0.85 * emaWeight;
      }
      return {
        date: new Date(w.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
        weight,
        trend: emaWeight !== null ? Math.round(emaWeight * 100) / 100 : null,
        fat,
        water,
        muscle,
        other
      };
    });
  }, [weights]);

  const chartSleepData = useMemo(() => {
    return sleeps.map(s => ({
      date: new Date(s.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
      hours: Math.round((s.duration_minutes / 60) * 10) / 10,
      quality: s.quality_score || 0,
    }));
  }, [sleeps]);

  const chartStepData = useMemo(() => {
    return steps.map(s => ({
      date: new Date(s.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
      steps: s.step_count,
    }));
  }, [steps]);

  // Resting HR is already synced per-night (vigor_sleep.resting_hr) and shown as a
  // single "latest night" badge on the sleep hero card, but never as a trend -
  // a sustained upward drift is one of the more reliable early illness/overtraining
  // signals. Filter out nights without a reading rather than plotting a false 0.
  const chartRestingHrData = useMemo(() => {
    return sleeps
      .filter(s => s.resting_hr)
      .map(s => ({
        date: new Date(s.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
        restingHr: s.resting_hr,
      }));
  }, [sleeps]);

  // Same idea for HRV (vigor_sleep.hrv_ms): raw values are noisy night to night, so
  // plot a rolling 7-night mean alongside the raw line (same raw-vs-trend convention
  // already used for the weight chart) rather than the raw series alone.
  const chartHrvData = useMemo(() => {
    const withHrv = sleeps.filter(s => s.hrv_ms);
    const rollingWindow: number[] = [];
    return withHrv.map(s => {
      const hrv = Number(s.hrv_ms);
      rollingWindow.push(hrv);
      if (rollingWindow.length > 7) rollingWindow.shift();
      const rollingMean = rollingWindow.reduce((sum, v) => sum + v, 0) / rollingWindow.length;
      return {
        date: new Date(s.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
        hrv,
        hrvTrend: Math.round(rollingMean * 10) / 10,
      };
    });
  }, [sleeps]);

  // Joins the already-fetched sleep and cross-app training-load series by LOCAL
  // calendar day. trainingLoads.date is now the shared local key (see
  // shared/dateKey.ts), the same key vigor_sleep.local_date uses, so both sides
  // of this join agree on which day a reading belongs to in every timezone.
  const sleepVsLoadData = useMemo(() => {
    const loadByDate = new Map(trainingLoads.map(l => [l.date, l.load]));
    return sleeps
      .map(s => {
        const localKey = getLocalDateKey(s.logged_at);
        const load = loadByDate.get(localKey);
        if (load === undefined) return null;
        const analysis = calculateZenithSleepScore(s, [], profile.target_sleep_hours || 8.0);
        return {
          date: new Date(s.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
          trainingLoad: Math.round(load * 10) / 10,
          sleepScore: analysis.score,
        };
      })
      .filter((d): d is { date: string; trainingLoad: number; sleepScore: number } => d !== null);
  }, [sleeps, trainingLoads, profile.target_sleep_hours]);

  // Simple Pearson correlation between same-day training load and that night's
  // sleep score. Only meaningful with enough overlapping nights - fewer than ~10
  // points would make a correlation claim more misleading than useful.
  const sleepVsLoadCorrelation = useMemo(() => {
    const n = sleepVsLoadData.length;
    if (n < 10) return null;
    const loads = sleepVsLoadData.map(d => d.trainingLoad);
    const scores = sleepVsLoadData.map(d => d.sleepScore);
    const meanLoad = loads.reduce((a, b) => a + b, 0) / n;
    const meanScore = scores.reduce((a, b) => a + b, 0) / n;
    let cov = 0, varLoad = 0, varScore = 0;
    for (let i = 0; i < n; i++) {
      const dLoad = loads[i] - meanLoad;
      const dScore = scores[i] - meanScore;
      cov += dLoad * dScore;
      varLoad += dLoad * dLoad;
      varScore += dScore * dScore;
    }
    if (varLoad === 0 || varScore === 0) return null;
    const r = Math.round((cov / Math.sqrt(varLoad * varScore)) * 100) / 100;
    const strength = Math.abs(r) >= 0.5 ? 'Strong' : Math.abs(r) >= 0.3 ? 'Moderate' : 'Weak';
    const direction = r < 0 ? 'reduce' : 'raise';
    return { r, text: `${strength} ${r < 0 ? 'negative' : 'positive'} correlation (r = ${r.toFixed(2)}): higher training days tend to slightly ${direction} that night's sleep score.` };
  }, [sleepVsLoadData]);

  // Handles saving manual entries (Steps, Sleep, Weight)
  const handleManualSave = async (type: 'weight' | 'sleep' | 'steps', payload: any) => {
    const table = `vigor_${type}`;
    // vigor_steps/vigor_sleep dedupe on (user_id, local_date) — a row inserted
    // without local_date falls back to today's UTC date (the column's DB
    // default), so a backdated entry either collides with today's real synced
    // row or gets silently miscategorized as "today" instead of the date the
    // user actually picked. Deriving local_date from the same logged_at the
    // user chose keeps manual entries keyed the same way synced ones are.
    const localDate = getLocalDateKey(payload.logged_at) || undefined;
    const { error } = await supabase.from(table).insert({
      user_id: user.id,
      ...(localDate ? { local_date: localDate } : {}),
      ...payload
    });

    if (error) throw error;
    fetchLogs();
  };

  // Steps goal progress percentage based on today's steps
  const stepsProgress = useMemo(() => {
    const target = profile.target_steps || 10000;
    return Math.min(Math.round((currentDailySteps / target) * 100), 100);
  }, [currentDailySteps, profile.target_steps]);

  // RENDER TABS
  const renderHomeTab = () => {
    // Calculate BMI
    const heightInMeters = (dbProfile?.height || 180) / 100;
    const bmi = latestWeight ? Math.round((latestWeight.weight / (heightInMeters * heightInMeters)) * 10) / 10 : null;
    let bmiCategory = '';
    let bmiColor = '';
    if (bmi) {
      if (bmi < 18.5) { bmiCategory = 'Underweight'; bmiColor = '#3b82f6'; }
      else if (bmi < 25.0) { bmiCategory = 'Healthy Weight'; bmiColor = '#cbd5e1'; }
      else if (bmi < 30.0) { bmiCategory = 'Overweight'; bmiColor = '#f59e0b'; }
      else { bmiCategory = 'Obese'; bmiColor = '#ef4444'; }
    }

    // HRV ANS state: sourced ONLY from real wearable HRV (rMSSD, ms) synced via
    // Zenith Pulse / Health Connect or a paired smart ring into vigor_sleep.hrv_ms.
    // We never fabricate an HRV number from sleep quality score — if no real
    // reading exists yet, the UI below shows an honest "connect a wearable" state.
    const realHrvSleeps = sleeps.filter(s => typeof s.hrv_ms === 'number' && s.hrv_ms > 0);
    const hasRealHrv = realHrvSleeps.length > 0;
    const todayHrv: number | null = hasRealHrv ? realHrvSleeps[realHrvSleeps.length - 1].hrv_ms : null;
    const hrvHistory = hasRealHrv ? realHrvSleeps.slice(0, -1).map(s => s.hrv_ms as number) : [];
    const ansState = hasRealHrv && todayHrv !== null
      ? HrvAnsTracker.calculateAnsState(hrvHistory, todayHrv)
      : null;

    // Real cross-app training load — steps + Kratos strength sessions +
    // Aero rides (see shared/services/trainingLoad.ts) — instead of a
    // steps-only proxy.
    const dailyLoads = trainingLoads.slice(-28).map(d => d.load);
    const workloadInsight = AcwrForecaster.calculateWorkloadInsight(dailyLoads);

    // Real cross-app Recovery Score (the shared CR11 model Zenith Hub
    // trains from actual next-day performance feedback). Fed with cardio-only
    // TSB/ATL from Aero rides (not the blended ACWR load above, which also
    // includes Kratos — feeding both would double-count Kratos sessions) plus
    // 7-day raw Kratos volume, sleep, steps, and bodyweight. Calorie balance
    // isn't available to Vigor (that lives in Fuel's ZANE model), so it's
    // passed as a neutral 0 rather than fabricated.
    const cardioSeries = trainingLoads
      .filter(d => d.cardioTss > 0)
      .map(d => ({ date: new Date(d.date).getTime(), tss: d.cardioTss }));
    const cardioPMC = computePMC(cardioSeries);
    const cardioToday = cardioPMC.length > 0 ? cardioPMC[cardioPMC.length - 1] : { tsb: 0, atl: 0 };
    const gymVolume7d = trainingLoads.slice(-7).reduce((sum, d) => sum + d.kratosVolume, 0);
    const homeSleepAnalysis = calculateZenithSleepScore(latestSleep, sleeps, profile.target_sleep_hours || 8.0);
    const recoveryScore = mlModelLoaded
      ? predictRecoveryScore(
          cardioToday.tsb,
          homeSleepAnalysis.score,
          homeSleepAnalysis.metrics.totalHours,
          gymVolume7d,
          currentDailySteps,
          0,
          latestWeight ? latestWeight.weight : (profile.target_weight || 75),
          cardioToday.atl
        )
      : null;

    // Weight Fluctuation Telemetry Explainer Analysis
    const recentWeights = weights.slice(0, 3);
    const weightDiff = (recentWeights.length >= 2 && recentWeights[0] && recentWeights[1])
      ? Math.round((recentWeights[0].weight - recentWeights[1].weight) * 10) / 10
      : 0;

    let fluctuationInsight: { title: string; desc: string; icon: React.ReactNode; color: string } | null = null;

    if (weightDiff >= 0.4) {
      fluctuationInsight = {
        title: `Scale Shift Detected (+${weightDiff} kg)`,
        desc: "Heavy strength workouts cause localized muscle inflammation (DOMS) and glycogen supercompensation (1g glycogen holds 3g water). This is healthy recovery fluid, not fat mass. Expect scale weight to stabilize over 24-48 hours.",
        icon: <Zap size={18} />,
        color: "#cbd5e1"
      };
    } else if (weightDiff <= -0.5) {
      fluctuationInsight = {
        title: `Scale Drop (-${Math.abs(weightDiff)} kg)`,
        desc: "Water and glycogen flushing combined with active fat oxidation. True fat loss is tracked by your 7-day EMA trend weight.",
        icon: <Droplet size={18} />,
        color: "#38bdf8"
      };
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">
        
        {fluctuationInsight && (
          <div style={{
            background: 'rgba(28, 28, 35, 0.75)',
            border: `1px solid ${fluctuationInsight.color}30`,
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${fluctuationInsight.color}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: fluctuationInsight.color,
              flexShrink: 0
            }}>
              {fluctuationInsight.icon}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 900, color: fluctuationInsight.color, textTransform: 'uppercase', fontFamily: 'Outfit', letterSpacing: '0.5px' }}>
                {fluctuationInsight.title}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px', lineHeight: '1.45' }}>
                {fluctuationInsight.desc}
              </div>
            </div>
          </div>
        )}

        {/* Hero row: ACWR Workload Forecaster (the single most actionable
            "train hard or back off today" signal) + supporting HRV stat */}
        <div className="zenith-grid-12">
          <div className="zenith-span-8">
            <ZenithHeroStat
              eyebrow="Workload · ACWR"
              value={workloadInsight.acwr.toFixed(2)}
              sub={workloadInsight.recommendation}
              pill={
                <span
                  className="zenith-pill"
                  style={{
                    background: workloadInsight.riskZone === 'optimal' ? 'rgba(85, 239, 196, 0.15)' : workloadInsight.riskZone === 'high' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 118, 117, 0.15)',
                    color: workloadInsight.riskZone === 'optimal' ? '#55efc4' : workloadInsight.riskZone === 'high' ? '#fbbf24' : '#ff7675',
                  }}
                >
                  {workloadInsight.riskZone}
                </span>
              }
            />
          </div>
          <div className="zenith-span-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(56, 189, 248, 0.15)', borderRadius: 12, padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="zenith-label">HRV Autonomic State (ANS)</div>
                {ansState && (
                  <span
                    className="zenith-pill"
                    style={{
                      background: ansState.tone === 'parasympathetic' ? 'rgba(85, 239, 196, 0.15)' : ansState.tone === 'sympathetic' ? 'rgba(255, 118, 117, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                      color: ansState.tone === 'parasympathetic' ? '#55efc4' : ansState.tone === 'sympathetic' ? '#ff7675' : 'var(--text-muted)',
                    }}
                  >
                    {ansState.tone}
                  </span>
                )}
              </div>
              {ansState && todayHrv !== null ? (
                <>
                  <div className="zenith-stat-value" style={{ marginTop: 10 }}>
                    {Math.round(todayHrv * 10) / 10} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>ms rMSSD</span>
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>
                    {ansState.insight}
                  </p>
                </>
              ) : (
                <div style={{ marginTop: 10, flex: 1, display: 'flex' }}>
                  <ZenithEmptyState
                    icon={<HeartPulse size={20} />}
                    title="No HRV data yet"
                    message="Connect a wearable via Zenith Pulse, or pair a smart ring, for real HRV-based readiness."
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recovery Score: the shared cross-app CR11 model (trained by Zenith
            Hub from real next-day performance feedback), fed here with
            Vigor's own real sleep/steps/weight plus cardio & gym load from
            Aero/Kratos. See the recoveryScore calc above for what's real vs.
            neutral-defaulted. */}
        <div className="zenith-grid-12">
          <div className="zenith-span-12" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(56, 189, 248, 0.15)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: recoveryScore !== null ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} style={{ color: '#38bdf8' }} />
                <div className="zenith-label">Recovery Score</div>
              </div>
              {recoveryScore !== null && (
                <span
                  className="zenith-pill"
                  style={{
                    background: recoveryScore >= 70 ? 'rgba(85, 239, 196, 0.15)' : recoveryScore >= 40 ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 118, 117, 0.15)',
                    color: recoveryScore >= 70 ? '#55efc4' : recoveryScore >= 40 ? '#fbbf24' : '#ff7675',
                  }}
                >
                  {recoveryScore >= 70 ? 'Ready to train' : recoveryScore >= 40 ? 'Train with caution' : 'Prioritize recovery'}
                </span>
              )}
            </div>
            {recoveryScore !== null ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="zenith-stat-value">{recoveryScore}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>/ 100</span>
              </div>
            ) : (
              <ZenithEmptyState
                icon={<Sparkles size={20} />}
                title="Recovery model loading…"
                message="Combining sleep, steps, weight, and training load from across the Zenith ecosystem."
              />
            )}
          </div>
        </div>

        {/* Quick Metrics Row: Weight, Steps, Sleep */}
        <div className="zenith-grid-12">
          {/* Weight */}
          <div
            className="zenith-span-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', cursor: 'pointer' }}
            onClick={() => setCurrentTab('weight')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="zenith-label">Weight</div>
              <div className="metric-icon-wrap" style={{ background: 'rgba(203, 213, 225, 0.08)', border: '1px solid rgba(203, 213, 225, 0.2)' }}>
                <Scale size={18} style={{ color: '#cbd5e1' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="zenith-stat-value">{latestWeight ? latestWeight.weight : '--'}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>kg</span>
            </div>
            {latestWeight && latestWeight.body_fat && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, display: 'flex', gap: 12 }}>
                <span>Fat: <strong>{latestWeight.body_fat}%</strong></span>
                {latestWeight.muscle_mass && <span>Muscle: <strong>{latestWeight.muscle_mass}%</strong></span>}
              </div>
            )}
            <div className="metric-footer" style={{ marginTop: latestWeight && latestWeight.body_fat ? 8 : 16 }}>
              <Calendar size={12} />
              <span>
                {latestWeight
                  ? `Weighed on ${new Date(latestWeight.logged_at).toLocaleDateString('en-US')}`
                  : 'No measurement'}
              </span>
            </div>
          </div>

          {/* Steps */}
          <div
            className="zenith-span-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', cursor: 'pointer' }}
            onClick={() => setCurrentTab('steps')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="zenith-label">Daily Steps</div>
              <div className="metric-icon-wrap" style={{ background: 'rgba(92, 124, 250, 0.08)', border: '1px solid rgba(92, 124, 250, 0.2)' }}>
                <Footprints size={18} style={{ color: '#5c7cfa' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="zenith-stat-value">{currentDailySteps.toLocaleString('en-US')}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>/ {profile.target_steps?.toLocaleString('en-US') || '10,000'}</span>
            </div>
            <div style={{ margin: '10px 0 8px' }}>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${stepsProgress}%`, height: '100%', background: '#5c7cfa', borderRadius: 2 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                <span>Progress</span>
                <span>{stepsProgress}%</span>
              </div>
            </div>
            <div className="metric-footer" style={{ marginTop: 0 }}>
              <Sparkles size={12} style={{ color: '#5c7cfa' }} />
              <span style={{ fontSize: 10 }}>
                {isTodayStepsPresent
                  ? `Today (${new Date().toLocaleDateString('en-US')})`
                  : `Today: 0 steps ${latestStepsItem ? `(Last: ${latestStepsItem.step_count.toLocaleString('en-US')} on ${new Date(latestStepsItem.logged_at).toLocaleDateString('en-US')})` : ''}`}
              </span>
            </div>
          </div>

          {/* Sleep */}
          <div
            className="zenith-span-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', cursor: 'pointer' }}
            onClick={() => setCurrentTab('sleep')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="zenith-label">Sleep</div>
              <div className="metric-icon-wrap" style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                <Moon size={18} style={{ color: '#a855f7' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="zenith-stat-value">
                {latestSleep ? Math.floor(latestSleep.duration_minutes / 60) : '--'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>h {latestSleep ? latestSleep.duration_minutes % 60 : ''}m</span>
            </div>
            {latestSleep && latestSleep.quality_score && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                Quality: <strong style={{ color: '#a855f7' }}>{latestSleep.quality_score}/100</strong>
              </div>
            )}
            <div className="metric-footer" style={{ marginTop: latestSleep && latestSleep.quality_score ? 8 : 16 }}>
              <Moon size={12} style={{ color: '#a855f7' }} />
              <span>Goal: {profile.target_sleep_hours || 8} hours</span>
            </div>
          </div>
        </div>

        {/* Vitality Goals & BMI */}
        <div className="vigor-grid">
          <div className="vigor-card col-6">
            <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 16 }}>
              Body Mass Index (BMI)
            </h3>
            {bmi ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '32px', fontWeight: 900, fontFamily: 'Outfit' }}>{bmi}</span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: bmiColor, background: bmiColor + '15', padding: '4px 10px', borderRadius: '6px', border: '1px solid ' + bmiColor + '20' }}>
                    {bmiCategory}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Calculated based on your height of <strong>{dbProfile?.height || 180} cm</strong> and your latest weight measurement.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
                Log a weight measurement and height to compute your BMI.
              </div>
            )}
          </div>

          <div className="vigor-card col-6">
            <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 16 }}>
              Vitality Targets Status
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Target Weight:</span>
                <span style={{ fontWeight: 800, color: '#cbd5e1' }}>{profile.target_weight ? profile.target_weight + ' kg' : '--'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Steps Target:</span>
                <span style={{ fontWeight: 800, color: '#5c7cfa' }}>{profile.target_steps ? profile.target_steps.toLocaleString('en-US') : '10,000'} steps</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Sleep Target:</span>
                <span style={{ fontWeight: 800, color: '#a855f7' }}>{profile.target_sleep_hours || 8} hours/night</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  };

  const renderWeightTab = () => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">
        
        {/* Goal Progress Summary Card */}
        {goalProgress && (
          <div className="vigor-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 40, padding: '32px 40px', border: '1px solid rgba(203, 213, 225, 0.12)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.35)' }}>
            
            {/* Left section: Header & description */}
            <div style={{ flex: '1.2', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="zenith-eyebrow" style={{ color: 'var(--color-primary)' }}>
                  Goal Progress
                </span>
                {goalProgress.isFallbackRate && (
                  <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 6, background: 'var(--color-primary-dim)', color: 'var(--color-primary)', border: '1px solid rgba(203, 213, 225, 0.2)', fontWeight: 600 }}>
                    Estimate (Default rate)
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                Estimated target date:<br />
                <span style={{ color: 'var(--color-primary-bright)', fontSize: 28, display: 'inline-block', marginTop: 4 }}>{goalProgress.forecastDateStr}</span>
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                {goalProgress.isWeightLoss 
                  ? `You have already lost ${Math.round((goalProgress.oldestWeight - goalProgress.currentWeight) * 10) / 10} kg! Remaining ${goalProgress.remainingWeight} kg to reach your target weight of ${goalProgress.targetWeight} kg.`
                  : `You have already gained ${Math.round((goalProgress.currentWeight - goalProgress.oldestWeight) * 10) / 10} kg! Remaining ${goalProgress.remainingWeight} kg to reach your target weight of ${goalProgress.targetWeight} kg.`
                }
              </p>
            </div>

            {/* Middle section: Spaced out metrics cards */}
            <div style={{ flex: '1', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignSelf: 'stretch', alignItems: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
                <span className="zenith-eyebrow">Start</span>
                <strong style={{ fontSize: 16, color: '#fff', fontWeight: 800 }}>{goalProgress.oldestWeight} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>kg</span></strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
                <span className="zenith-eyebrow">Current</span>
                <strong style={{ fontSize: 16, color: '#fff', fontWeight: 800 }}>{goalProgress.currentWeight} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>kg</span></strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
                <span className="zenith-eyebrow">Rate</span>
                <strong style={{ fontSize: 16, color: 'var(--color-primary-bright)', fontWeight: 800 }}>{goalProgress.ratePerWeek} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>kg/wk</span></strong>
              </div>
            </div>

            {/* Right section: Larger Circular Progress Ring */}
            <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
                {/* Background circle */}
                <circle 
                  cx="48" 
                  cy="48" 
                  r="42" 
                  fill="transparent" 
                  stroke="rgba(255,255,255,0.03)" 
                  strokeWidth="6.5" 
                />
                {/* Progress circle */}
                <circle 
                  cx="48" 
                  cy="48" 
                  r="42" 
                  fill="transparent" 
                  stroke="var(--color-primary-bright)" 
                  strokeWidth="6.5" 
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - goalProgress.progressPct / 100)}`}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{goalProgress.progressPct}%</span>
                <span style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>target</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Charts Grid */}
        <div className="vigor-grid">
          {/* Weight trend chart */}
          <div className="vigor-card col-6" style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 className="zenith-eyebrow" style={{ margin: 0 }}>
                Weight Progress (kg)
              </h3>
              <button 
                onClick={() => {
                  setShowManualLog(true);
                }} 
                className="btn-secondary" 
                style={{ padding: '6px 12px', fontSize: 11, height: 'auto' }}
              >
                <Plus size={12} /> Log Weight
              </button>
            </div>
            <div style={{ height: 240, width: '100%' }}>
              {weights.length === 0 ? (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                  <Info size={14} style={{ marginRight: 6 }} /> No weight data available to plot trends.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartWeightData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid {...ZENITH_CHART_GRID} />
                    <XAxis dataKey="date" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" domain={['dataMin - 2', 'dataMax + 2']} tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                    <Tooltip
                      contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                      labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                    />
                    {profile.target_weight && (
                      <ReferenceLine y={profile.target_weight} stroke="rgba(239, 68, 68, 0.4)" strokeDasharray="3 3" label={{ value: `Goal: ${profile.target_weight}kg`, fill: '#ef4444', fontSize: 9, position: 'right' }} />
                    )}
                    <Line type="monotone" name="Weight" dataKey="weight" stroke="rgba(203, 213, 225, 0.35)" strokeWidth={1.5} dot={{ r: 3, stroke: 'rgba(203, 213, 225, 0.35)', strokeWidth: 1, fill: '#09090b' }} activeDot={{ r: 5 }} />
                    <Line type="monotone" name="Trend" dataKey="trend" stroke="var(--color-primary-bright)" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Body Composition trend chart */}
          <div className="vigor-card col-6" style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 className="zenith-eyebrow" style={{ margin: 0 }}>
                Body Composition (%)
              </h3>
              {!isPro && (
                <span style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4 }}>PRO</span>
              )}
            </div>
            <div style={{ height: 240, width: '100%' }}>
              {!isPro ? (
                <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(168, 85, 247, 0.04)', borderRadius: 12, border: '1px solid rgba(168, 85, 247, 0.15)', textAlign: 'center', padding: 20, boxSizing: 'border-box' }}>
                  <Sparkles size={24} color="#a855f7" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', marginBottom: 4 }}>Body Composition is a Pro Feature</div>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 12px', maxWidth: 280, lineHeight: 1.4 }}>Unlock body fat (%), muscle mass (kg), and water content from your smart scale.</p>
                  <button onClick={() => handleRequestProModal('Body Composition', 'Unlock body fat (%), muscle mass (kg), and water content from your smart scale.')} className="btn-primary" style={{ padding: '6px 14px', fontSize: 10, background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', border: 'none', color: '#fff', fontWeight: 900 }}>
                    🔒 Unlock Zenith Pro
                  </button>
                </div>
              ) : weights.length === 0 ? (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                  <Info size={14} style={{ marginRight: 6 }} /> No data available to plot trends.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartWeightData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorVet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05}/>
                      </linearGradient>
                      <linearGradient id="colorVocht" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00f5ff" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#00f5ff" stopOpacity={0.05}/>
                      </linearGradient>
                      <linearGradient id="colorOverig" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#64748b" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#64748b" stopOpacity={0.02}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...ZENITH_CHART_GRID} />
                    <XAxis dataKey="date" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" domain={[0, 100]} tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                    <Tooltip
                      contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                      labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                    />
                    {/* Areas stacked to exactly 100% */}
                    <Area type="monotone" name="Fat %" dataKey="fat" stackId="1" stroke="#ef4444" strokeWidth={1.5} fill="url(#colorVet)" />
                    <Area type="monotone" name="Water %" dataKey="water" stackId="1" stroke="#00f5ff" strokeWidth={1.5} fill="url(#colorVocht)" />
                    <Area type="monotone" name="Other %" dataKey="other" stackId="1" stroke="#64748b" strokeWidth={1.5} fill="url(#colorOverig)" />
                    {/* Muscle % as a line overlaying the areas */}
                    <Line type="monotone" name="Muscle %" dataKey="muscle" stroke="#cbd5e1" strokeWidth={2.5} dot={{ r: 4, stroke: '#cbd5e1', strokeWidth: 1.5, fill: '#09090b' }} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Weight history table */}
        <div className="vigor-card col-12">
          <h3 className="zenith-eyebrow" style={{ marginBottom: 20 }}>
            Weight Measurements History
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th style={{ padding: '8px 12px' }}>Date</th>
                  <th style={{ padding: '8px 12px' }}>Weight</th>
                  <th style={{ padding: '8px 12px' }}>Fat %</th>
                  <th style={{ padding: '8px 12px' }}>Water %</th>
                  <th style={{ padding: '8px 12px' }}>Muscle %</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...weights].reverse().slice(0, 15).map((w: any) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{new Date(w.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: '#cbd5e1' }}>{w.weight} kg</td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{w.body_fat ? w.body_fat + '%' : '--'}</td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{w.water_percent ? w.water_percent + '%' : '--'}</td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{w.muscle_mass ? w.muscle_mass + '%' : '--'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button onClick={() => handleEditClick('weight', w)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, marginRight: 8, height: 'auto' }}>Edit</button>
                      <button onClick={() => handleDeleteLog('weight', w.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', height: 'auto' }}>Delete</button>
                    </td>
                  </tr>
                ))}
                {weights.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                      <ZenithEmptyState
                        icon={<Scale size={20} />}
                        title="No weight measurements yet"
                        message="Log your weight to start tracking trends and body composition over time."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    );
  };

  const renderProgressTab = () => {
    const anglePhotos = photos.filter(p => p.angle === compareAngle);
    const photo1Url = comparePhoto1 || anglePhotos[0]?.image_url || '';
    const photo2Url = comparePhoto2 || anglePhotos[anglePhotos.length - 1]?.image_url || '';

    const metricNames: { [key: string]: string } = {
      body_fat_pct: 'Body Fat (%)',
      muscle_mass_kg: 'Muscle Mass (kg)',
      waist_cm: 'Waist (cm)',
      chest_cm: 'Chest (cm)',
      shoulders_cm: 'Shoulders (cm)',
      hips_cm: 'Hips (cm)',
      biceps_l_cm: 'Left Biceps (cm)',
      biceps_r_cm: 'Right Biceps (cm)',
      thigh_l_cm: 'Left Thigh (cm)',
      thigh_r_cm: 'Right Thigh (cm)',
      calves_l_cm: 'Left Calf (cm)',
      calves_r_cm: 'Right Calf (cm)',
      neck_cm: 'Neck (cm)'
    };

    const chartData = measurements.map(m => {
      const formattedDate = new Date(m.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      return {
        dateStr: formattedDate,
        value: m[chartMetric] !== null ? Number(m[chartMetric]) : null
      };
    }).filter(d => d.value !== null);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">
        {/* Sub-tab Navigation */}
        <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
          <button
            onClick={() => setProgressSubTab('measurements')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: progressSubTab === 'measurements' ? 'var(--color-primary-dim)' : 'transparent',
              color: progressSubTab === 'measurements' ? 'var(--color-primary)' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Body Measurements
          </button>
          <button
            onClick={() => setProgressSubTab('photos')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: progressSubTab === 'photos' ? 'var(--color-primary-dim)' : 'transparent',
              color: progressSubTab === 'photos' ? 'var(--color-primary)' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Progress Photos
          </button>
        </div>

        {progressSubTab === 'measurements' ? (
          !isPro ? (
            <div className="vigor-card col-12" style={{ padding: 48, textAlign: 'center', background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.05) 0%, rgba(9, 9, 11, 0.95) 100%)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Ruler size={40} color="#a855f7" style={{ marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 8px', letterSpacing: '0.5px' }}>
                Body Measurements Log is a Pro Feature
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 24px', maxWidth: 440, lineHeight: 1.6 }}>
                Track measurements across 8 body zones (Chest, Biceps, Thighs, Hips, Shoulders, Neck, Calves, Waist) over time with detailed progress charts.
              </p>
              <button 
                onClick={() => handleRequestProModal('Body Measurements', 'Track measurements across 8 body zones over time with detailed progress charts.')} 
                className="btn-primary" 
                style={{ padding: '10px 24px', fontSize: 12, background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', border: 'none', color: '#fff', fontWeight: 900 }}
              >
                🔒 Unlock Body Measurements (PRO)
              </button>
            </div>
          ) : (
            <div className="vigor-grid">
            {/* Quick Log Measurements Card */}
            <div className="vigor-card col-4">
              <h3 className="zenith-eyebrow" style={{ marginBottom: 20 }}>
                Log Measurements
              </h3>
              <form onSubmit={handleSaveMeasurement} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Log Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={newMeasurement.logged_at}
                      onChange={e => setNewMeasurement({ ...newMeasurement, logged_at: e.target.value })}
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Body Fat (%)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 12.5"
                      className="form-input"
                      value={newMeasurement.body_fat_pct}
                      onChange={e => setNewMeasurement({ ...newMeasurement, body_fat_pct: e.target.value })}
                    />
                  </div>
                </div>

                <div className="zenith-eyebrow" style={{ marginTop: 4 }}>Core</div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Waist (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 80"
                      className="form-input"
                      value={newMeasurement.waist_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, waist_cm: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Muscle Mass (kg)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 65"
                      className="form-input"
                      value={newMeasurement.muscle_mass_kg}
                      onChange={e => setNewMeasurement({ ...newMeasurement, muscle_mass_kg: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Hips (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 95"
                      className="form-input"
                      value={newMeasurement.hips_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, hips_cm: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Neck (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 38"
                      className="form-input"
                      value={newMeasurement.neck_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, neck_cm: e.target.value })}
                    />
                  </div>
                </div>

                <div className="zenith-eyebrow" style={{ marginTop: 4 }}>Upper Body</div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Chest (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 100"
                      className="form-input"
                      value={newMeasurement.chest_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, chest_cm: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Shoulders (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 110"
                      className="form-input"
                      value={newMeasurement.shoulders_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, shoulders_cm: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Left Biceps (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 35"
                      className="form-input"
                      value={newMeasurement.biceps_l_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, biceps_l_cm: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Right Biceps (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 35"
                      className="form-input"
                      value={newMeasurement.biceps_r_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, biceps_r_cm: e.target.value })}
                    />
                  </div>
                </div>

                <div className="zenith-eyebrow" style={{ marginTop: 4 }}>Lower Body</div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Left Thigh (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 55"
                      className="form-input"
                      value={newMeasurement.thigh_l_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, thigh_l_cm: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Right Thigh (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 55"
                      className="form-input"
                      value={newMeasurement.thigh_r_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, thigh_r_cm: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Left Calf (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 37"
                      className="form-input"
                      value={newMeasurement.calves_l_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, calves_l_cm: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Right Calf (cm)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 37"
                      className="form-input"
                      value={newMeasurement.calves_r_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, calves_r_cm: e.target.value })}
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: 10 }}>
                  Save Measurement
                </button>
              </form>
            </div>

            {/* Chart Card */}
            <div className="vigor-card col-8" style={{ display: 'flex', flexDirection: 'column', minHeight: 350 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 className="zenith-eyebrow" style={{ margin: 0 }}>
                  Measurement Progress
                </h3>
                <select
                  className="form-select"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}
                  value={chartMetric}
                  onChange={e => setChartMetric(e.target.value)}
                >
                  {Object.entries(metricNames).map(([key, name]) => (
                    <option key={key} value={key}>{name}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, minHeight: 220 }}>
                {chartData.length === 0 ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    Insufficient data for this metric.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid {...ZENITH_CHART_GRID} />
                      <XAxis dataKey="dateStr" tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.1)" />
                      <YAxis tick={ZENITH_CHART_AXIS_TICK} stroke="rgba(255,255,255,0.1)" domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                        labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                        itemStyle={{ fontSize: 11, color: 'var(--color-primary)' }}
                      />
                      <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name={metricNames[chartMetric]} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* History Table */}
            <div className="vigor-card col-12" style={{ marginTop: 12 }}>
              <h3 className="zenith-eyebrow" style={{ marginBottom: 20 }}>
                Historical Measurements Log
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Fat %</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Muscle (kg)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Waist</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Chest</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Shoulders</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Left Biceps L/R</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Thigh L/R</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Calf L/R</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...measurements].reverse().map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 12px', color: '#cbd5e1', fontWeight: 600 }}>
                          {new Date(m.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#fff' }}>{m.body_fat_pct ? `${m.body_fat_pct}%` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#fff' }}>{m.muscle_mass_kg ? `${m.muscle_mass_kg} kg` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#fff' }}>{m.waist_cm ? `${m.waist_cm} cm` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#fff' }}>{m.chest_cm ? `${m.chest_cm} cm` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#fff' }}>{m.shoulders_cm ? `${m.shoulders_cm} cm` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#fff' }}>
                          {m.biceps_l_cm || m.biceps_r_cm ? `${m.biceps_l_cm ?? '—'} / ${m.biceps_r_cm ?? '—'} cm` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#fff' }}>
                          {m.thigh_l_cm || m.thigh_r_cm ? `${m.thigh_l_cm ?? '—'} / ${m.thigh_r_cm ?? '—'} cm` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#fff' }}>
                          {m.calves_l_cm || m.calves_r_cm ? `${m.calves_l_cm ?? '—'} / ${m.calves_r_cm ?? '—'} cm` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button onClick={() => handleDeleteMeasurement(m.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', height: 'auto' }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {measurements.length === 0 && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, border: 'none' }}>
                          <ZenithEmptyState
                            icon={<Ruler size={20} />}
                            title="No body measurements recorded"
                            message="Log your first set of measurements to start tracking changes across body zones."
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          )
        ) : (
          !isPro ? (
            <div className="vigor-card col-12" style={{ padding: 48, textAlign: 'center', background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.05) 0%, rgba(9, 9, 11, 0.95) 100%)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={40} color="#a855f7" style={{ marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 8px', letterSpacing: '0.5px' }}>
                Progress Photos & Comparison is a Pro Feature
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 24px', maxWidth: 440, lineHeight: 1.6 }}>
                Upload photos monthly (Front, Side, Back) and compare your physical transformation directly side-by-side with the interactive slider.
              </p>
              <button 
                onClick={() => handleRequestProModal("Progress Photos & Comparer", "Upload photos monthly and compare your physical transformation directly side-by-side with the interactive slider.")}
                className="btn-primary" 
                style={{ padding: '10px 24px', fontSize: 12, background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', border: 'none', color: '#fff', fontWeight: 900 }}
              >
                🔒 Unlock Progress Photos (PRO)
              </button>
            </div>
          ) : (
            <div className="vigor-grid">
            {/* Photo Uploader Card */}
            <div className="vigor-card col-4">
              <h3 className="zenith-eyebrow" style={{ marginBottom: 20 }}>
                Upload Photo
              </h3>
              <form onSubmit={handleUploadPhoto} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Select Photo</label>
                  <input
                    type="file"
                    id="progress-photo-input"
                    accept="image/*"
                    onChange={e => setPhotoFile(e.target.files ? e.target.files[0] : null)}
                    required
                    style={{ display: 'none' }}
                  />
                  <label
                    htmlFor="progress-photo-input"
                    className="form-input"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: photoFile ? '#cbd5e1' : 'var(--text-muted)' }}
                  >
                    <Camera size={14} />
                    {photoFile ? photoFile.name : 'Choose a photo…'}
                  </label>
                </div>
                
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>View / Angle</label>
                  <select
                    className="form-select"
                    value={photoAngle}
                    onChange={e => setPhotoAngle(e.target.value as any)}
                  >
                    <option value="front">Front</option>
                    <option value="side">Side</option>
                    <option value="back">Back</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Photo Date</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={photoDate}
                    onChange={e => setPhotoDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Notes</label>
                  <textarea 
                    className="form-input" 
                    placeholder="e.g. Empty stomach, cold pump..."
                    value={photoNotes}
                    onChange={e => setPhotoNotes(e.target.value)}
                    style={{ height: 60, resize: 'none', fontSize: 11 }}
                  />
                </div>

                <button type="submit" className="btn-primary" disabled={uploadingPhoto}>
                  {uploadingPhoto ? 'Uploading...' : 'Save Photo'}
                </button>
              </form>
            </div>

            {/* Photo Library Grid */}
            <div className="vigor-card col-8" style={{ minHeight: 350 }}>
              <h3 className="zenith-eyebrow" style={{ marginBottom: 20 }}>
                Photo Library
              </h3>
              
              {photos.length === 0 ? (
                <div style={{ height: '80%', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ZenithEmptyState
                    icon={<Camera size={20} />}
                    title="No progress photos uploaded"
                    message="Upload a photo (front, side, or back) to start building your visual timeline."
                  />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxHeight: 300, overflowY: 'auto' }}>
                  {photos.map(p => (
                    <div 
                      key={p.id} 
                      style={{ 
                        background: 'rgba(255,255,255,0.01)', 
                        border: '1px solid rgba(255,255,255,0.05)', 
                        borderRadius: 10, 
                        overflow: 'hidden',
                        position: 'relative'
                      }}
                    >
                      <img 
                        src={p.image_url} 
                        alt={p.angle} 
                        style={{ width: '100%', height: 140, objectFit: 'cover' }}
                      />
                      <div style={{ padding: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-primary)' }}>{p.angle}</span>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{new Date(p.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}</span>
                        </div>
                        {p.notes && <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: '4px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.notes}</p>}
                        <button 
                          onClick={() => handleDeletePhoto(p)}
                          style={{ 
                            position: 'absolute', 
                            top: 6, 
                            right: 6, 
                            width: 24, 
                            height: 24, 
                            borderRadius: '50%', 
                            background: 'rgba(0,0,0,0.6)', 
                            border: 'none', 
                            color: '#ef4444', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            cursor: 'pointer' 
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Side-by-Side Visual Compare Card */}
            <div className="vigor-card col-12" style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 className="zenith-eyebrow" style={{ margin: 0 }}>
                  Side-by-Side Progress Comparer
                </h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <select
                    className="form-select"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}
                    value={compareAngle}
                    onChange={e => {
                      setCompareAngle(e.target.value as any);
                      setComparePhoto1('');
                      setComparePhoto2('');
                    }}
                  >
                    <option value="front">Front</option>
                    <option value="side">Side</option>
                    <option value="back">Back</option>
                  </select>
                </div>
              </div>

              {anglePhotos.length < 2 ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Upload at least two photos from the same angle ({compareAngle}) to use the comparison tool.
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Photo 1 (Old):</span>
                      <select 
                        className="form-select"
                        value={photo1Url}
                        onChange={e => setComparePhoto1(e.target.value)}
                        style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}
                      >
                        {anglePhotos.map(p => (
                          <option key={p.id} value={p.image_url}>
                            {new Date(p.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })} {p.notes ? `(${p.notes.substring(0,15)}...)` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Photo 2 (New):</span>
                      <select 
                        className="form-select"
                        value={photo2Url}
                        onChange={e => setComparePhoto2(e.target.value)}
                        style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}
                      >
                        {anglePhotos.map(p => (
                          <option key={p.id} value={p.image_url}>
                            {new Date(p.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })} {p.notes ? `(${p.notes.substring(0,15)}...)` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
                    <div style={{ flex: 1, maxWidth: 450, textAlign: 'center' }}>
                      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#000' }}>
                        {photo1Url && <img src={photo1Url} alt="Photo 1 comparison" style={{ width: '100%', height: 350, objectFit: 'contain' }} />}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                        Older status
                      </div>
                    </div>
                    <div style={{ flex: 1, maxWidth: 450, textAlign: 'center' }}>
                      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#000' }}>
                        {photo2Url && <img src={photo2Url} alt="Photo 2 comparison" style={{ width: '100%', height: 350, objectFit: 'contain' }} />}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                        Newer status
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          )
        )}
      </div>
    );
  };

  const renderSleepTab = () => {
    const latestSleep = sleeps.length > 0 ? sleeps[sleeps.length - 1] : null;
    const sleepAnalysis = calculateZenithSleepScore(latestSleep, sleeps, profile.target_sleep_hours || 8.0);
    const durMins = sleepAnalysis.metrics.totalMins;
    const deepMins = sleepAnalysis.metrics.deepMins;
    const lightMins = sleepAnalysis.metrics.lightMins;
    const remMins = sleepAnalysis.metrics.remMins;
    const awakeMins = sleepAnalysis.metrics.awakeMins;

    const deepPct = sleepAnalysis.metrics.deepPct;
    const lightPct = sleepAnalysis.metrics.lightPct;
    const remPct = sleepAnalysis.metrics.remPct;
    const awakePct = sleepAnalysis.metrics.awakePct;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">
        
        {/* Zenith AI Sleep & Recovery Score Engine Card */}
        {latestSleep && (
          <div className="vigor-card col-12" style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(9, 9, 11, 0.98) 100%)', border: '1px solid rgba(168, 85, 247, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} style={{ color: '#a855f7' }} />
                  <h3 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', margin: 0 }}>
                    Zenith Sleep & Recovery Engine (ML)
                  </h3>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Recorded on {new Date(latestSleep.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ background: `${sleepAnalysis.ratingColor}20`, padding: '6px 14px', borderRadius: 20, border: `1px solid ${sleepAnalysis.ratingColor}50`, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Moon size={14} style={{ color: sleepAnalysis.ratingColor }} />
                  <span style={{ fontSize: 13, fontWeight: 900, color: sleepAnalysis.ratingColor }}>Score: {sleepAnalysis.score}/100</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', marginLeft: 4, opacity: 0.85 }}>({sleepAnalysis.rating})</span>
                </div>
              </div>
            </div>

            {/* AI Recommendation Alert Box */}
            <div style={{ background: 'rgba(168, 85, 247, 0.06)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(168, 85, 247, 0.15)', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#a855f7', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={14} /> AI Recovery & Sleep Guidance
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>
                {sleepAnalysis.recommendation}
              </p>
              
              {/* Debt & Z-Score Badges */}
              <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(0,0,0,0.3)', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                  Sleep Debt (7d): <strong style={{ color: sleepAnalysis.sleepDebtHours > 2 ? '#fb923c' : '#38bdf8' }}>{sleepAnalysis.sleepDebtHours} hrs</strong>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(0,0,0,0.3)', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                  Personal Baseline: <strong style={{ color: '#fff' }}>{sleepAnalysis.personalBaselineHours} hrs / night</strong>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(0,0,0,0.3)', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                  Efficiency: <strong style={{ color: '#38bdf8' }}>{sleepAnalysis.metrics.efficiencyPct}%</strong>
                </div>
              </div>
            </div>

            {/* Visual Stacked Stage Progress Bar */}
            {!isPro ? (
              <div style={{ padding: '16px', background: 'rgba(168, 85, 247, 0.06)', borderRadius: 12, border: '1px solid rgba(168, 85, 247, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', marginBottom: 2 }}>Total Sleep: {Math.floor(durMins / 60)}h {durMins % 60}m</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Unlock your Deep Sleep, REM & Recovery Scores (PRO).</div>
                </div>
                <button
                  onClick={() => handleRequestProModal('Sleep Stages Breakdown', 'View your exact deep sleep, REM sleep, and light sleep percentages.')}
                  className="btn-primary" 
                  style={{ padding: '8px 16px', fontSize: 11, background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', border: 'none', color: '#fff', fontWeight: 900, flexShrink: 0 }}
                >
                  🔒 Unlock Sleep Stages (PRO)
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>
                    <span>Total sleep: <strong style={{ color: '#fff' }}>{Math.floor(durMins / 60)}h {durMins % 60}m</strong></span>
                    <span>Physical & mental recovery</span>
                  </div>
                  <div style={{ height: 14, width: '100%', borderRadius: 8, overflow: 'hidden', display: 'flex', background: '#1c1c23' }}>
                    <div style={{ width: `${deepPct}%`, background: 'linear-gradient(90deg, #8b5cf6, #a855f7)', transition: 'width 0.5s ease' }} title={`Deep sleep: ${deepPct}%`} />
                    <div style={{ width: `${lightPct}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', transition: 'width 0.5s ease' }} title={`Light sleep: ${lightPct}%`} />
                    <div style={{ width: `${remPct}%`, background: 'linear-gradient(90deg, #ec4899, #f472b6)', transition: 'width 0.5s ease' }} title={`REM sleep: ${remPct}%`} />
                    <div style={{ width: `${Math.max(awakePct, 2)}%`, background: 'linear-gradient(90deg, #f59e0b, #fbbf24)', transition: 'width 0.5s ease' }} title={`Awake: ${awakePct}%`} />
                  </div>
                </div>

                {/* 4 Phase Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                  <div style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '12px', borderRadius: 10, border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#a855f7', marginBottom: 4, display: 'flex', alignItems: 'center' }}><SleepStageDot color="#a855f7" />Deep Sleep</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{Math.floor(deepMins / 60)}h {deepMins % 60}m</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{deepPct}% (Muscle recovery)</div>
                  </div>

                  <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '12px', borderRadius: 10, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#60a5fa', marginBottom: 4, display: 'flex', alignItems: 'center' }}><SleepStageDot color="#60a5fa" />Light Sleep</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{Math.floor(lightMins / 60)}h {lightMins % 60}m</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{lightPct}% (Memory)</div>
                  </div>

                  <div style={{ background: 'rgba(236, 72, 153, 0.08)', padding: '12px', borderRadius: 10, border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#f472b6', marginBottom: 4, display: 'flex', alignItems: 'center' }}><SleepStageDot color="#f472b6" />REM Sleep</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{Math.floor(remMins / 60)}h {remMins % 60}m</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{remPct}% (Mental Energy)</div>
                  </div>

                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '12px', borderRadius: 10, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#fbbf24', marginBottom: 4, display: 'flex', alignItems: 'center' }}><SleepStageDot color="#fbbf24" />Awake</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{awakeMins}m</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{awakePct}% (Micro-awakenings)</div>
                  </div>
                </div>

                {/* Overnight vitals from Health Connect (via Zenith Pulse), when available.
                    Not fabricated — simply omitted when the reading doesn't exist. */}
                {(latestSleep.spo2_percent || latestSleep.respiratory_rate) && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                    {latestSleep.spo2_percent && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.15)', padding: '8px 14px', borderRadius: 10 }}>
                        <Droplet size={14} style={{ color: '#38bdf8' }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Blood Oxygen: <strong style={{ color: '#38bdf8' }}>{Math.round(latestSleep.spo2_percent * 10) / 10}%</strong>
                        </span>
                      </div>
                    )}
                    {latestSleep.respiratory_rate && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.15)', padding: '8px 14px', borderRadius: 10 }}>
                        <Wind size={14} style={{ color: '#38bdf8' }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Respiratory Rate: <strong style={{ color: '#38bdf8' }}>{Math.round(latestSleep.respiratory_rate * 10) / 10} br/min</strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Sleep chart */}
        <div className="vigor-card col-12" style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', margin: 0 }}>
              Sleep Duration & Quality Trend
            </h3>
            <button 
              onClick={() => {
                setShowManualLog(true);
              }} 
              className="btn-secondary" 
              style={{ padding: '6px 12px', fontSize: 11, height: 'auto', background: 'rgba(168, 85, 247, 0.08)', borderColor: '#a855f7', color: '#a855f7' }}
            >
              <Plus size={12} /> Log Sleep
            </button>
          </div>
          <div style={{ height: 240, width: '100%' }}>
            {sleeps.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                <Info size={14} style={{ marginRight: 6 }} /> No sleep data found.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSleepData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid {...ZENITH_CHART_GRID} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <Tooltip
                    contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                    labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                  />
                  {profile.target_sleep_hours && (
                    <ReferenceLine y={profile.target_sleep_hours} stroke="rgba(168, 85, 247, 0.4)" strokeDasharray="3 3" label={{ value: `Goal: ${profile.target_sleep_hours}h`, fill: '#a855f7', fontSize: 9, position: 'right' }} />
                  )}
                  <Bar dataKey="hours" fill="#a855f7" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Resting HR trend */}
        <div className="vigor-card col-6" style={{ minHeight: 280, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            <HeartPulse size={14} style={{ color: '#38bdf8' }} /> Resting Heart Rate Trend
          </h3>
          <div style={{ height: 220, width: '100%' }}>
            {chartRestingHrData.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                <Info size={14} style={{ marginRight: 6 }} /> No resting heart rate readings yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRestingHrData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid {...ZENITH_CHART_GRID} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" domain={['dataMin - 3', 'dataMax + 3']} tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE} />
                  <Line type="monotone" name="Resting HR" dataKey="restingHr" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, stroke: '#38bdf8', strokeWidth: 1, fill: '#09090b' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* HRV trend */}
        <div className="vigor-card col-6" style={{ minHeight: 280, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} style={{ color: '#a855f7' }} /> HRV Trend
          </h3>
          <div style={{ height: 220, width: '100%' }}>
            {chartHrvData.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                <Info size={14} style={{ marginRight: 6 }} /> No HRV readings yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartHrvData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid {...ZENITH_CHART_GRID} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" domain={['dataMin - 5', 'dataMax + 5']} tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE} />
                  <Line type="monotone" name="HRV (rMSSD)" dataKey="hrv" stroke="rgba(168, 85, 247, 0.35)" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" name="7-night avg" dataKey="hrvTrend" stroke="#a855f7" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sleep vs. training load */}
        <div className="vigor-card col-12" style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 20 }}>
            Sleep vs. Training Load
          </h3>
          <div style={{ height: 240, width: '100%' }}>
            {sleepVsLoadData.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                <Info size={14} style={{ marginRight: 6 }} /> Not enough overlapping sleep and training data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sleepVsLoadData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid {...ZENITH_CHART_GRID} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <YAxis yAxisId="load" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <YAxis yAxisId="score" orientation="right" domain={[0, 100]} stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE} />
                  <Bar yAxisId="load" name="Training Load" dataKey="trainingLoad" fill="rgba(245, 158, 11, 0.5)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Line yAxisId="score" type="monotone" name="Sleep Score" dataKey="sleepScore" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 3, stroke: '#a855f7', strokeWidth: 1, fill: '#09090b' }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          {sleepVsLoadCorrelation && (
            <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={12} style={{ color: '#a855f7', flexShrink: 0 }} /> {sleepVsLoadCorrelation.text}
            </p>
          )}
        </div>

        {/* Sleep history table */}
        <div className="vigor-card col-12">
          <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 20 }}>
            Sleep Measurements & Stages History
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th style={{ padding: '8px 12px' }}>Date</th>
                  <th style={{ padding: '8px 12px' }}>Total Sleep</th>
                  <th style={{ padding: '8px 12px' }}>Deep / Light / REM</th>
                  <th style={{ padding: '8px 12px' }}>Quality</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...sleeps].reverse().slice(0, 15).map((s: any) => {
                  // Reuse the exact same engine the hero card above uses (calculateZenithSleepScore)
                  // instead of separate, ad-hoc fallbacks - the previous per-field `s.rem_minutes ||
                  // Math.round(sDur * 0.18)` style synthesis fabricated a non-zero REM/deep/light
                  // split even on nights where the real stage data existed but one field (e.g. REM)
                  // was genuinely 0, while the hero card's all-or-nothing fallback correctly showed
                  // that real 0 - so the two disagreed. Quality similarly fell back to a hardcoded
                  // '82/100' literal whenever quality_score was unset, which it always is (no current
                  // write path ever sets that column), showing the same fake score on every row.
                  const rowAnalysis = calculateZenithSleepScore(s, [], profile.target_sleep_hours || 8.0);
                  const sDur = rowAnalysis.metrics.totalMins;
                  const sDeep = rowAnalysis.metrics.deepMins;
                  const sLight = rowAnalysis.metrics.lightMins;
                  const sRem = rowAnalysis.metrics.remMins;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{new Date(s.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: '#a855f7' }}>{Math.floor(sDur / 60)}h {sDur % 60}m</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 11 }}>
                        <span style={{ color: '#a855f7', fontWeight: 700 }}>{Math.floor(sDeep/60)}h{sDeep%60}m</span> / <span style={{ color: '#60a5fa' }}>{Math.floor(sLight/60)}h{sLight%60}m</span> / <span style={{ color: '#f472b6' }}>{Math.floor(sRem/60)}h{sRem%60}m</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{rowAnalysis.score}/100</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button onClick={() => handleEditClick('sleep', s)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, marginRight: 8, height: 'auto' }}>Edit</button>
                        <button onClick={() => handleDeleteLog('sleep', s.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', height: 'auto' }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
                {sleeps.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No sleep measurements logged.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    );
  };

  const renderStepsTab = () => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">
        
        {/* Steps chart */}
        <div className="vigor-card col-12" style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 className="zenith-eyebrow" style={{ margin: 0 }}>
              Daily Steps Trend
            </h3>
            <button 
              onClick={() => {
                setShowManualLog(true);
              }} 
              className="btn-secondary" 
              style={{ padding: '6px 12px', fontSize: 11, height: 'auto', background: 'rgba(92, 124, 250, 0.08)', borderColor: '#5c7cfa', color: '#5c7cfa' }}
            >
              <Plus size={12} /> Log Steps
            </button>
          </div>
          <div style={{ height: 240, width: '100%' }}>
            {steps.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                <Info size={14} style={{ marginRight: 6 }} /> No step logs recorded.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartStepData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid {...ZENITH_CHART_GRID} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                  <Tooltip
                    contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                    labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                  />
                  {profile.target_steps && (
                    <ReferenceLine y={profile.target_steps} stroke="rgba(92, 124, 250, 0.4)" strokeDasharray="3 3" />
                  )}
                  <Bar dataKey="steps" fill="#5c7cfa" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Steps history table */}
        <div className="vigor-card col-12">
          <h3 className="zenith-eyebrow" style={{ marginBottom: 20 }}>
            Steps Measurements History
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th style={{ padding: '8px 12px' }}>Date</th>
                  <th style={{ padding: '8px 12px' }}>Steps</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...steps].reverse().slice(0, 15).map((s: any) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{new Date(s.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: '#5c7cfa' }}>{s.step_count.toLocaleString('en-US')} steps</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button onClick={() => handleEditClick('steps', s)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, marginRight: 8, height: 'auto' }}>Edit</button>
                      <button onClick={() => handleDeleteLog('steps', s.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', height: 'auto' }}>Delete</button>
                    </td>
                  </tr>
                ))}
                {steps.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: 0, border: 'none' }}>
                      <ZenithEmptyState
                        icon={<Footprints size={20} />}
                        title="No step logs recorded"
                        message="Log your daily steps to start tracking progress toward your step goal."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    );
  };

  return (
    <div className="vigor-container animate-fade-in">
      <div className="vigor-glow" />

      {/* Header section — shared shell used by every Zenith app */}
      <ZenithPageHeader
        appName="VIGOR"
        subtitle={`Health & Vitality Tracker for ${userName}`}
        tabs={vigorNavItems}
        activeTab={currentTab}
        onTabChange={(key) => setCurrentTab(key as any)}
        actions={
          <>
            <button onClick={() => window.parent.postMessage({ type: 'NAVIGATE_TAB', tab: 'profile' }, '*')} className="zenith-header-btn">
              <Settings size={14} /> Set Goals
            </button>

            <button onClick={() => setShowManualLog(true)} className="zenith-header-btn zenith-header-btn--primary">
              <Plus size={14} /> Log Manually
            </button>
          </>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>
        {loading ? (
          <div style={{ padding: '100px 0', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'Outfit' }}>
            Synchronizing health data...
          </div>
        ) : (
          <>
            {currentTab === 'home' && renderHomeTab()}
            {currentTab === 'weight' && renderWeightTab()}
            {currentTab === 'sleep' && renderSleepTab()}
            {currentTab === 'steps' && renderStepsTab()}
            {currentTab === 'progress' && renderProgressTab()}
          </>
        )}
      </div>

      {/* Edit Log Modal */}
      {editingLog && (
        <div className="modal-overlay">
          <div className="modal-content animate-slide-up" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Measurement</h2>
              <button className="modal-close" onClick={() => setEditingLog(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateLog} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>

              {editingLog.type === 'weight' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Weight (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Body Fat % (Optional)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input"
                      value={editBodyFat}
                      onChange={(e) => setEditBodyFat(e.target.value)}
                    />
                  </div>
                </>
              )}

              {editingLog.type === 'steps' && (
                <div className="form-group">
                  <label className="form-label">Number of Steps</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editSteps}
                    onChange={(e) => setEditSteps(e.target.value)}
                    required
                  />
                </div>
              )}

              {editingLog.type === 'sleep' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#a855f7', textTransform: 'uppercase' }}>
                    Adjust sleep phases by type
                  </div>

                  {/* 1. Deep Sleep */}
                  <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: 10, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center' }}><SleepStageDot color="#a855f7" />Deep Sleep</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Hours</label>
                        <input
                          type="number"
                          className="form-input"
                          value={editDeepHours}
                          onChange={(e) => setEditDeepHours(e.target.value)}
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Minutes</label>
                        <input
                          type="number"
                          className="form-input"
                          value={editDeepMinutes}
                          onChange={(e) => setEditDeepMinutes(e.target.value)}
                          min="0"
                          max="59"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Light Sleep */}
                  <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: 10, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center' }}><SleepStageDot color="#60a5fa" />Light Sleep</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Hours</label>
                        <input
                          type="number"
                          className="form-input"
                          value={editLightHours}
                          onChange={(e) => setEditLightHours(e.target.value)}
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Minutes</label>
                        <input
                          type="number"
                          className="form-input"
                          value={editLightMinutes}
                          onChange={(e) => setEditLightMinutes(e.target.value)}
                          min="0"
                          max="59"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. REM Sleep */}
                  <div style={{ background: 'rgba(236, 72, 153, 0.08)', border: '1px solid rgba(236, 72, 153, 0.2)', padding: 10, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center' }}><SleepStageDot color="#f472b6" />REM Sleep</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Hours</label>
                        <input
                          type="number"
                          className="form-input"
                          value={editRemHours}
                          onChange={(e) => setEditRemHours(e.target.value)}
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Minutes</label>
                        <input
                          type="number"
                          className="form-input"
                          value={editRemMinutes}
                          onChange={(e) => setEditRemMinutes(e.target.value)}
                          min="0"
                          max="59"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. Awake */}
                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: 10, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center' }}><SleepStageDot color="#fbbf24" />Awake</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Hours</label>
                        <input
                          type="number"
                          className="form-input"
                          value={editAwakeHours}
                          onChange={(e) => setEditAwakeHours(e.target.value)}
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Minutes</label>
                        <input
                          type="number"
                          className="form-input"
                          value={editAwakeMinutes}
                          onChange={(e) => setEditAwakeMinutes(e.target.value)}
                          min="0"
                          max="59"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label className="form-label">Sleep Quality Score</label>
                      <span style={{ fontSize: 11, color: '#a855f7', fontWeight: 800 }}>{editSleepQuality}/100</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={editSleepQuality}
                      onChange={(e) => setEditSleepQuality(e.target.value)}
                      style={{ width: '100%', accentColor: '#a855f7' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingLog(null)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modals Mounting */}
      {showSettings && (
        <ProfileSettings 
          userId={user.id}
          onClose={() => setShowSettings(false)}
          onProfileUpdated={fetchProfile}
        />
      )}

      {showManualLog && (
        <ManualLogModal 
          onClose={() => setShowManualLog(false)}
          onSave={handleManualSave}
        />
      )}

      {/* Zenith Pro Paywall Modal */}
      <ProPaywallModal 
        isOpen={proModal.isOpen}
        onClose={() => setProModal({ isOpen: false })}
        featureName={proModal.featureName}
        featureDescription={proModal.desc}
      />

    </div>
  );
};

export default VigorDashboard;
