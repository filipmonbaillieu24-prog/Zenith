/**
 * Lokaal Offline Neuraal Netwerk (MLP) Engine voor Zenith
 * 
 * Dit bestand bevat de complete, zelflerende machine learning engine van Zenith.
 * Het gebruikt herbruikbare Multi-Layer Perceptrons (MLPs) with backpropagation (SGD)
 * die volledig in de browser draaien en hun gewichten opslaan in LocalStorage.
 * 
 * Bevat 5 specifieke modellen:
 * 1. Ritnotitie sentiment classifier (Fatigue, Recovery, Illness)
 * 2. Smart Coach Trainingsadviseur
 * 3. RPE Voorspeller
 * 4. Automatische Rit-categorisatie (Label Classifier)
 * 5. eFTP & Progressie Voorspeller
 */

import { NeuralAnalysis } from '../types/workout';
import { detectClimbs } from './climbDetector';

// ─── GENERIEKE NEURAAL NETWERK KLASSE ──────────────────────────────────────────

import { SimpleMLP } from '@zenith/shared';

// ─── MODEL 1: RITNOTITIE SENTIMENT ANALYSE ──────────────────────────────────────

interface VocabItem {
  word: string;
  cat: 'fatigue' | 'recovery' | 'illness';
  weight: number;
}

const VOCAB_LIST: VocabItem[] = [
  // Vermoeidheid
  { word: 'zwaar', cat: 'fatigue', weight: 0.8 },
  { word: 'moe', cat: 'fatigue', weight: 0.9 },
  { word: 'leeg', cat: 'fatigue', weight: 0.95 },
  { word: 'kapot', cat: 'fatigue', weight: 1.0 },
  { word: 'slap', cat: 'fatigue', weight: 0.8 },
  { word: 'kramp', cat: 'fatigue', weight: 0.75 },
  { word: 'stijf', cat: 'fatigue', weight: 0.65 },
  { word: 'verzuurd', cat: 'fatigue', weight: 0.75 },
  { word: 'verzuring', cat: 'fatigue', weight: 0.7 },
  { word: 'loom', cat: 'fatigue', weight: 0.6 },
  { word: 'futloos', cat: 'fatigue', weight: 0.85 },
  { word: 'uitgeput', cat: 'fatigue', weight: 0.95 },
  { word: 'overtraind', cat: 'fatigue', weight: 1.0 },
  { word: 'zware benen', cat: 'fatigue', weight: 0.9 },
  { word: 'none kracht', cat: 'fatigue', weight: 0.95 },
  { word: 'pijnlijke benen', cat: 'fatigue', weight: 0.8 },
  { word: 'zwaarte', cat: 'fatigue', weight: 0.7 },

  // Recovery / Frisheid
  { word: 'lekker', cat: 'recovery', weight: 0.8 },
  { word: 'fit', cat: 'recovery', weight: 0.95 },
  { word: 'fris', cat: 'recovery', weight: 0.9 },
  { word: 'goed', cat: 'recovery', weight: 0.65 },
  { word: 'sterk', cat: 'recovery', weight: 0.85 },
  { word: 'soepel', cat: 'recovery', weight: 0.8 },
  { word: 'snel', cat: 'recovery', weight: 0.75 },
  { word: 'top', cat: 'recovery', weight: 0.9 },
  { word: 'heerlijk', cat: 'recovery', weight: 0.85 },
  { word: 'energie', cat: 'recovery', weight: 0.9 },
  { word: 'vliegen', cat: 'recovery', weight: 0.95 },
  { word: 'gemakkelijk', cat: 'recovery', weight: 0.75 },
  { word: 'ontspannen', cat: 'recovery', weight: 0.7 },
  { word: 'vlot', cat: 'recovery', weight: 0.8 },
  { word: 'rustig', cat: 'recovery', weight: 0.5 },
  { word: 'herstel', cat: 'recovery', weight: 0.75 },
  { word: 'geslapen', cat: 'recovery', weight: 0.6 },
  { word: 'goede benen', cat: 'recovery', weight: 0.95 },
  { word: 'super benen', cat: 'recovery', weight: 1.0 },
  { word: 'goed geslapen', cat: 'recovery', weight: 0.8 },

  // Ziekte / Pijn
  { word: 'ziek', cat: 'illness', weight: 1.0 },
  { word: 'koorts', cat: 'illness', weight: 1.0 },
  { word: 'verkouden', cat: 'illness', weight: 0.85 },
  { word: 'griep', cat: 'illness', weight: 1.0 },
  { word: 'hoesten', cat: 'illness', weight: 0.75 },
  { word: 'keelpijn', cat: 'illness', weight: 0.8 },
  { word: 'hoofdpijn', cat: 'illness', weight: 0.85 },
  { word: 'misselijk', cat: 'illness', weight: 0.9 },
  { word: 'blessure', cat: 'illness', weight: 0.95 },
  { word: 'gevallen', cat: 'illness', weight: 0.7 },
  { word: 'schaafwond', cat: 'illness', weight: 0.5 },
  { word: 'knie', cat: 'illness', weight: 0.6 },
  { word: 'rug', cat: 'illness', weight: 0.55 },
  { word: 'ontsteking', cat: 'illness', weight: 0.9 },
  { word: 'pijn', cat: 'illness', weight: 0.85 },
  { word: 'last', cat: 'illness', weight: 0.65 }
];

export const VOCABULARY = VOCAB_LIST.map(v => v.word);
const NEGATION_WORDS = ['niet', 'none', 'zonder', 'nauwelijks', 'weinig', 'nooit'];

