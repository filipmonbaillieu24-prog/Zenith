import React from 'react';
import { Flag, Star, AlertCircle } from 'lucide-react';
import { TrainingPhase, phaseConfig } from '../../types/training';
import { RideSummaryWithBests } from '../../types/workout';

interface PeriodizationTabProps {
  rides: RideSummaryWithBests[];
  eventName: string;
  eventDate: string;
  setEventName: (n: string) => void;
  setEventDate: (d: string) => void;
  // Computed values passed from parent or calculated locally
  phaseInfo: { phase: TrainingPhase; daysToEvent: number; weekLabel: string };
  phase: { color: string; emoji: string; label: string; description: string; weekFocus: string[] };
  ridesByDay: Map<string, { tss: number; distance: number; name: string }>;
  pmcData: { ctl: number; atl: number; tsb: number };
}

export const PeriodizationTab: React.FC<PeriodizationTabProps> = ({
  rides,
  eventName,
  eventDate,
  setEventName,
  setEventDate,
  phaseInfo,
  phase,
  ridesByDay,
  pmcData,
}) => {
  // Bereken maandag van deze week voor de weergave
  const now2 = new Date(); now2.setHours(0,0,0,0);
  const dow  = now2.getDay();
  const mon  = new Date(now2); mon.setDate(now2.getDate() - ((dow + 6) % 7));
  const days2 = ['Ma','Di','Wo','Do','Vr','Za','Zo'];

  const weekTSSactual = days2.reduce((sum, _, i) => {
    const dd = new Date(mon); dd.setDate(mon.getDate() + i);
    const rr = ridesByDay.get(dd.toISOString().slice(0,10));
    return sum + (rr?.tss ?? 0);
  }, 0);

  const weekTSSgoal = Math.round(pmcData.ctl * 7 * 0.9); // ~90% CTL/dag × 7

  return (
    <div className="wd-main-single" style={{ display: 'block', overflowY: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', margin: '0 0 4px' }}>🎯 Periodization</h2>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Stel een doeldatum in en de app berekent automatisch je trainingsfase.</p>
        </div>

        {/* Event invoer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px' }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Event naam</label>
            <input value={eventName} onChange={e => setEventName(e.target.value)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#f8fafc', padding: '8px 10px', fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight: 700, boxSizing: 'border-box' }}
              placeholder="bijv. Gran Fondo, Sportive..." />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Event datum</label>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#f8fafc', padding: '8px 10px', fontSize: 13, fontFamily: 'inheride', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Fase banner */}
        <div style={{ background: `linear-gradient(135deg, ${phase.color}15, ${phase.color}08)`, border: `1px solid ${phase.color}30`, borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: phase.color, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
                Huidige Fase
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'Outfit, sans-serif', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{phase.emoji}</span> {phase.label}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.6, maxWidth: 380 }}>{phase.description}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: `${phase.color}20`, border: `1px solid ${phase.color}40` }}>
                <Flag size={13} color={phase.color} />
                <span style={{ fontSize: 12, fontWeight: 700, color: phase.color }}>{eventName}</span>
              </div>
              <span style={{ fontSize: 11, color: '#475569' }}>{phaseInfo.weekLabel}</span>
              {phaseInfo.daysToEvent > 0 && (
                <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Outfit, sans-serif', color: phase.color }}>{phaseInfo.daysToEvent}d</span>
              )}
            </div>
          </div>
        </div>

        {/* Fase uitleg + tijdlijn */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
          {(['base','build','peak','race'] as TrainingPhase[]).map(ph => {
            const pc = phaseConfig[ph];
            const isActive = phaseInfo.phase === ph;
            return (
              <div key={ph} style={{ padding: '12px', borderRadius: 10, background: isActive ? `${pc.color}12` : 'rgba(255,255,255,0.01)', border: `1px solid ${isActive ? pc.color + '40' : 'rgba(255,255,255,0.05)'}`, transition: 'all 0.2s' }}>
                <div style={{ fontSize: 16, marginBottom: 4 }}>{pc.emoji}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: isActive ? pc.color : '#64748b', marginBottom: 4 }}>{pc.label}</div>
                <div style={{ fontSize: 9, color: '#475569', lineHeight: 1.4 }}>
                  {ph === 'base' ? '9+ weken voor event' : ph === 'build' ? '3–9 weken voor event' : ph === 'peak' ? '1–3 weken voor event' : 'Race week'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Aanbevolen weekfocus — met gereden rideten */}
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.7px', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Star size={11} color={phase.color} /> Aanbevolen Weekfocus — {phase.label}
          </div>

          {weekTSSgoal > 0 && (
            <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, color: '#475569' }}>Week TSS voortgang:</span>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${Math.min(100, (weekTSSactual / weekTSSgoal) * 100).toFixed(0)}%`, background: `linear-gradient(90deg, ${phase.color}, #cbd5e1)`, borderRadius: 2, transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: phase.color, whiteSpace: 'nowrap' }}>{Math.round(weekTSSactual)} / {weekTSSgoal} TSS</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {days2.map((day, i) => {
              const dd = new Date(mon); dd.setDate(mon.getDate() + i);
              const key2 = dd.toISOString().slice(0, 10);
              const rideInfo2 = ridesByDay.get(key2);
              const isToday2 = key2 === now2.toISOString().slice(0, 10);
              const focus = phase.weekFocus[i];
              const isRest = focus === 'Rust' || focus === 'RACE';

              return (
                <div key={day} style={{ padding: '10px 4px', textAlign: 'center', borderRight: i < 6 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: rideInfo2 ? 'rgba(203,213,225,0.06)' : isToday2 ? `${phase.color}08` : 'transparent' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: isToday2 ? phase.color : '#334155', marginBottom: 3 }}>{day}</div>
                  {rideInfo2 ? (
                    <>
                      <div style={{ fontSize: 12, marginBottom: 2 }}>✅</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#cbd5e1' }}>{rideInfo2.distance.toFixed(0)}km</div>
                      {rideInfo2.tss > 0 && <div style={{ fontSize: 7, color: '#475569' }}>{Math.round(rideInfo2.tss)} TSS</div>}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, marginBottom: 2 }}>{isRest ? '😴' : '📋'}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: isRest ? '#334155' : phase.color, lineHeight: 1.3 }}>{focus}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Fase-specifiek advies op basis van echte rideten */}
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertCircle size={11} /> Gepersonaliseerd advies — {rides.length} rideten geanalyseerd
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {phaseInfo.phase === 'base' && (() => {
              const weeksLeft = Math.max(1, Math.ceil(phaseInfo.daysToEvent / 7));
              const ctlTarget = Math.round(pmcData.ctl + (weeksLeft * 0.8));
              return [
                { icon: '📈', text: `Bouw volume op met max. 5–10% per week. Jouw CTL-doel voor einde basisperiode: ~${ctlTarget} (nu: ${Math.round(pmcData.ctl)}).` },
                { icon: '🚴', text: 'Minimaal 80% van je trainingen in Zone 2 (conversatietempo).' },
                { icon: '⚡', text: `Huidige wekelijkse TSS: ~${Math.round(pmcData.atl * 7)}. Streef naar ${Math.round(pmcData.ctl * 7 * 0.9)} TSS/week.` },
              ].map((a, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#94a3b8' }}><span>{a.icon}</span><span>{a.text}</span></div>);
            })()}

            {phaseInfo.phase === 'build' && (() => {
              const weeksInBuild = Math.max(1, Math.min(9, Math.ceil(phaseInfo.daysToEvent / 7) - 3));
              const ctlBuildTarget = Math.round(pmcData.ctl + (weeksInBuild * 1.2));
              return [
                { icon: '🏋️', text: 'Verhoog de intensiteit: meer sweet spot en drempeltraining.' },
                { icon: '📊', text: `CTL-doel: ${ctlBuildTarget} voor de tapering (nu: ${Math.round(pmcData.ctl)}). Dat is +${Math.round(1.2)} CTL/week nodig.` },
                { icon: '😴', text: `ATL nu: ${Math.round(pmcData.atl)}. Houd TSB boven -30 om overtraining te vermijden.` },
              ].map((a, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#94a3b8' }}><span>{a.icon}</span><span>{a.text}</span></div>);
            })()}

            {phaseInfo.phase === 'peak' && [
              { icon: '⬇️', text: `Verlaag volume met 40–50% (van ~${Math.round(pmcData.atl * 7)} naar ~${Math.round(pmcData.atl * 7 * 0.5)} TSS/week).` },
              { icon: '⚡', text: 'Behoud 2–3 korte scherpe intervallen per week om je systeem scherp te houden.' },
              { icon: '😴', text: `TSB nu: ${Math.round(pmcData.tsb)}. Streef naar TSB van +10 tot +20 op racedag.` },
            ].map((a, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#94a3b8' }}><span>{a.icon}</span><span>{a.text}</span></div>)}

            {phaseInfo.phase === 'race' && [
              { icon: '🏁', text: 'Geen nieuwe trainingsprikkel meer. Recovery is je enige taak.' },
              { icon: '🚴', text: 'Maximum 1 korte activeringsride (30–45 min) met 2–3 scherpe acceleraties.' },
              { icon: '🍝', text: 'Carbohydraat-laden 2–3 dagen voor het event (7–10g/kg/dag).' },
            ].map((a, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#94a3b8' }}><span>{a.icon}</span><span>{a.text}</span></div>)}

            {phaseInfo.phase === 'recovery' && [
              { icon: '🎉', text: 'Gefeliciteerd! Neem minimaal 1–2 weken volledig rust.' },
              { icon: '🚶', text: 'Wandelen, zwemmen of lichte yoga is oké. Geen geforceerde training.' },
              { icon: '🎯', text: `Je hebt ${rides.length} rideten en een CTL van ${Math.round(pmcData.ctl)} opgebouwd. Stel een nieuw doel in!` },
            ].map((a, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#94a3b8' }}><span>{a.icon}</span><span>{a.text}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
};
