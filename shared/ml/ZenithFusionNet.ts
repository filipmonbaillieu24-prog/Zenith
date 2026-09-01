import { SimpleMLP } from './SimpleMLP';
import { MinMaxScaler } from './MinMaxScaler';

export interface FusionPrediction {
  tdeeKcal: number;
  recoveryScore: number;
  athleticCapacity: number; // 0..100% capacity readiness
}

export class ZenithFusionNet {
  private static instance: ZenithFusionNet | null = null;
  private mlp: SimpleMLP;

  // Input min-max scalers
  private intakeScaler = new MinMaxScaler(1000, 5000);
  /**
   * Strength work, in kilocalories rather than kilograms of tonnage.
   *
   * Tonnage is not energy: 15,000 kg of leg press and 15,000 kg of curls do not cost
   * the same, and the network was being asked to convert between them with no way to
   * do it. Both activity inputs are now the same unit, so the layer can add them.
   */
  private strengthCaloriesScaler = new MinMaxScaler(0, 2000);
  /**
   * Active calories, not a TSS stand-in.
   *
   * This input was fed `activeCalories > 0 ? 80 : 0` at every one of its three call
   * sites - training, prediction and retraining alike. A 544 kcal run, a 3-hour ride
   * and a brisk walk to the shops all arrived as the same number, so the network
   * could not represent how hard a day was, only whether anything happened at all.
   * Its output duly barely moved: 1969 kcal on a rest day, 1973 on a day with a
   * 6 km run.
   *
   * The measured figure goes in instead, on a range wide enough for a long day.
   */
  private activeCaloriesScaler = new MinMaxScaler(0, 2000);
  private sleepQualityScaler = new MinMaxScaler(0, 100);
  private sleepDurationScaler = new MinMaxScaler(4, 12);
  private hrvScaler = new MinMaxScaler(15, 120);

  private constructor() {
    this.mlp = new SimpleMLP(
      12, // Inputs: [Intake, StrengthKcal, ActiveKcal, SleepQuality, SleepDuration, DeepSleepRatio, REMRatio, HRV_rMSSD, DeltaRHR, Caffeine, Creatine, TrendWeight]
      12, // Hidden size
      3,  // Outputs: [TDEE_Scaled, Recovery_Scaled, Capacity_Scaled]
      // Version bumped from 'zenith_fusion_net_weights'. Every set of weights
      // stored under the old key was trained through the scale mismatch fixed
      // in buildFeatureVector() below - the live ones had reached -270 against
      // priors of 0.3..0.8 - so they are not salvageable by further training
      // and must not be loaded. A new key abandons them in both Supabase and
      // localStorage and starts from the physiological defaults.
      // Bumped again for v3. Input 2 changed meaning: it carried a constant 80 for
      // any active day and now carries the day's measured active calories. Weights
      // fitted against a flag cannot be reused against a magnitude - they encode
      // "activity happened" where the input now says "how much" - so the old ones are
      // abandoned rather than retrained. Everything under the v2 key was fitted on a
      // feature that never varied.
      'zenith_fusion_net_weights_v4',
      this.generateDefaultWeights
    );
  }

  public static getInstance(): ZenithFusionNet {
    if (!ZenithFusionNet.instance) {
      ZenithFusionNet.instance = new ZenithFusionNet();
    }
    return ZenithFusionNet.instance;
  }

  /**
   * Generates physiologically grounded default weight matrices.
   */
  /**
   * Where each hidden unit's ReLU switches on.
   *
   * Every unit reads the same prior-weighted sum; what differs is its knee. Twelve
   * knees spread across the range that sum actually takes give a piecewise-linear
   * curve with twelve knots, which is enough to track the target closely.
   *
   * The previous defaults gave all twelve units the same bias of about 0.05 with a
   * per-neuron perturbation of a few percent. Twelve near-identical units do the work
   * of one, the layer can only be affine, and a sigmoid of an affine function of
   * all-positive inputs saturates. It did: sweeping every one of the twelve inputs
   * across its full range moved the output between 0 and 14 kcal, pinned at 5000 -
   * the ceiling of its own range. Training could not rescue that either, because a
   * saturated sigmoid has no gradient to descend; fitted on days where burn rose
   * cleanly with activity, it settled on the mean and stayed flat.
   */
  private static readonly HIDDEN_KNEES = [
    0.443999, 0.550842, 0.657685, 0.764528, 0.871371, 0.978214,
    1.085058, 1.191901, 1.298744, 1.405587, 1.512430, 1.619273
  ];

