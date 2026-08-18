import { RidePoint } from '../types/workout';

export interface Climb {
  startIndex: number;
  endIndex: number;
  lengthMeters: number;
  elevGain: number;
  avgGrade: number;
  maxGrade: number;
  category: string; // "HC", "Cat 1", "Cat 2", "Cat 3", "Cat 4"
  score: number;
}

/**
 * Detecteert beklimmingen in een lijst with ridepunten.
 * Een klim is een aaneengesloten segment van stijging with minimale lengte en percentage.
 */
export function detectClimbs(points: RidePoint[]): Climb[] {
  if (points.length < 5) return [];

  const climbs: Climb[] = [];
  let inClimb = false;
  let climbStartIdx = 0;
  
  // Eenvoudige smoothing van hoogtedata om ruis te voorkomen
  const eleSmooth = points.map((p, idx) => {
    if (p.ele == null) return null;
    const start = Math.max(0, idx - 2);
    const end = Math.min(points.length - 1, idx + 2);
    let sum = 0, count = 0;
    for (let i = start; i <= end; i++) {
      if (points[i].ele != null) {
        sum += points[i].ele!;
        count++;
      }
    }
    return count > 0 ? sum / count : p.ele;
  });

  for (let i = 1; i < points.length; i++) {
    const prevEle = eleSmooth[i - 1];
    const currEle = eleSmooth[i];
    if (prevEle == null || currEle == null || points[i].distance == null || points[i - 1].distance == null) continue;

    const distDiff = points[i].distance! - points[i - 1].distance!;
    if (distDiff <= 0) continue;

    const grade = ((currEle - prevEle) / distDiff) * 100;

    // Start of doorgaan van een klim segment (helling > 1.5%)
    if (grade > 1.5) {
      if (!inClimb) {
        inClimb = true;
        climbStartIdx = i - 1;
      }
    } else if (grade < -0.5) {
      // Afdaling stopt de klim
      if (inClimb) {
        inClimb = false;
        evaluateAndAddClimb(climbStartIdx, i - 1);
      }
    }
  }

  // Als we eindigen in een klim
  if (inClimb) {
    evaluateAndAddClimb(climbStartIdx, points.length - 1);
  }

  function evaluateAndAddClimb(start: number, end: number) {
    if (end - start < 4) return; // te kort qua punten
    
    const startPt = points[start];
    const endPt = points[end];
    if (startPt.distance == null || endPt.distance == null || startPt.ele == null || endPt.ele == null) return;

    const lengthMeters = endPt.distance! - startPt.distance!;
    const elevGain = endPt.ele! - startPt.ele!;
    if (lengthMeters < 350 || elevGain < 15) return; // te klein om een echte heuvel/klim te zijn

    const avgGrade = (elevGain / lengthMeters) * 100;
    if (avgGrade < 2.5) return; // stijgingspercentage te laag

    // Bereken max stijgingspercentage over segmenten van 50m
    let maxGrade = 0;
    for (let i = start + 1; i <= end; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      if (p1.distance == null || p2.distance == null || p1.ele == null || p2.ele == null) continue;
      const d = p2.distance! - p1.distance!;
      if (d > 5) {
        const g = ((p2.ele! - p1.ele!) / d) * 100;
        if (g > maxGrade) maxGrade = g;
      }
    }

    // Fiets Klimscore index (afstand in km * stijgingspercentage)
    const score = lengthMeters * (avgGrade / 100) * avgGrade;
    let category = 'Cat 4';
    if (score >= 8000) category = 'HC'; // Hors Catégorie
    else if (score >= 4000) category = 'Cat 1';
    else if (score >= 2000) category = 'Cat 2';
    else if (score >= 1000) category = 'Cat 3';

    climbs.push({
      startIndex: start,
      endIndex: end,
      lengthMeters: Math.round(lengthMeters),
      elevGain: Math.round(elevGain),
      avgGrade: parseFloat(avgGrade.toFixed(1)),
      maxGrade: parseFloat(Math.min(30, Math.max(avgGrade, maxGrade)).toFixed(1)),
      category,
      score: Math.round(score)
    });
  }

  // Voorkom overlappende klimmen en sorteer op start index
  return climbs.sort((a, b) => a.startIndex - b.startIndex);
}
