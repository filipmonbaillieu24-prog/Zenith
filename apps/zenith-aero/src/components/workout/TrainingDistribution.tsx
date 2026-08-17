import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { RideSummaryWithBests } from '../../types/workout';
import { BarChart2 } from 'lucide-react';

interface TrainingDistributionProps {
  rides: RideSummaryWithBests[];
}

export const TrainingDistribution: React.FC<TrainingDistributionProps> = ({ rides }) => {
  const analysis = useMemo(() => {
    if (rides.length === 0) return null;

    let totalLID = 0; // Low (Z1-Z2)
    let totalMID = 0; // Mid (Z3-Z4 voor power, Z3 voor HR)
    let totalHID = 0; // High (Z5-Z6 voor power, Z4-Z5 voor HR)

    let totalSec = 0;
    let hasPowerCount = 0;

    for (const r of rides) {
      if (r.hasPower && !r.isEstimatedPower && r.powerZoneTime && r.powerZoneTime.length >= 6) {
        hasPowerCount++;
        const pz = r.powerZoneTime;
        const lid = pz[0] + pz[1];
        const mid = pz[2] + pz[3];
        const hid = pz[4] + pz[5];
        
        totalLID += lid;
        totalMID += mid;
        totalHID += hid;
        totalSec += (lid + mid + hid);
      } else if (r.hasHR && r.hrZoneTime && r.hrZoneTime.length >= 5) {
        const hz = r.hrZoneTime;
        const lid = hz[0] + hz[1];
        const mid = hz[2];
        const hid = hz[3] + hz[4];

        totalLID += lid;
        totalMID += mid;
        totalHID += hid;
        totalSec += (lid + mid + hid);
      }
    }

    if (totalSec === 0) return null;

    const pctLID = Math.round((totalLID / totalSec) * 100);
    const pctMID = Math.round((totalMID / totalSec) * 100);
    const pctHID = Math.round((totalHID / totalSec) * 100);

    // Classificeer model
    let model = "Ongebalanceerd";
    let desc = "Je trainingsverdeling past nog niet direct in een klassiek patroon. Dit is normaal als je net bent begonnen of zeer onregelmatig fietst.";
    let tip = "Probeer je duurrideten bewuster in Zone 2 te houden (laag tempo) en je intensieve dagen echt hard te maken (intervallen).";
    let color = "#ffeaa7";

    if (pctLID >= 75 && pctMID <= 12 && pctHID >= 5) {
      model = "Gepolariseerd (Polarized)";
      color = "#34d399";
      desc = "Klassieke 80/20 verdeling! Je doet het overgrote deel van je werk in de rustige duurzones (Zone 1-2) en spaart je energie om er echt vol voor te gaan op intensieve dagen.";
      tip = "Dit is de meest efficiënte methode om je aerobe drempel te verhogen zonder oververmoeid te raken. Blijf zo trainen!";
    } else if (pctLID >= 60 && pctMID >= 15 && pctMID <= 30 && pctHID < pctMID) {
      model = "Piramide (Pyramidal)";
      color = "#cbd5e1";
      desc = "Een solide piramidemodel. De basis bestaat uit rustige duurrideten, aangevuld met een redelijk aandeel tempowerk (Zone 3/4) en een klein aandeel echte sprints/intervallen.";
      tip = "Ideaal voor het opbouwen van een all-round basisconditie en tempohardheid in het voorseizoen.";
    } else if (pctMID >= 35) {
      model = "Threshold / Sweet Spot Focus";
      color = "#fbbf24";
      desc = "Je traint heel veel in de 'Sweet Spot' of drempelzones (Zone 3 en 4). Dit voelt zwaar en effectief, maar kan leiden tot stagnatie omdat je constant licht vermoeid bent.";
      tip = "Probeer meer rideten echt rustig te rijden (Zone 2) om je vetverbranding op te bouwen, zodat je frisser bent voor gerichte intervallen.";
    } else if (pctLID >= 85 && pctHID < 3) {
      model = "Basis & Recovery";
      color = "#a29bfe";
      desc = "Je focus ligt momenteel bijna volledig op rustige duurtrainingen en herstel. Uitstekend voor basisopbouw of na een zwaar wedstrijdblok.";
      tip = "Voeg af en toe een intensieve intervaltraining toe om je VO2max en cardiovasculaire systeem te prikkelen.";
    } else if (pctHID >= 25) {
      model = "Hoge Intensiteit (HIIT)";
      color = "#f87171";
      desc = "Je traint extreem intensief! Meer dan een kwart van je tijd breng je door in het rood (Zone 5+). Dit is effectief op korte termijn, maar vergroot de kans op overtraining aanzienlijk.";
      tip = "Las een herstelweek in en vervang minimaal de helft van de intensieve trainingen door rustige Zone 2 duurrideten.";
    }

    const data = [
      { name: 'LID (Laag)', value: pctLID, label: 'LID (Zone 1-2)', color: '#00b894' },
      { name: 'MID (Midden)', value: pctMID, label: 'MID (Zone 3-4)', color: '#fdcb6e' },
      { name: 'HID (Hoog)', value: pctHID, label: 'HID (Zone 5+)', color: '#ff7675' }
    ].filter(d => d.value > 0);

    const isPowerBased = hasPowerCount > (rides.length / 2);

    return {
      model,
      desc,
      tip,
      color,
      data,
      isPowerBased
    };
  }, [rides]);

  if (!analysis) {
    return (
      <div className="wd-section-card">
        <div className="wd-section-card__head">
          <span className="wd-section-card__title">
            <BarChart2 size={13} style={{ display: 'inline', marginRight: 5, color: '#cbd5e1' }} />
            Trainingsdistributie & Zones
          </span>
        </div>
        <p style={{ color: '#64748b', fontSize: 11, textAlign: 'center', margin: '20px 0' }}>
          Upload rideten met hartslag- of vermogensdata om je trainingsdistributie te analyseren.
        </p>
      </div>
    );
  }

  return (
    <div className="wd-section-card">
      <div className="wd-section-card__head">
        <span className="wd-section-card__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BarChart2 size={13} style={{ color: '#cbd5e1' }} />
          Trainingsdistributie ({analysis.isPowerBased ? 'Power' : 'Heart Rate'})
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        {/* Donut Chart */}
        <div style={{ width: 120, height: 120, position: 'relative', flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={analysis.data}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={50}
                paddingAngle={3}
                dataKey="value"
              >
                {analysis.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
            </PieChart>
          </ResponsiveContainer>
          {/* Legenda in het midden */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
            <span style={{ fontSize: 10, color: '#64748b', display: 'block', lineHeight: 1 }}>Verdeling</span>
          </div>
        </div>

        {/* Cijfers & Legenda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1 }}>
          {analysis.data.map((d, index) => (
            <div key={index} style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color }} />
                {d.name}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f8fafc' }}>{d.value}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Coach Feedback */}
      <div style={{ marginTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.03)', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${analysis.color}15`, color: analysis.color, border: `1px solid ${analysis.color}25` }}>
            {analysis.model}
          </span>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Trainingsmodel</span>
        </div>
        <p style={{ fontSize: 11, color: '#cbd5e1', margin: '6px 0 0', lineHeight: 1.4 }}>
          {analysis.desc}
        </p>
        <p style={{ fontSize: 11, color: '#fdcb6e', margin: '6px 0 0', fontWeight: 600 }}>
          💡 Coach Tip: <span style={{ fontWeight: 400, color: '#cbd5e1' }}>{analysis.tip}</span>
        </p>
      </div>
    </div>
  );
};
