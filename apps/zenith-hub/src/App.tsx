import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from './utils/supabaseClient';

const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ZenithHubPage = lazy(() => import('./pages/hub/ZenithHubPage').then(m => ({ default: m.ZenithHubPage })));
const CalendarPage = lazy(() => import('./pages/hub/CalendarPage').then(m => ({ default: m.CalendarPage })));
const PilotPanel = lazy(() => import('./pages/hub/PilotPanel').then(m => ({ default: m.PilotPanel })));
const ProfilePage = lazy(() => import('./pages/hub/ProfilePage').then(m => ({ default: m.ProfilePage })));
const SystemConsolePage = lazy(() => import('./pages/hub/SystemConsolePage').then(m => ({ default: m.SystemConsolePage })));
const IntegrationsPage = lazy(() => import('./pages/hub/IntegrationsPage').then(m => ({ default: m.IntegrationsPage })));
const ZenithLandingPage = lazy(() => import('./pages/marketing/ZenithLandingPage').then(m => ({ default: m.ZenithLandingPage })));
const PricingPage = lazy(() => import('./pages/marketing/PricingPage').then(m => ({ default: m.PricingPage })));
const FeatureRequestsPage = lazy(() => import('./pages/community/FeatureRequestsPage').then(m => ({ default: m.FeatureRequestsPage })));

import { loggerService } from './utils/loggerService';
import { Sidebar, TabKey } from './components/Sidebar';
import { computePMC } from './utils/pmc';
import { recoveryModel, syncPhoneDataToEcosystem, isTrustedZenithOrigin } from '@zenith/shared';
import './App.css';
import { AppTitlebar } from './components/AppTitlebar';
import { BugReportModal, BugReportSubmitData } from './components/BugReportModal';
import { OnboardingModal } from './components/OnboardingModal';
import { AccountConfirmedModal } from './components/AccountConfirmedModal';

const EXTENSION_TABS = new Set<TabKey>(['aero', 'vigor', 'kratos', 'fuel', 'stride']);

