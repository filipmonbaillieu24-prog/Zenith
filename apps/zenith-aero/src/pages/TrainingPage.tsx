import React, { useMemo, useState } from 'react';
import '../workout.css';
import '../components/workout/CoachPanel.css';
import { FitnessProfile, RideSummaryWithBests } from '../types/workout';
import { SavedLocation } from '../types/route';
import { useTrainingState } from '../hooks/useTrainingState';
import { generateCoachAdvice } from '../utils/coach';
import { savePlannedWorkout } from '../utils/db';
import { PlannedWorkoutItem } from '../utils/pmc';
import { getRecommendedWorkoutType, generateWorkout } from '../utils/workouts';
import { phaseConfig, TrainingPhase } from '../types/training';
import {
  Brain, Sparkles,
  Moon, Footprints, Target, Calendar, Activity
} from 'lucide-react';

interface TrainingPageProps {
  profile: FitnessProfile;
  onProfileChange: (p: FitnessProfile) => void;
  rides: RideSummaryWithBests[];
  kratosWorkouts?: any[];
  savedLocations: SavedLocation[];
  onGenerateTrainingsroute: (params: {
    lat: number;
    lng: number;
    durationMinutes: number;
    options: {
      profile: 'road' | 'gravel' | 'mtb';
      workoutType: 'recovery' | 'endurance' | 'sweetspot' | 'threshold';
    };
  }) => void;
  onActiveWorkoutChange: (workout: any | null) => void;
}

