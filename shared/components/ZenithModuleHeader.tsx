import React from 'react';

interface ZenithModuleHeaderProps {
  moduleTitle: string;
  subtitle: string;
  icon?: React.ReactNode;
  statusText?: string;
  actions?: React.ReactNode;
}

export const ZenithModuleHeader: React.FC<ZenithModuleHeaderProps> = ({
  moduleTitle,
  subtitle,
  icon,
  statusText = 'Zenith Ecosystem Active',
  actions
}) => {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl backdrop-blur-xl mb-6 shadow-lg shadow-black/20">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-200 to-slate-400 flex items-center justify-center text-zinc-950 font-black shadow-md shadow-slate-300/10 shrink-0">
            {icon}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-100 tracking-wider uppercase font-outfit">
              {moduleTitle}
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-300/10 text-slate-300 border border-slate-300/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {statusText}
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-medium mt-0.5">
            {subtitle}
          </p>
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-3 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
};
