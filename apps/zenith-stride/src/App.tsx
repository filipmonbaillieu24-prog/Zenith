import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './utils/supabaseClient';
import {
  runsInPeriod, summarisePeriod, runningForm, intensityMix, estimateMaxHr,
  distanceBests, shoeStatuses, STRIDE_PERIOD_LABELS, StridePeriod,
  runningEconomyTrend, interpretTSB
} from '@zenith/shared';
import { ZenithHeroStat, ZenithEmptyState, ZenithPageHeader, ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE, zenithConfirm, zenithAlert } from '@zenith/shared';
import { RunActivity, RunningShoe } from './types/stride';
import { RunModal } from './components/RunModal';
import { GpxImportModal } from './components/GpxImportModal';
import { ImportIntegrationsModal } from './components/ImportIntegrationsModal';
import { ShoeTrackerModal } from './components/ShoeTrackerModal';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { 
  Footprints,
  Plus,
  UploadCloud,
  Zap,
  Calendar,
  Heart,
  Flame, 
  Layers, 
  Search, 
  Filter, 
  ChevronRight, 
  CheckCircle2, 
  Activity,
  Sliders,
  Award
} from 'lucide-react';
import './index.css';

// The offline cache is keyed per user. It used to live under a single global
// key, so on a shared browser - or in the desktop app after switching accounts -
// the previous user's runs and shoes rendered immediately on load, before (or
// instead of) the signed-in user's own data arrived from Supabase.
const runsCacheKey = (userId: string) => `zenith_stride_runs::${userId}`;
const shoesCacheKey = (userId: string) => `zenith_stride_shoes::${userId}`;

const readCache = <T,>(key: string): T[] => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T[]) : [];
  } catch (e) {
    console.error(`Error reading cache ${key}:`, e);
    return [];
  }
};

