import React, { useState } from 'react';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line } from 'recharts';
import { ZENITH_CHART_GRID, ZENITH_CHART_AXIS_TICK, ZENITH_CHART_TOOLTIP_STYLE, ZENITH_CHART_TOOLTIP_LABEL_STYLE } from '@zenith/shared';
import { Brain, Activity, TrendingUp, Mountain, Trophy, Zap } from 'lucide-react';
import { ZenithEmptyState } from '@zenith/shared';
import PowerDurationCurve from '../PowerDurationCurve';
import { FitnessProfile, SPEED_EFFORT_DURATIONS, RideSummaryWithBests } from '../../types/workout';
import { predictFutureFTP, estimateVO2max } from '../../utils/localNeuralNet';
import { CriticalPowerCurve } from '../workout/CriticalPowerCurve';
import { PhenotypeProfile } from '../workout/PhenotypeProfile';
import { PowerProfileTable } from '../workout/PowerProfileTable';
import { ClimbsLeaderboard } from '../workout/ClimbsLeaderboard';
import { EFtpProgression } from '../workout/EFtpProgression';

interface PRSectionProps {
  profile: FitnessProfile;
  globaleFTP: number;
  globalPowerBests: Record<string, number> | null;
  last90PowerBests: Record<string, number> | null;
  globalSpeedBests: Record<string, number> | null;
  last90SpeedBests: Record<string, number> | null;
  hasAnyPower: boolean;
  eFTPData: Array<{ date: string; eFTP: number | null }>;
  rides: RideSummaryWithBests[];
}

