import React, { useState } from 'react';
import { MuscleMapPaths, PathPartData } from './MuscleMapPaths';

export interface MuscleData {
  id?: string;
  name: string;
  fatiguePercent: number; // 0 = recovered (grey), 100 = exhausted (red)
  lastTrained: string;
  primaryExercises: string[];
}

export type MuscleDataMap = Record<string, MuscleData>;

interface Props {
  customFatigueData?: MuscleDataMap;
}

const defaultMuscleDataMap: MuscleDataMap = {
  chest: {
    name: 'Borstspieren (Pectoralis Major)',
    fatiguePercent: 85,
    lastTrained: 'Yesterday (Bench Press)',
    primaryExercises: ['Barbell Bench Press', 'Incline Dumbbell Press', 'Chest Flyes']
  },
  deltoids: {
    name: 'Schouders (Deltoideus)',
    fatiguePercent: 65,
    lastTrained: 'Yesterday (Overhead Press)',
    primaryExercises: ['Overhead Press', 'Lateral Raises', 'Arnold Press']
  },
  biceps: {
    name: 'Biceps (Biceps Brachii)',
    fatiguePercent: 55,
    lastTrained: '2 dagen geleden',
    primaryExercises: ['Barbell Curls', 'Hammer Curls', 'Incline Dumbbell Curls']
  },
  triceps: {
    name: 'Triceps (Triceps Brachii)',
    fatiguePercent: 60,
    lastTrained: 'Yesterday (Tricep Pushdowns)',
    primaryExercises: ['Dips', 'Tricep Rope Pushdowns', 'Skullcrushers']
  },
  abs: {
    name: 'Buikspieren (Rectus Abdominis)',
    fatiguePercent: 35,
    lastTrained: '3 dagen geleden',
    primaryExercises: ['Hanging Leg Raises', 'Cable Crunches', 'Plank']
  },
  obliques: {
    name: 'Schuine Buikspieren (Obliques)',
    fatiguePercent: 20,
    lastTrained: '3 dagen geleden',
    primaryExercises: ['Russian Twists', 'Side Planks']
  },
  quadriceps: {
    name: 'Dijspieren (Quadriceps Femoris)',
    fatiguePercent: 80,
    lastTrained: 'Today (Squats & Cycling)',
    primaryExercises: ['Barbell Back Squats', 'Leg Press', 'Cardio Cycling']
  },
  upperBack: {
    name: 'Bovenrug (Rhomboids & Trapezius)',
    fatiguePercent: 40,
    lastTrained: '2 dagen geleden',
    primaryExercises: ['Pull-ups', 'Barbell Rows', 'T-Bar Rows']
  },
  lowerBack: {
    name: 'Lendenrug (Erector Spinae)',
    fatiguePercent: 50,
    lastTrained: '2 dagen geleden',
    primaryExercises: ['Deadlift', 'Hyperextensions']
  },
  gluteal: {
    name: 'Zitvlakspieren (Gluteus Maximus)',
    fatiguePercent: 75,
    lastTrained: 'Today (Squats)',
    primaryExercises: ['Hip Thrusts', 'Squats', 'Lunges']
  },
  hamstring: {
    name: 'Achterdijbeen (Hamstrings)',
    fatiguePercent: 70,
    lastTrained: 'Today (Romanian Deadlift)',
    primaryExercises: ['Romanian Deadlift', 'Lying Leg Curls']
  },
  calves: {
    name: 'Kuitspieren (Gastrocnemius & Soleus)',
    fatiguePercent: 45,
    lastTrained: 'Today (Cycling)',
    primaryExercises: ['Standing Calf Raises', 'Cycling']
  },
  forearm: {
    name: 'Onderarmen (Forearms)',
    fatiguePercent: 30,
    lastTrained: '2 dagen geleden',
    primaryExercises: ['Wrist Curls', 'Farmer Walk']
  },
  trapezius: {
    name: 'Monnikskapspier (Trapezius)',
    fatiguePercent: 30,
    lastTrained: '2 dagen geleden',
    primaryExercises: ['Barbell Shrugs', 'Deadlift']
  }
};

const cosmeticSlugs = new Set(['head', 'hair', 'hands', 'knees', 'feet', 'ankles']);
const overlappingSubGroupSlugs = new Set([
  'upperChest',
  'lowerChest',
  'innerQuad',
  'outerQuad',
  'upperAbs',
  'lowerAbs',
  'frontDeltoid',
  'serratus',
  'hipFlexors'
]);