  /**
   * Physiologically grounded starting weights.
   *
   * The priors are chosen so that the untrained network reproduces the formula the
   * app already trusts, rather than starting somewhere arbitrary and being averaged
   * into the displayed burn regardless:
   *
   *     tdee = 26.4 x weight + activeKcal + strengthKcal
   *
   * where 26.4 is 22 kcal/kg of basal metabolism times 1.2 for everyday movement -
   * which lands within 2% of what this app's own breakdown computes. With the inputs
   * scaled as they are, that makes the prior-weighted sum s equal to tdee/4000, and
   * the network's target y = (tdee - 1000)/4000 exactly s - 0.25.
   *
   * Everything else starts at zero: intake, sleep, HRV, caffeine, creatine. Not
   * because they cannot matter, but because their effect on expenditure is what the
   * model is there to learn from this athlete's own history. A guessed prior on them
   * would be a number nobody measured, blended into a calorie target.
   *
   * The output layer is fitted by least squares against that target on the logit
   * scale, over 20,000 sampled days spanning 45-135 kg, 0-2000 active kcal and
   * 0-1500 strength kcal: RMSE 33 kcal, worst case 532 at the extremes of the range.
   */
  private generateDefaultWeights() {
    const inputSize = 12;
    const hiddenSize = 12;

    // s = 0.66*(weight/100) + 0.5*(active/2000) + 0.5*(strength/2000) = tdee/4000
    const priorWeightsByInput = new Array(inputSize).fill(0);
    priorWeightsByInput[1] = 0.5;   // strength calories
    priorWeightsByInput[2] = 0.5;   // active calories
    priorWeightsByInput[11] = 0.66; // trend weight, carrying basal + everyday movement

    const W1: number[][] = Array.from({ length: inputSize }, (_, i) =>
      new Array(hiddenSize).fill(priorWeightsByInput[i])
    );
    const B1: number[] = ZenithFusionNet.HIDDEN_KNEES.map(knee => -knee);

    // Fitted; see above. Column 0 is TDEE.
    //
    // Ridge-regularised rather than a plain least-squares solve, because SimpleMLP
    // clamps every weight to +/-12 and the unregularised fit wanted -14.58 for one of
    // them. That coefficient would have been silently truncated on the first training
    // pass - the retrain log already read "weight scale 12.00 -> 12.00", which is the
    // clamp, not a coincidence - leaving a model subtly different from the one that
    // was fitted and verified. A penalty that keeps the largest weight at 8.7 costs
    // 8 kcal of accuracy and removes the discrepancy entirely.
    const TDEE_W2 = [
      3.647716, 1.033072, -0.422111, -0.254492, 0.332085, 2.053026,
      5.591627, -2.558776, -8.673397, -1.388618, 0.149331, 0.057236
    ];
    const TDEE_B2 = -1.286350;

    // Recovery and capacity are not fitted here - they have no formula to be fitted
    // against - so they keep a modest positive prior and are shaped by training. They
    // are given DIFFERENT weights per unit rather than one shared value, so those two
    // outputs are not condemned to the same affine collapse the TDEE output had.
    const W2: number[][] = Array.from({ length: hiddenSize }, (_, h) => [
      TDEE_W2[h],
      0.6 - 0.04 * h,
      0.55 - 0.035 * h
    ]);
    const B2: number[] = [TDEE_B2, -0.2, -0.15];

    return { W1, B1, W2, B2 };
  }

  /**
   * Loads the model weights from Supabase/cache.
   */
  public async init(supabase: any, userId: string): Promise<void> {
    await this.mlp.loadOrInit(supabase, userId);
  }

  /**
   * Predicts multi-task athletic features.
   */
  public predict(
    intakeCalories: number,
    strengthCaloriesKcal: number,
    activeCaloriesKcal: number,
    sleepQuality: number,
    sleepDurationHours: number,
    deepSleepRatio: number,
    remSleepRatio: number,
    hrvRmssd: number,
    deltaRhr: number,
    caffeineMg: number,
    creatineSat: number,
    trendWeight: number
  ): FusionPrediction {
    const x = this.buildFeatureVector(
      intakeCalories, strengthCaloriesKcal, activeCaloriesKcal, sleepQuality, sleepDurationHours,
      deepSleepRatio, remSleepRatio, hrvRmssd, deltaRhr, caffeineMg,
      creatineSat, trendWeight
    );

    const y = this.mlp.predict(x);

    // Map outputs:
    // Output 0 (TDEE): scaled 0..1 representing 1000..5000 kcal
    const tdeeKcal = Math.round(1000 + y[0] * 4000);

    // Output 1 (Recovery): scaled 0..1 representing 0..100%
    const recoveryScore = Math.round(Math.max(0, Math.min(1, y[1])) * 100);

    // Output 2 (Athletic Capacity): scaled 0..1 representing 0..100%
    const athleticCapacity = Math.round(Math.max(0, Math.min(1, y[2])) * 100);

    return {
      tdeeKcal,
      recoveryScore,
      athleticCapacity
    };
  }

