import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../utils/supabaseClient';
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
  Ruler
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine 
} from 'recharts';

import { WeightScaleConnector } from '../components/WeightScaleConnector';
import { ManualLogModal } from '../components/ManualLogModal';
import { ProfileSettings } from '../components/ProfileSettings';
import { DeviceManagerModal } from '../components/DeviceManagerModal';
import { ProPaywallModal } from '../components/ProPaywallModal';
import { calculateZenithSleepScore } from '@zenith/shared';

interface VigorDashboardProps {
  session: any;
}

const getLocalDateKey = (dateInput: string | Date | null | undefined): string => {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const VigorDashboard: React.FC<VigorDashboardProps> = ({ session }) => {
  const user = session?.user;

  const isPro = useMemo(() => {
    if (!user) return false;
    const email = user.email?.toLowerCase();
    if (email === 'filip.monbaillieu.24@gmail.com') return true;
    return user.user_metadata?.is_pro === true;
  }, [user]);

  const [proModal, setProModal] = useState<{ isOpen: boolean; featureName?: string; desc?: string }>({ isOpen: false });

  const handleRequestProModal = (featureName: string, desc: string) => {
    setProModal({ isOpen: true, featureName, desc });
  };
  const [dbProfile, setDbProfile] = useState<any>(null);
  const userName = dbProfile?.name || user.user_metadata?.name || user.user_metadata?.fitness_profile?.name || 'Atleet';

  // Navigation tab state
  const [currentTab, setCurrentTab] = useState<'home' | 'weight' | 'sleep' | 'steps' | 'progress'>('home');

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

  // Pre-received native weight/metrics to solve race conditions
  const [initialWeight, setInitialWeight] = useState<number | null>(null);
  const [initialMetrics, setInitialMetrics] = useState<any>(null);

  // Modals state
  const [showSettings, setShowSettings] = useState(false);
  const [showManualLog, setShowManualLog] = useState(false);
  const [showScaleConnect, setShowScaleConnect] = useState(false);
  const [showDeviceManager, setShowDeviceManager] = useState(false);
  const [pairedDevices, setPairedDevices] = useState<any[]>([]);

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

  // Auto-connect BLE scale state
  const [autoConnectedDevice, setAutoConnectedDevice] = useState<any>(null);
  const [_backgroundConnecting, setBackgroundConnecting] = useState(false);


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
          name: profData.name
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

      // Deduplicate sleeps by date (keep latest per local calendar date)
      const uniqueSleepsMap = new Map<string, any>();
      (sleepData || []).forEach((item: any) => {
        const dateKey = getLocalDateKey(item.logged_at);
        if (dateKey && !uniqueSleepsMap.has(dateKey)) uniqueSleepsMap.set(dateKey, item);
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

      // Deduplicate steps by date (keep latest per local calendar date)
      const uniqueStepsMap = new Map<string, any>();
      (stepData || []).forEach((item: any) => {
        const dateKey = getLocalDateKey(item.logged_at);
        if (dateKey && !uniqueStepsMap.has(dateKey)) uniqueStepsMap.set(dateKey, item);
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

  const fetchPairedDevices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vigor_paired_devices')
        .select('*')
        .eq('user_id', user.id);
      if (error && error.code !== 'PGRST116') throw error;
      setPairedDevices(data || []);
    } catch (err) {
      console.error('Error fetching paired devices:', err);
    }
  }, [user.id]);

  // Load profile and logs on start
  useEffect(() => {
    fetchProfile();
    fetchPairedDevices();
    fetchLogs();
  }, [fetchProfile, fetchPairedDevices, fetchLogs]);

  // Background Web BLE scanner for Yolanda/Qingniu scales
  useEffect(() => {
    const isNativeMode = window.parent && window.parent !== window;
    if (isNativeMode) {
      // Skip Web Bluetooth scan if running in Tauri native app
      return;
    }

    const isScalePaired = pairedDevices.some(
      d => d.device_type === 'scale' && d.brand === 'Neo Health' && d.model === 'Onyx SE' && d.auto_connect
    );
    const pairedScaleId = localStorage.getItem('vigor_paired_scale_id');
    if (!isScalePaired || !pairedScaleId || autoConnectedDevice) return;

    let scanTimeout: any;

    async function tryAutoConnect() {
      if (!(navigator as any).bluetooth) {
        console.log("Web Bluetooth not supported on this browser.");
        return;
      }

      console.log("Auto-connecting to previously paired scale:", pairedScaleId);
      setBackgroundConnecting(true);

      try {
        // Yolanda/Qingniu scale advertises custom FFF0 service
        const device = await (navigator as any).bluetooth.requestDevice({
          filters: [{ services: ['0000fff0-0000-1000-8000-00805f9b34fb'] }],
          optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb']
        });

        if (device.id === pairedScaleId) {
          console.log("Device found, connecting...");
          const server = await device.gatt?.connect();
          
          if (server) {
            console.log("GATT Server connected!");
            setAutoConnectedDevice(device);

            const service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
            const characteristic = await service.getCharacteristic('0000fff1-0000-1000-8000-00805f9b34fb');
            
            await characteristic.startNotifications();
            console.log("Notifications started!");

            characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
              const value = event.target.value;
              const bytes = new Uint8Array(value.buffer);
              let foundWeight = null;
    
              if (bytes[0] === 0x12 && bytes.length >= 17) {
                const rawW = (bytes[13] << 8 | bytes[14]);
                const w1314 = Math.round((rawW / 28.82) * 100) / 100;
                if (w1314 >= 40 && w1314 <= 150) foundWeight = w1314;
              } else if (bytes.length >= 17) {
                const w1516 = (bytes[15] << 8 | bytes[16]) / 100;
                if (w1516 >= 40 && w1516 <= 150) foundWeight = w1516;
              }
    
              // Heuristic scan for non-0x12 packets
              if (!foundWeight && bytes[0] !== 0x12) {
                if (bytes.length >= 6) {
                  const w34 = (bytes[3] << 8 | bytes[4]) / 100;
                  if (w34 >= 40 && w34 <= 150) foundWeight = w34;
                }
                if (!foundWeight && bytes.length >= 3) {
                  const w12 = (bytes[1] << 8 | bytes[2]) / 100;
                  if (w12 >= 40 && w12 <= 150) foundWeight = w12;
                }
              }

              if (foundWeight) {
                console.log("Auto-connect weight received:", foundWeight);
                setCurrentTab('weight'); // Switch to weight view
                setShowScaleConnect(true);
              }
            });

            device.addEventListener('gattserverdisconnected', () => {
              console.log("Device disconnected!");
              setAutoConnectedDevice(null);
              setBackgroundConnecting(false);
            });
          }
        } else {
          console.log("Found device does not match paired scale ID.");
          setBackgroundConnecting(false);
        }

      } catch (err) {
        console.error("Auto connect failed:", err);
        setBackgroundConnecting(false);
      }
    }

    tryAutoConnect();

    return () => {
      clearTimeout(scanTimeout);
    };
  }, [autoConnectedDevice, pairedDevices]);

  // Listen for native Tauri BLE weight events (direct or forwarded via parent window postMessage)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let unlistenMetrics: (() => void) | null = null;

    async function setupTauriListener() {
      if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
        try {
          const { listen } = await import('@tauri-apps/api/event');
          unlisten = await listen('native-weight-received', (event: any) => {
            const payload = event.payload as { weight: number };
            console.log("Dashboard received native weight from Tauri Rust:", payload.weight);
            sessionStorage.setItem('vigor_last_weight', payload.weight.toString());
            setInitialWeight(payload.weight);
            setCurrentTab('weight'); // Switch to weight tab
            setShowScaleConnect(true);
          });
          unlistenMetrics = await listen('native-metrics-received', (event: any) => {
            const payload = event.payload as { body_fat: number, water: number, impedance: number };
            console.log("Dashboard received native metrics from Tauri Rust:", payload);
            sessionStorage.setItem('vigor_last_metrics', JSON.stringify(payload));
            setInitialMetrics(payload);
          });
        } catch (err) {
          console.error("Failed to setup Tauri native BLE listener:", err);
        }
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'native-weight-received') {
        const weight = event.data.weight;
        console.log("Dashboard received native weight forwarded from parent Hub:", weight);
        sessionStorage.setItem('vigor_last_weight', weight.toString());
        setInitialWeight(weight);
        setCurrentTab('weight'); // Switch to weight tab
        setShowScaleConnect(true);
      } else if (event.data?.type === 'native-metrics-received') {
        const payload = event.data.payload;
        console.log("Dashboard received native metrics forwarded from parent Hub:", payload);
        sessionStorage.setItem('vigor_last_metrics', JSON.stringify(payload));
        setInitialMetrics(payload);
      } else if (event.data?.type === 'refresh-paired-devices') {
        console.log("Dashboard received refresh-paired-devices request");
        fetchPairedDevices();
      }
    };

    setupTauriListener();
    window.addEventListener('message', handleMessage);

    // Notify parent Hub that Vigor is mounted and ready to receive messages
    console.log("Notifying parent Hub that Vigor dashboard is ready");
    window.parent.postMessage({ type: 'vigor-dashboard-ready' }, '*');

    return () => {
      if (unlisten) unlisten();
      if (unlistenMetrics) unlistenMetrics();
      window.removeEventListener('message', handleMessage);
    };
  }, [fetchPairedDevices]);

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
      logged_at: new Date(editDate).toISOString()
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
    const typeNames = { weight: 'gewichtsmeasurement', sleep: 'slaapmeasurement', steps: 'stappenmeasurement' };
    if (window.confirm(`Weet u zeker dat u deze ${typeNames[type]} wilt delete?`)) {
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
        logged_at: new Date(newMeasurement.logged_at).toISOString()
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
      console.error('Error saving measurementen:', err);
      alert('Error saving measurementen.');
    }
  };

  const handleDeleteMeasurement = async (id: string) => {
    if (!confirm('Weet u zeker dat u deze measurement wilt delete?')) return;
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
          logged_at: new Date(photoDate).toISOString(),
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
      alert('Progressfoto succesvol geüpload!');
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert('Error uploading photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photo: any) => {
    if (!confirm('Weet u zeker dat u deze foto wilt delete?')) return;
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
      console.error('Error deleting foto:', err);
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
    return weights.map(w => {
      const weight = parseFloat(w.weight);
      const fat = w.body_fat ? parseFloat(w.body_fat) : null;
      const water = w.water_percent ? parseFloat(w.water_percent) : null;
      const muscle = w.muscle_mass ? parseFloat(w.muscle_mass) : null;
      let other = null;
      if (fat !== null && water !== null) {
        other = Math.max(0, Math.round((100 - fat - water) * 10) / 10);
      }
      return {
        date: new Date(w.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
        weight,
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

  // Handles adding weights via Neo scale BLE
  const handleScaleWeightLogged = async (weight: number, bodyFat?: number, water?: number, muscle?: number) => {
    try {
      const { error } = await supabase.from('vigor_weight').insert({
        user_id: user.id,
        weight,
        body_fat: bodyFat,
        water_percent: water,
        muscle_mass: muscle,
        logged_at: new Date().toISOString()
      });

      if (error) throw error;
      fetchLogs();
    } catch (err) {
      console.error('Error logging weight:', err);
    }
  };

  // Handles saving manual entries (Steps, Sleep, Weight)
  const handleManualSave = async (type: 'weight' | 'sleep' | 'steps', payload: any) => {
    const table = `vigor_${type}`;
    const { error } = await supabase.from(table).insert({
      user_id: user.id,
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
    const heightInMeters = (profile.height || 180) / 100;
    const bmi = latestWeight ? Math.round((latestWeight.weight / (heightInMeters * heightInMeters)) * 10) / 10 : null;
    let bmiCategory = '';
    let bmiColor = '';
    if (bmi) {
      if (bmi < 18.5) { bmiCategory = 'Underweight'; bmiColor = '#3b82f6'; }
      else if (bmi < 25.0) { bmiCategory = 'Healthy Weight'; bmiColor = '#cbd5e1'; }
      else if (bmi < 30.0) { bmiCategory = 'Overweight'; bmiColor = '#f59e0b'; }
      else { bmiCategory = 'Obese'; bmiColor = '#ef4444'; }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">
        
        {/* Quick Metrics Grid */}
        <div className="vigor-grid">
          {/* Card 1: Weight */}
          <div className="vigor-card col-4" style={{ cursor: 'pointer' }} onClick={() => setCurrentTab('weight')}>
            <div className="metric-header">
              <span className="metric-title">Weight</span>
              <div className="metric-icon-wrap" style={{ background: 'rgba(203, 213, 225, 0.08)', border: '1px solid rgba(203, 213, 225, 0.2)' }}>
                <Scale size={18} style={{ color: '#cbd5e1' }} />
              </div>
            </div>
            <div className="metric-value-container">
              <span className="metric-value">{latestWeight ? latestWeight.weight : '--'}</span>
              <span className="metric-unit">kg</span>
            </div>
            {latestWeight && latestWeight.body_fat && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', gap: 12 }}>
                <span>Fat: <strong>{latestWeight.body_fat}%</strong></span>
                {latestWeight.muscle_mass && <span>Muscle: <strong>{latestWeight.muscle_mass}%</strong></span>}
              </div>
            )}
            <div className="metric-footer" style={{ marginTop: latestWeight && latestWeight.body_fat ? 0 : 20 }}>
              <Calendar size={12} />
              <span>
                {latestWeight 
                  ? `Weighed on ${new Date(latestWeight.logged_at).toLocaleDateString('en-US')}`
                  : 'No measurement'}
              </span>
            </div>
          </div>

          {/* Card 2: Steps */}
          <div className="vigor-card col-4" style={{ cursor: 'pointer' }} onClick={() => setCurrentTab('steps')}>
            <div className="metric-header">
              <span className="metric-title">Daily Steps</span>
              <div className="metric-icon-wrap" style={{ background: 'rgba(92, 124, 250, 0.08)', border: '1px solid rgba(92, 124, 250, 0.2)' }}>
                <Footprints size={18} style={{ color: '#5c7cfa' }} />
              </div>
            </div>
            <div className="metric-value-container">
              <span className="metric-value">{currentDailySteps.toLocaleString()}</span>
              <span className="metric-unit">/ {profile.target_steps?.toLocaleString() || '10.000'}</span>
            </div>
            <div style={{ margin: '8px 0 12px' }}>
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
                  : `Today: 0 steps ${latestStepsItem ? `(Last: ${latestStepsItem.step_count.toLocaleString()} on ${new Date(latestStepsItem.logged_at).toLocaleDateString('en-US')})` : ''}`}
              </span>
            </div>
          </div>

          {/* Card 3: Sleep */}
          <div className="vigor-card col-4" style={{ cursor: 'pointer' }} onClick={() => setCurrentTab('sleep')}>
            <div className="metric-header">
              <span className="metric-title">Sleep</span>
              <div className="metric-icon-wrap" style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                <Moon size={18} style={{ color: '#a855f7' }} />
              </div>
            </div>
            <div className="metric-value-container">
              <span className="metric-value">
                {latestSleep ? Math.floor(latestSleep.duration_minutes / 60) : '--'}
              </span>
              <span className="metric-unit">h {latestSleep ? latestSleep.duration_minutes % 60 : ''}m</span>
            </div>
            {latestSleep && latestSleep.quality_score && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                Quality: <strong style={{ color: '#a855f7' }}>{latestSleep.quality_score}/100</strong>
              </div>
            )}
            <div className="metric-footer" style={{ marginTop: latestSleep && latestSleep.quality_score ? 0 : 20 }}>
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
                  Calculated based on your height of <strong>{profile.height} cm</strong> and your latest weight measurement.
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
                <span style={{ fontWeight: 800, color: '#5c7cfa' }}>{profile.target_steps ? profile.target_steps.toLocaleString() : '10.000'} steps</span>
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
                <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '1.5px' }}>
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
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Start</span>
                <strong style={{ fontSize: 16, color: '#fff', fontWeight: 800 }}>{goalProgress.oldestWeight} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>kg</span></strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Current</span>
                <strong style={{ fontSize: 16, color: '#fff', fontWeight: 800 }}>{goalProgress.currentWeight} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>kg</span></strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Rate</span>
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
              <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', margin: 0 }}>
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" domain={['dataMin - 2', 'dataMax + 2']} fontSize={10} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ background: '#1c1c23', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: '#fff' }}
                      labelStyle={{ fontWeight: 800, color: '#cbd5e1', marginBottom: 4 }}
                    />
                    {profile.target_weight && (
                      <ReferenceLine y={profile.target_weight} stroke="rgba(239, 68, 68, 0.4)" strokeDasharray="3 3" label={{ value: `Goal: ${profile.target_weight}kg`, fill: '#ef4444', fontSize: 9, position: 'right' }} />
                    )}
                    <Line type="monotone" dataKey="weight" stroke="#cbd5e1" strokeWidth={2.5} dot={{ r: 4, stroke: '#cbd5e1', strokeWidth: 1.5, fill: '#09090b' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Body Composition trend chart */}
          <div className="vigor-card col-6" style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', margin: 0 }}>
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" domain={[0, 100]} fontSize={10} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ background: '#1c1c23', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: '#fff' }}
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
          <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 20 }}>
            Weight Measurements History
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th style={{ padding: '8px 12px' }}>Date</th>
                  <th style={{ padding: '8px 12px' }}>Weight</th>
                  <th style={{ padding: '8px 12px' }}>Vet %</th>
                  <th style={{ padding: '8px 12px' }}>Vocht %</th>
                  <th style={{ padding: '8px 12px' }}>Spier %</th>
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
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No weight measurements logged.</td>
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
      body_fat_pct: 'Vetpercentage (%)',
      muscle_mass_kg: 'Muscle Mass (kg)',
      waist_cm: 'Waistomtrek (cm)',
      chest_cm: 'Chestomtrek (cm)',
      shoulders_cm: 'Schouderomtrek (cm)',
      hips_cm: 'Heupomtrek (cm)',
      biceps_l_cm: 'Left Bicepsinks (cm)',
      biceps_r_cm: 'Right Bicepsechts (cm)',
      thigh_l_cm: 'Bovenbeen Links (cm)',
      thigh_r_cm: 'Bovenbeen Rechts (cm)',
      calves_l_cm: 'Kuit Links (cm)',
      calves_r_cm: 'Kuit Rechts (cm)',
      neck_cm: 'Neckomtrek (cm)'
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
            Progressfoto's
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
              <h3 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.8px', marginBottom: 20 }}>
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
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Vetpercentage (%)</label>
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
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Chest (cm)</label>
                    <input 
                      type="number" 
                      step="any"
                      placeholder="Chest"
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
                      placeholder="Shoulders"
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
                      placeholder="Left Biceps"
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
                      placeholder="Right Biceps"
                      className="form-input" 
                      value={newMeasurement.biceps_r_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, biceps_r_cm: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Left Thigh (cm)</label>
                    <input 
                      type="number" 
                      step="any"
                      placeholder="Thigh L"
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
                      placeholder="Thigh R"
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
                      placeholder="Calf L"
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
                      placeholder="Calf R"
                      className="form-input" 
                      value={newMeasurement.calves_r_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, calves_r_cm: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Hips (cm)</label>
                    <input 
                      type="number" 
                      step="any"
                      placeholder="Hips"
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
                      placeholder="Neck"
                      className="form-input" 
                      value={newMeasurement.neck_cm}
                      onChange={e => setNewMeasurement({ ...newMeasurement, neck_cm: e.target.value })}
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
                <h3 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.8px', margin: 0 }}>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="dateStr" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" domain={['auto', 'auto']} />
                      <Tooltip 
                        contentStyle={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                        labelStyle={{ color: '#fff', fontSize: 11, fontWeight: 700 }}
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
              <h3 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.8px', marginBottom: 20 }}>
                Historical Measurements Log
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Vet %</th>
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
                        <td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No body measurements recorded.
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
                onClick={() => handleRequestProModal("Progress Photos & Comparer", "Upload maandelijks foto's en vergelijk je fysieke transformatie direct Side-by-Side with de interactieve slider.")} 
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
              <h3 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.8px', marginBottom: 20 }}>
                Upload Photo
              </h3>
              <form onSubmit={handleUploadPhoto} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Select Photo</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => setPhotoFile(e.target.files ? e.target.files[0] : null)}
                    required
                    style={{ fontSize: 11, color: 'var(--text-muted)' }}
                  />
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
              <h3 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.8px', marginBottom: 20 }}>
                Photo Library
              </h3>
              
              {photos.length === 0 ? (
                <div style={{ height: '80%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No progress photos uploaded.
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
                <h3 style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.8px', margin: 0 }}>
                  Side-by-Side Progress Vergelijker
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
                        {photo1Url && <img src={photo1Url} alt="Foto 1 comparison" style={{ width: '100%', height: 350, objectFit: 'contain' }} />}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                        Older status
                      </div>
                    </div>
                    <div style={{ flex: 1, maxWidth: 450, textAlign: 'center' }}>
                      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#000' }}>
                        {photo2Url && <img src={photo2Url} alt="Foto 2 comparison" style={{ width: '100%', height: 350, objectFit: 'contain' }} />}
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
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Connect your Colmi Smart Ring and unlock your Deep Sleep, REM & Recovery Scores (PRO).</div>
                </div>
                <button 
                  onClick={() => handleRequestProModal('Sleep Stages Breakdown', 'View your exact deep sleep, REM sleep, and light sleep percentages from your Colmi Smart Ring.')} 
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
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#a855f7', marginBottom: 4 }}>🟣 Deep Sleep</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{Math.floor(deepMins / 60)}h {deepMins % 60}m</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{deepPct}% (Muscle recovery)</div>
                  </div>

                  <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '12px', borderRadius: 10, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#60a5fa', marginBottom: 4 }}>🔵 Light Sleep</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{Math.floor(lightMins / 60)}h {lightMins % 60}m</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{lightPct}% (Memory)</div>
                  </div>

                  <div style={{ background: 'rgba(236, 72, 153, 0.08)', padding: '12px', borderRadius: 10, border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#f472b6', marginBottom: 4 }}>💖 REM Sleep</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{Math.floor(remMins / 60)}h {remMins % 60}m</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{remPct}% (Mental Energy)</div>
                  </div>

                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '12px', borderRadius: 10, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#fbbf24', marginBottom: 4 }}>🟡 Awake</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{awakeMins}m</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{awakePct}% (Micro-awakenings)</div>
                  </div>
                </div>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ background: '#1c1c23', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: '#fff' }}
                    labelStyle={{ fontWeight: 800, color: '#a855f7', marginBottom: 4 }}
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
                  const sDur = s.duration_minutes || 450;
                  const sDeep = s.deep_minutes || Math.round(sDur * 0.25);
                  const sLight = s.light_minutes || Math.round(sDur * 0.55);
                  const sRem = s.rem_minutes || Math.round(sDur * 0.18);
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{new Date(s.logged_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: '#a855f7' }}>{Math.floor(sDur / 60)}h {sDur % 60}m</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 11 }}>
                        <span style={{ color: '#a855f7', fontWeight: 700 }}>{Math.floor(sDeep/60)}h{sDeep%60}m</span> / <span style={{ color: '#60a5fa' }}>{Math.floor(sLight/60)}h{sLight%60}m</span> / <span style={{ color: '#f472b6' }}>{Math.floor(sRem/60)}h{sRem%60}m</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{s.quality_score ? s.quality_score + '/100' : '82/100'}</td>
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
            <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', margin: 0 }}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ background: '#1c1c23', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12, color: '#fff' }}
                    labelStyle={{ fontWeight: 800, color: '#5c7cfa', marginBottom: 4 }}
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
          <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 20 }}>
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
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: '#5c7cfa' }}>{s.step_count.toLocaleString()} steps</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button onClick={() => handleEditClick('steps', s)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, marginRight: 8, height: 'auto' }}>Edit</button>
                      <button onClick={() => handleDeleteLog('steps', s.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', height: 'auto' }}>Delete</button>
                    </td>
                  </tr>
                ))}
                {steps.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No step logs recorded.</td>
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

      {/* Header section */}
      <header className="vigor-header animate-slide-down" style={{ 
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
        <div className="vigor-brand">
          <div>
            <h1 className="zh-hub-title" style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '0.5px', lineHeight: '1.2' }}>
              ZENITH <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>VIGOR</span>
            </h1>
            <p className="zh-hub-subtitle" style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
              Health & Vitality Tracker for {userName}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => setShowSettings(true)} className="vigor-nav-btn" style={{ background: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.08)' }}>
            <Settings size={15} /> Set Goals
          </button>
          
          <button onClick={() => setShowManualLog(true)} className="btn-secondary" style={{ padding: '10px 18px', fontSize: 13, height: '40px' }}>
            <Plus size={16} /> Log Manually
          </button>
        </div>
      </header>

      {/* Navigation tabs bar */}
      <nav style={{ 
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
        <button 
          onClick={() => setCurrentTab('home')} 
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid ' + (currentTab === 'home' ? 'rgba(203, 213, 225, 0.25)' : 'transparent'),
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: currentTab === 'home' ? 'rgba(203, 213, 225, 0.08)' : 'transparent',
            color: currentTab === 'home' ? '#fff' : 'var(--text-muted)'
          }}
        >
          <Sparkles size={16} style={{ color: currentTab === 'home' ? '#cbd5e1' : 'inherit' }} /> Overview
        </button>
        <button 
          onClick={() => setCurrentTab('weight')} 
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid ' + (currentTab === 'weight' ? 'rgba(57, 255, 20, 0.2)' : 'transparent'),
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: currentTab === 'weight' ? 'rgba(203, 213, 225, 0.06)' : 'transparent',
            color: currentTab === 'weight' ? '#cbd5e1' : 'var(--text-muted)'
          }}
        >
          <Scale size={16} /> Weight
        </button>
        <button 
          onClick={() => setCurrentTab('steps')} 
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid ' + (currentTab === 'steps' ? 'rgba(92, 124, 250, 0.2)' : 'transparent'),
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: currentTab === 'steps' ? 'rgba(92, 124, 250, 0.06)' : 'transparent',
            color: currentTab === 'steps' ? '#5c7cfa' : 'var(--text-muted)'
          }}
        >
          <Footprints size={16} /> Steps
        </button>
        <button 
          onClick={() => setCurrentTab('sleep')} 
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid ' + (currentTab === 'sleep' ? 'rgba(168, 85, 247, 0.2)' : 'transparent'),
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: currentTab === 'sleep' ? 'rgba(168, 85, 247, 0.06)' : 'transparent',
            color: currentTab === 'sleep' ? '#a855f7' : 'var(--text-muted)'
          }}
        >
          <Moon size={16} /> Sleep
        </button>
        <button 
          onClick={() => setCurrentTab('progress')} 
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid ' + (currentTab === 'progress' ? 'rgba(255, 159, 67, 0.2)' : 'transparent'),
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: currentTab === 'progress' ? 'rgba(255, 159, 67, 0.06)' : 'transparent',
            color: currentTab === 'progress' ? '#ff9f43' : 'var(--text-muted)'
          }}
        >
          <Camera size={16} /> Progress
        </button>
      </nav>

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
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', marginBottom: 6 }}>🟣 Deep Sleep</div>
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
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', marginBottom: 6 }}>🔵 Light Sleep</div>
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
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: 6 }}>💖 REM Sleep</div>
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
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', marginBottom: 6 }}>🟡 Awake</div>
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

      {showDeviceManager && (
        <DeviceManagerModal 
          userId={user.id}
          onClose={() => {
            setShowDeviceManager(false);
            fetchLogs();
          }}
          fitnessProfile={dbProfile || user.user_metadata?.fitness_profile || {}}
          onDevicesUpdated={fetchPairedDevices}
        />
      )}

      {showScaleConnect && (
        <WeightScaleConnector 
          onClose={() => {
            setShowScaleConnect(false);
            setInitialWeight(null);
            setInitialMetrics(null);
            sessionStorage.removeItem('vigor_last_weight');
            sessionStorage.removeItem('vigor_last_metrics');
          }}
          onWeightLogged={handleScaleWeightLogged}
          autoConnectDevice={autoConnectedDevice}
          initialWeight={initialWeight}
          initialMetrics={initialMetrics}
          fitnessProfile={dbProfile || user.user_metadata?.fitness_profile || {}}
          scaleModel={pairedDevices.find(d => d.device_type === 'scale')?.model}
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
