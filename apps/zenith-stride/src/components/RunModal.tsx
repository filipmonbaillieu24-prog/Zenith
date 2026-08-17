import React, { useState } from 'react';
import { RunActivity, RunType, RunningShoe } from '../types/stride';
import { 
  X, 
  Calendar, 
  Clock, 
  Footprints, 
  Heart, 
  Flame, 
  Zap, 
  Sliders, 
  TrendingUp, 
  Check, 
  Activity,
  Layers
} from 'lucide-react';

interface RunModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (run: RunActivity) => void;
  shoes: RunningShoe[];
  initialRun?: RunActivity | null;
}

export const RunModal: React.FC<RunModalProps> = ({
  isOpen,
  onClose,
  onSave,
  shoes,
  initialRun
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState(initialRun?.title || '');
  const [date, setDate] = useState(initialRun?.date || new Date().toISOString().slice(0, 10));
  const [timeOfDay, setTimeOfDay] = useState(initialRun?.timeOfDay || '09:30');
  const [type, setType] = useState<RunType>(initialRun?.type || 'easy');
  const [isTreadmill, setIsTreadmill] = useState(initialRun?.isTreadmill || false);
  const [inclinePercent, setInclinePercent] = useState<number>(initialRun?.inclinePercent || 1.0);
  const [distanceKm, setDistanceKm] = useState<string>(initialRun?.distanceKm ? String(initialRun.distanceKm) : '');
  const [minutes, setMinutes] = useState<string>(initialRun ? String(Math.floor(initialRun.durationSec / 60)) : '');
  const [seconds, setSeconds] = useState<string>(initialRun ? String(initialRun.durationSec % 60) : '');
  const [avgHeartRate, setAvgHeartRate] = useState<string>(initialRun?.avgHeartRate ? String(initialRun.avgHeartRate) : '');
  const [maxHeartRate, setMaxHeartRate] = useState<string>(initialRun?.maxHeartRate ? String(initialRun.maxHeartRate) : '');
  const [avgCadenceSpm, setAvgCadenceSpm] = useState<string>(initialRun?.avgCadenceSpm ? String(initialRun.avgCadenceSpm) : '172');
  const [elevationGainM, setElevationGainM] = useState<string>(initialRun?.elevationGainM ? String(initialRun.elevationGainM) : '0');
  const [rpe, setRpe] = useState<number>(initialRun?.rpe || 6);
  const [shoeId, setShoeId] = useState<string>(initialRun?.shoeId || (shoes.length > 0 ? shoes[0].id : ''));
  const [notes, setNotes] = useState(initialRun?.notes || '');

  const handleToggleTreadmill = (checked: boolean) => {
    setIsTreadmill(checked);
    if (checked) {
      setType('treadmill');
      setElevationGainM('0');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const distNum = parseFloat(distanceKm) || 5.0;
    const durSec = (parseInt(minutes, 10) || 25) * 60 + (parseInt(seconds, 10) || 0);
    const paceDecimal = distNum > 0 ? (durSec / 60) / distNum : 5.0;
    const selectedShoe = shoes.find(s => s.id === shoeId);

    const newRun: RunActivity = {
      id: initialRun?.id || `run-${Date.now()}`,
      title: title || (isTreadmill ? 'Loopband Sessie' : 'Hardloopsessie'),
      date,
      timeOfDay,
      type: isTreadmill ? 'treadmill' : type,
      isTreadmill,
      inclinePercent: isTreadmill ? inclinePercent : 0,
      distanceKm: parseFloat(distNum.toFixed(2)),
      durationSec: durSec,
      avgPaceMinKm: parseFloat(paceDecimal.toFixed(2)),
      elevationGainM: isTreadmill ? 0 : (parseInt(elevationGainM, 10) || 0),
      avgHeartRate: avgHeartRate ? parseInt(avgHeartRate, 10) : undefined,
      maxHeartRate: maxHeartRate ? parseInt(maxHeartRate, 10) : undefined,
      avgCadenceSpm: avgCadenceSpm ? parseInt(avgCadenceSpm, 10) : 172,
      calories: Math.round(distNum * 65),
      rpe,
      shoeId: selectedShoe?.id,
      shoeName: selectedShoe ? `${selectedShoe.brand} ${selectedShoe.model}` : undefined,
      source: 'manual',
      notes
    };

    onSave(newRun);
    onClose();
  };

  return (
    <div className="stride-modal-backdrop" onClick={onClose}>
      <div className="stride-modal-container" onClick={e => e.stopPropagation()}>
        <div className="stride-modal-header">
          <div>
            <h3>{initialRun ? 'Sessie Bewerken' : 'Nieuwe Hardloopsessie Invoeren'}</h3>
            <p className="subtitle">Handmatige invoer & Loopband instellingen</p>
          </div>
          <button className="stride-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="stride-modal-body">
          {/* Treadmill Switch Bar */}
          <div className={`treadmill-banner ${isTreadmill ? 'active' : ''}`}>
            <div className="treadmill-info">
              <Layers size={18} className="treadmill-icon" />
              <div>
                <strong>Hardloopsessie op Loopband (Indoor)</strong>
                <span>Helling & virtuele afstand kaliberatie</span>
              </div>
            </div>
            <label className="stride-toggle-switch">
              <input 
                type="checkbox" 
                checked={isTreadmill} 
                onChange={e => handleToggleTreadmill(e.target.checked)} 
              />
              <span className="stride-toggle-slider"></span>
            </label>
          </div>

          <div className="form-row">
            <div className="form-group flex-2">
              <label>Titel van de sessie</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                placeholder={isTreadmill ? 'Bijv. Loopband Drempel 4x5 min' : 'Bijv. Ochtendduurloop Bossen'}
                required
              />
            </div>
            <div className="form-group flex-1">
              <label>Datum</label>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Type Training</label>
              <select value={type} onChange={e => setType(e.target.value as RunType)}>
                <option value="easy">Easy Run / Herstel</option>
                <option value="long_run">Lange Duurloop</option>
                <option value="intervals">Intervallen / Tempolopen</option>
                <option value="tempo">Tempo Run</option>
                <option value="treadmill">Loopband (Indoor)</option>
                <option value="trail">Trail Run</option>
                <option value="race">Wedstrijd / Race</option>
              </select>
            </div>

            {isTreadmill ? (
              <div className="form-group flex-1 highlight-group">
                <label style={{ color: '#38bdf8' }}>Helling Loopband (%)</label>
                <input 
                  type="number" 
                  step="0.5" 
                  min="0" 
                  max="15"
                  value={inclinePercent} 
                  onChange={e => setInclinePercent(parseFloat(e.target.value) || 0)} 
                  placeholder="Bijv. 1.5"
                />
              </div>
            ) : (
              <div className="form-group flex-1">
                <label>Hoogtemeters (m)</label>
                <input 
                  type="number" 
                  value={elevationGainM} 
                  onChange={e => setElevationGainM(e.target.value)} 
                  placeholder="0"
                />
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Afstand (km)</label>
              <input 
                type="number" 
                step="0.01" 
                value={distanceKm} 
                onChange={e => setDistanceKm(e.target.value)} 
                placeholder="10.0"
                required
              />
            </div>
            <div className="form-group flex-1">
              <label>Tijdsduur (Minuten : Seconden)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input 
                  type="number" 
                  placeholder="Min" 
                  value={minutes} 
                  onChange={e => setMinutes(e.target.value)} 
                  required
                />
                <input 
                  type="number" 
                  placeholder="Sec" 
                  value={seconds} 
                  onChange={e => setSeconds(e.target.value)} 
                />
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Gemiddelde Hartslag (bpm)</label>
              <input 
                type="number" 
                value={avgHeartRate} 
                onChange={e => setAvgHeartRate(e.target.value)} 
                placeholder="152"
              />
            </div>
            <div className="form-group flex-1">
              <label>Cadans (spm)</label>
              <input 
                type="number" 
                value={avgCadenceSpm} 
                onChange={e => setAvgCadenceSpm(e.target.value)} 
                placeholder="172"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Hardloopschoenen / Gear</label>
              <select value={shoeId} onChange={e => setShoeId(e.target.value)}>
                <option value="">-- Geen specifieke schoen --</option>
                {shoes.map(shoe => (
                  <option key={shoe.id} value={shoe.id}>
                    {shoe.brand} {shoe.model} ({shoe.totalDistanceKm} / {shoe.maxDistanceKm} km)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group flex-1">
              <label>Ervaren Zwaarte (RPE: 1 - 10)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={rpe} 
                  onChange={e => setRpe(parseInt(e.target.value, 10))} 
                  style={{ flex: 1 }}
                />
                <span className="rpe-badge">{rpe}/10</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Notities & Gevoel</label>
            <textarea 
              rows={2} 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              placeholder="Bijv. Vlot gevoel op de benen, lichte tegenwind op de heenweg."
            />
          </div>

          <div className="stride-modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Annuleren</button>
            <button type="submit" className="btn-save">
              <Check size={16} style={{ marginRight: 6 }} />
              Sessie Opslaan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
