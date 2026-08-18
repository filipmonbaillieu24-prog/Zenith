import React from 'react';

interface ZenithCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const ZenithCard: React.FC<ZenithCardProps> = ({
  title,
  subtitle,
  icon,
  action,
  className = '',
  style,
  children
}) => {
  return (
    <div 
      className={`zenith-card ${className}`}
      style={style}
    >
      {(title || icon || action) && (
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="p-2 rounded-lg bg-slate-300/10 text-slate-300 border border-slate-300/20 shrink-0">
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-base font-extrabold text-slate-100 tracking-wide font-outfit uppercase">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-zinc-400 font-medium">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
