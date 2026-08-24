import React from 'react';

interface ZenithEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * One empty-state pattern, used everywhere data is missing instead of
 * ad hoc "Loading..." text or bare blank space.
 */
export const ZenithEmptyState: React.FC<ZenithEmptyStateProps> = ({ icon, title, message, action, className = '' }) => {
  return (
    <div className={`zenith-empty-state ${className}`}>
      <div className="zenith-empty-state__icon">{icon}</div>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
};