function generateNotesDefaultWeights() {
  const W1: number[][] = Array.from({ length: VOCABULARY.length }, () => new Array(8).fill(0));
  const B1: number[] = new Array(8).fill(0.05);
  const W2: number[][] = Array.from({ length: 8 }, () => new Array(3).fill(0));
  const B2: number[] = [-0.1, 0.05, -0.15];

  VOCAB_LIST.forEach((item, i) => {
    if (item.cat === 'fatigue') {
      W1[i][0] = item.weight * 0.8;
      W1[i][1] = item.weight * 0.8;
      W1[i][2] = -item.weight * 0.4;
    } else if (item.cat === 'recovery') {
      W1[i][2] = item.weight * 0.8;
      W1[i][3] = item.weight * 0.8;
      W1[i][0] = -item.weight * 0.5;
    } else if (item.cat === 'illness') {
      W1[i][4] = item.weight * 0.9;
      W1[i][5] = item.weight * 0.9;
      W1[i][2] = -item.weight * 0.4;
    }
  });

  W2[0][0] = 0.9;  W2[0][1] = -0.7;
  W2[1][0] = 0.9;  W2[1][1] = -0.7;
  W2[2][1] = 1.0;  W2[2][0] = -0.8;
  W2[3][1] = 1.0;  W2[3][0] = -0.8;
  W2[4][2] = 1.1;  W2[4][1] = -0.5;
  W2[5][2] = 1.1;  W2[5][1] = -0.5;

  return { W1, B1, W2, B2 };
}

const notesModel = new SimpleMLP(VOCABULARY.length, 8, 3, 'cyclo_local_nn_weights', generateNotesDefaultWeights);

export function embedText(text: string): number[] {
  const normalized = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ' ').trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const vector = new Array(VOCABULARY.length).fill(0);

  VOCABULARY.forEach((vocabWord, idx) => {
    if (vocabWord.includes(' ')) {
      if (normalized.includes(vocabWord)) {
        let isNegated = false;
        const bigramIdx = normalized.indexOf(vocabWord);
        const prefixWords = normalized.substring(0, bigramIdx).trim().split(/\s+/);
        for (const w of prefixWords.slice(-3)) {
          if (NEGATION_WORDS.includes(w)) { isNegated = true; break; }
        }
        vector[idx] = isNegated ? -1 : 1;
      }
    }
  });

  words.forEach((word, wIdx) => {
    VOCABULARY.forEach((vocabWord, idx) => {
      if (vocabWord.includes(' ')) return;
      if (word === vocabWord || (word.length > 4 && word.includes(vocabWord))) {
        let isNegated = false;
        const lookback = words.slice(Math.max(0, wIdx - 3), wIdx);
        for (const prevWord of lookback) {
          if (NEGATION_WORDS.includes(prevWord)) { isNegated = true; break; }
        }
        if (vector[idx] === 0) {
          vector[idx] = isNegated ? -1 : 1;
        }
      }
    });
  });

  return vector;
}

export function analyzeNotesLocally(text: string): NeuralAnalysis {
  if (!text.trim()) return { fatigue: 0, recovery: 0, illness: 0 };
  const x = embedText(text);
  const y = notesModel.predict(x);
  return {
    fatigue: parseFloat(y[0].toFixed(2)),
    recovery: parseFloat(y[1].toFixed(2)),
    illness: parseFloat(y[2].toFixed(2))
  };
}

export function trainOnCorrection(text: string, corrected: NeuralAnalysis, learningRate: number = 0.15): NeuralAnalysis {
  const x = embedText(text);
  const targets = [corrected.fatigue, corrected.recovery, corrected.illness];
  const y = notesModel.trainLocal(x, targets, learningRate);
  return {
    fatigue: parseFloat(y[0].toFixed(2)),
    recovery: parseFloat(y[1].toFixed(2)),
    illness: parseFloat(y[2].toFixed(2))
  };
}

// ─── MODEL 2: SMART COACH TRAININGSADVISEUR ──────────────────────────────────────

const COACH_WORKOUTS = ['recovery', 'endurance', 'tempo', 'threshold', 'sweetspot', 'vo2max'] as const;

function generateCoachDefaultWeights() {
  // Input: [CTL, ATL, TSB, goal_gen, goal_climb, goal_speed, goal_end, avgRpe] (8 features)
  // Hidden: 8, Output: 6
  const W1: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const B1: number[] = new Array(8).fill(0.02);
  const W2: number[][] = Array.from({ length: 8 }, () => new Array(6).fill(0));
  const B2: number[] = new Array(6).fill(0.0);

  // Default mappings:
  // CTL & ATL inputs (indices 0 & 1)
  W1[0][0] = -0.5; W1[1][0] = 0.8; // High ATL -> Recovery
  W1[0][1] = 0.6;  W1[1][1] = -0.2; // High CTL -> Endurance
  // TSB input (index 2)
  W1[2][0] = -0.9; // Negative TSB -> Recovery (Hidden 0)
  W1[2][5] = 0.9;  // Positive TSB -> VO2max (Hidden 5)

  // Goals (indices 3, 4, 5, 6)
  W1[4][4] = 0.9;  // Climbing -> Sweetspot/Threshold
  W1[5][5] = 0.9;  // Speed -> VO2max/Tempo
  W1[6][1] = 0.9;  // Endurance -> Endurance

  // RPE (index 7)
  W1[7][0] = 0.8;  // High recent RPE -> Recovery

  // Map Hidden layer to workouts output
  W2[0][0] = 1.2;  // Hidden 0 -> Recovery
  W2[1][1] = 1.0;  // Hidden 1 -> Endurance
  W2[2][2] = 0.9;  // Hidden 2 -> Tempo
  W2[3][3] = 0.9;  // Hidden 3 -> Threshold
  W2[4][4] = 1.0;  // Hidden 4 -> Sweetspot
  W2[5][5] = 1.1;  // Hidden 5 -> VO2max

  return { W1, B1, W2, B2 };
}

const coachModel = new SimpleMLP(8, 8, 6, 'cyclo_coach_nn_weights', generateCoachDefaultWeights);

export function predictRecommendedWorkout(
  _ctl: number,
  _atl: number,
  tsb: number,
  goal: string,
  avgRpeLast3: number
): typeof COACH_WORKOUTS[number] {
  if (tsb < -25 || avgRpeLast3 > 8.0) {
    return 'recovery';
  }

  const goalVec = [
    goal === 'general' ? 1.0 : 0.0,
    goal === 'climbing' ? 1.0 : 0.0,
    goal === 'speed' ? 1.0 : 0.0,
    goal === 'endurance' ? 1.0 : 0.0
  ];

  const x = [
    Math.min(1.5, _ctl / 100),
    Math.min(1.5, _atl / 100),
    Math.max(0, Math.min(1, (tsb + 50) / 100)),
    ...goalVec,
    Math.min(1.0, avgRpeLast3 / 10)
  ];

  const y = coachModel.predict(x);
  
  let maxIdx = 0;
  for (let i = 1; i < y.length; i++) {
    if (y[i] > y[maxIdx]) maxIdx = i;
  }
  return COACH_WORKOUTS[maxIdx];
}

