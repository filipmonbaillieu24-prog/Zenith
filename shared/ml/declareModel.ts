import { SimpleMLP } from './SimpleMLP';
import { calibrateLayer, CalibratedLayer, derivePriors } from './calibration';

/**
 * A model you can read.
 *
 * Before this, finding out what a network did meant reading three separate places and
 * hoping they agreed: a hand-written prior array with a comment naming the inputs, a
 * `predict` function that scaled them one way, and a `train` function somewhere else
 * that scaled them another. They did not always agree - the overload model was served
 * through `(x + 10) / 20` and trained through `x / 10`, so "no progression" arrived as
 * 0.50 when predicting and 0.00 when training - and nothing could have caught it,
 * because the two lived in different files and had no shared definition to disagree
 * with.
 *
 * A declaration fixes that by construction. Each input is named once, with its own
 * scaling and its own prior. The feature vector is built from that declaration, so
 * training and serving cannot diverge. The reference function states, in ordinary
 * units, what the model should say before it has learned anything - and the default
 * weights are FITTED to it rather than guessed, so a model that has never seen the
 * athlete starts by agreeing with the formula it is meant to improve on.
 *
 * What each part is for:
 *
 *   inputs[].scale     raw units -> 0..1. The only place this conversion exists.
 *   inputs[].prior     how much that input moves the prior-weighted sum.
 *   reference(raw)     what an untrained model should answer, in output units.
 *   outputRange        how the sigmoid's 0..1 maps back to those units.
 *   samplePoints       the realistic input space, used to fit and to check the fit.
 */

export interface InputSpec {
  /** What this input is, in words. Appears in diagnostics. */
  name: string;
  /** Raw units to 0..1. */
  scale: (raw: number) => number;
  /**
   * Weight in the prior-weighted sum.
   *
   * Leave it out and it is derived by regressing the reference on the scaled inputs,
   * which is almost always what you want: the hidden layer sees only ONE weighted sum,
   * so priors out of proportion to the reference's real sensitivities conflate two
   * inputs beyond any hope of separating them downstream.
   *
   * Set it to 0 explicitly to say "no assumed effect, learned from this athlete's
   * history only" - a deliberate statement that survives the regression finding one.
   */
  prior?: number;
  /** Plausible raw values, used to sample the input space when fitting. */
  sampleRange: [number, number];
}

export interface ModelDeclaration {
  /** Storage key. Bump the version whenever an input changes meaning. */
  key: string;
  /** One sentence: what this model answers. */
  purpose: string;
  hiddenSize: number;
  inputs: InputSpec[];
  /** Output units, e.g. [0, 10] for a weight increment in kilograms. */
  outputRange: [number, number];
  /** What the model should say untrained, in output units, given raw inputs. */
  reference: (raw: number[]) => number;
  /** How many points to fit against. A few hundred is plenty for one scalar. */
  samples?: number;
  /**
   * How far the fitted defaults may sit from the reference before this is treated as
   * a programming error, as a fraction of the output range.
   *
   * This is the guard the old models needed. A network of this shape can only
   * represent a function of ONE weighted sum of its inputs, and not every rule is
   * one: anything with an interaction between two inputs, or a discrete jump, cannot
   * be expressed however the weights are chosen. Silently accepting a bad fit is how
   * six models ended up pinned at an extreme and shipping constants.
   *
   * If a declaration trips this, the answer is not a looser threshold - it is that
   * the quantity should be computed by a rule rather than predicted by this shape of
   * model.
   */
  maxFitError?: number;
}

export interface DeclaredModel {
  declaration: ModelDeclaration;
  mlp: SimpleMLP;
  calibration: CalibratedLayer;
  /** The single definition of the feature vector, used by predict AND by training. */
  toFeatures: (raw: number[]) => number[];
  /** Raw inputs to a prediction in output units. */
  predict: (raw: number[]) => number;
  /** What the reference function alone would say. For diagnostics and comparison. */
  referenceValue: (raw: number[]) => number;
  /** Raw inputs and an observed outcome to a training pair. */
  toTrainingPair: (raw: number[], observed: number) => { x: number[]; targets: number[] };
}

/**
 * A deterministic low-discrepancy sequence.
 *
 * Deterministic so that the fitted weights are identical on every device and every
 * reload - a model whose defaults differ between two phones is not one model. Halton
 * rather than a grid because a grid over eight inputs is either enormous or too coarse
 * to represent the corners.
 */
function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];

export function declareModel(declaration: ModelDeclaration): DeclaredModel {
  const { inputs, hiddenSize, outputRange, reference } = declaration;
  const [outMin, outMax] = outputRange;
  const outSpan = outMax - outMin;

  const toFeatures = (raw: number[]): number[] =>
    inputs.map((input, i) => {
      const value = Number(raw[i]);
      // A NaN reaching a feature vector poisons every weight it touches during
      // training. The midpoint of the input's own range is the least-committal
      // substitute, and it is only ever reached for a value that was not a number.
      if (!Number.isFinite(value)) return 0.5;
      return Math.max(0, Math.min(1, input.scale(value)));
    });

  const toOutputUnits = (unit: number): number => outMin + Math.max(0, Math.min(1, unit)) * outSpan;
  const toUnitScale = (value: number): number =>
    outSpan === 0 ? 0.5 : Math.max(0, Math.min(1, (value - outMin) / outSpan));

  // Fit against the reference across the plausible input space.
  const sampleCount = declaration.samples ?? 600;
  const samples: { x: number[]; y: number }[] = [];
  for (let n = 1; n <= sampleCount; n++) {
    const raw = inputs.map((input, i) => {
      const [lo, hi] = input.sampleRange;
      return lo + halton(n, PRIMES[i % PRIMES.length]) * (hi - lo);
    });
    samples.push({ x: toFeatures(raw), y: toUnitScale(reference(raw)) });
  }

  const priors = derivePriors(samples, inputs.map(i => i.prior));
  const calibration = calibrateLayer({ priors, hiddenSize, samples });

  const limit = declaration.maxFitError ?? 0.05;
  if (calibration.rmse > limit) {
    throw new Error(
      `Model "${declaration.key}" cannot represent its own reference function: `
      + `fit RMSE ${calibration.rmse.toFixed(3)} exceeds ${limit}. `
      + `This shape of network is a function of one weighted sum of its inputs; a rule `
      + `with an interaction between inputs, or a discrete jump, is not one. `
      + `Compute it directly instead of predicting it.`
    );
  }

  const mlp = new SimpleMLP(
    inputs.length,
    hiddenSize,
    1,
    declaration.key,
    () => ({ W1: calibration.W1, B1: calibration.B1, W2: calibration.W2, B2: calibration.B2 })
  );

  return {
    declaration,
    mlp,
    calibration,
    toFeatures,
    predict: (raw: number[]) => toOutputUnits(mlp.predict(toFeatures(raw))[0]),
    referenceValue: (raw: number[]) => reference(raw),
    toTrainingPair: (raw: number[], observed: number) => ({
      x: toFeatures(raw),
      targets: [toUnitScale(observed)]
    })
  };
}

/** A one-line summary of what a model is and how well its defaults match its reference. */
export function describeModel(model: DeclaredModel): string {
  const d = model.declaration;
  const rmseUnits = model.calibration.rmse * (d.outputRange[1] - d.outputRange[0]);
  return `${d.key}: ${d.purpose} | inputs ${d.inputs.map(i => i.name).join(', ')} `
    + `| fit RMSE ${rmseUnits.toFixed(2)} of ${d.outputRange[0]}..${d.outputRange[1]} `
    + `| max weight ${model.calibration.maxWeight.toFixed(2)}`;
}
