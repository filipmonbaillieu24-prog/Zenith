import React from 'react';
import './RideRow.css';
import { Ride, POWER_ZONES, HR_ZONES } from '../../types/workout';
import { ZoneBar, fmtDur } from './ZoneBar';

type RideSummaryWithBests = Omit<Ride, 'points'>;

interface RideRowProps {
  ride:      RideSummaryWithBests;
  selected:  boolean;
  comparing: boolean;
  onOpen:    () => void;
  onCompare: () => void;
  onDelete:  () => void;
  deleting:  boolean;
  prLabels?: string[];
}

function fmtDateShort(ms: number) {
  return new Date(ms).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' });
}

function ridePrimaryMetric(r: RideSummaryWithBests): { label: string; value: string; cls: string } {
  if (r.hasPower && r.eFTP)      return { label: 'eFTP',  value: `${r.eFTP}W`,      cls: 'chip--power' };
  if (r.hasPower && r.normPower) return { label: 'NP',    value: `${r.normPower}W`, cls: 'chip--power' };
  if (r.hasHR   && r.hrTSS)     return { label: 'hrTSS', value: `${r.hrTSS}`,      cls: 'chip--hr' };
  if (r.hasHR   && r.avgHR)     return { label: 'HR',    value: `${r.avgHR} bpm`,  cls: 'chip--hr' };
  return { label: 'Distance', value: `${r.distance} km`, cls: 'chip--gps' };
}

function cleanRideName(name: string, dateMs: number): string {
  let clean = name.replace(/_Cycle_Cyclewither$/i, '').replace(/_Cycle$/i, '').replace(/_Cyclewither$/i, '');
  
  if (/^GEOID_/i.test(clean) || /^\d{4}-\d{2}-\d{2}/.test(clean) || clean.length > 30) {
    const hour = new Date(dateMs).getHours();
    let timeOfDay = "Rit";
    if (hour >= 5 && hour < 12) timeOfDay = "Ochtendride";
    else if (hour >= 12 && hour < 17) timeOfDay = "Middagride";
    else if (hour >= 17 && hour < 22) timeOfDay = "Avondride";
    else timeOfDay = "Nachtride";

    const localDate = new Date(dateMs).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
    return `${timeOfDay} (${localDate})`;
  }

  clean = clean.replace(/_/g, ' ').replace(/-/g, ' - ');
  return clean;
}

export const RideRow: React.FC<RideRowProps> = ({ ride, selected, comparing, onOpen, onCompare, onDelete, deleting, prLabels }) => {
  const pm          = ridePrimaryMetric(ride);
  const accentColor = ride.hasPower ? '#a29bfe' : ride.hasHR ? '#ff7675' : '#55efc4';
  const zones       = ride.hasPower ? POWER_ZONES : HR_ZONES;
  const zoneTimes   = ride.hasPower ? ride.powerZoneTime : ride.hrZoneTime;

  return (
    <div
      className={`wd-ride-row ${selected ? 'wd-ride-row--selected' : ''} ${comparing ? 'wd-ride-row--comparing' : ''}`}
      style={{ borderLeftColor: comparing ? '#39ff14' : accentColor, display: 'flex', gap: 12, alignItems: 'center' }}
      onClick={onOpen}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="wd-ride-row__top">
          <span className="wd-ride-row__date">{fmtDateShort(ride.date)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {prLabels && prLabels.length > 0 && (
              <span className="wd-pr-badge" title={prLabels.join(', ')}>
                🏆 PR
              </span>
            )}
            <span className={`wd-ride-row__badge ${pm.cls}`}>{pm.label} {pm.value}</span>
          </div>
        </div>
        <div className="wd-ride-row__name" style={{ fontSize: 13, fontWeight: 700, margin: '2px 0 6px' }}>
          {cleanRideName(ride.name, ride.date)}
        </div>
        <div className="wd-ride-row__witha" style={{ marginBottom: zoneTimes ? 6 : 0 }}>
          <span>{ride.distance} km</span>
          <span>·</span>
          <span>{fmtDur(ride.duration)}</span>
          {ride.elevGain > 0 && <><span>·</span><span>⛰ {ride.elevGain}m</span></>}
          {ride.calories && <><span>·</span><span>🔥 {ride.calories} kcal</span></>}
        </div>
        {zoneTimes && <ZoneBar times={zoneTimes} zones={zones} />}
      </div>

      <div className="wd-ride-row__actions-col">
        <button
          className={`wd-ride-row__icon-btn ${comparing ? 'wd-ride-row__icon-btn--active' : ''}`}
          onClick={e => { e.stopPropagation(); onCompare(); }}
          title={comparing ? 'Vergelijking uitschakelen' : 'Vergelijk deze ride'}
        >
          ⇄
        </button>
        <button
          className="wd-ride-row__del-btn"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          disabled={deleting}
          title="Rit verwijderen"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
export { cleanRideName };
