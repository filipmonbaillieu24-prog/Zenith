/**
 * Centralized Generic Multilayer Perceptron (MLP) Engine for Zenith
 * 
 * Unified ML engine that supports:
 * - Supabase cloud storage (primary)
 * - LocalStorage fallback (offline cache)
 * - Synchronous local training for instant predictions
 * - Async cloud sync for cross-device persistence
 */

/**
 * Deterministic, small per-neuron perturbation used to break weight symmetry when
 * hand-initializing a hidden layer with a shared "prior" weight per input feature.
 *
 * Without this, every hidden neuron would receive the exact same incoming weights
 * and bias, so with ReLU activations every neuron computes the same value and the
 * same gradient forever (backprop cannot break this symmetry on its own). Applying
 * a distinct-but-deterministic offset per neuron index `j` fixes that while keeping
 * default weights fully reproducible across app loads (no Math.random()).
 *
 * Returns a small multiplier offset in roughly [-0.1, 0.1].
 */
export function neuronSymmetryBreak(j: number): number {
  // Fixed pseudo-random-looking sequence, intentionally not monotonic/periodic-looking
  // over small j so neighboring neurons don't end up with near-identical offsets.
  const seq = [0.02, -0.08, 0.05, 0.09, -0.03, -0.06, 0.07, -0.01, 0.04, -0.09, 0.01, 0.06, -0.05, 0.08, -0.02];
  return seq[j % seq.length];
}

/**
 * Builds a default W1/B1 pair for a hidden layer given a per-input "prior" weight
 * (the hand-picked heuristic magnitude for each input feature) and a base bias.
 * Each hidden neuron gets the same intended prior in expectation, but with a small
 * deterministic per-neuron perturbation so the hidden units are not identical
 * (symmetry breaking) and can actually differentiate during training.
 */
export function buildSymmetryBrokenHiddenLayer(
  priorWeightsByInput: number[],
  hiddenSize: number,
  baseBias: number = 0.05
): { W1: number[][]; B1: number[] } {
  const inputSize = priorWeightsByInput.length;
  const W1: number[][] = Array.from({ length: inputSize }, () => new Array(hiddenSize).fill(0));
  const B1: number[] = new Array(hiddenSize).fill(0);

  for (let j = 0; j < hiddenSize; j++) {
    const offset = neuronSymmetryBreak(j);
    for (let i = 0; i < inputSize; i++) {
      W1[i][j] = priorWeightsByInput[i] * (1 + offset);
    }
    B1[j] = baseBias + offset * 0.5;
  }

  return { W1, B1 };
}

export class SimpleMLP {
  W1: number[][];
  B1: number[];
  W2: number[][];
  B2: number[];
  vW1: number[][];
  vB1: number[];
  vW2: number[][];
  vB2: number[];
  W1_EMA: number[][];
  B1_EMA: number[];
  W2_EMA: number[][];
  B2_EMA: number[];
  lossHistory: number[] = [];
  modelName: string;
  private _loaded = false;

  constructor(
    _inputSize: number,
    _hiddenSize: number,
    _outputSize: number,
    modelName: string,
    defaultWeightsGenerator: () => { W1: number[][]; B1: number[]; W2: number[][]; B2: number[] }
  ) {
    this.modelName = modelName;
    const def = defaultWeightsGenerator();
    this.W1 = def.W1;
    this.B1 = def.B1;
    this.W2 = def.W2;
    this.B2 = def.B2;

    this.W1_EMA = JSON.parse(JSON.stringify(def.W1));
    this.B1_EMA = JSON.parse(JSON.stringify(def.B1));
    this.W2_EMA = JSON.parse(JSON.stringify(def.W2));
    this.B2_EMA = JSON.parse(JSON.stringify(def.B2));

    this.vW1 = Array.from({ length: this.W1.length }, () => new Array(this.B1.length).fill(0));
    this.vB1 = new Array(this.B1.length).fill(0);
    this.vW2 = Array.from({ length: this.B1.length }, () => new Array(this.B2.length).fill(0));
    this.vB2 = new Array(this.B2.length).fill(0);
  }

  /** Whether weights have been loaded from persistent storage */
  get loaded(): boolean { return this._loaded; }

  // ─── STORAGE ──────────────────────────────────────────────────────────────────

