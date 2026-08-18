export interface WorkoutBlock {
  name: string;
  duration: number; // in seconds
  powerPct: number; // e.g. 0.65 for 65% FTP
  zone: number;     // 1 to 5
  color: string;
}

export interface Workout {
  title: string;
  description: string;
  type: 'recovery' | 'endurance' | 'sweetspot' | 'threshold' | 'vo2max';
  blocks: WorkoutBlock[];
}


// Bepaal de aanbevolen workout op basis van de actuele TSB (Vorm), actieve focus en trainingsfase
export function getRecommendedWorkoutType(
  tsb: number,
  goalType?: 'event' | 'continuous',
  activeFocus?: 'ftp' | 'endurance' | 'recovery' | 'vo2max',
  phase?: 'base' | 'build' | 'peak' | 'race' | 'recovery'
): 'recovery' | 'endurance' | 'sweetspot' | 'threshold' | 'vo2max' {
  // 1. Krideiek oververmoeidheid-override: Altijd herstelride/rust als TSB onder -20 zakt!
  if (tsb < -20) {
    return 'recovery';
  }

  // 2. Doorlopende focus overrides
  if (goalType === 'continuous' && activeFocus) {
    if (activeFocus === 'recovery') return 'recovery';
    if (activeFocus === 'endurance') return 'endurance';
    if (activeFocus === 'ftp') {
      return tsb > 5 ? 'threshold' : 'sweetspot';
    }
    if (activeFocus === 'vo2max') return 'vo2max';
  }

  // 3. Event trainingsfase overrides
  if (goalType === 'event' && phase) {
    if (phase === 'recovery' || phase === 'race') return 'recovery';
    if (phase === 'base') return 'endurance';
    if (phase === 'build') {
      return tsb > 5 ? 'threshold' : 'sweetspot';
    }
    if (phase === 'peak') {
      return tsb > 8 ? 'vo2max' : 'sweetspot';
    }
  }

  // 4. Standaard fysiologische TSB fallback
  if (tsb < -5) {
    return 'endurance';
  } else if (tsb > 15) {
    return 'threshold';
  } else if (tsb > 8) {
    return 'vo2max';
  } else {
    return 'sweetspot';
  }
}


