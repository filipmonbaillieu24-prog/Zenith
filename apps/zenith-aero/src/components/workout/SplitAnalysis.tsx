import React from 'react';
import './SplitAnalysis.css';
import { Ride } from '../../types/workout';

interface SplitAnalysisProps {
  ride: Ride;
}

export const SplitAnalysis: React.FC<SplitAnalysisProps> = ({ ride }) => {
  const hasSplit = (
    ride.firstHalfPower  != null || ride.firstHalfHR    != null ||
    ride.firstHalfSpeed  != null
  );
  if (!hasSplit) return null;

  const rows: { label: string; first: string; second: string; diff: number; unit: string; invertGood?: boolean }[] = [];

  if (ride.firstHalfPower != null && ride.secondHalfPower != null) {
    const diff = ride.secondHalfPower - ride.firstHalfPower;
    rows.push({ label: 'Avg. Power', first: `${ride.firstHalfPower}W`, second: `${ride.secondHalfPower}W`, diff, unit: 'W' });
  }
  if (ride.firstHalfHR != null && ride.secondHalfHR != null) {
    const diff = ride.secondHalfHR - ride.firstHalfHR;
    rows.push({ label: 'Avg. Heart Rate', first: `${ride.firstHalfHR} bpm`, second: `${ride.secondHalfHR} bpm`, diff, unit: 'bpm', invertGood: true });
  }
  if (ride.firstHalfSpeed != null && ride.secondHalfSpeed != null) {
    const diff = ride.secondHalfSpeed - ride.firstHalfSpeed;
    rows.push({ label: 'Avg. Speed', first: `${ride.firstHalfSpeed} km/h`, second: `${ride.secondHalfSpeed} km/h`, diff, unit: 'km/h' });
  }

  if (rows.length === 0) return null;

  const fatigueScore = ride.firstHalfPower && ride.secondHalfPower
    ? ((ride.firstHalfPower - ride.secondHalfPower) / ride.firstHalfPower * 100)
    : null;

  return (
    <div className="rp-chart-card">
      <div className="wd-chart-card__head">
        <h3>⚖️ Eerste vs tweede helft</h3>
        {fatigueScore != null && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
            background: Math.abs(fatigueScore) < 3 ? 'rgba(0,184,148,0.15)' : fatigueScore > 5 ? 'rgba(214,48,49,0.15)' : 'rgba(253,203,110,0.15)',
            color:      Math.abs(fatigueScore) < 3 ? '#55efc4'              : fatigueScore > 5 ? '#ff7675'              : '#fdcb6e',
          }}>
            {Math.abs(fatigueScore) < 3 ? '✅ Well paced' : fatigueScore > 5 ? `⚠️ ${fatigueScore.toFixed(1)}% fatigue` : `⚡ ${fatigueScore.toFixed(1)}% decay`}
          </span>
        )}
      </div>
      <div className="rp-split-grid">
        <div className="rp-split-header">
          <span>Metriek</span>
          <span>Eerste helft</span>
          <span>Tweede helft</span>
          <span>Verschil</span>
        </div>
        {rows.map((r, i) => {
          const isGood = r.invertGood ? r.diff <= 0 : r.diff >= 0;
          const color  = Math.abs(r.diff) < 1 ? '#555' : isGood ? '#55efc4' : '#ff7675';
          return (
            <div className="rp-split-row" key={i}>
              <span className="rp-split-label">{r.label}</span>
              <span>{r.first}</span>
              <span>{r.second}</span>
              <span style={{ color, fontWeight: 600 }}>
                {r.diff > 0 ? '+' : ''}{r.diff.toFixed(r.unit === 'km/h' ? 1 : 0)}{r.unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
