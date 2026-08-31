/**
 * Local Offline Neural Network (MLP) Engine for Zenith
 *
 * This file contains Zenith's complete, self-learning machine learning engine.
 * It uses reusable Multi-Layer Perceptrons (MLPs) with backpropagation (SGD)
 * that run entirely in the browser and store their weights in LocalStorage.
 *
 * Contains 5 specific models:
 * 1. Ride note sentiment classifier (Fatigue, Recovery, Illness)
 * 2. Smart Coach Training Advisor
 * 3. RPE Predictor
 * 4. Automatic ride categorization (Label Classifier)
 * 5. eFTP & Progression Predictor
 */

import { NeuralAnalysis } from '../types/workout';
import { detectClimbs } from './climbDetector';

// ─── GENERIC NEURAL NETWORK CLASS ──────────────────────────────────────────

import { SimpleMLP } from '@zenith/shared';

// ─── MODEL 1: RIDE NOTE SENTIMENT ANALYSIS ──────────────────────────────────────

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

// ─── MODEL 2: SMART COACH TRAINING ADVISOR ──────────────────────────────────────

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

// ─── MODEL 3: RPE PREDICTOR ──────────────────────────────────────────────────

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

// ─── MODEL 4: RIDE CATEGORIZATION (LABEL CLASSIFIER) ──────────────────────────────

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





// ─── MODEL 7: CLIMB TIME PREDICTOR (physics model + per-rider calibration) ────
//
// predictClimbTime itself is a deterministic Newton-Raphson power/drag/gravity solve —
// not a neural net. What genuinely "learns from your rides" is the calibration layer
// below: after each climb we compare the physics model's estimate to what the rider
// actually recorded, and nudge a persistent per-rider resistance correction factor
// (effectively CdA + Crr combined) with an exponential moving average. That correction
// is then applied to every future prediction, so the model's real-world accuracy for
// THIS rider improves over time instead of being static.

const CLIMB_CALIBRATION_STORAGE_KEY = 'cyclo_climb_calibration_v1';

interface ClimbCalibrationState {
  /** EMA-learned multiplier applied to the default CdA & Crr assumptions for this rider.
   * 1.0 = no correction (use textbook defaults). >1 = rider is slower than the textbook
   * physics predicts (more drag/rolling resistance than assumed), <1 = faster. */
  resistanceFactor: number;
  sampleCount: number;
}

function loadClimbCalibration(): ClimbCalibrationState {
  try {
    const raw = localStorage.getItem(CLIMB_CALIBRATION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.resistanceFactor === 'number' && typeof parsed.sampleCount === 'number') {
        return parsed;
      }
    }
  } catch { /* localStorage unavailable */ }
  return { resistanceFactor: 1.0, sampleCount: 0 };
}

let climbCalibration: ClimbCalibrationState = loadClimbCalibration();

function saveClimbCalibration(): void {
  try {
    localStorage.setItem(CLIMB_CALIBRATION_STORAGE_KEY, JSON.stringify(climbCalibration));
  } catch { /* localStorage unavailable */ }
}

/** Exposes the current per-rider calibration (e.g. for a "model confidence" UI). */
export function getClimbCalibrationState(): ClimbCalibrationState {
  return { ...climbCalibration };
}

export function resetClimbCalibration(): void {
  climbCalibration = { resistanceFactor: 1.0, sampleCount: 0 };
  saveClimbCalibration();
}

function solveClimbingSpeed(power: number, mass: number, gradeFraction: number, resistanceFactor: number = 1.0): number {
  const g = 9.81;
  const Crr = 0.004 * resistanceFactor;
  const CdA = 0.32 * resistanceFactor;
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
  const speed = solveClimbingSpeed(effectivePower, mass, gradeFraction, climbCalibration.resistanceFactor);
  return Math.round(lengthMeters / speed);
}

