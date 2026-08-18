import React from 'react';
import { Moon, Sparkles, Plus } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { calculateZenithSleepScore } from '@zenith/shared';

interface SleepTabProps {
  sleepLogs: any[];
  todaySleep: any;
  onOpenSleepModal: () => void;
}

export const SleepTab: React.FC<SleepTabProps> = ({
  sleepLogs,
  todaySleep,
  onOpenSleepModal
}) => {
  const latestDurationHours = todaySleep ? (todaySleep.duration_minutes / 60).toFixed(1) : '--';
  const latestQualityScore = todaySleep ? todaySleep.quality_score : 80;

  const sleepAnalysis = calculateZenithSleepScore(
    todaySleep ?? null,
    sleepLogs || []
  );

  const chartData = sleepLogs.slice(-14).map(log => ({
    date: log.logged_at ? new Date(log.logged_at).toLocaleDateString('nl-NL', { weekday: 'short' }) : '',
    hours: parseFloat((log.duration_minutes / 60).toFixed(1)),
    quality: log.quality_score
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-zinc-950 font-bold">
            <Moon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-100">Slaap & Herstel Architectuur</h2>
            <p className="text-xs text-zinc-400">Volg je slaapkwaliteit en Zenith ML herstelscores</p>
          </div>
        </div>
        <button
          onClick={onOpenSleepModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-zinc-950 font-semibold text-sm rounded-lg transition-all shadow-md shadow-indigo-500/10"
        >
          <Plus className="w-4 h-4" />
          <span>Slaap Loggen</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
          <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider block mb-1">Slaapduur (Afgelopen Nacht)</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-100">{latestDurationHours}</span>
            <span className="text-sm text-zinc-400">uur</span>
          </div>
        </div>

        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
          <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider block mb-1">Kwaliteitsscore</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-indigo-400">{latestQualityScore}</span>
            <span className="text-sm text-zinc-400">/ 100</span>
          </div>
        </div>

        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-indigo-400 font-medium block">Zenith Recovery Score</span>
            <span className="text-sm font-semibold text-zinc-200">{sleepAnalysis.recommendation}</span>
          </div>
        </div>
      </div>

      <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Slaapverloop (Laatste 14 Dagen)</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} domain={[0, 12]} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '8px', color: '#f4f4f5' }}
              />
              <Area type="monotone" dataKey="hours" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#sleepGrad)" name="Uren Slaap" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