export function trainCoachModel(
  _ctl: number,
  _atl: number,
  _tsb: number,
  _goal: string,
  _avgRpeLast3: number,
  _selectedWorkout: typeof COACH_WORKOUTS[number]
): void {
  const goalVec = [
    _goal === 'general' ? 1.0 : 0.0,
    _goal === 'climbing' ? 1.0 : 0.0,
    _goal === 'speed' ? 1.0 : 0.0,
    _goal === 'endurance' ? 1.0 : 0.0
  ];

  const x = [
    Math.min(1.5, _ctl / 100),
    Math.min(1.5, _atl / 100),
    Math.max(0, Math.min(1, (_tsb + 50) / 100)),
    ...goalVec,
    Math.min(1.0, _avgRpeLast3 / 10)
  ];

  const targets = COACH_WORKOUTS.map(w => w === _selectedWorkout ? 0.95 : 0.05);
  coachModel.trainLocal(x, targets, 0.15);
}

// ─── MODEL 3: RPE VOORSPELLER ──────────────────────────────────────────────────

function generateRPEDefaultWeights() {
  // Input: [duration/36000, distance/200, IF, tss/500, VI-1.0, avgHR/220] (6 features)
  // Hidden: 6, Output: 1
  const W1: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.0);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [-0.2];

  // Set default mappings so high stats map to higher hidden activations, which map to output
  for (let i = 0; i < 6; i++) {
    W1[0][i] = 0.4; // duration
    W1[1][i] = 0.3; // distance
    W1[2][i] = 0.9; // IF
    W1[3][i] = 0.8; // TSS
    W1[4][i] = 0.4; // VI
    W1[5][i] = 0.6; // HR
    W2[i][0] = 0.4;
  }

  return { W1, B1, W2, B2 };
}

const rpeModel = new SimpleMLP(6, 6, 1, 'cyclo_rpe_nn_weights', generateRPEDefaultWeights);

export function predictRPE(
  duration: number,
  _distance: number,
  intensityFactor: number,
  _tss: number,
  variabilityIndex: number,
  _avgHR: number
): number {
  const x = [
    Math.min(1.5, duration / 36000),
    Math.min(1.5, _distance / 200),
    Math.min(1.5, intensityFactor),
    Math.min(1.5, _tss / 500),
    Math.max(0, Math.min(1.0, variabilityIndex - 1.0)),
    Math.min(1.5, _avgHR / 220)
  ];
  const y = rpeModel.predict(x);
  return Math.max(1, Math.min(10, Math.round(1 + y[0] * 9)));
}

export function trainRPEModel(
  _duration: number,
  _distance: number,
  _intensityFactor: number,
  _tss: number,
  _variabilityIndex: number,
  _avgHR: number,
  _actualRpe: number
): void {
  const x = [
    Math.min(1.5, _duration / 36000),
    Math.min(1.5, _distance / 200),
    Math.min(1.5, _intensityFactor),
    Math.min(1.5, _tss / 500),
    Math.max(0, Math.min(1.0, _variabilityIndex - 1.0)),
    Math.min(1.5, _avgHR / 220)
  ];
  const target = Math.max(0, Math.min(1, (_actualRpe - 1) / 9));
  rpeModel.trainLocal(x, [target], 0.15);
}

// ─── MODEL 4: RIT-CATEGORISATIE (LABEL CLASSIFIER) ──────────────────────────────

const RIDE_LABELS_KEYS = ['duurride', 'interval', 'wedstrijd', 'herstel', 'groepsride', 'pendel', 'berg'] as const;

function generateLabelDefaultWeights() {
  // Input: [IF, VI-1.0, duration/36000, elevGain/3000, hasPower, avgHR/220] (6 features)
  // Hidden: 8, Output: 7
  const W1: number[][] = Array.from({ length: 6 }, () => new Array(8).fill(0));
  const B1: number[] = new Array(8).fill(0.05);
  const W2: number[][] = Array.from({ length: 8 }, () => new Array(7).fill(0));
  const B2: number[] = new Array(7).fill(-0.1);

  // Maps:
  // IF (index 0)
  W1[0][0] = -0.5; // low IF -> herstel (output 3)
  W1[0][1] = 0.6;  // medium IF -> duurride (output 0)
  W1[0][2] = 1.0;  // high IF -> wedstrijd (output 2)
  // VI (index 1)
  W1[1][3] = 1.2;  // high VI -> interval (output 1)
  // elevGain (index 3)
  W1[3][4] = 1.5;  // high elevGain -> berg (output 6)

  // Map hidden layer to outputs
  W2[1][0] = 1.2;  // Hidden 1 -> duurride
  W2[3][1] = 1.2;  // Hidden 3 -> interval
  W2[2][2] = 1.2;  // Hidden 2 -> wedstrijd
  W2[0][3] = 1.2;  // Hidden 0 -> herstel
  W2[4][6] = 1.3;  // Hidden 4 -> berg

  return { W1, B1, W2, B2 };
}

const labelModel = new SimpleMLP(6, 8, 7, 'cyclo_label_nn_weights', generateLabelDefaultWeights);

export function predictRideLabel(
  intensityFactor: number,
  variabilityIndex: number,
  duration: number,
  elevGain: number,
  _hasPower: boolean,
  _avgHR: number
): typeof RIDE_LABELS_KEYS[number] {
  const x = [
    Math.min(1.5, intensityFactor),
    Math.max(0, Math.min(1.0, variabilityIndex - 1.0)),
    Math.min(1.5, duration / 36000),
    Math.min(1.5, elevGain / 3000),
    _hasPower ? 1.0 : 0.0,
    Math.min(1.5, _avgHR / 220)
  ];
  const y = labelModel.predict(x);
  let maxIdx = 0;
  for (let i = 1; i < y.length; i++) {
    if (y[i] > y[maxIdx]) maxIdx = i;
  }
  return RIDE_LABELS_KEYS[maxIdx];
}

