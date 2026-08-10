import React, { useState, useEffect, useMemo } from 'react';
import { Scale, Moon, Footprints, Dumbbell, Bike, Activity, Heart } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { predictRecoveryScore, recoveryModel } from '../../../../../shared/ml/RecoveryScore';
import { computeSimulatedPMC, PlannedWorkoutItem, interpretTSB } from '../../utils/pmc';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import './ZenithHub.css';

interface ZenithHubPageProps {
  fitnessProfile: any;
  fitnessMetrics: { ctl: number; atl: number; tsb: number };
  userId: string;
  mlModelsLoaded?: boolean;
}

export const ZenithHubPage: React.FC<ZenithHubPageProps> = ({
  fitnessProfile,
  fitnessMetrics,
  userId,
  mlModelsLoaded,
}) => {



  // Dashboard Stats States
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutItem[]>([]);
  const [allRides, setAllRides] = useState<any[]>([]);
  const [allKratos, setAllKratos] = useState<any[]>([]);
  const [latestWeight, setLatestWeight] = useState<any | null>(null);
  const [latestSleep, setLatestSleep] = useState<any | null>(null);
  const [todaySteps, setTodaySteps] = useState<number>(0);
  const [weeklyRidesCount, setWeeklyRidesCount] = useState<number>(0);
  const [weeklyRidesDistance, setWeeklyRidesDistance] = useState<number>(0);
  const [weeklyKratosCount, setWeeklyKratosCount] = useState<number>(0);
  const [weeklyGymVolume, setWeeklyGymVolume] = useState<number>(0);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const fetchDashboardData = async () => {
    setLoadingDashboard(true);
    try {
      // 1. Fetch latest weight log
      const { data: wData } = await supabase
        .from('vigor_weight')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(1);
      if (wData && wData.length > 0) {
        setLatestWeight(wData[0]);
      } else {
        setLatestWeight(null);
      }

      // 2. Fetch latest sleep log
      const { data: sData } = await supabase
        .from('vigor_sleep')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(1);
      if (sData && sData.length > 0) {
        setLatestSleep(sData[0]);
      } else {
        setLatestSleep(null);
      }

      // 3. Fetch today's steps log
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data: stData } = await supabase
        .from('vigor_steps')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', todayStart.toISOString())
        .lte('logged_at', todayEnd.toISOString())
        .limit(1);
      if (stData && stData.length > 0) {
        setTodaySteps(stData[0].step_count || 0);
      } else {
        // Try fallback to last log to show something, or 0
        setTodaySteps(0);
      }

      // 4. Calculate start of current week (Monday)
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(now.setDate(diff));
      startOfWeek.setHours(0, 0, 0, 0);

      // 5. Fetch weekly rides count & distance
      const { data: rData } = await supabase
        .from('rides')
        .select('distance')
        .eq('user_id', userId)
        .gte('date', startOfWeek.getTime());

      if (rData) {
        setWeeklyRidesCount(rData.length);
        const totalDist = rData.reduce((sum, r) => sum + Number(r.distance || 0), 0);
        setWeeklyRidesDistance(totalDist);
      } else {
        setWeeklyRidesCount(0);
        setWeeklyRidesDistance(0);
      }

      // 6. Fetch weekly Kratos workouts count and volume
      const { data: kData } = await supabase
        .from('kratos_workouts')
        .select('id, volume')
        .eq('user_id', userId)
        .gte('completed_at', startOfWeek.toISOString());
      
      if (kData) {
        setWeeklyKratosCount(kData.length);
        const totalVolume = kData.reduce((sum, w) => sum + Number(w.volume || 0), 0);
        setWeeklyGymVolume(totalVolume);
      } else {
        setWeeklyKratosCount(0);
        setWeeklyGymVolume(0);
      }

      // 7. Fetch planned workouts for PMC simulation
      const { data: plannedData } = await supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', userId);
      if (plannedData) {
        setPlannedWorkouts(plannedData.map((p: any) => ({
          id: p.id,
          date: p.date,
          title: p.title,
          type: p.type as any,
          durationMinutes: p.duration_minutes,
          plannedTSS: p.planned_tss,
          notes: p.notes,
          steps: p.steps,
          routeId: p.route_id
        })));
      }

      // 8. Fetch completed rides for PMC simulation
      const { data: ridesData } = await supabase
        .from('rides')
        .select('date, metadata')
        .eq('user_id', userId);
      if (ridesData) {
        setAllRides(ridesData.map((r: any) => {
          const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {};
          return {
            date: Number(r.date),
            tss: meta?.tss ?? meta?.hrTSS ?? 0
          };
        }));
      }

      // 9. Fetch Kratos workouts for PMC simulation
      const { data: allKData } = await supabase
        .from('kratos_workouts')
        .select('completed_at, volume')
        .eq('user_id', userId);
      if (allKData) {
        setAllKratos(allKData);
      }

    } catch (err) {
      console.error('Error loading dashboard statistics:', err);
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchDashboardData();
    }
  }, [userId]);

  // ── PMC Simulation Logic ──
  const simPMC = useMemo(() => {
    const tssList: { date: number; tss: number }[] = [];

    allRides.forEach(r => {
      if (r.tss > 0) {
        tssList.push({ date: r.date, tss: r.tss });
      }
    });

    allKratos.forEach(k => {
      if (k.completed_at && k.volume) {
        const ts = new Date(k.completed_at).getTime();
        const volume = Number(k.volume);
        const sTSS = Math.min(80, Math.max(15, Math.round(volume * 0.012)));
        tssList.push({ date: ts, tss: sTSS });
      }
    });

    return computeSimulatedPMC(tssList, plannedWorkouts, 35);
  }, [allRides, allKratos, plannedWorkouts]);

  // Find today's point in the simulation to show unified metrics (Aero + Kratos)
  const todayPoint = useMemo(() => {
    if (simPMC.length === 0) return { ctl: fitnessMetrics.ctl, atl: fitnessMetrics.atl, tsb: fitnessMetrics.tsb };
    const todayKey = new Date().setHours(0,0,0,0);
    const pt = simPMC.find(p => {
      const d = new Date(p.date);
      d.setHours(0,0,0,0);
      return d.getTime() === todayKey;
    });
    return pt || { ctl: fitnessMetrics.ctl, atl: fitnessMetrics.atl, tsb: fitnessMetrics.tsb };
  }, [simPMC, fitnessMetrics]);

  const currentFormStatus = useMemo(() => {
    return interpretTSB(todayPoint.tsb);
  }, [todayPoint]);

  const chartData = useMemo(() => {
    return simPMC.map(pt => ({
      dateStr: new Date(pt.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      rawDate: pt.date,
      ctl: pt.ctl,
      atl: pt.atl,
      tsb: pt.tsb,
      tss: pt.tss,
      isSimulated: pt.isSimulated,
    }));
  }, [simPMC]);

  const ctl = Math.round(todayPoint.ctl);
  const atl = Math.round(todayPoint.atl);
  const tsb = Math.round(todayPoint.tsb);

  // Calculate recovery score (CR11)
  const recoveryScore = useMemo(() => {
    if (!recoveryModel.loaded) {
      return null;
    }
    const sQual = latestSleep?.quality_score ?? 80;
    const sDur = (latestSleep?.duration_minutes ?? 480) / 60;
    const weightVal = latestWeight?.weight ?? fitnessProfile.weight ?? 75;
    
    return predictRecoveryScore(
      tsb,
      sQual,
      sDur,
      weeklyGymVolume,
      todaySteps,
      0, // calorieBalance default
      weightVal,
      atl
    );
  }, [tsb, latestSleep, latestWeight, fitnessProfile.weight, weeklyGymVolume, todaySteps, atl, mlModelsLoaded]);


  // Helper for steps goal percentage
  const stepsGoal = Number(fitnessProfile.target_steps || 10000);
  const stepsPercentage = Math.min(100, Math.round((todaySteps / stepsGoal) * 100));

  return (
    <div className="zh-hub-container">
      {/* Background radial glow */}
      <div className="zh-hub-glow" />

      {/* DASHBOARD VIEW */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">
          {/* PMC & Recovery Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 20 }}>
            {/* PMC Card */}
            <div className="zh-stats-card">
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '1px' }}>
                  Fysiologische Belastingsbalans (PMC)
                </h3>
              </div>
              <p style={{ margin: '0 0 16px', fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                Berekend op basis van uw geregistreerde trainingsbelasting uit de gekoppelde Aero & Kratos extensies.
              </p>
              <div className="zh-stats-grid">
                <div className="zh-stat-item">
                  <span className="zh-stat-label">Fitheid (CTL)</span>
                  <strong className="zh-stat-value" style={{ color: '#cbd5e1' }}>{ctl}</strong>
                </div>
                <div className="zh-stat-item">
                  <span className="zh-stat-label">Vermoeidheid (ATL)</span>
                  <strong className="zh-stat-value" style={{ color: '#ff7675' }}>{atl}</strong>
                </div>
                <div className="zh-stat-item">
                  <span className="zh-stat-label">Vorm (TSB)</span>
                  <strong className="zh-stat-value" style={{ color: tsb >= 0 ? '#cbd5e1' : '#eccc68' }}>{tsb >= 0 ? `+${tsb}` : tsb}</strong>
                </div>
              </div>
              
              {/* Recharts PMC Voorspelling Grafiek */}
              <div className="wd-calendar-chart-wrapper" style={{ marginTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Periodisering & Voorspelling (+35 dagen)
                  </span>
                  <span style={{ fontSize: 10, color: currentFormStatus.color, fontWeight: 700 }}>
                    Status: {currentFormStatus.label} {currentFormStatus.emoji}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="dateStr" tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.05)" />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.05)" />
                    <Tooltip
                      contentStyle={{ background: '#09090b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#fff' }}
                    />
                    <ReferenceLine x={new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: 'Vandaag', fill: '#cbd5e1', fontSize: 10 }} />
                    <Bar dataKey="tss" fill="rgba(255,255,255,0.08)" radius={[2, 2, 0, 0]} name="Dagelijkse TSS" />
                    <Line type="monotone" dataKey="ctl" stroke="#cbd5e1" strokeWidth={2} dot={false} name="Fitheid (CTL)" />
                    <Line type="monotone" dataKey="atl" stroke="#ff7675" strokeWidth={1.5} dot={false} name="Vermoeidheid (ATL)" />
                    <Line type="monotone" dataKey="tsb" stroke="#fdcb6e" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Vorm (TSB)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recovery Score Card */}
            <div className="zh-stats-card" style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(20, 20, 20, 0.8) 100%)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Heart size={14} style={{ color: '#ff7675' }} /> AI Recovery Score
                  </h3>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                    Real-time herstelscore berekend over slaap, cardiobelasting en krachttraining.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', width: 56, height: 56, borderRadius: '50%' }}>
                  <strong style={{ fontSize: 20, color: '#ff7675', fontWeight: 900 }}>
                    {recoveryScore !== null ? `${recoveryScore}%` : '--'}
                  </strong>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <div style={{ height: 6, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${recoveryScore ?? 0}%`, background: 'linear-gradient(90deg, #ff7675, #ef4444)', borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 700 }}>
                  {recoveryScore === null ? 'Herstel berekenen...' :
                   recoveryScore >= 80 ? '🏆 Uitstekend hersteld. Klaar voor intensieve training!' :
                   recoveryScore >= 50 ? '💪 Goed hersteld. Normale belasting is prima.' :
                   '⚠️ Vermoeidheid gedetecteerd. Focus op actieve recuperatie of rust.'}
                </span>
              </div>
            </div>
          </div>

          {/* Sub Grid for health and weekly overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
            {/* Widget 1: Health & Vitality (Vigor) */}
            <div className="zh-stats-card" style={{ display: 'flex', flexDirection: 'column', justifySelf: 'stretch' }}>
              <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Scale size={14} style={{ color: '#cbd5e1' }} /> Gezondheid & Vitaliteit (Vigor)
              </h3>
              
              {loadingDashboard ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11, minHeight: 120 }}>
                  Vitaliteit laden...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, justifyContent: 'center' }}>
                  {/* Weight log */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div>
                      <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>Meest Recente Gewicht</span>
                      <strong style={{ fontSize: 18, color: '#f8fafc', fontWeight: 800 }}>
                        {latestWeight ? `${latestWeight.weight} kg` : '--'}
                      </strong>
                    </div>
                    {latestWeight && (
                      <span style={{ fontSize: 10, color: '#64748b' }}>
                        {new Date(latestWeight.logged_at).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>

                  {/* Sleep log */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Moon size={16} style={{ color: '#a29bfe' }} />
                      <div>
                        <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>Slaapkwaliteit</span>
                        <strong style={{ fontSize: 13, color: '#f8fafc' }}>
                          {latestSleep ? `${Math.round(latestSleep.duration_minutes / 60 * 10) / 10} uur` : '--'}
                        </strong>
                      </div>
                    </div>
                    {latestSleep && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: 6 }}>
                        Score: {latestSleep.quality_score}/100
                      </span>
                    )}
                  </div>

                  {/* Steps Progress */}
                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Footprints size={16} style={{ color: '#cbd5e1' }} />
                        <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>Stappenteller Vandaag</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1' }}>
                        {(todaySteps || 0).toLocaleString()} / {(stepsGoal || 10000).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${stepsPercentage}%`, background: 'linear-gradient(90deg, #cbd5e1, #ffffff)', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Widget 2: Weekly training summary statistics */}
            <div className="zh-stats-card" style={{ display: 'flex', flexDirection: 'column', justifySelf: 'stretch' }}>
              <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: '0.8px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={14} style={{ color: '#cbd5e1' }} /> Wekelijkse Prestaties
              </h3>

              {loadingDashboard ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11, minHeight: 120 }}>
                  Prestaties laden...
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1 }}>
                  {/* Aero Cardio summary */}
                  <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Bike size={18} style={{ color: '#cbd5e1' }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Cardio (Aero)</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: 24, display: 'block', fontWeight: 900, color: '#f8fafc' }}>
                        {weeklyRidesDistance.toFixed(0)} <span style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1' }}>km</span>
                      </strong>
                      <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                        {weeklyRidesCount} {weeklyRidesCount === 1 ? 'fietserit' : 'fietseritten'}
                      </span>
                    </div>
                  </div>

                  {/* Kratos Strength summary */}
                  <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Dumbbell size={18} style={{ color: '#c084fc' }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Kracht (Kratos)</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: 24, display: 'block', fontWeight: 900, color: '#f8fafc' }}>
                        {weeklyKratosCount} <span style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1' }}>sessies</span>
                      </strong>
                      <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                        Deze week voltooid
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
};
