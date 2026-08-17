import React from 'react';

interface LoaderProps {
  message?: string;
}

export const Loader: React.FC<LoaderProps> = ({ message = 'Calculating route...' }) => {
  return (
    <div className="loader-overlay">
      <div className="loader-container">
        <div className="bicycle-animation">
          {/* A premium cycling icon animation (spinning wheel / gear) */}
          <svg
            className="spinning-wheel"
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
          >
            {/* Outer Rim */}
            <circle cx="50" cy="50" r="40" stroke="var(--color-primary-dim)" />
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="var(--color-primary)"
              strokeDasharray="60 180"
            />
            {/* Hub */}
            <circle cx="50" cy="50" r="8" fill="var(--color-primary)" />
            {/* Spokes */}
            <line x1="50" y1="10" x2="50" y2="90" stroke="var(--color-primary-dim)" strokeWidth="2" />
            <line x1="10" y1="50" x2="90" y2="50" stroke="var(--color-primary-dim)" strokeWidth="2" />
            <line x1="22" y1="22" x2="78" y2="78" stroke="var(--color-primary-dim)" strokeWidth="2" />
            <line x1="22" y1="78" x2="78" y2="22" stroke="var(--color-primary-dim)" strokeWidth="2" />
          </svg>
        </div>
        <p className="loader-message">{message}</p>
      </div>
    </div>
  );
};