export function trainLabelModel(
  _intensityFactor: number,
  _variabilityIndex: number,
  _duration: number,
  _elevGain: number,
  _hasPower: boolean,
  _avgHR: number,
  _actualLabel: typeof RIDE_LABELS_KEYS[number]
): void {
  const x = [
    Math.min(1.5, _intensityFactor),
    Math.max(0, Math.min(1.0, _variabilityIndex - 1.0)),
    Math.min(1.5, _duration / 36000),
    Math.min(1.5, _elevGain / 3000),
    _hasPower ? 1.0 : 0.0,
    Math.min(1.5, _avgHR / 220)
  ];
  const targets = RIDE_LABELS_KEYS.map(l => l === _actualLabel ? 0.95 : 0.05);
  labelModel.trainLocal(x, targets, 0.15);
}

function generateFTPDefaultWeights() {
  // Input: [currentFtp/500, ctl/100, atl/100, consistency/7, avgTssLast30/100, weightChangeKg/5] (6 features)
  // Hidden: 6, Output: 1
  const W1: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.0);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.0];

  // Higher CTL, average TSS, and consistency -> positive impact on predicted multiplier
  for (let i = 0; i < 6; i++) {
    W1[1][i] = 0.5; // ctl
    W1[3][i] = 0.6; // consistency
    W1[4][i] = 0.5; // avg tss
    W1[5][i] = -0.3; // weight gain has slight negative effect
    W2[i][0] = 0.4;
  }

  return { W1, B1, W2, B2 };
}

const ftpModel = new SimpleMLP(6, 6, 1, 'cyclo_ftp_nn_weights_v2', generateFTPDefaultWeights);

export function predictFutureFTP(
  currentFtp: number,
  ctl: number,
  atl: number,
  consistency: number, // weekly rides count, e.g. 3.5
  avgTssLast30: number,
  weightChangeKg: number = 0
): number {
  const x = [
    Math.min(1.5, (currentFtp || 220) / 500),
    Math.min(1.5, ctl / 100),
    Math.min(1.5, atl / 100),
    Math.min(1.0, (consistency || 0) / 4),
    Math.min(1.2, (avgTssLast30 || 0) / 50),
    Math.max(-1.0, Math.min(1.0, weightChangeKg / 5.0))
  ];

  const y = ftpModel.predict(x);
  // Scale output 0..1 to FTP multiplier 0.9..1.1
  const multiplier = 0.9 + y[0] * 0.2;
  return Math.round((currentFtp || 220) * multiplier);
}

export function trainFTPModel(
  currentFtp: number,
  ctl: number,
  atl: number,
  consistency: number,
  avgTssLast30: number,
  actualFtpIn8Weeks: number,
  weightChangeKg: number = 0
): void {
  const x = [
    Math.min(1.5, (currentFtp || 220) / 500),
    Math.min(1.5, ctl / 100),
    Math.min(1.5, atl / 100),
    Math.min(1.0, (consistency || 0) / 4),
    Math.min(1.2, (avgTssLast30 || 0) / 50),
    Math.max(-1.0, Math.min(1.0, weightChangeKg / 5.0))
  ];
  const target = Math.max(0, Math.min(1, ((actualFtpIn8Weeks / (currentFtp || 220)) - 0.9) / 0.2));
  ftpModel.trainLocal(x, [target], 0.15);
}

// ─── MODEL 6: OVERTRAINING & INJURY RISK ────────────────────────────────────────

function generateInjuryDefaultWeights() {
  // Input: [CTL/100, ATL/100, TSB/100, fatigueScore, illnessScore, acuteChronicRatio/3, dailySteps/20000, gymVolume/10000] (8 features)
  // Hidden: 8, Output: 1
  const W1: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const B1: number[] = new Array(8).fill(0.0);
  const W2: number[][] = Array.from({ length: 8 }, () => new Array(1).fill(0));
  const B2: number[] = [-0.15];

  for (let i = 0; i < 8; i++) {
    W1[0][i] = 0.2;  // ctl
    W1[1][i] = 0.4;  // atl
    W1[2][i] = -0.6; // tsb (negative TSB increases risk)
    W1[3][i] = 0.7;  // fatigue
    W1[4][i] = 0.9;  // illness
    W1[5][i] = 0.8;  // acute chronic ratio
    W1[6][i] = 0.5;  // daily steps
    W1[7][i] = 0.6;  // gym volume
    W2[i][0] = 0.5;
  }

  return { W1, B1, W2, B2 };
}

const injuryModel = new SimpleMLP(8, 8, 1, 'cyclo_injury_nn_weights_v2', generateInjuryDefaultWeights);

export function predictInjuryRisk(
  ctl: number,
  atl: number,
  tsb: number,
  fatigueScore: number,
  illnessScore: number,
  dailySteps: number = 0,
  recentGymVolume: number = 0
): number {
  const acRatio = ctl > 0 ? (atl / ctl) : 1.0;
  const x = [
    Math.min(1.5, ctl / 100),
    Math.min(1.5, atl / 100),
    Math.max(0, Math.min(1, (tsb + 50) / 100)),
    Math.min(1.0, fatigueScore),
    Math.min(1.0, illnessScore),
    Math.min(1.0, acRatio / 3),
    Math.min(1.0, dailySteps / 20000),
    Math.min(1.5, recentGymVolume / 10000)
  ];

  const y = injuryModel.predict(x);
  return parseFloat(y[0].toFixed(2)); // returns risk 0..1
}

export function trainInjuryModel(
  ctl: number,
  atl: number,
  tsb: number,
  fatigueScore: number,
  illnessScore: number,
  actualInjuryOccurred: boolean,
  dailySteps: number = 0,
  recentGymVolume: number = 0
): void {
  const acRatio = ctl > 0 ? (atl / ctl) : 1.0;
  const x = [
    Math.min(1.5, ctl / 100),
    Math.min(1.5, atl / 100),
    Math.max(0, Math.min(1, (tsb + 50) / 100)),
    Math.min(1.0, fatigueScore),
    Math.min(1.0, illnessScore),
    Math.min(1.0, acRatio / 3),
    Math.min(1.0, dailySteps / 20000),
    Math.min(1.5, recentGymVolume / 10000)
  ];

  injuryModel.trainLocal(x, [actualInjuryOccurred ? 0.95 : 0.05], 0.15);
}

