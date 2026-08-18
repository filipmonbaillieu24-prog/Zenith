import React, { useState, useMemo } from 'react';
import {
  Brain, Heart, Activity, Award, Zap, TrendingUp
} from 'lucide-react';
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, LineChart, Line,
} from 'recharts';
import { FitnessProfile, RideSummaryWithBests } from '../types/workout';

import { RacePredictor } from '../components/workout/RacePredictor';
import { PacingScatterPlot } from '../components/workout/PacingScatterPlot';
import {
  analyzeCardiacDrift,
  classifyRiderType,
  analyzeTrainingProfile,
  predictVO2max,
  predictFutureFTP,
} from '../utils/localNeuralNet';

import '../workout.css';
import './ProgressPage.css';

interface ProgressPageProps {
  profile: FitnessProfile;
  rides: RideSummaryWithBests[];
  isPro?: boolean;
  onRequestProModal?: (featureName: string, desc: string) => void;
}

export const ProgressPage: React.FC<ProgressPageProps> = ({ profile, rides, isPro = false, onRequestProModal }) => {
  const [timeRange, setTimeRange] = useState<30 | 90 | 365 | 'all'>(30);
  const [selectedRadarPoint, setSelectedRadarPoint] = useState<'s5' | 'm1' | 'm5' | 'm20' | null>(null);
  const [activePillar, setActivePillar] = useState<number | null>(null);

  const handleTimeRangeChange = (range: 30 | 90 | 365 | 'all') => {
    if (!isPro && range !== 30 && onRequestProModal) {
      onRequestProModal('PMC & Historische Progressie', 'Upgrade naar Zenith Pro om langetermijn conditie- en vermogensgrafieken (90 dagen, 1 jaar, All-time) in te zien.');
      return;
    }
    setTimeRange(range);
  };


  const filteredRides = useMemo(() => {
    if (timeRange === 'all') return rides;
    const cutoff = Date.now() - timeRange * 24 * 3600 * 1000;
    return rides.filter(r => r.date >= cutoff);
  }, [rides, timeRange]);

  // Trend sparkline data
  const efficiencyTrend = useMemo(() =>
    [...filteredRides].filter(r => r.hasHR && r.cardiacCost).reverse()
      .map(r => ({ date: new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' }), val: parseFloat(r.cardiacCost!.toFixed(3)) })),
    [filteredRides]);

  const recoveryTrend = useMemo(() =>
    [...filteredRides].filter(r => r.hasHR && r.hrRecovery60).reverse()
      .map(r => ({ date: new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' }), val: r.hrRecovery60! })),
    [filteredRides]);

  const toughnessTrend = useMemo(() =>
    [...filteredRides].filter(r => r.hasPower && r.fresh5minPower && r.fatigued5minPower).reverse()
      .map(r => ({ date: new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' }), val: Math.round((r.fatigued5minPower! / r.fresh5minPower!) * 100) })),
    [filteredRides]);

  // KPI Metrics
  const progressMetrics = useMemo(() => {
    if (filteredRides.length === 0) return null;
    let recentDays = 30, olderDays = 90;
    if (timeRange === 30) { recentDays = 10; olderDays = 30; }
    else if (timeRange === 365 || timeRange === 'all') { recentDays = 90; olderDays = 365; }
    const now = Date.now();
    const cutoffRecent = now - recentDays * 24 * 3600 * 1000;
    const cutoffOlder  = now - olderDays  * 24 * 3600 * 1000;
    const hrRides    = filteredRides.filter(r => r.hasHR && r.avgHR && r.avgHR > 40);
    const powerRides = filteredRides.filter(r => r.hasPower && r.avgPower);
    const recentHRR  = hrRides.filter(r => r.date >= cutoffRecent && r.hrRecovery60);
    const olderHRR   = hrRides.filter(r => r.date >= cutoffOlder && r.date < cutoffRecent && r.hrRecovery60);
    const avgRecentHRR = recentHRR.length > 0 ? Math.round(recentHRR.reduce((s, r) => s + r.hrRecovery60!, 0) / recentHRR.length) : undefined;
    const avgOlderHRR  = olderHRR.length  > 0 ? Math.round(olderHRR.reduce((s,  r) => s + r.hrRecovery60!, 0) / olderHRR.length)  : undefined;
    const hrrChange    = avgRecentHRR && avgOlderHRR ? avgRecentHRR - avgOlderHRR : 0;
    const fatigueRides = powerRides.filter(r => r.fresh5minPower && r.fatigued5minPower).slice(0, 10);
    const avgRetention = fatigueRides.length > 0 ? Math.round((fatigueRides.reduce((s, r) => s + (r.fatigued5minPower! / r.fresh5minPower!), 0) / fatigueRides.length) * 100) : undefined;
    const recentCC = hrRides.filter(r => r.date >= cutoffRecent && r.cardiacCost);
    const olderCC  = hrRides.filter(r => r.date >= cutoffOlder && r.date < cutoffRecent && r.cardiacCost);
    const avgRecentCC  = recentCC.length > 0 ? parseFloat((recentCC.reduce((s, r) => s + r.cardiacCost!, 0) / recentCC.length).toFixed(4)) : undefined;
    const avgOlderCC   = olderCC.length  > 0 ? parseFloat((olderCC.reduce((s,  r) => s + r.cardiacCost!, 0) / olderCC.length).toFixed(4))  : undefined;
    const ccChangePct  = avgRecentCC && avgOlderCC ? Math.round(((avgRecentCC - avgOlderCC) / avgOlderCC) * 100) : 0;
    return { avgRecentHRR, hrrChange, avgRetention, avgRecentCC, ccChangePct };
  }, [filteredRides, timeRange]);

  // Radar chart data
  const passportData = useMemo(() => {
    if (filteredRides.length === 0) return [];
    const bests = { s5: 0, m1: 0, m5: 0, m20: 0 };
    for (const r of filteredRides) {
      const be = r.bestEfforts; if (!be) continue;
      if (be.s5  && be.s5  > bests.s5)  bests.s5  = be.s5;
      if (be.m1  && be.m1  > bests.m1)  bests.m1  = be.m1;
      if (be.m5  && be.m5  > bests.m5)  bests.m5  = be.m5;
      if (be.m20 && be.m20 > bests.m20) bests.m20 = be.m20;
    }
    const w = profile.weight ?? 75;
    const scale = (val: number, max: number) => Math.min(100, Math.round((val / max) * 100));
    return [
      { subject: 'Sprint (5s)',         A: scale(bests.s5 / w, 20),   fullMark: 100 },
      { subject: 'Anaerobic (1m)',        A: scale(bests.m1 / w, 10),   fullMark: 100 },
      { subject: 'VO2max (5m)',          A: scale(bests.m5 / w, 6.8),  fullMark: 100 },
      { subject: 'Threshold / FTP (20m)',  A: scale(bests.m20 / w, 5.5), fullMark: 100 },
    ];
  }, [filteredRides, profile.weight]);

  const topPRs = useMemo(() => {
    if (!selectedRadarPoint || filteredRides.length === 0) return [];
    return [...filteredRides]
      .filter(r => r.bestEfforts && r.bestEfforts[selectedRadarPoint])
      .sort((a, b) => (b.bestEfforts[selectedRadarPoint] ?? 0) - (a.bestEfforts[selectedRadarPoint] ?? 0))
      .slice(0, 3)
      .map(r => ({
        id: r.id, name: r.name,
        date: new Date(r.date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' }),
        val: r.bestEfforts[selectedRadarPoint]!,
      }));
  }, [filteredRides, selectedRadarPoint]);

  // Neuromusculare efficiëntie
  const scatterData = useMemo(() =>
    filteredRides.filter(r => r.hasHR && r.vam && r.avgHR)
      .map(r => ({ vam: r.vam!, hr: r.avgHR!, name: r.name })).slice(0, 30),
    [filteredRides]);

  const cadenceData = useMemo(() => {
    const cadences = filteredRides.filter(r => r.cadenceEfficiencySweetspot).map(r => r.cadenceEfficiencySweetspot!);
    if (cadences.length === 0) return undefined;
    const counts = new Map<number, number>();
    cadences.forEach(c => counts.set(c, (counts.get(c) ?? 0) + 1));
    let sweetspot = 90, maxCount = 0;
    counts.forEach((count, cad) => { if (count > maxCount) { maxCount = count; sweetspot = cad; } });
    return sweetspot;
  }, [filteredRides]);

  // AI computations
  const aiVO2max = useMemo(() =>
    predictVO2max((profile.ftp ?? 220) * 0.75, 138, 30, profile.weight ?? 75),
    [profile.ftp, profile.weight]);

  const aiFTPForecast = useMemo(() => {
    const ftpHistory = rides.filter(r => r.eFTP && r.eFTP > 0).sort((a, b) => a.date - b.date);
    const lastFTP = ftpHistory.length > 0 ? ftpHistory[ftpHistory.length - 1].eFTP : null;
    const currentFTP = lastFTP ?? profile.ftp ?? 220;
    const nowMs = Date.now();
    const recentCount = rides.filter(r => r.date >= nowMs - 30 * 24 * 3600 * 1000).length;
    const consistency = (recentCount / 30) * 7;
    const estimatedCTL = Math.max(15, Math.round((recentCount * 70) / 30));
    const wHistory = profile.weightHistory || [];
    let weightChange = 0;
    if (wHistory.length >= 2) {
      const latestW = wHistory[0]?.weight ?? profile.weight ?? 75;
      const prevW = wHistory[wHistory.length - 1]?.weight ?? profile.weight ?? 75;
      weightChange = latestW - prevW;
    }
    const targetFTP = predictFutureFTP(currentFTP, estimatedCTL, Math.round(estimatedCTL * 1.1), consistency, estimatedCTL, weightChange);
    const diff = targetFTP - currentFTP;
    const historicData: { label: string; eFTP: number | null; voorspelling: number | null }[] = rides
      .filter(r => r.eFTP && r.eFTP > 0).sort((a, b) => a.date - b.date).slice(-10)
      .map(r => ({ label: new Date(r.date).toLocaleDateString('nl-BE', { month: 'short', day: '2-digit' }), eFTP: r.eFTP!, voorspelling: null }));
    for (let w = 1; w <= 8; w++) {
      historicData.push({ label: `+${w}w`, eFTP: null, voorspelling: Math.max(50, Math.min(600, Math.round(currentFTP + diff * Math.sin((w / 8) * Math.PI / 2)))) });
    }
    if (historicData.length > 8) historicData[historicData.length - 9].voorspelling = historicData[historicData.length - 9].eFTP;
    return { forecastData: historicData, targetFTP, diff, consistency: parseFloat(consistency.toFixed(1)) };
  }, [rides, profile.ftp]);

  const globalBests = useMemo(() => {
    const b = { s5: 0, m1: 0, m5: 0, m20: 0 };
    for (const r of filteredRides) {
      const be = r.bestEfforts; if (!be) continue;
      if (be.s5  && be.s5  > b.s5)  b.s5  = be.s5;
      if (be.m1  && be.m1  > b.m1)  b.m1  = be.m1;
      if (be.m5  && be.m5  > b.m5)  b.m5  = be.m5;
      if (be.m20 && be.m20 > b.m20) b.m20 = be.m20;
    }
    return b;
  }, [filteredRides]);

  const riderType       = useMemo(() => classifyRiderType(globalBests, profile.weight ?? 75), [globalBests, profile.weight]);
  const trainingProfile = useMemo(() => analyzeTrainingProfile(filteredRides), [filteredRides]);

  const lthrDrift = useMemo(() => {
    const longRide = [...filteredRides].filter(r => r.hasHR && r.duration > 3600 && r.avgHR).sort((a, b) => b.date - a.date)[0];
    if (!longRide?.avgHR) return null;
    const avgHR  = longRide.avgHR!;
    const avgPow = longRide.avgPower ?? 0;
    // Approximate first/second half withrics
    const firstHalfPow  = avgPow;
    const secondHalfPow = avgPow * 0.97;
    const firstHalfHR   = avgHR;
    const secondHalfHR  = avgHR * 1.02;
    return analyzeCardiacDrift(firstHalfPow, secondHalfPow, firstHalfHR, secondHalfHR, longRide.duration, profile.lthr ?? 155);
  }, [filteredRides, profile.lthr]);

  // Coach pillars
  const coachAnalysis = useMemo(() => {
    const name = profile.name ?? 'Atleet';
    if (filteredRides.length < 3) return {
      intro: `Hoi ${name}! Upload minimaal 3 rideten om een analyse te ontvangen.`,
      pillars: [
        { title: 'Fitness & Efficiëntie', status: 'Stabiel', statusColor: '#0984e3', desc: 'We withen hoe hard je hart werkt voor je vermogen.', tip: 'Rijd duurrideten op comfortabel tempo.' },
        { title: 'Recoverysnelheid',          status: 'Stabiel', statusColor: '#0984e3', desc: 'Hoe snel daalt je hartslag na inspanning?',        tip: 'Intervallen 30s sprint + 2 min uitrijden.' },
        { title: 'Taaiheid',                 status: 'Stabiel', statusColor: '#0984e3', desc: 'Behoud je piekvermogen tot het einde?',            tip: 'Goed eten (koolhydraten) tijdens lange rideten.' },
      ]
    };
    let effStatus = 'Stabiel', effColor = '#38bdf8', effDesc = 'Stabiele hartslag-vermogen verhouding.';
    if (progressMetrics?.ccChangePct) {
      if (progressMetrics.ccChangePct < 0) { effStatus = 'Verbeterd';     effColor = '#00b894'; effDesc = `Hart is ${Math.abs(progressMetrics.ccChangePct)}% efficiënter.`; }
      if (progressMetrics.ccChangePct > 2) { effStatus = 'Aandachtspunt'; effColor = '#e17055'; effDesc = 'Hart werkt iets harder voor dezelfde inspanning.'; }
    }
    let recStatus = 'Stabiel', recColor = '#38bdf8', recDesc = 'Normale herstelsnelheid.';
    if (progressMetrics?.hrrChange && progressMetrics.hrrChange > 1) { recStatus = 'Verbeterd'; recColor = '#00b894'; recDesc = `+${progressMetrics.hrrChange} bpm sneller hersteld.`; }
    let fatStatus = 'Stabiel', fatColor = '#38bdf8', fatDesc = 'Normaal krachtverloop.';
    if (progressMetrics?.avgRetention) {
      if (progressMetrics.avgRetention > 90) { fatStatus = 'Uitstekend';    fatColor = '#00b894'; fatDesc = `${progressMetrics.avgRetention}% piekbehoud na 1000 kJ!`; }
      if (progressMetrics.avgRetention < 80) { fatStatus = 'Aandachtspunt'; fatColor = '#e17055'; fatDesc = '>20% vermogensverlies bij vermoeidheid.'; }
    }
    let intro = `Hoi ${name}! `;
    if (effStatus === 'Verbeterd' && recStatus === 'Verbeterd') intro += 'Fantastisch: je conditie en herstel verbeteren. Je bent fitter!';
    else if (effStatus === 'Verbeterd') intro += 'Je basisconditie gaat vooruit.';
    else if (recStatus === 'Verbeterd') intro += 'Je herstelvermogen verbetert.';
    else if (effStatus === 'Aandachtspunt') intro += 'Je hart werkt momenteel iets harder — wat extra rust kan helpen.';
    else intro += 'Je basisconditie is stabiel.';
    return {
      intro,
      pillars: [
        { title: 'Fitness & Efficiëntie', status: effStatus, statusColor: effColor, desc: effDesc, tip: 'Langere duurrideten op rustig tempo verbeteren je aerobe basis.' },
        { title: 'Recoverysnelheid',          status: recStatus, statusColor: recColor, desc: recDesc, tip: 'Korte intervallen (30s sprint, 2 min uitbollen).' },
        { title: 'Taaiheid',                 status: fatStatus, statusColor: fatColor, desc: fatDesc, tip: 'Eet voldoende koolhydraten bij rideten langer dan 2 uur.' },
      ]
    };
  }, [filteredRides, progressMetrics, profile.name]);



  const cardBase: React.CSSProperties = {
    borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
    border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)',
  };

  return (
    <div className="pp-main-content">
      {/* Time range selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>Fysiologisch Paspoort</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {([30, 90, 365, 'all'] as const).map(r => (
            <button key={String(r)} onClick={() => handleTimeRangeChange(r)} style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700,
              background: timeRange === r ? 'rgba(203, 213, 225,0.12)' : 'rgba(255,255,255,0.04)',
              color: timeRange === r ? '#cbd5e1' : '#64748b', fontFamily: 'inheride',
            }}>
              {r === 'all' ? 'Alles' : `${r}d`} {!isPro && r !== 30 && '🔒'}
            </button>
          ))}
        </div>
      </div>

      <div className="wd-main-grid">

        {/* == SECTION 1: AI KAARTEN ========================================= */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>

          {/* VO2max */}
          <div style={{ ...cardBase, background: 'linear-gradient(135deg,rgba(203, 213, 225,0.05),rgba(108,92,231,0.02))', border: '1px solid rgba(203, 213, 225,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Brain size={14} color="#cbd5e1" />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>AI VO2max</span>
              </div>
              <span style={{ fontSize: 9, background: 'rgba(203, 213, 225,0.08)', color: '#cbd5e1', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>SUBMAXIMAAL</span>
            </div>
            <div style={{ fontSize: 34, fontWeight: 300, color: '#cbd5e1', lineHeight: 1 }}>
              {aiVO2max} <span style={{ fontSize: 12, color: '#64748b' }}>ml/kg/min</span>
            </div>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              FTP {profile.ftp ?? 220}W, {profile.weight ?? 75}kg.{' '}
              {aiVO2max > 55 ? '🏆 Uitstekend!' : aiVO2max > 45 ? '💪 Bovengemiddeld.' : '🌱 Goede basis.'}
            </p>
          </div>

          {/* Rijderstype */}
          <div style={{ ...cardBase, background: 'linear-gradient(135deg,rgba(108,92,231,0.06),rgba(0,184,148,0.02))', border: '1px solid rgba(108,92,231,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} color="#6c5ce7" />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>AI Rijderstype</span>
              </div>
              <span style={{ fontSize: 9, background: 'rgba(108,92,231,0.1)', color: '#a29bfe', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{Math.round(riderType.confidence * 100)}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 26 }}>{riderType.emoji}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#6c5ce7' }}>{riderType.type}</div>
                <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                  {riderType.strengths.map(s => (
                    <span key={s} style={{ fontSize: 8, fontWeight: 700, background: 'rgba(108,92,231,0.12)', color: '#a29bfe', padding: '1px 5px', borderRadius: 3 }}>{s}</span>
                  ))}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>{riderType.description}</p>
            <div style={{ padding: '5px 8px', background: 'rgba(108,92,231,0.08)', borderRadius: 6, fontSize: 9, color: '#a29bfe', borderLeft: '2px solid #6c5ce7' }}>
              {riderType.focusTip}
            </div>
          </div>

          {/* Trainersprofiel */}
          <div style={{ ...cardBase, background: 'linear-gradient(135deg,rgba(0,184,148,0.05),rgba(203, 213, 225,0.01))', border: '1px solid rgba(0,184,148,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={14} color="#00b894" />
              <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>AI Trainersprofiel</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 26 }}>{trainingProfile.emoji}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#00b894' }}>{trainingProfile.profile}</div>
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                  {trainingProfile.avgWeeklyHours > 0 ? `${trainingProfile.avgWeeklyHours}u/week - IF ${trainingProfile.avgIntensityFactor}` : 'Onvoldoende data'}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>{trainingProfile.description}</p>
            <div style={{ padding: '5px 8px', background: 'rgba(0,184,148,0.08)', borderRadius: 6, fontSize: 9, color: '#55efc4', borderLeft: '2px solid #00b894' }}>
              {trainingProfile.tip}
            </div>
          </div>

          {/* LTHR Drift */}
          <div style={{ ...cardBase, background: 'linear-gradient(135deg,rgba(255,118,117,0.04),rgba(253,203,110,0.01))', border: '1px solid rgba(255,118,117,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Heart size={14} color="#ff7675" />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>AI LTHR Analysis</span>
              </div>
              {lthrDrift?.proposeTuning && (
                <span style={{ fontSize: 9, background: 'rgba(253,203,110,0.12)', color: '#fdcb6e', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>UPDATE</span>
              )}
            </div>
            {lthrDrift ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 300, color: '#ff7675' }}>{profile.lthr ?? 155} <span style={{ fontSize: 10, color: '#64748b' }}>bpm</span></div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>Huidige LTHR</div>
                  </div>
                  {lthrDrift.proposeTuning && (
                    <>
                      <span style={{ color: '#64748b' }}>to</span>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 300, color: '#fdcb6e' }}>{lthrDrift.proposedLthr} <span style={{ fontSize: 10, color: '#64748b' }}>bpm</span></div>
                        <div style={{ fontSize: 9, color: '#64748b' }}>Voorgesteld</div>
                      </div>
                    </>
                  )}
                </div>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                  Drift: {lthrDrift.decoupling.toFixed(1)}%.{' '}
                  {lthrDrift.decoupling < 3.5
                    ? 'Uitstekende aerobe efficiëntie.'
                    : lthrDrift.decoupling < 8.0
                      ? 'Lichte drift - normaal bij langere rideten.'
                      : 'Hoge drift - meer Zone 2 trainen.'}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 10, color: '#64748b', margin: '4px 0 0', lineHeight: 1.5 }}>
                Upload HR-rideten langer dan 1 uur voor LTHR drift analyse.
              </p>
            )}
          </div>
        </div>

        {/* == SECTION 2: AI eFTP PROGNOSE =================================== */}
        {aiFTPForecast.forecastData.filter(d => d.eFTP !== null).length >= 2 && (
          <div className="wd-section-card animate-slide-up">
            <div className="wd-section-card__head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Brain size={14} color="#cbd5e1" />
                <span className="wd-section-card__title">AI eFTP Prognose — Volgende 8 Weken</span>
              </div>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                Doel: <strong style={{ color: '#cbd5e1' }}>{aiFTPForecast.targetFTP}W</strong>{' '}
                ({aiFTPForecast.diff >= 0 ? '+' : ''}{aiFTPForecast.diff}W - {aiFTPForecast.consistency} workouts/week)
              </span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={aiFTPForecast.forecastData} margin={{ top: 4, right: 10, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#64748b' }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8, fill: '#64748b' }} unit="W" />
                <Tooltip contentStyle={{ background: '#12121e', border: 'none', borderRadius: 8, fontSize: 10 }}
                  formatter={(v: any, n: any) => [`${v}W`, n === 'eFTP' ? 'Gerealiseerd' : 'Voorspeld']} />
                <Line type="monotone" dataKey="eFTP" stroke="#6c5ce7" strokeWidth={2} dot={{ fill: '#6c5ce7', r: 2 }} connectNulls />
                <Line type="monotone" dataKey="voorspelling" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="4 4" dot={{ fill: '#cbd5e1', r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* == SECTION 3: COACH PILLAREN ===================================== */}
        <section className="pp-coach-card animate-slide-up">
          <div className="pp-coach-card__head">
            <span className="pp-coach-card__title">Fysiologische Ontwikkeling</span>
          </div>
          <p className="pp-coach-card__body" style={{ marginBottom: 16 }}>{coachAnalysis.intro}</p>
          <div className="pp-coach-pillars">
            {coachAnalysis.pillars.map((p, idx) => (
              <div
                key={idx}
                className={`pp-coach-pillar pp-coach-pillar--interactive${activePillar === idx ? ' pp-coach-pillar--active' : ''}`}
                onClick={() => setActivePillar(activePillar === idx ? null : idx)}
              >
                <div className="pp-coach-pillar__head">
                  <h4>{p.title}</h4>
                  <span className="pp-coach-pillar__status" style={{ background: `${p.statusColor}15`, color: p.statusColor, border: `1px solid ${p.statusColor}30` }}>
                    {p.status}
                  </span>
                </div>
                <p className="pp-coach-pillar__desc">{p.desc}</p>
                <div className="pp-coach-pillar__tip">
                  <span className="pp-coach-pillar__tip-lbl">Tip: </span>
                  <span className="pp-coach-pillar__tip-val">{p.tip}</span>
                </div>
                {activePillar === idx && (
                  <div
                    className="pp-pillar-trend animate-slide-up"
                    style={{ marginTop: 10, height: 100 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={idx === 0 ? efficiencyTrend : idx === 1 ? recoveryTrend : toughnessTrend}
                        margin={{ top: 4, right: 10, left: -26, bottom: 0 }}
                      >
                        <CartesianGrid stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 8 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 8 }} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ background: '#0d0d1a', border: 'none', borderRadius: 6, fontSize: 10 }} />
                        <Line type="monotone" dataKey="val" stroke={p.statusColor} strokeWidth={2} dot={{ fill: p.statusColor, r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                    <span style={{ display: 'block', fontSize: 9, color: '#64748b', marginTop: 3, textAlign: 'center' }}>
                      {idx === 0 ? 'Cardiac Cost (b/m) - lower is better' : idx === 1 ? 'HR Recovery 60s (bpm) - higher is better' : 'Stamina after 1000 kJ (%) - higher is better'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* KPI kaarten */}
        {progressMetrics && (
          <div className="wd-dashboard-grid animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <div className="wd-kpi" style={{ borderLeftColor: '#cbd5e1' }}>
              <div className="wd-kpi__header">
                <span className="wd-kpi__lbl">Heart Rate Recovery (HRR)</span>
                <Heart size={13} style={{ color: '#cbd5e1' }} />
              </div>
              <span className="wd-kpi__val">{progressMetrics.avgRecentHRR ?? '--'} bpm</span>
              <span className="wd-kpi__trend" style={{ color: progressMetrics.hrrChange >= 0 ? '#cbd5e1' : '#ff7675' }}>
                {progressMetrics.hrrChange >= 0 ? 'Stijging' : 'Descent'} {Math.abs(progressMetrics.hrrChange)} bpm
              </span>
            </div>
            <div className="wd-kpi" style={{ borderLeftColor: '#6c5ce7' }}>
              <div className="wd-kpi__header">
                <span className="wd-kpi__lbl">Vermoeidheidsresistentie</span>
                <Award size={13} style={{ color: '#6c5ce7' }} />
              </div>
              <span className="wd-kpi__val">{progressMetrics.avgRetention ?? '--'}% behoud</span>
              <span className="wd-kpi__trend" style={{ color: '#6c5ce7' }}>Beste 5m na 1000 kJ</span>
            </div>
            <div className="wd-kpi" style={{ borderLeftColor: '#00b894' }}>
              <div className="wd-kpi__header">
                <span className="wd-kpi__lbl">Cardiac Cost</span>
                <Activity size={13} style={{ color: '#00b894' }} />
              </div>
              <span className="wd-kpi__val">{progressMetrics.avgRecentCC ? progressMetrics.avgRecentCC.toFixed(3) : '--'} b/m</span>
              <span className="wd-kpi__trend" style={{ color: progressMetrics.ccChangePct <= 0 ? '#cbd5e1' : '#ff7675' }}>
                {progressMetrics.ccChangePct <= 0 ? 'Descent' : 'Stijging'} {Math.abs(progressMetrics.ccChangePct)}%
              </span>
            </div>
          </div>
        )}

        {/* == SECTION 4: RADAR + NEUROMUSCULAIR ============================ */}
        <div className="wd-charts-row animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="wd-section-card">
            <div className="wd-section-card__head">
              <span className="wd-section-card__title">Powersprofiel Radar</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              {passportData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={passportData}>
                    <PolarGrid stroke="rgba(255,255,255,0.05)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 9 }} />
                    <PolarRadiusAxis tick={{ fill: '#64748b', fontSize: 8 }} angle={30} domain={[0, 100]} />
                    <Radar name="Profiel" dataKey="A" stroke="#cbd5e1" fill="#cbd5e1" fillOpacity={0.15} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#64748b', fontSize: 12 }}>Upload rides with power data for the radar profile.</p>
              )}
            </div>
            <div className="pp-radar-controls">
              {(['s5', 'm1', 'm5', 'm20'] as const).map((key, i) => (
                <button
                  key={key} type="button"
                  className={`pp-radar-btn${selectedRadarPoint === key ? ' active' : ''}`}
                  onClick={() => setSelectedRadarPoint(selectedRadarPoint === key ? null : key)}
                >
                  {['5s Sprint', '1m Anaerobic', '5m VO2max', '20m Threshold'][i]}
                </button>
              ))}
            </div>
            {selectedRadarPoint && (
              <div className="pp-pr-list animate-slide-up">
                <h4>Top 3 PR Waarden</h4>
                {topPRs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
                    {topPRs.map((pr, idx) => (
                      <div key={pr.id} className="pp-pr-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`pp-pr-badge pp-pr-badge--${idx + 1}`}>#{idx + 1}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#f8fafc' }}>{pr.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 10, color: '#64748b' }}>{pr.date}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1' }}>{pr.val} W</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#64748b', fontSize: 11, margin: '6px 0 0', textAlign: 'center' }}>Geen PR data gevonden.</p>
                )}
              </div>
            )}
          </div>

          {/* Neuromusculare efficiëntie */}
          <div className="wd-section-card">
            <div className="wd-section-card__head">
              <span className="wd-section-card__title">Neuromusculare Efficiëntie</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', height: 200, justifyContent: 'center' }}>
              {cadenceData ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 44, fontWeight: 300, color: '#cbd5e1' }}>
                    {cadenceData} <span style={{ fontSize: 18 }}>RPM</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>Optimale cadans sweetspot</div>
                  <p style={{ fontSize: 11, color: '#cbd5e1', maxWidth: 260, margin: '6px auto 0', lineHeight: 1.4 }}>
                    At {cadenceData} RPM you deliver highest power at lowest heart rate cost.
                  </p>
                </div>
              ) : scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" />
                    <XAxis type="number" dataKey="hr" name="Heart Rate" unit=" bpm" tick={{ fill: '#64748b', fontSize: 9 }} />
                    <YAxis type="number" dataKey="vam" name="VAM" unit=" m/h" tick={{ fill: '#64748b', fontSize: 9 }} />
                    <Tooltip contentStyle={{ background: '#0d0d1a', border: 'none', fontSize: 10 }} />
                    <Scatter name="Klimmen" data={scatterData} fill="#00b894" />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center' }}>
                  Upload rides with HR and elevation for efficiency tracking.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* == SECTION 5: PACING & RACE PREDICTOR =========================== */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}
          className="animate-slide-up"
        >
          <PacingScatterPlot rides={filteredRides} />
          <RacePredictor ftp={profile.ftp} weight={profile.weight} rides={filteredRides} />
        </div>

      </div>
    </div>
  );
};
