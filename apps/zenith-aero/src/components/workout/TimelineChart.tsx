import React, { useMemo } from 'react';
import './TimelineChart.css';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import { ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { Ride, RidePoint } from '../../types/workout';
import { detectClimbs } from '../../utils/climbDetector';

interface TimelineChartProps {
  ride: Ride;
  ftp?: number;
  lthr?: number;
  onHoverPoint: (pt: RidePoint | null) => void;
}

export const TimelineChart: React.FC<TimelineChartProps> = ({ ride, ftp, lthr, onHoverPoint }) => {
  const pts    = ride.points;
  const step   = Math.max(1, Math.floor(pts.length / 500));
  
  const sampled = [];
  const startVal = pts[0] ? pts[0].time : 0;
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i]!;
    sampled.push({
      t:   Math.round((p.time - startVal) / 60000),
      pwr: p.power,
      hr:  p.hr,
      spd: p.speed ? +(p.speed * 3.6).toFixed(1) : undefined,
      ele: p.ele   ? +p.ele.toFixed(0) : undefined,
      originalIndex: i,
    });
  }

  // Detect climbs to overlay on timeline
  const climbs = useMemo(() => detectClimbs(pts), [pts]);

  return (
    <div className="rp-chart-card">
      <h3>📉 Timeline</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart
          data={sampled}
          onMouseMove={(state: any) => {
            if (state && state.activeTooltipIndex !== undefined && state.activePayload && state.activePayload.length > 0) {
              const activePointData = state.activePayload[0].payload;
              const originalIndex = activePointData.originalIndex;
              
              // Find nearest point with valid GPS coordinates
              let targetPt = pts[originalIndex];
              if (targetPt && (targetPt.lat == null || targetPt.lng == null)) {
                for (let offset = 1; offset < 100; offset++) {
                  const forwardPt = pts[originalIndex + offset];
                  if (forwardPt && forwardPt.lat != null && forwardPt.lng != null) {
                    targetPt = forwardPt;
                    break;
                  }
                  const backwardPt = pts[originalIndex - offset];
                  if (backwardPt && backwardPt.lat != null && backwardPt.lng != null) {
                    targetPt = backwardPt;
                    break;
                  }
                }
              }

              if (targetPt && targetPt.lat != null && targetPt.lng != null) {
                onHoverPoint(targetPt);
              } else {
                onHoverPoint(null);
              }
            }
          }}
          onMouseLeave={() => onHoverPoint(null)}
        >
          <CartesianGrid {...ZENITH_CHART_GRID} />
          <XAxis dataKey="t" tick={ZENITH_CHART_AXIS_TICK} unit=" min" />
          <YAxis
            yAxisId="main"
            tick={ZENITH_CHART_AXIS_TICK}
            unit={ride.hasPower && ride.hasHR ? " W/bpm" : ride.hasPower ? " W" : ride.hasHR ? " bpm" : " km/h"}
          />
          <YAxis yAxisId="ele" orientation="right" tick={ZENITH_CHART_AXIS_TICK} unit=" m" />
          
          {/* Draw climbs as translucent overlays */}
          {climbs.map((climb, i) => {
            const startMin = Math.round((pts[climb.startIndex].time - pts[0].time) / 60000);
            const endMin   = Math.round((pts[climb.endIndex].time - pts[0].time) / 60000);
            const catColors: Record<string, string> = {
              'HC': '#ff7675',
              'Cat 1': '#a29bfe',
              'Cat 2': '#00b894',
              'Cat 3': '#fdcb6e',
              'Cat 4': '#74b9ff',
            };
            const fill = catColors[climb.category] ?? '#fdcb6e';
            return (
              <ReferenceArea
                key={i}
                yAxisId="ele"
                x1={startMin}
                x2={endMin}
                fill={fill}
                fillOpacity={0.12}
                stroke="none"
              />
            );
          })}

          <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
            labelFormatter={v => `${v} min`} />
          <Area yAxisId="ele" type="monotone" dataKey="ele" stroke="none" fill="rgba(255,255,255,0.05)" />
          {ride.hasPower && <>
            {ftp && <ReferenceLine yAxisId="main" y={ftp} stroke="#e17055" strokeDasharray="3 3" />}
            <Line yAxisId="main" type="monotone" dataKey="pwr" stroke="#6c5ce7" strokeWidth={1.5} dot={false} name="Power (W)" />
          </>}
          {ride.hasHR && <>
            {lthr && <ReferenceLine yAxisId="main" y={lthr} stroke="#d63031" strokeDasharray="3 3" />}
            <Line yAxisId="main" type="monotone" dataKey="hr" stroke="#d63031" strokeWidth={1.5} dot={false} name="Heart Rate (bpm)" />
          </>}
          {!ride.hasPower && !ride.hasHR && (
            <Line yAxisId="main" type="monotone" dataKey="spd" stroke="#00b894" strokeWidth={1.5} dot={false} name="Speed (km/h)" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
