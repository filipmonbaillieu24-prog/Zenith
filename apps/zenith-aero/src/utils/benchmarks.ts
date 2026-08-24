/**
 * Age- and gender-based VO₂max performance benchmarks.
 *
 * Sources:
 *   - ACSM (American College of Sports Medicine) fitness norms
 *   - Cooper Institute norms
 *
 * Categories: Poor / Below Average / Average / Above Average / Excellent / Superior
 */

export type FitnessCategory = 'Poor' | 'Below Average' | 'Average' | 'Above Average' | 'Excellent' | 'Superior';

export interface VO2maxBenchmark {
  category: FitnessCategory;
  color:    string;
  emoji:    string;
  min:      number;
  max:      number;
}

// VO2max norms per age group (ml/kg/min) — males
const MALE_NORMS: Record<string, number[][]> = {
  '18-29': [[0,32],[32,38],[38,44],[44,50],[50,56],[56,999]],
  '30-39': [[0,30],[30,36],[36,42],[42,48],[48,54],[54,999]],
  '40-49': [[0,27],[27,33],[33,39],[39,45],[45,51],[51,999]],
  '50-59': [[0,24],[24,30],[30,36],[36,42],[42,48],[48,999]],
  '60-69': [[0,20],[20,26],[26,32],[32,38],[38,44],[44,999]],
  '70+':   [[0,17],[17,23],[23,29],[29,35],[35,41],[41,999]],
};

// VO2max norms per age group — females
const FEMALE_NORMS: Record<string, number[][]> = {
  '18-29': [[0,28],[28,34],[34,39],[39,44],[44,50],[50,999]],
  '30-39': [[0,25],[25,31],[31,36],[36,41],[41,47],[47,999]],
  '40-49': [[0,22],[22,28],[28,34],[34,39],[39,45],[45,999]],
  '50-59': [[0,19],[19,25],[25,31],[31,36],[36,42],[42,999]],
  '60-69': [[0,16],[16,22],[22,28],[28,33],[33,39],[39,999]],
  '70+':   [[0,13],[13,19],[19,25],[25,30],[30,36],[36,999]],
};

const CATEGORIES: { label: FitnessCategory; color: string; emoji: string }[] = [
  { label: 'Poor',            color: '#ff7675', emoji: '😞' },
  { label: 'Below Average',   color: '#e17055', emoji: '😐' },
  { label: 'Average',       color: '#fdcb6e', emoji: '🙂' },
  { label: 'Above Average',   color: '#00b894', emoji: '😊' },
  { label: 'Excellent',       color: '#55efc4', emoji: '🌟' },
  { label: 'Superior',        color: '#a29bfe', emoji: '🏆' },
];

function ageGroup(age: number): string {
  if (age < 30) return '18-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  if (age < 70) return '60-69';
  return '70+';
}

/**
 * Returns the fitness category for a given VO₂max value, age, and gender.
 */
export function classifyVO2max(
  vo2max: number,
  age:    number,
  gender: 'male' | 'female' | 'other',
): VO2maxBenchmark {
  const table = gender === 'female' ? FEMALE_NORMS : MALE_NORMS;
  const ranges = table[ageGroup(age)];

  let idx = 0;
  for (let i = 0; i < ranges.length; i++) {
    if (vo2max >= ranges[i][0] && vo2max < ranges[i][1]) {
      idx = i;
      break;
    }
    if (vo2max >= ranges[ranges.length - 1][0]) idx = ranges.length - 1;
  }

  const cat = CATEGORIES[idx];
  return {
    category: cat.label,
    color:    cat.color,
    emoji:    cat.emoji,
    min:      ranges[idx][0],
    max:      ranges[idx][1] === 999 ? vo2max + 5 : ranges[idx][1],
  };
}

/**
 * Get all 6 benchmark ranges for a given age/gender (for visualizing
 * where the user sits on a scale).
 */
export function getVO2maxRanges(
  age:    number,
  gender: 'male' | 'female' | 'other',
): { range: [number, number]; category: FitnessCategory; color: string }[] {
  const table  = gender === 'female' ? FEMALE_NORMS : MALE_NORMS;
  const ranges = table[ageGroup(age)];
  return ranges.map((r, i) => ({
    range:    [r[0], r[1] === 999 ? r[0] + 15 : r[1]],
    category: CATEGORIES[i].label,
    color:    CATEGORIES[i].color,
  }));
}

/**
 * Cycling W/kg performance category (based on FTP W/kg).
 * Source: British Cycling / Coggan categories.
 */
export interface CyclingCategory {
  label: string;
  color: string;
  emoji: string;
  minWkg: number;
  maxWkg: number;
}

export const CYCLING_CATEGORIES: CyclingCategory[] = [
  { label: 'Recreational',  color: '#b2bec3', emoji: '🚴', minWkg: 0,    maxWkg: 2.49 },
  { label: 'Cat 4 / Hobby', color: '#e17055', emoji: '🚵', minWkg: 2.5,  maxWkg: 3.19 },
  { label: 'Cat 3',         color: '#fdcb6e', emoji: '🥉', minWkg: 3.2,  maxWkg: 3.99 },
  { label: 'Cat 2',         color: '#00b894', emoji: '🥈', minWkg: 4.0,  maxWkg: 4.69 },
  { label: 'Cat 1',         color: '#a29bfe', emoji: '🥇', minWkg: 4.7,  maxWkg: 5.69 },
  { label: 'Pro / WT',      color: '#6c5ce7', emoji: '🏆', minWkg: 5.7,  maxWkg: 99   },
];

export function classifyWpkg(wpkg: number): CyclingCategory {
  return CYCLING_CATEGORIES.find(c => wpkg >= c.minWkg && wpkg <= c.maxWkg)
    ?? CYCLING_CATEGORIES[0];
}
