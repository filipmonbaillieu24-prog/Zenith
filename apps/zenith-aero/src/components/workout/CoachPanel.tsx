import React, { useMemo, useState } from 'react';
import './CoachPanel.css';
import { RideSummaryWithBests, FitnessProfile } from '../../types/workout';
import { generateCoachAdvice } from '../../utils/coach';
import { computePMC, interpretTSB } from '../../utils/pmc';
import { Brain, Sparkles, CheckCircle2 } from 'lucide-react';
import { savePlannedWorkout } from '../../utils/db';
import { PlannedWorkoutItem } from '../../utils/pmc';
import { getRecommendedWorkoutType, generateWorkout } from '../../utils/workouts';

import { SavedLocation } from '../../types/route';

interface CoachPanelProps {
  rides: RideSummaryWithBests[];
  profile: FitnessProfile;
  onProfileChange: (p: FitnessProfile) => void;
  onActiveWorkoutChange?: (workout: any | null) => void;
  onGenerateTrainingsroute?: (params: any) => void;
  savedLocations?: SavedLocation[];
}

export const CoachPanel: React.FC<CoachPanelProps> = ({ 
  rides, profile,
  onActiveWorkoutChange, onGenerateTrainingsroute, savedLocations = []
}) => {
  // Daily Workout Generator states
  const [genMinutes, setGenMinutes] = useState(90);
  const [generatedWorkout, setGeneratedWorkout] = useState<PlannedWorkoutItem | null>(null);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  
  // Bereken PMC voor gepersonaliseerde begroeting
  const pmcStatus = useMemo(() => {
    const tssList = rides
      .filter(r => (r.tss ?? r.hrTSS) != null)
      .map(r => ({ date: r.date, tss: (r.tss ?? r.hrTSS)! }));
    const points = computePMC(tssList);
    const latest = points[points.length - 1] ?? { ctl: 0, atl: 0, tsb: 0 };
    return {
      latest,
      tsbStatus: interpretTSB(latest.tsb)
    };
  }, [rides]);

  const advice = useMemo(() => generateCoachAdvice(rides as any[], profile as any, pmcStatus.latest), [rides, profile, pmcStatus.latest]);

  const getGreetingMessage = () => {
    const name = profile.name ?? 'Atleet';
    const tsb = pmcStatus.latest.tsb;
    if (tsb < -20) {
      return `Hallo ${name}. Je lichaam staat momenteel onder aanzienlijke stress (TSB: ${Math.round(tsb)}). Focus today op actief herstel of neem een volledige rustdag.`;
    } else if (tsb > 5) {
      return `Hallo ${name}. Je bent uitgerust en je vorm is uitstekend (TSB: +${Math.round(tsb)}). Today is een perfecte dag voor een intensieve intervaltraining of een lange duurride!`;
    } else {
      return `Hallo ${name}. Je trainingsopbouw verloopt stabiel en gecontroleerd. Blijf je zones respecteren en volg de onderstaande adviezen om blessures te voorkomen.`;
    }
  };

  if (rides.length < 2) {
    return (
      <div className="wd-section-card" style={{ padding: 24, textAlign: 'center', color: '#cbd5e1' }}>
        <Brain size={32} strokeWidth={1.5} style={{ color: '#cbd5e1', marginBottom: 12 }} />
        <p style={{ margin: 0 }}>Upload minimaal 2 rideten met hartslag- of vermogensgegevens om gepersonaliseerd AI-trainingsadvies te genereren.</p>
      </div>
    );
  }

  const handleGenerateDailyWorkout = () => {
    const tsb = pmcStatus.latest.tsb;
    const recType = getRecommendedWorkoutType(tsb);
    const ftp = profile.ftp ?? 220;
    const lthr = profile.lthr ?? 165;
    
    const workoutObj = generateWorkout(recType, genMinutes);
    
    let tssFactor = 0.60;
    if (recType === 'recovery') tssFactor = 0.40;
    else if (recType === 'sweetspot') tssFactor = 0.78;
    else if (recType === 'threshold') tssFactor = 0.90;
    else if (recType === 'vo2max') tssFactor = 1.05;
    
    const plannedTSS = Math.round(genMinutes * tssFactor);

    const steps = workoutObj.blocks.map((b, idx) => {
      const minPower = Math.round(ftp * (b.powerPct - 0.05));
      const maxPower = Math.round(ftp * (b.powerPct + 0.05));
      
      let minHR = 0;
      let maxHR = 0;
      if (b.zone === 1) { minHR = Math.round(lthr * 0.60); maxHR = Math.round(lthr * 0.72); }
      else if (b.zone === 2) { minHR = Math.round(lthr * 0.72); maxHR = Math.round(lthr * 0.82); }
      else if (b.zone === 3) { minHR = Math.round(lthr * 0.82); maxHR = Math.round(lthr * 0.88); }
      else if (b.zone === 4) { minHR = Math.round(lthr * 0.88); maxHR = Math.round(lthr * 0.94); }
      else if (b.zone === 5) { minHR = Math.round(lthr * 0.94); maxHR = Math.round(lthr * 1.05); }

      return {
        index: idx,
        type: b.name.toLowerCase().includes('warm') ? 'warmup' : b.name.toLowerCase().includes('cool') ? 'cooldown' : 'work',
        duration_seconds: b.duration,
        target_power_min: minPower,
        target_power_max: maxPower,
        target_hr_min: minHR,
        target_hr_max: maxHR,
        target_cadence_min: b.zone === 1 ? 90 : b.zone === 5 ? 95 : 85,
        target_cadence_max: b.zone === 1 ? 100 : b.zone === 5 ? 105 : 95,
        audio_notes: `Start met ${b.name}. Probeer je vermogen tussen ${minPower} en ${maxPower} Watt te houden.`,
        name: b.name,
        powerPct: b.powerPct,
        zone: b.zone,
        color: b.color
      };
    });

    const plannedWorkout: PlannedWorkoutItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      title: workoutObj.title,
      type: recType,
      durationMinutes: genMinutes,
      plannedTSS,
      notes: workoutObj.description,
      steps
    };

    setGeneratedWorkout(plannedWorkout);
    setSaveSuccessMsg('');
  };

  const handleSaveGeneratedWorkout = async () => {
    if (!generatedWorkout) return;
    setIsSavingWorkout(true);
    try {
      // Format today's date in local time YYYY-MM-DD
      const date = new Date();
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const todayStr = `${y}-${m}-${d}`;
      
      const workoutToSave: PlannedWorkoutItem = {
        ...generatedWorkout,
        date: todayStr
      };
      
      await savePlannedWorkout(workoutToSave);
      setSaveSuccessMsg('✓ Training succesvol ingepland voor today!');
      setGeneratedWorkout(null);
    } catch (err) {
      console.error('Error saving geplande workout:', err);
      setSaveSuccessMsg('✗ Kon training niet opslaan.');
    } finally {
      setIsSavingWorkout(false);
    }
  };

  const handleGenerateRouteAndPlan = () => {
    if (!generatedWorkout) return;
    let lat = 51.0, lng = 4.5;
    if (savedLocations && savedLocations.length > 0) {
      lat = savedLocations[0].lat;
      lng = savedLocations[0].lng;
    }
    
    // Map Steps properly
    const workoutToSet = {
      id: generatedWorkout.id,
      title: generatedWorkout.title,
      description: generatedWorkout.notes ?? '',
      type: generatedWorkout.type,
      blocks: (generatedWorkout.steps ?? []).map((s: any) => ({
        name: s.name,
        duration: s.duration_seconds,
        powerPct: s.powerPct ?? 0.85,
        zone: s.zone ?? 2,
        color: s.color ?? '#cbd5e1'
      }))
    };

    onActiveWorkoutChange?.(workoutToSet);
    onGenerateTrainingsroute?.({
      lat,
      lng,
      durationMinutes: generatedWorkout.durationMinutes,
      options: { 
        profile: 'road', 
        workoutType: (['recovery','endurance','sweetspot','threshold'].includes(generatedWorkout.type) ? generatedWorkout.type : 'threshold') as any 
      }
    });
    setGeneratedWorkout(null);
  ;
}

  return (
    <div className="wd-coach-panel animate-slide-up">
      {/* 1. AI Coach Welcome Header */}
      <div className="wd-coach-hero-banner">
        <div className="wd-coach-hero-avatar">
          <Brain size={34} strokeWidth={1.5} className="wd-coach-brain-glow" />
        </div>
        <div className="wd-coach-hero-content">
          <h3>Jouw AI Training Coach</h3>
          <p>{getGreetingMessage()}</p>
        </div>
      </div>

      {/* ─── AI DAGTRAINING GENERATOR WIDGET ─── */}
      <div className="wd-section-card" style={{ background: 'linear-gradient(135deg, rgba(108, 92, 231, 0.05) 0%, rgba(203, 213, 225, 0.02) 100%)', border: '1px solid rgba(108, 92, 231, 0.15)', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 900, color: '#fff', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} style={{ color: '#cbd5e1', filter: 'drop-shadow(0 0 4px rgba(203, 213, 225, 0.5))' }} /> AI Dagtraining Generator
        </h3>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.5 }}>
          Genereer automatisch de optimale gestructureerde training voor today op basis van je actuele fysiologische vorm (TSB) en beschikbare tijd.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase' }}>Beschikbare Tijd</span>
            <select 
              value={genMinutes} 
              onChange={(e) => {
                setGenMinutes(parseInt(e.target.value));
                setGeneratedWorkout(null);
              }}
              style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontFamily: 'inheride', outline: 'none' }}
            >
              <option value={45}>45 minuten</option>
              <option value={60}>60 minuten (1 uur)</option>
              <option value={75}>75 minuten (1u 15m)</option>
              <option value={90}>90 minuten (1,5 uur)</option>
              <option value={120}>120 minuten (2 uur)</option>
              <option value={150}>150 minuten (2,5 uur)</option>
              <option value={180}>180 minuten (3 uur)</option>
            </select>
          </div>

          <button 
            onClick={handleGenerateDailyWorkout}
            style={{ 
              marginTop: 18,
              background: 'linear-gradient(135deg, #cbd5e1 0%, #6c5ce7 100%)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 12,
              fontWeight: 800,
              padding: '10px 18px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(203, 213, 225, 0.15)',
              fontFamily: 'inheride',
              transition: 'transform 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
          >
            Genereer Training
          </button>
        </div>

        {saveSuccessMsg && (
          <div style={{ 
            padding: '10px 14px', 
            borderRadius: 8, 
            fontSize: 12, 
            fontWeight: 700,
            background: saveSuccessMsg.startsWith('✓') ? 'rgba(203, 213, 225, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${saveSuccessMsg.startsWith('✓') ? 'rgba(203, 213, 225, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
            color: saveSuccessMsg.startsWith('✓') ? '#cbd5e1' : '#f87171',
            marginBottom: 16
          }}>
            {saveSuccessMsg} {saveSuccessMsg.startsWith('✓') && (
              <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: '#cbd5e1', marginTop: 4 }}>
                Open de <strong>Route Planner</strong>-tab om een bijbehorende GPX-route met dynamische snelheidsdoelen te genereren!
              </span>
            )}
          </div>
        )}

        {generatedWorkout && (
          <div className="animate-slide-up" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 8 }}>
              <div>
                <span style={{ fontSize: 9, fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.8px' }}>AI Trainingsvoorstel</span>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#fff' }}>{generatedWorkout.title}</h4>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                <span>Duur: <strong style={{ color: '#cbd5e1' }}>{generatedWorkout.durationMinutes} min</strong></span>
                <span style={{ color: '#64748b' }}>|</span>
                <span>TSS: <strong style={{ color: '#ff7675' }}>{generatedWorkout.plannedTSS}</strong></span>
              </div>
            </div>

            <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 12px' }}>{generatedWorkout.notes}</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {generatedWorkout.steps?.map((step: any, idx: number) => {
                let badgeColor = '#64748b';
                if (step.type === 'warmup') badgeColor = '#74b9ff';
                else if (step.type === 'work') badgeColor = '#ff7675';
                else if (step.type === 'recover') badgeColor = '#55efc4';
                else if (step.type === 'cooldown') badgeColor = '#a29bfe';

                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                      <span style={{ 
                        fontSize: 8, 
                        fontWeight: 900, 
                        textTransform: 'uppercase', 
                        background: badgeColor + '1a', 
                        color: badgeColor, 
                        border: `1px solid ${badgeColor}33`,
                        padding: '2px 6px',
                        borderRadius: 4,
                        minWidth: 50,
                        textAlign: 'center'
                      }}>
                        {step.type}
                      </span>
                      <span style={{ color: '#cbd5e1' }}>{Math.round(step.duration_seconds / 60)} min</span>
                      <span style={{ color: '#64748b' }}>|</span>
                      <span style={{ color: '#94a3b8' }}>
                        Doel: {step.target_power_min > 0 ? `${step.target_power_min}-${step.target_power_max}W` : 'Maximum'}
                        {step.target_hr_min > 0 && ` (${step.target_hr_min}-${step.target_hr_max} bpm)`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setGeneratedWorkout(null)}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: '#cbd5e1', fontSize: 11, fontWeight: 700, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inheride' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveGeneratedWorkout}
                disabled={isSavingWorkout}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#cbd5e1', fontSize: 11, fontWeight: 700, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inheride' }}
              >
                {isSavingWorkout ? 'Inplannen...' : 'Plan Zonder Route'}
              </button>
              <button 
                onClick={handleGenerateRouteAndPlan}
                style={{ background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)', border: 'none', borderRadius: 8, color: '#09090b', fontSize: 11, fontWeight: 800, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inheride', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Genereer Route & Plan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Advieskaarten Lijst */}
      {advice.length === 0 ? (
        <div className="wd-coach-empty-state">
          <CheckCircle2 size={24} strokeWidth={1.5} style={{ color: '#cbd5e1', marginBottom: 8 }} />
          <p>Geen openstaande adviezen. Goed bezig!</p>
        </div>
      ) : (
        <div className="wd-coach-list">
          {advice.map((a, i) => {
            const isUrgent = a.prioridey === 1;
            return (
              <div 
                key={i} 
                className={`wd-coach-card ${isUrgent ? 'wd-coach-card--urgent' : ''}`} 
                style={{ borderLeftColor: a.color }}
              >
                <div className="wd-coach-card__head">
                  <span className="wd-coach-card__icon">{a.icon}</span>
                  <span className="wd-coach-card__title" style={{ color: a.color }}>{a.title}</span>
                  <span className={`wd-coach-card__cat wd-coach-cat--${a.category}`}>{a.category}</span>
                </div>
                <p className="wd-coach-card__body">{a.body}</p>
                {a.action && (
                  <div className="wd-coach-card__action">
                    <Sparkles size={11} strokeWidth={1.6} style={{ color: '#cbd5e1', marginRight: 4 }} />
                    <span>Actiepunt: <strong>{a.action}</strong></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
