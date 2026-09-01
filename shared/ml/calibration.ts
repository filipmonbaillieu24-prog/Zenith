/**
 * Fitting a hidden layer so it reproduces a function you can write down.
 *
 * ## Why this exists
 *
 * Every network in Zenith has the same shape: one hidden layer whose units all read
 * the same prior-weighted sum of the inputs, and one output through a sigmoid. That
 * shape can only ever represent a function of that single scalar - which is fine,
 * because in every case the thing being predicted IS a function of one weighted
 * combination of the inputs.
 *
 * What was not fine was how the weights were chosen. `buildSymmetryBrokenHiddenLayer`
 * gave every unit the same weights up to a few percent and the same bias, so twelve
 * units did the work of one, the layer collapsed to something affine, and a sigmoid
 * of an affine function of all-positive inputs pinned against its ceiling. Six models
 * shipped like that. A pinned sigmoid also has no gradient, so training could not
 * recover them: fitted on data where the answer clearly varied, they settled on the
 * mean and stayed flat.
 *
 * ## What this does instead
 *
 * Every unit still reads the same weighted sum. What differs is where its ReLU
 * switches on. Knees spread across the range that sum actually takes give a
 * piecewise-linear curve with as many knots as there are units, and the output layer
 * is FITTED by least squares so that curve reproduces a stated reference function.
 *
 * The reference function is the point. It means the untrained model starts by
 * agreeing with the formula it is meant to improve on, rather than somewhere
 * arbitrary - which matters when the model is blended into a number the athlete acts
 * on from the first day. Training then moves it away from that starting point using
 * the athlete's own history, which is the only thing a model can add that a formula
 * cannot.
 *
 * ## Why it is fitted at startup rather than pasted in
 *
 * Hand-pasted coefficients are correct exactly once. The next person to change a
 * prior, a scaler or an output range has no way to know the output layer no longer
 * matches, and nothing tells them. Deriving the fit from the declaration means the
 * two cannot disagree. It costs a few hundred microseconds at module load.
 */

/** SimpleMLP clamps every weight to this, so a fit that exceeds it would be truncated. */
export const WEIGHT_LIMIT = 12;

/** Leave headroom: training moves weights, and a fit sitting exactly on the limit clips immediately. */
const FIT_WEIGHT_CEILING = 9;

export interface CalibratedLayer {
  W1: number[][];
  B1: number[];
  W2: number[][];
  B2: number[];
  /** Root-mean-square error against the reference, in output units. */
  rmse: number;
  /** Largest absolute output weight, for checking against the clamp. */
  maxWeight: number;
  /** Where the hidden units switch on. */
  knees: number[];
}

export interface CalibrationRequest {
  /** Prior weight per input. The weighted sum of scaled inputs is what the layer sees. */
  priors: number[];
  hiddenSize: number;
  /**
   * Sampled points to fit against: each is the scaled input vector paired with the
   * reference output, already mapped to 0..1 on the model's own output scale.
   */
  samples: { x: number[]; y: number }[];
}

