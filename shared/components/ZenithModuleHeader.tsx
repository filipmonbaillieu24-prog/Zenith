import React from 'react';

interface ZenithModuleHeaderProps {
  moduleTitle: string;
  subtitle: string;
  icon?: React.ReactNode;
  statusText?: string;
  actions?: React.ReactNode;
}

export const ZenithModuleHeader: React.FC<ZenithModuleHeaderProps> = ({
  moduleTitle,
  subtitle,
  icon,
  statusText = 'Zenith Ecosystem Active',
  actions
}) => {
  return (
    <header style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: 20,
      background: 'rgba(24, 24, 27, 0.6)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 16,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      marginBottom: 24,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {icon && (
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#09090b',
            fontWeight: 900,
            flexShrink: 0
          }}>
            {icon}
          </div>
        )}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{
              fontFamily: 'var(--zenith-font-heading)',
              fontSize: 20,
              fontWeight: 900,
              color: '#f1f5f9',
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              margin: 0
            }}>
              {moduleTitle}
            </h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 10px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              background: 'rgba(203, 213, 225, 0.1)',
              color: 'var(--zenith-color-primary, #cbd5e1)',
              border: '1px solid rgba(203, 213, 225, 0.2)'
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#4ade80'
              }} />
              {statusText}
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 500, margin: '2px 0 0' }}>
            {subtitle}
          </p>
        </div>
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </header>
  );
};
