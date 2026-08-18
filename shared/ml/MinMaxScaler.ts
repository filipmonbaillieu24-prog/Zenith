/**
 * Zenith Ecosystem - MinMaxScaler & Feature Normalizer
 * Scales numeric features to [0, 1] with outlier clipping.
 */
export class MinMaxScaler {
  min: number;
  max: number;

  constructor(min: number, max: number) {
    this.min = min;
    this.max = max;
  }

  /** Normalizes a raw feature value to range [0, 1], clipped at boundaries */
  scale(value: number): number {
    if (this.max === this.min) return 0.5;
    const norm = (value - this.min) / (this.max - this.min);
    return Math.max(0, Math.min(1, norm));
  }

  /** Unscales a normalized [0, 1] value back to original units */
  unscale(normValue: number): number {
    const clamped = Math.max(0, Math.min(1, normValue));
    return this.min + clamped * (this.max - this.min);
  }
}
