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
  private tssScaler = new MinMaxScaler(0, 300);
  private sleepQualityScaler = new MinMaxScaler(0, 100);
  private sleepDurationScaler = new MinMaxScaler(4, 12);
  private hrvScaler = new MinMaxScaler(15, 120);

  private constructor() {
    this.mlp = new SimpleMLP(
      12, // Inputs: [Intake, GymVol, CardioTSS, SleepQuality, SleepDuration, DeepSleepRatio, REMRatio, HRV_rMSSD, DeltaRHR, Caffeine, Creatine, TrendWeight]
      12, // Hidden size
      3,  // Outputs: [TDEE_Scaled, Recovery_Scaled, Capacity_Scaled]
      'zenith_fusion_net_weights',
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
    priorWeightsByInput[2] = 0.8;  // Cardio TSS
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
    cardioTSS: number,
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
    // Standardize input vector
    const x = [
      this.intakeScaler.scale(intakeCalories),
      this.gymVolScaler.scale(gymVolume),
      this.tssScaler.scale(cardioTSS),
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
   * Trains the model using confirmed real-world athletic feedback.
   */
  public async train(
    supabase: any,
    userId: string,
    inputs: number[],
    actualTdee: number,
    actualRecovery: number,
    actualCapacity: number
  ): Promise<void> {
    // Map targets to 0..1 scale
    const targets = [
      Math.min(1.0, Math.max(0.0, (actualTdee - 1000) / 4000)),
      Math.min(1.0, Math.max(0.0, actualRecovery / 100)),
      Math.min(1.0, Math.max(0.0, actualCapacity / 100))
    ];

    await this.mlp.train(supabase, userId, inputs, targets, 0.15);
  }
}
