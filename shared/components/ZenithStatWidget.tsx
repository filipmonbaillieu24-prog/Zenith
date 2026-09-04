import React from 'react';

export interface StatItem {
  label: string;
  value: string | number;
  subtext?: string;
  valueColor?: string;
  icon?: React.ReactNode;
}

interface ZenithStatWidgetProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export const ZenithStatWidget: React.FC<ZenithStatWidgetProps> = ({
  stats,
  columns = 4,
  className = ''
}) => {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${Math.floor(320 / columns) + 100}px, 1fr))`,
        gap: 16
      }}
    >
      {stats.map((item, idx) => (
        <div
          key={idx}
          style={{
            padding: 16,
            borderRadius: 14,
            background: 'rgba(255, 255, 255, 0.045)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            transition: 'transform 0.2s ease, border-color 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#a1a1aa',
              fontFamily: "'Outfit', 'Inter', system-ui, sans-serif"
            }}>
              {item.label}
            </span>
            {item.icon && <div style={{ color: '#94a3b8' }}>{item.icon}</div>}
          </div>
          <div style={{
            fontSize: 24,
            fontWeight: 900,
            fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            margin: '4px 0',
            color: item.valueColor || '#cbd5e1'
          }}>
            {item.value}
          </div>
          {item.subtext && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#71717a',
              letterSpacing: '0.02em',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {item.subtext}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
