import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './utils/supabaseClient';
import { ZenithHeroStat, ZenithEmptyState, ZenithPageHeader, ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
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
  const [isGpxModalOpen, setIsGpxModalOpen] = useState(false);
  const [isIntegrationsModalOpen, setIsIntegrationsModalOpen] = useState(false);
  const [isShoeModalOpen, setIsShoeModalOpen] = useState(false);
  const [selectedRunDetail, setSelectedRunDetail] = useState<RunActivity | null>(null);

  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load activities directly from Supabase stride_activities table
  useEffect(() => {
    async function loadActivitiesFromDb() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) {
          console.warn('Cannot load stride activities: User is not authenticated.');
          return;
        }
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
            shoeName: act.shoe_name || 'Samsung Fit',
            source: (act.source as any) || 'health_connect',
            notes: act.notes,
            splits: act.splits
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
  const totalKm = useMemo(() => runs.reduce((acc, r) => acc + r.distanceKm, 0), [runs]);
  const totalDurationSec = useMemo(() => runs.reduce((acc, r) => acc + r.durationSec, 0), [runs]);
  const totalTreadmillKm = useMemo(() => runs.filter(r => r.isTreadmill).reduce((acc, r) => acc + r.distanceKm, 0), [runs]);
  const avgPace = useMemo(() => {
    if (runs.length === 0 || totalKm === 0) return null;
    return (totalDurationSec / 60) / totalKm;
  }, [runs, totalKm, totalDurationSec]);

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
        shoe_name: newRun.shoeName,
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

  const handleDeleteRun = async (runId: string) => {
    const target = runs.find(r => r.id === runId);
    if (!target) return;
    if (!window.confirm(`Delete "${target.title}"? This can't be undone.`)) return;

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
        window.alert('Could not delete that run. Please try again.');
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
      {/* Hero Metric + Supporting Stats */}
      <div className="zenith-grid-12" style={{ marginBottom: 20 }}>
        <div className="zenith-span-8">
          <ZenithHeroStat
            eyebrow="Total Distance"
            value={<>{totalKm.toFixed(1)} <small>km</small></>}
            sub={`Including ${totalTreadmillKm.toFixed(1)} km on treadmill`}
          />
        </div>
        <div className="zenith-span-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', flex: 1 }}>
            <div className="zenith-label">Total Running Time</div>
            <div className="zenith-stat-value" style={{ marginTop: 4 }}>{formatDuration(totalDurationSec)}</div>
            <span className="kpi-subtext">{runs.length} total recorded sessions</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', flex: 1 }}>
            <div className="zenith-label">Average Pace</div>
            <div className="zenith-stat-value" style={{ marginTop: 4 }}>{avgPace !== null ? <>{formatPace(avgPace)} <small>/km</small></> : '–:––'}</div>
            <span className="kpi-subtext">{avgPace !== null ? 'Strong aerobic efficiency' : 'No data yet'}</span>
          </div>
        </div>
      </div>

      {/* Treadmill Volume */}
      <div className="stride-kpi-grid" style={{ marginBottom: 32 }}>
        <div className="kpi-card">
          <div className="kpi-icon-wrapper purple">
            <Layers size={20} />
          </div>
          <div>
            <span className="kpi-label">Treadmill Volume</span>
            <span className="kpi-value">{runs.filter(r => r.isTreadmill).length} <small>sessions</small></span>
            <span className="kpi-subtext">Incline indoor training</span>
          </div>
        </div>
      </div>

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
            {[
              { id: 'all', label: 'All Runs' },
              { id: 'treadmill', label: 'Treadmill' },
              { id: 'long_run', label: 'Long Run' },
              { id: 'intervals', label: 'Intervals' },
              { id: 'easy', label: 'Easy Run' },
              { id: 'trail', label: 'Trail' }
            ].map(chip => (
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

          {filteredRuns.length === 0 && (
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
              <button className="btn-cancel" onClick={() => setSelectedRunDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <RunModal
        isOpen={isRunModalOpen}
        onClose={() => setIsRunModalOpen(false)}
        onSave={handleSaveRun}
        shoes={shoes}
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