// ─── MODEL 7: CLIMB TIME PREDICTOR ─────────────────────────────────────────────



function solveClimbingSpeed(power: number, mass: number, gradeFraction: number): number {
  const g = 9.81;
  const Crr = 0.004;
  const CdA = 0.32;
  const rho = 1.225;
  const gravityRollingCoeff = mass * g * (gradeFraction + Crr);
  const dragCoeff = 0.5 * CdA * rho; // ~0.196

  // Newton-Raphson solver to find root of f(v) = dragCoeff * v^3 + gravityRollingCoeff * v - power = 0
  let v = 5.0; // Initial guess (5 m/s = 18 km/h)
  for (let iter = 0; iter < 10; iter++) {
    const f = dragCoeff * v * v * v + gravityRollingCoeff * v - power;
    const df = 3 * dragCoeff * v * v + gravityRollingCoeff;
    const nextV = v - f / df;
    if (Math.abs(nextV - v) < 1e-4) {
      v = nextV;
      break;
    }
    v = nextV;
  }
  return Math.max(0.5, v);
}

export function predictClimbTime(
  lengthMeters: number,
  gradePct: number,
  ftp: number,
  weightKg: number,
  bodyFatPct?: number
): number {
  const riderWeight = weightKg || 75;
  // If body fat % is available, adjust power capability (lower body fat means higher effective climbing power)
  const effectivePower = bodyFatPct != null
    ? ftp * (1.0 - (bodyFatPct - 12) / 200.0) // baseline 12% body fat
    : ftp;
  const mass = riderWeight + 9; // 9 kg for bike & gear
  const gradeFraction = gradePct / 100;
  const speed = solveClimbingSpeed(effectivePower, mass, gradeFraction);
  return Math.round(lengthMeters / speed);
}

export function trainClimbModel(
  _lengthMeters: number,
  _gradePct: number,
  _ftp: number,
  _weightKg: number,
  _actualTimeSeconds: number
): void {
  // Physical model is deterministic and requires no training
}

// ─── GEAVANCEERDE LOGICA 3: CARDIALE DRIFT (HR ZONE TUNING) ─────────────────────

export function analyzeCardiacDrift(
  firstHalfPower: number,
  secondHalfPower: number,
  firstHalfHR: number,
  secondHalfHR: number,
  durationSeconds: number,
  currentLthr: number
): { decoupling: number; proposeTuning: boolean; proposedLthr: number } {
  if (!firstHalfPower || !secondHalfPower || !firstHalfHR || !secondHalfHR || durationSeconds < 3600) {
    return { decoupling: 0, proposeTuning: false, proposedLthr: currentLthr };
  }

  const p1 = firstHalfPower / firstHalfHR;
  const p2 = secondHalfPower / secondHalfHR;
  if (p1 === 0 || isNaN(p1) || isNaN(p2)) {
    return { decoupling: 0, proposeTuning: false, proposedLthr: currentLthr };
  }

  // Aerobic decoupling (cardiac drift) in %
  const decoupling = ((p1 - p2) / p1) * 100;

  // Propose LTHR changes
  let proposeTuning = false;
  let proposedLthr = currentLthr;

  // If decoupling is extremely low (<3.5%) for a ride longer than 1.5h, it indicates fit cardiovascular system.
  // We can propose a slight increase in LTHR (+2 bpm)
  if (decoupling < 3.5 && durationSeconds >= 5400) {
    proposeTuning = true;
    proposedLthr = Math.round(currentLthr + 3);
  }
  // If decoupling is very high (>12%), it shows cardiovascular fatigue or that LTHR is set too high.
  // We can propose a slight decrease in LTHR (-2 bpm)
  else if (decoupling > 12.0 && durationSeconds >= 5400) {
    proposeTuning = true;
    proposedLthr = Math.round(currentLthr - 2);
  }

  return {
    decoupling: parseFloat(decoupling.toFixed(1)),
    proposeTuning,
    proposedLthr
  };
}

// ─── GEAVANCEERDE LOGICA 4: TEMPO-ADVISEUR (PACING STRATEGY) ─────────────────────

export interface PacingAdvice {
  ratio: number;
  tip: string;
}

export function predictPacingStrategy(
  rides: Array<{
    firstHalfPower?: number;
    secondHalfPower?: number;
    avgPower?: number;
    normPower?: number;
  }>
): PacingAdvice {
  const pacedRides = rides.filter(r => r.firstHalfPower && r.secondHalfPower);
  if (pacedRides.length === 0) {
    return {
      ratio: 1.0,
      tip: "Pacing Advice: Build up your ride evenly. Try not to start too hard."
    };
  }

  const ratios = pacedRides.map(r => r.secondHalfPower! / r.firstHalfPower!);
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

  let tip = "Pacing Advice: You keep your power well distributed across your rides.";
  if (avgRatio < 0.90) {
    tip = "Pacing Advice: You have a tendency to drop power in the second half (>10% decay). Try starting the first 30% of your ride 10-15 Watts below target power (a negative split strategy).";
  } else if (avgRatio > 1.03) {
    tip = "Pacing Advice: You finish your rides very strong with reserve left. You can start 5-10 Watts more intensively during your next endurance ride.";
  } else if (avgRatio >= 0.95 && avgRatio <= 1.02) {
    tip = "Pacing Advice: Excellent pacing! Your average decay is minimal. Keep up this flat pacing strategy.";
  }

  return {
    ratio: parseFloat(avgRatio.toFixed(2)),
    tip
  };
}

// ─── MODEL 8: CADANS-EFFICIËNTIE TUNER ────────────────────────────────────────

function generateCadenceDefaultWeights() {
  // Input: [power / 500] (1 feature)
  // Hidden: 6, Output: 1
  const W1: number[][] = Array.from({ length: 1 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.0);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.2]; // base output

  for (let i = 0; i < 6; i++) {
    W1[0][i] = 0.5; // higher power increases optimal cadence
    W2[i][0] = 0.4;
  }

  return { W1, B1, W2, B2 };
}

const cadenceModel = new SimpleMLP(1, 6, 1, 'cyclo_cadence_weights', generateCadenceDefaultWeights);