  /** Load weights from Supabase, fallback to LocalStorage */
  async loadOrInit(supabase: any, userId: string): Promise<void> {
    // 1. Try Supabase first (source of truth)
    const cloudLoaded = await this.loadFromSupabase(supabase, userId);
    if (cloudLoaded) {
      this._loaded = true;
      this._cacheToLocalStorage();
      return;
    }

    // 2. Fallback: try localStorage (offline cache)
    if (this._loadFromLocalStorage()) {
      this._loaded = true;
      // Sync cached weights up to Supabase in background
      this.saveToSupabase(supabase, userId).catch(() => {});
      return;
    }

    // 3. Keep default weights (from constructor)
  }

  /**
   * Apply an already-fetched ml_weights row instead of querying Supabase directly —
   * for callers that bulk-fetch several models' rows in a single query (one table
   * scan instead of N concurrent per-model queries) and then hand each model its own
   * row. Falls back to localStorage/defaults exactly like loadOrInit's non-Supabase
   * path when no valid row is passed in, but never makes its own network request.
   */
  async loadFromPreloaded(supabase: any, userId: string, weights: any | null | undefined): Promise<void> {
    if (weights && weights.W1 && weights.B1 && weights.W2 && weights.B2 &&
        weights.W1.length === this.W1.length && weights.B1.length === this.B1.length) {
      this.W1 = weights.W1;
      this.B1 = weights.B1;
      this.W2 = weights.W2;
      this.B2 = weights.B2;
      this._loaded = true;
      this._cacheToLocalStorage();
      return;
    }

    if (this._loadFromLocalStorage()) {
      this._loaded = true;
      this.saveToSupabase(supabase, userId).catch(() => {});
      return;
    }
    // Keep default weights (from constructor).
  }