function logit(p: number): number {
  const clamped = Math.min(0.995, Math.max(0.005, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Solves (A'A + lambda I) w = A'b by Gaussian elimination with partial pivoting. */
function ridgeSolve(A: number[][], b: number[], lambda: number): number[] {
  const cols = A[0].length;
  const AtA: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
  const Atb: number[] = new Array(cols).fill(0);

  for (let r = 0; r < A.length; r++) {
    const row = A[r];
    for (let i = 0; i < cols; i++) {
      Atb[i] += row[i] * b[r];
      for (let j = i; j < cols; j++) AtA[i][j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < i; j++) AtA[i][j] = AtA[j][i];
    // The bias column is left unpenalised: shrinking it moves the whole curve rather
    // than smoothing it.
    if (i < cols - 1) AtA[i][i] += lambda * A.length;
  }

  const M = AtA.map((row, i) => [...row, Atb[i]]);
  for (let col = 0; col < cols; col++) {
    let pivot = col;
    for (let r = col + 1; r < cols; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) continue;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < cols; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= cols; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[cols] / row[i]));
}

/**
 * The priors that make the weighted sum carry as much of the reference as a straight
 * line can.
 *
 * Hand-picked priors are the last place in this design where a human number could be
 * silently wrong, and being wrong there is fatal in a way that is hard to see: the
 * hidden layer only ever sees ONE weighted sum, so if the priors are out of proportion
 * to the reference's real sensitivities, two inputs get conflated and no choice of
 * output weights can separate them again. A first attempt at the autoregulation model
 * had the set-index prior roughly twice as large as it should have been relative to
 * effort surplus, and the fit would not come below 0.11 however the reference was
 * rewritten.
 *
 * Regressing the reference on the scaled inputs gives the proportions directly. The
 * author declares what the model means; the arithmetic decides the weights.
 */
export function derivePriors(
  samples: { x: number[]; y: number }[],
  fixed: (number | undefined)[]
): number[] {
  const inputCount = samples[0].x.length;
  const A = samples.map(s => [...s.x, 1]);
  const b = samples.map(s => s.y);
  const solved = ridgeSolve(A, b, 1e-6);

  const raw = solved.slice(0, inputCount);
  // Scale so the largest prior is around 0.8, which keeps the weighted sum in a range
  // where the knees have room to spread without the numbers becoming unreadable.
  const largest = Math.max(...raw.map(Math.abs), 1e-9);
  const scale = 0.8 / largest;

  return raw.map((coefficient, i) => {
    const override = fixed[i];
    // An explicit 0 means "no assumed effect, learned from history only" and must
    // survive the regression finding one.
    if (override !== undefined) return override;
    return Math.round(coefficient * scale * 1000) / 1000;
  });
}

/**
 * Builds a hidden layer whose ReLU knees are spread across the range the prior-weighted
 * sum actually takes, and an output layer fitted to reproduce the sampled reference.
 */
export function calibrateLayer(request: CalibrationRequest): CalibratedLayer {
  const { priors, hiddenSize, samples } = request;
  if (samples.length === 0) throw new Error('calibrateLayer needs samples to fit against');

  const sums = samples.map(s => s.x.reduce((acc, v, i) => acc + v * (priors[i] ?? 0), 0));
  const sorted = [...sums].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

  // The first knee sits BELOW the smallest sum, not at the first percentile.
  //
  // Under the lowest knee every ReLU outputs zero and the layer contributes nothing,
  // so the model is flat there - whatever the reference says. That is not a rounding
  // error: with knees starting at the first percentile, a genuinely rested athlete
  // whose inputs were all at their minimum came out at 0.17 on a scale whose
  // reference said 0, because their sum fell in the flat region below every knee.
  const rawLo = at(0);
  const rawHi = at(0.99);
  const margin = Math.max(1e-6, (rawHi - rawLo) * 0.05);
  const lo = rawLo - margin;
  const hi = rawHi;
  const span = hi - lo;
  const knees = span > 1e-9
    ? Array.from({ length: hiddenSize }, (_, j) => lo + (span * j) / Math.max(1, hiddenSize - 1))
    : Array.from({ length: hiddenSize }, (_, j) => lo + j * 0.01);

  const A = sums.map(s => [...knees.map(k => Math.max(0, s - k)), 1]);
  const target = samples.map(s => logit(s.y));

  // Raise the penalty until the fit sits inside the weight clamp. Left unbounded, a
  // good fit routinely wants coefficients past 12, and SimpleMLP would truncate them
  // on the first training pass - leaving a model quietly different from the one that
  // was fitted and checked.
  let coefficients = ridgeSolve(A, target, 0);
  for (const lambda of [0, 1e-5, 3e-5, 1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1, 3e-1, 1]) {
    coefficients = ridgeSolve(A, target, lambda);
    const worst = Math.max(...coefficients.slice(0, hiddenSize).map(Math.abs));
    if (worst <= FIT_WEIGHT_CEILING) break;
  }

  const outWeights = coefficients.slice(0, hiddenSize);
  const outBias = coefficients[hiddenSize];

  let squaredError = 0;
  for (let i = 0; i < samples.length; i++) {
    const predicted = sigmoid(A[i].reduce((acc, v, j) => acc + v * coefficients[j], 0));
    squaredError += (predicted - samples[i].y) ** 2;
  }

  const inputSize = priors.length;
  return {
    W1: Array.from({ length: inputSize }, (_, i) => new Array(hiddenSize).fill(priors[i] ?? 0)),
    B1: knees.map(knee => -knee),
    W2: outWeights.map(w => [w]),
    B2: [outBias],
    rmse: Math.sqrt(squaredError / samples.length),
    maxWeight: Math.max(...outWeights.map(Math.abs)),
    knees
  };
}
