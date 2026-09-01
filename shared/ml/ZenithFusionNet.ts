import { SimpleMLP, buildSymmetryBrokenHiddenLayer } from './SimpleMLP';
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
  private gymVolScaler = new MinMaxScaler(0, 15000);
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
      12, // Inputs: [Intake, GymVol, ActiveKcal, SleepQuality, SleepDuration, DeepSleepRatio, REMRatio, HRV_rMSSD, DeltaRHR, Caffeine, Creatine, TrendWeight]
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
      'zenith_fusion_net_weights_v3',
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
  private generateDefaultWeights() {
    const inputSize = 12;
    const hiddenSize = 12;
    const outputSize = 3;

    // Prior weight per input feature (hand-picked physiological priorities). Inputs
    // 6, 8, 10, 11 (REM ratio, DeltaRHR, Creatine, TrendWeight) intentionally have no
    // prior (0) — same as before.
    const priorWeightsByInput = new Array(inputSize).fill(0);
    priorWeightsByInput[0] = 0.3;  // Caloric Intake
    priorWeightsByInput[1] = 0.6;  // Gym Volume
    priorWeightsByInput[2] = 0.8;  // Active calories
    priorWeightsByInput[3] = 0.5;  // Sleep Quality
    priorWeightsByInput[4] = 0.4;  // Sleep Duration
    priorWeightsByInput[5] = 0.3;  // Deep Sleep Ratio
    priorWeightsByInput[7] = 0.7;  // HRV rMSSD
    priorWeightsByInput[9] = 0.4;  // Caffeine

    // Small deterministic per-neuron perturbation breaks weight symmetry so hidden
    // ReLU units don't stay identical (and identically-gradiented) forever.
    const { W1, B1 } = buildSymmetryBrokenHiddenLayer(priorWeightsByInput, hiddenSize, 0.05);
    const W2: number[][] = Array.from({ length: hiddenSize }, () => new Array(outputSize).fill(0));
    const B2: number[] = [0.45, 0.70, 0.75]; // baseline offsets for [TDEE, Recovery, Capacity]

    // Populate hidden -> output weights
    for (let h = 0; h < hiddenSize; h++) {
      W2[h][0] = 0.5;  // TDEE output node
      W2[h][1] = 0.6;  // Recovery output node
      W2[h][2] = 0.55; // Capacity output node
    }

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
    gymVolume: number,
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
      intakeCalories, gymVolume, activeCaloriesKcal, sleepQuality, sleepDurationHours,
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
    gymVolume: number,
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
      this.gymVolScaler.scale(gymVolume),
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
