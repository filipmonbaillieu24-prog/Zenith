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
      setReportLoadingStep('Fysiologische parameters analyseren...');

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

            let verdict = 'Stabiele fysieke conditie en onderhoud';
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
                ? `**Significante toename in drempelvermogen (eFTP)**: Je geschatte drempelwaarde (eFTP) is in deze periode toegenomen met **+${ftpDiff}W** (van ${startFtp}W naar ${endFtp}W). Deze vooruitgang toont aan dat de opgediende prikkels succesvol hebben geleid tot spieradaptatie en een verhoogde lactaattolerantie.`
                : `**Behoud van drempelvermogen**: Je geschatte drempelwaarde (eFTP) is stabiel gebleven rond de **${endFtp}W**. Dit is een uitstekend resultaat dat getuigt van een goed uitgebalanceerde onderhoudstraining.`,
              avgDecoupling < 5
                ? `**Uitstekende aerobe en cardiovasculaire efficiëntie**: Met een gemiddelde hartslagdrift (aerobe decoupling) van slechts **${avgDecoupling.toFixed(1)}%** blijft je cardiovasculaire systeem stabiel bij langdurige inspanningen.`
                : `**Cardiovasculaire drift bij langdurige belasting**: Je hartslag drift stijgt gemiddeld met **${avgDecoupling.toFixed(1)}%** in de tweede helft van je rideten bij gelijkblijvend vermogen.`,
              `**Duurrecord als fundament**: Je langste ride was **${longestRideStr}**. Dergelijke rideten zijn van cruciaal belang voor de capillaire dichtheid van je spieren.`,
            ];

            const werkpuntenBullets = [
              avgRpe >= 7
                ? `**Intensiteitsverdeling en spierstress**: Je gemiddelde RPE ligt op **${avgRpe.toFixed(1)}/10**. Wij adviseren om 80% van de rideten strikt in Zone 2 te rijden.`
                : `**Gezonde intensiteitsverdeling**: Je gemiddelde RPE van **${avgRpe.toFixed(1)}/10** getuigt van een uitstekende polarisatie van je trainingen.`,
              avgDecoupling >= 5
                ? `**Focus op Zone 2 duurtraining**: De geconstateerde hartslagdrift van **${avgDecoupling.toFixed(1)}%** vraagt om specifieke aandacht.`
                : `**Stabiel aerobe vermogen**: Omdat je decoupling minimaal is, kun je je trainingen gerichter gaan sturen op tempohardheid en VO2max.`,
              avgVI > 1.1
                ? `**Gelijkmatige vermogensverdeling (Pacing)**: Met een gemiddelde Variability Index van **${avgVI.toFixed(2)}** rijd je erg schokkerig.`
                : `**Uitstekend pacinggedrag**: Met een gemiddelde Variability Index van **${avgVI.toFixed(2)}** verdeel je je krachten efficiënt.`,
            ];

            const risicoBullets = [
              avgRpe > 7.5
                ? `**Verhoogd risico op overbelasting (Overtraining)**: De trainingsprikkels stapelen zich sneller op dan je lichaam kan herstellen. Plan direct een herstelweek in.`
                : `**Gebalanceerd belastingsrisico**: Je trainingsbelasting en herstelweken zijn in perfect evenwicht.`,
              decouplingRides.length > 5 && avgDecoupling > 6
                ? `**Progressief vermoeidheidsrisico**: De aanzienlijke cardiale drift over meerdere rideten wijst op een cumulatief tekort aan herstel.`
                : `**Stabiele cardiovasculaire tolerantie**: Je reacties laten geen tekenen van chronische vermoeidheid of overtraining zien.`,
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
Totaal: ${reportData.totalKm} km | ${reportData.totalHours} uur | ${reportData.totalRides} rideten

PROGRESSIE & STERKE PUNTEN:
${reportData.progressBullets.map((b: string) => '- ' + b.replace(/\*\*/g, '')).join('\n')}

WERKPUNTEN & FOCUS:
${reportData.werkpuntenBullets.map((b: string) => '- ' + b.replace(/\*\*/g, '')).join('\n')}

ACTIEPLAN VOOR DE KOMENDE WEKEN:
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
              Automatisch geautomatiseerde fysiologische analyse van je prestaties & herstel
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
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Selecteer een langere periode of upload meer rideten.</p>
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
