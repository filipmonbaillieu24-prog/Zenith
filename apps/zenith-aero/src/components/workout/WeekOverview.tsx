import React, { useMemo } from 'react';
import { RideSummaryWithBests } from '../../types/workout';

interface Props {
  rides: RideSummaryWithBests[];
}

function getWeekBounds(weeksAgo: number = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7; // 1=Mon, 7=Sun
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - (dayOfWeek - 1) - weeksAgo * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday.getTime(), end: sunday.getTime() };
}

function fmtHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}u ${m}m` : `${h}u`;
}

function DeltaBadge({ current, previous, higherIsBetter = true }: {
  current: number;
  previous: number;
  higherIsBetter?: boolean;
}) {
  if (previous === 0 && current === 0) return <span style={{ color: '#64748b', fontSize: 10 }}>–</span>;
  if (previous === 0) return <span style={{ color: '#ffffff', fontSize: 10, fontWeight: 700 }}>Nieuw!</span>;
  const delta = current - previous;
  const pct = (delta / previous) * 100;
  const isPositive = higherIsBetter ? delta > 0 : delta < 0;
  const isFlat = Math.abs(pct) < 2;
  if (isFlat) return <span style={{ color: '#64748b', fontSize: 10 }}>→ stabiel</span>;
  return (
    <span style={{ color: isPositive ? '#ffffff' : '#ff7675', fontSize: 10, fontWeight: 700 }}>
      {delta > 0 ? '↑' : '↓'} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export const WeekOverview: React.FC<Props> = ({ rides }) => {
  const thisWeek = useMemo(() => getWeekBounds(0), []);
  const lastWeek = useMemo(() => getWeekBounds(1), []);

  const thisWeekRides = useMemo(
    () => rides.filter(r => r.date >= thisWeek.start && r.date <= thisWeek.end),
    [rides, thisWeek]
  );
  const lastWeekRides = useMemo(
    () => rides.filter(r => r.date >= lastWeek.start && r.date <= lastWeek.end),
    [rides, lastWeek]
  );

  const stats = useMemo(() => ({
    this: {
      km:      thisWeekRides.reduce((s, r) => s + r.distance, 0),
      seconds: thisWeekRides.reduce((s, r) => s + r.duration, 0),
      tss:     thisWeekRides.reduce((s, r) => s + (r.tss ?? r.hrTSS ?? 0), 0),
      elev:    thisWeekRides.reduce((s, r) => s + r.elevGain, 0),
      count:   thisWeekRides.length,
    },
    last: {
      km:      lastWeekRides.reduce((s, r) => s + r.distance, 0),
      seconds: lastWeekRides.reduce((s, r) => s + r.duration, 0),
      tss:     lastWeekRides.reduce((s, r) => s + (r.tss ?? r.hrTSS ?? 0), 0),
      elev:    lastWeekRides.reduce((s, r) => s + r.elevGain, 0),
      count:   lastWeekRides.length,
    },
  }), [thisWeekRides, lastWeekRides]);

  // Day bars — TSS heatmap of this week
  const dayBars = useMemo(() => {
    const days = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
    const maxTSS = Math.max(1, ...thisWeekRides.map(r => r.tss ?? r.hrTSS ?? 0));
    return days.map((day, idx) => {
      const dayStart = thisWeek.start + idx * 86400000;
      const dayEnd   = dayStart + 86400000 - 1;
      const dayRides = thisWeekRides.filter(r => r.date >= dayStart && r.date <= dayEnd);
      const tss      = dayRides.reduce((s, r) => s + (r.tss ?? r.hrTSS ?? 0), 0);
      const km       = dayRides.reduce((s, r) => s + r.distance, 0);
      const rawToday = new Date().getDay();
      const adjustedToday = rawToday === 0 ? 7 : rawToday;
      const isToday  = idx + 1 === adjustedToday;
      return {
        day,
        tss,
        km,
        heightPct: tss > 0 ? Math.max(12, (tss / maxTSS) * 100) : 0,
        isToday,
        hasRide: dayRides.length > 0,
      };
    });
  }, [thisWeek, thisWeekRides]);

  const METRICS = [
    { label: 'Rides',  this: stats.this.count,   last: stats.last.count,   fmt: (v: number) => String(v),                  unit: ''   },
    { label: 'Distance', this: stats.this.km,       last: stats.last.km,       fmt: (v: number) => v.toFixed(0),               unit: 'km' },
    { label: 'Tijd',    this: stats.this.seconds,  last: stats.last.seconds,  fmt: fmtHours,                                  unit: ''   },
    { label: 'TSS',     this: stats.this.tss,      last: stats.last.tss,      fmt: (v: number) => Math.round(v).toString(),   unit: ''   },
    { label: 'Hoogte',  this: stats.this.elev,     last: stats.last.elev,     fmt: (v: number) => v.toFixed(0),               unit: 'm'  },
  ];

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(203, 213, 225,0.04) 0%, rgba(255,255,255,0.01) 100%)',
      border: '1px solid rgba(203, 213, 225,0.14)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            📅 Deze Week
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>vs vorige week</div>
        </div>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {stats.this.count} ride{stats.this.count !== 1 ? 'ten' : ''}
        </span>
      </div>

      {/* Day bars */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 32 }}>
        {dayBars.map((d, i) => (
          <div
            key={i}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
            title={d.tss > 0 ? `${d.day}: ${Math.round(d.tss)} TSS · ${d.km.toFixed(1)} km` : d.day}
          >
            <div style={{
              width: '100%',
              height: d.heightPct > 0 ? `${d.heightPct}%` : 3,
              background: d.isToday
                ? '#cbd5e1'
                : d.hasRide
                  ? 'rgba(203, 213, 225,0.35)'
                  : 'rgba(255,255,255,0.04)',
              borderRadius: 3,
              transition: 'height 0.3s ease',
              minHeight: 3,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {dayBars.map((d, i) => (
          <div key={i} style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 9,
            color: d.isToday ? '#cbd5e1' : '#475569',
            fontWeight: d.isToday ? 800 : 500,
          }}>
            {d.day}
          </div>
        ))}
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10 }}>
        {METRICS.map(m => (
          <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>{m.label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', fontFamily: 'Outfit, sans-serif' }}>
              {m.fmt(m.this)}
              <span style={{ fontSize: 9, color: '#64748b', marginLeft: 2 }}>{m.unit}</span>
            </span>
            <DeltaBadge current={m.this} previous={m.last} />
          </div>
        ))}
      </div>
    </div>
  );
};