/**
 * Finds the resistance factor (applied to CdA & Crr together) that would have made the
 * physics model's predicted time match what the rider actually recorded for this climb.
 * solveClimbingSpeed's resulting time is monotonically increasing in resistanceFactor
 * (more drag/rolling resistance -> lower speed -> longer time), so a simple bisection
 * search finds it reliably without needing a full gradient-based fit.
 */
function impliedResistanceFactor(
  lengthMeters: number,
  power: number,
  mass: number,
  gradeFraction: number,
  actualTimeSeconds: number
): number {
  let lo = 0.4;
  let hi = 2.5;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    const time = lengthMeters / solveClimbingSpeed(power, mass, gradeFraction, mid);
    if (time < actualTimeSeconds) {
      lo = mid; // predicted too fast -> needs more resistance to slow down further
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

export function trainClimbModel(
  lengthMeters: number,
  gradePct: number,
  ftp: number,
  weightKg: number,
  actualTimeSeconds: number
): void {
  if (!lengthMeters || lengthMeters <= 0 || !actualTimeSeconds || actualTimeSeconds <= 0 || !ftp || ftp <= 0) {
    return;
  }

  const riderWeight = weightKg || 75;
  const mass = riderWeight + 9;
  const gradeFraction = gradePct / 100;

  // Guard against wildly unrealistic climb segments (coasting, red lights, bad GPS split)
  // that would otherwise corrupt the calibration with a single noisy outlier.
  const uncalibratedTime = lengthMeters / solveClimbingSpeed(ftp, mass, gradeFraction, 1.0);
  const ratio = actualTimeSeconds / uncalibratedTime;
  if (ratio < 0.4 || ratio > 3.0) return;

  const implied = impliedResistanceFactor(lengthMeters, ftp, mass, gradeFraction, actualTimeSeconds);

  // Exponential moving average: learn faster from the first few climbs, then stabilize so
  // a single bad ride can't swing the rider's calibration too far.
  const alpha = climbCalibration.sampleCount < 5 ? 0.3 : 0.1;
  const blended = climbCalibration.resistanceFactor * (1 - alpha) + implied * alpha;

  climbCalibration = {
    resistanceFactor: Math.max(0.6, Math.min(1.8, blended)),
    sampleCount: climbCalibration.sampleCount + 1
  };
  saveClimbCalibration();
}

// ─── ADVANCED LOGIC 3: CARDIAC DRIFT (HR ZONE TUNING) ─────────────────────

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

// ─── ADVANCED LOGIC 4: PACE ADVISOR (PACING STRATEGY) ─────────────────────

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

// ─── MODEL 8: CADENCE EFFICIENCY TUNER ────────────────────────────────────────

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

// ─── MODEL 9: GPX ROUTE RIDE DURATION PREDICTOR ─────────────────────────────────────

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

// ─── MODEL 10: SUBMAXIMAL VO2MAX ESTIMATOR ─────────────────────────────────────
//
// This used to route real inputs (or worse, hardcoded fake ones) through an
// under-trained MLP whose own training target was just this closed-form ACSM-style
// formula. Since the net never has any signal beyond what the formula already encodes,
// it added noise, not insight, over just computing the formula directly. We now compute
// VO2max straight from the rider's real best 5-minute power effort and real weight.

export function estimateVO2max(best5MinPower: number, weightKg: number): number {
  const power = best5MinPower || 0;
  const weight = weightKg || 75;
  if (power <= 0 || weight <= 0) return 0;
  // ACSM-style estimate: VO2max (ml/kg/min) ≈ 10.8 * (W/kg) + 7
  return parseFloat((10.8 * (power / weight) + 7).toFixed(1));
}

// ─── ADVANCED LOGIC 5: CLIMBING STYLE CLASSIFIER ─────────────────────────────

export interface ClimbingStyleAdvice {
  style: string;
  desc: string;
}

export function classifyClimbingStyle(
  climbCadence: number,
  riderBaselineCadence?: number
): ClimbingStyleAdvice {
  if (!climbCadence || climbCadence <= 0) {
    return {
      style: "Unknown",
      desc: "No climbing data with cadence available."
    };
  }

  // Prefer a threshold derived from this rider's own overall cadence tendency (their
  // average cadence across the whole ride) rather than one hardcoded global constant —
  // "high cadence" is relative to the individual, not an absolute number. Someone who
  // naturally spins at 95rpm on the flat isn't necessarily a "cadence climber" just for
  // holding 85rpm on a hill, and someone who normally spins at 70rpm but manages 78rpm on
  // a climb is relatively spinning faster than their own norm.
  const threshold = riderBaselineCadence && riderBaselineCadence > 0
    ? riderBaselineCadence + 3
    : 82; // fallback global default when no rider-specific baseline is available yet

  if (climbCadence > threshold) {
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
  type: 'Sprinter' | 'Climber' | 'Diesel' | 'All-Rounder';
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
      type: 'Climber',
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
// Volume athlete vs intensity athlete based on TSS distribution

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

/**
 * Deterministic Fisher-Yates, seeded so a replay of the same history shuffles the
 * same way every time.
 *
 * This replaces `sort(() => Math.random() - 0.5)`, which is wrong twice over: a
 * random comparator is not a uniform shuffle (it biases toward the original order
 * and the result depends on the sort implementation), and Math.random makes the
 * training run unrepeatable even from identical data. The same idiom was already
 * corrected in Kratos's autoregulation trainer and was left standing here.
 */
function seededShuffle<T>(items: T[], seed = 1337): T[] {
  const out = [...items];
  let state = seed;
  const next = () => {
    // Mulberry32
    state |= 0; state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Fits Aero's summary models to the full ride history.
 *
 * Resets first, and that is the whole point. Aero calls this on every data load,
 * and it replays the ENTIRE ride history each time - so without a reset each run
 * applied a hundred epochs of gradient updates on top of whatever the last run had
 * left behind. Nothing new is learned on the fortieth replay of the same ride; the
 * weights simply keep walking, and every prediction built on them - route duration,
 * FTP projection, injury risk - drifts a little further with each page load.
 *
 * This is the same defect that had to be fixed in Hub's background trainer, where
 * it showed up as a recovery score that changed on its own between refreshes. Here
 * it is quieter because nobody watches a route-duration estimate that closely, but
 * it is the same bug and it was running across three models.
 *
 * With the reset and a seeded shuffle the resulting weights are a pure function of
 * the rides, so the same history always produces the same predictions.
 */
export function calibrateSummaryModels(
  rides: { date: number; distance: number; elevGain: number; duration: number; eFTP?: number; ctl?: number; atl?: number; tss?: number; hrTSS?: number }[],
  ftp: number,
  weight: number
): void {
  const validRides = rides.filter(r => r.distance > 0 && r.duration > 0);
  if (validRides.length === 0) return;

  routeDurationModel.resetToDefaults();
  ftpModel.resetToDefaults();

  // 1. Train Route Duration Model (100 epochs)
  const epochs = 100;
  for (let epoch = 0; epoch < epochs; epoch++) {
    // Reseeded per epoch so the order still varies between epochs, but the whole
    // run is reproducible.
    const shuffled = seededShuffle(validRides, 1337 + epoch);
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
      // Real training consistency (rides/week) in the 30 days leading up to r1, instead of
      // a hardcoded baseline — same (recentRidesCount / 30) * 7 formula used elsewhere for
      // this metric so the training signal matches what's actually shown to the athlete.
      const windowStart = r1.date - 30 * 24 * 3600 * 1000;
      const ridesInWindow = rides.filter(r => r.date >= windowStart && r.date <= r1.date).length;
      const consistency = (ridesInWindow / 30) * 7;

      trainFTPModel(
        r1.eFTP,
        r1.ctl ?? 40,
        r1.atl ?? 40,
        consistency,
        (r1.tss ?? r1.hrTSS ?? 100) * 4, // weekly TSS load estimate
        r2.eFTP
      );
    }
  }

  // The injury model that used to be trained here has been removed rather than
  // fixed, because it could not be fixed.
  //
  // Its target was `acwr > 1.5 || acwr < 0.5`, computed from CTL and ATL - its own
  // inputs. Six of its eight features were functions of those same two numbers, so
  // it was a network fitted to a threshold rule over its own inputs: it could only
  // ever approximate that rule less exactly than the rule itself. The two features
  // that did carry outside information, daily steps and gym volume, were passed here
  // only as their zero defaults, so the model never saw a non-zero value in those
  // slots while prediction fed it live ones.
  //
  // It also had an actualInjuryOccurred path that no caller ever supplied, because
  // no table records an injury. And more feedback would not have rescued it: an
  // athlete produces maybe one or two injuries a year, and nothing learns a
  // classifier from two positive examples. Readiness and soreness became learnable
  // by being answerable daily; injury is not that kind of question.
  //
  // The ratio it was approximating is now applied directly, and labelled as the
  // workload guideline it is - see shared/services/injuryRisk.ts.
}

export function calibrateFullModels(
  rides: { id: string; avgPower?: number; avgHR?: number; bestEfforts?: { m5?: number }; weight?: number }[],
  allRidesFull: { id: string; points: any[] }[],
  ftp: number,
  weight: number
): void {
  // Same reason as calibrateSummaryModels. The climb calibration is an exponential
  // moving average with a sample count that only ever grows, so replaying every
  // climb from every ride on each load kept feeding the same climbs into it - and
  // once sampleCount passes 5 the learning rate drops to 0.1, so what the athlete
  // actually gets is the same handful of climbs hammered in hundreds of times
  // rather than a calibration over their riding.
  resetClimbCalibration();

  for (const r of rides) {
    const full = allRidesFull.find(f => f.id === r.id);
    if (!full || !full.points || full.points.length === 0) continue;

    const riderWeight = r.weight ?? weight ?? 75;

    // Train Climb Model (detecting hill segments inside GPS coordinates) — this is the
    // real per-rider calibration described above (see trainClimbModel), not a neural net.
    // VO2max no longer has a trained model here: it's now computed directly from the
    // closed-form formula (see estimateVO2max) at display time, so there's nothing to train.
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

// Initialization function that Aero calls on login
//
// Used to fire 8 concurrent per-model ml_weights queries (one per SimpleMLP instance
// below, via loadOrInit) — a genuine 8-way simultaneous burst against a single table
// on every login. This project's Supabase compute tier has been observed to time out
// otherwise-trivial queries under bursts of this shape, so all 8 models' rows are now
// fetched in one query and handed to each model directly (loadFromPreloaded), instead
// of each model querying for itself.
export async function initializeModels(supabase: any, userId: string): Promise<void> {
  const models = [notesModel, coachModel, rpeModel, labelModel, ftpModel, cadenceModel, routeDurationModel];
  const modelNames = models.map(m => m.modelName);

  const byModel = new Map<string, any>();
  try {
    const { data, error } = await supabase
      .from('ml_weights')
      .select('model_name, weights')
      .eq('user_id', userId)
      .in('model_name', modelNames);
    if (!error && data) {
      for (const row of data) byModel.set(row.model_name, row.weights);
    }
  } catch {
    // Falls through to loadFromPreloaded(..., undefined) for every model below,
    // which degrades to the same localStorage/defaults fallback loadOrInit used.
  }

  await Promise.all(models.map(m => m.loadFromPreloaded(supabase, userId, byModel.get(m.modelName))));
}

export function resetAllWeights() {
  notesModel.reset();
  coachModel.reset();
  rpeModel.reset();
  labelModel.reset();
  ftpModel.reset();
  cadenceModel.reset();
  routeDurationModel.reset();
  resetClimbCalibration();
}
