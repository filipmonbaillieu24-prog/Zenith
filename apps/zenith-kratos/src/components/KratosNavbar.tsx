import React from 'react';
import { Dumbbell, LayoutDashboard, FileText, Settings, Activity } from 'lucide-react';
import { KratosTab } from '../types/kratos';

interface KratosNavbarProps {
  activeTab: KratosTab;
  setActiveTab: (tab: KratosTab) => void;
}

export const KratosNavbar: React.FC<KratosNavbarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-red-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <Dumbbell className="w-5 h-5 text-white font-bold" />
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-rose-400 via-red-400 to-amber-200 bg-clip-text text-transparent">
                Zenith Kratos
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                Strength & Hypertrophy
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('workout')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'workout'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Training</span>
            </button>

            <button
              onClick={() => setActiveTab('templates')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'templates'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Templates</span>
            </button>

            <button
              onClick={() => setActiveTab('exercises')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'exercises'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Dumbbell className="w-4 h-4 text-rose-400" />
              <span>Oefeningen</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Settings className="w-4 h-4 text-zinc-400" />
              <span>Instellingen</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
