import React from 'react';

interface ZenithCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const ZenithCard: React.FC<ZenithCardProps> = ({
  title,
  subtitle,
  icon,
  action,
  className = '',
  style,
  children
}) => {
  return (
    <div
      className={`zenith-card ${className}`}
      style={style}
    >
      {(title || icon || action) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {icon && (
              <div style={{
                padding: 8,
                borderRadius: 8,
                background: 'rgba(203, 213, 225, 0.1)',
                color: 'var(--zenith-color-primary, #cbd5e1)',
                border: '1px solid rgba(203, 213, 225, 0.2)',
                flexShrink: 0,
                display: 'flex'
              }}>
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h3 style={{
                  fontFamily: 'var(--zenith-font-heading)',
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#f1f5f9',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  margin: 0
                }}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <p style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 500, margin: '2px 0 0' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