  /**
   * The ONE place raw daily metrics become a model input vector.
   *
   * Both predict() and train() go through this. They previously did not:
   * predict() scaled every input to roughly 0..1, while train() passed the raw
   * numbers straight to backprop - intake in the thousands, gym volume in the
   * thousands, weight in the seventies. The network was therefore trained on
   * vectors around 3000x larger in magnitude than the ones it was later asked
   * to predict from.
   *
   * The consequence was not subtle. Those huge inputs produce huge gradients,
   * which drove the stored weights to values like -270 (this net's own priors
   * are 0.3..0.8), and at serve time the tiny 0..1 inputs then saturated the
   * output - so the "SOTA ML" TDEE read ~4996 kcal, essentially the ceiling of
   * its 1000..5000 output range, next to a real estimate near 1900.
   *
   * Keep this function as the only construction site for the vector; a second
   * copy is how the train/serve skew came back last time.
   */
  public buildFeatureVector(
    intakeCalories: number,
    strengthCaloriesKcal: number,
    activeCaloriesKcal: number,
    sleepQuality: number,
    sleepDurationHours: number,
    deepSleepRatio: number,
    remSleepRatio: number,
    hrvRmssd: number,
    deltaRhr: number,
    caffeineMg: number,
    creatineSat: number,
    trendWeight: number
  ): number[] {
    return [
      this.intakeScaler.scale(intakeCalories),
      this.strengthCaloriesScaler.scale(strengthCaloriesKcal),
      this.activeCaloriesScaler.scale(activeCaloriesKcal),
      this.sleepQualityScaler.scale(sleepQuality),
      this.sleepDurationScaler.scale(sleepDurationHours),
      Math.min(1.0, Math.max(0.0, deepSleepRatio)),
      Math.min(1.0, Math.max(0.0, remSleepRatio)),
      this.hrvScaler.scale(hrvRmssd),
      Math.min(1.0, Math.max(-1.0, deltaRhr / 20.0)),
      Math.min(1.5, caffeineMg / 300.0),
      Math.min(1.0, Math.max(0.0, creatineSat)),
      Math.min(1.5, trendWeight / 100.0)
    ];
  }

  /**
   * Trains the model using confirmed real-world athletic feedback.
   *
   * `rawInputs` are the same twelve unscaled daily metrics predict() takes, in
   * the same order - they are scaled here through buildFeatureVector() so the
   * training distribution matches the serving one.
   */
  public async train(
    supabase: any,
    userId: string,
    rawInputs: number[],
    actualTdee: number,
    actualRecovery: number,
    actualCapacity: number
  ): Promise<void> {
    if (rawInputs.length !== 12) {
      throw new Error(`ZenithFusionNet.train expects 12 raw inputs, received ${rawInputs.length}`);
    }

    const x = this.buildFeatureVector(
      rawInputs[0], rawInputs[1], rawInputs[2], rawInputs[3], rawInputs[4], rawInputs[5],
      rawInputs[6], rawInputs[7], rawInputs[8], rawInputs[9], rawInputs[10], rawInputs[11]
    );

    // Map targets to 0..1 scale
    const targets = [
      Math.min(1.0, Math.max(0.0, (actualTdee - 1000) / 4000)),
      Math.min(1.0, Math.max(0.0, actualRecovery / 100)),
      Math.min(1.0, Math.max(0.0, actualCapacity / 100))
    ];

    await this.mlp.train(supabase, userId, x, targets, 0.15);
  }

  /**
   * Rebuilds the model from a user's full logged history in one pass.
   *
   * The online loop in train() sees one day at a time, only on days the
   * dashboard is actually opened, so it converges slowly and unevenly. After
   * the scale mismatch was fixed the stored weights had to be discarded
   * outright (see the model key above), which left the net back at its
   * physiological defaults - this replays real history to move it from those
   * priors to something fitted to the athlete.
   *
   * Each sample carries the same twelve raw daily metrics predict() takes, so
   * everything goes through buildFeatureVector() and the training distribution
   * matches the serving one by construction.
   */
  public async retrainFromHistory(
    supabase: any,
    userId: string,
    days: {
      rawInputs: number[];
      actualTdee: number;
      actualRecovery: number;
      actualCapacity: number;
    }[],
    epochs: number = 25
  ): Promise<{ epochs: number; samples: number; finalMse: number }> {
    const samples = days
      .filter(d => d.rawInputs.length === 12 && Number.isFinite(d.actualTdee) && d.actualTdee > 0)
      .map(d => ({
        x: this.buildFeatureVector(
          d.rawInputs[0], d.rawInputs[1], d.rawInputs[2], d.rawInputs[3], d.rawInputs[4],
          d.rawInputs[5], d.rawInputs[6], d.rawInputs[7], d.rawInputs[8], d.rawInputs[9],
          d.rawInputs[10], d.rawInputs[11]
        ),
        targets: [
          Math.min(1.0, Math.max(0.0, (d.actualTdee - 1000) / 4000)),
          Math.min(1.0, Math.max(0.0, d.actualRecovery / 100)),
          Math.min(1.0, Math.max(0.0, d.actualCapacity / 100))
        ]
      }));

    return this.mlp.trainBatch(supabase, userId, samples, epochs, 0.15);
  }

  /** Weight-health snapshot, for verifying a retrain landed somewhere sane. */
  public getDiagnostics(): { maxAbsWeight: number; confidence: number } {
    return {
      maxAbsWeight: this.mlp.getMaxAbsWeight(),
      confidence: this.mlp.getConfidenceScore()
    };
  }
}
