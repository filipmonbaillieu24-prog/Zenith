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
              // The tab you are on answers "where am I", which is the one
              // question the tab strip exists to answer - so it is worth the
              // accent. It used to be a solid near-white slab, the brightest
              // thing on the page whatever else was going on.
              background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
              color: isActive ? '#7dd3fc' : '#a1a1aa',
              boxShadow: 'none'
            }}
          >
            {tab.icon && <span style={{ display: 'flex', color: isActive ? '#7dd3fc' : '#a1a1aa' }}>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span style={{
                padding: '1px 7px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 900,
                background: isActive ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255, 255, 255, 0.08)',
                color: isActive ? '#7dd3fc' : '#cbd5e1'
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
