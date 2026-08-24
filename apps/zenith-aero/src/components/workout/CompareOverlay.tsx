import React from 'react';
import './CompareOverlay.css';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { Ride, RidePoint } from '../../types/workout';

interface CompareOverlayProps {
  rideA: Ride;
  rideB: Ride;
}

function normalizeToPercent(points: RidePoint[], key: 'power' | 'hr' | 'speed'): { pct: number; value: number }[] {
  const pts = points.filter(p => p[key] != null);
  if (pts.length === 0) return [];
  const step = Math.max(1, Math.floor(pts.length / 100));
  const start = pts[0].time;
  const end   = pts[pts.length - 1].time;
  const dur   = end - start || 1;
  return pts.filter((_, i) => i % step === 0).map(p => ({
    pct:   Math.round(((p.time - start) / dur) * 100),
    value: key === 'speed' ? parseFloat((p[key]! * 3.6).toFixed(1)) : p[key]!,
  }));
}

export const CompareOverlay: React.FC<CompareOverlayProps> = ({ rideA, rideB }) => {
  const hasPower = rideA.hasPower && rideB.hasPower;
  const hasHR    = rideA.hasHR   && rideB.hasHR;
  const hasSpeed = rideA.points.some(p => p.speed != null) && rideB.points.some(p => p.speed != null);

  // Build normalized series (0-100% of ride duration on X axis)
  const powerA = hasPower ? normalizeToPercent(rideA.points, 'power')  : [];
  const powerB = hasPower ? normalizeToPercent(rideB.points, 'power')  : [];
  const hrA    = hasHR    ? normalizeToPercent(rideA.points, 'hr')     : [];
  const hrB    = hasHR    ? normalizeToPercent(rideB.points, 'hr')     : [];
  const spdA   = hasSpeed ? normalizeToPercent(rideA.points, 'speed') : [];
  const spdB   = hasSpeed ? normalizeToPercent(rideB.points, 'speed') : [];

  // Delta summary
  const deltaKm  = parseFloat((rideA.distance  - rideB.distance).toFixed(1));
  const deltaDur  = rideA.duration - rideB.duration;
  const deltaElev = Math.round(rideA.elevGain - rideB.elevGain);
  const deltaNP   = hasPower && rideA.normPower && rideB.normPower
    ? Math.round(rideA.normPower - rideB.normPower) : null;
  const deltaHR   = hasHR && rideA.avgHR && rideB.avgHR
    ? Math.round(rideA.avgHR - rideB.avgHR) : null;

  function fmtDelta(v: number, unit: string) {
    const sign = v > 0 ? '+' : '';
    return <span className={`cmp-delta ${v > 0 ? 'cmp-delta--pos' : v < 0 ? 'cmp-delta--neg' : ''}`}>{sign}{v} {unit}</span>;
  }
  function fmtDurDelta(s: number) {
    const abs = Math.abs(s);
    const sign = s > 0 ? '+' : s < 0 ? '-' : '';
    const m = Math.floor(abs / 60), sec = abs % 60;
    return <span className={`cmp-delta ${s > 0 ? 'cmp-delta--pos' : s < 0 ? 'cmp-delta--neg' : ''}`}>{sign}{m}:{String(sec).padStart(2,'0')}</span>;
  }

  // Merge two normalized series into one array keyed by pct (simple interleave)
  function mergeNorm(a: {pct:number;value:number}[], b: {pct:number;value:number}[], keyA: string, keyB: string) {
    const map = new Map<number, Record<string, number>>();
    for (const pt of a) { const e = map.get(pt.pct) ?? { pct: pt.pct }; (e as any)[keyA] = pt.value; map.set(pt.pct, e as any); }
    for (const pt of b) { const e = map.get(pt.pct) ?? { pct: pt.pct }; (e as any)[keyB] = pt.value; map.set(pt.pct, e as any); }
    return Array.from(map.values()).sort((a, b) => a.pct - b.pct);
  }

  const dateA = new Date(rideA.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' });
  const dateB = new Date(rideB.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' });

  return (
    <div className="cmp-panel">
      <div className="cmp-panel__head">
        <span className="cmp-panel__title">⇄ Comparison</span>
        <div className="cmp-legend">
          <span className="cmp-legend__dot" style={{background:'#cbd5e1'}} /> {dateA}
          <span className="cmp-legend__dot" style={{background:'#ffffff'}} /> {dateB}
        </div>
      </div>

      {/* Delta summary */}
      <div className="cmp-deltas">
        <div className="cmp-delta-card"><span className="cmp-delta-label">Distance</span>{fmtDelta(deltaKm,'km')}</div>
        <div className="cmp-delta-card"><span className="cmp-delta-label">Time</span>{fmtDurDelta(deltaDur)}</div>
        <div className="cmp-delta-card"><span className="cmp-delta-label">Elevation</span>{fmtDelta(deltaElev,'m')}</div>
        {deltaNP !== null && <div className="cmp-delta-card"><span className="cmp-delta-label">NP</span>{fmtDelta(deltaNP,'W')}</div>}
        {deltaHR !== null && <div className="cmp-delta-card"><span className="cmp-delta-label">Avg HR</span>{fmtDelta(deltaHR,'bpm')}</div>}
      </div>

      {/* Power overlay */}
      {hasPower && (
        <div className="cmp-chart-wrap">
          <div className="cmp-chart-label">⚡ Power (W)</div>
          <ResponsiveContainer width="100%" height={130}>
            <ComposedChart data={mergeNorm(powerA, powerB, 'rideA', 'rideB')} margin={{top:4,right:8,left:0,bottom:0}}>
              <CartesianGrid {...ZENITH_CHART_GRID} />
              <XAxis dataKey="pct" tick={ZENITH_CHART_AXIS_TICK} unit="%" />
              <YAxis tick={ZENITH_CHART_AXIS_TICK} unit="W" width={40} />
              <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                formatter={(v: any, name: any) => [`${v}W`, name === 'rideA' ? dateA : dateB]} />
              <Line type="monotone" dataKey="rideA" stroke="#cbd5e1" strokeWidth={1.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="rideB" stroke="#ffffff" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* HR overlay */}
      {hasHR && (
        <div className="cmp-chart-wrap">
          <div className="cmp-chart-label">❤️ Heart Rate (bpm)</div>
          <ResponsiveContainer width="100%" height={110}>
            <ComposedChart data={mergeNorm(hrA, hrB, 'rideA', 'rideB')} margin={{top:4,right:8,left:0,bottom:0}}>
              <CartesianGrid {...ZENITH_CHART_GRID} />
              <XAxis dataKey="pct" tick={ZENITH_CHART_AXIS_TICK} unit="%" />
              <YAxis tick={ZENITH_CHART_AXIS_TICK} unit="bpm" width={42} />
              <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                formatter={(v: any, name: any) => [`${v} bpm`, name === 'rideA' ? dateA : dateB]} />
              <Line type="monotone" dataKey="rideA" stroke="#cbd5e1" strokeWidth={1.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="rideB" stroke="#ffffff" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Speed overlay */}
      {hasSpeed && !hasPower && (
        <div className="cmp-chart-wrap">
          <div className="cmp-chart-label">🚴 Speed (km/h)</div>
          <ResponsiveContainer width="100%" height={110}>
            <ComposedChart data={mergeNorm(spdA, spdB, 'rideA', 'rideB')} margin={{top:4,right:8,left:0,bottom:0}}>
              <CartesianGrid {...ZENITH_CHART_GRID} />
              <XAxis dataKey="pct" tick={ZENITH_CHART_AXIS_TICK} unit="%" />
              <YAxis tick={ZENITH_CHART_AXIS_TICK} unit="km/h" width={42} />
              <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                formatter={(v: any, name: any) => [`${v} km/h`, name === 'rideA' ? dateA : dateB]} />
              <Line type="monotone" dataKey="rideA" stroke="#cbd5e1" strokeWidth={1.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="rideB" stroke="#ffffff" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
