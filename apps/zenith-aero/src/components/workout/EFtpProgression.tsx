import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { RideSummaryWithBests } from '../../types/workout';
import { Award } from 'lucide-react';
import { ZenithEmptyState } from '@zenith/shared';

interface EFtpProgressionProps {
  rides: RideSummaryWithBests[];
  weight?: number;
}

export const EFtpProgression: React.FC<EFtpProgressionProps> = ({ rides, weight = 75 }) => {
  const [viewMode, setViewMode] = useState<'watts' | 'wkg'>('watts');

  const chartData = useMemo(() => {
    // Get all rides with eFTP, sort chronologically
    return [...rides]
      .filter(r => r.eFTP && r.eFTP > 0)
      .sort((a, b) => a.date - b.date)
      .map(r => {
        const val = r.eFTP!;
        const wkg = parseFloat((val / weight).toFixed(2));
        return {
          rawDate: r.date,
          date: new Date(r.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
          watts: val,
          wkg: wkg,
          name: r.name
        };
      });
  }, [rides, weight]);

  if (chartData.length < 2) {
    return (
      <div className="wd-section-card">
        <div className="wd-section-card__head">
          <span className="wd-section-card__title">
            <Award size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5, color: '#cbd5e1' }} />
            eFTP & Power Progression
          </span>
        </div>
        <ZenithEmptyState
          icon={<Award size={20} strokeWidth={1.8} />}
          title="Not enough rides yet"
          message="Log a few more rides to see your eFTP progression over time."
        />
      </div>
    );
  }

  const currentEftp = chartData[chartData.length - 1];
  const startingEftp = chartData[0];
  const diffWatts = currentEftp.watts - startingEftp.watts;
  const diffWkg = parseFloat((currentEftp.wkg - startingEftp.wkg).toFixed(2));

  return (
    <div className="wd-section-card">
      <div className="wd-section-card__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="wd-section-card__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Award size={13} style={{ color: '#cbd5e1' }} />
          eFTP Progression
        </span>

        {/* Toggle buttons for absolute Watts vs W/kg */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button 
            onClick={() => setViewMode('watts')}
            style={{
              background: viewMode === 'watts' ? 'rgba(203, 213, 225, 0.12)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${viewMode === 'watts' ? 'rgba(203, 213, 225, 0.25)' : 'rgba(255,255,255,0.08)'}`,
              color: viewMode === 'watts' ? '#cbd5e1' : '#94a3b8',
              fontSize: '9px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              lineHeight: '1'
            }}
          >
            Watts
          </button>
          <button 
            onClick={() => setViewMode('wkg')}
            style={{
              background: viewMode === 'wkg' ? 'rgba(203, 213, 225, 0.12)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${viewMode === 'wkg' ? 'rgba(203, 213, 225, 0.25)' : 'rgba(255,255,255,0.08)'}`,
              color: viewMode === 'wkg' ? '#cbd5e1' : '#94a3b8',
              fontSize: '9px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              lineHeight: '1'
            }}
          >
            W/kg
          </button>
        </div>
      </div>

      {/* Progression summary badge */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc' }}>
            {viewMode === 'watts' ? `${currentEftp.watts} W` : `${currentEftp.wkg} W/kg`}
          </span>
          <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>Current eFTP</span>
        </div>
        <div style={{ 
          fontSize: 10, 
          fontWeight: 700, 
          color: (viewMode === 'watts' ? diffWatts : diffWkg) >= 0 ? '#34d399' : '#f87171',
          background: (viewMode === 'watts' ? diffWatts : diffWkg) >= 0 ? 'rgba(52, 211, 153, 0.08)' : 'rgba(248, 113, 113, 0.08)',
          border: `1px solid ${(viewMode === 'watts' ? diffWatts : diffWkg) >= 0 ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)'}`,
          padding: '2px 8px',
          borderRadius: 6
        }}>
          {(viewMode === 'watts' ? diffWatts : diffWkg) >= 0 ? '▲ +' : '▼ '}
          {viewMode === 'watts' ? `${diffWatts} W` : `${diffWkg} W/kg`} since first measurement
        </div>
      </div>

      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="eftpGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#cbd5e1" stopOpacity={0.18}/>
                <stop offset="95%" stopColor="#cbd5e1" stopOpacity={0.01}/>
              </linearGradient>
            </defs>
            <CartesianGrid {...ZENITH_CHART_GRID} />
            <XAxis dataKey="date" tick={ZENITH_CHART_AXIS_TICK} />
            <YAxis
              tick={ZENITH_CHART_AXIS_TICK}
              domain={viewMode === 'watts' ? ['dataMin - 15', 'dataMax + 15'] : ['dataMin - 0.2', 'dataMax + 0.2']}
            />
            <Tooltip
              contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
              labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
              labelFormatter={(label) => `Date: ${label}`}
              formatter={(v: any) => [viewMode === 'watts' ? `${v} W` : `${v} W/kg`, 'Estimated FTP']}
            />
            <Area 
              type="monotone" 
              dataKey={viewMode === 'watts' ? 'watts' : 'wkg'} 
              stroke="#cbd5e1" 
              strokeWidth={2} 
              fillOpacity={1} 
              fill="url(#eftpGrad)" 
              dot={{ fill: '#cbd5e1', r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
