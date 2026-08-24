import React, { useState } from 'react';
import { X, Moon, Footprints, Scale, SlidersHorizontal } from 'lucide-react';

interface ManualLogModalProps {
  onClose: () => void;
  onSave: (type: 'weight' | 'sleep' | 'steps', payload: any) => Promise<void>;
}

export const ManualLogModal: React.FC<ManualLogModalProps> = ({
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'steps' | 'sleep' | 'weight'>('steps');
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Steps state
  const [stepsCount, setStepsCount] = useState<number>(10000);

  // Sleep mode & basic state
  const [useDetailedPhases, setUseDetailedPhases] = useState<boolean>(true);
  const [sleepHours, setSleepHours] = useState<number>(7);
  const [sleepMinutes, setSleepMinutes] = useState<number>(30);
  const [sleepQuality, setSleepQuality] = useState<number>(80);

  // Detailed sleep phases state
  const [deepHours, setDeepHours] = useState<number>(1);
  const [deepMinutes, setDeepMinutes] = useState<number>(45);
  const [lightHours, setLightHours] = useState<number>(4);
  const [lightMinutes, setLightMinutes] = useState<number>(15);
  const [remHours, setRemHours] = useState<number>(1);
  const [remMinutes, setRemMinutes] = useState<number>(30);
  const [awakeHours, setAwakeHours] = useState<number>(0);
  const [awakeMinutes, setAwakeMinutes] = useState<number>(15);

  // Calculate sum of detailed phases
  const totalPhaseMinutes = 
    (deepHours * 60 + deepMinutes) +
    (lightHours * 60 + lightMinutes) +
    (remHours * 60 + remMinutes) +
    (awakeHours * 60 + awakeMinutes);

  const calcHours = Math.floor(totalPhaseMinutes / 60);
  const calcMins = totalPhaseMinutes % 60;

  // Weight state
  const [weightKg, setWeightKg] = useState<number>(75.0);
  const [bodyFat, setBodyFat] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loggedAt = new Date(date).toISOString();
      if (activeTab === 'steps') {
        await onSave('steps', {
          step_count: stepsCount,
          logged_at: loggedAt,
        });
      } else if (activeTab === 'sleep') {
        let totalMins = 0;
        let deepMins = 0;
        let lightMins = 0;
        let remMins = 0;
        let awakeMins = 0;

        if (useDetailedPhases) {
          deepMins = deepHours * 60 + deepMinutes;
          lightMins = lightHours * 60 + lightMinutes;
          remMins = remHours * 60 + remMinutes;
          awakeMins = awakeHours * 60 + awakeMinutes;
          totalMins = deepMins + lightMins + remMins + awakeMins;
        } else {
          totalMins = sleepHours * 60 + sleepMinutes;
          // Approximate default phases if detailed not specified
          deepMins = Math.round(totalMins * 0.25);
          lightMins = Math.round(totalMins * 0.55);
          remMins = Math.round(totalMins * 0.18);
          awakeMins = Math.max(0, totalMins - (deepMins + lightMins + remMins));
        }

        await onSave('sleep', {
          duration_minutes: totalMins,
          deep_minutes: deepMins,
          light_minutes: lightMins,
          rem_minutes: remMins,
          awake_minutes: awakeMins,
          quality_score: sleepQuality,
          logged_at: loggedAt,
        });
      } else if (activeTab === 'weight') {
        await onSave('weight', {
          weight: weightKg,
          body_fat: bodyFat ? parseFloat(bodyFat) : null,
          logged_at: loggedAt,
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error saving measurement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Manual Logging</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Headers */}
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid rgba(255,255,255,0.05)', 
          padding: '6px', 
          borderRadius: '14px', 
          marginBottom: '24px',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('steps')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid ' + (activeTab === 'steps' ? 'rgba(203, 213, 225, 0.25)' : 'transparent'),
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === 'steps' ? 'rgba(203, 213, 225, 0.08)' : 'transparent',
              color: activeTab === 'steps' ? '#fff' : 'var(--text-muted)'
            }}
          >
            <Footprints size={14} style={{ color: activeTab === 'steps' ? '#cbd5e1' : 'inherit' }} /> Steps
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sleep')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid ' + (activeTab === 'sleep' ? 'rgba(168, 85, 247, 0.3)' : 'transparent'),
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === 'sleep' ? 'rgba(168, 85, 247, 0.12)' : 'transparent',
              color: activeTab === 'sleep' ? '#a855f7' : 'var(--text-muted)'
            }}
          >
            <Moon size={14} style={{ color: activeTab === 'sleep' ? '#a855f7' : 'inherit' }} /> Sleep
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('weight')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid ' + (activeTab === 'weight' ? 'rgba(203, 213, 225, 0.25)' : 'transparent'),
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === 'weight' ? 'rgba(203, 213, 225, 0.08)' : 'transparent',
              color: activeTab === 'weight' ? '#fff' : 'var(--text-muted)'
            }}
          >
            <Scale size={14} style={{ color: activeTab === 'weight' ? '#cbd5e1' : 'inherit' }} /> Weight
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Shared Date field */}
          <div className="form-group">
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Steps Form */}
          {activeTab === 'steps' && (
            <div className="form-group animate-fade-in">
              <label className="form-label">Aantal Steps</label>
              <input
                type="number"
                className="form-input"
                value={stepsCount}
                onChange={(e) => setStepsCount(parseInt(e.target.value) || 0)}
                min="0"
                required
              />
            </div>
          )}

          {/* Sleep Form */}
          {activeTab === 'sleep' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              
              {/* Detailed vs Quick Mode Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(168, 85, 247, 0.06)',
                border: '1px solid rgba(168, 85, 247, 0.15)',
                padding: '10px 14px',
                borderRadius: '12px',
                marginBottom: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SlidersHorizontal size={15} style={{ color: '#a855f7' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#e9d5ff' }}>
                    Specify sleep phases by type
                  </span>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useDetailedPhases}
                    onChange={(e) => setUseDetailedPhases(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: useDetailedPhases ? '#a855f7' : '#3f3f46',
                    transition: '0.3s',
                    borderRadius: 22
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '""',
                      height: 16, width: 16,
                      left: useDetailedPhases ? 21 : 3,
                      bottom: 3,
                      backgroundColor: 'white',
                      transition: '0.3s',
                      borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>

              {/* DETAILED PHASES INPUT MODE */}
              {useDetailedPhases ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Total Sleep Summary Banner */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)',
                    border: '1px solid rgba(168, 85, 247, 0.25)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Calculated Sleep:</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: '#a855f7' }}>
                      {calcHours}h {calcMins}m <span style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1' }}>({totalPhaseMinutes} min)</span>
                    </span>
                  </div>

                  {/* 4 Phase Rows */}
                  {/* 1. Deep Sleep */}
                  <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: 12, borderRadius: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      🟣 Deep Sleep <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>(Physical & muscle recovery)</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Hours</label>
                        <input
                          type="number"
                          className="form-input"
                          value={deepHours}
                          onChange={(e) => setDeepHours(Math.max(0, parseInt(e.target.value) || 0))}
                          min="0"
                          max="24"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Minutes</label>
                        <input
                          type="number"
                          className="form-input"
                          value={deepMinutes}
                          onChange={(e) => setDeepMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                          min="0"
                          max="59"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Light Sleep */}
                  <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: 12, borderRadius: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      🔵 Light Sleep <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>(Memory processing)</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Hours</label>
                        <input
                          type="number"
                          className="form-input"
                          value={lightHours}
                          onChange={(e) => setLightHours(Math.max(0, parseInt(e.target.value) || 0))}
                          min="0"
                          max="24"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Minutes</label>
                        <input
                          type="number"
                          className="form-input"
                          value={lightMinutes}
                          onChange={(e) => setLightMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                          min="0"
                          max="59"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. REM Sleep */}
                  <div style={{ background: 'rgba(236, 72, 153, 0.08)', border: '1px solid rgba(236, 72, 153, 0.2)', padding: 12, borderRadius: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      💖 REM Sleep <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>(Mental energy & dreaming)</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Hours</label>
                        <input
                          type="number"
                          className="form-input"
                          value={remHours}
                          onChange={(e) => setRemHours(Math.max(0, parseInt(e.target.value) || 0))}
                          min="0"
                          max="24"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Minutes</label>
                        <input
                          type="number"
                          className="form-input"
                          value={remMinutes}
                          onChange={(e) => setRemMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                          min="0"
                          max="59"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. Awake */}
                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: 12, borderRadius: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      🟡 Awake <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>(Micro-awakenings)</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Hours</label>
                        <input
                          type="number"
                          className="form-input"
                          value={awakeHours}
                          onChange={(e) => setAwakeHours(Math.max(0, parseInt(e.target.value) || 0))}
                          min="0"
                          max="24"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 10 }}>Minutes</label>
                        <input
                          type="number"
                          className="form-input"
                          value={awakeMinutes}
                          onChange={(e) => setAwakeMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                          min="0"
                          max="59"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* SIMPLE TOTAL SLEEP DURATION MODE */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Total Duration (Hours)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={sleepHours}
                      onChange={(e) => setSleepHours(parseInt(e.target.value) || 0)}
                      min="0"
                      max="24"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total Duration (Minutes)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={sleepMinutes}
                      onChange={(e) => setSleepMinutes(parseInt(e.target.value) || 0)}
                      min="0"
                      max="59"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Quality Slider */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="form-label">Sleep Quality Score</label>
                  <span style={{ fontSize: 11, color: '#a855f7', fontWeight: 800 }}>{sleepQuality}/100</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={sleepQuality}
                  onChange={(e) => setSleepQuality(parseInt(e.target.value) || 0)}
                  style={{ width: '100%', accentColor: '#a855f7' }}
                />
              </div>
            </div>
          )}

          {/* Weight Form */}
          {activeTab === 'weight' && (
            <div className="animate-fade-in">
              <div className="form-group">
                <label className="form-label">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={weightKg}
                  onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                  min="30"
                  max="300"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Body Fat % (Optional)</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={bodyFat}
                  placeholder="e.g. 14.5"
                  onChange={(e) => setBodyFat(e.target.value)}
                  min="2"
                  max="60"
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Save...' : 'Save Measurement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

