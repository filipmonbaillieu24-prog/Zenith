/**
 * Zenith Ecosystem - Adaptive Ensemble Blender
 * Seamlessly blends heuristic domain models with ML predictions based on sample history.
 */

export class EnsembleBlender {
  /**
   * Blends a heuristic prediction with a machine learning model prediction.
   * As sampleCount increases, the ML weight dynamically scales up to maxMlWeight (default 0.85).
   */
  static blend(
    heuristicValue: number,
    mlValue: number,
    sampleCount: number,
    rampUpSamples: number = 20,
    maxMlWeight: number = 0.85
  ): number {
    if (sampleCount <= 0) return heuristicValue;
    const mlWeight = Math.min(maxMlWeight, (sampleCount / rampUpSamples) * maxMlWeight);
    const heuristicWeight = 1 - mlWeight;
    return mlWeight * mlValue + heuristicWeight * heuristicValue;
  }
}