export function predictOptimalCadence(power: number): number {
  const x = [Math.min(1.5, power / 500)];
  const y = cadenceModel.predict(x);
  // Scale output 0..1 to cadence range 60..120 rpm
  return Math.round(60 + y[0] * 60);
}

export function trainOptimalCadence(power: number, bestCadence: number): void {
  const x = [Math.min(1.5, power / 500)];
  const target = Math.max(0, Math.min(1, (bestCadence - 60) / 60));
  cadenceModel.trainLocal(x, [target], 0.15);
}

// ─── MODEL 9: GPX-ROUTE RITDUUR VOORSPELLER ─────────────────────────────────────

function generateRouteDurationDefaultWeights() {
  // Input: [distanceKm/200, elevGainM/3000, ftp/500, weightKg/150] (4 features)
  // Hidden: 6, Output: 1
  const W1: number[][] = Array.from({ length: 4 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.05);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [-0.15];

  for (let i = 0; i < 6; i++) {
    W1[0][i] = 1.2;  // distance increases duration
    W1[1][i] = 0.8;  // elevation gain increases duration
    W1[2][i] = -0.4; // higher FTP decreases duration
    W1[3][i] = 0.3;  // higher weight increases duration
    W2[i][0] = 0.6;
  }

  return { W1, B1, W2, B2 };
}

const routeDurationModel = new SimpleMLP(4, 6, 1, 'cyclo_route_duration_weights', generateRouteDurationDefaultWeights);

export function predictRouteDuration(
  distanceKm: number,
  elevGainM: number,
  ftp: number,
  weightKg: number,
  windSpeedKmh: number = 0,
  windAngleRad?: number
): number {
  const x = [
    Math.min(1.5, distanceKm / 200),
    Math.min(1.5, elevGainM / 3000),
    Math.min(1.5, (ftp || 220) / 500),
    Math.min(1.5, (weightKg || 75) / 150)
  ];

  const y = routeDurationModel.predict(x);
  // Scale output 0..1 to duration range 0..28800s (8 hours)
  // Let's set a logical minimum based on a maximum speed of 45km/h
  const minTime = (distanceKm / 45) * 3600;
  const predicted = y[0] * 28800;
  const baseDuration = Math.round(Math.max(minTime, predicted));

  if (windSpeedKmh <= 0) return baseDuration;

  let windMultiplier = 1.0;
  if (windAngleRad != null) {
    // Point-to-point wind angle: headwind slows down, tailwind speeds up
    const headwindAlignment = Math.cos(windAngleRad); // -1 = pure headwind, +1 = pure tailwind
    const windEffect = (windSpeedKmh / 36) * 0.12 * (-headwindAlignment);
    windMultiplier = Math.max(0.75, Math.min(1.35, 1 + windEffect));
  } else {
    // Loop route wind penalty: headwind portion costs more time than tailwind saves
    const windEffect = (windSpeedKmh / 36) * 0.04;
    windMultiplier = 1 + windEffect;
  }

  return Math.round(baseDuration * windMultiplier);
}

export function trainRouteDurationModel(
  distanceKm: number,
  elevGainM: number,
  ftp: number,
  weightKg: number,
  actualDurationSeconds: number
): void {
  const x = [
    Math.min(1.5, distanceKm / 200),
    Math.min(1.5, elevGainM / 3000),
    Math.min(1.5, (ftp || 220) / 500),
    Math.min(1.5, (weightKg || 75) / 150)
  ];

  const target = Math.max(0, Math.min(1, actualDurationSeconds / 28800));
  routeDurationModel.trainLocal(x, [target], 0.15);
}

// ─── MODEL 10: SUBMAXIMALE VO2MAX SCHATTER ─────────────────────────────────────

function generateVO2maxDefaultWeights() {
  // Input: [avgPower/500, avgHR/220, hrRecovery/100, weightKg/150] (4 features)
  // Hidden: 6, Output: 1
  const W1: number[][] = Array.from({ length: 4 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.0);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.2];

  for (let i = 0; i < 6; i++) {
    W1[0][i] = 0.8;  // avgPower increases VO2max
    W1[1][i] = -0.5; // lower avgHR for same power increases VO2max
    W1[2][i] = 0.7;  // higher HR recovery increases VO2max
    W1[3][i] = -0.4; // higher weight (mass) decreases relative VO2max
    W2[i][0] = 0.5;
  }

  return { W1, B1, W2, B2 };
}

const vo2maxModel = new SimpleMLP(4, 6, 1, 'cyclo_vo2max_weights', generateVO2maxDefaultWeights);

export function predictVO2max(
  avgPower: number,
  avgHR: number,
  hrRecovery: number,
  weightKg: number
): number {
  const x = [
    Math.min(1.5, (avgPower || 180) / 500),
    Math.min(1.5, (avgHR || 135) / 220),
    Math.min(1.5, (hrRecovery || 30) / 100),
    Math.min(1.5, (weightKg || 75) / 150)
  ];

  const y = vo2maxModel.predict(x);
  // Scale output 0..1 to VO2max range 20..90 ml/kg/min
  return parseFloat((20 + y[0] * 70).toFixed(1));
}

export function trainVO2maxModel(
  avgPower: number,
  avgHR: number,
  hrRecovery: number,
  weightKg: number,
  actualVO2max: number
): void {
  const x = [
    Math.min(1.5, (avgPower || 180) / 500),
    Math.min(1.5, (avgHR || 135) / 220),
    Math.min(1.5, (hrRecovery || 30) / 100),
    Math.min(1.5, (weightKg || 75) / 150)
  ];

  const target = Math.max(0, Math.min(1, (actualVO2max - 20) / 70));
  vo2maxModel.trainLocal(x, [target], 0.15);
}

// ─── GEAVANCEERDE LOGICA 5: KLIMSTIJL CLASSIFICATOR ─────────────────────────────

export interface ClimbingStyleAdvice {
  style: string;
  desc: string;
}

export function classifyClimbingStyle(climbCadence: number): ClimbingStyleAdvice {
  if (!climbCadence || climbCadence <= 0) {
    return {
      style: "Unknown",
      desc: "No climbing data with cadence available."
    };
  }

  if (climbCadence > 82) {
    return {
      style: "Cadence Climber (Froome style)",
      desc: "You climb with a high cadence. This unloads your muscles and shifts emphasis to your cardiovascular system. Choose a light gear."
    };
  } else {
    return {
      style: "Power Climber (Ullrich style)",
      desc: "You climb on pure power with a lower cadence. This demands a lot from your muscles and glycogen stores. Watch out for fatigue!"
    };
  }
}

export function classifyDiscipline(
  avgSpeedKmh: number,
  elevGainM: number,
  distanceKm: number
): 'road' | 'gravel' | 'mtb' {
  if (distanceKm <= 0) return 'road';
  const elevPerKm = elevGainM / distanceKm;
  
  if (avgSpeedKmh < 18) {
    return elevPerKm > 15 ? 'mtb' : 'gravel';
  } else if (avgSpeedKmh > 26) {
    return 'road';
  } else {
    // 18 - 26 km/h
    return elevPerKm > 18 ? 'gravel' : 'road';
  }
}

// ─── RIDER TYPE CLASSIFIER ─────────────────────────────────────────────────────
// Classifies rider archetype based on power-duration curve shape

export interface RiderTypeResult {
  type: 'Sprinter' | 'Klimmer' | 'Diesel' | 'All-Rounder';
  emoji: string;
  confidence: number; // 0..1
  description: string;
  strengths: string[];
  focusTip: string;
}

export function classifyRiderType(
  bestEfforts: { s5?: number; m1?: number; m5?: number; m20?: number } | null | undefined,
  weight: number
): RiderTypeResult {
  const defaults: RiderTypeResult = {
    type: 'All-Rounder',
    emoji: '⚡',
    confidence: 0.4,
    description: 'Your power profile is balanced across all duration categories.',
    strengths: ['Versatility', 'Stable Power'],
    focusTip: 'Upload more rides with wattage for a more precise profiling.'
  };

  if (!bestEfforts) return defaults;
  const { s5 = 0, m1 = 0, m5 = 0, m20 = 0 } = bestEfforts;
  if (!m20 || m20 === 0) return defaults;

  // W/kg ratios
  const wkg5s  = s5  / weight;
  const wkg1m  = m1  / weight;
  const wkg5m  = m5  / weight;
  const wkg20m = m20 / weight;

  // Sprint index: 5s relative to 20m (high = sprinter)
  const sprintIndex   = wkg5s  / Math.max(wkg20m, 1);
  // VO2 index: 5m relative to 20m (high = VO2max climber)
  const vo2Index      = wkg5m  / Math.max(wkg20m, 1);
  // Anaerobic index: 1m relative to 20m
  const anaerobicIdx  = wkg1m  / Math.max(wkg20m, 1);

  if (sprintIndex > 3.5) {
    return {
      type: 'Sprinter',
      emoji: '🚀',
      confidence: Math.min(0.95, (sprintIndex - 3.5) / 2 + 0.6),
      description: `Your 5-second peak (${wkg5s.toFixed(1)} W/kg) is exceptionally high compared to your FTP. Typical profile of a sprinter or criterium specialist.`,
      strengths: ['Explosiveness', 'Sprint', 'Short Hills'],
      focusTip: 'Strengthen your threshold endurance with longer sweet spot workouts to raise your FTP.'
    };
  }

  if (vo2Index > 1.35 && wkg5m > 4.5) {
    return {
      type: 'Klimmer',
      emoji: '⛰️',
      confidence: Math.min(0.92, (vo2Index - 1.35) / 0.4 + 0.6),
      description: `Your VO2max power (5 min: ${wkg5m.toFixed(1)} W/kg) is high relative to your threshold. Perfect for long climbs and mountain rides.`,
      strengths: ['VO2max', 'Climbing Ability', 'Aerobic Efficiency'],
      focusTip: 'Work on your sprint and 1-minute power to follow moves on flat terrain and in sprints.'
    };
  }

  if (anaerobicIdx < 1.6 && vo2Index < 1.25) {
    return {
      type: 'Diesel',
      emoji: '🛞',
      confidence: Math.min(0.88, 0.65 + (1.25 - vo2Index) * 0.5),
      description: `Your power is very stable over long durations. Your FTP (${wkg20m.toFixed(1)} W/kg) is your strongest weapon — you are a pure endurance athlete.`,
      strengths: ['Endurance', 'TSS Capacity', 'Long Rides'],
      focusTip: 'Add VO2max intervals (4-6 min at 110-120% FTP) to raise your ceiling.'
    };
  }

  return {
    type: 'All-Rounder',
    emoji: '⚡',
    confidence: 0.65,
    description: `Your power profile (${wkg20m.toFixed(1)} W/kg FTP) is balanced — you can follow on climbs and on the flat. You are a versatile rider.`,
    strengths: ['Versatility', 'Adaptability'],
    focusTip: 'Choose a seasonal goal (climbing, criteriums or granfondos) and shape your profile in that direction.'
  };
}

// ─── TRAINING PROFILE ANALYZER ────────────────────────────────────────────────
// Volume-atleet vs intensiteitsatleet op basis van TSS-verdeling

export interface TrainingProfileResult {
  profile: 'Volume Athlete' | 'Intensity Athlete' | 'Mixed';
  emoji: string;
  avgWeeklyHours: number;
  avgIntensityFactor: number;
  description: string;
  tip: string;
}

export function analyzeTrainingProfile(
  rides: { duration: number; tss?: number; hrTSS?: number; hasPower?: boolean }[]
): TrainingProfileResult {
  if (rides.length < 3) {
    return {
      profile: 'Mixed',
      emoji: '📊',
      avgWeeklyHours: 0,
      avgIntensityFactor: 0,
      description: 'Upload at least 3 rides to determine your training type.',
      tip: 'Keep uploading rides for a more accurate analysis.'
    };
  }

  const totalHours = rides.reduce((s, r) => s + r.duration, 0) / 3600;
  const weeks = Math.max(1, (rides.length / 4)); // rough estimate
  const avgWeeklyHours = parseFloat((totalHours / weeks).toFixed(1));

  // Average IF (intensity factor) ≈ sqrt(TSS / (duration_hours * 100))
  const ridesWithTss = rides.filter(r => (r.tss ?? r.hrTSS ?? 0) > 0);
  const avgIf = ridesWithTss.length > 0
    ? ridesWithTss.reduce((s, r) => {
        const tss = r.tss ?? r.hrTSS ?? 0;
        const h = r.duration / 3600;
        return s + (h > 0 ? Math.sqrt(tss / (h * 100)) : 0);
      }, 0) / ridesWithTss.length
    : 0.7;

  if (avgWeeklyHours >= 8 && avgIf < 0.72) {
    return {
      profile: 'Volume Athlete',
      emoji: '🏔️',
      avgWeeklyHours,
      avgIntensityFactor: parseFloat(avgIf.toFixed(2)),
      description: `You train many hours per week (${avgWeeklyHours}h) at a relatively low intensity (IF ≈ ${avgIf.toFixed(2)}). Typical profile of an endurance athlete logging big base mileage.`,
      tip: 'Add 1-2 intense sessions per week (threshold, VO2max) to improve faster.'
    };
  }

  if (avgIf > 0.78) {
    return {
      profile: 'Intensity Athlete',
      emoji: '⚡',
      avgWeeklyHours,
      avgIntensityFactor: parseFloat(avgIf.toFixed(2)),
      description: `You ride relatively short but hard (IF ≈ ${avgIf.toFixed(2)}). Typical profile of someone focusing on interval training and high efforts.`,
      tip: 'Add more easy Zone 2 rides for a better aerobic base and faster recovery.'
    };
  }

  return {
    profile: 'Mixed',
    emoji: '⚖️',
    avgWeeklyHours,
    avgIntensityFactor: parseFloat(avgIf.toFixed(2)),
    description: `Your training is well balanced between volume (${avgWeeklyHours}h/week) and intensity (IF ≈ ${avgIf.toFixed(2)}). A healthy mix for progression.`,
    tip: 'Maintain this balance and vary your training blocks seasonally.'
  };
}

export function calibrateSummaryModels(
  rides: { date: number; distance: number; elevGain: number; duration: number; eFTP?: number; ctl?: number; atl?: number; tss?: number; hrTSS?: number }[],
  ftp: number,
  weight: number
): void {
  const validRides = rides.filter(r => r.distance > 0 && r.duration > 0);
  if (validRides.length === 0) return;

  // 1. Train Route Duration Model (100 epochs)
  const epochs = 100;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const shuffled = [...validRides].sort(() => Math.random() - 0.5);
    for (const r of shuffled) {
      trainRouteDurationModel(r.distance, r.elevGain, ftp, weight, r.duration);
    }
  }

  // 2. Train FTP Model (chronological transitions)
  const sortedRides = [...rides].sort((a, b) => a.date - b.date);
  for (let i = 0; i < sortedRides.length - 1; i++) {
    const r1 = sortedRides[i];
    const r2 = sortedRides.slice(i + 1).find(r => r.date - r1.date >= 14 * 24 * 3600 * 1000 && r.date - r1.date <= 30 * 24 * 3600 * 1000);
    if (r2 && r1.eFTP && r2.eFTP) {
      trainFTPModel(
        r1.eFTP,
        r1.ctl ?? 40,
        r1.atl ?? 40,
        85, // consistency score baseline
        (r1.tss ?? r1.hrTSS ?? 100) * 4, // weekly TSS load estimate
        r2.eFTP
      );
    }
  }

  // 3. Train Injury Model (using ACWR load zones)
  for (const r of validRides) {
    if (r.ctl && r.atl) {
      const acwr = r.ctl > 0 ? r.atl / r.ctl : 1.0;
      const isHighRisk = acwr > 1.5 || acwr < 0.5;
      trainInjuryModel(
        r.ctl,
        r.atl,
        r.ctl - r.atl,
        Math.min(1.0, Math.max(0, (r.atl - r.ctl) / 50)), // fatigue proxy
        acwr > 1.3 ? 0.8 : 0.1, // illness risk proxy (0..1)
        isHighRisk
      );
    }
  }
}

