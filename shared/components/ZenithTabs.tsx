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
    <div className={`flex items-center gap-1.5 p-1.5 bg-zinc-900/80 border border-white/[0.08] rounded-xl backdrop-blur-md overflow-x-auto ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 shrink-0 font-outfit ${
              isActive 
                ? 'bg-slate-200 text-zinc-950 shadow-md shadow-slate-300/10 font-black' 
                : 'text-zinc-400 hover:text-slate-100 hover:bg-white/[0.05]'
            }`}
          >
            {tab.icon && <span className={isActive ? 'text-zinc-950' : 'text-zinc-400'}>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                isActive ? 'bg-zinc-950 text-slate-200' : 'bg-slate-300/10 text-slate-300'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
