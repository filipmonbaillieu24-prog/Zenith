import React from 'react';

interface ZenithHeroStatProps {
  eyebrow: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  pill?: React.ReactNode;
  className?: string;
}

/**
 * The one card on a dashboard meant to answer "what should I look at
 * first" — bigger value, tinted border, used once per screen alongside
 * smaller supporting stats (see .zenith-span-4 siblings).
 */
export const ZenithHeroStat: React.FC<ZenithHeroStatProps> = ({ eyebrow, value, sub, pill, className = '' }) => {
  return (
    <div className={`zenith-hero-card ${className}`}>
      <div>
        <div className="zenith-eyebrow" style={{ color: 'var(--zenith-color-signature)' }}>{eyebrow}</div>
        <div className="zenith-hero-value" style={{ margin: '8px 0 4px' }}>{value}</div>
        {sub && <div className="zenith-label">{sub}</div>}
      </div>
      {pill && <div style={{ alignSelf: 'flex-start' }}>{pill}</div>}
    </div>
  );
};
