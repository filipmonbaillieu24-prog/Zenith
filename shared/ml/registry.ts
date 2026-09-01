import { DeclaredModel } from './declareModel';
import { autoregModel } from './models/strengthModels';
import { rpeModel, routeSpeedModel, cadenceModel } from './models/cyclingModels';
import { recoveryModel } from './RecoveryScore';
import { ZenithFusionNet } from './ZenithFusionNet';
import { SimpleMLP } from './SimpleMLP';

/**
 * Every piece of arithmetic in Zenith that claims to be intelligent, in one list.
 *
 * The audit that produced this file took a day, and most of that day went on finding
 * out what existed: six models pinned at an extreme, two trained on one representation
 * and served with another, one retrained on every login and read by nothing at all. It
 * was not that those were hard to diagnose - it was that nowhere said what the models
 * were, what fed them, or where their answers came out.
 *
 * So this does. It is not documentation about the code; it IS the code the status page
 * reads, which is the only kind that stays true.
 */

export type BrainKind =
  /** A declared model: reference function, fitted defaults, learns from history. */
  | 'model'
  /** A network predating the declaration format. Still hand-weighted. */
  | 'legacy-model'
  /** Deliberately not a model - a rule someone can read and disagree with. */
  | 'rule';

export interface BrainEntry {
  id: string;
  name: string;
  kind: BrainKind;
  /** One sentence: the question it answers. */
  answers: string;
  /** Where its inputs come from, in the athlete's language. */
  feeds: string[];
  /** Where the answer is shown. */
  surfaces: string[];
  /** Storage key in ml_weights, when it has one. */
  storageKey?: string;
  /** The declaration, for models that have one. */
  declared?: DeclaredModel;
  /** The underlying network, for models that persist weights. */
  mlp?: SimpleMLP;
  /** For rules: why this is not a model. */
  whyNotAModel?: string;
  /** What it learns from, and how much of it there needs to be. */
  training?: TrainingSource;
}

/**
 * Where a model's training examples come from.
 *
 * Worth stating per model rather than in prose somewhere, because "the model has not
 * learned anything yet" and "the model has nothing to learn from" look identical on a
 * status page and call for completely different responses. One is patience; the other
 * is a missing pipeline.
 */
export interface TrainingSource {
  /** In the athlete's language: what one training example IS. */
  sample: string;
  tables: string[];
  /** Roughly how many examples before its answers should be taken seriously. */
  minimumUseful: number;
  count: (supabase: any, userId: string) => Promise<TrainingDataCount>;
}

export interface TrainingDataCount {
  /** Examples that meet the rule. Negative means the count itself failed. */
  usable: number;
  /** Records looked at. The gap between this and usable is often the story. */
  considered: number;
  oldest: string | null;
  newest: string | null;
  /** Why records were discarded, when many were. */
  note?: string;
}

const EMPTY: TrainingDataCount = { usable: 0, considered: 0, oldest: null, newest: null };

/**
 * A model with no training path at all.
 *
 * Three of these exist, and saying so is the point: they answer their stated reference
 * and nothing about this athlete moves them. That is a defensible state - the reference
 * is a real formula, checked against real rides - but it is not the same as "still
 * learning", and a status page that blurred the two would be exactly the sort of thing
 * this whole exercise was about.
 */
const NOT_TRAINED: TrainingSource = {
  sample: 'nothing yet - this model has no training path and answers its reference',
  tables: [],
  minimumUseful: 0,
  count: async () => EMPTY
};