export function calibrateFullModels(
  rides: { id: string; avgPower?: number; avgHR?: number; bestEfforts?: { m5?: number }; weight?: number }[],
  allRidesFull: { id: string; points: any[] }[],
  ftp: number,
  weight: number
): void {
  for (const r of rides) {
    const full = allRidesFull.find(f => f.id === r.id);
    if (!full || !full.points || full.points.length === 0) continue;

    const riderWeight = r.weight ?? weight ?? 75;

    // A. Train VO2max Model (if 5-minute peak power is available)
    if (r.bestEfforts?.m5 && r.bestEfforts.m5 > 0 && r.avgHR && r.avgPower) {
      const actualVO2max = (10.8 * r.bestEfforts.m5 / riderWeight) + 7;
      trainVO2maxModel(
        r.avgPower,
        r.avgHR,
        30, // HR recovery baseline
        riderWeight,
        actualVO2max
      );
    }

    // B. Train Climb Model (detecting hill segments inside GPS coordinates)
    const climbs = detectClimbs(full.points);
    for (const climb of climbs) {
      const climbPoints = full.points.slice(climb.startIndex, climb.endIndex + 1);
      if (climbPoints.length >= 2) {
        const climbTimeSec = (climbPoints[climbPoints.length - 1].time - climbPoints[0].time) / 1000;
        if (climbTimeSec > 30) {
          trainClimbModel(
            climb.lengthMeters,
            climb.avgGrade,
            ftp,
            riderWeight,
            climbTimeSec
          );
        }
      }
    }
  }
}

// Initialisatie functie die Aero aanroept bij login
export async function initializeModels(supabase: any, userId: string): Promise<void> {
  await Promise.all([
    notesModel.loadOrInit(supabase, userId),
    coachModel.loadOrInit(supabase, userId),
    rpeModel.loadOrInit(supabase, userId),
    labelModel.loadOrInit(supabase, userId),
    ftpModel.loadOrInit(supabase, userId),
    injuryModel.loadOrInit(supabase, userId),
    cadenceModel.loadOrInit(supabase, userId),
    routeDurationModel.loadOrInit(supabase, userId),
    vo2maxModel.loadOrInit(supabase, userId),
  ]);
}

export function resetAllWeights() {
  notesModel.reset();
  coachModel.reset();
  rpeModel.reset();
  labelModel.reset();
  ftpModel.reset();
  injuryModel.reset();
  cadenceModel.reset();
  routeDurationModel.reset();
  vo2maxModel.reset();
}
