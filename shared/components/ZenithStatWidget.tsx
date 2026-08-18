import React from 'react';

export interface StatItem {
  label: string;
  value: string | number;
  subtext?: string;
  valueColor?: string;
  icon?: React.ReactNode;
}

interface ZenithStatWidgetProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export const ZenithStatWidget: React.FC<ZenithStatWidgetProps> = ({
  stats,
  columns = 4,
  className = ''
}) => {
  const gridColsClass = 
    columns === 2 ? 'grid-cols-1 sm:grid-cols-2' :
    columns === 3 ? 'grid-cols-1 sm:grid-cols-3' :
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={`grid ${gridColsClass} gap-4 ${className}`}>
      {stats.map((item, idx) => (
        <div 
          key={idx} 
          className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.08] backdrop-blur-md transition-all hover:border-slate-300/30 hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 font-outfit">
              {item.label}
            </span>
            {item.icon && <div className="text-slate-400">{item.icon}</div>}
          </div>
          <div 
            className="text-2xl font-black font-outfit tabular-nums tracking-tight my-1"
            style={{ color: item.valueColor || '#cbd5e1' }}
          >
            {item.value}
          </div>
          {item.subtext && (
            <span className="text-[10px] font-semibold text-zinc-500 tracking-wide block truncate">
              {item.subtext}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
