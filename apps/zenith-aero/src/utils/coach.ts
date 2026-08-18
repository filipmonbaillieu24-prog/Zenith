// ─── Rule-based AI Training Coach ────────────────────────────────────────────
// Generates personalised training advice based on ride history + profile.
// No ML needed — pure data-driven rules backed by sports science.

export interface CoachAdvice {
  category: 'herstel' | 'training' | 'progressie' | 'waarschuwing' | 'doel';
  prioridey: 1 | 2 | 3; // 1 = most urgent
  icon:     string;
  title:    string;
  body:     string;
  color:    string;
  action?:  string;
}

interface RideLike {
  date:              number;
  tss?:              number;
  hrTSS?:            number;
  eFTP?:             number;
  efficiencyFactor?: number;
  hasPower?:         boolean;
  hasHR?:            boolean;
  distance:          number;
  duration:          number;
  decoupling?:       number;
  powerZoneTime?:    number[];
  hrZoneTime?:       number[];
  avgCadence?:       number;
  [key: string]:     any;
}

interface Profile {
  weight?: number;
  ftp?:    number;
  [key: string]: any;
}

export function generateCoachAdvice(
  rides: RideLike[],
  profile: Profile,
  pmcData?: { ctl: number; atl: number; tsb: number }
): CoachAdvice[] {
  if (rides.length < 2) return [];
  const advice: CoachAdvice[] = [];
  const now    = Date.now();
  const recent = rides.filter(r => now - r.date < 28 * 86400000);
  const last7  = rides.filter(r => now - r.date <  7 * 86400000);
  const last   = rides[0];

  // ── 1. TSS load spike ───────────────────────────────────────────────────────
  const weekTSS     = last7.reduce((s, r) => s + (r.tss ?? r.hrTSS ?? 0), 0);
  const prevWeekTSS = rides
    .filter(r => now - r.date >= 7 * 86400000 && now - r.date < 14 * 86400000)
    .reduce((s, r) => s + (r.tss ?? r.hrTSS ?? 0), 0);

  if (prevWeekTSS > 20) {
    const growth = ((weekTSS - prevWeekTSS) / prevWeekTSS) * 100;
    if (growth > 15) {
      advice.push({
        category: 'waarschuwing', prioridey: 1, icon: '⚠️', color: '#ff7675',
        title: 'Trainingsbelasting stijgt te snel',
        body:  `Je belasting steeg ${growth.toFixed(0)}% t.o.v. vorige week. Meer dan 10% per week verhoogt het blessurerisico significant (10% rule).`,
        action: 'Plan morgen een herstelride of rustdag',
      });
    } else if (growth < -35 && weekTSS < 40) {
      advice.push({
        category: 'training', prioridey: 2, icon: '💤', color: '#74b9ff',
        title: 'Lage trainingsbelasting deze week',
        body:  `Je TSS is ${Math.round(weekTSS)} vs ${Math.round(prevWeekTSS)} vorige week. Als dit none bewuste rust is, probeer een zone 2 ride van 60–90 minuten.`,
        action: 'Plan een duurride van 60–90 min',
      });
    }
  }

  // ── 2. Zone 2 ratio ─────────────────────────────────────────────────────────
  const z2Time    = recent.reduce((s, r) => s + (r.powerZoneTime?.[1] ?? r.hrZoneTime?.[1] ?? 0), 0);
  const totalTime = recent.reduce((s, r) => s + r.duration, 0);
  if (totalTime > 7200 && z2Time / totalTime < 0.55) {
    advice.push({
      category: 'training', prioridey: 2, icon: '💡', color: '#a29bfe',
      title: 'Te weinig zone 2 training',
      body:  `Slechts ${((z2Time / totalTime) * 100).toFixed(0)}% van je trainingstijd de afgelopen 4 weken was aëroob (zone 2). Wetenschappelijk optimum: 70–80% voor maximale aerobe aanpassing.`,
      action: '2–3 rideten per week van 60+ min op matige intensiteit',
    });
  }

  // ── 3. EF trend (HR riders) ─────────────────────────────────────────────────
  if (!last.hasPower) {
    const efRides = recent.filter(r => r.efficiencyFactor != null);
    if (efRides.length >= 4) {
      const half  = Math.floor(efRides.length / 2);
      const rec   = efRides.slice(0, half).reduce((s, r) => s + r.efficiencyFactor!, 0) / half;
      const old   = efRides.slice(half).reduce((s, r) => s + r.efficiencyFactor!, 0) / (efRides.length - half);
      const efPct = ((rec - old) / old) * 100;
      if (efPct > 2) {
        advice.push({
          category: 'progressie', prioridey: 3, icon: '📈', color: 'var(--color-accent,#39ff14)',
          title: 'Je aerobe efficiëntie verbetert!',
          body:  `Je Efficiency Factor steeg ${efPct.toFixed(1)}% de afgelopen weken. Je rijdt sneller bij dezelfde hartslag — een duidelijk teken van aerobe vooruitgang.`,
          action: 'Blijf consistente zone 2 training doen',
        });
      } else if (efPct < -3) {
        advice.push({
          category: 'herstel', prioridey: 2, icon: '😴', color: '#fdcb6e',
          title: 'EF daalt — mogelijke vermoeidheid',
          body:  `Je Efficiency Factor daalde ${Math.abs(efPct).toFixed(1)}% recent. Dit kan wijzen op accumulerende vermoeidheid, slaaptekort of ziekte.`,
          action: 'Neem 2–3 extra rustdagen',
        });
      }
    }
  }

  // ── 4. eFTP trend (power riders) ────────────────────────────────────────────
  if (last.hasPower) {
    const ftpRides = rides.filter(r => r.eFTP).slice(0, 12);
    if (ftpRides.length >= 5) {
      const ftpNow  = ftpRides[0].eFTP!;
      const ftpOld  = ftpRides.slice(4).reduce((s, r) => s + r.eFTP!, 0) / (ftpRides.length - 4);
      const ftpGrow = ((ftpNow - ftpOld) / ftpOld) * 100;
      if (ftpGrow > 3) {
        advice.push({
          category: 'progressie', prioridey: 3, icon: '⚡', color: 'var(--color-primary,#cbd5e1)',
          title: 'Powersprestatie verbetert',
          body:  `Je eFTP steeg ${ftpGrow.toFixed(1)}% (${ftpOld.toFixed(0)}W → ${ftpNow}W). Je wordt aantoonbaar sterker!`,
        });
      } else if (ftpGrow < -3) {
        advice.push({
          category: 'waarschuwing', prioridey: 2, icon: '📉', color: '#ff7675',
          title: 'eFTP daalt',
          body:  `Je eFTP daalde ${Math.abs(ftpGrow).toFixed(1)}%. Controleer herstel en voeg voldoende intensiteit toe.`,
          action: 'Plan een threshold interval: 2×20 min op FTP',
        });
      }
    }
  }

  // ── 5. Consistentie ─────────────────────────────────────────────────────────
  const daysSinceLast = (now - last.date) / 86400000;
  if (daysSinceLast > 6 && recent.length < 3) {
    advice.push({
      category: 'training', prioridey: 2, icon: '📅', color: '#74b9ff',
      title: 'Lage trainingsfrequentie',
      body:  `Your last ride was ${Math.floor(daysSinceLast)} dagen geleden. Zelfs een korte ride van 30 min houdt je basisconditie op peil.`,
      action: 'Rijd today minstens 30 minuten',
    });
  }

  // ── 6. Cardiac drift ────────────────────────────────────────────────────────
  const highDrift = last7.filter(r => r.decoupling != null && Math.abs(r.decoupling!) > 8);
  if (highDrift.length >= 2) {
    advice.push({
      category: 'herstel', prioridey: 2, icon: '❤️‍🔥', color: '#ff7675',
      title: 'Hoge cardiac drift recent',
      body:  `${highDrift.length} recente rideten with >8% cardiac drift. Dit wijst op accumulerende vermoeidheid, ondervulling of ziekte.`,
      action: 'Rustdag + goede hydratatie',
    });
  }

  // ── 7. W/kg doelen ──────────────────────────────────────────────────────────
  if (profile.weight && last.eFTP) {
    const wpkg = last.eFTP / profile.weight;
    if (wpkg < 2.0) {
      advice.push({
        category: 'doel', prioridey: 3, icon: '🎯', color: '#a29bfe',
        title: `Doel: 2.0 W/kg (nu ${wpkg.toFixed(2)})`,
        body:  'Focus op consistente duurtraining: 3–4u per week aëroob. Dit is de snelste weg naar je eerste W/kg mijlpaal.',
      });
    } else if (wpkg < 3.0) {
      advice.push({
        category: 'doel', prioridey: 3, icon: '🎯', color: 'var(--color-accent,#39ff14)',
        title: `Goed niveau: ${wpkg.toFixed(2)} W/kg`,
        body:  'Je bent op weg naar gevorderd niveau (3.0+ W/kg). Combineer lange duurrideten with 1–2 intervaltrainingen per week (sweet spot / threshold).',
      });
    } else {
      advice.push({
        category: 'progressie', prioridey: 3, icon: '🏆', color: 'var(--color-primary,#cbd5e1)',
        title: `Sterk niveau: ${wpkg.toFixed(2)} W/kg`,
        body:  'Je zit in de "Trained" categorie. Overweeg periodisering (blokken van 3 weken opbouw + 1 week herstel) voor verdere groei.',
      });
    }
  }

  // ── 8. Cadence advies ────────────────────────────────────────────────────────
  const cadRides = recent.filter(r => r.avgCadence && r.avgCadence > 0);
  if (cadRides.length >= 3) {
    const avgCad = cadRides.reduce((s, r) => s + r.avgCadence!, 0) / cadRides.length;
    if (avgCad < 80) {
      advice.push({
        category: 'training', prioridey: 3, icon: '🚴', color: '#fdcb6e',
        title: `Lage cadans: ${avgCad.toFixed(0)} rpm`,
        body:  'Je gemiddelde cadans is onder 80 rpm. Hogere cadans (85–95 rpm) vermindert spierschade en verhoogt duurprestatie. Oefen bewust with een hogere cadans op makkelijke rideten.',
        action: 'Oefen 85–95 rpm op je volgende ride',
      });
    }
  }

  // ── 9. Zone 3 Junk Miles analyse ───────────────────────────────────────────
  const z3Time = recent.reduce((s, r) => s + (r.powerZoneTime?.[2] ?? r.hrZoneTime?.[2] ?? 0), 0);
  if (totalTime > 7200 && z3Time / totalTime > 0.25) {
    advice.push({
      category: 'waarschuwing', prioridey: 2, icon: '⚠️', color: '#ff9f43',
      title: 'Hoge hoeveelheid Junk Miles (Zone 3)',
      body: `Je spendeert ${((z3Time / totalTime) * 100).toFixed(0)}% van je trainingstijd in Zone 3 (Tempo). Dit is de 'grijze zone': te intensief om optimaal te herstellen, maar te laag voor maximale drempelprikkels.`,
      action: 'Houd je duurrideten strikt in Zone 2 en intensieve trainingen in Zone 4+'
    });
  }

  // ── 10. W' Anaerobe tank depletion ──────────────────────────────────────────
  // Check of de atleet recent zijn batterij diep heeft leeggereden (sprint/interval rideten)
  const powerRides = recent.filter(r => r.hasPower && r.bestEfforts);
  if (powerRides.length > 0) {
    // Zoek naar rideten with zeer hoge 5s / 1 min vermogens in verhouding tot FTP
    const ftpVal = profile.ftp ?? 220;
    const deepDepletionRides = powerRides.filter(r => {
      const s5 = r.bestEfforts?.s5 ?? 0;
      const m1 = r.bestEfforts?.m1 ?? 0;
      // 5s vermogen > 300% FTP of 1 min vermogen > 150% FTP duidt op een flinke W' aanspraak
      return s5 > ftpVal * 3 || m1 > ftpVal * 1.5;
    });

    if (deepDepletionRides.length >= 2) {
      advice.push({
        category: 'progressie', prioridey: 3, icon: '🔋', color: '#39ff14',
        title: 'Diepe anaerobe W\' uitputting gewithen',
        body: `In ${deepDepletionRides.length} van je recente rideten heb je je anaerobe tank ($W'$) diep aangesproken door explosieve inspanningen boven je drempel. Dit stimuleert de glycolytische capaciteit en je sprintcapaciteit.`,
        action: 'Zorg voor minimaal 48u herstel na rideten with dergelijke explosieve prikkels'
      });
    }
  }

  // ── 11. Doel-specifieke trainingsadviezen ───────────────────────────────────
  const goal = profile.trainingGoal ?? 'general';
  if (goal === 'climbing') {
    advice.push({
      category: 'doel', prioridey: 2, icon: '⛰️', color: '#fdcb6e',
      title: 'Focus: Klimmen & Klimvermogen',
      body: 'Voor klimmen is je vermogen-gewichtverhouding (W/kg) leidend. Richt je trainingen deze week op langere blokken rond of net onder je drempelvermogen (Sweet Spot) om je klimconditie te optimaliseren.',
      action: 'Plan een sweet spot training van 2x15 min op 88-90% FTP'
    });
  } else if (goal === 'speed') {
    advice.push({
      category: 'doel', prioridey: 2, icon: '⚡', color: '#cbd5e1',
      title: 'Focus: Speed & Sprintvermogen',
      body: 'Je richt je op explosiviteit en snelheid. Voeg deze week korte, maximale sprints toe aan je rideten with volledige rust tussendoor om je anaerobe capaciteit (W\') te boosten.',
      action: 'Plan een sprinttraining: 5x15s maximaal with 4 min rust'
    });
  } else if (goal === 'endurance') {
    advice.push({
      category: 'doel', prioridey: 2, icon: '🚴', color: '#00b894',
      title: 'Focus: Lange duurrideten (Endurance)',
      body: 'Je doel is vetverbranding en uithoudingsvermogen. Richt je op het vergroten van je aerobe basis door minstens één lange ride te plannen die volledig in Zone 2 (Endurance) valt.',
      action: 'Plan een rustige duurride van minimaal 2.5 tot 3 uur in Zone 2'
    });
  }

  // ── 12. PMC-gebaseerde coaching ─────────────────────────────────────────────
  if (pmcData && pmcData.ctl > 0) {
    const { ctl, atl, tsb } = pmcData;

    // TSB overtraining / herstel adviezen
    if (tsb < -30) {
      advice.push({
        category: 'waarschuwing', prioridey: 1, icon: '🔴', color: '#ff7675',
        title: `Overtraining risico (TSB: ${Math.round(tsb)})`,
        body: `Je Vorm (TSB) is ${Math.round(tsb)}, wat duidt op significante vermoeidheidsaccumulatie. Je lichaam kan de belasting niet meer verwerken. Rust is nu de beste training.`,
        action: '2–3 volledige rustdagen of een lichte herstelride (Zone 1)',
      });
    } else if (tsb < -20) {
      advice.push({
        category: 'herstel', prioridey: 2, icon: '⚡', color: '#fdcb6e',
        title: `Hoge trainingsbelasting (TSB: ${Math.round(tsb)})`,
        body: `Je Vorm staat op ${Math.round(tsb)} with een vermoeidheid (ATL) van ${Math.round(atl)}. Je bent in een opbouwfase — monitor hoe je je voelt en slaap voldoende.`,
        action: 'Priorideeer 7–8u slaap, voldoende koolhydraten en hydratatie',
      });
    } else if (tsb > 10 && tsb < 25) {
      advice.push({
        category: 'progressie', prioridey: 3, icon: '🏆', color: '#55efc4',
        title: `Piekconditie bereikt (TSB: +${Math.round(tsb)})`,
        body: `Met TSB +${Math.round(tsb)} en fitheid CTL ${Math.round(ctl)} ben je optimaal hersteld en klaar voor topprestaties. Ideaal moment voor een wedstrijd of inspanningstest.`,
        action: 'Plan een tijdride of race in de komende 3–5 dagen',
      });
    } else if (tsb > 25) {
      advice.push({
        category: 'training', prioridey: 2, icon: '😴', color: '#74b9ff',
        title: `Te veel rust (TSB: +${Math.round(tsb)})`,
        body: `TSB van +${Math.round(tsb)} is erg positief — je bent goed hersteld maar verliest stilaan trainingsprikkels. Fitheid (CTL ${Math.round(ctl)}) daalt bij langdurige inactiviteit.`,
        action: 'Herneem geleidelijk with een endurance- of sweetspot-ride',
      });
    }

    // CTL niveauadvies
    if (ctl < 20 && rides.length >= 5) {
      advice.push({
        category: 'doel', prioridey: 3, icon: '📊', color: '#a29bfe',
        title: `Lage basisfitness (CTL: ${Math.round(ctl)})`,
        body: `Je chronische trainingsbelasting (CTL ${Math.round(ctl)}) is laag. Verhoog geleidelijk je volume with 5–10% per week. Target: CTL 40+ voor competitief niveau.`,
        action: 'Voeg één extra duurride per week toe van 60–90 min in Zone 2',
      });
    } else if (ctl > 70) {
      advice.push({
        category: 'progressie', prioridey: 3, icon: '🔥', color: '#cbd5e1',
        title: `Indrukwekkende fitheid (CTL: ${Math.round(ctl)})`,
        body: `CTL ${Math.round(ctl)} plaatst je in de getrainde tot elite categorie. Overweeg een gestructureerd periodiseringsblok (3 weken opbouw + 1 week herstel) voor verdere groei.`,
      });
    }

    // ATL spike ten opzichte van CTL
    if (atl > ctl * 1.5 && ctl > 10) {
      advice.push({
        category: 'waarschuwing', prioridey: 1, icon: '⚠️', color: '#ff9f43',
        title: `Acute belasting veel hoger dan basis (ATL: ${Math.round(atl)} vs CTL: ${Math.round(ctl)})`,
        body: `Je vermoeidheid (ATL ${Math.round(atl)}) is ${((atl / ctl - 1) * 100).toFixed(0)}% hoger dan je fitheid (CTL ${Math.round(ctl)}). Grote volumesprongen verhogen het blessurerisico significant.`,
        action: 'Bouw training geleidelijk op — max 10% volume verhogen per week',
      });
    }
  }

  return advice.sort((a, b) => a.prioridey - b.prioridey);
}