  /** Load weights from Supabase public.ml_weights table */
  async loadFromSupabase(supabase: any, userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('ml_weights')
        .select('weights')
        .eq('user_id', userId)
        .eq('model_name', this.modelName)
        .maybeSingle();

      if (error) {
        console.error(`Error loading weights for ${this.modelName}:`, error);
        return false;
      }

      if (data && data.weights) {
        const loaded = data.weights;
        if (loaded.W1 && loaded.B1 && loaded.W2 && loaded.B2 && 
            loaded.W1.length === this.W1.length && loaded.B1.length === this.B1.length) {
          this.W1 = loaded.W1;
          this.B1 = loaded.B1;
          this.W2 = loaded.W2;
          this.B2 = loaded.B2;
          return true;
        }
      }
    } catch (e) {
      console.error(`Catch error loading weights for ${this.modelName}:`, e);
    }
    return false;
  }

  /** Save weights to Supabase public.ml_weights table */
  async saveToSupabase(supabase: any, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('ml_weights')
        .upsert({
          user_id: userId,
          model_name: this.modelName,
          weights: {
            W1: this.W1,
            B1: this.B1,
            W2: this.W2,
            B2: this.B2
          },
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,model_name'
        });

      if (error) {
        console.error(`Error saving weights for ${this.modelName}:`, error);
        return false;
      }
      return true;
    } catch (e) {
      console.error(`Catch error saving weights for ${this.modelName}:`, e);
    }
    return false;
  }

  /** Cache current weights to localStorage (silent fail for non-browser envs) */
  private _cacheToLocalStorage(): void {
    try {
      localStorage.setItem(this.modelName, JSON.stringify({
        W1: this.W1, B1: this.B1, W2: this.W2, B2: this.B2
      }));
    } catch { /* localStorage not available */ }
  }

  /** Load weights from localStorage cache */
  private _loadFromLocalStorage(): boolean {
    try {
      const saved = localStorage.getItem(this.modelName);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.W1 && parsed.B1 && parsed.W2 && parsed.B2 &&
            parsed.W1.length === this.W1.length && parsed.B1.length === this.B1.length) {
          this.W1 = parsed.W1;
          this.B1 = parsed.B1;
          this.W2 = parsed.W2;
          this.B2 = parsed.B2;
          return true;
        }
      }
    } catch { /* localStorage not available */ }
    return false;
  }

  /** Reset weights by removing from localStorage */
  reset(): void {
    try { localStorage.removeItem(this.modelName); } catch { /* noop */ }
  }

  // ─── INFERENCE ────────────────────────────────────────────────────────────────

  predict(x: number[]): number[] {
    const h = new Array(this.B1.length).fill(0);
    for (let col = 0; col < this.B1.length; col++) {
      let sum = 0;
      for (let row = 0; row < x.length; row++) {
        sum += x[row] * this.W1[row][col];
      }
      h[col] = Math.max(0, sum + this.B1[col]); // relu
    }

    const y = new Array(this.B2.length).fill(0);
    for (let col = 0; col < this.B2.length; col++) {
      let sum = 0;
      for (let row = 0; row < h.length; row++) {
        sum += h[row] * this.W2[row][col];
      }
      y[col] = 1 / (1 + Math.exp(-(sum + this.B2[col]))); // sigmoid
    }

    return y;
  }

  // ─── TRAINING ─────────────────────────────────────────────────────────────────

  /**
   * Train locally (synchronous). Updates weights in-memory and caches to localStorage.
   * Use this for fast, synchronous training in the browser.
   */
  trainLocal(x: number[], targets: number[], lr: number = 0.15): number[] {
    this._backprop(x, targets, lr);
    this._cacheToLocalStorage();
    return this.predict(x);
  }

  /**
   * Train and save to Supabase (async). Backward compatible with existing callers.
   * Used by Hub backgroundTrainer and Kratos for cloud-synced training.
   */
  async train(supabase: any, userId: string, x: number[], targets: number[], lr: number = 0.15): Promise<number[]> {
    this._backprop(x, targets, lr);
    this._cacheToLocalStorage();
    await this.saveToSupabase(supabase, userId);
    return this.predict(x);
  }

  /**
   * Replays a whole dataset for several epochs, then saves ONCE.
   *
   * train() persists to Supabase on every single call, which is right for the
   * online one-sample-per-day loop but pathological for a backfill: replaying a
   * month of history for 20 epochs would be several hundred round-trips and
   * several hundred rows of write amplification for one final set of weights.
   *
   * Samples are shuffled deterministically each epoch. Presenting a
   * chronological series to momentum SGD in the same order every pass lets the
   * tail of the series dominate the final weights; a fixed-seed shuffle keeps
   * the run reproducible while removing that ordering bias.
   *
   * Returns the mean squared error of the final epoch so callers can report
   * whether the fit actually improved.
   */
  async trainBatch(
    supabase: any,
    userId: string,
    samples: { x: number[]; targets: number[] }[],
    epochs: number = 20,
    lr: number = 0.15
  ): Promise<{ epochs: number; samples: number; finalMse: number }> {
    if (samples.length === 0) {
      return { epochs: 0, samples: 0, finalMse: 0 };
    }

    let seed = 1337;
    const nextRandom = () => {
      // Mulberry32 - deterministic, so a retrain on the same history is repeatable.
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    let finalMse = 0;
    for (let epoch = 0; epoch < epochs; epoch++) {
      const order = samples.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(nextRandom() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }

      let epochSse = 0;
      for (const idx of order) {
        const { x, targets } = samples[idx];
        this._backprop(x, targets, lr);
        const y = this.predict(x);
        for (let k = 0; k < targets.length; k++) {
          const err = y[k] - targets[k];
          epochSse += err * err;
        }
      }
      finalMse = epochSse / (samples.length * samples[0].targets.length);
    }

    this._cacheToLocalStorage();
    await this.saveToSupabase(supabase, userId);
    return { epochs, samples: samples.length, finalMse };
  }

  /**
   * Train locally, then sync to Supabase in background (fire-and-forget).
   * Returns predictions immediately without waiting for the cloud save.
   */
  trainAndSync(supabase: any, userId: string, x: number[], targets: number[], lr: number = 0.15): number[] {
    this._backprop(x, targets, lr);
    this._cacheToLocalStorage();
    this.saveToSupabase(supabase, userId).catch(() => {});
    return this.predict(x);
  }

  /**
   * Largest absolute weight in the network.
   *
   * A quick health check: these nets take features normalised to roughly 0..1,
   * so a healthy magnitude is a few units at most. A large value means
   * something upstream is feeding the wrong scale.
   */
  getMaxAbsWeight(): number {
    let max = 0;
    for (const row of this.W1) for (const v of row) max = Math.max(max, Math.abs(v));
    for (const row of this.W2) for (const v of row) max = Math.max(max, Math.abs(v));
    for (const v of this.B1) max = Math.max(max, Math.abs(v));
    for (const v of this.B2) max = Math.max(max, Math.abs(v));
    return max;
  }

  /** Returns estimated AI Model Confidence score (0..100%) based on MSE loss history */
  getConfidenceScore(): number {
    if (this.lossHistory.length === 0) return 85; // baseline pre-trained default confidence
    const sum = this.lossHistory.reduce((a, b) => a + b, 0);
    const avgMse = sum / this.lossHistory.length;
    // Map MSE 0.0 -> 98%, MSE 0.25 -> 75%, capped at 60..99%
    const score = Math.round((1 - Math.min(0.4, avgMse)) * 100);
    return Math.max(60, Math.min(99, score));
  }

  /**
   * Hard bound on any single weight or bias.
   *
   * These nets are trained on features normalised to roughly 0..1, so healthy
   * weights sit within a few units of zero. Anything far outside that means
   * something upstream is feeding the wrong scale, and unbounded momentum SGD
   * turns that into runaway weights: ZenithFusionNet was found with weights at
   * -270 after being trained on raw daily metrics (intake in the thousands)
   * while being served normalised ones, which pinned its output to the top of
   * its range.
   *
   * Clamping cannot make a mis-scaled model correct, but it stops one bad
   * caller from silently destroying a model that other features depend on,
   * and keeps the damage recoverable.
   */
  private static readonly WEIGHT_CLAMP = 12;

  private static clampWeight(v: number): number {
    if (!Number.isFinite(v)) return 0;
    if (v > SimpleMLP.WEIGHT_CLAMP) return SimpleMLP.WEIGHT_CLAMP;
    if (v < -SimpleMLP.WEIGHT_CLAMP) return -SimpleMLP.WEIGHT_CLAMP;
    return v;
  }

  /** Core backpropagation with Momentum SGD & MSE Loss Tracking */
  private _backprop(x: number[], targets: number[], lr: number, gamma: number = 0.9): void {
    // Forward pass (with pre-activation values for ReLU derivative)
    const hIn = new Array(this.B1.length).fill(0);
    const h = new Array(this.B1.length).fill(0);
    for (let col = 0; col < this.B1.length; col++) {
      let sum = 0;
      for (let row = 0; row < x.length; row++) {
        sum += x[row] * this.W1[row][col];
      }
      hIn[col] = sum + this.B1[col];
      h[col] = Math.max(0, hIn[col]); // relu
    }

    const y = new Array(this.B2.length).fill(0);
    for (let col = 0; col < this.B2.length; col++) {
      let sum = 0;
      for (let row = 0; row < h.length; row++) {
        sum += h[row] * this.W2[row][col];
      }
      y[col] = 1 / (1 + Math.exp(-(sum + this.B2[col]))); // sigmoid
    }

    // Record MSE loss
    let mseSum = 0;
    const delta2 = new Array(this.B2.length).fill(0);
    for (let k = 0; k < this.B2.length; k++) {
      const err = y[k] - targets[k];
      delta2[k] = err;
      mseSum += err * err;
    }
    const currentMse = mseSum / this.B2.length;
    this.lossHistory.push(currentMse);
    if (this.lossHistory.length > 50) this.lossHistory.shift();

    // Hidden delta
    const delta1 = new Array(this.B1.length).fill(0);
    for (let j = 0; j < this.B1.length; j++) {
      let errorSum = 0;
      for (let k = 0; k < this.B2.length; k++) {
        errorSum += delta2[k] * this.W2[j][k];
      }
      delta1[j] = errorSum * (hIn[j] > 0 ? 1 : 0);
    }

    // Update weights W2 & B2 with Momentum SGD & Polyak EMA
    const alphaEma = 0.95;
    for (let k = 0; k < this.B2.length; k++) {
      this.vB2[k] = gamma * this.vB2[k] + lr * delta2[k];
      this.B2[k] = SimpleMLP.clampWeight(this.B2[k] - this.vB2[k]);
      this.B2_EMA[k] = alphaEma * this.B2_EMA[k] + (1 - alphaEma) * this.B2[k];
      for (let j = 0; j < h.length; j++) {
        this.vW2[j][k] = gamma * this.vW2[j][k] + lr * delta2[k] * h[j];
        this.W2[j][k] = SimpleMLP.clampWeight(this.W2[j][k] - this.vW2[j][k]);
        this.W2_EMA[j][k] = alphaEma * this.W2_EMA[j][k] + (1 - alphaEma) * this.W2[j][k];
      }
    }

    // Update weights W1 & B1 with Momentum SGD & Polyak EMA
    for (let j = 0; j < this.B1.length; j++) {
      this.vB1[j] = gamma * this.vB1[j] + lr * delta1[j];
      this.B1[j] = SimpleMLP.clampWeight(this.B1[j] - this.vB1[j]);
      this.B1_EMA[j] = alphaEma * this.B1_EMA[j] + (1 - alphaEma) * this.B1[j];
      for (let i = 0; i < x.length; i++) {
        this.vW1[i][j] = gamma * this.vW1[i][j] + lr * delta1[j] * x[i];
        this.W1[i][j] = SimpleMLP.clampWeight(this.W1[i][j] - this.vW1[i][j]);
        this.W1_EMA[i][j] = alphaEma * this.W1_EMA[i][j] + (1 - alphaEma) * this.W1[i][j];
      }
    }
  }
}
