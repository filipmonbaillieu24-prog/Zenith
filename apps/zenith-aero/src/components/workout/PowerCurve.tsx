import React from 'react';
import './PowerCurve.css';
import { ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, Area, ResponsiveContainer } from 'recharts';
import { ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { Ride, EFFORT_DURATIONS } from '../../types/workout';

interface PowerCurveProps {
  ride: Ride;
  ftp?: number;
}

export const PowerCurve: React.FC<PowerCurveProps> = ({ ride, ftp }) => {
  const data = EFFORT_DURATIONS
    .map(({ key, label }) => ({ label, power: (ride.bestEfforts as any)[key] }))
    .filter(d => d.power != null);
  if (data.length < 3) return null;
  return (
    <div className="rp-chart-card">
      <h3>⚡ Power Duration Curve</h3>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data}>
          <CartesianGrid {...ZENITH_CHART_GRID} />
          <XAxis dataKey="label" tick={ZENITH_CHART_AXIS_TICK} />
          <YAxis yAxisId="left" tick={ZENITH_CHART_AXIS_TICK} unit="W" />
          <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
            formatter={(v: any) => [`${v}W`, 'Power']} />
          {ftp && <ReferenceLine yAxisId="left" y={ftp} stroke="#e17055" strokeDasharray="4 4"
            label={{ value: `FTP ${ftp}W`, fill: '#e17055', fontSize: 11 }} />}
          <Area yAxisId="left" type="monotone" dataKey="power" stroke="#6c5ce7" fill="rgba(108,92,231,0.15)" strokeWidth={2} dot={{ fill: '#6c5ce7', r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
