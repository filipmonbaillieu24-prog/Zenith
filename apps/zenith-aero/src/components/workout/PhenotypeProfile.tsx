import React, { useMemo } from 'react';
import { Bike, Zap, Mountain, MountainSnow, Timer, Dumbbell, Target, Dna } from 'lucide-react';
import { ZenithEmptyState } from '@zenith/shared';
import './PhenotypeProfile.css';
import { RideSummaryWithBests } from '../../types/workout';

interface PhenotypeProfileProps {
  rides: RideSummaryWithBests[];
  weight?: number;
  gender?: 'male' | 'female';
}

const cogganThresholds = {
  male: {
    s5:  [10.0, 13.0, 16.0, 19.0],
    m1:  [5.0,  6.5,  8.0,  9.5 ],
    m5:  [3.5,  4.4,  5.3,  6.2 ],
    m20: [2.5,  3.2,  4.0,  4.8 ]
  },
  female: {
    s5:  [8.5,  11.0, 13.5, 16.0],
    m1:  [4.25, 5.5,  6.8,  8.0 ],
    m5:  [3.0,  3.8,  4.5,  5.3 ],
    m20: [2.1,  2.7,  3.4,  4.1 ]
  }
};

const cogganRanges = {
  male: {
    s5:  { min: 6.0,  max: 22.0 },
    m1:  { min: 3.0,  max: 11.0 },
    m5:  { min: 2.0,  max: 7.2  },
    m20: { min: 1.5,  max: 6.0  }
  },
  female: {
    s5:  { min: 5.0,  max: 18.0 },
    m1:  { min: 2.5,  max: 9.5  },
    m5:  { min: 1.7,  max: 6.2  },
    m20: { min: 1.2,  max: 5.1  }
  }
};

function getCategoryLabel(wkg: number, steps: number[]): { label: string; color: string } {
  if (wkg < steps[0]) return { label: 'Recreational', color: '#94a3b8' };
  if (wkg < steps[1]) return { label: 'Moderate', color: '#38bdf8' };
  if (wkg < steps[2]) return { label: 'Good', color: '#34d399' };
  if (wkg < steps[3]) return { label: 'Excellent', color: '#fbbf24' };
  return { label: 'World Class', color: '#f87171' };
}

