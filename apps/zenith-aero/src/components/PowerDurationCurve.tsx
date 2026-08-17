import React, { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { BestEfforts, BestSpeedEfforts, EFFORT_DURATIONS, SPEED_EFFORT_DURATIONS } from '../types/workout';

interface Props {
  allTimePower:    BestEfforts;       // globale beste power ooit
  last90Power?:    BestEfforts;       // globale beste power laatste 90 dagen
  allTimeSpeed?:   BestSpeedEfforts;  // globale beste snelheid ooit (fallback)
  last90Speed?:    BestSpeedEfforts;  // globale beste snelheid laatste 90 dagen
  ftp?:            number;            // W — voor referentielijn
  weight?:         number;            // kg — voor W/kg tooltip
  hasPower:        boolean;           // true = power, false = speed fallback
}

export const PowerDurationCurve: React.FC<Props> = ({
  allTimePower, last90Power, allTimeSpeed, last90Speed, ftp, weight, hasPower,
}) => {
  const data = useMemo(() => {
    const durations = hasPower ? EFFORT_DURATIONS : SPEED_EFFORT_DURATIONS;
    return durations.map(d => {
      const key = d.key as any;
      const allVal  = hasPower ? allTimePower[key as keyof BestEfforts]  : allTimeSpeed?.[key as keyof BestSpeedEfforts];
      const last90  = hasPower ? last90Power?.[key as keyof BestEfforts] : last90Speed?.[key as keyof BestSpeedEfforts];
      return {
        label:   d.label,
        seconds: d.seconds,
        allTime: allVal  ?? null,
        last90:  last90  ?? null,
        wkg:     (allVal && weight) ? parseFloat((allVal / weight).toFixed(2)) : null,
      };
    }).filter(d => d.allTime !== null);
  }, [allTimePower, last90Power, allTimeSpeed, last90Speed, hasPower, weight]);

  if (data.length === 0) return null;

  const unit = hasPower ? 'W' : 'km/h';
  const allTimeVals = data.map(d => d.allTime ?? Infinity);
  const last90Vals  = data.filter(d => d.last90 !== null).map(d => d.last90 ?? Infinity);
  const minVal      = Math.min(...allTimeVals, ...last90Vals);
  const yMin        = isFinite(minVal) ? Math.floor((minVal * 0.9) / 10) * 10 : 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="pdc-tooltip">
        <div className="pdc-tooltip__label">{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="pdc-tooltip__row" style={{ color: p.color }}>
            <span>{p.dataKey === 'allTime' ? 'All-time' : 'Laatste 90d'}</span>
            <strong>
              {p.value} {unit}
              {hasPower && p.dataKey === 'allTime' && p.payload.wkg ? ` · ${p.payload.wkg} W/kg` : ''}
            </strong>
          </div>
        ))}
      </div>
    );
  };

  const hasLast90Data = data.some(d => d.last90 !== null);

  return (
    <div className="pdc-wrap" data-has-record={data.length > 0 ? "true" : "false"}>
      <div className="pdc-header">
        <h3 className="pdc-title">{hasPower ? '⚡ Power Duration Curve' : '🚴 Speedscurve'}</h3>
        <div className="pdc-legend">
          <span className="pdc-legend__dot" style={{ background: '#cbd5e1' }} /> All-time
          {hasLast90Data && (
            <>
              <span className="pdc-legend__dot" style={{ background: '#ffffff' }} /> Laatste 90d
            </>
          )}
          {ftp && hasPower && (
            <>
              <span className="pdc-legend__dot pdc-legend__dot--line" style={{ background: '#a29bfe' }} /> FTP
            </>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="pdcAllTime" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#cbd5e1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#cbd5e1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="pdcLast90" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ffffff" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8', opacity: 0.6 }} />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8', opacity: 0.6 }}
            unit={` ${unit}`}
            width={52}
            domain={[yMin, 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          {ftp && hasPower && (
            <ReferenceLine
              y={ftp}
              stroke="#a29bfe"
              strokeDasharray="5 3"
              label={{ value: `FTP ${ftp}W`, fill: '#a29bfe', fontSize: 10, position: 'insideBottomRight' }}
            />
          )}
          <Area
            type="monotone"
            dataKey="allTime"
            stroke="#cbd5e1"
            strokeWidth={2.5}
            fill="url(#pdcAllTime)"
            dot={{ fill: '#cbd5e1', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#cbd5e1', stroke: '#fff', strokeWidth: 1.5 }}
            connectNulls
          />
          {hasLast90Data && (
            <Area
              type="monotone"
              dataKey="last90"
              stroke="#ffffff"
              strokeWidth={2}
              strokeDasharray="6 3"
              fill="url(#pdcLast90)"
              dot={{ fill: '#ffffff', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#ffffff' }}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PowerDurationCurve;
