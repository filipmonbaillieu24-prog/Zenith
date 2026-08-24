import React from 'react';
import './PowerHistogram.css';
import { BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { RidePoint, POWER_ZONES } from '../../types/workout';

interface PowerHistogramProps {
  points: RidePoint[];
  ftp?: number;
}

const bucket = 25;

export const PowerHistogram: React.FC<PowerHistogramProps> = ({ points, ftp }) => {
  const pwrPts = points.filter(p => p.power != null && p.power! >= 0);
  if (pwrPts.length < 30) return null;

  // Build histogram in 25W buckets
  const maxW   = Math.min(Math.max(...pwrPts.map(p => p.power!)), 1200);
  const bins   = Math.ceil(maxW / bucket) + 1;
  const counts = Array(bins).fill(0);
  for (const p of pwrPts) {
    const b = Math.min(Math.floor(p.power! / bucket), bins - 1);
    counts[b]++;
  }
  const total = counts.reduce((s, c) => s + c, 0);
  const data  = counts.map((c, i) => ({
    w:    i * bucket,
    pct:  parseFloat(((c / total) * 100).toFixed(1)),
    zone: ftp ? POWER_ZONES.find(z => (i * bucket / ftp * 100) >= z.minPct && (i * bucket / ftp * 100) <= z.maxPct)?.color ?? '#555' : '#6c5ce7',
  })).filter(d => d.pct > 0);

  return (
    <div className="rp-chart-card">
      <h3>📊 Power Distribution</h3>
      <p style={{ fontSize: 11, color: '#555', margin: '0 0 10px' }}>Time (%) at each power level</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...ZENITH_CHART_GRID} vertical={false} />
          <XAxis dataKey="w" tick={ZENITH_CHART_AXIS_TICK} unit="W" interval={3} />
          <YAxis tick={ZENITH_CHART_AXIS_TICK} unit="%" width={30} />
          <Tooltip
            contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
            labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
            formatter={(v: any) => [`${v}%`, 'Time']}
            labelFormatter={(w: any) => `${w}–${w + bucket}W`}
          />
          {ftp && <ReferenceLine x={ftp} stroke="#e17055" strokeDasharray="3 3" />}
          <Bar dataKey="pct" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.zone} fillOpacity={0.75} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
export { bucket as powerHistogramBucket };
