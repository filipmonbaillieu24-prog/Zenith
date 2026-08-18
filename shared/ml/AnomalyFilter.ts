/**
 * Zenith Ecosystem - Anomaly & Outlier Telemetry Filter
 * Sanitizes input feature vectors before feeding to ML models.
 */

export interface FeatureBounds {
  min: number;
  max: number;
}

export class AnomalyFilter {
  /**
   * Sanitizes a feature vector against acceptable physiological bounds.
   * If a value is out of bounds or NaN, it is clamped or imputed with default fallback.
   */
  static sanitizeVector(x: number[], bounds: FeatureBounds[]): number[] {
    return x.map((val, idx) => {
      if (isNaN(val) || val === null || val === undefined) {
        const b = bounds[idx];
        return b ? (b.min + b.max) / 2 : 0;
      }
      const b = bounds[idx];
      if (!b) return val;
      return Math.max(b.min, Math.min(b.max, val));
    });
  }

  /** Checks if a numerical target value is valid for training */
  static isValidTarget(target: number, min: number, max: number): boolean {
    if (isNaN(target) || target === null || target === undefined) return false;
    return target >= min && target <= max;
  }
}
