import React from 'react';
import { GripVertical, Trash2, Plus, CheckCircle, CalendarPlus } from 'lucide-react';
import { CustomBlock, zoneColors } from '../../types/training';
import { Workout } from '../../utils/workouts';
import { FitnessProfile } from '../../types/workout';

interface WorkoutBuilderTabProps {
  profile: FitnessProfile;
  customBlocks: CustomBlock[];
  customTitle: string;
  customTotalMin: number;
  customWorkout: Workout;
  buildPlanned: boolean;
  addCustomBlock: () => void;
  updateBlock: (id: string, field: keyof CustomBlock, value: any) => void;
  removeBlock: (id: string) => void;
  setCustomTitle: (t: string) => void;
  planWorkoutInCalendar: (workout: Workout, dateStr: string, durationMin: number) => void;
  setBuildPlanned: (b: boolean) => void;
}

export const WorkoutBuilderTab: React.FC<WorkoutBuilderTabProps> = ({
  profile,
  customBlocks,
  customTitle,
  customTotalMin,
  customWorkout,
  buildPlanned,
  addCustomBlock,
  updateBlock,
  removeBlock,
  setCustomTitle,
  planWorkoutInCalendar,
  setBuildPlanned,
}) => {
  return (
    <div className="wd-main-single" style={{ display: 'block', overflowY: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', margin: '0 0 4px' }}>🔧 Interval Builder</h2>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Bouw je eigen workout blok voor blok.</p>
        </div>

        {/* Workout naam + preview grafiek */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 10, alignItems: 'center' }}>
            <input value={customTitle} onChange={e => setCustomTitle(e.target.value)}
              style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, color: '#f8fafc', padding: '7px 10px', fontSize: 13, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}
              placeholder="Naam van je workout..." />
            <span style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap' }}>{customTotalMin} min · {customBlocks.length} blokken</span>
          </div>

          {/* Live preview */}
          <div style={{ height: 60, display: 'flex', gap: 2, alignItems: 'flex-end', padding: '8px 16px 0', background: 'rgba(0,0,0,0.1)' }}>
            {customBlocks.map((b) => (
              <div key={b.id} style={{ flex: b.durationMin, height: `${b.powerPct}%`, background: zoneColors[b.zone - 1], borderRadius: '2px 2px 0 0', opacity: 0.85, transition: 'all 0.2s' }}
                title={`${b.name}: ${b.durationMin}m @ ${b.powerPct}% FTP`} />
            ))}
          </div>
        </div>

        {/* Blokken lijst */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {customBlocks.map((b) => (
            <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 70px 80px 80px 32px', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
              <div style={{ cursor: 'grab', color: '#334155', display: 'flex', alignItems: 'center' }}><GripVertical size={14} /></div>
              <input value={b.name} onChange={e => updateBlock(b.id, 'name', e.target.value)}
                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc', fontSize: 12, fontWeight: 600, padding: '2px 0', fontFamily: 'inheride' }} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase' }}>Duur (min)</label>
                <input type="number" min={1} max={180} value={b.durationMin} onChange={e => updateBlock(b.id, 'durationMin', Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, color: '#f8fafc', padding: '4px 6px', fontSize: 11, width: '100%', fontFamily: 'inheride' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase' }}>% FTP</label>
                <input type="number" min={20} max={150} value={b.powerPct} onChange={e => updateBlock(b.id, 'powerPct', Math.min(150, Math.max(20, parseInt(e.target.value) || 50)))}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, color: zoneColors[b.zone - 1], padding: '4px 6px', fontSize: 11, width: '100%', fontFamily: 'inheride', fontWeight: 700 }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase' }}>Zone</label>
                <select value={b.zone} onChange={e => updateBlock(b.id, 'zone', parseInt(e.target.value) as 1|2|3|4|5)}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, color: zoneColors[b.zone - 1], padding: '4px 6px', fontSize: 11, width: '100%', fontFamily: 'inheride' }}>
                  {[1,2,3,4,5].map(z => <option key={z} value={z} style={{ background: '#09090b', color: zoneColors[z-1] }}>Z{z}</option>)}
                </select>
              </div>

              <button onClick={() => removeBlock(b.id)} disabled={customBlocks.length <= 1}
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: customBlocks.length <= 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,118,117,0.1)', color: customBlocks.length <= 1 ? '#334155' : '#ff7675', cursor: customBlocks.length <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Builder acties */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addCustomBlock} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px dashed rgba(203, 213, 225,0.2)', background: 'rgba(203, 213, 225,0.04)', color: '#cbd5e1', cursor: 'pointer', fontFamily: 'inheride', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Plus size={14} /> Blok toevoegen
          </button>

           <button onClick={() => {
            const date = new Date();
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const todayStr = `${y}-${m}-${d}`;
            planWorkoutInCalendar(customWorkout, todayStr, customTotalMin);
            setBuildPlanned(true); setTimeout(() => setBuildPlanned(false), 3000);
          }} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${buildPlanned ? 'rgba(57,255,20,0.3)' : 'rgba(57,255,20,0.2)'}`, background: buildPlanned ? 'rgba(57,255,20,0.12)' : 'rgba(57,255,20,0.06)', color: buildPlanned ? '#39ff14' : '#39ff14', cursor: 'pointer', fontFamily: 'inheride', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {buildPlanned ? <CheckCircle size={14} /> : <CalendarPlus size={14} />}
            {buildPlanned ? 'Gepland!' : 'Plan in kalender'}
          </button>
        </div>

        {/* Wattage preview tabel */}
        {profile.ftp && (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Wattage Preview (FTP: {profile.ftp}W)
            </div>
            {customBlocks.map(b => (
              <div key={b.id} style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: 2, background: zoneColors[b.zone - 1], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#94a3b8' }}>{b.name}</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569' }}>{b.durationMin}m</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: zoneColors[b.zone - 1], minWidth: 55, textAlign: 'right' }}>{Math.round(b.powerPct / 100 * profile.ftp!)}W</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
