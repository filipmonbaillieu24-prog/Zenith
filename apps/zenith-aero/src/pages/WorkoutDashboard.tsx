import React, { useState, useEffect, useMemo } from 'react';
import '../workout.css';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { deleteRide, getAllGear } from '../utils/db';
import {
  Ride, FitnessProfile, POWER_ZONES, Gear, RIDE_LABELS,
} from '../types/workout';
import HeatmapView from './HeatmapView';
import { Bike } from 'lucide-react';

// Import extracted modular components
import { fmtDur } from '../components/workout/ZoneBar';
import { MiniRoutePreview } from '../components/workout/MiniRoutePreview';
import { computePMC, interpretTSB, buildTrainingLoadPool } from '../utils/pmc';
import { DashboardStatsHeader } from '../components/dashboard/DashboardStatsHeader';
// Extracted helpers & modules
import {
  fmtShortDate,
  computeEFTrend,
  buildWeeklyTSS,
  buildMonthlyStats,
  computeGlobalBests
} from '../utils/dashboardHelpers';
import { PRSection } from '../components/dashboard/PRSection';
import { RideListSection } from '../components/dashboard/RideListSection';

type RideSummaryWithBests = Omit<Ride, 'points'>;

interface Props {
  onSelectRide:    (id: string) => void;
  selectedRideId?: string | null;
  compareRideId?:  string | null;
  onCompareRide?:  (id: string) => void;
  rideIsOpen?:     boolean;
  profile:         FitnessProfile;
  rides:           RideSummaryWithBests[];
  kratosWorkouts?: any[];
  strideRuns?: any[];
  reloadRides:     () => void;
  globaleFTP:      number;
  recalculating:   boolean;
  navSection:      'dashboard' | 'rides' | 'prs' | 'heatmap';
  onHandleFiles?:  (files: FileList) => void;
  isPro?:          boolean;
  onRequestProModal?: (featureName: string, desc: string) => void;
}

type SortKey    = 'date' | 'distance' | 'duration' | 'tss' | 'eftp' | 'elevGain';
type LabelFilter = any;

function TrendBadge({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) return <span className="wd-trend wd-trend--flat">→ Stable</span>;
  return value > 0
    ? <span className="wd-trend wd-trend--up">↑ {value.toFixed(1)}%</span>
    : <span className="wd-trend wd-trend--down">↓ {Math.abs(value).toFixed(1)}%</span>;
}

