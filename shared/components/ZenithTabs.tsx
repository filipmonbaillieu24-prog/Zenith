import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface ZenithTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export const ZenithTabs: React.FC<ZenithTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className = ''
}) => {
  return (
    <div className={className} style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: 6,
      background: 'rgba(24, 24, 27, 0.8)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 12,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      overflowX: 'auto'
    }}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              fontFamily: 'var(--zenith-font-heading)',
              fontSize: 12,
              fontWeight: isActive ? 900 : 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              border: 'none',
              cursor: 'pointer',
              background: isActive ? '#e2e8f0' : 'transparent',
              color: isActive ? '#09090b' : '#a1a1aa',
              boxShadow: isActive ? '0 4px 12px rgba(203, 213, 225, 0.15)' : 'none'
            }}
          >
            {tab.icon && <span style={{ display: 'flex', color: isActive ? '#09090b' : '#a1a1aa' }}>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span style={{
                padding: '1px 7px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 900,
                background: isActive ? '#09090b' : 'rgba(203, 213, 225, 0.1)',
                color: isActive ? '#cbd5e1' : '#cbd5e1'
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
