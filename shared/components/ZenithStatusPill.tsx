import React from 'react';

export type ZenithStatusTone = 'good' | 'warn' | 'crit' | 'info';

interface ZenithStatusPillProps {
  tone: ZenithStatusTone;
  children: React.ReactNode;
  className?: string;
}

export const ZenithStatusPill: React.FC<ZenithStatusPillProps> = ({ tone, children, className = '' }) => {
  return (
    <span className={`zenith-pill zenith-pill--${tone} ${className}`}>
      {children}
    </span>
  );
};