export const TrainingPage: React.FC<TrainingPageProps> = ({
  profile,
  onProfileChange: _onProfileChange,
  rides,
  kratosWorkouts = [],
  savedLocations,
  onGenerateTrainingsroute,
  onActiveWorkoutChange,
}) => {
  const state = useTrainingState(profile, rides, kratosWorkouts);

  const [generatedWorkout, setGeneratedWorkout] = useState<PlannedWorkoutItem | null>(null);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // ── AI Coach Greeting Message ──────────────────────────────────────────────
  const getGreetingMessage = () => {
    const name = profile.name ?? 'Atleet';
    const tsb = state.pmcData.tsb;
    if (tsb < -20) {
      return `Hello ${name}. Your body is currently under substantial stress (TSB: ${Math.round(tsb)}). Focus today on active recovery or take a rest day volledige rustdag.`;
    } else if (tsb > 5) {
      return `Hello ${name}. You are well rested and your form is excellent (TSB: +${Math.round(tsb)}). Today is a great day for an intensive workoutrvaltraining of een lange duurride!`;
    } else {
      return `Hello ${name}. Your training build is steady and controlled. Keep respecting your zones and follow guidance to prevent injuryn.`;
    }
  };

  // ── Daily Workout Generator trigger ────────────────────────────────────────
  const handleGenerateDailyWorkout = () => {
    const tsb = state.pmcData.tsb;
    const recType = getRecommendedWorkoutType(tsb, state.goalType, state.activeFocus, state.phaseInfo.phase);
    const ftp = profile.ftp ?? 220;
    const lthr = profile.lthr ?? 165;
    const genMinutes = state.duration;
    
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
        audio_notes: `Start with ${b.name}. Try to keep your power between ${minPower} en ${maxPower} Watts.`,
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
      setSaveSuccessMsg('✓ Workout successfully scheduled for today!');
      setGeneratedWorkout(null);
    } catch (err) {
      console.error('Error saving geplande workout:', err);
      setSaveSuccessMsg('✗ Could not save workout.');
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
  };

  // ── Combined Advice Logic ──────────────────────────────────────────────────
  const advice = useMemo(() => generateCoachAdvice(rides as any[], profile as any, state.pmcData), [rides, profile, state.pmcData]);

  const phaseAdvice = useMemo(() => {
    const items: { icon: string; title: string; text: string; action?: string }[] = [];
    const phaseKey = state.phaseInfo.phase;
    
    if (phaseKey === 'base') {
      const weeksLeft = Math.max(1, Math.ceil(state.phaseInfo.daysToEvent / 7));
      const ctlTarget = Math.round(state.pmcData.ctl + (weeksLeft * 0.8));
      items.push(
        { icon: '📈', title: 'Build Volume', text: `Build volume by max 5-10% per week. CTL target for base phase end: ~${ctlTarget}.`, action: 'Target +0.8 CTL/week' },
        { icon: '🚴', title: 'Aerobic Threshold', text: 'Keep at least 80% of workouts in Zone 2 (conversational pace) for fat oxidation.', action: 'Focus op Zone 2' },
        { icon: '⚡', title: 'TSS Volume', text: `Target circa ${Math.round(state.pmcData.ctl * 7 * 0.9)} TSS per week in this phase.`, action: `${Math.round(state.pmcData.ctl * 7 * 0.9)} TSS/week` }
      );
    } else if (phaseKey === 'build') {
      const weeksInBuild = Math.max(1, Math.min(9, Math.ceil(state.phaseInfo.daysToEvent / 7) - 3));
      const ctlBuildTarget = Math.round(state.pmcData.ctl + (weeksInBuild * 1.2));
      items.push(
        { icon: '🏋️', title: 'Increase Intensity', text: 'Add more sweet spot & threshold sessions to elevate FTP.', action: 'Voeg intervallen toe' },
        { icon: '📊', title: 'Build Workload Capacity', text: `Target CTL-doel van ~${ctlBuildTarget} before taperingperiode.`, action: 'Bouw CTL op' },
        { icon: '😴', title: 'Overtraining Risk Check', text: 'Monitor TSB (keep above -30) to prevent overfatigue.', action: 'Check TSB' }
      );
    } else if (phaseKey === 'peak') {
      items.push(
        { icon: '⬇️', title: 'Reduce Volume (Taper)', text: `Reduce weekly volume by 40-50% to build freshness.`, action: 'Verminder TSS' },
        { icon: '⚡', title: 'Maintain Sharpness', text: 'Do 2-3 short intensive intervals to maintain neuromuscular sharpness.', action: 'Korte prikkels' },
        { icon: '😴', title: 'Build Freshness', text: 'Target een positieve TSB (+10 tot +20) op de racedag.', action: 'Target TSB > 10' }
      );
    } else if (phaseKey === 'race') {
      items.push(
        { icon: '🏁', title: 'Race Day Focus', text: 'No new training stimulus. Rest and recovery is your sole focus.', action: 'Neem rust' },
        { icon: '🚴', title: 'Opener Ride', text: 'Do max 1 short opener ride (30-45 min) with brief surges.', action: 'Korte activering' },
        { icon: '🍝', title: 'Carbs laden', text: 'Carbo-load 2–3 days prior to event (7–10g per kg lichaamsgewicht).', action: 'Carb-loading' }
      );
    } else if (phaseKey === 'recovery') {
      items.push(
        { icon: '🎉', title: 'Complete Recovery', text: 'Take at least 1-2 weeks complete rest for physical and mental recovery.', action: 'Rustperiode' },
        { icon: '🚶', title: 'Active Recovery', text: 'Walking, swimming or light yoga is fine. Avoid hard rides.', action: 'Lichte activiteit' },
        { icon: '🎯', title: 'Set New Goal', text: `You completed ${rides.length} rides with a CTL of ${Math.round(state.pmcData.ctl)}. Plan een nieuw doel!`, action: 'Stel doel in' }
      );
    }
    return items;
  }, [state.phaseInfo.phase, state.phaseInfo.daysToEvent, state.pmcData, rides.length]);

  const agendaTitles = ['belasting', 'zone 2', 'frequentie', 'rideten', 'agenda', 'wekelijkse'];

  const agendaInsights = useMemo(() => {
    return advice.filter(a => agendaTitles.some(term => a.title.toLowerCase().includes(term)));
  }, [advice]);

  const pmcInsights = useMemo(() => {
    return advice.filter(a => !agendaTitles.some(term => a.title.toLowerCase().includes(term)));
  }, [advice]);



  // ── Calendar Calculations ──────────────────────────────────────────────────
  const now2 = new Date(); now2.setHours(0,0,0,0);
  const dow  = now2.getDay();
  const mon  = new Date(now2); mon.setDate(now2.getDate() - ((dow + 6) % 7));
  const days2 = ['Ma','Di','Wo','Do','Vr','Za','Zo'];

  const weekTSSactual = days2.reduce((sum, _, i) => {
    const dd = new Date(mon); dd.setDate(mon.getDate() + i);
    const rr = state.ridesByDay.get(dd.toISOString().slice(0,10));
    return sum + (rr?.tss ?? 0);
  }, 0);

  const weekTSSgoal = Math.round(state.pmcData.ctl * 7 * 0.9);

  return (
    <div className="wd-coach-panel animate-slide-up" style={{ padding: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      
      {/* ── SECTION 1: HEADER & HERO BANNER ───────────────────────────────────── */}
      <div className="wd-coach-hero-banner" style={{ minHeight: '100px' }}>
        <div className="wd-coach-hero-avatar" style={{ background: 'rgba(108, 92, 231, 0.15)', borderColor: 'rgba(108, 92, 231, 0.3)' }}>
          <Brain size={34} strokeWidth={1.5} className="wd-coach-brain-glow" style={{ color: '#a29bfe', filter: 'drop-shadow(0 0 8px rgba(108, 92, 231, 0.6))' }} />
        </div>
        <div className="wd-coach-hero-content" style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Your AI Training Coach</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {state.todaySleepQuality !== null && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 800,
                  background: state.todaySleepQuality >= 80 ? 'rgba(0, 184, 148, 0.1)' : state.todaySleepQuality >= 50 ? 'rgba(253, 203, 110, 0.1)' : 'rgba(255, 118, 117, 0.1)',
                  border: `1px solid ${state.todaySleepQuality >= 80 ? 'rgba(0, 184, 148, 0.25)' : state.todaySleepQuality >= 50 ? 'rgba(253, 203, 110, 0.25)' : 'rgba(255, 118, 117, 0.25)'}`,
                  color: state.todaySleepQuality >= 80 ? '#00b894' : state.todaySleepQuality >= 50 ? '#fdcb6e' : '#ff7675'
                }}>
                  <Moon size={10} />
                  Slaap: {state.todaySleepQuality}%
                </div>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 800,
                background: state.dailySteps >= 10000 ? 'rgba(108, 92, 231, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${state.dailySteps >= 10000 ? 'rgba(108, 92, 231, 0.25)' : 'rgba(255, 255, 255, 0.06)'}`,
                color: state.dailySteps >= 10000 ? '#a29bfe' : '#94a3b8'
              }}>
                <Footprints size={10} />
                {state.dailySteps.toLocaleString('nl-NL')} stappen
              </div>
            </div>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
            {getGreetingMessage()}
          </p>
        </div>
      </div>

      {/* ── SECTION 2: 2-COLUMN DASHBOARD GRID ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, width: '100%' }} className="wd-coach-grid-layout">
        
        {/* LEFT COLUMN: DIAGNOSE & WORKOUT GENERATOR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Card: Fysiologische PMC Status */}
          <div className="wd-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 900, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={14} style={{ color: '#cbd5e1' }} /> Fysiologische Status (PMC)
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 4 }}>
              
              {/* CTL */}
              <div style={{
                background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 10px', textAlign: 'center',
                display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '3px solid #00b894'
              }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>CTL (Fitness)</span>
                <span style={{ fontSize: 24, fontWeight: 900, color: '#fff', fontFamily: 'Outfit, sans-serif' }}>
                  {Math.round(state.pmcData.ctl)}
                </span>
                <span style={{ fontSize: 9, color: '#475569' }}>Chronische belasting</span>
              </div>

              {/* ATL */}
              <div style={{
                background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 10px', textAlign: 'center',
                display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '3px solid #ff7675'
              }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>ATL (Vermoeidheid)</span>
                <span style={{ fontSize: 24, fontWeight: 900, color: '#fff', fontFamily: 'Outfit, sans-serif' }}>
                  {Math.round(state.pmcData.atl)}
                </span>
                <span style={{ fontSize: 9, color: '#475569' }}>Acute stressbelasting</span>
              </div>

              {/* TSB */}
              {(() => {
                const tsb = state.pmcData.tsb;
                let tsbColor = '#ff7675';
                let tsbDesc = 'Overbelast';
                if (tsb > 15) { tsbColor = '#fdcb6e'; tsbDesc = 'Rust / Fris'; }
                else if (tsb >= 5) { tsbColor = '#00b894'; tsbDesc = 'Optimaal'; }
                else if (tsb >= -20) { tsbColor = '#a29bfe'; tsbDesc = 'Stabiel'; }

                return (
                  <div style={{
                    background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 10px', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', gap: 4, borderLeft: `3px solid ${tsbColor}`
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>TSB (Vormbalans)</span>
                    <span style={{ fontSize: 24, fontWeight: 900, color: tsbColor, fontFamily: 'Outfit, sans-serif' }}>
                      {tsb >= 0 ? `+${Math.round(tsb)}` : Math.round(tsb)}
                    </span>
                    <span style={{ fontSize: 9, color: tsbColor, fontWeight: 700 }}>{tsbDesc}</span>
                  </div>
                );
              })()}
            </div>
            
             <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.5, background: 'rgba(255,255,255,0.01)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ color: '#cbd5e1', fontWeight: 700 }}>AI Form-analyse:</span> {state.tsbStatus.emoji} {state.tsbStatus.label}
            </p>

            {/* Action Row: Genereer Dagtraining */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4, background: 'rgba(108, 92, 231, 0.03)', border: '1px solid rgba(108, 92, 231, 0.1)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={13} style={{ color: '#a29bfe' }} />
                <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800 }}>Dagtraining</span>
                <select 
                  value={state.duration} 
                  onChange={(e) => {
                    state.setDuration(parseInt(e.target.value));
                    setGeneratedWorkout(null);
                  }}
                  style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: 'inheride', outline: 'none' }}
                >
                  <option value={45}>45m</option>
                  <option value={60}>60m</option>
                  <option value={75}>75m</option>
                  <option value={90}>90m</option>
                  <option value={120}>120m</option>
                  <option value={150}>150m</option>
                  <option value={180}>180m</option>
                </select>
              </div>

              <button 
                onClick={handleGenerateDailyWorkout}
                style={{ 
                  background: 'linear-gradient(135deg, #cbd5e1 0%, #6c5ce7 100%)',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 900,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(108, 92, 231, 0.15)',
                  fontFamily: 'inheride'
                }}
              >
                Genereer
              </button>
            </div>

            {saveSuccessMsg && (
              <div style={{ 
                padding: '10px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: saveSuccessMsg.startsWith('✓') ? 'rgba(0, 184, 148, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${saveSuccessMsg.startsWith('✓') ? 'rgba(0, 184, 148, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                color: saveSuccessMsg.startsWith('✓') ? '#00b894' : '#f87171',
                marginTop: 4
              }}>
                {saveSuccessMsg} {saveSuccessMsg.startsWith('✓') && (
                  <span style={{ display: 'block', fontSize: 9, fontWeight: 500, color: '#94a3b8', marginTop: 4 }}>
                    Open <strong>Route Planner</strong> to generate a matching GPX route with speed targets!
                  </span>
                )}
              </div>
            )}

            {generatedWorkout && (
              <div className="animate-slide-up" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 8, fontWeight: 950, color: '#a29bfe', textTransform: 'uppercase', letterSpacing: '0.8px' }}>AI Trainingsvoorstel</span>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#fff' }}>{generatedWorkout.title}</h4>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                    <span>Duration: <strong style={{ color: '#cbd5e1' }}>{generatedWorkout.durationMinutes} min</strong></span>
                    <span style={{ color: '#475569' }}>|</span>
                    <span>TSS: <strong style={{ color: '#ff7675' }}>{generatedWorkout.plannedTSS}</strong></span>
                  </div>
                </div>

                <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 10px' }}>{generatedWorkout.notes}</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {generatedWorkout.steps?.map((step: any, idx: number) => {
                    let badgeColor = '#64748b';
                    if (step.type === 'warmup') badgeColor = '#74b9ff';
                    else if (step.type === 'work') badgeColor = '#ff7675';
                    else if (step.type === 'recover') badgeColor = '#55efc4';
                    else if (step.type === 'cooldown') badgeColor = '#a29bfe';

                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 8, padding: '6px 10px', fontSize: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                          <span style={{ 
                            fontSize: 7, fontWeight: 900, textTransform: 'uppercase', 
                            background: badgeColor + '15', color: badgeColor, border: `1px solid ${badgeColor}25`,
                            padding: '2px 5px', borderRadius: 4, minWidth: 45, textAlign: 'center'
                          }}>
                            {step.type}
                          </span>
                          <span style={{ color: '#cbd5e1' }}>{Math.round(step.duration_seconds / 60)} min</span>
                          <span style={{ color: '#475569' }}>|</span>
                          <span style={{ color: '#94a3b8' }}>
                            Doel: {step.target_power_min > 0 ? `${step.target_power_min}-${step.target_power_max}W` : 'Maximum'}
                            {step.target_hr_min > 0 && ` (${step.target_hr_min}-${step.target_hr_max} bpm)`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => setGeneratedWorkout(null)}
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: '#cbd5e1', fontSize: 10, fontWeight: 700, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inheride' }}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveGeneratedWorkout}
                    disabled={isSavingWorkout}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#cbd5e1', fontSize: 10, fontWeight: 700, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inheride' }}
                  >
                    {isSavingWorkout ? 'Inplannen...' : 'Plan Zonder Route'}
                  </button>
                  <button 
                    onClick={handleGenerateRouteAndPlan}
                    style={{ background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)', border: 'none', borderRadius: 8, color: '#09090b', fontSize: 10, fontWeight: 800, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inheride', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    Route & Plan
                  </button>
                </div>
              </div>
            )}

            {pmcInsights.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
                {pmcInsights.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 10, background: 'rgba(255,255,255,0.01)', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: 11, lineHeight: '1.2' }}>{a.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: '#cbd5e1', display: 'block', lineHeight: 1.3 }}>
                        <strong style={{ color: a.color }}>{a.title}:</strong> {a.body}
                      </span>
                      {a.action && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, fontWeight: 800, marginTop: 4, padding: '2px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                          💡 {a.action}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: EVENT & PERIODIZATION STATUS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Card: Target Event & Trainingsfase */}
          <div className="wd-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 900, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Target size={14} style={{ color: '#cbd5e1' }} /> Doel & Trainingsfase
            </h4>

            {/* Target Select Buttons */}
            <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 10, padding: 3 }}>
              <button 
                onClick={() => state.setGoalType('event')}
                style={{
                  flex: 1, padding: '6px 0', border: 'none', borderRadius: 7, fontSize: 10, fontWeight: 800, cursor: 'pointer', fontFamily: 'inheride',
                  background: state.goalType === 'event' ? 'rgba(255,255,255,0.05)' : 'transparent',
                  color: state.goalType === 'event' ? '#fff' : '#64748b',
                  transition: 'all 0.15s'
                }}
              >
                🏁 Specifiek Event
              </button>
              <button 
                onClick={() => state.setGoalType('continuous')}
                style={{
                  flex: 1, padding: '6px 0', border: 'none', borderRadius: 7, fontSize: 10, fontWeight: 800, cursor: 'pointer', fontFamily: 'inheride',
                  background: state.goalType === 'continuous' ? 'rgba(255,255,255,0.05)' : 'transparent',
                  color: state.goalType === 'continuous' ? '#fff' : '#64748b',
                  transition: 'all 0.15s'
                }}
              >
                🔄 Doorlopend
              </button>
            </div>

            {/* Inputs based on selection */}
            {state.goalType === 'event' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 10, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
                <div>
                  <label style={{ fontSize: 8, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Event naam</label>
                  <input value={state.eventName} onChange={e => state.setEventName(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, color: '#f8fafc', padding: '6px 8px', fontSize: 11, fontFamily: 'Outfit, sans-serif', fontWeight: 700, boxSizing: 'border-box' }}
                    placeholder="bijv. Gran Fondo..." />
                </div>
                <div>
                  <label style={{ fontSize: 8, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Event datum</label>
                  <input type="date" value={state.eventDate} onChange={e => state.setEventDate(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, color: '#f8fafc', padding: '6px 8px', fontSize: 11, fontFamily: 'inheride', boxSizing: 'border-box' }} />
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
                <label style={{ fontSize: 8, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Actieve Focus</label>
                <select value={state.activeFocus} onChange={e => state.setActiveFocus(e.target.value as any)}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, color: '#f8fafc', padding: '6px 8px', fontSize: 11, fontFamily: 'inheride', boxSizing: 'border-box', outline: 'none' }}>
                  <option value="endurance">🌱 Fitnessopbouw & Endurance</option>
                  <option value="ftp">⚡ FTP verhogen (Threshold Training)</option>
                  <option value="vo2max">🚀 VO2max & Hoge Intensiteit</option>
                  <option value="recovery">💤 Actief Recovery & Rust</option>
                </select>
              </div>
            )}

            {/* Phase Banner */}
            <div style={{
              background: `linear-gradient(135deg, ${state.phase.color}15, ${state.phase.color}05)`,
              border: `1px solid ${state.phase.color}25`, borderRadius: 12, padding: '14px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: 9, fontWeight: 800, color: state.phase.color, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Trainingsdoel focus</span>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span>{state.phase.emoji}</span> {state.phase.label}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 9, color: '#64748b' }}>{state.phaseInfo.weekLabel}</span>
                {state.goalType === 'event' ? (
                  state.phaseInfo.daysToEvent > 0 ? (
                    <span style={{ fontSize: 20, fontWeight: 900, color: state.phase.color }}>{state.phaseInfo.daysToEvent}d</span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 800, color: state.phase.color }}>Racedag! 🏁</span>
                  )
                ) : (
                  <span style={{ fontSize: 15, fontWeight: 900, color: state.phase.color }}>Doorlopend 🔄</span>
                )}
              </div>
            </div>

            {/* Horizontal Timeline Indicator - only show for event goal type */}
            {state.goalType === 'event' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 2 }}>
                {(['base','build','peak','race'] as TrainingPhase[]).map(ph => {
                  const pc = phaseConfig[ph];
                  const isActive = state.phaseInfo.phase === ph;
                  return (
                    <div key={ph} style={{
                      padding: '8px', borderRadius: 8, textAlign: 'center',
                      background: isActive ? `${pc.color}15` : 'rgba(255,255,255,0.01)',
                      border: `1px solid ${isActive ? pc.color + '35' : 'rgba(255,255,255,0.04)'}`,
                      transition: 'all 0.15s'
                    }}>
                      <div style={{ fontSize: 12 }}>{pc.emoji}</div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: isActive ? pc.color : '#475569', marginTop: 2 }}>{pc.label}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fase-richtlijnen */}
            <div style={{
              background: `linear-gradient(135deg, ${state.phase.color}05, transparent)`,
              border: `1px solid rgba(255,255,255,0.03)`,
              borderRadius: 10, padding: '10px 12px', marginTop: 4,
              display: 'flex', flexDirection: 'column', gap: 6
            }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: state.phase.color, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Richtlijnen {state.phase.label}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {phaseAdvice.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, lineHeight: '1.2' }}>{item.icon}</span>
                    <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', lineHeight: 1.3 }}>
                      <strong style={{ color: '#cbd5e1' }}>{item.title}:</strong> {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card: Wekelijkse Agenda & Voortgang */}
          <div className="wd-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 900, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} style={{ color: '#cbd5e1' }} /> Wekelijkse Agenda & Focus
            </h4>

            {weekTSSgoal > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Wekelijkse TSS Voortgang:</span>
                  <span style={{ fontWeight: 800, color: state.phase.color }}>{Math.round(weekTSSactual)} / {weekTSSgoal} TSS</span>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${Math.min(100, (weekTSSactual / weekTSSgoal) * 100).toFixed(0)}%`,
                    background: `linear-gradient(90deg, ${state.phase.color}, #cbd5e1)`,
                    borderRadius: 3, transition: 'width 0.4s'
                  }} />
                </div>
              </div>
            )}

            {/* 7-day row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 12, padding: 4 }}>
              {days2.map((day, i) => {
                const dd = new Date(mon); dd.setDate(mon.getDate() + i);
                const key2 = dd.toISOString().slice(0, 10);
                const rideInfo2 = state.ridesByDay.get(key2);
                const isToday2 = key2 === now2.toISOString().slice(0, 10);
                const focus = state.phase.weekFocus[i];
                const isRest = focus === 'Rust' || focus === 'RACE';

                return (
                  <div 
                    key={day} 
                    style={{ 
                      padding: '8px 2px', textAlign: 'center', borderRadius: 8,
                      background: rideInfo2 ? 'rgba(0, 184, 148, 0.08)' : isToday2 ? `${state.phase.color}15` : 'transparent',
                      border: isToday2 ? `1px solid ${state.phase.color}35` : '1px solid transparent'
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 700, color: isToday2 ? state.phase.color : '#475569', marginBottom: 4 }}>{day}</div>
                    {rideInfo2 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 10, color: '#00b894' }}>✅</span>
                        <span style={{ fontSize: 7, fontWeight: 900, color: '#cbd5e1' }}>{rideInfo2.distance.toFixed(0)}k</span>
                        {rideInfo2.tss > 0 && <span style={{ fontSize: 6, color: '#64748b' }}>{Math.round(rideInfo2.tss)}t</span>}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 10 }}>{isRest ? '😴' : '📋'}</span>
                        <span style={{ fontSize: 7, fontWeight: 800, color: isRest ? '#475569' : state.phase.color, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>{focus}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {agendaInsights.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
                {agendaInsights.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 10, background: 'rgba(255,255,255,0.01)', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: 11, lineHeight: '1.2' }}>{a.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: '#cbd5e1', display: 'block', lineHeight: 1.3 }}>
                        <strong style={{ color: a.color }}>{a.title}:</strong> {a.body}
                      </span>
                      {a.action && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, fontWeight: 800, marginTop: 4, padding: '2px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                          💡 {a.action}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
