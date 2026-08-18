import React from 'react';
import { BookOpen, ChefHat, Sparkles, Activity } from 'lucide-react';
import { FuelTab } from '../types/fuel';

interface NavbarProps {
  activeTab: FuelTab;
  setActiveTab: (tab: FuelTab) => void;
  userName: string;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, userName }) => {
  return (
    <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Activity className="w-5 h-5 text-zinc-950 font-bold" />
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-amber-200 bg-clip-text text-transparent">
                Zenith Fuel
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                {userName ? `Athlete: ${userName}` : 'ZANE Adaptive'}
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('logbook')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'logbook'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Logboek</span>
            </button>

            <button
              onClick={() => setActiveTab('ingredients')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'ingredients'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <ChefHat className="w-4 h-4" />
              <span>Ingrediënten</span>
            </button>

            <button
              onClick={() => setActiveTab('recipes')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'recipes'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <ChefHat className="w-4 h-4 text-orange-400" />
              <span>Recepten</span>
            </button>

            <button
              onClick={() => setActiveTab('supplements')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'supplements'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Supplementen</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
