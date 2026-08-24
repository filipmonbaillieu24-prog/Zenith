import React from 'react';

export interface ZenithHeaderTab {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface ZenithPageHeaderProps {
  appName: string;
  subtitle: string;
  tabs?: ZenithHeaderTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * One shared header shell for every app's top chrome (title, tabs,
 * actions). Tabs and actions size to their own content instead of
 * stretching to fill the header, so tab width/padding is identical
 * whether an app has 4 tabs and no buttons or 6 tabs and one —
 * the empty spacer between tabs and actions absorbs the leftover
 * width instead of the tabs themselves.
 */
export const ZenithPageHeader: React.FC<ZenithPageHeaderProps> = ({
  appName,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  actions,
  className = '',
}) => {
  return (
    <header className={`zenith-header ${className}`}>
      <div className="zenith-header-brand">
        <h1>
          ZENITH <span>{appName}</span>
        </h1>
        <p>{subtitle}</p>
      </div>

      {tabs && tabs.length > 0 && (
        <nav className="zenith-header-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`zenith-header-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => onTabChange?.(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      <div className="zenith-header-spacer" />

      {actions && <div className="zenith-header-actions">{actions}</div>}
    </header>
  );
};
