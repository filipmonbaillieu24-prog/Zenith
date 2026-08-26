import React from 'react';
import { ZenithHeroStat, tsbContext } from '@zenith/shared';

interface DashboardStatsHeaderProps {
  profileName?: string;
  timeRange: 30 | 90 | 365 | 'all';
  setTimeRange: (val: 30 | 90 | 365 | 'all') => void;
  latestPMC: { ctl: number; atl: number; tsb: number };
  tsbStatus: { label: string; emoji: string; color: string };
}

export const DashboardStatsHeader: React.FC<DashboardStatsHeaderProps> = ({
  profileName,
  timeRange,
  setTimeRange,
  latestPMC,
  tsbStatus,
}) => {
  return (
    <div className="wd-dashboard-header" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
          Welcome back, {profileName ?? 'Filip'}
        </h2>

        {/* Timespan filter */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.02)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', width: 'fit-content' }}>
          {([
            { label: '30 Days', value: 30 },
            { label: '90 Days', value: 90 },
            { label: '365 Days', value: 365 },
            { label: 'All-Time', value: 'all' },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeRange(opt.value)}
              style={{
                background: timeRange === opt.value ? 'rgba(203, 213, 225, 0.12)' : 'transparent',
                border: 'none',
                color: timeRange === opt.value ? '#cbd5e1' : '#94a3b8',
                fontSize: '10px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="zenith-grid-12">
        <div className="zenith-span-8">
          <ZenithHeroStat
            eyebrow="Form · TSB"
            value={latestPMC.tsb >= 0 ? `+${Math.round(latestPMC.tsb)}` : Math.round(latestPMC.tsb)}
            sub={tsbContext(latestPMC.tsb)}
            pill={
              <span
                className="zenith-pill"
                style={{ background: `${tsbStatus.color}1f`, color: tsbStatus.color }}
              >
                {tsbStatus.emoji} {tsbStatus.label}
              </span>
            }
          />
        </div>
        <div className="zenith-span-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', flex: 1 }}>
            <div className="zenith-label">Fitness · CTL</div>
            <div className="zenith-stat-value" style={{ marginTop: 4 }}>{Math.round(latestPMC.ctl)}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', flex: 1 }}>
            <div className="zenith-label">Fatigue · ATL</div>
            <div className="zenith-stat-value" style={{ marginTop: 4, color: '#f5a623' }}>{Math.round(latestPMC.atl)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
