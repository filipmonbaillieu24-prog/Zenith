import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { RideSummaryWithBests } from '../../types/workout';
import { Calendar } from 'lucide-react';

interface WeeklyConsistencyTrackerProps {
  rides: RideSummaryWithBests[];
}

export const WeeklyConsistencyTracker: React.FC<WeeklyConsistencyTrackerProps> = ({ rides }) => {
  
  const weeklyData = useMemo(() => {
    const data = [];
    const oneDay = 24 * 3600 * 1000;
    const oneWeek = 7 * oneDay;
    const now = Date.now();

    // Create 12 weekly buckets (from 12 weeks ago to now)
    for (let i = 11; i >= 0; i--) {
      const end = now - i * oneWeek;
      const start = end - oneWeek;

      const weekRides = rides.filter(r => r.date >= start && r.date < end);
      
      const totalTSS = weekRides.reduce((s, r) => s + (r.tss ?? r.hrTSS ?? 0), 0);
      const totalSeconds = weekRides.reduce((s, r) => s + (r.duration ?? 0), 0);
      const hours = parseFloat((totalSeconds / 3600).toFixed(1));

      const startDateStr = new Date(start).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' });
      const endDateStr = new Date(end).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' });

      data.push({
        label: `${startDateStr} - ${endDateStr}`,
        tss: Math.round(totalTSS),
        hours: hours,
        count: weekRides.length
      });
    }

    return data;
  }, [rides]);

  // Bereken totalen
  const totals = useMemo(() => {
    const totalTss = weeklyData.reduce((s, w) => s + w.tss, 0);
    const totalHours = weeklyData.reduce((s, w) => s + w.hours, 0);
    const avgTss = Math.round(totalTss / 12);
    const avgHours = parseFloat((totalHours / 12).toFixed(1));
    return { avgTss, avgHours };
  }, [weeklyData]);

  return (
    <div className="wd-section-card">
      <div className="wd-section-card__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="wd-section-card__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={13} style={{ color: '#6c5ce7' }} />
          Wekelijkse Consistentie (12 Weken)
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{totals.avgHours} u</span>
          <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>Gem. Volume / wk</span>
        </div>
        <div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{totals.avgTss}</span>
          <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>Gem. TSS / wk</span>
        </div>
      </div>

      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={weeklyData} margin={{ top: 5, right: -10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 7 }} interval={1} />
            
            {/* Left Y-axis for TSS */}
            <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 8 }} width={25} />
            
            {/* Right Y-axis for Hours */}
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 8 }} width={20} />
            
            <Tooltip 
              contentStyle={{ background: '#0d0d1a', border: 'none', borderRadius: 8, fontSize: 10 }}
              formatter={(v: any, name: any) => [v, name === 'tss' ? 'Wekelijkse TSS' : 'Trainingsuren']}
            />
            
            <Bar yAxisId="left" dataKey="tss" fill="#6c5ce7" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="hours" stroke="#00b894" strokeWidth={2} dot={{ fill: '#00b894', r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