function App() {
  const [session, setSession] = useState<any>(null);
  const sessionRef = useRef<any>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Automatic 15-minute background sync with local Health Connect HTTP server
  useEffect(() => {
    if (!session?.user?.id) return;
    const activeUserId = session.user.id;

    // Run initial sync on app load
    syncPhoneDataToEcosystem(activeUserId).then((res: any) => {
      if (res.success) {
        console.log(`[Zenith Auto-Sync] Initial Health Connect sync completed: ${res.stepsCount} steps, ${res.exerciseCount} exercises, ${res.sleepCount} sleep records.`);
      }
    });

    // Schedule automatic sync every 15 minutes (15 * 60 * 1000 = 900,000 ms)
    const intervalId = setInterval(() => {
      console.log("[Zenith Auto-Sync] Running 15-minute background Health Connect sync...");
      syncPhoneDataToEcosystem(activeUserId).then((res: any) => {
        if (res.success) {
          console.log(`[Zenith Auto-Sync] 15-min background sync completed: ${res.stepsCount} steps, ${res.exerciseCount} exercises, ${res.sleepCount} sleep records.`);
        }
      });
    }, 15 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [session?.user?.id]);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAccountConfirmed, setShowAccountConfirmed] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    if (
      hash.includes('type=signup') || 
      hash.includes('type=email_verification') || 
      hash.includes('access_token') ||
      search.includes('account_confirmed=true') ||
      search.includes('type=signup')
    ) {
      setShowAccountConfirmed(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const isPro = useMemo(() => {
    if (!session?.user) return false;
    const email = session.user.email?.toLowerCase();
    if (email === 'filip.monbaillieu.24@gmail.com') return true;
    return session.user.user_metadata?.is_pro === true;
  }, [session]);
  const [activeTab, setActiveTab] = useState<TabKey>('hub');
  // Extension iframes used to all get a real `src` on Hub's very first render,
  // regardless of activeTab — meaning Aero/Vigor/Kratos/Fuel/Stride each fired their
  // own mount-time Supabase queries in the same instant Hub fired its own dashboard
  // queries. On this project's compute tier that synchronized 6-app burst was enough
  // to exhaust the burst-CPU allocation and cause otherwise-trivial queries to time
  // out. Only mounting an iframe the first time its tab is actually visited spreads
  // that load out naturally (nobody switches tabs within the same millisecond), while
  // still satisfying the "stays mounted permanently once loaded" requirement below —
  // it just defers *when* "once loaded" starts.
  const [visitedExtensionTabs, setVisitedExtensionTabs] = useState<Set<TabKey>>(() => new Set());
  useEffect(() => {
    if (EXTENSION_TABS.has(activeTab) && !visitedExtensionTabs.has(activeTab)) {
      setVisitedExtensionTabs(prev => new Set(prev).add(activeTab));
    }
  }, [activeTab, visitedExtensionTabs]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('zenith_sidebar_collapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [rides, setRides] = useState<{ date: number; tss: number }[]>([]);
  const [fitnessProfile, setFitnessProfile] = useState<any>({ name: 'Athlete' });
  const [mlModelsLoaded, setMlModelsLoaded] = useState(false);
  const [pendingRideId, setPendingRideId] = useState<string | null>(null);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [bugPrefilledCategory, setBugPrefilledCategory] = useState<string | null>(null);

  // Helper to inject openRide query param before hash routing
  const getAeroUrl = () => {
    if (!aeroUrl) return '';
    if (pendingRideId) {
      const parts = aeroUrl.split('#');
      const base = parts[0];
      const hash = parts[1] ? `#${parts[1]}` : '';
      const separator = base.includes('?') ? '&' : '?';
      return `${base}${separator}openRide=${pendingRideId}${hash}`;
    }
    return aeroUrl;
  };

  // Update states
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'installing' | 'done' | 'error'>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Check for updates on mount
  useEffect(() => {
    async function checkForUpdates() {
      if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
        try {
          // @ts-ignore
          const { check } = await import(/* @vite-ignore */ '@tauri-apps/plugin-updater');
          console.log("Checking for updates...");
          const update = await check();
          if (update) {
            console.log(`Update available: ${update.version}`);
            setUpdateInfo(update);
            setUpdateStatus('available');
          }
        } catch (err) {
          console.error("Failed to check for updates:", err);
        }
      }
    }
    checkForUpdates();
  }, []);

  const handleStartUpdate = async () => {
    if (!updateInfo) return;
    setUpdateStatus('downloading');
    setDownloadProgress(0);
    try {
      let totalLength = 0;
      let downloaded = 0;

      await updateInfo.downloadAndInstall((event: any) => {
        if (event.event === 'Started') {
          totalLength = event.data.contentLength || 0;
          console.log(`Download started. Size: ${totalLength}`);
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            const percent = Math.round((downloaded / totalLength) * 100);
            setDownloadProgress(percent);
          }
        } else if (event.event === 'Finished') {
          console.log("Download finished.");
        }
      });

      setUpdateStatus('installing');
      setTimeout(async () => {
        try {
          // @ts-ignore
          const { relaunch } = await import(/* @vite-ignore */ '@tauri-apps/plugin-process');
          await relaunch();
        } catch (err) {
          console.error("Failed to relaunch application:", err);
          setUpdateError("Could not automatically restart the application. Please close and relaunch manually.");
          setUpdateStatus('error');
        }
      }, 1000);

    } catch (err: any) {
      console.error("Update failed:", err);
      setUpdateError(err.toString() || "Update failed. Please try again later.");
      setUpdateStatus('error');
    }
  };

  const pendingWeight = useRef<number | null>(null);
  const pendingRawBytes = useRef<number[] | null>(null);
  const pendingMetrics = useRef<any | null>(null);

  // Memoized Aero URL containing auth hashes
  const aeroUrl = useMemo(() => {
    if (!session) return '';
    const token = session.access_token;
    const refresh = session.refresh_token;
    const isDev = import.meta.env.DEV;
    return isDev
      ? `http://localhost:1430/#access_token=${token}&refresh_token=${refresh}`
      : `${window.location.origin}/aero/index.html#access_token=${token}&refresh_token=${refresh}`;
  }, [session]);

  // Memoized Vigor URL containing auth hashes
  const vigorUrl = useMemo(() => {
    if (!session) return '';
    const token = session.access_token;
    const refresh = session.refresh_token;
    const isDev = import.meta.env.DEV;
    return isDev
      ? `http://localhost:1440/#access_token=${token}&refresh_token=${refresh}`
      : `${window.location.origin}/vigor/index.html#access_token=${token}&refresh_token=${refresh}`;
  }, [session]);

  // Memoized Kratos URL containing auth hashes
  const kratosUrl = useMemo(() => {
    if (!session) return '';
    const token = session.access_token;
    const refresh = session.refresh_token;
    const isDev = import.meta.env.DEV;
    return isDev
      ? `http://localhost:1450/#access_token=${token}&refresh_token=${refresh}`
      : `${window.location.origin}/kratos/index.html#access_token=${token}&refresh_token=${refresh}`;
  }, [session]);

  // Memoized Fuel URL containing auth hashes
  const fuelUrl = useMemo(() => {
    if (!session) return '';
    const token = session.access_token;
    const refresh = session.refresh_token;
    const isDev = import.meta.env.DEV;
    return isDev
      ? `http://localhost:1460/#access_token=${token}&refresh_token=${refresh}`
      : `${window.location.origin}/fuel/index.html#access_token=${token}&refresh_token=${refresh}`;
  }, [session]);

  // Memoized Stride URL containing auth hashes
  const strideUrl = useMemo(() => {
    if (!session) return '';
    const token = session.access_token;
    const refresh = session.refresh_token;
    const isDev = import.meta.env.DEV;
    return isDev
      ? `http://localhost:1470/#access_token=${token}&refresh_token=${refresh}`
      : `${window.location.origin}/stride/index.html#access_token=${token}&refresh_token=${refresh}`;
  }, [session]);

  // Listen for native Tauri BLE weight and metrics events and forward to Vigor iframe
  useEffect(() => {
    let unlistenWeight: (() => void) | null = null;
    let unlistenMetrics: (() => void) | null = null;

    async function autoRegisterScale(userId: string) {
      try {
        const { data, error } = await supabase
          .from('vigor_paired_devices')
          .select('id')
          .eq('user_id', userId)
          .eq('device_type', 'scale')
          .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
          console.log("Auto-registering Neo Health Onyx SE scale in database...");
          const { error: insError } = await supabase
            .from('vigor_paired_devices')
            .insert({
              user_id: userId,
              device_type: 'scale',
              brand: 'Neo Health',
              model: 'Onyx SE',
              auto_connect: true,
              settings: {}
            });

          if (insError) throw insError;

          // Tell the iframe to reload devices
          const iframe = document.getElementById('vigor-iframe') as HTMLIFrameElement;
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'refresh-paired-devices' }, '*');
          }
        }
      } catch (err) {
        console.error("Error auto-registering scale:", err);
      }
    }

    async function setupTauriListener() {
      if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
        try {
          const { listen } = await import('@tauri-apps/api/event');
          unlistenWeight = await listen('native-weight-received', (event: any) => {
            const payload = event.payload as { weight: number, raw_bytes?: number[] };
            console.log("Hub received native weight from Tauri Rust:", payload.weight);
            
            // Auto-register scale in DB if not already done
            const currentUserId = sessionRef.current?.user?.id;
            if (currentUserId) {
              autoRegisterScale(currentUserId);
            }
            
            pendingWeight.current = payload.weight;
            pendingRawBytes.current = payload.raw_bytes ?? null;
            
            // Switch to Vigor app if not already active
            setActiveTab('vigor');
            
            // Send to iframe (with timeout in case the iframe is already mounted and active)
            setTimeout(() => {
              const iframe = document.getElementById('vigor-iframe') as HTMLIFrameElement;
              if (iframe && iframe.contentWindow) {
                console.log("Sending weight immediately to iframe:", payload.weight);
                iframe.contentWindow.postMessage({ 
                  type: 'native-weight-received', 
                  weight: payload.weight,
                  raw_bytes: payload.raw_bytes 
                }, '*');
              }
            }, 300);
          });

          unlistenMetrics = await listen('native-metrics-received', (event: any) => {
            const payload = event.payload as { body_fat: number, water: number, impedance: number };
            console.log("Hub received native metrics from Tauri Rust:", payload);
            
            pendingMetrics.current = payload;
            
            setTimeout(() => {
              const iframe = document.getElementById('vigor-iframe') as HTMLIFrameElement;
              if (iframe && iframe.contentWindow) {
                console.log("Sending metrics immediately to iframe:", payload);
                iframe.contentWindow.postMessage({ type: 'native-metrics-received', payload }, '*');
              }
            }, 300);
          });
        } catch (err) {
          console.error("Failed to setup Tauri native BLE listener in Hub:", err);
        }
      }
    }

    setupTauriListener();

    return () => {
      if (unlistenWeight) unlistenWeight();
      if (unlistenMetrics) unlistenMetrics();
    };
  }, []);

  // Handle close-app and ready postMessages from iframe
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    
    const setupTauriListener = async () => {
      if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
        try {
          const { listen } = await import('@tauri-apps/api/event');
          unlisten = await listen<string>('colmi-sync-status', (event) => {
            const iframe = document.getElementById('vigor-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'colmi-sync-status-update',
                payload: event.payload
              }, '*');
            }
          });
        } catch (e) {
          console.error("Failed to setup Tauri colmi-sync-status listener", e);
        }
      }
    };
    setupTauriListener();

    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedZenithOrigin(event.origin)) return;
      if (event.data?.type === 'close-app') {
        setActiveTab('hub');
      } else if (event.data?.type === 'NAVIGATE_TAB') {
        const targetTab = event.data.tab;
        setActiveTab(targetTab);
      } else if (event.data?.type === 'open-bug-report') {
        console.log("Hub received open-bug-report event from iframe:", event.data);
        setBugPrefilledCategory(event.data.category || null);
        setIsBugReportOpen(true);
      } else if (event.data?.type === 'vigor-dashboard-ready') {
        console.log("Hub received ready notification from Vigor iframe");
        const iframe = document.getElementById('vigor-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          if (pendingWeight.current !== null) {
            console.log("Sending pending weight to ready iframe:", pendingWeight.current);
            iframe.contentWindow.postMessage({ 
              type: 'native-weight-received', 
              weight: pendingWeight.current,
              raw_bytes: pendingRawBytes.current
            }, '*');
            pendingWeight.current = null;
            pendingRawBytes.current = null;
          }
          if (pendingMetrics.current !== null) {
            console.log("Sending pending metrics to ready iframe:", pendingMetrics.current);
            iframe.contentWindow.postMessage({ type: 'native-metrics-received', payload: pendingMetrics.current }, '*');
            pendingMetrics.current = null;
          }
        }
      } else if (event.data?.type === 'request-colmi-sync') {
        console.log("Hub received request-colmi-sync from iframe");
        const targetMac = event.data?.targetMac || null;
        const runSync = async () => {
          try {
            const simulate = event.data?.simulate || false;
            const { invoke } = await import('@tauri-apps/api/core');
            const resultStr = await invoke<string>('sync_colmi_ring', { simulate, targetMac });
            const iframe = document.getElementById('vigor-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'colmi-sync-result',
                success: true,
                data: resultStr
              }, '*');
            }
          } catch (err: any) {
            console.error("Hub failed to sync Colmi ring:", err);
            const iframe = document.getElementById('vigor-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'colmi-sync-result',
                success: false,
                error: err.message || String(err)
              }, '*');
            }
          }
        };
        runSync();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (unlisten) unlisten();
    };
  }, []);

  // Central profile loader from public.profiles table
  const loadFitnessProfile = useCallback(async (userId: string, userMetadata: any) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        setFitnessProfile({
          name: data.name || 'Athlete',
          gender: data.gender,
          birthDate: data.birth_date,
          height: data.height_cm,
          weight: data.weight_kg,
          ftp: data.ftp_watts || 220,
          lthr: data.lthr_bpm || 165,
          trainingGoal: data.training_goal || 'general'
        });
      } else {
        const initialName = userMetadata?.name || 'Athlete';
        const defaultProfile = {
          id: userId,
          name: initialName,
          training_goal: 'general',
          ftp_watts: 220,
          lthr_bpm: 165
        };
        await supabase.from('profiles').insert(defaultProfile);
        setFitnessProfile({
          name: defaultProfile.name,
          trainingGoal: 'general',
          ftp: 220,
          lthr: 165
        });
      }
    } catch (e) {
      console.error("Error loading profile from profiles table:", e);
      const profile = userMetadata?.fitness_profile || {};
      const name = userMetadata?.name || profile.name || 'Athlete';
      setFitnessProfile({ ...profile, name });
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionLoading(false);
      if (session?.user) {
        loadFitnessProfile(session.user.id, session.user.user_metadata);
        const isCompleted = session.user.user_metadata?.onboarding_completed === true;
        const isFounder = session.user.email?.toLowerCase() === 'filip.monbaillieu.24@gmail.com';
        if (!isCompleted && !isFounder) {
          setShowOnboarding(true);
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadFitnessProfile(session.user.id, session.user.user_metadata);
        const isCompleted = session.user.user_metadata?.onboarding_completed === true;
        const isFounder = session.user.email?.toLowerCase() === 'filip.monbaillieu.24@gmail.com';
        if (!isCompleted && !isFounder) {
          setShowOnboarding(true);
        }
      } else {
        setRides([]);
        setFitnessProfile({ name: 'Athlete' });
      }
    });

    return () => subscription.unsubscribe();
  }, [loadFitnessProfile]);

  const fetchRides = useCallback(async () => {
    if (!session) return;
    try {
      const { data } = await supabase
        .from('rides')
        .select('date, metadata')
        .order('date', { ascending: true });
      
      if (data) {
        const tssList = data.map((r: any) => {
          let witha = r.metadata;
          if (typeof witha === 'string') {
            try { witha = JSON.parse(witha); } catch { witha = {}; }
          }
          return {
            date: Number(r.date),
            tss: Number(witha?.tss ?? witha?.hrTSS ?? 0)
          };
        });
        setRides(tssList);
      }
    } catch (err) {
      console.error('Failed to load rides for PMC:', err);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      fetchRides();
    }
  }, [fetchRides, session]);

  // Supabase Realtime channel to orchestrate background MLP training cycles.
  //
  // Debounced + serialized: a single phone sync can insert dozens of historical
  // rows (steps/sleep/weight backfill) in quick succession, each firing its own
  // INSERT event. Without debouncing, every one of those re-ran the full training
  // cycle (5 models, one of which loops 31 days) — thousands of redundant Supabase
  // upserts per sync. Now a burst of events collapses into one run fired after the
  // events go quiet, and a run already in flight queues at most one follow-up
  // instead of overlapping.
  useEffect(() => {
    if (!session?.user) return;
    const userId = session.user.id;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isTraining = false;
    let rerunQueued = false;

    const runTrainingCycle = async () => {
      if (isTraining) { rerunQueued = true; return; }
      isTraining = true;
      try {
        // 1. Initialise models in memory for UI immediately
        await recoveryModel.loadOrInit(supabase, userId);
        setMlModelsLoaded(true);

        // 2. Run background training
        const { runBackgroundTraining } = await import('./utils/backgroundTrainer');
        await runBackgroundTraining(supabase, userId);

        // 3. Re-load the freshly trained weights into memory and trigger UI updates
        await recoveryModel.loadOrInit(supabase, userId);
        setMlModelsLoaded(prev => !prev);
      } finally {
        isTraining = false;
        if (rerunQueued) {
          rerunQueued = false;
          runTrainingCycle();
        }
      }
    };

    const scheduleTraining = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        runTrainingCycle();
      }, 4000);
    };

    // Initial run on load doesn't need debouncing — nothing to coalesce with yet.
    runTrainingCycle();

    const channel = supabase
      .channel('hub-db-ml-trigger')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides', filter: `user_id=eq.${userId}` }, () => {
        scheduleTraining();
        fetchRides();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vigor_weight', filter: `user_id=eq.${userId}` }, () => {
        scheduleTraining();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vigor_sleep', filter: `user_id=eq.${userId}` }, () => {
        scheduleTraining();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vigor_steps', filter: `user_id=eq.${userId}` }, () => {
        scheduleTraining();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kratos_workouts', filter: `user_id=eq.${userId}` }, () => {
        scheduleTraining();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [session, fetchRides]);

  const fitnessMetrics = useMemo(() => {
    if (rides.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
    const points = computePMC(rides);
    const last = points[points.length - 1];
    return {
      ctl: last ? Math.round(last.ctl) : 0,
      atl: last ? Math.round(last.atl) : 0,
      tsb: last ? Math.round(last.tsb) : 0,
    };
  }, [rides]);


  const handleSaveProfile = async (updatedProfile: any) => {
    if (!session?.user) return;

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        name: updatedProfile.name,
        gender: updatedProfile.gender || null,
        birth_date: updatedProfile.birthDate || null,
        height_cm: updatedProfile.height || null,
        weight_kg: updatedProfile.weight || null,
        ftp_watts: updatedProfile.ftp || 220,
        lthr_bpm: updatedProfile.lthr || 165,
        training_goal: updatedProfile.trainingGoal || 'general',
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    await supabase.auth.updateUser({
      data: {
        name: updatedProfile.name || undefined
      }
    });

    setFitnessProfile(updatedProfile);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleBugReportSubmit = async (data: BugReportSubmitData) => {
    if (!session?.user) {
      throw new Error("You must be logged in to submit a bug report.");
    }

    const imageUrls: string[] = [];

    // 1. Upload screenshots to Supabase Storage if present
    const filesToUpload = data.screenshots || (data.screenshot ? [data.screenshot] : []);
    for (let idx = 0; idx < filesToUpload.length; idx++) {
      const file = filesToUpload[idx];
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${session.user.id}/${Date.now()}_screenshot_${idx}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('bug-reports')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Screenshot upload failed: ${uploadError.message}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('bug-reports')
        .getPublicUrl(fileName);

      imageUrls.push(publicUrl);
    }
    
    const imageUrl = imageUrls.length > 0 ? imageUrls.join(',') : null;

    // 2. Resolve environment details
    const envOs = navigator.platform || 'Onbekend';
    const envBrowser = navigator.userAgent || 'Onbekend';
    const envScreen = `${window.screen.width}x${window.screen.height} (Venster: ${window.innerWidth}x${window.innerHeight})`;

    // 3. Resolve GitHub credentials
    const repo = data.developerRepo || import.meta.env.VITE_GITHUB_REPO || 'filipmonbaillieu24-prog/Zenith';
    const token = data.developerToken || import.meta.env.VITE_GITHUB_TOKEN;

    if (!token) {
      throw new Error(
        'No GitHub Access Token found. Please configure your token under "Developer Settings".'
      );
    }

    // 4. Extract recent console & system logs for debugging
    const capturedLogs = loggerService.getLogs();
    const logsFormatted = capturedLogs.slice(0, 100).map(l => 
      `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}${l.details ? ' ' + JSON.stringify(l.details) : ''}`
    ).join('\n');

    let logsMarkdown = '';
    if (logsFormatted.trim()) {
      logsMarkdown = `### 📋 System & Console Logs (${capturedLogs.length} lines)\n<details>\n<summary>Click to view automatically captured console logs</summary>\n\n\`\`\`log\n${logsFormatted}\n\`\`\`\n</details>\n`;
    }

    const userName = fitnessProfile?.name || session?.user?.user_metadata?.name || 'Athlete';
    
    let imagesMarkdown = '';
    if (imageUrls.length > 0) {
      imagesMarkdown = '### Screenshots\n\n' + imageUrls.map((url, idx) => `![Screenshot ${idx + 1}](${url})`).join('\n\n');
    }

    const bodyContent = `### Description / Reproduction
${data.description}

### Details
- **Category:** ${data.category}
- **Problem type:** ${data.problemType}
- **Urgency:** ${data.severity.toUpperCase()}
- **User:** ${userName} <${session.user.email}> (ID: ${session.user.id})

### Environmental Factors
- **Operating system:** ${envOs}
- **Browser:** ${envBrowser}
- **Screen resolution:** ${envScreen}
- **Application Version:** 0.1.0 (Tauri)

${imagesMarkdown}

${logsMarkdown}
`;

    // 5. Send post request to GitHub Issues API
    const githubResponse = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `[${data.category.toUpperCase()}] [${data.problemType.toUpperCase()}] ${data.title}`,
        body: bodyContent,
        labels: ['bug', `severity:${data.severity}`, `comp:${data.category}`]
      })
    });

    if (!githubResponse.ok) {
      const errJson = await githubResponse.json().catch(() => ({}));
      throw new Error(errJson.message || `GitHub API error: ${githubResponse.status} ${githubResponse.statusText}`);
    }

    const issueData = await githubResponse.json();
    const githubUrl = issueData.html_url;
    const githubNumber = issueData.number;

    // 6. Save to Supabase public.bug_reports table
    try {
      const { error: dbError } = await supabase
        .from('bug_reports')
        .insert({
          user_id: session.user.id,
          title: data.title,
          description: data.description,
          category: data.category,
          problem_type: data.problemType,
          severity: data.severity,
          image_url: imageUrl,
          env_os: envOs,
          env_browser: envBrowser,
          env_screen: envScreen,
          github_issue_url: githubUrl,
          github_issue_number: githubNumber,
          status: 'open'
        });

      if (dbError) {
        console.warn("Could not save bug report to Supabase database:", dbError);
      }
    } catch (dbErr) {
      console.warn("Error saving to database:", dbErr);
    }

    return { success: true, githubUrl };
  };

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

  const [publicView, setPublicView] = useState<'landing' | 'prijzen' | 'roadmap' | 'auth'>('landing');

  if (sessionLoading) {
    return (
      <div className="zh-hub-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
          Loading Zenith...
        </div>
      </div>
    );
  }

  if (!session) {
    if (publicView === 'auth') {
      return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
          <button
            onClick={() => setPublicView('landing')}
            style={{
              position: 'fixed',
              top: 20,
              left: 20,
              zIndex: 9999,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              padding: '8px 16px',
              borderRadius: 10,
              cursor: 'pointer'
            }}
          >
            ← Back to Website
          </button>
          <Suspense fallback={<div className="p-8 text-center text-zinc-400">Loading...</div>}>
            <LoginPage />
          </Suspense>
        </div>
      );
    }
    if (publicView === 'prijzen') {
      return (
        <Suspense fallback={<div className="p-8 text-center text-zinc-400">Loading...</div>}>
          <PricingPage onBack={() => setPublicView('landing')} isPro={false} />
        </Suspense>
      );
    }
    if (publicView === 'roadmap') {
      return (
        <Suspense fallback={<div className="p-8 text-center text-zinc-400">Loading...</div>}>
          <FeatureRequestsPage
            onBack={() => setPublicView('landing')} 
            onRequireLogin={() => setPublicView('auth')}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<div className="p-8 text-center text-zinc-400">Loading...</div>}>
        <ZenithLandingPage
          onLogin={() => setPublicView('auth')}
          onRegister={() => setPublicView('auth')}
          onNavigateTab={(tab) => setPublicView(tab as any)}
        />
      </Suspense>
    );
  }

  const userName = fitnessProfile?.name || session?.user?.user_metadata?.name || 'Athlete';
  const isFounder = session?.user?.email?.toLowerCase() === 'filip.monbaillieu.24@gmail.com';
  const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || !!(window as any).__TAURI_METADATA__);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', background: '#09090b', overflow: 'hidden' }}>
      {isTauri && (
        <AppTitlebar
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
        />
      )}
      <div style={{ display: 'flex', flex: 1, width: '100%', height: isTauri ? 'calc(100vh - 32px)' : '100vh', overflow: 'hidden' }}>
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onLogout={handleLogout}
          userName={userName}
          isPro={isPro}
          isFounder={isFounder}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          onOpenBugReport={() => {
            setBugPrefilledCategory(null);
            setIsBugReportOpen(true);
          }}
        />
        <div style={{ flex: 1, height: isTauri ? 'calc(100vh - 32px)' : '100vh', marginTop: 0, overflowY: 'auto', position: 'relative' }}>
          <Suspense fallback={<div className="p-8 text-center text-zinc-400">Loading...</div>}>
          <div key={activeTab} className="zenith-page-transition" style={{ width: '100%', height: '100%', display: EXTENSION_TABS.has(activeTab) ? 'none' : 'block' }}>
          {activeTab === 'hub' && (
            <ZenithHubPage
              fitnessProfile={fitnessProfile}
              fitnessMetrics={fitnessMetrics}
              userId={session.user.id}
              mlModelsLoaded={mlModelsLoaded}
            />
          )}
          {activeTab === 'calendar' && (
            <CalendarPage
              userId={session.user.id}
              onOpenRideInAero={(rideId) => {
                setPendingRideId(rideId);
                setActiveTab('aero');
              }}
            />
          )}
          {activeTab === 'mobiel' && (
            <PilotPanel
              userName={userName}
            />
          )}
          {activeTab === 'profile' && (
            <ProfilePage
              initialProfile={{ ...fitnessProfile, isPro }}
              userId={session.user.id}
              userEmail={session.user.email}
              onSave={handleSaveProfile}
            />
          )}
          {activeTab === 'prijzen' && (
            <PricingPage
              isPro={isPro}
              onActivatePro={async () => {
                await supabase.auth.updateUser({ data: { is_pro: true } });
                loadFitnessProfile(session.user.id, { ...session.user.user_metadata, is_pro: true });
              }}
            />
          )}
          {activeTab === 'roadmap' && (
            <FeatureRequestsPage
              userId={session.user.id}
              userName={userName}
              userEmail={session.user.email}
            />
          )}
          {activeTab === 'logs' && (
            isFounder ? (
              <SystemConsolePage />
            ) : (
              <ZenithHubPage
                fitnessProfile={fitnessProfile}
                fitnessMetrics={fitnessMetrics}
                userId={session.user.id}
                mlModelsLoaded={mlModelsLoaded}
              />
            )
          )}
          {activeTab === 'integrations' && (
            <IntegrationsPage />
          )}
          </div>
          </Suspense>

          {/* Extensions stay mounted permanently once loaded and are shown/hidden with
              display, instead of being destroyed and recreated on every tab switch.
              Switching away from an extension used to unmount its iframe entirely, so
              switching back forced a full reload (re-auth, re-fetch, re-render) every
              single time - this is what made app-to-app navigation feel clunky. */}
          {visitedExtensionTabs.has('aero') && (
            <div style={{ width: '100%', height: '100%', display: activeTab === 'aero' ? 'block' : 'none', background: '#09090b', position: 'relative' }} className="zenith-page-transition">
              <iframe
                id="aero-iframe"
                src={getAeroUrl()}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Zenith Aero"
                allow="bluetooth"
              />
            </div>
          )}
          {visitedExtensionTabs.has('vigor') && (
            <div style={{ width: '100%', height: '100%', display: activeTab === 'vigor' ? 'block' : 'none', background: '#09090b', position: 'relative' }} className="zenith-page-transition">
              <iframe
                id="vigor-iframe"
                src={vigorUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Zenith Vigor"
                allow="bluetooth"
              />
            </div>
          )}
          {visitedExtensionTabs.has('kratos') && (
            <div style={{ width: '100%', height: '100%', display: activeTab === 'kratos' ? 'block' : 'none', background: '#09090b', position: 'relative' }} className="zenith-page-transition">
              <iframe
                id="kratos-iframe"
                src={kratosUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Zenith Kratos"
              />
            </div>
          )}
          {visitedExtensionTabs.has('fuel') && (
            <div style={{ width: '100%', height: '100%', display: activeTab === 'fuel' ? 'block' : 'none', background: '#09090b', position: 'relative' }} className="zenith-page-transition">
              <iframe
                id="fuel-iframe"
                src={fuelUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Zenith Fuel"
              />
            </div>
          )}
          {visitedExtensionTabs.has('stride') && (
            <div style={{ width: '100%', height: '100%', display: activeTab === 'stride' ? 'block' : 'none', background: '#09090b', position: 'relative' }} className="zenith-page-transition">
              <iframe
                id="stride-iframe"
                src={strideUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Zenith Stride"
              />
            </div>
          )}
        </div>
      </div>

      {updateStatus !== 'idle' && updateInfo && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(9, 9, 11, 0.85)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999,
          color: '#ffffff',
          fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{
            background: 'rgba(23, 23, 23, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(59, 130, 246, 0.15)',
            borderRadius: '24px',
            padding: '40px',
            width: '460px',
            textAlign: 'center',
            backdropFilter: 'blur(20px)'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              margin: '0 auto 24px auto',
              boxShadow: '0 0 30px rgba(59, 130, 246, 0.4)'
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.5px' }}>
              Update Beschikbaar!
            </h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, marginBottom: 24 }}>
              A new version of Zenith is available: <strong style={{ color: '#60a5fa' }}>v{updateInfo.version}</strong>
            </p>

            {updateInfo.body && (
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: 24,
                textAlign: 'left',
                maxHeight: '140px',
                overflowY: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: 13,
                lineHeight: 1.5,
                color: 'rgba(255, 255, 255, 0.8)'
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '1px' }}>Release Notes</div>
                {updateInfo.body}
              </div>
            )}

            {updateStatus === 'available' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setUpdateStatus('idle')}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Later
                </button>
                <button
                  onClick={handleStartUpdate}
                  style={{
                    flex: 2,
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.2s'
                  }}
                >
                  Nu Updaten
                </button>
              </div>
            )}

            {(updateStatus === 'downloading' || updateStatus === 'installing') && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255, 255, 255, 0.6)' }}>
                  <span>{updateStatus === 'downloading' ? 'Downloaden...' : 'Installeren...'}</span>
                  <span>{downloadProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{
                    width: `${downloadProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                    borderRadius: '4px',
                    transition: 'width 0.2s ease-out'
                  }} />
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)' }}>
                  {updateStatus === 'downloading' ? 'Do not close the app.' : 'Restarting to complete update...'}
                </span>
              </div>
            )}

            {updateStatus === 'error' && (
              <div>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '12px',
                  padding: '12px',
                  color: '#ef4444',
                  fontSize: 13,
                  marginBottom: 20,
                  textAlign: 'left'
                }}>
                  {updateError}
                </div>
                <button
                  onClick={() => setUpdateStatus('idle')}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Sluiten
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <BugReportModal
        isOpen={isBugReportOpen}
        onClose={() => setIsBugReportOpen(false)}
        onSubmit={handleBugReportSubmit}
        prefilledCategory={bugPrefilledCategory}
      />

      {showAccountConfirmed && (
        <AccountConfirmedModal
          userName={userName}
          onProceed={() => setShowAccountConfirmed(false)}
        />
      )}

      <OnboardingModal
        isOpen={showOnboarding}
        userId={session?.user?.id || ''}
        userEmail={session?.user?.email || ''}
        initialName={fitnessProfile?.name}
        onCompleted={async (_profilePayload, isProChosen) => {
          setShowOnboarding(false);
          // Refresh the user session in local state to ensure metadata updates propagate
          const { data: { session: refreshedSession } } = await supabase.auth.getSession();
          if (refreshedSession) {
            setSession(refreshedSession);
            await loadFitnessProfile(refreshedSession.user.id, refreshedSession.user.user_metadata);
          } else if (session?.user?.id) {
            await loadFitnessProfile(session.user.id, { ...session.user.user_metadata, onboarding_completed: true, is_pro: isProChosen });
          }
        }}
      />
    </div>
  );
}

export default App;
