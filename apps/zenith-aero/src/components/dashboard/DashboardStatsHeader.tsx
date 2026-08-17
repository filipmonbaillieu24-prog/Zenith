import React from 'react';

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
    <div
      className="wd-dashboard-header"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        background: 'rgba(255,255,255,0.01)',
        border: '1px solid rgba(255,255,255,0.03)',
        padding: '16px 20px',
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
        marginBottom: '10px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
          Welkom terug, {profileName ?? 'Filip'}
        </h2>

        {/* Tijdspanne Filter */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.02)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', width: 'fit-content' }}>
          {([
            { label: '30 Dagen', value: 30 },
            { label: '90 Dagen', value: 90 },
            { label: '365 Dagen', value: 365 },
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
                fontFamily: 'inheride',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fitness Status Meters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', gap: '14px' }}>
          {/* CTL / Fitheid */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', width: '36px', height: '36px' }}>
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="3"
                  strokeDasharray="94.2"
                  strokeDashoffset={94.2 - Math.min(100, latestPMC.ctl) * 0.942}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#cbd5e1' }}>
                {Math.round(latestPMC.ctl)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Fitheid (CTL)</span>
              <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>Conditionering</span>
            </div>
          </div>

          {/* ATL / Vermoeidheid */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', width: '36px', height: '36px' }}>
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#ff7675"
                  strokeWidth="3"
                  strokeDasharray="94.2"
                  strokeDashoffset={94.2 - Math.min(100, latestPMC.atl) * 0.942}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#ff7675' }}>
                {Math.round(latestPMC.atl)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Vermoeidheid (ATL)</span>
              <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>Recente stress</span>
            </div>
          </div>

          {/* TSB / Vorm */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', width: '36px', height: '36px' }}>
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#a29bfe"
                  strokeWidth="3"
                  strokeDasharray="94.2"
                  strokeDashoffset={94.2 - Math.min(100, Math.max(0, latestPMC.tsb + 50)) * 0.942}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#a29bfe' }}>
                {Math.round(latestPMC.tsb)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Vorm (TSB)</span>
              <span style={{ fontSize: '11px', color: tsbStatus.color, fontWeight: 700 }}>
                {tsbStatus.emoji} {tsbStatus.label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
