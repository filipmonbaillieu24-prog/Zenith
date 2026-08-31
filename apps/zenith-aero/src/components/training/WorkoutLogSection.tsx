import React, { useState } from 'react';
import { Plus, Trash2, Award } from 'lucide-react';
import { toDateKeyFromDate } from '@zenith/shared';

export interface WorkoutLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  workoutType: string;
  durationMinutes: number;
  rpe: number; // 1–10
  notes: string;
}

interface WorkoutLogSectionProps {
  logs: WorkoutLogEntry[];
  onAddLog: (entry: WorkoutLogEntry) => void;
  onDeleteLog: (id: string) => void;
}

export const WorkoutLogSection: React.FC<WorkoutLogSectionProps> = ({ logs, onAddLog, onDeleteLog }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState(toDateKeyFromDate(new Date()));
  const [workoutType, setWorkoutType] = useState('Endurance / Z2');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [rpe, setRpe] = useState(6);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddLog({
      id: Date.now().toString(),
      date,
      workoutType,
      durationMinutes,
      rpe,
      notes,
    });
    setShowAdd(false);
    setNotes('');
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 12, padding: 18, marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Award size={16} color="#cbd5e1" />
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>Manual Log & RPE Tracker</h4>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          style={{
            background: 'rgba(203, 213, 225, 0.12)',
            border: '1px solid rgba(203, 213, 225, 0.2)',
            borderRadius: 6,
            color: '#cbd5e1',
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'inherit',
          }}
        >
          <Plus size={13} /> {showAdd ? 'Cancel' : 'Add Log'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleSubmit} style={{ background: 'rgba(0,0,0,0.2)', padding: 14, borderRadius: 8, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Workout Type</label>
              <select
                value={workoutType}
                onChange={(e) => setWorkoutType(e.target.value)}
                style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}
              >
                <option value="Recovery / Z1">Recovery / Z1</option>
                <option value="Endurance / Z2">Endurance / Z2</option>
                <option value="Tempo / Z3">Tempo / Z3</option>
                <option value="Sweet Spot">Sweet Spot</option>
                <option value="Threshold / Z4">Threshold / Z4</option>
                <option value="VO2max / Z5">VO2max / Z5</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Duration (min)</label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>RPE Effort: {rpe}/10</label>
            <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} style={{ width: '100%' }} />
          </div>

          <div>
            <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Notes</label>
            <input
              type="text"
              placeholder="How did the workout feel?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', background: '#0d0d1a', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', borderRadius: 6, padding: '6px 8px', fontSize: 11 }}
            />
          </div>

          <button
            type="submit"
            style={{
              background: '#cbd5e1',
              border: 'none',
              borderRadius: 6,
              color: '#090a0f',
              fontWeight: 700,
              fontSize: 11,
              padding: '6px 12px',
              cursor: 'pointer',
              alignSelf: 'flex-end',
            }}
          >
            Save
          </button>
        </form>
      )}

      {logs.length === 0 ? (
        <p style={{ margin: 0, fontSize: 11, color: '#64748b', textAlign: 'center', padding: '10px 0' }}>No manual workout logs added.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {logs.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.015)',
                borderRadius: 6,
                fontSize: 11,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>{item.date}</span>
                <span style={{ color: '#f8fafc', fontWeight: 700 }}>{item.workoutType}</span>
                <span style={{ color: '#cbd5e1' }}>{item.durationMinutes}m</span>
                <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, color: '#cbd5e1' }}>RPE {item.rpe}/10</span>
                {item.notes && <span style={{ color: '#64748b', fontStyle: 'italic' }}>"{item.notes}"</span>}
              </div>
              <button
                onClick={() => onDeleteLog(item.id)}
                style={{ background: 'transparent', border: 'none', color: '#ff7675', cursor: 'pointer', opacity: 0.7 }}
                title="Delete log"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
