import React, { useState } from 'react';
import { Sparkles, Clipboard, AlertTriangle } from 'lucide-react';
import '../workout/CoachPanel.css';
import { FitnessProfile, RideSummaryWithBests } from '../../types/workout';

interface AIReportGeneratorProps {
  rides: RideSummaryWithBests[];
  profile: FitnessProfile;
  selectedPeriod: 30 | 90 | 365 | 'all';
  setSelectedPeriod: (period: 30 | 90 | 365 | 'all') => void;
}

export const AIReportGenerator: React.FC<AIReportGeneratorProps> = ({
  rides,
  profile,
  selectedPeriod,
  setSelectedPeriod,
}) => {
  const [reportLoading, setReportLoading] = useState(false);
  const [reportLoadingStep, setReportLoadingStep] = useState('');
  const [reportData, setReportData] = useState<any>(null);
  const [reportActiveTab, setReportActiveTab] = useState<'summary' | 'progress' | 'werkpunten' | 'risico' | 'actieplan'>('summary');
  const [copySuccess, setCopySuccess] = useState(false);

  const loadLocalLog = (): any[] => {
    try {
      const raw = localStorage.getItem('cyclo_workout_log');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const handleGenerateReport = () => {
    setReportLoading(true);
    setReportLoadingStep('Gegevens verzamelen...');

    setTimeout(() => {
      setReportLoadingStep('Fysiologische parawithers analyseren...');

      setTimeout(() => {
        setReportLoadingStep('Thresholdprogressie & hartslagstabiliteit vergelijken...');

        setTimeout(() => {
          setReportLoadingStep('Rapport samenstellen...');

          setTimeout(() => {
            const nowMs = Date.now();
            const rangeDays = selectedPeriod === 'all' ? Infinity : selectedPeriod;
            const cutoffMs = nowMs - rangeDays * 24 * 3600 * 1000;

            const periodRides = rides.filter((r) => r.date >= cutoffMs);
            const totalRides = periodRides.length;

            if (totalRides === 0) {
              setReportData({ empty: true });
              setReportLoading(false);
              return;
            }

            const totalKm = Math.round(periodRides.reduce((sum, r) => sum + r.distance, 0));
            const totalSeconds = periodRides.reduce((sum, r) => sum + r.duration, 0);
            const totalHours = Math.round(totalSeconds / 3600);
            const avgSpeed = parseFloat((periodRides.reduce((sum, r) => sum + r.avgSpeed, 0) / totalRides).toFixed(1));

            const sortedRides = [...periodRides].sort((a, b) => a.date - b.date);
            const eftpRides = sortedRides.filter((r) => r.eFTP && r.eFTP > 0);

            let startFtp = profile.ftp ?? 220;
            let endFtp = profile.ftp ?? 220;
            let ftpDiff = 0;

            if (eftpRides.length >= 1) {
              startFtp = Math.round(eftpRides[0].eFTP!);
              endFtp = Math.round(eftpRides[eftpRides.length - 1].eFTP!);
              ftpDiff = endFtp - startFtp;
            }

            const decouplingRides = periodRides.filter((r) => r.decoupling != null);
            const avgDecoupling =
              decouplingRides.length > 0
                ? periodRides.filter((r) => r.decoupling != null).reduce((sum, r) => sum + r.decoupling!, 0) / decouplingRides.length
                : 0;

            const viRides = periodRides.filter((r) => (r as any).variabilityIndex != null);
            const avgVI = viRides.length > 0 ? viRides.reduce((sum, r) => sum + (r as any).variabilityIndex, 0) / viRides.length : 1.05;

            const localLog = loadLocalLog();
            const logEntries = localLog.filter((e) => {
              const eMs = new Date(e.date).getTime();
              return eMs >= cutoffMs;
            });

            const rpeValues = [
              ...periodRides.filter((r) => (r as any).rpe != null).map((r) => (r as any).rpe),
              ...logEntries.map((e) => e.rpe),
            ];
            const avgRpe = rpeValues.length > 0 ? rpeValues.reduce((sum, v) => sum + v, 0) / rpeValues.length : 5.5;

            const activeWeeks = new Set(
              periodRides.map((r) => {
                const d = new Date(r.date);
                const oneJan = new Date(d.getFullYear(), 0, 1);
                const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
                return `${d.getFullYear()}-w${Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7)}`;
              })
            ).size;

            const longestRide = [...periodRides].sort((a, b) => b.distance - a.distance)[0];
            const longestRideStr = longestRide
              ? `${longestRide.distance.toFixed(0)} km (${(longestRide.duration / 3600).toFixed(1)} uur) op ${new Date(longestRide.date).toLocaleDateString('nl-BE')}`
              : 'Geen rideten geregistreerd';

            let verdict = 'Stable physical condition and maintenance';
            let verdictEmoji = '📈';
            let verdictColor = '#cbd5e1';

            if (ftpDiff > 5) {
              verdict = 'Significante toename in drempelvermogen';
              verdictColor = '#ffffff';
            } else if (totalRides >= 12 && avgRpe < 6 && avgDecoupling < 4) {
              verdict = 'Verbeterde aerobe capaciteit en vetverbranding';
              verdictColor = '#cbd5e1';
            } else if (avgRpe >= 7) {
              verdict = 'Verhoogde trainingsstress en cumulatieve vermoeidheid';
              verdictColor = '#ff7675';
            }

            const progressBullets = [
              ftpDiff > 0
                ? `**Significant increase in threshold power (eFTP)**: Your estimated threshold power (eFTP) increased during this period by **+${ftpDiff}W** (van ${startFtp}W naar ${endFtp}W). Deze vooruitgang toont aan dat de opgediende prikkels succesvol hebben geleid tot spieradaptatie en een verhoogde lactaattolerantie.`
                : `**Threshold Power Sustained**: Your estimated threshold power (eFTP) remained stable around **${endFtp}W**. Dit is een uitstekend resultaat dat getuigt van een goed uitgebalanceerde onderhoudstraining.`,
              avgDecoupling < 5
                ? `**Outstanding aerobic and cardiovascular efficiency**: With an average heart rate drift (aerobic decoupling) of only **${avgDecoupling.toFixed(1)}%** blijft je cardiovasculaire systeem stabiel bij langdurige inspanningen.`
                : `**Cardiovascular drift during prolonged effort**: Your heart rate drift increases on average by **${avgDecoupling.toFixed(1)}%** in de tweede helft van je rideten bij gelijkblijvend vermogen.`,
              `**Endurance Baseline Foundation**: Your longest ride was **${longestRideStr}**. Such rides are crucial for building capillary density of your muscles.`,
            ];

            const werkpuntenBullets = [
              avgRpe >= 7
                ? `**Intensity Distribution & Muscle Stress**: Your average RPE is **${avgRpe.toFixed(1)}/10**. Wij adviseren om 80% van de rideten strikt in Zone 2 te rijden.`
                : `**Healthy Intensity Distribution**: Your average RPE of **${avgRpe.toFixed(1)}/10** demonstrates excellent training polarization.`,
              avgDecoupling >= 5
                ? `**Focus on Zone 2 Endurance Training**: The observed heart rate drift of **${avgDecoupling.toFixed(1)}%** requires specific attention.`
                : `**Stable Aerobic Power**: Since your decoupling is minimal, you can target tempo sustained efforts and VO2max.`,
              avgVI > 1.1
                ? `**Even Power Distribution (Pacing)**: With an average Variability Index of **${avgVI.toFixed(2)}** your pacing is irregular.`
                : `**Excellent Pacing Strategy**: With an average Variability Index of **${avgVI.toFixed(2)}** you distribute your power efficiently.`,
            ];

            const risicoBullets = [
              avgRpe > 7.5
                ? `**High Risk of Overtraining**: De trainingsprikkels stapelen zich sneller op dan je lichaam kan herstellen. Schedule a recovery week immediately.`
                : `**Balanced Workload Risk**: Your training workload and recovery weeks are in optimal balance.`,
              decouplingRides.length > 5 && avgDecoupling > 6
                ? `**Progressive Fatigue Risk**: Significant cardiac drift across multiple rides indicates cumulative recovery deficit.`
                : `**Stable Cardiovascular Tolerance**: Your responses show no signs of chronic fatigue or overtraining.`,
            ];

            const actieplanBullets = [
              `**Week 1 (Volume & Recovery)**: Focus volledig op aerobe basis in Zone 2.`,
              ftpDiff > 0
                ? `**Week 2 (Gerichte Intensiteit)**: Voeg één specifieke drempeltraining toe (bijv. 2x12 min op 95% FTP).`
                : `**Week 3 (Tempohardheid)**: Voeg twee kortere tempoblokken toe (bijv. 3x8 min in Zone 3 tempo op 85% FTP).`,
              `**Week 4 (Supercompensatie/De-load)**: Halveer je wekelijkse trainingsvolume om je lichaam te laten supercompenseren.`,
            ];

            setReportData({
              empty: false,
              selectedPeriod,
              verdict,
              verdictEmoji,
              verdictColor,
              totalKm,
              totalHours,
              avgSpeed,
              totalRides,
              avgRpe,
              activeWeeks,
              progressBullets,
              werkpuntenBullets,
              risicoBullets,
              actieplanBullets,
            });
            setReportLoading(false);
          }, 400);
        }, 400);
      }, 400);
    }, 400);
  };

  const handleCopyReport = () => {
    if (!reportData || reportData.empty) return;
    const plainText = `VOORTGANGSRAPPORT (Afgelopen ${selectedPeriod} Dagen)
Verdict: ${reportData.verdict}
Total: ${reportData.totalKm} km | ${reportData.totalHours} uur | ${reportData.totalRides} rideten

PROGRESSIE & STERKE PUNTEN:
${reportData.progressBullets.map((b: string) => '- ' + b.replace(/\*\*/g, '')).join('\n')}

WERKPUNTEN & FOCUS:
${reportData.werkpuntenBullets.map((b: string) => '- ' + b.replace(/\*\*/g, '')).join('\n')}

ACTION PLAN FOR COMING WEEKS:
${reportData.actieplanBullets.map((b: string) => '- ' + b.replace(/\*\*/g, '')).join('\n')}
`;
    navigator.clipboard.writeText(plainText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="progress-ai-report-card">
      <div className="progress-ai-report-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="progress-ai-report-icon-badge">
            <Sparkles size={18} color="#cbd5e1" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>AI Voortgangsrapport Generator</h3>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>
              Automated physiological analysis of your performance & recovery
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="progress-period-selector">
            {(
              [
                { label: '30 Dagen', val: 30 },
                { label: '90 Dagen', val: 90 },
                { label: '365 Dagen', val: 365 },
                { label: 'Alles', val: 'all' },
              ] as const
            ).map((item) => (
              <button
                key={item.val}
                className={`progress-period-btn ${selectedPeriod === item.val ? 'active' : ''}`}
                onClick={() => setSelectedPeriod(item.val)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button className="progress-ai-generate-btn" onClick={handleGenerateReport} disabled={reportLoading}>
            {reportLoading ? (
              <>
                <span className="progress-spinner" /> Generating...
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generate Report
              </>
            )}
          </button>
        </div>
      </div>

      {reportLoading && (
        <div className="progress-ai-loading-container">
          <div className="progress-ai-loading-bar-track">
            <div className="progress-ai-loading-bar-fill" />
          </div>
          <p className="progress-ai-loading-step-text">{reportLoadingStep}</p>
        </div>
      )}

      {reportData && !reportLoading && (
        <div className="progress-ai-result-box">
          {reportData.empty ? (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <AlertTriangle size={32} color="#ff7675" style={{ marginBottom: 10 }} />
              <h4 style={{ margin: '0 0 6px', color: '#f8fafc' }}>Geen rideten gevonden in deze periode</h4>
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Select a longer timeframe or upload more rides.</p>
            </div>
          ) : (
            <>
              <div className="progress-ai-verdict-banner">
                <div className="progress-ai-verdict-left">
                  <span className="progress-ai-verdict-emoji">{reportData.verdictEmoji}</span>
                  <div>
                    <span className="progress-ai-verdict-tag">Totaal oordeel</span>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: reportData.verdictColor }}>{reportData.verdict}</h4>
                  </div>
                </div>

                <div className="progress-ai-actions-row">
                  <button className="progress-ai-action-btn" onClick={handleCopyReport}>
                    <Clipboard size={13} /> {copySuccess ? 'Gekopieerd!' : 'Kopieer'}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="progress-ai-tabs-header">
                {(
                  [
                    { id: 'summary', label: '📊 Samenvatting' },
                    { id: 'progress', label: '🚀 Progressie' },
                    { id: 'werkpunten', label: '🎯 Focuspunten' },
                    { id: 'risico', label: '⚠️ Risicoanalyse' },
                    { id: 'actieplan', label: '🗓️ Actieplan' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    className={`progress-ai-tab-btn ${reportActiveTab === tab.id ? 'active' : ''}`}
                    onClick={() => setReportActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="progress-ai-tab-content">
                {reportActiveTab === 'summary' && (
                  <div className="progress-ai-summary-grid">
                    <div className="progress-ai-summary-card">
                      <span className="label">Totale Distance</span>
                      <span className="value">{reportData.totalKm} km</span>
                    </div>
                    <div className="progress-ai-summary-card">
                      <span className="label">Totale Uren</span>
                      <span className="value">{reportData.totalHours} uur</span>
                    </div>
                    <div className="progress-ai-summary-card">
                      <span className="label">Aantal Rides</span>
                      <span className="value">{reportData.totalRides}</span>
                    </div>
                    <div className="progress-ai-summary-card">
                      <span className="label">Averagee RPE</span>
                      <span className="value">{reportData.avgRpe.toFixed(1)}/10</span>
                    </div>
                  </div>
                )}

                {reportActiveTab === 'progress' && (
                  <ul className="progress-ai-bullet-list">
                    {reportData.progressBullets.map((b: string, i: number) => (
                      <li key={i} dangerouslySetInnerHTML={{ __html: b.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                    ))}
                  </ul>
                )}

                {reportActiveTab === 'werkpunten' && (
                  <ul className="progress-ai-bullet-list">
                    {reportData.werkpuntenBullets.map((b: string, i: number) => (
                      <li key={i} dangerouslySetInnerHTML={{ __html: b.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                    ))}
                  </ul>
                )}

                {reportActiveTab === 'risico' && (
                  <ul className="progress-ai-bullet-list">
                    {reportData.risicoBullets.map((b: string, i: number) => (
                      <li key={i} dangerouslySetInnerHTML={{ __html: b.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                    ))}
                  </ul>
                )}

                {reportActiveTab === 'actieplan' && (
                  <ul className="progress-ai-bullet-list">
                    {reportData.actieplanBullets.map((b: string, i: number) => (
                      <li key={i} dangerouslySetInnerHTML={{ __html: b.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
