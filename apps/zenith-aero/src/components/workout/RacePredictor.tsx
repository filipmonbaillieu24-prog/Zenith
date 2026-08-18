import React from 'react';
import './RacePredictor.css';
import { Timer, ShieldAlert } from 'lucide-react';
import { RideSummaryWithBests } from '../../types/workout';

interface RacePredictorProps {
  ftp?: number;
  weight?: number;
  rides: RideSummaryWithBests[];
}

export const RacePredictor: React.FC<RacePredictorProps> = ({ ftp, weight = 75, rides }) => {
  // Bepaal bruikbare FTP
  const resolvedFTP = (ftp ?? (rides.length > 0 ? Math.max(...rides.map(r => r.eFTP ?? 0)) : 250)) || 250;
  const wkg = resolvedFTP / weight;

  // Determine average cardiac drift from last 5 rides with HR data
  const hrRides = rides.filter(r => r.hasHR && r.decoupling != null);
  const avgDrift = hrRides.length > 0
    ? hrRides.slice(0, 5).reduce((s, r) => s + r.decoupling!, 0) / Math.min(5, hrRides.length)
    : 0;

  // Drift penalty factor: if drift is high (> 6%), athlete fatigues faster on long distances
  const driftPenalty = avgDrift > 6 ? 0.94 : 1.0;

  const distances = [
    { label: '20 km Tijdride', dist: 20, ftpPct: 0.95, baseSpeed: 22, wkgFactor: 4.5, penalty: 1.0 },
    { label: '50 km Soloride', dist: 50, ftpPct: 0.83, baseSpeed: 20, wkgFactor: 4.0, penalty: 1.0 },
    { label: '100 km Gran Fondo', dist: 100, ftpPct: 0.73, baseSpeed: 18, wkgFactor: 3.6, penalty: driftPenalty },
    { label: '150 km Epic Ride', dist: 150, ftpPct: 0.65, baseSpeed: 16, wkgFactor: 3.2, penalty: Math.min(1.0, driftPenalty * 0.97) }
  ];

  const predictions = distances.map(d => {
    const power = resolvedFTP * d.ftpPct * d.penalty;
    const speed = (d.baseSpeed + (power / weight) * d.wkgFactor);
    const timeHrs = d.dist / speed;
    
    const h = Math.floor(timeHrs);
    const m = Math.floor((timeHrs % 1) * 60);
    const s = Math.round(((timeHrs % 1) * 60 % 1) * 60);

    const timeStr = h > 0
      ? `${h}u ${String(m).padStart(2, '0')}m`
      : `${m}m ${String(s).padStart(2, '0')}s`;

    return {
      label: d.label,
      dist: d.dist,
      speed: parseFloat(speed.toFixed(1)),
      power: Math.round(power),
      timeStr
    };
  });

  return (
    <div className="pp-predictor-card">
      <div className="pp-predictor-header">
        <h3 className="pp-predictor-title">🧭 Race Predictor & Tempovoorspeller</h3>
        <span className="pp-predictor-subtitle">Estimate based on {resolvedFTP}W FTP ({wkg.toFixed(2)} W/kg)</span>
      </div>

      <div className="pp-predictions-grid">
        {predictions.map((p, idx) => (
          <div key={idx} className="pp-prediction-item">
            <div className="pp-pred-left">
              <span className="pp-pred-dist">{p.dist}k</span>
              <div>
                <div className="pp-pred-lbl">{p.label}</div>
                <div className="pp-pred-sub">⚡ {p.power}W avg · {p.speed} km/h</div>
              </div>
            </div>
            <div className="pp-pred-right">
              <Timer size={13} className="pp-pred-timer-icon" />
              <span className="pp-pred-time">{p.timeStr}</span>
            </div>
          </div>
        ))}
      </div>

      {avgDrift > 6 && (
        <div className="pp-predictor-warning">
          <ShieldAlert size={14} className="pp-warning-icon" />
          <span>
            <strong>Drift Penalty toegepast:</strong> Door een recente cardiac drift van {avgDrift.toFixed(1)}% on longer rides, is de prognose voor 100k+ rideten conservatiever berekend. Werk aan je aerobe duurvermogen om je tijden te verbeteren!
          </span>
        </div>
      )}
    </div>
  );
};
