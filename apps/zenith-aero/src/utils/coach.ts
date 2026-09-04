import { TSB_FATIGUED_ABOVE, TSB_OPTIMAL_ABOVE, TSB_PEAK_ABOVE, TSB_FRESH_ABOVE } from '@zenith/shared';

// ─── Rule-based AI Training Coach ────────────────────────────────────────────
// Generates personalised training advice based on ride history + profile.
// No ML needed — pure data-driven rules backed by sports science.

export interface CoachAdvice {
  category: 'recovery' | 'training' | 'progression' | 'warning' | 'goal';
  priority: 1 | 2 | 3; // 1 = most urgent
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
        category: 'warning', priority: 1, icon: '⚠️', color: '#ff7675',
        title: 'Training workload rising too fast',
        body:  `Your workload rose by ${growth.toFixed(0)}% compared to last week. Increasing by more than 10% per week significantly raises injury risk (10% rule).`,
        action: 'Plan a recovery ride or rest day tomorrow',
      });
    } else if (growth < -35 && weekTSS < 40) {
      advice.push({
        category: 'training', priority: 2, icon: '💤', color: '#74b9ff',
        title: 'Low training load this week',
        body:  `Your TSS is ${Math.round(weekTSS)} vs ${Math.round(prevWeekTSS)} last week. If this is not a planned rest period, try a Zone 2 ride of 60-90 minutes.`,
        action: 'Plan an endurance ride of 60-90 min',
      });
    }
  }

  // ── 2. Zone 2 ratio ─────────────────────────────────────────────────────────
  const z2Time    = recent.reduce((s, r) => s + (r.powerZoneTime?.[1] ?? r.hrZoneTime?.[1] ?? 0), 0);
  const totalTime = recent.reduce((s, r) => s + r.duration, 0);
  if (totalTime > 7200 && z2Time / totalTime < 0.55) {
    advice.push({
      category: 'training', priority: 2, icon: '💡', color: '#a29bfe',
      title: 'Too little Zone 2 training',
      body:  `Only ${((z2Time / totalTime) * 100).toFixed(0)}% of your training time in the last 4 weeks was aerobic (Zone 2). Scientific optimum: 70-80% for maximal aerobic adaptation.`,
      action: '2-3 rides per week of 60+ min at moderate intensity',
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
          category: 'progression', priority: 3, icon: '📈', color: 'var(--color-accent,#38bdf8)',
          title: 'Your aerobic efficiency is improving!',
          body:  `Your Efficiency Factor increased by ${efPct.toFixed(1)}% over the last few weeks. You are riding faster at the same heart rate - a clear sign of aerobic progress.`,
          action: 'Continue consistent Zone 2 training',
        });
      } else if (efPct < -3) {
        advice.push({
          category: 'recovery', priority: 2, icon: '😴', color: '#fdcb6e',
          title: 'EF dropping - potential fatigue',
          body:  `Your Efficiency Factor dropped by ${Math.abs(efPct).toFixed(1)}% recently. This could indicate accumulating fatigue, sleep deprivation, or illness.`,
          action: 'Take 2-3 extra rest days',
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
          category: 'progression', priority: 3, icon: '⚡', color: 'var(--color-primary,#cbd5e1)',
          title: 'Power performance is improving',
          body:  `Your eFTP increased by ${ftpGrow.toFixed(1)}% (${ftpOld.toFixed(0)}W -> ${ftpNow}W). You are getting demonstrably stronger!`,
        });
      } else if (ftpGrow < -3) {
        advice.push({
          category: 'warning', priority: 2, icon: '📉', color: '#ff7675',
          title: 'eFTP is decreasing',
          body:  `Your eFTP decreased by ${Math.abs(ftpGrow).toFixed(1)}%. Monitor recovery and add sufficient intensity.`,
          action: 'Plan a threshold interval: 2x20 min at FTP',
        });
      }
    }
  }

  // ── 5. Consistency ──────────────────────────────────────────────────────────
  const daysSinceLast = (now - last.date) / 86400000;
  if (daysSinceLast > 6 && recent.length < 3) {
    advice.push({
      category: 'training', priority: 2, icon: '📅', color: '#74b9ff',
      title: 'Low training frequency',
      body:  `Your last ride was ${Math.floor(daysSinceLast)} days ago. Even a short 30 min ride keeps your baseline fitness primed.`,
      action: 'Ride at least 30 minutes today',
    });
  }

  // ── 6. Cardiac drift ────────────────────────────────────────────────────────
  const highDrift = last7.filter(r => r.decoupling != null && Math.abs(r.decoupling!) > 8);
  if (highDrift.length >= 2) {
    advice.push({
      category: 'recovery', priority: 2, icon: '❤️‍🔥', color: '#ff7675',
      title: 'High recent cardiac drift',
      body:  `${highDrift.length} recent rides with >8% cardiac drift. This indicates accumulating fatigue, dehydration, or illness.`,
      action: 'Rest day + good hydration',
    });
  }

  // ── 7. W/kg goals ────────────────────────────────────────────────────────────
  if (profile.weight && last.eFTP) {
    const wpkg = last.eFTP / profile.weight;
    if (wpkg < 2.0) {
      advice.push({
        category: 'goal', priority: 3, icon: '🎯', color: '#a29bfe',
        title: `Goal: 2.0 W/kg (currently ${wpkg.toFixed(2)})`,
        body:  'Focus on consistent endurance training: 3-4h per week aerobic. This is the fastest path to your first W/kg milestone.',
      });
    } else if (wpkg < 3.0) {
      advice.push({
        category: 'goal', priority: 3, icon: '🎯', color: 'var(--color-accent,#38bdf8)',
        title: `Good level: ${wpkg.toFixed(2)} W/kg`,
        body:  'You are on your way to an advanced level (3.0+ W/kg). Combine long endurance rides with 1-2 interval sessions per week (sweet spot / threshold).',
      });
    } else {
      advice.push({
        category: 'progression', priority: 3, icon: '🏆', color: 'var(--color-primary,#cbd5e1)',
        title: `Strong level: ${wpkg.toFixed(2)} W/kg`,
        body:  'You are in the "Trained" category. Consider periodization (blocks of 3 weeks build + 1 week recovery) for further growth.',
      });
    }
  }

  // ── 8. Cadence advice ────────────────────────────────────────────────────────
  const cadRides = recent.filter(r => r.avgCadence && r.avgCadence > 0);
  if (cadRides.length >= 3) {
    const avgCad = cadRides.reduce((s, r) => s + r.avgCadence!, 0) / cadRides.length;
    if (avgCad < 80) {
      advice.push({
        category: 'training', priority: 3, icon: '🚴', color: '#fdcb6e',
        title: `Low cadence: ${avgCad.toFixed(0)} rpm`,
        body: 'Your average cadence is below 80 rpm. Higher cadence (85-95 rpm) reduces muscle damage and increases endurance performance. Practice conscious high cadence on easy rides.',
        action: 'Practice 85-95 rpm on your next ride',
      });
    }
  }

  // ── 9. Zone 3 Junk Miles analysis ───────────────────────────────────────────
  const z3Time = recent.reduce((s, r) => s + (r.powerZoneTime?.[2] ?? r.hrZoneTime?.[2] ?? 0), 0);
  if (totalTime > 7200 && z3Time / totalTime > 0.25) {
    advice.push({
      category: 'warning', priority: 2, icon: '⚠️', color: '#ff9f43',
      title: 'High amount of Junk Miles (Zone 3)',
      body: `You spend ${((z3Time / totalTime) * 100).toFixed(0)}% of your training time in Zone 3 (Tempo). This is the 'gray zone': too intense for optimal recovery, but too low for maximal threshold stimulus.`,
      action: 'Keep endurance rides strictly in Zone 2 and intensive workouts in Zone 4+'
    });
  }

  // ── 10. W' anaerobic tank depletion ─────────────────────────────────────────
  // Check whether the athlete recently drained their tank deeply (sprint/interval rides)
  const powerRides = recent.filter(r => r.hasPower && r.bestEfforts);
  if (powerRides.length > 0) {
    // Look for rides with very high 5s / 1 min power relative to FTP
    const ftpVal = profile.ftp ?? 220;
    const deepDepletionRides = powerRides.filter(r => {
      const s5 = r.bestEfforts?.s5 ?? 0;
      const m1 = r.bestEfforts?.m1 ?? 0;
      // 5s power > 300% FTP or 1 min power > 150% FTP indicates a significant W' draw
      return s5 > ftpVal * 3 || m1 > ftpVal * 1.5;
    });

    if (deepDepletionRides.length >= 2) {
      advice.push({
        category: 'progression', priority: 3, icon: '🔋', color: '#38bdf8',
        title: 'Deep anaerobic W\' depletion observed',
        body: `In ${deepDepletionRides.length} of your recent rides you heavily depleted your anaerobic tank ($W'$) via explosive efforts above threshold. This stimulates glycolytic capacity and sprint ability.`,
        action: 'Ensure at least 48h recovery after rides with such explosive efforts'
      });
    }
  }

  // ── 11. Goal-specific training advice ───────────────────────────────────────
  const goal = profile.trainingGoal ?? 'general';
  if (goal === 'climbing') {
    advice.push({
      category: 'goal', priority: 2, icon: '⛰️', color: '#fdcb6e',
      title: 'Focus: Climbing & Climbing Capacity',
      body: 'For climbing, your power-to-weight ratio (W/kg) is key. Focus your workouts this week on longer blocks around or just below threshold (Sweet Spot) to optimize climbing fitness.',
      action: 'Plan a sweet spot workout of 2x15 min at 88-90% FTP'
    });
  } else if (goal === 'speed') {
    advice.push({
      category: 'goal', priority: 2, icon: '⚡', color: '#cbd5e1',
      title: 'Focus: Speed & Sprint Capacity',
      body: 'You are focusing on explosiveness and speed. Add short, maximal sprints to your rides this week with full recovery in between to boost anaerobic capacity (W\').',
      action: 'Plan a sprint workout: 5x15s maximal with 4 min rest'
    });
  } else if (goal === 'endurance') {
    advice.push({
      category: 'goal', priority: 2, icon: '🚴', color: '#00b894',
      title: 'Focus: Long Endurance Rides',
      body: 'Your goal is fat oxidation and endurance. Focus on increasing your aerobic base by planning at least one long ride that falls entirely in Zone 2 (Endurance).',
      action: 'Plan a relaxed endurance ride of at least 2.5 to 3 hours in Zone 2'
    });
  }

  // ── 12. PMC-based coaching ───────────────────────────────────────────────────
  if (pmcData && pmcData.ctl > 0) {
    const { ctl, atl, tsb } = pmcData;

    // TSB overtraining / recovery advice, keyed off the shared breakpoints
    // (shared/pmc.ts) that also drive the Form pill on the dashboard, so a given
    // TSB reading means the same thing everywhere in Aero instead of triggering
    // a "you're fine" pill next to an "overtraining risk" advice card.
    if (tsb < TSB_FATIGUED_ABOVE) {
      advice.push({
        category: 'warning', priority: 1, icon: '🔴', color: '#ff7675',
        title: `Overtraining risk (TSB: ${Math.round(tsb)})`,
        body: `Your Form (TSB) is ${Math.round(tsb)}, indicating significant fatigue accumulation. Your body can no longer handle the load. Rest is the best training now.`,
        action: '2-3 full rest days or a light recovery ride (Zone 1)',
      });
    } else if (tsb < TSB_OPTIMAL_ABOVE) {
      advice.push({
        category: 'recovery', priority: 2, icon: '⚡', color: '#fdcb6e',
        title: `High training workload (TSB: ${Math.round(tsb)})`,
        body: `Your Form is ${Math.round(tsb)} with a fatigue (ATL) of ${Math.round(atl)}. You are in a build phase - monitor how you feel and get enough sleep.`,
        action: 'Prioritize 7-8h sleep, adequate carbs and hydration',
      });
    } else if (tsb > TSB_PEAK_ABOVE && tsb < TSB_FRESH_ABOVE) {
      advice.push({
        category: 'progression', priority: 3, icon: '🏆', color: '#55efc4',
        title: `Peak condition reached (TSB: +${Math.round(tsb)})`,
        body: `With TSB +${Math.round(tsb)} and fitness CTL ${Math.round(ctl)}, you are fully recovered and primed for peak performance. Ideal time for a race or FTP test.`,
        action: 'Plan a time trial or race in the next 3-5 days',
      });
    } else if (tsb > 25) {
      advice.push({
        category: 'training', priority: 2, icon: '😴', color: '#74b9ff',
        title: `Too much rest (TSB: +${Math.round(tsb)})`,
        body: `TSB of +${Math.round(tsb)} is very positive - you are well recovered but slowly losing training stimulus. Fitness (CTL ${Math.round(ctl)}) drops with prolonged inactivity.`,
        action: 'Gradually resume with an endurance or sweet spot ride',
      });
    }

    // CTL level advice
    if (ctl < 20 && rides.length >= 5) {
      advice.push({
        category: 'goal', priority: 3, icon: '📊', color: '#a29bfe',
        title: `Low baseline fitness (CTL: ${Math.round(ctl)})`,
        body: `Your chronic training load (CTL ${Math.round(ctl)}) is low. Gradually increase volume by 5-10% per week. Target: CTL 40+ for competitive fitness.`,
        action: 'Add one extra endurance ride per week of 60-90 min in Zone 2',
      });
    } else if (ctl > 70) {
      advice.push({
        category: 'progression', priority: 3, icon: '🔥', color: '#cbd5e1',
        title: `Impressive fitness (CTL: ${Math.round(ctl)})`,
        body: `CTL ${Math.round(ctl)} places you in the trained-to-elite category. Consider a structured periodization block (3 weeks build + 1 week recovery) for further growth.`,
      });
    }

    // ATL spike relative to CTL
    if (atl > ctl * 1.5 && ctl > 10) {
      advice.push({
        category: 'warning', priority: 1, icon: '⚠️', color: '#ff9f43',
        title: `Acute load much higher than chronic load (ATL: ${Math.round(atl)} vs CTL: ${Math.round(ctl)})`,
        body: `Your fatigue (ATL ${Math.round(atl)}) is ${((atl / ctl - 1) * 100).toFixed(0)}% higher than your fitness (CTL ${Math.round(ctl)}). Large volume jumps significantly increase injury risk.`,
        action: 'Build up training gradually - max 10% volume increase per week',
      });
    }
  }

  return advice.sort((a, b) => a.priority - b.priority);
}
