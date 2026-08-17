import React, { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Plus, 
  Trash2, 
  Dumbbell 
} from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { PlannedWorkoutItem } from '../../utils/pmc';
import './CalendarPage.css';

interface CalendarPageProps {
  userId: string;
  onOpenRideInAero?: (rideId: string) => void;
}

type WorkoutType = 'recovery' | 'endurance' | 'sweetspot' | 'threshold' | 'vo2max' | 'custom';

interface CompletedRide {
  id: string;
  name: string;
  date: number; // timestamp
  distance: number;
  duration: number; // seconds
  elevGain: number;
  avgSpeed: number;
  avgPower?: number;
  avgHR?: number;
  hasPower: boolean;
  hasHR: boolean;
  bestEfforts?: Record<string, number>;
  bestSpeedEfforts?: Record<string, number>;
  tss?: number;
}

interface KratosWorkout {
  id: string;
  name: string;
  started_at: string;
  completed_at: string;
  volume: number;
  sets: {
    exercise_id: string;
    sets: {
      type: 'warmup' | 'working' | 'drop';
      weight: number;
      reps: number;
      rir?: number;
    }[];
  }[];
}

type CalendarItem = 
  | { category: 'planned'; dateStr: string; raw: PlannedWorkoutItem }
  | { category: 'ride'; dateStr: string; raw: CompletedRide }
  | { category: 'kratos'; dateStr: string; raw: KratosWorkout };