export const BRAIN_REGISTRY: BrainEntry[] = [
  {
    id: 'recovery',
    name: 'Recovery score',
    kind: 'legacy-model',
    answers: 'How recovered is the athlete today, 0 to 100?',
    feeds: ['Cardio freshness (CTL vs ATL)', 'Sleep quality', 'Sleep duration', 'Gym load'],
    surfaces: ['Hub dashboard', 'Kratos readiness'],
    storageKey: 'unified_recovery_score_v3',
    mlp: recoveryModel,
    training: {
      sample: 'a day the athlete answered how they felt',
      tables: ['vigor_readiness'],
      minimumUseful: 20,
      count: countReadinessSamples
    }
  },
  {
    id: 'fusion',
    name: 'Daily burn model',
    kind: 'legacy-model',
    answers: 'What does the athlete actually expend on a given day?',
    feeds: ['Intake', 'Strength calories', 'Cardio calories', 'Sleep', 'HRV', 'Caffeine', 'Trend weight'],
    surfaces: ['Fuel daily burn', 'Fuel calorie and macro targets'],
    storageKey: 'zenith_fusion_net_weights_v5',
    mlp: ZenithFusionNet.getInstance().mlpForDiagnostics,
    training: {
      sample: 'a fully logged day, costed against the measured weight trend around it',
      tables: ['fuel_days', 'fuel_logs', 'vigor_weight'],
      minimumUseful: 21,
      count: countFuelSamples
    }
  },
  {
    id: 'autoreg',
    name: 'Set-to-set load',
    kind: 'model',
    answers: 'What should the next set weigh, given how the last one went?',
    feeds: ['Reps and reps-in-reserve last set', 'Target reps', 'Set index', 'Rest taken'],
    surfaces: ['Kratos Pilot during a workout', 'Kratos web'],
    storageKey: autoregModel.declaration.key,
    declared: autoregModel,
    mlp: autoregModel.mlp,
    training: {
      sample: 'two consecutive working sets of the same exercise',
      tables: ['kratos_workouts'],
      minimumUseful: 40,
      count: countAutoregSamples
    }
  },
  {
    id: 'progression',
    name: 'Load progression',
    kind: 'rule',
    answers: 'Should this lift go up next session, and by how many hardware steps?',
    feeds: ['Last session reps vs target', 'Reps in reserve', 'Sleep', 'Cardio form', 'Sessions at this load'],
    surfaces: ['Kratos routine table'],
    whyNotAModel:
      'It was a network, pinned at the top of a 0-10 kg range, so it printed "+10 kg" '
      + 'beside every exercise for every athlete on every day. Rewriting it as a declared '
      + 'model was refused by the fit check: whether to add load depends on clearing the '
      + 'rep target AND having reps in reserve, which is an interaction between two '
      + 'inputs, and the answer jumps rather than sliding. No network of this shape can '
      + 'represent it.'
  },
  {
    id: 'rpe',
    name: 'Perceived exertion',
    kind: 'model',
    answers: 'How hard did that ride feel, 1 to 10?',
    feeds: ['Intensity factor', 'Duration'],
    surfaces: ['Aero ride page'],
    storageKey: rpeModel.declaration.key,
    declared: rpeModel,
    mlp: rpeModel.mlp,
    training: NOT_TRAINED
  },
  {
    id: 'route-speed',
    name: 'Route speed',
    kind: 'model',
    answers: 'How fast will this route be ridden, and so how long will it take?',
    feeds: ['Threshold power per kilogram', 'Climbing metres per kilometre'],
    surfaces: ['Aero route planner'],
    storageKey: routeSpeedModel.declaration.key,
    declared: routeSpeedModel,
    mlp: routeSpeedModel.mlp,
    training: NOT_TRAINED
  },
  {
    id: 'cadence',
    name: 'Cadence',
    kind: 'model',
    answers: 'What cadence would a rider naturally choose at this power?',
    feeds: ['Watts per kilogram'],
    surfaces: ['Aero ride page'],
    storageKey: cadenceModel.declaration.key,
    declared: cadenceModel,
    mlp: cadenceModel.mlp,
    training: NOT_TRAINED
  },
  {
    id: 'muscle-load',
    name: 'Muscle fatigue map',
    kind: 'rule',
    answers: 'How much fatigue did each session leave in each muscle?',
    feeds: ['Ride TSS', 'Running load from duration and heart rate', 'Gym sets per exercise'],
    surfaces: ['Hub muscle heatmap'],
    whyNotAModel:
      'Per-muscle shares of a session\'s load. It scaled from raw kilometres until '
      + 'recently, which charged an 82 km ride 85 on the quadriceps and a hard 6 km run '
      + '8 - running being by far the more damaging of the two per kilometre.'
  },
  {
    id: 'zane',
    name: 'ZANE metabolic calibration',
    kind: 'rule',
    answers: 'How does this athlete\'s weight actually respond to what they eat?',
    feeds: ['Logged intake', 'Measured weight trend', 'Activity', 'Sleep'],
    surfaces: ['Fuel daily burn', 'Fuel targets'],
    storageKey: 'zane_metabolic_coefficients',
    whyNotAModel:
      'A regression on the athlete\'s own weight trend against intake, which is a '
      + 'measurement rather than a prediction. It is the independent outcome the daily '
      + 'burn model is trained against.'
  }
];

