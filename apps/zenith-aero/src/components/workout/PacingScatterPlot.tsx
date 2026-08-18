import React, { useMemo } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
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
        date: new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' })
      }));
  }, [rides]);

  if (chartData.length === 0) {
    return (
      <div className="wd-section-card">
        <div className="wd-section-card__head">
          <span className="wd-section-card__title">
            <Compass size={13} style={{ display: 'inline', marginRight: 5, color: '#a29bfe' }} />
            Ritkarakteristieken (IF vs VI)
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
          Ritkarakteristieken & Pacing (IF vs VI)
        </span>
      </div>

      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.03)" />
            {/* X-as: Variabiliteitsindex (VI) — 1.0 = perfect egaal */}
            <XAxis 
              type="number" 
              dataKey="vi" 
              name="Variabiliteitsindex (VI)" 
              domain={[1.0, 1.30]} 
              tick={{ fill: '#64748b', fontSize: 8 }}
            />
            {/* Y-as: Intensiteitsfactor (IF) — 1.0 = FTP */}
            <YAxis 
              type="number" 
              dataKey="if" 
              name="Intensiteitsfactor (IF)" 
              domain={[0.40, 1.20]} 
              tick={{ fill: '#64748b', fontSize: 8 }}
            />
            <Tooltip 
              cursor={{ strokeDasharray: '3 3' }} 
              contentStyle={{ background: '#0d0d1a', border: 'none', borderRadius: 8, fontSize: 10 }}
              formatter={(v: any, name: any) => [v, name === 'vi' ? 'VI (Egaliteit)' : 'IF (Intensiteit)']}
            />
            
            {/* Pacing-grenzen */}
            <ReferenceLine x={1.05} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
            <ReferenceLine y={0.75} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
            
            <Scatter name="Rides" data={chartData} fill="#a29bfe" shape="circle" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Quadrants Uitleg */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.03)', paddingTop: 8 }}>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>
          <strong style={{ color: '#ff7675' }}>Linksboven:</strong> Egaal & Intensief (Tijdrideten, klimmen)
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>
          <strong style={{ color: '#fdcb6e' }}>Rechtsboven:</strong> Variabel & Intensief (Wedstrijden, intervals)
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>
          <strong style={{ color: '#00b894' }}>Linksonder:</strong> Egaal & Rustig (Duurtraining vlak)
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>
          <strong style={{ color: '#74b9ff' }}>Rechtsonder:</strong> Variabel & Rustig (Heuvelachtige toertochten)
        </div>
      </div>
    </div>
  );
};
