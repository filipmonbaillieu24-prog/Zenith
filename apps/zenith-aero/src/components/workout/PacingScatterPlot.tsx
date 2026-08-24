import React, { useMemo } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { RideSummaryWithBests } from '../../types/workout';
import { Compass } from 'lucide-react';

interface PacingScatterPlotProps {
  rides: RideSummaryWithBests[];
}

export const PacingScatterPlot: React.FC<PacingScatterPlotProps> = ({ rides }) => {
  const chartData = useMemo(() => {
    return rides
      .filter(r => r.hasPower && r.variabilityIndex && r.intensityFactor)
      .map(r => ({
        vi: parseFloat(r.variabilityIndex!.toFixed(2)),
        if: parseFloat(r.intensityFactor!.toFixed(2)),
        name: r.name,
        date: new Date(r.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
      }));
  }, [rides]);

  if (chartData.length === 0) {
    return (
      <div className="wd-section-card">
        <div className="wd-section-card__head">
          <span className="wd-section-card__title">
            <Compass size={13} style={{ display: 'inline', marginRight: 5, color: '#a29bfe' }} />
            Ride Characteristics (IF vs VI)
          </span>
        </div>
        <p style={{ color: '#64748b', fontSize: 11, textAlign: 'center', margin: '20px 0' }}>
          No rides with power and pacing data found in selected range.
        </p>
      </div>
    );
  }

  return (
    <div className="wd-section-card">
      <div className="wd-section-card__head">
        <span className="wd-section-card__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Compass size={13} style={{ color: '#a29bfe' }} />
          Ride Characteristics & Pacing (IF vs VI)
        </span>
      </div>

      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid {...ZENITH_CHART_GRID} />
            {/* X-axis: Variability Index (VI) — 1.0 = perfectly steady */}
            <XAxis
              type="number"
              dataKey="vi"
              name="Variability Index (VI)"
              domain={[1.0, 1.30]}
              tick={ZENITH_CHART_AXIS_TICK}
            />
            {/* Y-axis: Intensity Factor (IF) — 1.0 = FTP */}
            <YAxis
              type="number"
              dataKey="if"
              name="Intensity Factor (IF)"
              domain={[0.40, 1.20]}
              tick={ZENITH_CHART_AXIS_TICK}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
              labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
              formatter={(v: any, name: any) => [v, name === 'vi' ? 'VI (Steadiness)' : 'IF (Intensity)']}
            />

            {/* Pacing boundaries */}
            <ReferenceLine x={1.05} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
            <ReferenceLine y={0.75} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
            
            <Scatter name="Rides" data={chartData} fill="#a29bfe" shape="circle" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Quadrant legend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.03)', paddingTop: 8 }}>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>
          <strong style={{ color: '#ff7675' }}>Top-left:</strong> Steady & Intense (Time trials, climbs)
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>
          <strong style={{ color: '#fdcb6e' }}>Top-right:</strong> Variable & Intense (Races, intervals)
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>
          <strong style={{ color: '#00b894' }}>Bottom-left:</strong> Steady & Easy (Flat endurance rides)
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>
          <strong style={{ color: '#74b9ff' }}>Bottom-right:</strong> Variable & Easy (Hilly group rides)
        </div>
      </div>
    </div>
  );
};