// ── Status ───────────────────────────────────────────────────────────────────

export interface BrainStatus {
  entry: BrainEntry;
  /** Whether stored weights have been loaded from the server. */
  hasStoredWeights: boolean;
  lastTrainedAt: string | null;
  /**
   * How far the model has moved from its fitted defaults, as a share of its output
   * range. Zero means it is answering exactly what its reference says and has learned
   * nothing yet - which is a fine state to be in, and worth saying rather than hiding.
   */
  learnedShift: number | null;
  /** How closely the defaults reproduce the stated reference, 0 is exact. */
  fitError: number | null;
  /** How much of the right data this athlete actually has. Null until counted. */
  data: TrainingDataCount | null;
  /** Sampled reference-vs-current pairs, for showing the reader the actual numbers. */
  examples: { inputs: string; reference: number; current: number }[];
}

/**
 * Has this model learned anything, and if so how much?
 *
 * Compares what it answers now against what its reference function says, across the
 * input space it was fitted over. A freshly reset model scores 0 by construction; one
 * that has been trained on real days will differ, and the size of the difference is
 * the honest answer to "is the ML doing anything".
 */
export function measureLearnedShift(model: DeclaredModel, samples = 40): {
  shift: number;
  examples: { inputs: string; reference: number; current: number }[];
} {
  const inputs = model.declaration.inputs;
  const [lo, hi] = model.declaration.outputRange;
  const span = Math.max(1e-9, hi - lo);

  let total = 0;
  const examples: { inputs: string; reference: number; current: number }[] = [];

  for (let n = 0; n < samples; n++) {
    const t = samples === 1 ? 0.5 : n / (samples - 1);
    const raw = inputs.map(input => {
      const [a, b] = input.sampleRange;
      // A diagonal sweep through the input space: enough to detect movement without
      // pretending to be an exhaustive comparison.
      return a + t * (b - a);
    });
    const reference = model.referenceValue(raw);
    const current = model.predict(raw);
    total += Math.abs(current - reference);

    if (n % Math.ceil(samples / 3) === 0 && examples.length < 3) {
      examples.push({
        inputs: inputs.map((input, i) => `${input.name} ${Math.round(raw[i] * 100) / 100}`).join(', '),
        reference: Math.round(reference * 1000) / 1000,
        current: Math.round(current * 1000) / 1000
      });
    }
  }

  return { shift: total / samples / span, examples };
}