export const PRSection: React.FC<PRSectionProps> = ({
  profile,
  globaleFTP,
  globalPowerBests,
  last90PowerBests,
  globalSpeedBests,
  last90SpeedBests,
  hasAnyPower,
  eFTPData,
  rides,
}) => {
  const [activeTab, setActiveTab] = useState<'fitness' | 'power' | 'climbs'>('fitness');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      {/* Premium Tab Buttons */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid rgba(255,255,255,0.05)', 
        padding: '6px', 
        borderRadius: '14px', 
        width: 'fit-content',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)'
      }}>
        <button
          onClick={() => setActiveTab('fitness')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid ' + (activeTab === 'fitness' ? 'rgba(255, 255, 255, 0.25)' : 'transparent'),
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.2s',
            background: activeTab === 'fitness' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'fitness' ? '#fff' : '#64748b'
          }}
        >
          <TrendingUp size={16} />
          Fitness Trend
        </button>
        <button
          onClick={() => setActiveTab('power')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid ' + (activeTab === 'power' ? 'rgba(255, 255, 255, 0.25)' : 'transparent'),
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.2s',
            background: activeTab === 'power' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'power' ? '#fff' : '#64748b'
          }}
        >
          <Activity size={16} />
          Power Profile
        </button>
        <button
          onClick={() => setActiveTab('climbs')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid ' + (activeTab === 'climbs' ? 'rgba(255, 255, 255, 0.25)' : 'transparent'),
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.2s',
            background: activeTab === 'climbs' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'climbs' ? '#fff' : '#64748b'
          }}
        >
          <Mountain size={16} />
          Climbs Leaderboard
        </button>
      </div>

      {activeTab === 'fitness' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr', gap: '22px', alignItems: 'start', width: '100%' }}>
          {/* Left: eFTP Predictions */}
          <div>
            {hasAnyPower && eFTPData.length > 2 ? (
              <div className="wd-section-card" style={{ margin: 0 }}>
                <div className="wd-section-card__head">
                  <span className="wd-section-card__title">
                    <Brain size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:5, color:'#cbd5e1' }} />
                    eFTP Forecast (Next 8 weeks)
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)' }}>
                    Self-learning model &middot; linear trend to target
                  </span>
                </div>
                
                {(() => {
                  const ftpHistory = eFTPData.map((d: any) => d.eFTP).filter((v: number | null): v is number => v !== null);
                  if (ftpHistory.length < 2) return null;

                  const lastFTP = ftpHistory[ftpHistory.length - 1];
                  const currentFtpVal = lastFTP ?? profile.ftp ?? 220;

                  const nowMs = Date.now();
                  const thirtyDaysAgo = nowMs - 30 * 24 * 3600 * 1000;
                  const recentRidesCount = rides.filter(r => r.date >= thirtyDaysAgo).length;
                  const consistency = (recentRidesCount / 30) * 7;
                  const estimatedCTL = Math.max(15, Math.round((recentRidesCount * 70) / 30));
                  const estimatedATL = Math.round(estimatedCTL * 1.1);

                  const wHistory = profile.weightHistory || [];
                  let weightChange = 0;
                  if (wHistory.length >= 2) {
                    const latestW = wHistory[0]?.weight ?? profile.weight ?? 75;
                    const prevW = wHistory[wHistory.length - 1]?.weight ?? profile.weight ?? 75;
                    weightChange = latestW - prevW;
                  }

                  const targetFTP = predictFutureFTP(currentFtpVal, estimatedCTL, estimatedATL, consistency, estimatedCTL, weightChange);
                  const ftpDiff = targetFTP - currentFtpVal;
                  
                  const forecastData = eFTPData.map((d: any) => ({
                    label: d.date,
                    eFTP: d.eFTP,
                    voorspelling: null as number | null,
                  }));
                  
                  // The model only produces a single 8-week-out target number (targetFTP) —
                  // it has no opinion on the shape of the path to get there. A sine ease
                  // made the intermediate weeks look like an organic, independently-derived
                  // trajectory when they weren't. Use a plain linear interpolation instead:
                  // still just an eyeballed path between two known points, but it no longer
                  // pretends to be more than that.
                  for (let w = 1; w <= 8; w++) {
                    const progressRatio = w / 8;
                    const predicted = Math.round(currentFtpVal + ftpDiff * progressRatio);
                    forecastData.push({
                      label: `Week +${w}`,
                      eFTP: null,
                      voorspelling: Math.max(50, Math.min(600, predicted)),
                    });
                  }

                  if (forecastData.length > 8) {
                    const transitionIndex = forecastData.length - 9;
                    forecastData[transitionIndex].voorspelling = forecastData[transitionIndex].eFTP;
                  }

                  const finalPredicted = forecastData[forecastData.length - 1].voorspelling;

                  return (
                    <div>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.4 }}>
                        Our offline neural network predicts your functional threshold power (eFTP) will reach 
                        <strong style={{ color: '#cbd5e1', marginLeft: 4 }}>
                          {finalPredicted} Watt
                        </strong> (a change of {ftpDiff >= 0 ? '+' : ''}{Math.round((ftpDiff / currentFtpVal) * 100)}%), 
                        based on your weekly consistency of <strong>{consistency.toFixed(1)} workouts/week</strong>.
                      </p>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={forecastData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid {...ZENITH_CHART_GRID} />
                          <XAxis dataKey="label" tick={ZENITH_CHART_AXIS_TICK} />
                          <YAxis domain={['auto', 'auto']} tick={ZENITH_CHART_AXIS_TICK} unit="W" />
                          <Tooltip
                            contentStyle={ZENITH_CHART_TOOLTIP_STYLE}
                            labelStyle={ZENITH_CHART_TOOLTIP_LABEL_STYLE}
                            formatter={(v: any, name: any) => [
                              `${v} W`,
                              name === 'eFTP' ? 'Actual eFTP' : 'Predicted eFTP'
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey="eFTP"
                            stroke="#6c5ce7"
                            strokeWidth={2}
                            dot={{ fill: '#6c5ce7', r: 3 }}
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey="voorspelling"
                            stroke="#38bdf8"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={{ fill: '#38bdf8', r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="wd-section-card" style={{ padding: 8 }}>
                <ZenithEmptyState
                  icon={<Zap size={20} strokeWidth={1.8} />}
                  title="Not enough power data yet"
                  message="Log a few more rides with a power meter to unlock the eFTP forecast."
                />
              </div>
            )}
          </div>

          {/* Right: AI VO2max & PRs list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* VO2max estimate card */}
            {(() => {
              const weightVal = profile.weight ?? 75;
              // Use the rider's real best 5-minute power effort (recent form preferred,
              // falling back to all-time) rather than a hardcoded/derived HR & FTP guess.
              const best5MinPower = last90PowerBests?.m5 || globalPowerBests?.m5 || 0;
              const estimatedVO2 = estimateVO2max(best5MinPower, weightVal);

              if (best5MinPower <= 0) return null;

              return (
                <div className="wd-section-card" style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(108, 92, 231, 0.01))',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '16px',
                  margin: 0
                }}>
                  <div className="wd-section-card__head" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <Activity size={14} color="#cbd5e1" />
                    <span className="wd-section-card__title" style={{ fontSize: 11 }}>VO2max Estimate</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    <div style={{ fontSize: '24px', fontWeight: 300, color: '#cbd5e1', lineHeight: 1 }}>
                      {estimatedVO2} <span style={{ fontSize: '10px', color: '#64748b' }}>ml/kg/min</span>
                    </div>
                    <span style={{ fontSize: 10, color: '#cbd5e1', lineHeight: 1.4, marginTop: 4 }}>
                      Estimated from the ACSM formula (10.8 &times; W/kg + 7) using your best 5-minute power of {best5MinPower}W and weight of {weightVal}kg.
                      {estimatedVO2 > 50
                        ? " Your aerobic fitness is outstanding (elite) for endurance sports!"
                        : estimatedVO2 > 40
                          ? " Your fitness is above average. Keep training consistently."
                          : " Good foundation. Focus on longer endurance rides to expand aerobic capacity."}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Speeds PRs card */}
            {globalSpeedBests && (
              <div className="wd-section-card" style={{ margin: 0 }}>
                <div className="wd-section-card__head">
                  <span className="wd-section-card__title" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Trophy size={12} /> Speed PRs
                  </span>
                </div>
                <div className="wd-bests-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {SPEED_EFFORT_DURATIONS.map(({ key, label }) => {
                    const val = (globalSpeedBests as any)[key];
                    return val ? (
                      <div className="wd-best-item" key={key} style={{ background: 'rgba(255,255,255,0.01)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className="wd-best-dur" style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>{label}</span>
                        <span className="wd-best-val" style={{ fontSize: '16px', fontWeight: 300, color: 'var(--color-primary, #cbd5e1)' }}>{val} km/h</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <EFtpProgression rides={rides} weight={profile.weight} />
        </>
      )}


      {activeTab === 'power' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr', gap: '22px', alignItems: 'start', width: '100%' }}>
          {/* Left: Curves */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <CriticalPowerCurve rides={rides} weight={profile.weight} />
            <PowerDurationCurve
              allTimePower={globalPowerBests ?? {}}
              last90Power={last90PowerBests ?? {}}
              allTimeSpeed={globalSpeedBests ?? {}}
              last90Speed={last90SpeedBests ?? {}}
              ftp={profile.ftp ?? globaleFTP}
              weight={profile.weight}
              hasPower={hasAnyPower}
            />
          </div>

          {/* Right: Coggan profiles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <PhenotypeProfile rides={rides} weight={profile.weight} gender={profile.gender === 'female' ? 'female' : 'male'} />
            <PowerProfileTable rides={rides} weight={profile.weight} />
          </div>
        </div>
      )}

      {activeTab === 'climbs' && (
        <div style={{ width: '100%' }}>
          <ClimbsLeaderboard rides={rides} />
        </div>
      )}
    </div>
  );
};