export function App() {
  // Starts empty and is populated only once we know who is signed in - never
  // seeded synchronously from an unscoped key.
  const [userId, setUserId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunActivity[]>([]);
  const [shoes, setShoes] = useState<RunningShoe[]>([]);

  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  // The run being edited, or null when logging a new one. Imports arrive with
  // whatever the watch recorded and sometimes get it wrong - an outdoor run landing
  // as a treadmill session, a distance the source never sent - and until now there
  // was no way to correct one short of deleting it and typing it again.
  const [editingRun, setEditingRun] = useState<RunActivity | null>(null);
  const [isGpxModalOpen, setIsGpxModalOpen] = useState(false);
  const [isIntegrationsModalOpen, setIsIntegrationsModalOpen] = useState(false);
  const [isShoeModalOpen, setIsShoeModalOpen] = useState(false);
  const [selectedRunDetail, setSelectedRunDetail] = useState<RunActivity | null>(null);

  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Why the runs would not load at all.
  //
  // Stride is opened inside the hub as an iframe, and the hub hands the signed-in
  // session down in the URL fragment. Aero, Vigor, Kratos and Fuel each pick those
  // tokens up and call setSession before touching the database; Stride never did, so
  // getUser() came back empty, the effect returned early, and the page rendered "No
  // runs logged yet" over a database holding this athlete's runs. The hub dashboard
  // showed the same runs on the same screen, because the hub is authenticated
  // normally - which is what made it look like a Stride data problem rather than an
  // auth one.
  const [authFailed, setAuthFailed] = useState(false);

  // Load activities directly from Supabase stride_activities table
  useEffect(() => {
    async function loadActivitiesFromDb() {
      try {
        const hash = window.location.hash;
        if (hash) {
          const params = new URLSearchParams(hash.replace('#', '?'));
          const token = params.get('access_token');
          const refresh = params.get('refresh_token');
          if (token && refresh) {
            // Drop the tokens from the address bar once taken, so they are not left
            // sitting in history.
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            await supabase.auth.setSession({ access_token: token, refresh_token: refresh });
          }
        }

        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) {
          // An empty list and a failed sign-in look identical to the athlete, and
          // only one of them means "you have no runs". Say which this is.
          console.warn('Cannot load stride activities: User is not authenticated.');
          setAuthFailed(true);
          return;
        }
        setAuthFailed(false);
        setUserId(uid);
        // Show this user's own cached data straight away, then reconcile with
        // the server below.
        setRuns(readCache<RunActivity>(runsCacheKey(uid)));
        setShoes(readCache<RunningShoe>(shoesCacheKey(uid)));

        // Shoes and runs are independent queries; fetch them together rather
        // than serially.
        const [{ data, error }, { data: shoeRows, error: shoeError }] = await Promise.all([
          supabase
            .from('stride_activities')
            .select('*')
            .eq('user_id', uid)
            .order('date', { ascending: false }),
          supabase
            .from('stride_shoes')
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: true }),
        ]);

        if (shoeError) {
          console.error('Failed to load stride_shoes:', shoeError);
        } else {
          setShoes((shoeRows ?? []).map(row => ({
            id: row.id,
            brand: row.brand,
            model: row.model,
            nickname: row.nickname ?? undefined,
            totalDistanceKm: Number(row.total_distance_km) || 0,
            maxDistanceKm: Number(row.max_distance_km) || 700,
            retired: !!row.retired,
            purchaseDate: row.purchase_date ?? undefined,
          })));
        }

        if (error) {
          console.error('Failed to load stride_activities:', error);
          return;
        }

        // Assigns unconditionally, including the empty case. Guarding on
        // `data.length > 0` meant a user who had deleted every run (or signed
        // in on a fresh device) kept seeing stale cached runs forever, with no
        // way to clear them.
        {
          const dbRuns: RunActivity[] = (data ?? []).map(act => ({
            id: act.id,
            title: act.title,
            date: act.date,
            timeOfDay: act.time_of_day || '08:00',
            type: (act.type as any) || 'easy',
            isTreadmill: act.is_treadmill || false,
            inclinePercent: act.incline_percent,
            distanceKm: parseFloat(act.distance_km),
            durationSec: act.duration_sec,
            avgPaceMinKm: parseFloat(act.avg_pace_min_km),
            elevationGainM: act.elevation_gain_m || 0,
            avgHeartRate: act.avg_heart_rate,
            maxHeartRate: act.max_heart_rate,
            avgCadenceSpm: act.avg_cadence_spm,
            calories: act.calories,
            rpe: act.rpe,
            // shoe_id was never read back, so a run reloaded from the server had no
            // shoe attached however carefully one was picked - and the edit path's
            // mileage accounting then read every save as a change of shoe.
            shoeId: act.shoe_id ?? undefined,
            // `|| 'Samsung Fit'` put a shoe nobody selected on every run that had
            // none, and that name then appeared in the table and in search results
            // as though the athlete had recorded it.
            shoeName: act.shoe_name ?? undefined,
            source: (act.source as any) || 'health_connect',
            notes: act.notes,
            splits: act.splits,
            routeCoordinates: act.route_coordinates ?? undefined
          }));
          setRuns(dbRuns);
        }
      } catch (err) {
        console.error("Failed to load stride_activities from Supabase:", err);
      }
    }
    loadActivitiesFromDb();
  }, []);

  // Persist to this user's own cache slot only.
  useEffect(() => {
    if (!userId) return;
    localStorage.setItem(runsCacheKey(userId), JSON.stringify(runs));
  }, [runs, userId]);

  useEffect(() => {
    if (!userId) return;
    localStorage.setItem(shoesCacheKey(userId), JSON.stringify(shoes));
  }, [shoes, userId]);

  // Aggregate stats
  // ── The period being looked at ──────────────────────────────────────────────
  //
  // Every headline figure was all-time. A total that can only grow says nothing about
  // how the athlete is running now, which is the question the dashboard exists to
  // answer.
  const [period, setPeriod] = useState<StridePeriod>('30d');
  const periodRuns = useMemo(() => runsInPeriod(runs as any[], period), [runs, period]);
  const periodSummary = useMemo(() => summarisePeriod(periodRuns), [periodRuns]);

  /** Fitness, fatigue and form from running alone, not diluted by riding. */
  const form = useMemo(() => runningForm(runs as any[]), [runs]);

  const maxHr = useMemo(() => estimateMaxHr(runs as any[]), [runs]);
  const mix = useMemo(() => intensityMix(periodRuns, maxHr), [periodRuns, maxHr]);

  /** Pace compared only between runs at a similar heart rate. */
  const economy = useMemo(
    () => runningEconomyTrend(
      (runs as any[]).map(r => ({
        date: r.date,
        avg_pace_min_km: r.avgPaceMinKm,
        avg_heart_rate: r.avgHeartRate
      }))
    ),
    [runs]
  );

  const bests = useMemo(() => distanceBests(runs as any[]), [runs]);
  const shoeWarnings = useMemo(() => shoeStatuses(shoes as any[]).filter(s => s.state !== 'ok'), [shoes]);

  /**
   * Filter chips for the run types this athlete actually has.
   *
   * The list was hardcoded to All / Treadmill / Long Run / Intervals / Easy / Trail,
   * and the imported runs are typed easy, tempo, treadmill, walk or hike. Three of the
   * six chips could never match anything: clicking them emptied the table and looked
   * like a bug in the search.
   */
  const availableFilters = useMemo(() => {
    const LABELS: Record<string, string> = {
      easy: 'Easy Run',
      tempo: 'Tempo',
      long_run: 'Long Run',
      intervals: 'Intervals',
      treadmill: 'Treadmill',
      trail: 'Trail',
      walk: 'Walk',
      hike: 'Hike',
      race: 'Race',
      recovery: 'Recovery'
    };
    const present = Array.from(new Set(runs.map(r => r.type).filter(Boolean)));
    present.sort((a, b) => (LABELS[a] ?? a).localeCompare(LABELS[b] ?? b));
    return [
      { id: 'all', label: 'All Runs' },
      ...present.map(type => ({ id: type, label: LABELS[type] ?? type }))
    ];
  }, [runs]);

  // A chip that vanishes because its last run was deleted must not leave the table
  // filtered to nothing with no visible reason.
  useEffect(() => {
    if (!availableFilters.some(f => f.id === filterType)) setFilterType('all');
  }, [availableFilters, filterType]);

  const totalKm = useMemo(() => runs.reduce((acc, r) => acc + r.distanceKm, 0), [runs]);
  const totalDurationSec = useMemo(() => runs.reduce((acc, r) => acc + r.durationSec, 0), [runs]);
  const totalTreadmillKm = useMemo(() => runs.filter(r => r.isTreadmill).reduce((acc, r) => acc + r.distanceKm, 0), [runs]);
  /**
   * Average pace across the runs that actually recorded a distance.
   *
   * It divided TOTAL duration by TOTAL distance, and a treadmill session imported
   * with no distance contributes minutes to the numerator and nothing to the
   * denominator. Two of those alongside one 6.05 km run at 5:51/km produced an
   * average pace of 12:38/km - slower than every run it was averaging.
   */
  const pacedRuns = useMemo(() => runs.filter(r => r.distanceKm > 0 && r.durationSec > 0), [runs]);
  const avgPace = useMemo(() => {
    const km = pacedRuns.reduce((acc, r) => acc + r.distanceKm, 0);
    const sec = pacedRuns.reduce((acc, r) => acc + r.durationSec, 0);
    if (km <= 0) return null;
    return (sec / 60) / km;
  }, [pacedRuns]);

  const handleSaveRun = async (newRun: RunActivity) => {
    setRuns(prev => [newRun, ...prev]);

    // Update shoe mileage if linked
    if (newRun.shoeId) {
      setShoes(prev => prev.map(s => {
        if (s.id !== newRun.shoeId) return s;
        const updated = parseFloat((s.totalDistanceKm + newRun.distanceKm).toFixed(1));
        void persistShoeMileage(s.id, updated);
        return { ...s, totalDistanceKm: updated };
      }));
    }

    // Persist to Supabase stride_activities
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        console.warn('Cannot persist stride activity: User is not authenticated.');
        return;
      }

      const { data: inserted, error: insertError } = await supabase.from('stride_activities').insert({
        user_id: uid,
        title: newRun.title,
        date: newRun.date,
        time_of_day: newRun.timeOfDay,
        type: newRun.type,
        is_treadmill: newRun.isTreadmill,
        incline_percent: newRun.inclinePercent || 0,
        distance_km: newRun.distanceKm,
        duration_sec: newRun.durationSec,
        avg_pace_min_km: newRun.avgPaceMinKm,
        elevation_gain_m: newRun.elevationGainM || 0,
        avg_heart_rate: newRun.avgHeartRate,
        max_heart_rate: newRun.maxHeartRate,
        avg_cadence_spm: newRun.avgCadenceSpm,
        calories: newRun.calories,
        rpe: newRun.rpe,
        // shoe_id was never written, only the name - so nothing could be joined back
        // to a pair, and every run in this database has a null shoe_id however
        // carefully the shoe was picked in the form.
        shoe_id: newRun.shoeId ?? null,
        shoe_name: newRun.shoeName,
        // The GPX importer parses a route and per-kilometre splits, hands them to
        // this function, and they were dropped here. The columns exist and every row
        // in them is empty; the detail view's map and splits table had nothing to
        // render because nothing ever saved them.
        route_coordinates: newRun.routeCoordinates ?? null,
        splits: newRun.splits ?? null,
        source: newRun.source || 'manual',
        notes: newRun.notes
      }).select('id').single();

      if (insertError) {
        console.error('Failed to persist new run to Supabase:', insertError);
        return;
      }

      // Adopt the database's own id. The optimistic row above carries a local
      // `run-<timestamp>` id; without this the local and server ids diverge
      // permanently and a later delete/edit can't address the right row.
      if (inserted?.id) {
        setRuns(prev => prev.map(r => (r.id === newRun.id ? { ...r, id: inserted.id } : r)));
      }
    } catch (e) {
      console.warn("Failed to persist new run to Supabase:", e);
    }
  };

  const handleUpdateRun = async (updated: RunActivity) => {
    const previous = runs.find(r => r.id === updated.id);
    setRuns(prev => prev.map(r => (r.id === updated.id ? updated : r)));

    // Shoe mileage has to follow the correction, not just the original entry.
    if (previous && (previous.shoeId !== updated.shoeId || previous.distanceKm !== updated.distanceKm)) {
      setShoes(prev => prev.map(s => {
        let total = s.totalDistanceKm;
        if (previous.shoeId === s.id) total -= previous.distanceKm;
        if (updated.shoeId === s.id) total += updated.distanceKm;
        if (total === s.totalDistanceKm) return s;
        const rounded = parseFloat(Math.max(0, total).toFixed(1));
        void persistShoeMileage(s.id, rounded);
        return { ...s, totalDistanceKm: rounded };
      }));
    }

    try {
      const { error } = await supabase.from('stride_activities').update({
        title: updated.title,
        date: updated.date,
        time_of_day: updated.timeOfDay,
        type: updated.type,
        is_treadmill: updated.isTreadmill,
        incline_percent: updated.inclinePercent || 0,
        distance_km: updated.distanceKm,
        duration_sec: updated.durationSec,
        avg_pace_min_km: updated.avgPaceMinKm,
        elevation_gain_m: updated.elevationGainM || 0,
        avg_heart_rate: updated.avgHeartRate,
        max_heart_rate: updated.maxHeartRate,
        avg_cadence_spm: updated.avgCadenceSpm,
        calories: updated.calories,
        rpe: updated.rpe,
        shoe_id: updated.shoeId ?? null,
        shoe_name: updated.shoeName,
        notes: updated.notes,
        // Tells the Health Connect ingest to leave this row alone from here on. A
        // correction made by hand must not be undone by the next sync.
        manually_edited: true
      }).eq('id', updated.id);

      if (error) {
        console.error('Failed to save run edit:', error);
        // Put the old values back rather than leaving the screen claiming a save
        // that did not happen.
        if (previous) setRuns(prev => prev.map(r => (r.id === updated.id ? previous : r)));
      }
    } catch (e) {
      console.warn('Failed to save run edit:', e);
      if (previous) setRuns(prev => prev.map(r => (r.id === updated.id ? previous : r)));
    }
  };

  const handleDeleteRun = async (runId: string) => {
    const target = runs.find(r => r.id === runId);
    if (!target) return;
    if (!await zenithConfirm(`Delete "${target.title}"? This can't be undone.`)) return;

    const previous = runs;
    setRuns(prev => prev.filter(r => r.id !== runId));

    // Give back the mileage this run contributed, so deleting a run doesn't
    // leave a shoe permanently over-counted.
    if (target.shoeId) {
      setShoes(prev => prev.map(sh => {
        if (sh.id !== target.shoeId) return sh;
        const updated = parseFloat(Math.max(0, sh.totalDistanceKm - target.distanceKm).toFixed(1));
        void persistShoeMileage(sh.id, updated);
        return { ...sh, totalDistanceKm: updated };
      }));
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return;
      const { error } = await supabase
        .from('stride_activities')
        .delete()
        .eq('id', runId)
        .eq('user_id', uid);
      if (error) {
        console.error('Failed to delete run:', error);
        setRuns(previous);
        await zenithAlert('Could not delete that run. Please try again.');
      }
    } catch (e) {
      console.error('Failed to delete run:', e);
      setRuns(previous);
    }
  };

  const handleAddShoe = async (newShoe: RunningShoe) => {
    setShoes(prev => [...prev, newShoe]);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return;
      const { data: inserted, error } = await supabase.from('stride_shoes').insert({
        user_id: uid,
        brand: newShoe.brand,
        model: newShoe.model,
        nickname: newShoe.nickname ?? null,
        total_distance_km: newShoe.totalDistanceKm,
        max_distance_km: newShoe.maxDistanceKm,
        retired: newShoe.retired,
        purchase_date: newShoe.purchaseDate ?? null,
      }).select('id').single();
      if (error) {
        console.error('Failed to save shoe:', error);
        return;
      }
      // Adopt the database id, so later mileage/retire updates address the row.
      if (inserted?.id) {
        setShoes(prev => prev.map(sh => (sh.id === newShoe.id ? { ...sh, id: inserted.id } : sh)));
      }
    } catch (e) {
      console.error('Failed to save shoe:', e);
    }
  };

  const handleToggleRetireShoe = async (shoeId: string) => {
    const target = shoes.find(sh => sh.id === shoeId);
    if (!target) return;
    const nextRetired = !target.retired;
    setShoes(prev => prev.map(sh => sh.id === shoeId ? { ...sh, retired: nextRetired } : sh));
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return;
      const { error } = await supabase
        .from('stride_shoes')
        .update({ retired: nextRetired })
        .eq('id', shoeId)
        .eq('user_id', uid);
      if (error) console.error('Failed to update shoe:', error);
    } catch (e) {
      console.error('Failed to update shoe:', e);
    }
  };

  // Mileage is derived from runs, so it changes on save and delete rather than
  // through its own UI action - persisted here so the total survives a reload.
  const persistShoeMileage = async (shoeId: string, totalDistanceKm: number) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return;
      const { error } = await supabase
        .from('stride_shoes')
        .update({ total_distance_km: totalDistanceKm })
        .eq('id', shoeId)
        .eq('user_id', uid);
      if (error) console.error('Failed to update shoe mileage:', error);
    } catch (e) {
      console.error('Failed to update shoe mileage:', e);
    }
  };

  const filteredRuns = useMemo(() => {
    return runs.filter(run => {
      const matchesSearch = run.title.toLowerCase().includes(searchQuery.toLowerCase()) || (run.shoeName && run.shoeName.toLowerCase().includes(searchQuery.toLowerCase()));
      if (filterType === 'all') return matchesSearch;
      if (filterType === 'treadmill') return matchesSearch && run.isTreadmill;
      return matchesSearch && run.type === filterType;
    });
  }, [runs, searchQuery, filterType]);

  const formatPace = (decimalPace: number) => {
    const mins = Math.floor(decimalPace);
    const secs = Math.round((decimalPace - mins) * 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatDuration = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  };

  return (
    <div className="stride-app">
      {/* Header — shared shell used by every Zenith app; Stride has no page-level
          tabs (single-page app), so tabs is simply omitted. */}
      <ZenithPageHeader
        appName="STRIDE"
        subtitle="Running & Treadmill Performance"
        actions={
          <>
            <button className="zenith-header-btn zenith-header-btn--primary" onClick={() => setIsRunModalOpen(true)}>
              <Plus size={14} />
              <span>Log Manually</span>
            </button>
            <button className="zenith-header-btn" onClick={() => setIsGpxModalOpen(true)}>
              <UploadCloud size={14} />
              <span>Import GPX</span>
            </button>
            <button className="zenith-header-btn" onClick={() => setIsIntegrationsModalOpen(true)}>
              <Zap size={14} style={{ color: '#f59e0b' }} />
              <span>Polar / Strava Import</span>
            </button>
            <button className="zenith-header-btn" onClick={() => setIsShoeModalOpen(true)}>
              <Footprints size={14} />
              <span>Shoes ({shoes.filter(s => !s.retired).length})</span>
            </button>
          </>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>
      {/* Which period the headline figures cover. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['7d', '30d', '90d', 'all'] as StridePeriod[]).map(p => (
          <button
            key={p}
            type="button"
            className={`filter-chip ${period === p ? 'active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {STRIDE_PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* A shoe past its stated life was tracked and never mentioned. */}
      {shoeWarnings.length > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
          fontSize: 12,
          color: '#fcd34d'
        }}>
          {shoeWarnings.map(w => (
            <div key={w.shoe.id}>
              <strong>{w.shoe.brand} {w.shoe.model}</strong>{' '}
              {w.state === 'due'
                ? `is ${Math.abs(w.remainingKm).toFixed(0)} km past its ${w.shoe.maxDistanceKm} km life — worth replacing.`
                : `has ${w.remainingKm.toFixed(0)} km left of its ${w.shoe.maxDistanceKm} km life.`}
            </div>
          ))}
        </div>
      )}

      {/* Hero Metric + Supporting Stats */}
      <div className="zenith-grid-12" style={{ marginBottom: 20 }}>
        <div className="zenith-span-8">
          <ZenithHeroStat
            eyebrow={`Distance · ${STRIDE_PERIOD_LABELS[period]}`}
            value={<>{periodSummary.distanceKm.toFixed(1)} <small>km</small></>}
            sub={
              period === 'all'
                ? `Including ${totalTreadmillKm.toFixed(1)} km on treadmill`
                : `${periodSummary.runs} run${periodSummary.runs === 1 ? '' : 's'} · ${totalKm.toFixed(1)} km all time`
            }
          />
        </div>
        <div className="zenith-span-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', flex: 1 }}>
            <div className="zenith-label">Running Time</div>
            <div className="zenith-stat-value" style={{ marginTop: 4 }}>{formatDuration(periodSummary.durationSec)}</div>
            <span className="kpi-subtext">{periodSummary.runs} session{periodSummary.runs === 1 ? '' : 's'} in this period &middot; {runs.length} all time</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', flex: 1 }}>
            <div className="zenith-label">Average Pace</div>
            <div className="zenith-stat-value" style={{ marginTop: 4 }}>{periodSummary.avgPaceMinKm !== null ? <>{formatPace(periodSummary.avgPaceMinKm)} <small>/km</small></> : '–:––'}</div>
            {/* "Strong aerobic efficiency" was printed here whatever the pace was -
                a compliment with nothing behind it. What is useful is which runs the
                average covers, since the ones without a distance are left out. */}
            <span className="kpi-subtext">
              {periodSummary.avgPaceMinKm === null
                ? 'No run in this period recorded a distance'
                : `Across ${periodSummary.runs - periodSummary.runsWithoutDistance} run${periodSummary.runs - periodSummary.runsWithoutDistance === 1 ? '' : 's'} with a distance` +
                  (periodSummary.runsWithoutDistance > 0
                    ? `, ${periodSummary.runsWithoutDistance} without one excluded`
                    : '')}
            </span>
          </div>
        </div>
      </div>

      {/* Analysis. Stride was a logbook - totals, a table, a detail modal - while
          every other app here answers a question about whether things are going
          well. These are the running equivalents, and each says nothing rather
          than guessing when the data cannot support it. */}
      <div className="stride-kpi-grid" style={{ marginBottom: 32 }}>
        <div className="kpi-card">
          <div className="kpi-icon-wrapper purple"><Activity size={20} /></div>
          <div>
            <span className="kpi-label">Running Form</span>
            {form === null ? (
              <>
                <span className="kpi-value">&mdash;</span>
                <span className="kpi-subtext">Log a run to start building this</span>
              </>
            ) : (
              <>
                <span className="kpi-value" style={{ color: interpretTSB(form.form).color }}>
                  {form.form > 0 ? '+' : ''}{form.form}
                </span>
                <span className="kpi-subtext">
                  {interpretTSB(form.form).label} &middot; fitness {form.fitness}, fatigue {form.fatigue}
                  {form.daysOfHistory < 28 ? ` · only ${form.daysOfHistory} days of history so far` : ''}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
            <Zap size={20} />
          </div>
          <div>
            <span className="kpi-label">Pace at Steady Effort</span>
            {economy.value === null ? (
              <>
                <span className="kpi-value">&mdash;</span>
                <span className="kpi-subtext">{economy.note}</span>
              </>
            ) : (
              <>
                <span className="kpi-value">{formatPace(economy.value)} <small>/km</small></span>
                <span
                  className="kpi-subtext"
                  style={{ color: economy.direction === 'up' ? '#22c55e' : economy.direction === 'down' ? '#f87171' : undefined }}
                >
                  {economy.changePct === null
                    ? economy.note
                    : `${economy.changePct > 0 ? 'Faster' : 'Slower'} by ${Math.abs(economy.changePct).toFixed(1)}% than the ${economy.windowDays} days before, at the same heart rate`}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>
            <Heart size={20} />
          </div>
          <div>
            <span className="kpi-label">Easy vs Hard</span>
            {mix.easyShare === null ? (
              <>
                <span className="kpi-value">&mdash;</span>
                <span className="kpi-subtext">
                  {mix.unknownRuns > 0
                    ? `${mix.unknownRuns} run${mix.unknownRuns === 1 ? '' : 's'} here recorded no heart rate`
                    : 'No runs in this period'}
                </span>
              </>
            ) : (
              <>
                <span className="kpi-value">{Math.round(mix.easyShare * 100)}<small>% easy</small></span>
                <span className="kpi-subtext">
                  {mix.easyRuns} easy, {mix.hardRuns} hard{mix.unknownRuns > 0 ? `, ${mix.unknownRuns} unknown` : ''}
                  {' '}&middot; under {Math.round(mix.maxHrUsed * 0.8)} bpm counts as easy
                </span>
              </>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper purple"><Layers size={20} /></div>
          <div>
            <span className="kpi-label">Treadmill</span>
            <span className="kpi-value">{periodRuns.filter(r => r.isTreadmill).length} <small>of {periodSummary.runs}</small></span>
            <span className="kpi-subtext">Indoor sessions in this period</span>
          </div>
        </div>
      </div>

      {/* Fastest whole runs. Deliberately not called a 5 km personal best: without
          splits the fastest 5 km inside a longer run is unknowable, and calling a
          whole-run average a PB would flatter every long run ever logged. */}
      {bests.length > 0 && (
        <div className="stride-content-section" style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Award size={14} style={{ color: '#f59e0b' }} /> Fastest runs by distance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {bests.map(best => (
              <div
                key={best.minimumKm}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  padding: '14px 16px'
                }}
              >
                <div className="zenith-label">{best.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0' }}>
                  {formatPace(best.paceMinKm)} <small style={{ fontSize: 12 }}>/km</small>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {best.run.title || 'Run'} &middot; {best.run.distanceKm.toFixed(1)} km &middot; {best.run.date}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '10px 0 0' }}>
            Average pace across a whole run of at least that distance &mdash; not a
            split-based personal best, which needs per-kilometre data no run here carries yet.
          </p>
        </div>
      )}

      {/* Activity History & Filter Controls */}
      <div className="stride-content-section">
        <div className="content-toolbar">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by title or shoe..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-chips">
            {availableFilters.map(chip => (
              <button 
                key={chip.id} 
                className={`filter-chip ${filterType === chip.id ? 'active' : ''}`}
                onClick={() => setFilterType(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Activity Table */}
        <div className="stride-activity-table">
          <div className="table-header">
            <span>Date & Title</span>
            <span>Type & Mode</span>
            <span>Distance</span>
            <span>Pace</span>
            <span>Heart Rate / Cadence</span>
            <span>Shoe / Source</span>
            <span>Action</span>
          </div>

          {filteredRuns.length === 0 && authFailed && (
            <ZenithEmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 7v4" />
                  <path d="M10 14h.01" />
                  <circle cx="10" cy="10" r="7" />
                </svg>
              }
              title="Could not read your runs"
              message="Stride is not signed in, so it cannot tell whether you have runs logged. Reload the page from the Zenith hub; if it keeps happening, sign out and back in."
              action={
                <button className="btn-action primary" onClick={() => window.location.reload()}>
                  <span>Reload</span>
                </button>
              }
            />
          )}

          {filteredRuns.length === 0 && !authFailed && (
            <ZenithEmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 18s6-5.686 6-10.5A6 6 0 0 0 4 7.5C4 12.314 10 18 10 18Z" />
                  <circle cx="10" cy="7.5" r="2" />
                </svg>
              }
              title="No runs logged yet"
              message="Add one manually, or import from GPX/TCX to see your pace and trends here."
              action={
                <button className="btn-action primary" onClick={() => setIsRunModalOpen(true)}>
                  <Plus size={16} />
                  <span>Log Manually</span>
                </button>
              }
            />
          )}

          {filteredRuns.map(run => (
            <div key={run.id} className="table-row" onClick={() => setSelectedRunDetail(run)}>
              <div className="col-title">
                <div className="run-type-icon">
                  {run.isTreadmill ? <Layers size={16} style={{ color: '#38bdf8' }} /> : <Footprints size={16} style={{ color: '#10b981' }} />}
                </div>
                <div>
                  <strong className="run-name">{run.title}</strong>
                  <span className="run-date">{run.date} {run.timeOfDay ? `at ${run.timeOfDay}` : ''}</span>
                </div>
              </div>

              <div className="col-type">
                <span className={`type-badge ${run.isTreadmill ? 'treadmill' : run.type}`}>
                  {run.isTreadmill ? `Treadmill (${run.inclinePercent || 0}%)` : run.type.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              <div className="col-dist">
                <strong className="dist-num">{run.distanceKm} km</strong>
              </div>

              <div className="col-pace">
                <span className="pace-num">{formatPace(run.avgPaceMinKm)} /km</span>
                <span className="duration-small">{formatDuration(run.durationSec)}</span>
              </div>

              <div className="col-metrics">
                {run.avgHeartRate ? (
                  <span className="hr-tag">
                    <Heart size={12} style={{ color: '#ef4444' }} /> {run.avgHeartRate} bpm
                  </span>
                ) : (
                  <span className="hr-tag muted">-</span>
                )}
                {run.avgCadenceSpm && (
                  <span className="spm-tag">{run.avgCadenceSpm} spm</span>
                )}
              </div>

              <div className="col-shoe">
                <span className="shoe-name">{run.shoeName || 'Standard'}</span>
                <span className="source-tag">{run.source.toUpperCase()}</span>
              </div>

              <div className="col-action">
                <button className="btn-detail">
                  <span>Details</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* Activity Detail Modal */}
      {selectedRunDetail && (
        <div className="stride-modal-backdrop" onClick={() => setSelectedRunDetail(null)}>
          <div className="stride-modal-container detail-modal" onClick={e => e.stopPropagation()}>
            <div className="stride-modal-header">
              <div>
                <span className="detail-category">
                  {selectedRunDetail.isTreadmill ? 'Treadmill Session (Indoor)' : 'Outdoor Run'}
                </span>
                <h3>{selectedRunDetail.title}</h3>
                <p className="subtitle">{selectedRunDetail.date} • Source: {selectedRunDetail.source.toUpperCase()}</p>
              </div>
              <button className="stride-close-btn" aria-label="Close" onClick={() => setSelectedRunDetail(null)}>✕</button>
            </div>

            <div className="stride-modal-body">
              <div className="detail-metrics-grid">
                <div className="detail-stat-box">
                  <span className="stat-label">Distance</span>
                  <span className="stat-val">{selectedRunDetail.distanceKm > 0 ? `${selectedRunDetail.distanceKm} km` : '0 km (Indoor)'}</span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Total Duration</span>
                  <span className="stat-val">{formatDuration(selectedRunDetail.durationSec)}</span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Avg Pace</span>
                  <span className="stat-val">{selectedRunDetail.avgPaceMinKm > 0 ? `${formatPace(selectedRunDetail.avgPaceMinKm)} /km` : '0:00 /km'}</span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">{selectedRunDetail.isTreadmill ? 'Treadmill Incline' : 'Elevation Gain'}</span>
                  <span className="stat-val">
                    {selectedRunDetail.isTreadmill ? `${selectedRunDetail.inclinePercent || 0}%` : `${selectedRunDetail.elevationGainM} m`}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Avg Heart Rate</span>
                  <span className="stat-val" style={{ color: '#ef4444' }}>
                    {selectedRunDetail.avgHeartRate ? `${selectedRunDetail.avgHeartRate} bpm` : '-'}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Max Heart Rate</span>
                  <span className="stat-val" style={{ color: '#f87171' }}>
                    {selectedRunDetail.maxHeartRate ? `${selectedRunDetail.maxHeartRate} bpm` : '-'}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Calories Burned</span>
                  <span className="stat-val" style={{ color: '#f59e0b' }}>
                    {selectedRunDetail.calories ? `${selectedRunDetail.calories} kcal` : '-'}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Step Frequency (Cadence)</span>
                  <span className="stat-val" style={{ color: '#38bdf8' }}>
                    {selectedRunDetail.avgCadenceSpm ? `${selectedRunDetail.avgCadenceSpm} spm` : '-'}
                  </span>
                </div>
              </div>

              {selectedRunDetail.avgHeartRate && (
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Heart Rate Summary - only the values actually recorded for this run.
                      No per-minute trace or zone breakdown is stored, so none is shown here
                      rather than fabricating one. */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '20px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <h4 style={{ margin: '0 0 14px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Heart size={14} style={{ color: '#ef4444' }} /> Heart Rate Summary
                    </h4>
                    <div style={{ display: 'flex', gap: 24 }}>
                      <div>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>Average</span>
                        <strong style={{ fontSize: 20, color: '#ef4444' }}>{selectedRunDetail.avgHeartRate} bpm</strong>
                      </div>
                      {selectedRunDetail.maxHeartRate && (
                        <div>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>Peak</span>
                          <strong style={{ fontSize: 20, color: '#ef4444' }}>{selectedRunDetail.maxHeartRate} bpm</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Per-km heart rate, when splits recorded it - real data, not a fabricated series */}
                  {selectedRunDetail.splits && selectedRunDetail.splits.some(s => s.hr) && (
                    <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '20px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <h4 style={{ margin: '0 0 14px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#cbd5e1' }}>
                        Heart Rate per Kilometer
                      </h4>
                      <div style={{ height: 140, width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={selectedRunDetail.splits.map(s => ({ km: `${s.km}`, bpm: s.hr || 0 }))} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid {...ZENITH_CHART_GRID} />
                            <XAxis dataKey="km" stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                            <YAxis domain={['dataMin - 10', 'dataMax + 10']} stroke="var(--text-muted)" tick={ZENITH_CHART_AXIS_TICK} tickLine={false} />
                            <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE} />
                            <Bar dataKey="bpm" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedRunDetail.splits && selectedRunDetail.splits.length > 0 && (
                <div className="detail-splits-section">
                  <h4>Kilometer Splits Breakdown</h4>
                  <div className="splits-table">
                    <div className="split-header">
                      <span>Kilometer</span>
                      <span>Pace min/km</span>
                      <span>Avg Heart Rate</span>
                      <span>Elevation</span>
                    </div>
                    {selectedRunDetail.splits.map(s => (
                      <div key={s.km} className="split-row">
                        <span>km {s.km}</span>
                        <span>{formatPace(s.paceMinKm)} /km</span>
                        <span>{s.hr ? `${s.hr} bpm` : '-'}</span>
                        <span>+{s.elevationGain || 0}m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRunDetail.notes && (
                <div className="detail-notes-box" style={{ marginTop: 20 }}>
                  <strong>Athlete Notes & Integration Log:</strong>
                  <p>{selectedRunDetail.notes}</p>
                </div>
              )}
            </div>

            <div className="stride-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <button
                className="btn-cancel"
                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                onClick={() => {
                  const id = selectedRunDetail.id;
                  setSelectedRunDetail(null);
                  handleDeleteRun(id);
                }}
              >
                Delete run
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-cancel"
                  onClick={() => {
                    setEditingRun(selectedRunDetail);
                    setSelectedRunDetail(null);
                    setIsRunModalOpen(true);
                  }}
                >
                  Edit
                </button>
                <button className="btn-cancel" onClick={() => setSelectedRunDetail(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <RunModal
        // Keyed so the form re-seeds from whichever run is being edited. Without it
        // the fields keep the values they were first mounted with.
        key={editingRun ? `edit-${editingRun.id}` : 'new'}
        isOpen={isRunModalOpen}
        onClose={() => { setIsRunModalOpen(false); setEditingRun(null); }}
        onSave={run => {
          if (editingRun) handleUpdateRun(run);
          else handleSaveRun(run);
          setEditingRun(null);
        }}
        shoes={shoes}
        initialRun={editingRun}
      />

      <GpxImportModal
        isOpen={isGpxModalOpen}
        onClose={() => setIsGpxModalOpen(false)}
        onImport={handleSaveRun}
      />

      <ImportIntegrationsModal
        isOpen={isIntegrationsModalOpen}
        onClose={() => setIsIntegrationsModalOpen(false)}
        onImport={handleSaveRun}
      />

      <ShoeTrackerModal
        isOpen={isShoeModalOpen}
        onClose={() => setIsShoeModalOpen(false)}
        shoes={shoes}
        onAddShoe={handleAddShoe}
        onToggleRetire={handleToggleRetireShoe}
      />
    </div>
  );
}