export const AnatomicalMuscleHeatmap: React.FC<Props> = ({ customFatigueData }) => {
  const data = customFatigueData || defaultMuscleDataMap;
  const [activeView, setActiveView] = useState<'both' | 'front' | 'back'>('both');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  const getMuscleFill = (slug: string) => {
    if (cosmeticSlugs.has(slug)) {
      if (slug === 'head') return '#64748b';
      if (slug === 'hair') return '#334155';
      return '#94a3b8'; // Grey base silhouette for hands, feet, knees, ankles
    }
    const muscle = data[slug];
    if (!muscle) return '#94a3b8'; // Unselected muscle grey
    const pct = muscle.fatiguePercent;
    if (pct >= 75) return '#ef4444'; // Red
    if (pct >= 55) return '#f97316'; // Orange
    if (pct >= 30) return '#eab308'; // Yellow
    if (pct >= 10) return '#06b6d4'; // Cyan
    return '#94a3b8';
  };

  const getPathsData = (side: 'front' | 'back') => {
    const rawPaths = gender === 'male'
      ? (side === 'front' ? MuscleMapPaths.maleFront : MuscleMapPaths.maleBack)
      : (side === 'front' ? MuscleMapPaths.femaleFront : MuscleMapPaths.femaleBack);
    
    // Filter out overlapping sub-groups to ensure clean outlines without double lines
    return rawPaths.filter(p => !overlappingSubGroupSlugs.has(p.slug));
  };

  const getViewBox = (side: 'front' | 'back') => {
    if (gender === 'male') {
      return side === 'front' ? '0 95 727 1280' : '718 95 727 1280';
    }
    return side === 'front' ? '0 0 650 1450' : '823 0 650 1450';
  };

  const selectedMuscle = hoveredSlug && !cosmeticSlugs.has(hoveredSlug) ? data[hoveredSlug] : null;

  const renderBodyPart = (part: PathPartData) => {
    const isCosmetic = cosmeticSlugs.has(part.slug);
    const fill = getMuscleFill(part.slug);
    const isHovered = hoveredSlug === part.slug;

    const allD = [...part.common, ...part.left, ...part.right];

    return (
      <g
        key={part.slug}
        style={{ cursor: isCosmetic ? 'default' : 'pointer' }}
        onMouseEnter={() => !isCosmetic && setHoveredSlug(part.slug)}
        onMouseLeave={() => setHoveredSlug(null)}
      >
        {allD.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={fill}
            opacity={isHovered ? 1 : 0.9}
            stroke={isHovered ? '#ffffff' : '#334155'}
            strokeWidth={isHovered ? 2.5 : 1}
            style={{ transition: 'all 0.2s' }}
          />
        ))}
      </g>
    );
  };

  return (
    <div className="glass-panel" style={{
      padding: '24px',
      borderRadius: '20px',
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      color: '#ffffff',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      position: 'relative'
    }}>
      {/* Header controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 12px #ef4444' }} />
            Anatomical Muscle Heatmap
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
            Visual breakdown of muscle fatigue and recovery status per muscle group.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Gender toggle */}
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', padding: '3px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button
              onClick={() => setGender('male')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                border: 'none',
                background: gender === 'male' ? 'rgba(59, 130, 246, 0.8)' : 'transparent',
                color: gender === 'male' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Male
            </button>
            <button
              onClick={() => setGender('female')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                border: 'none',
                background: gender === 'female' ? 'rgba(236, 72, 153, 0.8)' : 'transparent',
                color: gender === 'female' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Female
            </button>
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', padding: '3px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button
              onClick={() => setActiveView('both')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                border: 'none',
                background: activeView === 'both' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                color: activeView === 'both' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Front & Back
            </button>
            <button
              onClick={() => setActiveView('front')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                border: 'none',
                background: activeView === 'front' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                color: activeView === 'front' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Front
            </button>
            <button
              onClick={() => setActiveView('back')}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                border: 'none',
                background: activeView === 'back' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                color: activeView === 'back' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      <div style={{ display: 'grid', gridTemplateColumns: activeView === 'both' ? '1fr 1fr 310px' : '1fr 340px', gap: '24px', alignItems: 'start' }}>

        {/* FRONT SVG */}
        {(activeView === 'both' || activeView === 'front') && (
          <div style={{ textAlign: 'center', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '12px' }}>
              Voorzijde ({gender === 'male' ? 'Man' : 'Vrouw'})
            </div>

            <svg viewBox={getViewBox('front')} style={{ width: '100%', maxHeight: '460px', filter: 'drop-shadow(0 15px 30px rgba(0,0,0,0.7))' }}>
              {getPathsData('front').map(renderBodyPart)}
            </svg>
          </div>
        )}

        {/* BACK SVG */}
        {(activeView === 'both' || activeView === 'back') && (
          <div style={{ textAlign: 'center', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '12px' }}>
              Achterzijde ({gender === 'male' ? 'Man' : 'Vrouw'})
            </div>

            <svg viewBox={getViewBox('back')} style={{ width: '100%', maxHeight: '460px', filter: 'drop-shadow(0 15px 30px rgba(0,0,0,0.7))' }}>
              {getPathsData('back').map(renderBodyPart)}
            </svg>
          </div>
        )}

        {/* Sidebar Info Drawer */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.45)',
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '360px'
        }}>
          {selectedMuscle ? (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: getMuscleFill(hoveredSlug || ''), textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                Muscle Group Details
              </div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 900 }}>{selectedMuscle.name}</h4>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: 'rgba(255,255,255,0.7)' }}>
                  <span>Spiervermoeidheid</span>
                  <span style={{ fontWeight: 800, color: getMuscleFill(hoveredSlug || '') }}>{selectedMuscle.fatiguePercent}%</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${selectedMuscle.fatiguePercent}%`, height: '100%', background: getMuscleFill(hoveredSlug || ''), transition: 'width 0.3s' }} />
                </div>
              </div>

              <div style={{ fontSize: '12px', lineHeight: '1.6', color: 'rgba(255,255,255,0.8)', marginBottom: '12px' }}>
                <strong>Laatst belast:</strong> {selectedMuscle.lastTrained}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                <strong>Oefeningen:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {selectedMuscle.primaryExercises.map((ex, idx) => (
                    <span key={idx} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: '#e2e8f0' }}>
                      {ex}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', margin: 'auto 0', color: 'rgba(255,255,255,0.5)', fontSize: '13px', lineHeight: '1.6' }}>
              <p>Hover over muscles on the silhouette map to view fatigue status and recent exercises.</p>
            </div>
          )}

          {/* Color Legend */}
          <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
              Recovery Legend
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#94a3b8' }} />
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>Hersteld (Grey)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#eab308' }} />
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>Licht (Yellow)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#f97316' }} />
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>Matig (Orange)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#ef4444' }} />
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>Hoog (Red)</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