// Genereer de workout blokken op basis van type en beschikbare tijd
export function generateWorkout(
  type: 'recovery' | 'endurance' | 'sweetspot' | 'threshold' | 'vo2max',
  durationMinutes: number
): Workout {

  const durationSeconds = durationMinutes * 60;
  const blocks: WorkoutBlock[] = [];
  
  let title = '';
  let description = '';
  
  const zoneColors = [
    '#94a3b8', // Zone 1 (Slate)
    '#00b894', // Zone 2 (Groen)
    '#fdcb6e', // Zone 3 (Tempo/Goud)
    '#ff7675', // Zone 4 (Threshold/Rood)
    '#d63031'  // Zone 5 (VO2Max)
  ];

  switch (type) {
    case 'recovery':
      title = 'Actief Recovery (Active Recovery)';
      description = 'Een korte, zeer lichte ride gericht op het stimuleren van de doorbloeding om spierherstel te bevorderen.';
      
      // Warm-up: 15% of duration
      const recWu = Math.round(durationSeconds * 0.15);
      // Cool-down: 15% of duration
      const recCd = Math.round(durationSeconds * 0.15);
      const recMain = durationSeconds - recWu - recCd;
      
      blocks.push({ name: 'Warm-up', duration: recWu, powerPct: 0.45, zone: 1, color: zoneColors[0] });
      blocks.push({ name: 'Recoveryzone', duration: recMain, powerPct: 0.52, zone: 1, color: zoneColors[0] });
      blocks.push({ name: 'Cool-down', duration: recCd, powerPct: 0.40, zone: 1, color: zoneColors[0] });
      break;

    case 'endurance':
      title = 'Aerobe Basisduur (Endurance)';
      description = 'De klassieke duurride. Essentieel voor de opbouw van je aerobe basissysteem en vetverbranding.';
      
      // Warm-up: 10 min
      const endWu = Math.min(600, Math.round(durationSeconds * 0.15));
      // Cool-down: 5 min
      const endCd = Math.min(300, Math.round(durationSeconds * 0.08));
      const endMain = durationSeconds - endWu - endCd;
      
      blocks.push({ name: 'Warm-up', duration: endWu, powerPct: 0.50, zone: 1, color: zoneColors[0] });
      blocks.push({ name: 'Duurzone (Z2)', duration: endMain, powerPct: 0.65, zone: 2, color: zoneColors[1] });
      blocks.push({ name: 'Cool-down', duration: endCd, powerPct: 0.48, zone: 1, color: zoneColors[0] });
      break;

    case 'sweetspot':
      title = 'Sweet Spot Intervallen';
      description = 'Rijden op 88% van je FTP. Dit levert maximale aerobe winst op with minimale opbouw van vermoeidheid.';
      
      // Warm-up: 15%
      const ssWu = Math.min(600, Math.round(durationSeconds * 0.15));
      // Cool-down: 10%
      const ssCd = Math.min(450, Math.round(durationSeconds * 0.10));
      const ssRemaining = durationSeconds - ssWu - ssCd;
      
      // Bepaal aantal intervallen op basis van totale tijd
      // 45m: 2x 10 min (5m herstel)
      // 60m: 2x 15 min (5m herstel)
      // 90m: 3x 15 min (5m herstel)
      let numIntervals = 2;
      if (durationMinutes >= 80) numIntervals = 3;
      
      const ssRecoveryTime = Math.min(300, Math.round(ssRemaining * 0.15));
      const totalIntervalTime = ssRemaining - (ssRecoveryTime * (numIntervals - 1));
      const singleIntervalDuration = Math.round(totalIntervalTime / numIntervals);
      
      blocks.push({ name: 'Warm-up', duration: ssWu, powerPct: 0.55, zone: 1, color: zoneColors[0] });
      for (let i = 0; i < numIntervals; i++) {
        blocks.push({ name: `Sweet Spot Int ${i+1}`, duration: singleIntervalDuration, powerPct: 0.88, zone: 3, color: zoneColors[2] });
        if (i < numIntervals - 1) {
          blocks.push({ name: 'Actief Recovery', duration: ssRecoveryTime, powerPct: 0.50, zone: 1, color: zoneColors[0] });
        }
      }
      blocks.push({ name: 'Cool-down', duration: ssCd, powerPct: 0.45, zone: 1, color: zoneColors[0] });
      break;

    case 'threshold':
      title = 'Threshold Intervallen (FTP)';
      description = 'Zware intervallen exact op je anaerobe drempel (FTP) om je vermogen om verzuring te verdragen te vergroten.';
      
      // Warm-up: Ramping up to 70%
      const thWu = Math.min(720, Math.round(durationSeconds * 0.18));
      // Cool-down: 10%
      const thCd = Math.min(480, Math.round(durationSeconds * 0.10));
      const thRemaining = durationSeconds - thWu - thCd;
      
      let thIntervals = 2;
      if (durationMinutes >= 80) thIntervals = 3;
      
      const thRecoveryTime = Math.min(360, Math.round(thRemaining * 0.20));
      const thTotalIntervalTime = thRemaining - (thRecoveryTime * (thIntervals - 1));
      const thSingleIntervalDuration = Math.round(thTotalIntervalTime / thIntervals);
      
      blocks.push({ name: 'Warm-up (Ramp)', duration: thWu, powerPct: 0.60, zone: 1, color: zoneColors[0] });
      for (let i = 0; i < thIntervals; i++) {
        blocks.push({ name: `Threshold Int ${i+1}`, duration: thSingleIntervalDuration, powerPct: 1.00, zone: 4, color: zoneColors[3] });
        if (i < thIntervals - 1) {
          blocks.push({ name: 'Recovery', duration: thRecoveryTime, powerPct: 0.52, zone: 1, color: zoneColors[0] });
        }
      }
      blocks.push({ name: 'Cool-down', duration: thCd, powerPct: 0.46, zone: 1, color: zoneColors[0] });
      break;
    case 'vo2max': {
      title = 'VO2max Intervallen';
      description = 'Korte, explosieve intervals op 110–120% FTP om je maximale zuurstofopname te verhogen. Deze training geeft de sterkste aanpassing van je aerobe systeem.';

      const voWu = Math.min(720, Math.round(durationSeconds * 0.20));
      const voCd = Math.min(480, Math.round(durationSeconds * 0.12));
      const voRemaining = durationSeconds - voWu - voCd;

      // 4 min aan / 4 min herstel (4x4 Norw stijl) bij >= 60 min
      // 40s aan / 20s herstel bij kortere duur
      let intervalOn: number;
      let intervalOff: number;
      let numSets: number;

      if (durationMinutes >= 75) {
        intervalOn  = 240; // 4 min
        intervalOff = 240; // 4 min
        numSets = Math.min(5, Math.floor(voRemaining / (intervalOn + intervalOff)));
      } else if (durationMinutes >= 55) {
        intervalOn  = 180; // 3 min
        intervalOff = 180; // 3 min
        numSets = Math.min(5, Math.floor(voRemaining / (intervalOn + intervalOff)));
      } else {
        intervalOn  = 40;  // 40s
        intervalOff = 20;  // 20s
        numSets = Math.min(8, Math.floor(voRemaining / (intervalOn + intervalOff)));
      }

      blocks.push({ name: 'Warm-up (Ramp)', duration: voWu, powerPct: 0.62, zone: 1, color: zoneColors[0] });
      for (let i = 0; i < numSets; i++) {
        blocks.push({ name: `VO2 Interval ${i + 1}`, duration: intervalOn,  powerPct: 1.15, zone: 5, color: '#d63031' });
        if (i < numSets - 1) {
          blocks.push({ name: 'Recovery',             duration: intervalOff, powerPct: 0.50, zone: 1, color: zoneColors[0] });
        }
      }
      blocks.push({ name: 'Cool-down', duration: voCd, powerPct: 0.46, zone: 1, color: zoneColors[0] });
      break;
    }
  }

  return {
    title,
    description,
    type,
    blocks
  };
}