const WorkoutDashboard: React.FC<Props> = ({
  onSelectRide,
  selectedRideId,
  compareRideId,
  onCompareRide,
  profile,
  rides,
  kratosWorkouts = [],
  strideRuns = [],
  reloadRides,
  globaleFTP,
  recalculating,
  navSection,
  onHandleFiles,
  isPro = false,
  onRequestProModal,
}) => {
  const [loading]                           = useState(false);
  const [deleting,       setDeleting]       = useState<string | null>(null);
  const [sortKey,        setSortKey]        = useState<SortKey>('date');
  const [search,         setSearch]         = useState('');
  const [labelFilter,    setLabelFilter]    = useState<LabelFilter>('all');
  const [dragOver,       setDragOver]       = useState(false);
  const [timeRange, setTimeRange] = useState<30 | 90 | 365 | 'all'>('all');
  const [latestRideFull, setLatestRideFull] = useState<Ride | null>(null);

  const [gears, setGears] = useState<Gear[]>([]);
  useEffect(() => {
    getAllGear().then(setGears);
  }, [rides]);

  // Filter rides based on selected time range for dashboard stats & charts
  const filteredRides = useMemo(() => {
    if (timeRange === 'all') return rides;
    const cutoff = Date.now() - timeRange * 24 * 3600 * 1000;
    return rides.filter(r => r.date >= cutoff);
  }, [rides, timeRange]);

  // Load the full points array for the very latest ride to render map/power preview
  useEffect(() => {
    if (rides.length > 0) {
      const last = rides[0];
      import('../utils/db').then(m => m.getRide(last.id)).then(full => {
        if (full) setLatestRideFull(full);
      });
    } else {
      setLatestRideFull(null);
    }
  }, [rides]);

  const selectedRide = selectedRideId ?? null;
  const reload = reloadRides;


  const sortedRides = useMemo(() => {
    const filtered = rides.filter(r => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (labelFilter !== 'all' && r.label !== labelFilter) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'distance':  return b.distance  - a.distance;
        case 'duration':  return b.duration  - a.duration;
        case 'tss':       return (b.tss ?? b.hrTSS ?? 0) - (a.tss ?? a.hrTSS ?? 0);
        case 'eftp':      return (b.eFTP ?? 0) - (a.eFTP ?? 0);
        case 'elevGain':  return b.elevGain  - a.elevGain;
        default:          return b.date - a.date;
      }
    });
  }, [rides, sortKey, search, labelFilter]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = sortedRides;
        if (list.length === 0) return;
        const cur = list.findIndex(r => r.id === selectedRide);
        let next: number;
        if (cur === -1) {
          next = e.key === 'ArrowDown' ? 0 : list.length - 1;
        } else {
          next = e.key === 'ArrowDown'
            ? Math.min(cur + 1, list.length - 1)
            : Math.max(cur - 1, 0);
        }
        onSelectRide(list[next].id);
      }
      if (e.key === 'Escape') {
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sortedRides, selectedRide, onSelectRide]);

  // Aggregates
  const totalDist    = filteredRides.reduce((s, r) => s + r.distance, 0);
  const totalElev    = filteredRides.reduce((s, r) => s + r.elevGain, 0);
  const totalDur     = filteredRides.reduce((s, r) => s + r.duration, 0);
  const totalCal     = filteredRides.reduce((s, r) => s + (r.calories ?? 0), 0);

  const efTrend      = computeEFTrend(filteredRides);
  const hasAnyPower  = filteredRides.some(r => r.hasPower);

  // Chart data
  const eFTPData = [...filteredRides].filter(r => r.eFTP).reverse().map(r => ({ date: fmtShortDate(r.date), eFTP: r.eFTP ?? null }));
  const tssData  = buildWeeklyTSS(filteredRides);
  const efData   = [...filteredRides].filter(r => r.efficiencyFactor != null).slice(0, 20).reverse()
    .map(r => ({ date: fmtShortDate(r.date), ef: r.efficiencyFactor }));
  const monthData  = buildMonthlyStats(filteredRides);
  const cadData    = [...filteredRides].filter(r => r.avgCadence && r.avgCadence > 0).slice(0, 20).reverse()
    .map(r => ({ date: fmtShortDate(r.date), rpm: r.avgCadence }));

  // PMC
  //
  // Built from the shared pool so this card cannot disagree with the same card in
  // Hub and Kratos. It previously charged a gym session `volume * 0.012` clamped to
  // [15, 80] - a formula that lived only here and knew nothing about reps in reserve -
  // and left running out of Form altogether.
  const pmcPoints = useMemo(
    () => computePMC(buildTrainingLoadPool(
      { rides, kratosWorkouts, strideRuns },
      'all'
    )),
    [rides, kratosWorkouts, strideRuns]
  );

  const latestPMC = pmcPoints[pmcPoints.length - 1] ?? { ctl: 0, atl: 0, tsb: 0 };
  const tsbStatus = interpretTSB(latestPMC.tsb);

  // Zone totals
  const globalZonePower = filteredRides.reduce<number[]>((acc, r) => {
    if (!r.powerZoneTime) return acc;
    return r.powerZoneTime.map((t, i) => (acc[i] ?? 0) + t);
  }, []);

  // PRs
  const globalPowerBests = computeGlobalBests(filteredRides, 'bestEfforts');
  const globalSpeedBests = computeGlobalBests(filteredRides, 'bestSpeedEfforts');

  // Last-90-day bests
  const cutoff90         = Date.now() - 90 * 24 * 3600 * 1000;
  const rides90          = rides.filter(r => r.date >= cutoff90);
  const last90PowerBests = computeGlobalBests(rides90, 'bestEfforts');
  const last90SpeedBests = computeGlobalBests(rides90, 'bestSpeedEfforts');

  // Season comparison
  const seasonData = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const lastYear = thisYear - 1;
    const months   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months.map((m, idx) => {
      const thisKm = rides.filter(r => {
        const d = new Date(r.date);
        return d.getFullYear() === thisYear && d.getMonth() === idx;
      }).reduce((s, r) => s + r.distance, 0);
      const lastKm = rides.filter(r => {
        const d = new Date(r.date);
        return d.getFullYear() === lastYear && d.getMonth() === idx;
      }).reduce((s, r) => s + r.distance, 0);
      return { month: m, thisYear: Math.round(thisKm), lastYear: Math.round(lastKm) };
    }).slice(0, new Date().getMonth() + 1);
  }, [rides]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete ride?')) return;
    setDeleting(id);
    await deleteRide(id);
    await reload();
    setDeleting(null);
  };

  const renderMain = () => {
    if (rides.length === 0 && !loading) return (
      <div className="wd-empty-state">
        <div className="wd-empty-icon"><Bike size={52} color="#38bdf8" strokeWidth={1.5} /></div>
        <h2>No rides</h2>
        <p style={{ marginBottom: 16, color: '#94a3b8', fontSize: 13 }}>
          Import a FIT, GPX or TCX file via the button <strong style={{ color: '#fff' }}>Import Ride</strong> in the header bar above to view your activity history.
        </p>
      </div>
    );

     switch (navSection) {
      case 'dashboard': {
        const latestRide = rides[0];
        const getLatestRideAISummary = (r: RideSummaryWithBests) => {
          const isHeavy = (r.tss ?? r.hrTSS ?? 0) > 150;
          const labelLower = RIDE_LABELS.find(rl => rl.key === r.label)?.label.toLowerCase();
          // "a endurance ride" - the article was hardcoded, and every label starting
          // with a vowel read wrong.
          const article = labelLower && /^[aeiou]/.test(labelLower) ? 'an' : 'a';
          const labelStr = labelLower ? `${article} ${labelLower}${labelLower.includes('ride') ? '' : ' ride'}` : 'a cycling workout';
          return `Your last ride was ${labelStr} of ${r.distance.toFixed(0)} km with ${r.elevGain} m of climbing. ${isHeavy ? 'This was a heavy workload for your body - make sure to get adequate recovery!' : 'This was an excellent active workout.'}`;
        };
        return (
          <div className="wd-main-grid animate-slide-up">
            {/* 1. Live Fitness & Form Status Header */}
            <DashboardStatsHeader
              profileName={profile.name}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              latestPMC={latestPMC}
              tsbStatus={tsbStatus}
            />
            {/* Dashboard stats cards grid */}
            <div className="wd-dashboard-grid">
              <div className="wd-dashboard-card">
                <span className="wd-dashboard-card__label">Distance</span>
                <span className="wd-dashboard-card__value">{totalDist.toFixed(0)} km</span>
              </div>
              <div className="wd-dashboard-card">
                <span className="wd-dashboard-card__label">Time</span>
                <span className="wd-dashboard-card__value">{Math.round(totalDur / 3600)} hours</span>
              </div>
              <div className="wd-dashboard-card">
                <span className="wd-dashboard-card__label">Elevation Gain</span>
                <span className="wd-dashboard-card__value">{totalElev.toFixed(0)} m</span>
              </div>
              <div className="wd-dashboard-card">
                <span className="wd-dashboard-card__label">Calories</span>
                <span className="wd-dashboard-card__value">{totalCal > 0 ? `${totalCal.toLocaleString('en-US')} kcal` : '--'}</span>
              </div>
            </div>

            {/* 2. Latest Ride Details */}
            <div className="wd-dashboard-row" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
              {/* Latest ride panel */}
              <div className="wd-section-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="wd-section-card__head">
                  <span className="wd-section-card__title">🏆 Latest Ride Details</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{fmtShortDate(latestRide.date)}</span>
                </div>
                <div style={{ display: 'flex', gap: 20, flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1.2 1 300px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', margin: '0 0 4px' }}>{latestRide.name}</h3>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>{getLatestRideAISummary(latestRide)}</p>
                    </div>
                    
                    {/* Grid stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                        <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Distance</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#cbd5e1' }}>{latestRide.distance.toFixed(1)} km</div>
                      </div>
                      <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                        <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Avg. Power</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#fdcb6e' }}>{latestRide.hasPower ? `${latestRide.avgPower} W` : '--'}</div>
                      </div>
                      <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                        <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>TSS Load</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#ff7675' }}>{latestRide.tss ?? latestRide.hrTSS ?? '--'}</div>
                      </div>
                      <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                        <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Speed</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8' }}>{latestRide.avgSpeed?.toFixed(1)} km/h</div>
                      </div>
                    </div>
                  </div>

                  {/* Route & Map Preview */}
                  {latestRideFull && (
                    <div style={{ flex: '1 1 250px', minHeight: 160, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.04)', position: 'relative' }}>
                      <MiniRoutePreview points={latestRideFull.points} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Weekly TSS, Intensity Distribution and Trend Analysis */}
            <div className="wd-dashboard-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px' }}>
              <div className="wd-section-card">
                <div className="wd-section-card__head">
                  <span className="wd-section-card__title">📈 Weekly TSS Load</span>
                </div>
                {tssData.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, fontSize: 11, color: '#555' }}>Not enough data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={165}>
                    <AreaChart data={tssData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorTss" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ff7675" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#ff7675" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...ZENITH_CHART_GRID} />
                      <XAxis dataKey="date" tick={ZENITH_CHART_AXIS_TICK} />
                      <YAxis tick={ZENITH_CHART_AXIS_TICK} />
                      <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE} />
                      <Area type="monotone" dataKey="tss" stroke="#ff7675" strokeWidth={2} fillOpacity={1} fill="url(#colorTss)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Intensity distribution */}
              <div className="wd-section-card">
                <div className="wd-section-card__head">
                  <span className="wd-section-card__title">⚡ Training Zones (Power)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center', height: '100%', paddingBottom: 10 }}>
                  {globalZonePower.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, fontSize: 11, color: '#555' }}>No power data</div>
                  ) : (
                    globalZonePower.map((time, idx) => {
                      const total = globalZonePower.reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? (time / total) * 100 : 0;
                      const zone = POWER_ZONES[idx];
                      return zone ? (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 700 }}>
                            <span style={{ color: '#cbd5e1' }}>{zone.name}</span>
                            <span style={{ color: zone.color }}>{pct.toFixed(0)}% ({fmtDur(time)})</span>
                          </div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: zone.color, borderRadius: 2 }} />
                          </div>
                        </div>
                      ) : null;
                    })
                  )}
                </div>
              </div>

              {/* EF / Cardiac Efficiency Trend Analysis */}
              <div className="wd-section-card">
                <div className="wd-section-card__head">
                  <span className="wd-section-card__title">🫀 Aerobic Efficiency Trend (EF)</span>
                  {efTrend && <TrendBadge value={efTrend.trend} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
                    Efficiency Factor (EF) is the ratio of normalized power to average heart rate.
                    Rising EF indicates improved aerobic fitness.
                  </p>
                  {efData.length < 3 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 110, fontSize: 11, color: '#555' }}>Not enough heart rate/power data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={110}>
                      <AreaChart data={efData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorEf" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#cbd5e1" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#cbd5e1" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid {...ZENITH_CHART_GRID} />
                        <XAxis dataKey="date" tick={ZENITH_CHART_AXIS_TICK} />
                        <YAxis tick={ZENITH_CHART_AXIS_TICK} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE} />
                        <Area type="monotone" dataKey="ef" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorEf)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* 4. Monthly Statistics, Cadence Analysis and Season Comparison */}
            <div className="wd-dashboard-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr', gap: '16px' }}>

              {/* Monthly stats */}
              <div className="wd-section-card">
                <div className="wd-section-card__head">
                  <span className="wd-section-card__title">📅 Monthly Statistics</span>
                </div>
                {monthData.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, fontSize: 11, color: '#555' }}>No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={monthData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid {...ZENITH_CHART_GRID} />
                      <XAxis dataKey="month" tick={ZENITH_CHART_AXIS_TICK} />
                      <YAxis tick={ZENITH_CHART_AXIS_TICK} />
                      <Tooltip
                        contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                        labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                        formatter={(v: any) => [`${Math.round(v)} km`, 'Distance']}
                      />
                      <Bar dataKey="distance" fill="rgba(255, 255, 255, 0.4)">
                        {monthData.map((_entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={index === monthData.length - 1 ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Cadence analysis */}
              <div className="wd-section-card">
                <div className="wd-section-card__head">
                  <span className="wd-section-card__title">🔄 Cadence Stability</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
                    Chart shows your average pedaling cadence per ride. Optimal cadence lies between 85–95 RPM.
                  </p>
                  {cadData.length < 3 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 110, fontSize: 11, color: '#555' }}>Not enough cadence data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={110}>
                      <AreaChart data={cadData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid {...ZENITH_CHART_GRID} />
                        <XAxis dataKey="date" tick={ZENITH_CHART_AXIS_TICK} />
                        <YAxis tick={ZENITH_CHART_AXIS_TICK} domain={[60, 110]} />
                        <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE} />
                        <Area type="monotone" dataKey="rpm" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorCad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Season comparison */}
              <div className="wd-section-card">
                <div className="wd-section-card__head">
                  <span className="wd-section-card__title">📅 Comparison vs. Last Year (Distance)</span>
                </div>
                {seasonData.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, fontSize: 11, color: '#555' }}>No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={seasonData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid {...ZENITH_CHART_GRID} />
                      <XAxis dataKey="month" tick={ZENITH_CHART_AXIS_TICK} />
                      <YAxis tick={ZENITH_CHART_AXIS_TICK} />
                      <Tooltip
                        contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                        labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                        formatter={(v: any, name: any) => [`${v} km`, name === 'thisYear' ? String(new Date().getFullYear()) : String(new Date().getFullYear() - 1)]}
                      />
                      <Bar dataKey="lastYear"  fill="rgba(255,255,255,0.12)" radius={[2,2,0,0]} />
                      <Bar dataKey="thisYear"  fill="rgba(255, 255, 255, 0.65)"   radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        );
      }

      case 'prs': {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', boxSizing: 'border-box' }}>
            <PRSection
              profile={profile}
              globaleFTP={globaleFTP}
              globalPowerBests={globalPowerBests}
              last90PowerBests={last90PowerBests}
              globalSpeedBests={globalSpeedBests}
              last90SpeedBests={last90SpeedBests}
              hasAnyPower={hasAnyPower}
              eFTPData={eFTPData}
              rides={rides}
            />
          </div>
        );
      }

      case 'rides': {
        return (
          <div style={{ width: '100%' }}>
            <RideListSection
              search={search}
              setSearch={setSearch}
              sortKey={sortKey}
              setSortKey={setSortKey}
              labelFilter={labelFilter}
              setLabelFilter={setLabelFilter}
              sortedRides={sortedRides}
              gears={gears}
              globalPowerBests={globalPowerBests}
              globalSpeedBests={globalSpeedBests}
              selectedRideId={selectedRideId}
              compareRideId={compareRideId}
              onSelectRide={onSelectRide}
              onCompareRide={onCompareRide}
              handleDelete={handleDelete}
              deleting={deleting}
            />
          </div>
        );
      }

      case 'heatmap': return (
        <div className="wd-main-single" style={{ maxWidth: '100%' }}>
          <HeatmapView isPro={isPro} onRequestProModal={onRequestProModal} />
        </div>
      );
    }
  };

  return (
    <div
      style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, position: 'relative', width: '100%' }}
      data-drag-over={dragOver}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files && onHandleFiles) onHandleFiles(e.dataTransfer.files); }}
    >
      {dragOver && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(255, 255, 255, 0.08)',
          border: '2px dashed #38bdf8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(8px)',
          borderRadius: 16
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Drag files here to import (FIT / GPX)
          </span>
        </div>
      )}

      {/* Dynamic page content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '24px 32px', boxSizing: 'border-box' }}>
        {renderMain()}
      </div>


      {/* Recalculating Loader Overlay */}
      {recalculating && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(9, 9, 11, 0.7)',
          backdropFilter: 'blur(8px)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255, 255, 255, 0.1)',
            borderTop: '3px solid #38bdf8',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>AI Models Calibrating...</span>
          <span style={{ fontSize: 10, color: '#64748b' }}>Analyzing historical rides & updating zones</span>
        </div>
      )}
    </div>
  );
};

export default WorkoutDashboard;
