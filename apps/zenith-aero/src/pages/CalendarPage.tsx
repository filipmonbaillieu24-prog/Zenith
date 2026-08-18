import React, { useState, useMemo, useEffect } from 'react';
import './CalendarPage.css';
import { RideSummaryWithBests, FitnessProfile } from '../types/workout';
import { computeSimulatedPMC, PlannedWorkoutItem, interpretTSB } from '../utils/pmc';
import { savePlannedWorkout, getAllPlannedWorkouts, deletePlannedWorkout, getRoute } from '../utils/db';
import { buildGPX, saveExportFile } from '../utils/export';

function toLocalYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

import {
  Plus,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  CheckCircle2,
  Trash2,
  Download
} from 'lucide-react';

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';

interface CalendarPageProps {
  rides: RideSummaryWithBests[];
  kratosWorkouts?: any[];
  profile: FitnessProfile;
  onSelectRide?: (id: string) => void;
}



export const CalendarPage: React.FC<CalendarPageProps> = ({ rides, kratosWorkouts = [], onSelectRide }) => {

  // ── 1. Geplande workouts state (Supabase) ──────────────────────────────────
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutItem[]>([]);

  useEffect(() => {
    const loadWorkouts = async () => {
      try {
        const list = await getAllPlannedWorkouts();
        setPlannedWorkouts(list);
      } catch (err) {
        console.error('Could not load planned workouts from Supabase:', err);
      }
    };
    loadWorkouts();
  }, []);

  // ── 2. Datum & Navigatie state ─────────────────────────────────────────────
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode] = useState<'month' | 'week'>('month');


  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<PlannedWorkoutItem | null>(null);
  const [targetDate, setTargetDate] = useState<string>(toLocalYYYYMMDD(new Date()));

  // Form State
  const [formTitle, setFormTitle] = useState('Sweet Spot Training');
  const [formType, setFormType] = useState<PlannedWorkoutItem['type']>('sweetspot');
  const [formDuration, setFormDuration] = useState(60);
  const [formTSS, setFormTSS] = useState(65);
  const [formNotes, setFormNotes] = useState('');

  const [downloadingGpx, setDownloadingGpx] = useState(false);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const [gpxSuccess, setGpxSuccess] = useState<string | null>(null);

  const handleDownloadRouteGPX = async () => {
    if (!editingWorkout || !editingWorkout.routeId) return;
    setDownloadingGpx(true);
    setGpxError(null);
    setGpxSuccess(null);
    try {
      const route = await getRoute(editingWorkout.routeId);
      if (!route) {
        setGpxError("Route not found in database.");
        return;
      }
      
      const speedTarget = route.duration > 0 ? (route.distance / (route.duration / 3600)) : 25; 
      const gpxContent = buildGPX(route.points, route.name, speedTarget);
      
      const fileName = `${route.name.replace(/[^a-zA-Z0-9]/g, '_')}_training.gpx`;
      const res = await saveExportFile(gpxContent, fileName, 'application/gpx+xml');
      if (!res.ok) {
        if (res.error !== 'CANCELLED') {
          setGpxError(res.error || "Error saving file.");
        }
      } else {
        setGpxSuccess(res.path ? `✓ GPX opgeslagen op: ${res.path}` : "✓ GPX succesvol gedownload");
      }
    } catch (err) {
      console.error(err);
      setGpxError("Could not fetch or export route.");
    } finally {
      setDownloadingGpx(false);
    }
  };

  // ── 3. Drag and Drop state ──────────────────────────────────────────────────
  const [draggedWorkoutId, setDraggedWorkoutId] = useState<string | null>(null);

  // ── 4. Bereken PMC Simulatie ────────────────────────────────────────────────
  const simPMC = useMemo(() => {
    const tssList: { date: number; tss: number }[] = rides
      .filter(r => (r.tss ?? r.hrTSS) != null)
      .map(r => ({ date: r.date, tss: (r.tss ?? r.hrTSS)! }));

    kratosWorkouts.forEach((k: any) => {
      if (k.completed_at && k.volume) {
        const ts = new Date(k.completed_at).getTime();
        const volume = Number(k.volume);
        const sTSS = Math.min(80, Math.max(15, Math.round(volume * 0.012)));
        tssList.push({ date: ts, tss: sTSS });
      }
    });

    return computeSimulatedPMC(tssList, plannedWorkouts, 35);
  }, [rides, plannedWorkouts, kratosWorkouts]);

  const latestSimPoint = useMemo(() => {
    if (simPMC.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
    return simPMC[simPMC.length - 1];
  }, [simPMC]);

  const currentFormStatus = useMemo(() => {
    return interpretTSB(latestSimPoint.tsb);
  }, [latestSimPoint]);

  // ── 5. Datum hulpfuncties ───────────────────────────────────────────────────
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() - 1);
    } else {
      next.setDate(next.getDate() - 7);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Maak maanddagen matrix
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let startDayOfWeek = firstDayOfMonth.getDay() - 1; // 0 = Monthag
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Zondag

    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean; dateObj: Date }[] = [];

    // Fill previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({
        dateStr: toLocalYYYYMMDD(d),
        dayNum: d.getDate(),
        isCurrentMonth: false,
        dateObj: d,
      });
    }

    // Huidige maand dagen
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({
        dateStr: toLocalYYYYMMDD(d),
        dayNum: i,
        isCurrentMonth: true,
        dateObj: d,
      });
    }

    // Fill next month days up to 35 or 42 cells
    const totalNeeded = days.length > 35 ? 42 : 35;
    const remaining = totalNeeded - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        dateStr: toLocalYYYYMMDD(d),
        dayNum: i,
        isCurrentMonth: false,
        dateObj: d,
      });
    }

    return days;
  }, [year, month]);

  // Map voltooide rideten en geplande workouts per dag
  const ridesByDate = useMemo(() => {
    const map = new Map<string, RideSummaryWithBests[]>();
    for (const r of rides) {
      const key = toLocalYYYYMMDD(new Date(r.date));
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [rides]);

  const plannedByDate = useMemo(() => {
    const map = new Map<string, PlannedWorkoutItem[]>();
    for (const p of plannedWorkouts) {
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    return map;
  }, [plannedWorkouts]);

  // Open modal to add / edit
  const handleOpenAddModal = (dateStr: string) => {
    setEditingWorkout(null);
    setTargetDate(dateStr);
    setFormTitle('Sweet Spot Intervallen');
    setFormType('sweetspot');
    setFormDuration(60);
    setFormTSS(65);
    setFormNotes('');
    setGpxError(null);
    setGpxSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: PlannedWorkoutItem) => {
    setEditingWorkout(item);
    setTargetDate(item.date);
    setFormTitle(item.title);
    setFormType(item.type);
    setFormDuration(item.durationMinutes);
    setFormTSS(item.plannedTSS);
    setFormNotes(item.notes ?? '');
    setGpxError(null);
    setGpxSuccess(null);
    setIsModalOpen(true);
  };

  const handleSaveWorkout = async () => {
    if (!formTitle.trim()) return;
    try {
      if (editingWorkout) {
        const updated: PlannedWorkoutItem = {
          ...editingWorkout,
          date: targetDate,
          title: formTitle,
          type: formType,
          durationMinutes: formDuration,
          plannedTSS: formTSS,
          notes: formNotes,
        };
        await savePlannedWorkout(updated);
        setPlannedWorkouts(prev => prev.map(p => p.id === editingWorkout.id ? updated : p));
      } else {
        const newWorkout: PlannedWorkoutItem = {
          id: 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          date: targetDate,
          title: formTitle,
          type: formType,
          durationMinutes: formDuration,
          plannedTSS: formTSS,
          notes: formNotes,
        };
        await savePlannedWorkout(newWorkout);
        setPlannedWorkouts(prev => [...prev, newWorkout]);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving geplande workout:', err);
    }
  };

  const handleDeleteWorkout = async (id: string) => {
    try {
      await deletePlannedWorkout(id);
      setPlannedWorkouts(prev => prev.filter(p => p.id !== id));
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error deleting geplande workout:', err);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedWorkoutId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggedWorkoutId;
    if (id) {
      const workout = plannedWorkouts.find(p => p.id === id);
      if (workout) {
        try {
          const updated = { ...workout, date: targetDateStr };
          await savePlannedWorkout(updated);
          setPlannedWorkouts(prev => prev.map(p => p.id === id ? updated : p));
        } catch (err) {
          console.error('Error moving planned workout:', err);
        }
      }
    }
    setDraggedWorkoutId(null);
  };

  // Format chart data for Recharts
  const chartData = useMemo(() => {
    return simPMC.map(pt => ({
      dateStr: new Date(pt.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      rawDate: pt.date,
      ctl: pt.ctl,
      atl: pt.atl,
      tsb: pt.tsb,
      tss: pt.tss,
      isSimulated: pt.isSimulated,
    }));
  }, [simPMC]);

  const todayStr = toLocalYYYYMMDD(new Date());

  return (
    <div className="wd-calendar-page animate-slide-up">
      {/* ── 1. Top Banner with PMC Simulation KPIs ────────────────────────────── */}
      <div className="wd-calendar-hero">
        <div className="wd-calendar-hero__header">
          <div>
            <span className="wd-calendar-hero__tag" style={{ fontSize: 13, fontWeight: 700 }}>
              <TrendingUp size={14} style={{ color: '#cbd5e1', marginRight: 6, verticalAlign: 'middle' }} />
              Periodization & PMC Voorspelling
            </span>
          </div>

          <div className="wd-calendar-hero__kpis">
            <div className="wd-calendar-kpi">
              <span className="wd-calendar-kpi__label">Fitheid (CTL +35d)</span>
              <strong className="wd-calendar-kpi__val" style={{ color: '#cbd5e1' }}>
                {Math.round(latestSimPoint.ctl)}
              </strong>
            </div>
            <div className="wd-calendar-kpi">
              <span className="wd-calendar-kpi__label">Vermoeidheid (ATL +35d)</span>
              <strong className="wd-calendar-kpi__val" style={{ color: '#ff7675' }}>
                {Math.round(latestSimPoint.atl)}
              </strong>
            </div>
            <div className="wd-calendar-kpi">
              <span className="wd-calendar-kpi__label">Vorm (TSB +35d)</span>
              <strong className="wd-calendar-kpi__val" style={{ color: currentFormStatus.color }}>
                {latestSimPoint.tsb > 0 ? `+${Math.round(latestSimPoint.tsb)}` : Math.round(latestSimPoint.tsb)} {currentFormStatus.emoji}
              </strong>
            </div>
          </div>
        </div>

        {/* Recharts Simulatie Grafiek */}
        <div className="wd-calendar-chart-wrapper">
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="dateStr" tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.05)" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.05)" />
              <Tooltip
                contentStyle={{ background: '#09090b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#fff' }}
              />
              <ReferenceLine x={new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: 'Today', fill: '#cbd5e1', fontSize: 10 }} />
              <Bar dataKey="tss" fill="rgba(255,255,255,0.08)" radius={[2, 2, 0, 0]} name="Dagelijkse TSS" />
              <Line type="monotone" dataKey="ctl" stroke="#cbd5e1" strokeWidth={2} dot={false} name="Fitheid (CTL)" />
              <Line type="monotone" dataKey="atl" stroke="#ff7675" strokeWidth={1.5} dot={false} name="Vermoeidheid (ATL)" />
              <Line type="monotone" dataKey="tsb" stroke="#fdcb6e" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Vorm (TSB)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 2. Calendar Controls Bar ─────────────────────────────────────────── */}
      <div className="wd-calendar-controls">
        <div className="wd-calendar-controls__left">
          <button className="wd-cal-btn" onClick={handleToday}>Today</button>
          <div className="wd-cal-nav-group">
            <button className="wd-cal-icon-btn" onClick={handlePrev}><ChevronLeft size={16} /></button>
            <button className="wd-cal-icon-btn" onClick={handleNext}><ChevronRight size={16} /></button>
          </div>
          <h3 className="wd-cal-month-title">
            {currentDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
          </h3>
        </div>

        <div className="wd-calendar-controls__right">
          <button className="wd-cal-add-btn" onClick={() => handleOpenAddModal(todayStr)}>
            <Plus size={14} style={{ marginRight: 4 }} /> Workout Plannen
          </button>
        </div>
      </div>

      {/* ── 3. Month Grid ────────────────────────────────────────────────────── */}
      <div className="wd-calendar-grid">
        {/* Days of the week headers */}
        {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(d => (
          <div key={d} className="wd-cal-header-cell">{d}</div>
        ))}

        {/* Calendar Days */}
        {calendarDays.map(day => {
          const isToday = day.dateStr === todayStr;
          const dayRides = ridesByDate.get(day.dateStr) ?? [];
          const dayPlanned = plannedByDate.get(day.dateStr) ?? [];
          const dayOfWeek = day.dateObj.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          return (
            <div
              key={day.dateStr}
              className={`wd-cal-day-cell ${!day.isCurrentMonth ? 'wd-cal-day-cell--other' : ''} ${isToday ? 'wd-cal-day-cell--today' : ''} ${isWeekend ? 'wd-cal-day-cell--weekend' : ''}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day.dateStr)}
            >
              <div className="wd-cal-day-cell__top">
                <span className="wd-cal-day-num">{day.dayNum}</span>
                <button
                  className="wd-cal-day-add-btn"
                  title="Plan workout on this day"
                  onClick={() => handleOpenAddModal(day.dateStr)}
                >
                  +
                </button>
              </div>

              <div className="wd-cal-day-events">
                {/* Voltooide Rides */}
                {dayRides.map(r => (
                  <div
                    key={r.id}
                    className="wd-cal-badge wd-cal-badge--completed" onClick={() => onSelectRide?.(r.id)}
                    title={`Voltooid: ${r.name}\nDistance: ${r.distance.toFixed(1)} km\nTijd: ${Math.round(r.duration / 60)} min\nHoogte: ${r.elevGain} m\nGem: ${r.avgSpeed.toFixed(1)} km/h\nWorkload: ${Math.round(r.tss ?? r.hrTSS ?? 0)} TSS`}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '2px', padding: '6px 8px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={10} style={{ flexShrink: 0, color: '#39ff14' }} />
                      <span className="wd-cal-badge__title" style={{ fontSize: '10px', fontWeight: 700 }}>{r.name}</span>
                      <span className="wd-cal-badge__tss" style={{ fontSize: '9px', fontWeight: 800 }}>{Math.round(r.tss ?? r.hrTSS ?? 0)}T</span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', opacity: 0.8, color: '#39ff14', fontWeight: 600 }}>
                      <span>{r.distance.toFixed(0)} km</span>
                      <span>{Math.round(r.duration / 60)} min</span>
                      <span>{r.avgPower ? `${r.avgPower}W` : `${r.avgSpeed.toFixed(0)}km/h`}</span>
                    </div>
                  </div>
                ))}

                {/* Geplande Workouts */}
                {dayPlanned.map(p => (
                  <div
                    key={p.id}
                    className={`wd-cal-badge wd-cal-badge--planned wd-cal-type--${p.type}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, p.id)}
                    onClick={() => handleOpenEditModal(p)}
                    title={`Planned: ${p.title}\nDuration: ${p.durationMinutes} min\nWorkload: ${p.plannedTSS} TSS\nNotes: ${p.notes || 'none'}\nClick to edit, sleep om te verplaatsen.`}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '2px', padding: '6px 8px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="wd-cal-badge__dot" style={{ background: 'currentColor' }} />
                      <span className="wd-cal-badge__title" style={{ fontSize: '10px', fontWeight: 700 }}>{p.title}</span>
                      <span className="wd-cal-badge__tss" style={{ fontSize: '9px', fontWeight: 800 }}>{p.plannedTSS}T</span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', opacity: 0.8, fontWeight: 600 }}>
                      <span>{p.durationMinutes} min</span>
                      <span style={{ textTransform: 'capitalize' }}>{p.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 4. Workout Plannen / Edit Modal ───────────────────────────────── */}
      {isModalOpen && (
        <div className="wd-modal-backdrop animate-fade-in" onClick={() => setIsModalOpen(false)}>
          <div className="wd-modal-card" onClick={e => e.stopPropagation()}>
            <div className="wd-modal-header">
              <h3>{editingWorkout ? 'Workout Edit' : 'Nieuwe Workout Plannen'}</h3>
              <button className="wd-modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            <div className="wd-modal-body">
              <div className="wd-form-group">
                <label>Datum</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                />
              </div>

              <div className="wd-form-group">
                <label>Workout Title</label>
                <input
                  type="text"
                  placeholder="bv. Sweet Spot 2x15m"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                />
              </div>

              <div className="wd-form-group">
                <label>Type Training</label>
                <select
                  value={formType}
                  onChange={e => {
                    const t = e.target.value as PlannedWorkoutItem['type'];
                    setFormType(t);
                    // Automatic TSS estimation based on duration & type
                    if (t === 'recovery') setFormTSS(Math.round(formDuration * 0.4));
                    if (t === 'endurance') setFormTSS(Math.round(formDuration * 0.8));
                    if (t === 'sweetspot') setFormTSS(Math.round(formDuration * 1.1));
                    if (t === 'threshold') setFormTSS(Math.round(formDuration * 1.25));
                    if (t === 'vo2max') setFormTSS(Math.round(formDuration * 1.4));
                  }}
                >
                  <option value="recovery">💙 Actief Recovery (Z1)</option>
                  <option value="endurance">🟢 Duurtraining (Z2)</option>
                  <option value="sweetspot">🟡 Sweet Spot Intervallen (Z3/Z4)</option>
                  <option value="threshold">🔴 Threshold / FTP (Z4)</option>
                  <option value="vo2max">💜 VO2Max Intervallen (Z5)</option>
                  <option value="custom">⚡ Aangepast</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="wd-form-group">
                  <label>Duration (minutes)</label>
                  <input
                    type="number"
                    min={15}
                    max={360}
                    value={formDuration}
                    onChange={e => {
                      const dur = parseInt(e.target.value) || 0;
                      setFormDuration(dur);
                    }}
                  />
                </div>

                <div className="wd-form-group">
                  <label>Verwachte TSS</label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={formTSS}
                    onChange={e => setFormTSS(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="wd-form-group">
                <label>Notities / Instructies</label>
                <textarea
                  rows={3}
                  placeholder="e.g., Warm-up 15m, 2x 15m at 220W with 5m recovery..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                />
              </div>

              {editingWorkout?.routeId && (
                <div className="wd-form-group" style={{ marginTop: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Gekoppelde Route
                  </label>
                  <button
                    onClick={handleDownloadRouteGPX}
                    disabled={downloadingGpx}
                    style={{
                      background: 'rgba(203, 213, 225, 0.06)',
                      border: '1px solid rgba(203, 213, 225, 0.15)',
                      borderRadius: 8,
                      color: '#cbd5e1',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '10px 14px',
                      cursor: 'pointer',
                      fontFamily: 'inheride',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'all 0.2s',
                      width: '100%',
                      marginTop: 4
                    }}
                  >
                    <Download size={14} /> 
                    {downloadingGpx ? 'GPX ophalen...' : 'Gegenereerde GPX Route Download'}
                  </button>
                  {gpxError && (
                    <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginTop: 4 }}>
                      {gpxError}
                    </div>
                  )}
                  {gpxSuccess && (
                    <div style={{ fontSize: 10, color: '#39ff14', fontWeight: 600, marginTop: 4, wordBreak: 'break-all' }}>
                      {gpxSuccess}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="wd-modal-footer">
              {editingWorkout && (
                <button
                  className="wd-modal-btn wd-modal-btn--danger"
                  onClick={() => handleDeleteWorkout(editingWorkout.id)}
                >
                  <Trash2 size={13} style={{ marginRight: 4 }} /> Delete
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button
                className="wd-modal-btn wd-modal-btn--secondary"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="wd-modal-btn wd-modal-btn--primary"
                onClick={handleSaveWorkout}
              >
                Save & Simuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