export const PhenotypeProfile: React.FC<PhenotypeProfileProps> = ({ rides, weight = 75, gender = 'male' }) => {
  const profile = useMemo(() => {
    if (rides.length === 0) return null;

    // Bepaal de beste historische waarden
    const bests = { s5: 0, m1: 0, m5: 0, m20: 0 };
    for (const r of rides) {
      const be = r.bestEfforts;
      if (!be) continue;
      if (be.s5 && be.s5 > bests.s5) bests.s5 = be.s5;
      if (be.m1 && be.m1 > bests.m1) bests.m1 = be.m1;
      if (be.m5 && be.m5 > bests.m5) bests.m5 = be.m5;
      if (be.m20 && be.m20 > bests.m20) bests.m20 = be.m20;
    }

    const wkg = {
      s5: bests.s5 / weight,
      m1: bests.m1 / weight,
      m5: bests.m5 / weight,
      m20: bests.m20 / weight
    };

    const thresholds = cogganThresholds[gender] || cogganThresholds.male;
    const ranges = cogganRanges[gender] || cogganRanges.male;

    const getPercent = (val: number, min: number, max: number) => {
      const pct = ((val - min) / (max - min)) * 100;
      return Math.max(0, Math.min(100, pct));
    };

    const sprintIdx = getPercent(wkg.s5, ranges.s5.min, ranges.s5.max);
    const anaerobicIdx = getPercent(wkg.m1, ranges.m1.min, ranges.m1.max);
    const vo2maxIdx = getPercent(wkg.m5, ranges.m5.min, ranges.m5.max);
    const ftpIdx = getPercent(wkg.m20, ranges.m20.min, ranges.m20.max);

    let type = "All-rounder";
    let icon: React.ReactNode = <Bike size={22} strokeWidth={1.8} />;
    let desc = "You have a balanced profile. You are highly versatile and perform well on flat roads as well as short hills.";
    let strength = "Versatility and adaptability.";
    let weaknessTip = "Focus on threshold training (FTP) to increase your aerobic engine, or sprint work to develop a real weapon.";

    const maxIdx = Math.max(sprintIdx, anaerobicIdx, vo2maxIdx, ftpIdx);

    if (maxIdx === sprintIdx && sprintIdx > ftpIdx + 15) {
      type = "Sprinter";
      icon = <Zap size={22} strokeWidth={1.8} />;
      desc = "Your physiology is built on pure speed and explosiveness. You have excellent muscle mass with fast-twitch muscle fibers.";
      strength = "Explosive final sprint and short accelerations.";
      weaknessTip = "Ride longer rides at a relaxed pace to grow your aerobic engine, so you start the final sprint fresh.";
    } else if (maxIdx === anaerobicIdx && anaerobicIdx > ftpIdx + 10) {
      type = "Puncheur";
      icon = <Mountain size={22} strokeWidth={1.8} />;
      desc = "Short, steep hills are your absolute favorite. You can go extremely deep into the anaerobic zone (1 to 2 minutes all-out).";
      strength = "Accelerations on hills and short, intensive efforts.";
      weaknessTip = "Train your fat oxidation with relaxed endurance rides to speed up your recovery between consecutive hills.";
    } else if (maxIdx === vo2maxIdx && vo2maxIdx > sprintIdx + 10) {
      type = "Climber";
      icon = <MountainSnow size={22} strokeWidth={1.8} />;
      desc = "You have an excellent ratio between VO2max and weight. You excel as soon as the road goes uphill for longer periods.";
      strength = "Longer climbs and successive tempo accelerations.";
      weaknessTip = "Do strength training on the bike (low cadence, high power) to develop more muscular force for flatter sections.";
    } else if (maxIdx === ftpIdx && ftpIdx > sprintIdx + 10) {
      type = "Time Trialist";
      icon = <Timer size={22} strokeWidth={1.8} />;
      desc = "You are a diesel engine. You can maintain high power for hours and are perfectly capable of pacing a steady tempo.";
      strength = "Long solo rides, riding fast on the flats, and tempo resilience.";
      weaknessTip = "Add short, explosive sprints to your workouts to teach your muscles to respond to abrupt tempo changes.";
    }

    const catSprint = getCategoryLabel(wkg.s5, thresholds.s5);
    const catAnaerobic = getCategoryLabel(wkg.m1, thresholds.m1);
    const catVo2max = getCategoryLabel(wkg.m5, thresholds.m5);
    const catFtp = getCategoryLabel(wkg.m20, thresholds.m20);

    return {
      type,
      icon,
      desc,
      strength,
      weaknessTip,
      scores: [
        { label: 'Sprint (5s)', val: wkg.s5.toFixed(1), unit: 'W/kg', pct: sprintIdx, category: catSprint.label, catColor: catSprint.color },
        { label: 'Anaerobic (1m)', val: wkg.m1.toFixed(1), unit: 'W/kg', pct: anaerobicIdx, category: catAnaerobic.label, catColor: catAnaerobic.color },
        { label: 'VO2max (5m)', val: wkg.m5.toFixed(1), unit: 'W/kg', pct: vo2maxIdx, category: catVo2max.label, catColor: catVo2max.color },
        { label: 'Threshold (20m)', val: wkg.m20.toFixed(1), unit: 'W/kg', pct: ftpIdx, category: catFtp.label, catColor: catFtp.color }
      ]
    };
  }, [rides, weight, gender]);

  if (!profile) {
    return (
      <div className="pp-pheno-card">
        <ZenithEmptyState
          icon={<Dna size={20} strokeWidth={1.8} />}
          title="Not enough data yet"
          message="Upload rides with power data to calculate your physiological phenotype."
        />
      </div>
    );
  }

  return (
    <div className="pp-pheno-card">
      <div className="pp-pheno-header">
        <h3 className="pp-pheno-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Dna size={13} strokeWidth={1.8} /> Physiological Profiling (Phenotype)
        </h3>
        <span className="pp-pheno-subtitle">Classification based on your all-time power profile ({gender === 'female' ? 'Female' : 'Male'})</span>
      </div>

      <div className="pp-pheno-badge-row">
        <div className="pp-pheno-badge-icon" style={{ color: '#cbd5e1' }}>{profile.icon}</div>
        <div>
          <div className="pp-pheno-type">{profile.type}</div>
          <p className="pp-pheno-desc">{profile.desc}</p>
        </div>
      </div>

      <div className="pp-pheno-scores" style={{ marginTop: 8 }}>
        {profile.scores.map((s, idx) => (
          <div key={idx} className="pp-pheno-score-row" style={{ marginBottom: 10 }}>
            <div className="pp-pheno-score-info">
              <span className="pp-pheno-score-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.label}
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: `${s.catColor}15`, color: s.catColor, border: `1px solid ${s.catColor}25` }}>
                  {s.category}
                </span>
              </span>
              <span className="pp-pheno-score-val">{s.val} <small style={{ fontSize: 9, color: '#64748b' }}>{s.unit}</small></span>
            </div>
            
            {/* Coggan segmenten balk with marker */}
            <div className="pp-pheno-bar-container" style={{ height: 12, background: 'transparent', overflow: 'visible', position: 'relative', marginTop: 4 }}>
              {/* Gekleurde segmenten */}
              <div style={{ display: 'flex', width: '100%', height: 6, borderRadius: 3, overflow: 'hidden', opacity: 0.18 }}>
                <div style={{ flex: '1 1 20%', background: '#94a3b8' }} />
                <div style={{ flex: '1 1 20%', background: '#38bdf8' }} />
                <div style={{ flex: '1 1 20%', background: '#34d399' }} />
                <div style={{ flex: '1 1 20%', background: '#fbbf24' }} />
                <div style={{ flex: '1 1 20%', background: '#f87171' }} />
              </div>
              
              {/* Marker atleet */}
              <div 
                style={{ 
                  position: 'absolute', 
                  top: -3, 
                  left: `${s.pct}%`, 
                  transform: 'translateX(-50%)', 
                  width: 4, 
                  height: 12, 
                  background: '#ffffff', 
                  border: '1px solid #09090b',
                  borderRadius: 2,
                  boxShadow: '0 0 6px rgba(255,255,255,0.9)',
                  zIndex: 10
                }} 
                title={`Your score: ${s.val} W/kg (${s.category})`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="pp-pheno-insights">
        <div className="pp-insight-block">
          <span className="pp-insight-lbl" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Dumbbell size={12} strokeWidth={1.8} /> Greatest strength:
          </span>
          <p className="pp-insight-val">{profile.strength}</p>
        </div>
        <div className="pp-insight-block" style={{ marginTop: 8 }}>
          <span className="pp-insight-lbl" style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#fdcb6e' }}>
            <Target size={12} strokeWidth={1.8} /> Coach Tip for Weaknesses:
          </span>
          <p className="pp-insight-val">{profile.weaknessTip}</p>
        </div>
      </div>
    </div>
  );
};
