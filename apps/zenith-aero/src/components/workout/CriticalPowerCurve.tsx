import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { RideSummaryWithBests } from '../../types/workout';
import { Zap } from 'lucide-react';

interface CriticalPowerCurveProps {
  rides: RideSummaryWithBests[];
  weight?: number;
}

export const CriticalPowerCurve: React.FC<CriticalPowerCurveProps> = ({ rides, weight = 75 }) => {
  const calculations = useMemo(() => {
    // 1. Vind de absolute best efforts in de huidige selectie
    const bests = { s5: 0, s15: 0, s30: 0, m1: 0, m2: 0, m5: 0, m10: 0, m20: 0, m60: 0 };
    
    for (const r of rides) {
      const be = r.bestEfforts;
      if (!be) continue;
      if (be.s5 && be.s5 > bests.s5) bests.s5 = be.s5;
      if (be.s15 && be.s15 > bests.s15) bests.s15 = be.s15;
      if (be.s30 && be.s30 > bests.s30) bests.s30 = be.s30;
      if (be.m1 && be.m1 > bests.m1) bests.m1 = be.m1;
      if (be.m2 && be.m2 > bests.m2) bests.m2 = be.m2;
      if (be.m5 && be.m5 > bests.m5) bests.m5 = be.m5;
      if (be.m10 && be.m10 > bests.m10) bests.m10 = be.m10;
      if (be.m20 && be.m20 > bests.m20) bests.m20 = be.m20;
      if (be.m60 && be.m60 > bests.m60) bests.m60 = be.m60;
    }

    const hasPowerData = Object.values(bests).some(val => val > 0);
    if (!hasPowerData) return null;

    // 2. Crideical Power & W' berekening with lineaire regressie (OLS) over m1 (60s), m5 (300s) en m20 (1200s)
    const points = [
      { t: 60, p: bests.m1 },
      { t: 300, p: bests.m5 },
      { t: 1200, p: bests.m20 }
    ].filter(pt => pt.p > 0);

    let cp = 0;
    let wPrimeKj = 0;

    if (points.length >= 2) {
      // Omzetten naar totale energie E = P * t
      const x = points.map(pt => pt.t);
      const y = points.map(pt => pt.p * pt.t); // Joules

      const n = points.length;
      const meanX = x.reduce((s, val) => s + val, 0) / n;
      const meanY = y.reduce((s, val) => s + val, 0) / n;

      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (x[i] - meanX) * (y[i] - meanY);
        den += Math.pow(x[i] - meanX, 2);
      }

      cp = den > 0 ? num / den : 0;
      const wPrimeJ = meanY - cp * meanX;
      wPrimeKj = Math.max(0, wPrimeJ / 1000);
    } else {
      // Fallback schatting
      cp = bests.m20 * 0.95;
      wPrimeKj = 15.0; 
    }

    // Afronden
    cp = Math.round(cp);
    wPrimeKj = parseFloat(wPrimeKj.toFixed(1));

    // 3. Genereer data voor de grafiek (werkelijke prestatiecurve vs model)
    const durations = [
      { label: '5s', sec: 5, real: bests.s5 },
      { label: '15s', sec: 15, real: bests.s15 },
      { label: '30s', sec: 30, real: bests.s30 },
      { label: '1m', sec: 60, real: bests.m1 },
      { label: '2m', sec: 120, real: bests.m2 },
      { label: '5m', sec: 300, real: bests.m5 },
      { label: '10m', sec: 600, real: bests.m10 },
      { label: '20m', sec: 1200, real: bests.m20 },
      { label: '60m', sec: 3600, real: bests.m60 }
    ];

    const chartData = durations
      .filter(d => d.real > 0)
      .map(d => {
        // P(t) = CP + W'/t (W' is in kJ, dus vermenigvuldigen with 1000 voor Joules)
        const modelPower = Math.round(cp + (wPrimeKj * 1000) / d.sec);
        return {
          name: d.label,
          sec: d.sec,
          realPower: d.real,
          modelPower: d.sec >= 60 ? modelPower : undefined // model is alleen accuraat vanaf ~1m
        };
      });

    return {
      cp,
      wPrimeKj,
      chartData
    };
  }, [rides]);

  if (!calculations) {
    return (
      <div className="wd-section-card">
        <div className="wd-section-card__head">
          <span className="wd-section-card__title">
            <Zap size={13} style={{ display: 'inline', marginRight: 5, color: '#ff7675' }} />
            Crideical Power & W' Curve
          </span>
        </div>
        <p style={{ color: '#64748b', fontSize: 11, textAlign: 'center', margin: '20px 0' }}>
          Geen rideten with vermogenswithergegevens gevonden in de geselecteerde range.
        </p>
      </div>
    );
  }

  const cpWkg = parseFloat((calculations.cp / weight).toFixed(2));

  return (
    <div className="wd-section-card">
      <div className="wd-section-card__head">
        <span className="wd-section-card__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={13} style={{ color: '#ff7675' }} />
          Crideical Power & W' Curve (Modelering)
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{calculations.cp} W</span>
          <span style={{ fontSize: 9, color: '#64748b', marginLeft: 6 }}>CP ({cpWkg} W/kg)</span>
        </div>
        <div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{calculations.wPrimeKj} kJ</span>
          <span style={{ fontSize: 9, color: '#64748b', marginLeft: 6 }}>W' (Anaerobe Batterij)</span>
        </div>
      </div>

      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={calculations.chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="powerRealGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff7675" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#ff7675" stopOpacity={0.01}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 8 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 8 }} />
            <Tooltip 
              contentStyle={{ background: '#0d0d1a', border: 'none', borderRadius: 8, fontSize: 10 }}
              formatter={(v: any, name: any) => [v + ' W', name === 'realPower' ? 'Werkelijk Beste' : 'CP Model']}
            />
            <Legend verticalAlign="top" height={20} iconType="circle" wrapperStyle={{ fontSize: 8, fill: '#64748b' }} />
            
            <Area 
              name="realPower"
              type="monotone" 
              dataKey="realPower" 
              stroke="#ff7675" 
              strokeWidth={2} 
              fillOpacity={1} 
              fill="url(#powerRealGrad)" 
            />
            <Line 
              name="modelPower"
              type="monotone" 
              dataKey="modelPower" 
              stroke="#fdcb6e" 
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
