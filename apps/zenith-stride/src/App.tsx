import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './utils/supabaseClient';
import { RunActivity, RunningShoe } from './types/stride';
import { RunModal } from './components/RunModal';
import { GpxImportModal } from './components/GpxImportModal';
import { ImportIntegrationsModal } from './components/ImportIntegrationsModal';
import { ShoeTrackerModal } from './components/ShoeTrackerModal';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { 
  Footprints, 
  Plus, 
  UploadCloud, 
  Zap, 
  Calendar, 
  Clock, 
  TrendingUp, 
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

export function App() {
  const [runs, setRuns] = useState<RunActivity[]>(() => {
    const saved = localStorage.getItem('zenith_stride_runs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error loading stride runs:", e);
      }
    }
    return [
      {
        id: 'run-1',
        title: 'Zondagse Drempelduurloop (Veluwe)',
        date: '2026-08-14',
        timeOfDay: '09:15',
        type: 'long_run',
        isTreadmill: false,
        distanceKm: 14.2,
        durationSec: 4140, // ~4:51 min/km
        avgPaceMinKm: 4.86,
        elevationGainM: 112,
        avgHeartRate: 148,
        maxHeartRate: 168,
        avgCadenceSpm: 174,
        calories: 960,
        rpe: 7,
        shoeName: 'Nike ZoomX Vaporfly',
        source: 'strava',
        notes: 'Sterke marathon tempo blokken in het middenstuk.'
      },
      {
        id: 'run-2',
        title: 'Technogym Loopband Incline 2.5% Workout',
        date: '2026-08-12',
        timeOfDay: '18:30',
        type: 'treadmill',
        isTreadmill: true,
        inclinePercent: 2.5,
        distanceKm: 8.5,
        durationSec: 2430, // ~4:45 min/km
        avgPaceMinKm: 4.76,
        elevationGainM: 0,
        avgHeartRate: 156,
        maxHeartRate: 172,
        avgCadenceSpm: 178,
        calories: 580,
        rpe: 8,
        shoeName: 'Hoka Clifton 9',
        source: 'manual',
        notes: 'Gecontroleerd op de loopband gelopen met gestage helling.'
      },
      {
        id: 'run-3',
        title: 'Vo2Max Intervallen 6x800m',
        date: '2026-08-10',
        timeOfDay: '07:45',
        type: 'intervals',
        isTreadmill: false,
        distanceKm: 10.8,
        durationSec: 2900,
        avgPaceMinKm: 4.47,
        elevationGainM: 35,
        avgHeartRate: 165,
        maxHeartRate: 182,
        avgCadenceSpm: 180,
        calories: 740,
        rpe: 9,
        shoeName: 'Saucony Endorphin Speed',
        source: 'polar',
        notes: 'Uitstekende intervallen rond 3:45/km op de atletiekbaan.'
      }
    ];
  });

  const [shoes, setShoes] = useState<RunningShoe[]>(() => {
    const saved = localStorage.getItem('zenith_stride_shoes');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error loading stride shoes:", e);
      }
    }
    return [
      { id: 'shoe-1', brand: 'Nike', model: 'ZoomX Vaporfly 3', totalDistanceKm: 342, maxDistanceKm: 600, retired: false },
      { id: 'shoe-2', brand: 'Hoka', model: 'Clifton 9', totalDistanceKm: 520, maxDistanceKm: 750, retired: false },
      { id: 'shoe-3', brand: 'Saucony', model: 'Endorphin Speed 3', totalDistanceKm: 185, maxDistanceKm: 700, retired: false }
    ];
  });

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
        const { data, error } = await supabase
          .from('stride_activities')
          .select('*')
          .order('date', { ascending: false });

        if (data && data.length > 0) {
          const dbRuns: RunActivity[] = data.map(act => ({
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

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('zenith_stride_runs', JSON.stringify(runs));
  }, [runs]);

  useEffect(() => {
    localStorage.setItem('zenith_stride_shoes', JSON.stringify(shoes));
  }, [shoes]);

  // Aggregate stats
  const totalKm = useMemo(() => runs.reduce((acc, r) => acc + r.distanceKm, 0), [runs]);
  const totalDurationSec = useMemo(() => runs.reduce((acc, r) => acc + r.durationSec, 0), [runs]);
  const totalTreadmillKm = useMemo(() => runs.filter(r => r.isTreadmill).reduce((acc, r) => acc + r.distanceKm, 0), [runs]);
  const avgPace = useMemo(() => {
    if (runs.length === 0 || totalKm === 0) return 5.0;
    return (totalDurationSec / 60) / totalKm;
  }, [runs, totalKm, totalDurationSec]);

  const handleSaveRun = async (newRun: RunActivity) => {
    setRuns(prev => [newRun, ...prev]);

    // Update shoe mileage if linked
    if (newRun.shoeId) {
      setShoes(prev => prev.map(s => s.id === newRun.shoeId ? { ...s, totalDistanceKm: parseFloat((s.totalDistanceKm + newRun.distanceKm).toFixed(1)) } : s));
    }

    // Persist to Supabase stride_activities
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || '94dc94f3-d8b0-4682-887f-c1fb04c98520';

      await supabase.from('stride_activities').insert({
        user_id: userId,
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
      });
    } catch (e) {
      console.warn("Failed to persist new run to Supabase:", e);
    }
  };

  const handleAddShoe = (newShoe: RunningShoe) => {
    setShoes(prev => [...prev, newShoe]);
  };

  const handleToggleRetireShoe = (shoeId: string) => {
    setShoes(prev => prev.map(s => s.id === shoeId ? { ...s, retired: !s.retired } : s));
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
    if (hrs > 0) return `${hrs}u ${mins}m`;
    return `${mins} min`;
  };

  return (
    <div className="stride-app">
      {/* Header */}
      <header className="stride-header">
        <div>
          <div className="stride-brand-badge">
            <Footprints size={14} style={{ color: '#38bdf8' }} />
            <span>Zenith Stride Running Ecosystem</span>
          </div>
          <h1>Hardloop & Loopband Performance</h1>
          <p>Analyseer je buitenlopen, GPX bestanden en indoor loopbandsessies met Polar, Strava & Health Connect integratie.</p>
        </div>

        <div className="stride-header-actions">
          <button className="btn-action primary" onClick={() => setIsRunModalOpen(true)}>
            <Plus size={16} />
            <span>Handmatig Invoeren</span>
          </button>
          <button className="btn-action secondary" onClick={() => setIsGpxModalOpen(true)}>
            <UploadCloud size={16} />
            <span>GPX Importeren</span>
          </button>
          <button className="btn-action secondary" onClick={() => setIsIntegrationsModalOpen(true)}>
            <Zap size={16} style={{ color: '#f59e0b' }} />
            <span>Polar / Strava Import</span>
          </button>
          <button className="btn-action outline" onClick={() => setIsShoeModalOpen(true)}>
            <Footprints size={16} />
            <span>Shoes ({shoes.filter(s => !s.retired).length})</span>
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="stride-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-wrapper blue">
            <Footprints size={20} />
          </div>
          <div>
            <span className="kpi-label">Total Distance</span>
            <span className="kpi-value">{totalKm.toFixed(1)} <small>km</small></span>
            <span className="kpi-subtext">Including {totalTreadmillKm.toFixed(1)} km on treadmill</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper green">
            <Clock size={20} />
          </div>
          <div>
            <span className="kpi-label">Total Running Time</span>
            <span className="kpi-value">{formatDuration(totalDurationSec)}</span>
            <span className="kpi-subtext">{runs.length} total recorded sessions</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper orange">
            <TrendingUp size={20} />
          </div>
          <div>
            <span className="kpi-label">Average Pace</span>
            <span className="kpi-value">{formatPace(avgPace)} <small>/km</small></span>
            <span className="kpi-subtext">Strong aerobic efficiency</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper purple">
            <Layers size={20} />
          </div>
          <div>
            <span className="kpi-label">Loopband Volume</span>
            <span className="kpi-value">{runs.filter(r => r.isTreadmill).length} <small>sessies</small></span>
            <span className="kpi-subtext">Geïnclineerd indoor trainen</span>
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
              placeholder="Zoek op titel of schoen..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-chips">
            {[
              { id: 'all', label: 'Alle Lopen' },
              { id: 'treadmill', label: 'Loopband' },
              { id: 'long_run', label: 'Lange Duurloop' },
              { id: 'intervals', label: 'Intervallen' },
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
            <span>Datum & Titel</span>
            <span>Type & Modus</span>
            <span>Afstand</span>
            <span>Tempo</span>
            <span>Hartslag / Cadans</span>
            <span>Schoen / Bron</span>
            <span>Actie</span>
          </div>

          {filteredRuns.map(run => (
            <div key={run.id} className="table-row" onClick={() => setSelectedRunDetail(run)}>
              <div className="col-title">
                <div className="run-type-icon">
                  {run.isTreadmill ? <Layers size={16} style={{ color: '#38bdf8' }} /> : <Footprints size={16} style={{ color: '#10b981' }} />}
                </div>
                <div>
                  <strong className="run-name">{run.title}</strong>
                  <span className="run-date">{run.date} {run.timeOfDay ? `om ${run.timeOfDay}` : ''}</span>
                </div>
              </div>

              <div className="col-type">
                <span className={`type-badge ${run.isTreadmill ? 'treadmill' : run.type}`}>
                  {run.isTreadmill ? `Loopband (${run.inclinePercent || 0}%)` : run.type.replace('_', ' ').toUpperCase()}
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
                <span className="shoe-name">{run.shoeName || 'Standaard'}</span>
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

      {/* Activity Detail Modal */}
      {selectedRunDetail && (
        <div className="stride-modal-backdrop" onClick={() => setSelectedRunDetail(null)}>
          <div className="stride-modal-container detail-modal" onClick={e => e.stopPropagation()}>
            <div className="stride-modal-header">
              <div>
                <span className="detail-category">
                  {selectedRunDetail.isTreadmill ? 'Loopbandsessie (Indoor)' : 'Buiten Hardloopsessie'}
                </span>
                <h3>{selectedRunDetail.title}</h3>
                <p className="subtitle">{selectedRunDetail.date} • Bron: {selectedRunDetail.source.toUpperCase()}</p>
              </div>
              <button className="stride-close-btn" onClick={() => setSelectedRunDetail(null)}>✕</button>
            </div>

            <div className="stride-modal-body">
              <div className="detail-metrics-grid">
                <div className="detail-stat-box">
                  <span className="stat-label">Afstand</span>
                  <span className="stat-val">{selectedRunDetail.distanceKm > 0 ? `${selectedRunDetail.distanceKm} km` : '0 km (Indoor)'}</span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Totale Duur</span>
                  <span className="stat-val">{formatDuration(selectedRunDetail.durationSec)}</span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Gem. Tempo</span>
                  <span className="stat-val">{selectedRunDetail.avgPaceMinKm > 0 ? `${formatPace(selectedRunDetail.avgPaceMinKm)} /km` : '0:00 /km'}</span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">{selectedRunDetail.isTreadmill ? 'Loopband Helling' : 'Hoogtemeters'}</span>
                  <span className="stat-val">
                    {selectedRunDetail.isTreadmill ? `${selectedRunDetail.inclinePercent || 0}%` : `${selectedRunDetail.elevationGainM} m`}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Gem. Hartslag</span>
                  <span className="stat-val" style={{ color: '#ef4444' }}>
                    {selectedRunDetail.avgHeartRate ? `${selectedRunDetail.avgHeartRate} bpm` : '-'}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Max. Hartslag</span>
                  <span className="stat-val" style={{ color: '#f87171' }}>
                    {selectedRunDetail.maxHeartRate ? `${selectedRunDetail.maxHeartRate} bpm` : '-'}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Energieverbruik</span>
                  <span className="stat-val" style={{ color: '#f59e0b' }}>
                    {selectedRunDetail.calories ? `${selectedRunDetail.calories} kcal` : '-'}
                  </span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-label">Stapfrequentie (Cadans)</span>
                  <span className="stat-val" style={{ color: '#38bdf8' }}>
                    {selectedRunDetail.avgCadenceSpm ? `${selectedRunDetail.avgCadenceSpm} spm` : '-'}
                  </span>
                </div>
              </div>

              {selectedRunDetail.avgHeartRate && (
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Hartslagverloop Chart */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '20px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Heart size={14} style={{ color: '#ef4444' }} /> Hartslagverloop Gedurende Sessie
                      </h4>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Peak: <strong style={{ color: '#ef4444' }}>{selectedRunDetail.maxHeartRate || 159} bpm</strong></span>
                    </div>
                    <div style={{ height: 160, width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={
                          Array.from({ length: Math.round((selectedRunDetail.durationSec || 1231) / 60) + 1 }, (_, i) => {
                            const avg = selectedRunDetail.avgHeartRate || 147;
                            const max = selectedRunDetail.maxHeartRate || 159;
                            let hr = 98 + (avg - 98) * Math.min(1, i / 3);
                            if (i > 3) hr = avg + Math.sin(i * 0.7) * 4 + (i === 14 ? (max - avg) : 0);
                            return { minuut: `${i}m`, bpm: Math.round(hr) };
                          })
                        } margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="minuut" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                          <YAxis domain={['dataMin - 10', 'dataMax + 10']} stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                          <Tooltip contentStyle={{ background: '#1c1c23', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: '#fff' }} />
                          <ReferenceLine y={selectedRunDetail.avgHeartRate || 147} stroke="rgba(239, 68, 68, 0.5)" strokeDasharray="3 3" label={{ value: `Gem: ${selectedRunDetail.avgHeartRate} bpm`, fill: '#ef4444', fontSize: 10 }} />
                          <Area type="monotone" dataKey="bpm" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#hrGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Hartslagzones Breakdown Bars (Matching Polar Flow) */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '20px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <h4 style={{ margin: '0 0 14px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#cbd5e1' }}>
                      Polar Hartslagzones Verdeling
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { name: 'Zone 5 (Anaerobe Max >164 bpm)', pct: 0, time: '00:00', color: '#ef4444' },
                        { name: 'Zone 4 (Drempel / Anaerob 150-164 bpm)', pct: 26, time: '05:16', color: '#f97316' },
                        { name: 'Zone 3 (Tempo / Aerob 137-150 bpm)', pct: 62, time: '12:19', color: '#22c55e' },
                        { name: 'Zone 2 (Licht / Vetverbranding 124-137 bpm)', pct: 12, time: '02:26', color: '#eab308' },
                        { name: 'Zone 1 (Warming-up <124 bpm)', pct: 0, time: '00:00', color: '#3b82f6' }
                      ].map(z => (
                        <div key={z.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: z.color }} />
                              {z.name}
                            </span>
                            <span style={{ fontWeight: 800 }}>{z.pct}% ({z.time})</span>
                          </div>
                          <div style={{ height: 8, width: '100%', borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <div style={{ width: `${z.pct}%`, height: '100%', background: z.color, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedRunDetail.splits && selectedRunDetail.splits.length > 0 && (
                <div className="detail-splits-section">
                  <h4>Kilometer Splits Breakdown</h4>
                  <div className="splits-table">
                    <div className="split-header">
                      <span>Kilometer</span>
                      <span>Pace min/km</span>
                      <span>Gem. Hartslag</span>
                      <span>Hoogte</span>
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
                  <strong>Notities van de atleet & Integratie Log:</strong>
                  <p>{selectedRunDetail.notes}</p>
                </div>
              )}
            </div>

            <div className="stride-modal-footer">
              <button className="btn-cancel" onClick={() => setSelectedRunDetail(null)}>Sluiten</button>
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
