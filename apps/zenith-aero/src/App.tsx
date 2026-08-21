import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import { FitnessProfile } from './types/workout';
import { useSavedLocations } from './hooks/useSavedLocations';
import { useRoutePlanner } from './hooks/useRoutePlanner';
import { Activity, Brain, Compass, Settings, LayoutDashboard, Bike, Map as MapIcon, Trophy, Upload, Loader2 } from 'lucide-react';
import { AppTitlebar } from './components/layout/AppTitlebar';
import { RoutePage } from './components/route/RoutePage';

import { getAllRideSummaries, getAllRidesFull, saveRide, getAllGear } from './utils/db';
import { parseFIT, isFITFile } from './utils/fitParser';
import { parseGPX } from './utils/gpxParser';
import { autoSaveRideToGDrive } from './utils/export';

import { RideSummaryWithBests } from './types/workout';
import { computeRide, getWeightForDate, estimateGlobalFTP } from './utils/rideMetrics';
import { lazy, Suspense } from 'react';

const WorkoutDashboard = lazy(() => import('./pages/WorkoutDashboard'));
const RidePage = lazy(() => import('./pages/RidePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })));
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandPalette, CommandItem } from './components/CommandPalette';
import { ProPaywallModal } from './components/common/ProPaywallModal';
import { calibrateSummaryModels, calibrateFullModels, analyzeCardiacDrift, initializeModels } from './utils/localNeuralNet';
import { supabase } from './utils/supabaseClient';
import { isTrustedZenithOrigin, ExtensionSessionGate } from '@zenith/shared';
import { planWorkoutInCalendar } from './utils/trainingHelpers';
import './index.css';


function App() {
  const isIframe = window.self !== window.top;
  const [session, setSession] = useState<any>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const isPro = useMemo(() => {
    if (!session?.user) return false;
    const email = session.user.email?.toLowerCase();
    if (email === 'filip.monbaillieu.24@gmail.com') return true;
    return session.user.user_metadata?.is_pro === true;
  }, [session]);

  const [proModal, setProModal] = useState<{ isOpen: boolean; featureName?: string; desc?: string }>({ isOpen: false });

  const handleRequestProModal = useCallback((featureName: string, desc: string) => {
    setProModal({ isOpen: true, featureName, desc });
  }, []);

  const loadAeroProfile = useCallback(async (userId: string, userMetadata: any) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      // ── Fetch the latest weight measurement and history from Vigor weight logs ──
      let latestVigorWeight: number | null = null;
      let latestVigorBodyFat: number | null = null;
      let vigorWeightHistory: { date: string; weight: number }[] = [];
      try {
        const { data: allWeightLogs, error: weightErr } = await supabase
          .from('vigor_weight')
          .select('weight, body_fat, logged_at')
          .eq('user_id', userId)
          .order('logged_at', { ascending: false });

        if (!weightErr && allWeightLogs) {
          if (allWeightLogs.length > 0) {
            latestVigorWeight = Number(allWeightLogs[0].weight);
            if (allWeightLogs[0].body_fat) {
              latestVigorBodyFat = Number(allWeightLogs[0].body_fat);
            }
          }
          vigorWeightHistory = allWeightLogs.map(row => ({
            date: row.logged_at.slice(0, 10),
            weight: Number(row.weight)
          }));
        }
      } catch (err) {
        console.error('Could not fetch weight from Vigor:', err);
      }

      const withaProfile = userMetadata?.fitness_profile || {};

      if (data) {
        const loadedProfile = {
          name: data.name || withaProfile.name || 'Atleet',
          gender: data.gender || withaProfile.gender,
          birthDate: data.birth_date || withaProfile.birthDate,
          height: data.height_cm || withaProfile.height,
          weight: latestVigorWeight !== null ? latestVigorWeight : (data.weight_kg || withaProfile.weight),
          bodyFat: latestVigorBodyFat !== null ? latestVigorBodyFat : withaProfile.bodyFat,
          ftp: data.ftp_watts || withaProfile.ftp || 220,
          lthr: data.lthr_bpm || withaProfile.lthr || 165,
          trainingGoal: data.training_goal || withaProfile.trainingGoal || 'general',
          weightHistory: vigorWeightHistory.length > 0 ? vigorWeightHistory : (withaProfile.weightHistory || []),
          autoEFTP: true,
          autoLTHR: true
        };
        setFitnessProfile(loadedProfile);
        localStorage.setItem('cyclo_fitness_profile', JSON.stringify(loadedProfile));
      } else {
        const fallback = {
          ...withaProfile,
          weight: latestVigorWeight !== null ? latestVigorWeight : withaProfile.weight,
          bodyFat: latestVigorBodyFat !== null ? latestVigorBodyFat : withaProfile.bodyFat,
          weightHistory: vigorWeightHistory.length > 0 ? vigorWeightHistory : (withaProfile.weightHistory || [])
        };
        setFitnessProfile(fallback);
        localStorage.setItem('cyclo_fitness_profile', JSON.stringify(fallback));
      }
    } catch (e) {
      console.error("Error loading Aero profile:", e);
      const fallback = userMetadata?.fitness_profile || {};
      setFitnessProfile(fallback);
    }
  }, []);

  useEffect(() => {
    // Check if session details are passed in the URL hash (dev mode SSO)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token }).then(({ data }) => {
          setSession(data.session);
          setSessionLoading(false);
          if (data.session?.user) {
            loadAeroProfile(data.session.user.id, data.session.user.user_metadata);
            initializeModels(supabase, data.session.user.id).catch(console.error);
          }
          // Clear hash from URL
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          setSession(session);
          if (session?.user) {
            loadAeroProfile(session.user.id, session.user.user_metadata);
            initializeModels(supabase, session.user.id).catch(console.error);
          }
        });
        return () => subscription.unsubscribe();
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionLoading(false);
      if (session?.user) {
        loadAeroProfile(session.user.id, session.user.user_metadata);
        initializeModels(supabase, session.user.id).catch(console.error);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadAeroProfile(session.user.id, session.user.user_metadata);
        initializeModels(supabase, session.user.id).catch(console.error);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadAeroProfile]);

  // Saved locations (persisted in localStorage)
  const { locations: savedLocations, save: saveLocation, remove: deleteLocation, rename: renameLocation } = useSavedLocations();

  interface ProposedChanges {
    rideName: string;
    ftp?: { current: number; proposed: number };
    lthr?: { current: number; proposed: number };
    maxHR?: { current: number; proposed: number };
  }

  // File upload states
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [activeProposal, setActiveProposal] = useState<ProposedChanges | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Tab navigation ──────────────────────────────────────────────────────────
  type AppTab = 'hub' | 'cyclopilot' | 'dashboard' | 'rides' | 'calendar' | 'prs' | 'heatmap' | 'route' | 'training' | 'settings';
  const [activeTab,      setActiveTab]      = useState<AppTab>('dashboard');
  
  // ── Fitness profile (persisted in localStorage) ─────────────────────────────
  const [fitnessProfile, setFitnessProfile] = useState<FitnessProfile>(() => {
    try {
      const stored = localStorage.getItem('cyclo_fitness_profile');
      return stored ? JSON.parse(stored) : { autoEFTP: true, autoLTHR: true };
    } catch { return { autoEFTP: true, autoLTHR: true }; }
  });

  const handleProfileChange = async (p: FitnessProfile) => {
    const oldWeight = fitnessProfile.weight;
    setFitnessProfile(p);
    localStorage.setItem('cyclo_fitness_profile', JSON.stringify(p));
    if (session?.user) {
      // 1. Update profiles table
      await supabase
        .from('profiles')
        .upsert({
          id: session.user.id,
          name: p.name,
          gender: p.gender || null,
          birth_date: p.birthDate || null,
          height_cm: p.height || null,
          weight_kg: p.weight || null,
          ftp_watts: p.ftp || 220,
          lthr_bpm: p.lthr || 165,
          training_goal: p.trainingGoal || 'general',
          updated_at: new Date().toISOString()
        });

      // 2. Sync user metadata
      const currentMeta = session.user.user_metadata || {};
      await supabase.auth.updateUser({
        data: {
          ...currentMeta,
          fitness_profile: {
            ...(currentMeta.fitness_profile || {}),
            name: p.name,
            gender: p.gender,
            birthDate: p.birthDate,
            height: p.height,
            weight: p.weight,
            ftp: p.ftp,
            lthr: p.lthr,
            trainingGoal: p.trainingGoal,
            weightHistory: p.weightHistory
          }
        }
      });

      // 3. Weight log insertions
      if (p.weight !== undefined && p.weight !== oldWeight) {
        try {
          await supabase.from('vigor_weight').insert({
            user_id: session.user.id,
            weight: p.weight,
            logged_at: new Date().toISOString()
          });
        } catch (err) {
          console.error('Could not save weight to vigor_weight:', err);
        }
      }

      // 4. Weight history additions/deletions sync
      const oldHistory = fitnessProfile.weightHistory || [];
      const newHistory = p.weightHistory || [];

      if (newHistory.length > oldHistory.length) {
        const added = newHistory.find(n => !oldHistory.some(o => o.date === n.date));
        if (added) {
          try {
            await supabase
              .from('vigor_weight')
              .delete()
              .eq('user_id', session.user.id)
              .like('logged_at', `${added.date}%`);

            await supabase.from('vigor_weight').insert({
              user_id: session.user.id,
              weight: added.weight,
              logged_at: new Date(added.date + 'T12:00:00.000Z').toISOString()
            });
          } catch (err) {
            console.error('Error adding weight log to vigor_weight:', err);
          }
        }
      }

      if (newHistory.length < oldHistory.length) {
        const deleted = oldHistory.find(o => !newHistory.some(n => n.date === o.date));
        if (deleted) {
          try {
            await supabase
              .from('vigor_weight')
              .delete()
              .eq('user_id', session.user.id)
              .like('logged_at', `${deleted.date}%`);
          } catch (err) {
            console.error('Error deleting weight log from vigor_weight:', err);
          }
        }
      }
    }
  };
  const [selectedRide,   setSelectedRide]   = useState<string | null>(null);
  const [compareRideId,  setCompareRideId]  = useState<string | null>(null);
  const [activeWorkout,  setActiveWorkout]  = useState<any | null>(null);

  const {
    startPoint,
    endPoint,
    routes,
    activeRouteIndex,
    routeType,
    setRouteType,
    isGenerating,
    error,
    hoverPoint,
    windData,
    windSlot,
    isFetchingWind,
    maxElevationGain,
    setMaxElevationGain,
    exportMsg,
    activeRoutePoints,
    handleMapClick,
    handleSetLocation,
    handleGenerate,
    handleDownloadGPX,
    handleDownloadTCX,
    setActiveRouteIndex,
    setWindSlot,
    setError,
    setHoverPoint,
  } = useRoutePlanner(() => setActiveTab('route'));

  const handleGenerateWithProCheck = useCallback(async (params: any) => {
    if (!isPro) {
      handleRequestProModal('AI Route Generator', 'Upgrade to Zenith Pro to generate automatic custom GPX routes with elevation and wind profiles.');
      return;
    }
    await handleGenerate(params);
  }, [isPro, handleRequestProModal, handleGenerate]);

  const handleDownloadGPXWithProCheck = useCallback(async () => {
    if (!isPro) {
      handleRequestProModal('GPX Route Download', 'Upgrade to Zenith Pro to export your generated routes to GPX for your Garmin or Wahoo bike computer.');
      return;
    }
    await handleDownloadGPX();
  }, [isPro, handleRequestProModal, handleDownloadGPX]);

  const handleDownloadTCXWithProCheck = useCallback(async () => {
    if (!isPro) {
      handleRequestProModal('TCX Route Download', 'Upgrade to Zenith Pro to export your generated routes to TCX with turn-by-turn navigation.');
      return;
    }
    await handleDownloadTCX();
  }, [isPro, handleRequestProModal, handleDownloadTCX]);
  
  const handlePlanWorkoutOnRoute = useCallback(async (date: string, route: any) => {
    if (!activeWorkout) return;
    const durationMin = activeWorkout.blocks.reduce((acc: number, b: any) => acc + b.duration, 0) / 60;
    await planWorkoutInCalendar(activeWorkout, date, durationMin, fitnessProfile, route);
    setActiveWorkout(null);
    setActiveTab('training');
  }, [activeWorkout, fitnessProfile]);

  // Rides & fysiologische recalculate state
  const [rides, setRides] = useState<RideSummaryWithBests[]>([]);
  const [kratosWorkouts, setKratosWorkouts] = useState<any[]>([]);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const [gearWarnings, setGearWarnings] = useState<string[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);




  // ── Listen to message events from parent Zenith Hub to open a specific ride ──
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!isTrustedZenithOrigin(e.origin)) return;
      if (e.data && e.data.type === 'OPEN_RIDE') {
        setSelectedRide(e.data.rideId);
        setActiveTab('dashboard');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // ── Parse openRide query parameter on startup ───────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rideId = params.get('openRide');
    if (rideId) {
      setSelectedRide(rideId);
      setActiveTab('dashboard');
      // Clean up URL query parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('openRide');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);

  // ── Gear maintenance check at startup ────────────────────────────────────────
  useEffect(() => {
    const checkGearMaintenance = async () => {
      try {
        const gears = await getAllGear();
        const warnings: string[] = [];
        for (const gear of gears) {
          for (const comp of gear.components) {
            if (!comp.maxDistance || comp.maxDistance <= 0) continue;
            const pct = (comp.distance / comp.maxDistance) * 100;
            if (pct >= 90) {
              warnings.push(`${gear.name}: ${comp.name} (${Math.round(pct)}% of max km reached)`);
            }
          }
        }
        if (warnings.length > 0) setGearWarnings(warnings);
      } catch (e) {
        console.error('Gear check failed:', e);
      }
    };
    const timer = setTimeout(checkGearMaintenance, 2500);
    return () => clearTimeout(timer);
  }, []);

  // ── Command palette keyboard shortcut (Ctrl+K / Cmd+K) ───────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);








  const reloadRides = useCallback(async () => {
    if (!session) return;
    const data = await getAllRideSummaries();
    setRides(data);
    calibrateSummaryModels(data, fitnessProfile.ftp ?? 220, fitnessProfile.weight ?? 75);
  }, [fitnessProfile.ftp, fitnessProfile.weight, session]);

  const reloadKratosWorkouts = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data, error } = await supabase
        .from('kratos_workouts')
        .select('*')
        .eq('user_id', session.user.id);
      if (!error && data) {
        setKratosWorkouts(data);
      }
    } catch (err) {
      console.error('Could not load Kratos workouts into Aero:', err);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      reloadRides();
      reloadKratosWorkouts();
    }
  }, [reloadRides, reloadKratosWorkouts, session]);

  const profileAge = useMemo(() => {
    if (!fitnessProfile.birthDate) return undefined;
    return Math.floor((Date.now() - new Date(fitnessProfile.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));
  }, [fitnessProfile.birthDate]);

  const globaleFTP = useMemo(() => estimateGlobalFTP(rides.map(r => r.bestEfforts ?? {})), [rides]);

  const handleFiles = useCallback(async (files: FileList) => {
    setUploading(true);
    setUploadMsg(null);
    let ok = 0, fail = 0;
    let pendingProposal: ProposedChanges | null = null;

    for (const file of Array.from(files)) {
      try {
        const buf = await file.arrayBuffer();
        let points;
        if (isFITFile(file.name, buf)) { points = await parseFIT(buf); }
        else { points = parseGPX(new TextDecoder().decode(buf)); }
        const id   = `ride_${file.name}_${Date.now()}`;
        const name = file.name.replace(/\.(fit|gpx|tcx)$/i, '');
        const rideDate = points[0]?.time ?? Date.now();
        const weightForRide = getWeightForDate(fitnessProfile, rideDate);

        const currentFTP = fitnessProfile.ftp ?? globaleFTP ?? 220;
        const currentLTHR = fitnessProfile.lthr ?? 160;
        const currentMaxHR = fitnessProfile.maxHR ?? 190;

        const ride = computeRide(id, name, points, {
          ftp: currentFTP, lthr: currentLTHR, maxHR: currentMaxHR,
          gender: fitnessProfile.gender, age: profileAge, weight: weightForRide,
        });
        await saveRide(ride);
        await autoSaveRideToGDrive(points, name);
        ok++;

        // Collect proposed improvements
        const proposedFTP = (ride.eFTP && ride.eFTP > currentFTP) ? ride.eFTP : undefined;
        const proposedMaxHR = (ride.maxHR && ride.maxHR > currentMaxHR) ? ride.maxHR : undefined;

        const driftResult = analyzeCardiacDrift(
          ride.firstHalfPower ?? 0,
          ride.secondHalfPower ?? 0,
          ride.firstHalfHR ?? 0,
          ride.secondHalfHR ?? 0,
          ride.duration,
          currentLTHR
        );
        const proposedLTHR = driftResult.proposeTuning ? driftResult.proposedLthr : undefined;

        if (proposedFTP || proposedLTHR || proposedMaxHR) {
          pendingProposal = {
            rideName: name,
            ftp: proposedFTP ? { current: currentFTP, proposed: proposedFTP } : undefined,
            lthr: proposedLTHR ? { current: currentLTHR, proposed: proposedLTHR } : undefined,
            maxHR: proposedMaxHR ? { current: currentMaxHR, proposed: proposedMaxHR } : undefined,
          };
        }
      } catch (e) { 
        console.error(e); 
        fail++; 
      }
    }
    
    setUploadMsg({
      text: fail === 0 ? `✓ ${ok} ride${ok !== 1 ? 'ten' : ''} imported` : `${ok} imported, ${fail} failed`,
      ok: fail === 0
    });
    setUploading(false);

    if (pendingProposal) {
      setActiveProposal(pendingProposal);
    }

    // Auto dismiss upload message toast after 4 seconds
    setTimeout(() => {
      setUploadMsg(null);
    }, 4000);

    reloadRides();
  }, [fitnessProfile, profileAge, reloadRides, globaleFTP]);

  const handleRecalculate = useCallback(async () => {
    setRecalculating(true);
    try {
      const allRides = await getAllRidesFull();
      for (const ride of allRides) {
        const rideDate = ride.date ?? Date.now();
        const weightForRide = getWeightForDate(fitnessProfile, rideDate);
        const recomputed = computeRide(ride.id, ride.name, ride.points, {
          ftp: fitnessProfile.ftp ?? globaleFTP,
          lthr: fitnessProfile.lthr,
          maxHR: fitnessProfile.maxHR,
          gender: fitnessProfile.gender,
          age: profileAge,
          weight: weightForRide,
        });
        await saveRide({ ...recomputed, points: ride.points });
      }
      const freshSummaries = await getAllRideSummaries();
      setRides(freshSummaries);
      
      const activeFTP = fitnessProfile.ftp ?? globaleFTP ?? 220;
      const activeWeight = fitnessProfile.weight ?? 75;
      calibrateSummaryModels(freshSummaries, activeFTP, activeWeight);
      calibrateFullModels(freshSummaries, allRides, activeFTP, activeWeight);
    } catch (e) {
      console.error("Error while recalculating rides:", e);
      alert("An error occurred while processing rides: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRecalculating(false);
    }
  }, [fitnessProfile, globaleFTP, profileAge]);

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch (e) {
      console.warn("Tauri window minimize error:", e);
    }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.warn("Tauri window maximize error:", e);
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch (e) {
      console.warn("Tauri window close error:", e);
    }
  };

  // ── Command palette commands ────────────────────────────────────────────
  const paletteCommands = useMemo((): CommandItem[] => [
    { id: 'nav-dashboard', category: 'Navigation', icon: <LayoutDashboard size={14} />, label: 'Performance Dashboard', description: 'View your fitness cockpit and AI analytics', shortcut: '1', action: () => setActiveTab('dashboard') },
    { id: 'nav-rides',     category: 'Navigation', icon: <Bike size={14} />,            label: 'My Rides',              description: 'Complete workout activity archive',            shortcut: '2', action: () => setActiveTab('rides') },
    { id: 'nav-prs',       category: 'Navigation', icon: <Trophy size={14} />,          label: 'Progression & PRs',     description: 'eFTP trends, VO2max, and personal records',    shortcut: '3', action: () => setActiveTab('prs') },
    { id: 'nav-heatmap',   category: 'Navigation', icon: <MapIcon size={14} />,         label: 'Heatmap',               description: 'Geographic rides map',                         shortcut: '4', action: () => setActiveTab('heatmap') },
    { id: 'nav-route',     category: 'Navigation', icon: <Compass size={14} />,         label: 'Route Planner',         description: 'Generate and plan cycling routes',             shortcut: '5', action: () => setActiveTab('route') },
    { id: 'nav-settings',  category: 'Navigation', icon: <Settings size={14} />,        label: 'Settings',              description: 'Manage profile and gear',                      shortcut: '6', action: () => setActiveTab('settings') },
    { id: 'action-recalc', category: 'Actions',    icon: <Activity size={14} />,        label: 'Recalculate all rides', description: 'Apply updated FTP/LTHR to all rides',          action: handleRecalculate },
  ], [handleRecalculate]);

  const navItems = [
    { key: 'dashboard', icon: <LayoutDashboard size={16} strokeWidth={1.6} />, label: 'Dashboard' },
    { key: 'rides',     icon: <Bike            size={16} strokeWidth={1.6} />, label: 'My Rides' },
    { key: 'prs',       icon: <Trophy          size={16} strokeWidth={1.6} />, label: 'Progression & PRs' },
    { key: 'heatmap',   icon: <MapIcon         size={16} strokeWidth={1.6} />, label: 'Heatmap' },
    { key: 'route',     icon: <Compass         size={16} strokeWidth={1.6} />, label: 'Route Planner' },
    { key: 'settings',  icon: <Settings        size={16} strokeWidth={1.6} />, label: 'Settings' },
  ] as const;


  const isDashboardTab = activeTab === 'dashboard' || activeTab === 'rides' || activeTab === 'prs' || activeTab === 'heatmap';

  if (sessionLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: '#09090b' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(203, 213, 225, 0.1)', borderTop: '3px solid #cbd5e1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!session) {
    return <ExtensionSessionGate appName="Aero" icon={<Bike size={28} />} />;
  }

  const userName = session?.user?.user_metadata?.name || fitnessProfile?.name || 'Atleet';
  const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || !!(window as any).__TAURI_METADATA__);

  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>
      {(!isIframe && isTauri) && (
        <AppTitlebar
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
        />
      )}

      {/* ── Export toast ── */}
      {exportMsg && (
        <div className={`export-toast ${exportMsg.ok ? 'export-toast--ok' : 'export-toast--err'}`}>
          {exportMsg.text}
        </div>
      )}

      {/* ── Upload toast ── */}
      {uploadMsg && (
        <div className={`upload-toast ${uploadMsg.ok ? 'upload-toast--ok' : 'upload-toast--err'}`}>
          {uploading ? <Loader2 className="animate-spin" size={14} /> : <span>📥</span>}
          <span>{uploadMsg.text}</span>
        </div>
      )}

      {/* Fitness Profile Tuning Proposal Modal */}
      {activeProposal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(9, 9, 11, 0.85)',
          backdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: 'rgba(23, 23, 27, 0.9)',
            border: '1px solid rgba(203, 213, 225, 0.15)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5), 0 0 15px rgba(203, 213, 225, 0.05)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            color: '#f8fafc',
            boxSizing: 'border-box'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: 'rgba(203, 213, 225, 0.1)',
                padding: '8px',
                borderRadius: '12px',
                border: '1px solid rgba(203, 213, 225, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Brain size={24} color="#cbd5e1" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>
                  🎉 AI Fitheidsverbetering Gevonden!
                </h3>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Ride Analysis: <strong>{activeProposal.rideName}</strong>
                </span>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
              Your latest activity demonstrates improved physiological metrics. Would you like to update your athlete profile and heart rate/power zones?
            </p>

            {/* Proposals List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeProposal.ftp && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9' }}>Thresholdvermogen (FTP)</span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>Calculated based on ride peak efforts</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: 12, color: '#64748b', textDecoration: 'line-through' }}>{activeProposal.ftp.current} W</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#cbd5e1' }}>{activeProposal.ftp.proposed} W</span>
                    <span style={{
                      background: 'rgba(34, 197, 94, 0.1)',
                      color: '#4ade80',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '6px'
                    }}>
                      +{activeProposal.ftp.proposed - activeProposal.ftp.current} W
                    </span>
                  </div>
                </div>
              )}

              {activeProposal.lthr && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9' }}>Thresholdhartslag (LTHR)</span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>Cardiale drift & decoupling analyse</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: 12, color: '#64748b', textDecoration: 'line-through' }}>{activeProposal.lthr.current} bpm</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#cbd5e1' }}>{activeProposal.lthr.proposed} bpm</span>
                    <span style={{
                      background: activeProposal.lthr.proposed > activeProposal.lthr.current ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: activeProposal.lthr.proposed > activeProposal.lthr.current ? '#4ade80' : '#f87171',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '6px'
                    }}>
                      {activeProposal.lthr.proposed > activeProposal.lthr.current ? '+' : ''}{activeProposal.lthr.proposed - activeProposal.lthr.current} bpm
                    </span>
                  </div>
                </div>
              )}

              {activeProposal.maxHR && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9' }}>Maximum Heart Rate (Max HR)</span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>New peak heart rate registered</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: 12, color: '#64748b', textDecoration: 'line-through' }}>{activeProposal.maxHR.current} bpm</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#cbd5e1' }}>{activeProposal.maxHR.proposed} bpm</span>
                    <span style={{
                      background: 'rgba(34, 197, 94, 0.1)',
                      color: '#4ade80',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '6px'
                    }}>
                      +{activeProposal.maxHR.proposed - activeProposal.maxHR.current} bpm
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={() => {
                  const updatedProfile = { ...fitnessProfile };
                  if (activeProposal.ftp) updatedProfile.ftp = activeProposal.ftp.proposed;
                  if (activeProposal.lthr) updatedProfile.lthr = activeProposal.lthr.proposed;
                  if (activeProposal.maxHR) updatedProfile.maxHR = activeProposal.maxHR.proposed;
                  handleProfileChange(updatedProfile);
                  setActiveProposal(null);
                  handleRecalculate();
                }}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #cbd5e1, #6c5ce7)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 11,
                  padding: '12px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  boxShadow: '0 0 12px rgba(203, 213, 225, 0.15)',
                  fontFamily: 'inheride'
                }}
              >
                Accepteren & zones updaten
              </button>
              <button
                onClick={() => setActiveProposal(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  fontWeight: 700,
                  fontSize: 11,
                  padding: '12px 18px',
                  cursor: 'pointer',
                  fontFamily: 'inheride'
                }}
              >
                Negeren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Layout containing Topbar and Viewport - pushed down by 32px for window drag region titlebar only in Tauri */}
      <div className="wd-app" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100vw', paddingTop: (isIframe || !isTauri) ? '0px' : '32px' }}>
        {/* Horizontal Topbar Header */}
        {activeTab !== 'hub' && activeTab !== 'cyclopilot' && (
          <>
            <header className="wd-topbar" style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)', 
              padding: '16px 24px', 
              background: 'transparent',
              height: '70px',
              boxSizing: 'border-box',
              flexShrink: 0,
              marginBottom: '24px',
              webkitAppRegion: 'no-drag'
            } as any}>
              <div>
                <h1 className="zh-hub-title" style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '0.5px', lineHeight: '1.2' }}>
                  ZENITH <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>AERO</span>
                </h1>
                <p className="zh-hub-subtitle" style={{ fontSize: '9px', color: 'var(--text-muted)', margin: '4px 0 0', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Desktop & Analytics for {userName}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Sleek Header Upload Button */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="wd-topbar-upload-btn"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    background: 'rgba(255, 255, 255, 0.03)', 
                    border: '1px solid rgba(255, 255, 255, 0.08)', 
                    borderRadius: 10, 
                    padding: '6px 14px', 
                    cursor: 'pointer', 
                    fontSize: 11, 
                    fontWeight: 700, 
                    color: '#f8fafc',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                >
                  {uploading ? (
                    <Loader2 className="animate-spin" size={13} style={{ color: '#cbd5e1' }} />
                  ) : (
                    <Upload size={13} style={{ color: '#cbd5e1' }} />
                  )}
                  <span>{uploading ? 'Uploading...' : 'Import Ride'}</span>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".fit,.gpx,.tcx"
                    hidden
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                  />
                </div>

                {gearWarnings.length > 0 && (
                  <div
                    onClick={() => setActiveTab('settings')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(253,203,110,0.1)', border: '1px solid rgba(253,203,110,0.25)', borderRadius: 7, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#fdcb6e' }}
                  >
                    <span>🔧</span>
                    <span>Maintenance Required!</span>
                  </div>
                )}
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
              margin: '16px 24px 24px',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)'
            }}>
              {navItems.map(item => (
                <button
                  key={item.key}
                  className={`kratos-nav-btn ${activeTab === item.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.key)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
          </>
        )}

        {/* Viewport content */}
        <main className="wd-main">

          {/* Dynamic Content Switching */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: (activeTab === 'route' || selectedRide) ? 'hidden' : 'auto' }}>
            <Suspense fallback={<div className="p-8 text-center text-zinc-400">Laden...</div>}>
            {/* ── Zenith Ecosystem Hub View & Pilot View are handled in Zenith Hub ── */}

            {/* ── Analytics & History Views ── */}
            {isDashboardTab && (
              <div className="workout-tab-content" style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, height: selectedRide ? '100%' : 'auto', overflowY: selectedRide ? 'hidden' : 'visible' }}>
                {!selectedRide ? (
                  <WorkoutDashboard
                    onSelectRide={id => setSelectedRide(id)}
                    selectedRideId={selectedRide}
                    compareRideId={compareRideId}
                    onCompareRide={id => setCompareRideId(prev => prev === id ? null : id)}
                    profile={fitnessProfile}
                    rideIsOpen={!!selectedRide}
                    rides={rides}
                    kratosWorkouts={kratosWorkouts}
                    reloadRides={reloadRides}
                    globaleFTP={globaleFTP ?? 220}
                    recalculating={recalculating}
                    navSection={activeTab as any}
                    onHandleFiles={handleFiles}
                    isPro={isPro}
                    onRequestProModal={handleRequestProModal}
                  />
                ) : (
                  <>
                    {/* Full-screen single ride */}
                    {!compareRideId && (
                      <div className="wd-detail-panel wd-detail-panel--full" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', width: '100%' }}>
                        <ErrorBoundary>
                          <RidePage
                            rideId={selectedRide}
                            onBack={() => setSelectedRide(null)}
                            profile={fitnessProfile}
                            onChange={reloadRides}
                          />
                        </ErrorBoundary>
                      </div>
                    )}

                    {/* Split-screen compare */}
                    {compareRideId && (
                      <div className="wd-compare-split" style={{ flex: 1, display: 'flex', minHeight: 0, height: '100%', width: '100%' }}>
                        <div className="wd-compare-split__pane" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                          <ErrorBoundary>
                            <RidePage
                              rideId={selectedRide}
                              onBack={() => setSelectedRide(null)}
                              profile={fitnessProfile}
                              compareRideId={compareRideId}
                              onChange={reloadRides}
                            />
                          </ErrorBoundary>
                        </div>
                        <div className="wd-compare-split__divider" />
                        <div className="wd-compare-split__pane" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                          <ErrorBoundary>
                            <RidePage
                              rideId={compareRideId}
                              onBack={() => setCompareRideId(null)}
                              profile={fitnessProfile}
                              compareRideId={selectedRide}
                              onChange={reloadRides}
                            />
                          </ErrorBoundary>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Calendar View ── */}
            {activeTab === 'calendar' && (
              <div className="workout-tab-content" style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, height: selectedRide ? '100%' : 'auto', width: '100%', overflowY: selectedRide ? 'hidden' : 'visible' }}>
                {!selectedRide ? (
                  <CalendarPage
                    rides={rides}
                    kratosWorkouts={kratosWorkouts}
                    profile={fitnessProfile}
                    onSelectRide={(id) => setSelectedRide(id)}
                  />
                ) : (
                  <div className="wd-detail-panel wd-detail-panel--full" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', width: '100%' }}>
                    <ErrorBoundary>
                      <RidePage
                        rideId={selectedRide}
                        onBack={() => setSelectedRide(null)}
                        profile={fitnessProfile}
                        onChange={reloadRides}
                      />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            )}



            {/* ── Settings View ── */}
            {activeTab === 'settings' && (
              <div className="workout-tab-content" style={{ height: 'auto', overflow: 'visible' }}>
                <SettingsPage
                  profile={fitnessProfile}
                  onProfileChange={handleProfileChange}
                  globaleFTP={globaleFTP}
                  onRecalculate={handleRecalculate}
                  recalculating={recalculating}
                />
              </div>
            )}

            {/* ── Route Planner View ── */}
            {activeTab === 'route' && (
              <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0 }}>
                <RoutePage
                  fitnessProfile={fitnessProfile}
                  savedLocations={savedLocations}
                  onSaveLocation={saveLocation}
                  onDeleteLocation={deleteLocation}
                  onRenameLocation={renameLocation}
                  startPoint={startPoint}
                  endPoint={endPoint}
                  routes={routes}
                  activeRouteIndex={activeRouteIndex}
                  routeType={routeType}
                  setRouteType={setRouteType}
                  isGenerating={isGenerating}
                  error={error}
                  hoverPoint={hoverPoint}
                  windData={windData}
                  windSlot={windSlot}
                  isFetchingWind={isFetchingWind}
                  maxElevationGain={maxElevationGain}
                  setMaxElevationGain={setMaxElevationGain}
                  activeRoutePoints={activeRoutePoints}
                  onSetLocation={handleSetLocation}
                  onGenerate={handleGenerateWithProCheck}
                  onDownloadGPX={handleDownloadGPXWithProCheck}
                  onDownloadTCX={handleDownloadTCXWithProCheck}
                  onMapClick={handleMapClick}
                  onSelectRoute={setActiveRouteIndex}
                  setWindSlot={setWindSlot}
                  onCloseError={() => setError(null)}
                  onHoverPoint={setHoverPoint}
                  activeWorkout={activeWorkout}
                  onPlanWorkout={handlePlanWorkoutOnRoute}
                  isPro={isPro}
                  onRequestProModal={handleRequestProModal}
                />
              </div>
            )}
            </Suspense>
          </div>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={paletteCommands}
      />

      {/* Zenith Pro Paywall Modal */}
      <ProPaywallModal
        isOpen={proModal.isOpen}
        onClose={() => setProModal({ isOpen: false })}
        featureName={proModal.featureName}
        featureDescription={proModal.desc}
      />
    </div>
  );
}

export default App;
