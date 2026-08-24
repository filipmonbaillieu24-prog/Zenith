import React, { useMemo } from 'react';
import './PMCPanel.css';
import { TrendingUp } from 'lucide-react';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import { ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { RideSummaryWithBests } from '../../types/workout';
import { computePMC, interpretTSB, type RideTSS } from '../../utils/pmc';

interface PMCPanelProps {
  rides: RideSummaryWithBests[];
  timeRange?: 30 | 90 | 365 | 'all';
}

function fmtShortDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

export const PMCPanel: React.FC<PMCPanelProps> = ({ rides, timeRange = 90 }) => {
  const tssList: RideTSS[] = rides.map(r => ({ date: r.date, tss: r.tss ?? r.hrTSS ?? 0 })).filter(r => r.tss > 0);
  const pmc = useMemo(() => computePMC(tssList), [tssList.length]);
  
  if (pmc.length < 3) return (
    <div className="wd-section-card">
      <p style={{ color: '#64748b', fontSize: 12 }}>Upload rides with TSS to compute the PMC.</p>
    </div>
  );
  
  const today   = pmc[pmc.length - 1];
  const tsbInfo = interpretTSB(today.tsb);
  
  const recent = useMemo(() => {
    if (timeRange === 'all') return pmc.map(p => ({ ...p, date: fmtShortDate(p.date) }));
    const cutoff = Date.now() - timeRange * 24 * 3600 * 1000;
    // We want to show at least 3 points on the chart
    const filtered = pmc.filter(p => p.date >= cutoff);
    if (filtered.length >= 3) {
      return filtered.map(p => ({ ...p, date: fmtShortDate(p.date) }));
    }
    return pmc.slice(-10).map(p => ({ ...p, date: fmtShortDate(p.date) }));
  }, [pmc, timeRange]);
  return (
    <div className="wd-section-card wd-section-card--grow">
      <div className="wd-section-card__head">
        <span className="wd-section-card__title">
          <TrendingUp size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5, color: '#cbd5e1' }} />
          Performance Management
        </span>
        <span className="wd-trend" style={{ background: `${tsbInfo.color}22`, color: tsbInfo.color, padding: '2px 8px', borderRadius: 6 }}>
          {tsbInfo.emoji} {tsbInfo.label}
        </span>
      </div>
      <div className="wd-pmc-kpis">
        <div className="wd-pmc-kpi" style={{ borderColor: '#00b894' }}>
          <span className="wd-pmc-kpi__val" style={{ color: '#00b894' }}>{today.ctl}</span>
          <span className="wd-pmc-kpi__lbl">CTL · Fitness</span>
        </div>
        <div className="wd-pmc-kpi" style={{ borderColor: '#e17055' }}>
          <span className="wd-pmc-kpi__val" style={{ color: '#e17055' }}>{today.atl}</span>
          <span className="wd-pmc-kpi__lbl">ATL · Fatigue</span>
        </div>
        <div className="wd-pmc-kpi" style={{ borderColor: '#a29bfe' }}>
          <span className="wd-pmc-kpi__val" style={{ color: '#a29bfe' }}>{today.tsb > 0 ? '+' : ''}{today.tsb}</span>
          <span className="wd-pmc-kpi__lbl">TSB · Form</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={recent} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...ZENITH_CHART_GRID} />
          <XAxis dataKey="date" tick={ZENITH_CHART_AXIS_TICK} interval={13} />
          <YAxis tick={ZENITH_CHART_AXIS_TICK} width={28} />
          <Tooltip contentStyle={ZENITH_CHART_TOOLTIP_STYLE} labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
            formatter={(v: any, name: any) => [v, name === 'ctl' ? 'Fitness (CTL)' : name === 'atl' ? 'Fatigue (ATL)' : 'Form (TSB)']} />
          <ReferenceLine y={50} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
          <ReferenceLine y={25} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
          <ReferenceLine y={-25} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
          <ReferenceLine y={-50} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
          
          {/* TSB Zones background */}
          <ReferenceArea y1={25} y2={50} fill="rgba(100, 116, 139, 0.02)" label={{ value: "Transition Zone", fill: "rgba(100, 116, 139, 0.25)", fontSize: 8, position: 'insideTopLeft' }} />
          <ReferenceArea y1={0} y2={25} fill="rgba(203, 213, 225, 0.015)" label={{ value: "Freshness / Taper Zone", fill: "rgba(203, 213, 225, 0.25)", fontSize: 8, position: 'insideTopLeft' }} />
          <ReferenceArea y1={-10} y2={-30} fill="rgba(0, 184, 148, 0.015)" label={{ value: "Optimal Training Zone", fill: "rgba(0, 184, 148, 0.25)", fontSize: 8, position: 'insideTopLeft' }} />
          <ReferenceArea y1={-30} y2={-50} fill="rgba(255, 118, 117, 0.015)" label={{ value: "Overload Danger Zone", fill: "rgba(255, 118, 117, 0.25)", fontSize: 8, position: 'insideTopLeft' }} />

          <Area type="monotone" dataKey="tsb" fill="rgba(108,92,231,0.04)" stroke="transparent" />
          <Line type="monotone" dataKey="ctl" stroke="#00b894" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="atl" stroke="#e17055" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="tsb" stroke="#a29bfe" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="wd-pmc-legend" style={{ display: 'flex', gap: 16, fontSize: 10, marginTop: 8, justifyContent: 'center' }}>
        <span style={{ color: '#00b894', fontWeight: 600 }}>— Fitness (CTL)</span>
        <span style={{ color: '#e17055', fontWeight: 600 }}>— Fatigue (ATL)</span>
        <span style={{ color: '#a29bfe', fontWeight: 600 }}>- - Form (TSB)</span>
      </div>
    </div>
  );
};