export const CalendarPage: React.FC<CalendarPageProps> = ({ userId, onOpenRideInAero }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [exercisesMap, setExercisesMap] = useState<Record<string, string>>({});
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);

  // ── PMC Simulation States ──
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutItem[]>([]);

  // ── Modal & Form States ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<PlannedWorkoutItem | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<PlannedWorkoutItem['type']>('sweetspot');
  const [formDuration, setFormDuration] = useState(60);
  const [formTSS, setFormTSS] = useState(65);
  const [formNotes, setFormNotes] = useState('');
  const [draggedWorkoutId, setDraggedWorkoutId] = useState<string | null>(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const getLocalDateString = (dateObj: Date) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatMonthName = (monthIdx: number) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthIdx];
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Planned Workouts
      const { data: plannedData } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', userId);
      
      const mappedPlannedWorkouts: PlannedWorkoutItem[] = (plannedData || []).map((p: any) => ({
        id: p.id,
        date: p.date,
        title: p.title,
        type: p.type as any,
        durationMinutes: p.duration_minutes,
        plannedTSS: p.planned_tss,
        notes: p.notes,
        steps: p.steps,
        routeId: p.route_id
      }));
      setPlannedWorkouts(mappedPlannedWorkouts);
      
      const mappedPlanned: CalendarItem[] = mappedPlannedWorkouts.map((p) => ({
        category: 'planned',
        dateStr: p.date, // format YYYY-MM-DD
        raw: p
      }));

      // 2. Fetch Completed Rides
      const { data: ridesData } = await supabase
        .from('rides')
        .select('*')
        .eq('user_id', userId);

      const mappedRides: CalendarItem[] = (ridesData || []).map((r: any) => {
        const rideDate = new Date(Number(r.date));
        const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {};
        return {
          category: 'ride',
          dateStr: getLocalDateString(rideDate),
          raw: {
            id: r.id,
            name: r.name,
            date: Number(r.date),
            distance: Number(r.distance),
            duration: Number(r.duration),
            elevGain: Number(r.elev_gain),
            avgSpeed: Number(r.avg_speed),
            avgPower: r.avg_power ?? undefined,
            avgHR: r.avg_hr ?? undefined,
            hasPower: !!r.has_power,
            hasHR: !!r.has_hr,
            bestEfforts: r.best_efforts ?? undefined,
            bestSpeedEfforts: r.best_speed_efforts ?? undefined,
            tss: meta?.tss ?? meta?.hrTSS ?? undefined
          }
        };
      });

      // 3. Fetch Completed Strength Workouts (Kratos)
      const { data: kratosData } = await supabase
        .from('kratos_workouts')
        .select('*')
        .eq('user_id', userId);

      const mappedKratos: CalendarItem[] = (kratosData || []).map((k: any) => {
        const kDate = new Date(k.completed_at);
        return {
          category: 'kratos',
          dateStr: getLocalDateString(kDate),
          raw: {
            id: k.id,
            name: k.name,
            started_at: k.started_at,
            completed_at: k.completed_at,
            volume: Number(k.volume || 0),
            sets: k.sets || []
          }
        };
      });

      // 4. Fetch Strength Exercises for ID-to-name lookup
      const { data: exercisesData } = await supabase
        .from('kratos_exercises')
        .select('id, name')
        .eq('user_id', userId);

      if (exercisesData) {
        const exMap: Record<string, string> = {};
        exercisesData.forEach((ex: any) => {
          exMap[ex.id] = ex.name;
        });
        setExercisesMap(exMap);
      }

      setItems([...mappedPlanned, ...mappedRides, ...mappedKratos]);
    } catch (err) {
      console.error('Failed to fetch calendar data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);



  // ── Modal Actions ──
  const handleOpenAddModal = (dateStr: string) => {
    setEditingWorkout(null);
    setTargetDate(dateStr);
    setFormTitle('Sweet Spot Intervallen');
    setFormType('sweetspot');
    setFormDuration(60);
    setFormTSS(65);
    setFormNotes('');
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
        const row = {
          id: updated.id,
          user_id: userId,
          date: updated.date,
          title: updated.title,
          type: updated.type,
          duration_minutes: updated.durationMinutes,
          planned_tss: updated.plannedTSS,
          notes: updated.notes,
          steps: updated.steps || [],
          route_id: updated.routeId
        };
        const { error } = await supabase.from('planned_workouts').upsert(row);
        if (error) throw error;

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
        const row = {
          id: newWorkout.id,
          user_id: userId,
          date: newWorkout.date,
          title: newWorkout.title,
          type: newWorkout.type,
          duration_minutes: newWorkout.durationMinutes,
          planned_tss: newWorkout.plannedTSS,
          notes: newWorkout.notes,
          steps: newWorkout.steps || [],
          route_id: newWorkout.routeId
        };
        const { error } = await supabase.from('planned_workouts').upsert(row);
        if (error) throw error;

        setPlannedWorkouts(prev => [...prev, newWorkout]);
      }
      setIsModalOpen(false);
      fetchData(); // reload
    } catch (err) {
      console.error('Error saving planned workout:', err);
    }
  };

  const handleDeleteWorkout = async (id: string) => {
    try {
      const { error } = await supabase.from('planned_workouts').delete().eq('id', id);
      if (error) throw error;

      setPlannedWorkouts(prev => prev.filter(p => p.id !== id));
      setIsModalOpen(false);
      fetchData(); // reload
    } catch (err) {
      console.error('Error deleting planned workout:', err);
    }
  };

  // ── Drag & Drop Handlers ──
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
          const row = {
            id: updated.id,
            user_id: userId,
            date: updated.date,
            title: updated.title,
            type: updated.type,
            duration_minutes: updated.durationMinutes,
            planned_tss: updated.plannedTSS,
            notes: updated.notes,
            steps: updated.steps || [],
            route_id: updated.routeId
          };
          const { error } = await supabase.from('planned_workouts').upsert(row);
          if (error) throw error;

          setPlannedWorkouts(prev => prev.map(p => p.id === id ? updated : p));
          fetchData(); // reload
        } catch (err) {
          console.error('Error moving planned workout:', err);
        }
      }
    }
    setDraggedWorkoutId(null);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Generate calendar grid days
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  // Adjust firstDayIndex to Monday-first (0 = Monday, 6 = Sunday)
  const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const calendarDays: { date: Date; dateStr: string; outside: boolean }[] = [];

  // Previous month outside days
  for (let i = startOffset - 1; i >= 0; i--) {
    const dVal = daysInPrevMonth - i;
    const date = new Date(currentYear, currentMonth - 1, dVal);
    calendarDays.push({
      date,
      dateStr: getLocalDateString(date),
      outside: true
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(currentYear, currentMonth, i);
    calendarDays.push({
      date,
      dateStr: getLocalDateString(date),
      outside: false
    });
  }

  // Next month outside days
  const remainingCells = 42 - calendarDays.length; // standard 6-row grid = 42 cells
  for (let i = 1; i <= remainingCells; i++) {
    const date = new Date(currentYear, currentMonth + 1, i);
    calendarDays.push({
      date,
      dateStr: getLocalDateString(date),
      outside: true
    });
  }

  // Map items to dates
  const itemsByDate: Record<string, CalendarItem[]> = {};
  items.forEach(item => {
    if (!itemsByDate[item.dateStr]) {
      itemsByDate[item.dateStr] = [];
    }
    itemsByDate[item.dateStr].push(item);
  });

  const todayStr = getLocalDateString(new Date());

  const getWorkoutColor = (type: WorkoutType) => {
    const colors: Record<WorkoutType, string> = {
      recovery: '#a29bfe',
      endurance: '#cbd5e1',
      sweetspot: '#fdcb6e',
      threshold: '#ff7675',
      vo2max: '#6c5ce7',
      custom: '#cbd5e1'
    };
    return colors[type] || '#cbd5e1';
  };

  return (
    <div className="zh-calendar-container animate-slide-up">


      <div className="zh-calendar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={18} style={{ color: '#cbd5e1' }} />
          <h2 className="zh-calendar-title">
            {formatMonthName(currentMonth)} {currentYear}
          </h2>
        </div>
        <div className="zh-calendar-nav">
          <button className="zh-calendar-btn" onClick={handlePrevMonth}>
            <ChevronLeft size={16} />
          </button>
          <button className="zh-calendar-btn today" onClick={() => setCurrentDate(new Date())}>
            Today
          </button>
          <button className="zh-calendar-btn" onClick={handleNextMonth}>
            <ChevronRight size={16} />
          </button>
          <button 
            className="zh-calendar-btn plan" 
            style={{ width: 'auto', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(56, 189, 248, 0.15) 100%)', border: '1px solid #10b981', color: '#fff', fontWeight: 800, padding: '0 14px', borderRadius: 8, height: 32, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit' }}
            onClick={() => handleOpenAddModal(getLocalDateString(new Date()))}
          >
            <Plus size={14} /> Plan Workout
          </button>
        </div>
      </div>

      {loading ? (
        <div className="zh-calendar-grid-wrap" style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
          Loading calendar data...
        </div>
      ) : (
        <div className="zh-calendar-grid-wrap">
          <div className="zh-calendar-grid-header">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="zh-calendar-day-label">{day}</div>
            ))}
          </div>
          <div className="zh-calendar-grid">
            {calendarDays.map(({ date, dateStr, outside }) => {
              const dayItems = itemsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;

              return (
                <div 
                  key={dateStr} 
                  className={`zh-calendar-cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''}`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, dateStr)}
                >
                  <div className="zh-calendar-date-container">
                    <span className="zh-calendar-date">{date.getDate()}</span>
                    <button
                      className="zh-calendar-cell-add-btn"
                      title="Plan workout on this day"
                      onClick={() => handleOpenAddModal(dateStr)}
                    >
                      +
                    </button>
                  </div>
                  
                  <div className="zh-calendar-badge-list">
                    {dayItems.map((item, idx) => {
                      if (item.category === 'planned') {
                        return (
                          <div 
                            key={`p-${item.raw.id}-${idx}`}
                            className="zh-workout-badge zh-badge-planned"
                            draggable
                            onDragStart={(e) => handleDragStart(e, item.raw.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(item.raw);
                            }}
                            title={`Planned: ${item.raw.title}\nDuration: ${item.raw.durationMinutes} min\nTSS: ${item.raw.plannedTSS}\nDrag to move, click to edit.`}
                            style={{ borderLeft: `3px solid ${getWorkoutColor(item.raw.type)}` }}
                          >
                            📅 {item.raw.title} ({item.raw.durationMinutes}m)
                          </div>
                        );
                      } else if (item.category === 'ride') {
                        return (
                          <div 
                            key={`r-${item.raw.id}-${idx}`}
                            className="zh-workout-badge zh-badge-ride"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenRideInAero) {
                                onOpenRideInAero(item.raw.id);
                              } else {
                                setSelectedItem(item);
                              }
                            }}
                          >
                            🚴 {item.raw.name} ({item.raw.distance.toFixed(0)}km)
                          </div>
                        );
                      } else {
                        return (
                          <div 
                            key={`k-${item.raw.id}-${idx}`}
                            className="zh-workout-badge zh-badge-kratos"
                            onClick={() => setSelectedItem(item)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Dumbbell size={10} style={{ flexShrink: 0 }} />
                            <span>{item.raw.name} ({item.raw.volume.toLocaleString()} kg)</span>
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail Modal Overlay */}
      {selectedItem && (
        <div className="wd-modal-backdrop animate-fade-in" onClick={() => setSelectedItem(null)}>
          <div className="wd-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="wd-modal-header">
              <h3>
                {selectedItem.category === 'ride' ? '🚴 Completed Cycling Ride' : '🏋️ Completed Kratos Workout'}
              </h3>
              <button className="wd-modal-close" onClick={() => setSelectedItem(null)}>✕</button>
            </div>

            <div className="wd-modal-body">
              {/* PLANNED WORKOUT DETAILS */}
              {selectedItem.category === 'planned' && (
                <>
                  <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 900 }}>{selectedItem.raw.title}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: getWorkoutColor(selectedItem.raw.type), fontWeight: 800, textTransform: 'uppercase', marginBottom: 12 }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: getWorkoutColor(selectedItem.raw.type) }} />
                    {selectedItem.raw.type}
                  </div>

                  <div className="zh-workout-meta-grid">
                    <div className="zh-workout-meta-item">
                      <span className="zh-workout-meta-label">Planned Duration</span>
                      <span className="zh-workout-meta-value">{selectedItem.raw.durationMinutes} minutes</span>
                    </div>
                    <div className="zh-workout-meta-item">
                      <span className="zh-workout-meta-label">Planned TSS</span>
                      <span className="zh-workout-meta-value">{selectedItem.raw.plannedTSS} TSS</span>
                    </div>
                  </div>

                  {selectedItem.raw.notes && (
                    <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: 12, border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div className="zh-modal-section-title">Notes & Coach Tips</div>
                      <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{selectedItem.raw.notes}</p>
                    </div>
                  )}

                  {selectedItem.raw.steps && selectedItem.raw.steps.length > 0 && (
                    <div>
                      <div className="zh-modal-section-title">Workout Steps</div>
                      <ol className="zh-steps-list">
                        {selectedItem.raw.steps.map((step: any, sIdx: number) => (
                          <li key={sIdx}>
                            <strong>{step.duration} min</strong> at <strong>{step.intensity}% FTP</strong> {step.type === 'cooldown' ? '(Cool down)' : step.type === 'warmup' ? '(Warm up)' : '(Work set)'}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              )}

              {/* COMPLETED RIDE DETAILS */}
              {selectedItem.category === 'ride' ? (
                <>
                  <h4 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 12px' }}>
                    {selectedItem.raw.name}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>Distance</span>
                      <strong style={{ fontSize: 16, color: '#38bdf8' }}>{selectedItem.raw.distance.toFixed(1)} km</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>Avg Speed</span>
                      <strong style={{ fontSize: 16, color: '#fff' }}>{selectedItem.raw.avgSpeed.toFixed(1)} km/h</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>TSS</span>
                      <strong style={{ fontSize: 16, color: '#34d399' }}>{selectedItem.raw.tss ?? '--'}</strong>
                    </div>
                  </div>
                </>
              ) : selectedItem.category === 'kratos' ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>
                      {selectedItem.raw.name}
                    </h4>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Total Volume: <strong style={{ color: '#34d399' }}>{selectedItem.raw.volume.toLocaleString()} kg</strong>
                    </div>
                  </div>

                  <div>
                    <div className="zh-modal-section-title">🏋️ Logbook Details</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {selectedItem.raw.sets.map((exLog, eIdx) => {
                        const name = exercisesMap[exLog.exercise_id] || 'Exercise';
                        return (
                          <div key={eIdx} className="zh-kratos-exercise-block">
                            <div className="zh-kratos-ex-name">{name}</div>
                            <table className="zh-kratos-sets-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '15%' }}>Set</th>
                                  <th style={{ width: '25%' }}>Type</th>
                                  <th style={{ width: '30%' }}>Weight</th>
                                  <th style={{ width: '30%' }}>Reps</th>
                                </tr>
                              </thead>
                              <tbody>
                                {exLog.sets.map((s, sIdx) => (
                                  <tr key={sIdx}>
                                    <td style={{ fontWeight: 800 }}>{sIdx + 1}</td>
                                    <td>
                                      <span className={`zh-kratos-set-type zh-set-${s.type}`}>
                                        {s.type === 'warmup' ? 'Warmup' : s.type === 'working' ? 'Working' : 'Drop'}
                                      </span>
                                    </td>
                                    <td><strong>{s.weight} kg</strong></td>
                                    <td><strong>{s.reps} reps</strong> {s.rir !== undefined && s.rir !== null ? `(RIR ${s.rir})` : ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="wd-modal-backdrop animate-fade-in" onClick={() => setIsModalOpen(false)}>
          <div className="wd-modal-card" onClick={e => e.stopPropagation()}>
            <div className="wd-modal-header">
              <h3>{editingWorkout ? 'Edit Workout' : 'Plan New Workout'}</h3>
              <button className="wd-modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            <div className="wd-modal-body">
              <div className="wd-form-group">
                <label>Date</label>
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
                  placeholder="e.g. Sweet Spot 2x15m"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                />
              </div>

              <div className="wd-form-group">
                <label>Training Type</label>
                <select
                  value={formType}
                  onChange={e => {
                    const t = e.target.value as PlannedWorkoutItem['type'];
                    setFormType(t);
                    if (t === 'recovery') setFormTSS(Math.round(formDuration * 0.4));
                    if (t === 'endurance') setFormTSS(Math.round(formDuration * 0.8));
                    if (t === 'sweetspot') setFormTSS(Math.round(formDuration * 1.1));
                    if (t === 'threshold') setFormTSS(Math.round(formDuration * 1.25));
                    if (t === 'vo2max') setFormTSS(Math.round(formDuration * 1.4));
                  }}
                >
                  <option value="recovery">💙 Active Recovery (Z1)</option>
                  <option value="endurance">🟢 Endurance (Z2)</option>
                  <option value="sweetspot">🟡 Sweet Spot Intervals (Z3/Z4)</option>
                  <option value="threshold">🔴 Threshold / FTP (Z4)</option>
                  <option value="vo2max">💜 VO2Max Intervals (Z5)</option>
                  <option value="custom">⚡ Custom</option>
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
                  <label>Expected TSS</label>
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
                <label>Notes / Instructions</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Warm-up 15m, 2x 15m at 220W with 5m recovery..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                />
              </div>
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
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none' }}
              >
                Save & Simulate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
