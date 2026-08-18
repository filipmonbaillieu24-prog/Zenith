import React from 'react';
import './ConsistencyCalendar.css';
import { Activity } from 'lucide-react';
import { RideSummaryWithBests } from '../../types/workout';

interface ConsistencyCalendarProps {
  rides: RideSummaryWithBests[];
}

export const ConsistencyCalendar: React.FC<ConsistencyCalendarProps> = ({ rides }) => {
  const ridesByDay = new Map<string, number>();
  for (const r of rides) {
    const key = new Date(r.date).toISOString().slice(0, 10);
    ridesByDay.set(key, (ridesByDay.get(key) ?? 0) + r.distance);
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days: { date: string; km: number; week: number; dow: number }[] = [];
  for (let i = 111; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, km: ridesByDay.get(key) ?? 0, week: Math.floor(i / 7), dow: d.getDay() });
  }
  const maxKm = Math.max(...days.map(d => d.km), 1);
  function intensity(km: number): string {
    if (km === 0) return 'rgba(255,255,255,0.05)';
    const r = km / maxKm;
    if (r < 0.25) return 'rgba(0,184,148,0.3)';
    if (r < 0.5)  return 'rgba(0,184,148,0.55)';
    if (r < 0.75) return 'rgba(0,184,148,0.8)';
    return '#00b894';
  }
  const weeks: typeof days[] = [];
  for (let w = 15; w >= 0; w--) weeks.push(days.filter(d => d.week === w).sort((a, b) => a.dow - b.dow));
  const activeDays = days.filter(d => d.km > 0).length;
  const totalKm    = days.reduce((s, d) => s + d.km, 0);
  const dowLabels  = ['Z', 'M', 'D', 'W', 'D', 'V', 'Z'];

  return (
    <div className="wd-section-card">
      <div className="wd-section-card__head">
        <span className="wd-section-card__title">
          <Activity size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5, color: '#cbd5e1' }} />
          Consistentie
        </span>
        <span className="wd-section-card__sub">{activeDays} days · {totalKm.toFixed(0)} km</span>
      </div>
      <div className="wd-cal-wrap">
        <div className="wd-cal-dow">{dowLabels.map((l, i) => <span key={i}>{l}</span>)}</div>
        <div className="wd-cal-grid">
          {weeks.map((week, wi) => (
            <div key={wi} className="wd-cal-col">
              {Array.from({ length: 7 }, (_, dow) => {
                const day = week.find(d => d.dow === dow);
                return (
                  <div key={dow} className="wd-cal-cell"
                    style={{ background: day ? intensity(day.km) : 'rgba(255,255,255,0.05)' }}
                    title={day && day.km > 0 ? `${day.date}: ${day.km.toFixed(1)} km` : ''}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
