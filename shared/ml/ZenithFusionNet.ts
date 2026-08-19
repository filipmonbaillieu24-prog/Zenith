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

    const W1: number[][] = Array.from({ length: inputSize }, () => new Array(hiddenSize).fill(0));
    const B1: number[] = new Array(hiddenSize).fill(0.05);
    const W2: number[][] = Array.from({ length: hiddenSize }, () => new Array(outputSize).fill(0));
    const B2: number[] = [0.45, 0.70, 0.75]; // baseline offsets for [TDEE, Recovery, Capacity]

    // Populate input -> hidden weights with physiological priorities
    for (let h = 0; h < hiddenSize; h++) {
      W1[0][h] = 0.3;  // Caloric Intake
      W1[1][h] = 0.6;  // Gym Volume
      W1[2][h] = 0.8;  // Cardio TSS
      W1[3][h] = 0.5;  // Sleep Quality
      W1[4][h] = 0.4;  // Sleep Duration
      W1[5][h] = 0.3;  // Deep Sleep Ratio
      W1[7][h] = 0.7;  // HRV rMSSD
      W1[9][h] = 0.4;  // Caffeine

      // Hidden -> Outputs
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