/** Consecutive working sets within one exercise: the pair the model learns a ratio from. */
async function countAutoregSamples(supabase: any, userId: string): Promise<TrainingDataCount> {
  const { data, error } = await supabase
    .from('kratos_workouts')
    .select('completed_at, sets, is_off_day')
    .eq('user_id', userId);
  if (error || !data) return EMPTY;

  let usable = 0;
  let considered = 0;
  let oldest: string | null = null;
  let newest: string | null = null;

  for (const w of data as any[]) {
    if (w.is_off_day || !Array.isArray(w.sets)) continue;
    for (const ex of w.sets) {
      if (!Array.isArray(ex?.sets)) continue;
      const working = ex.sets.filter((st: any) => st?.type === 'working');
      considered += Math.max(0, working.length - 1);
      for (let i = 1; i < working.length; i++) {
        const prev = working[i - 1];
        const curr = working[i];
        if (!(Number(prev.weight) > 0) || !(Number(curr.weight) > 0)) continue;
        if (!(Number(prev.reps) > 0) || !(Number(curr.reps) > 0)) continue;
        usable++;
        const at = w.completed_at;
        if (at && (!oldest || at < oldest)) oldest = at;
        if (at && (!newest || at > newest)) newest = at;
      }
    }
  }

  return {
    usable,
    considered,
    oldest,
    newest,
    note: considered > usable
      ? `${considered - usable} set pairs skipped for a missing weight or rep count`
      : undefined
  };
}

/** Days the athlete said how they felt: the recovery model's only independent target. */
async function countReadinessSamples(supabase: any, userId: string): Promise<TrainingDataCount> {
  const { data, error } = await supabase
    .from('vigor_readiness')
    .select('date, felt')
    .eq('user_id', userId)
    .order('date');
  if (error || !data) return EMPTY;

  const rows = (data as any[]).filter(r => r.felt !== null && r.felt !== undefined);
  return {
    usable: rows.length,
    considered: (data as any[]).length,
    oldest: rows.length ? String(rows[0].date) : null,
    newest: rows.length ? String(rows[rows.length - 1].date) : null
  };
}

/** Fully logged days, costed against the measured weight trend around them. */
async function countFuelSamples(supabase: any, userId: string): Promise<TrainingDataCount> {
  const [daysRes, weightRes] = await Promise.all([
    supabase.from('fuel_days').select('date, is_complete').eq('user_id', userId),
    supabase.from('vigor_weight').select('logged_at').eq('user_id', userId)
  ]);
  const days = (daysRes?.data ?? []) as any[];
  const weights = (weightRes?.data ?? []) as any[];

  const complete = days.filter(d => d.is_complete);
  const sorted = complete.map(d => String(d.date)).sort();

  return {
    // Without two weigh-ins there is no weight trend, and so no independent outcome
    // to train a day against however completely it was logged.
    usable: weights.length >= 2 ? complete.length : 0,
    considered: days.length,
    oldest: sorted[0] ?? null,
    newest: sorted[sorted.length - 1] ?? null,
    note: weights.length < 2
      ? 'needs at least two weigh-ins before any day can be costed'
      : days.length > complete.length
        ? `${days.length - complete.length} days marked incomplete and excluded`
        : undefined
  };
}

export function statusFor(
  entry: BrainEntry,
  weightRows: Record<string, string>,
  dataCounts?: Record<string, TrainingDataCount>
): BrainStatus {
  const measured = entry.declared ? measureLearnedShift(entry.declared) : null;
  return {
    entry,
    hasStoredWeights: !!(entry.storageKey && weightRows[entry.storageKey]),
    lastTrainedAt: entry.storageKey ? weightRows[entry.storageKey] ?? null : null,
    learnedShift: measured ? measured.shift : null,
    fitError: entry.declared ? entry.declared.calibration.rmse : null,
    data: dataCounts?.[entry.id] ?? null,
    examples: measured ? measured.examples : []
  };
}


/** Counts the training data every model in the registry would learn from. */
export async function countAllTrainingData(
  supabase: any,
  userId: string
): Promise<Record<string, TrainingDataCount>> {
  const out: Record<string, TrainingDataCount> = {};
  await Promise.all(
    BRAIN_REGISTRY.filter(e => e.training).map(async entry => {
      try {
        out[entry.id] = await entry.training!.count(supabase, userId);
      } catch {
        // A counter that fails must not take the page down with it, and must not
        // report zero either - a zero here reads as "no data", which is a different
        // and much more alarming answer than "could not check".
        out[entry.id] = { usable: -1, considered: -1, oldest: null, newest: null };
      }
    })
  );
  return out;
}
