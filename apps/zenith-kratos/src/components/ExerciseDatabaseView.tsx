import React from 'react';
import { Exercise } from '../types/kratos';
import { Plus, Edit3, Trash2, Dumbbell } from 'lucide-react';

interface ExerciseDatabaseViewProps {
  exercises: Exercise[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  onOpenAddModal: () => void;
  onEditExercise: (ex: Exercise) => void;
  onDeleteExercise: (id: string) => void;
}

const CATEGORIES = [
  'All', 'Quads', 'Hamstrings', 'Calves', 'Glutes', 'Chest', 
  'Lats', 'Upper Back', 'Lower Back', 'Shoulders', 'Biceps', 
  'Triceps', 'Abs', 'Obliques', 'Traps', 'Forearms'
];

export const ExerciseDatabaseView: React.FC<ExerciseDatabaseViewProps> = ({
  exercises,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  onOpenAddModal,
  onEditExercise,
  onDeleteExercise
}) => {
  const filtered = exercises.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ex.notes && ex.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || ex.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-zinc-950 font-bold">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-100">Oefeningen Bibliotheek</h2>
            <p className="text-xs text-zinc-400">Beheer je bewegingen, micro-progressie stappen en RIR doelen</p>
          </div>
        </div>
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm rounded-lg transition-all shadow-md shadow-amber-500/10"
        >
          <Plus className="w-4 h-4" />
          <span>Oefening Toevoegen</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Zoek op oefening naam..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50"
        />
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(ex => (
          <div 
            key={ex.id} 
            className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl hover:border-zinc-700/80 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-zinc-100 text-base">{ex.name}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium whitespace-nowrap">
                  {ex.category}
                </span>
              </div>
              
              {ex.notes && (
                <p className="text-xs text-zinc-400 line-clamp-2 mb-3">{ex.notes}</p>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/50 my-3">
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase">Increment:</span>
                  <span className="font-medium text-zinc-200">{ex.increment_weight} {ex.weight_unit} {ex.increment_per_side ? '/ zijde' : ''}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase">Default RIR:</span>
                  <span className="font-medium text-zinc-200">{ex.default_rir} RIR</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/50">
              <button
                onClick={() => onEditExercise(ex)}
                className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-all"
                title="Bewerken"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDeleteExercise(ex.id)}
                className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                title="Verwijderen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
