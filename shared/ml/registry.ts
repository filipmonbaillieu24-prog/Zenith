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

/**
 * The data a model can read, named once.
 *
 * The first version of this let each model describe its own inputs in free text, and
 * the connection diagram drew whatever it was given: "Sleep", "Sleep quality" and
 * "Sleep duration" appeared as three separate boxes, all of them vigor_sleep. Nineteen
 * source nodes for what are really seven places data comes from, which made the picture
 * harder to read than the code it was meant to explain.
 *
 * Naming them once fixes the diagram and, more usefully, makes the question "what else
 * breaks if this table changes" answerable.
 */
export type SourceDomain = 'training' | 'body' | 'nutrition' | 'subjective';

export interface DataSource {
  id: string;
  label: string;
  /** Where it lives, so a schema change can be traced to what it moves. */
  table: string;
  domain: SourceDomain;
}

export const DATA_SOURCES: Record<string, DataSource> = {
  rides:      { id: 'rides',      label: 'Rides',            table: 'rides',              domain: 'training' },
  runs:       { id: 'runs',       label: 'Runs',             table: 'stride_activities',  domain: 'training' },
  gym:        { id: 'gym',        label: 'Gym sessions',     table: 'kratos_workouts',    domain: 'training' },
  templates:  { id: 'templates',  label: 'Gym routines',     table: 'kratos_templates',   domain: 'training' },
  load:       { id: 'load',       label: 'Training load',    table: 'derived from rides, runs and gym', domain: 'training' },
  sleep:      { id: 'sleep',      label: 'Sleep',            table: 'vigor_sleep',        domain: 'body' },
  weight:     { id: 'weight',     label: 'Weight',           table: 'vigor_weight',       domain: 'body' },
  profile:    { id: 'profile',    label: 'Your profile',     table: 'profiles',           domain: 'body' },
  intake:     { id: 'intake',     label: 'Food logged',      table: 'fuel_logs',          domain: 'nutrition' },
  supplements:{ id: 'supplements',label: 'Supplements',      table: 'fuel_supplements_log', domain: 'nutrition' },
  readiness:  { id: 'readiness',  label: 'How you felt',     table: 'vigor_readiness',    domain: 'subjective' },
  soreness:   { id: 'soreness',   label: 'Soreness',         table: 'vigor_soreness',     domain: 'subjective' }
};

export const DOMAIN_LABEL: Record<SourceDomain, string> = {
  training: 'Training',
  body: 'Body',
  nutrition: 'Nutrition',
  subjective: 'What you tell it'
};

/** One input: which source, and precisely what is taken from it. */
export interface ModelInput {
  source: keyof typeof DATA_SOURCES;
  /** The specific fields, in the athlete's language. */
  fields: string;
}

export type BrainKind =
  /** A declared model: reference function, fitted defaults, learns from history. */
  | 'model'
  /** A network predating the declaration format. Still hand-weighted. */
  | 'legacy-model'
  /** Deliberately not a model - a rule someone can read and disagree with. */
  | 'rule'
  /**
   * Learns online, from the athlete correcting it, rather than from a stored dataset.
   *
   * Worth its own kind because the status page cannot answer "how much data does it
   * have" for these: the corrections are applied to the weights as they happen and
   * never written down as rows. Counting zero would read as "no data", which is a
   * different and more alarming claim than "there is nothing here to count".
   */
  | 'feedback';

export interface BrainEntry {
  id: string;
  name: string;
  kind: BrainKind;
  /** One sentence: the question it answers. */
  answers: string;
  /** What it reads, by canonical source. */
  reads: ModelInput[];
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

export const BRAIN_REGISTRY: BrainEntry[] = [
  {
    id: 'recovery',
    name: 'Recovery score',
    kind: 'legacy-model',
    answers: 'How recovered is the athlete today, 0 to 100?',
    reads: [
      { source: 'load', fields: 'cardio freshness - chronic load against acute' },
      { source: 'sleep', fields: 'quality score and hours' },
      { source: 'gym', fields: 'effort-weighted tonnage' }
    ],
    surfaces: ['Hub dashboard', 'Kratos readiness'],
    storageKey: 'unified_recovery_score_v3',
    mlp: recoveryModel,
    training: {
      sample: 'a day with sleep recorded, targeted on your readiness answer where there is one',
      tables: ['vigor_sleep', 'vigor_readiness'],
      minimumUseful: 21,
      count: countRecoverySamples
    }
  },
  {
    id: 'fusion',
    name: 'Daily burn model',
    kind: 'legacy-model',
    answers: 'What does the athlete actually expend on a given day?',
    reads: [
      { source: 'intake', fields: 'calories logged that day' },
      { source: 'gym', fields: 'session tonnage, as calories' },
      { source: 'rides', fields: 'ride calories' },
      { source: 'runs', fields: 'run calories' },
      { source: 'sleep', fields: 'quality, hours, deep and REM share, HRV' },
      { source: 'supplements', fields: 'caffeine and creatine' },
      { source: 'weight', fields: 'trend weight, and the change it implies' }
    ],
    surfaces: ['Fuel daily burn', 'Fuel calorie and macro targets'],
    storageKey: 'zenith_fusion_net_weights_v5',
    mlp: ZenithFusionNet.getInstance().mlpForDiagnostics,
    training: {
      sample: 'a day with food logged, costed against the measured weight trend around it',
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
    reads: [
      { source: 'gym', fields: 'the last set: reps, reps in reserve, rest taken, position in the exercise' },
      { source: 'templates', fields: 'the reps and reps-in-reserve you were aiming for' }
    ],
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
    reads: [
      { source: 'gym', fields: 'last session on this lift, and how long it has sat at this load' },
      { source: 'templates', fields: 'the top of its prescribed rep range, and the equipment step' },
      { source: 'sleep', fields: 'quality, to decide whether to take the step' },
      { source: 'load', fields: 'cardio form' }
    ],
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
    reads: [
      { source: 'rides', fields: 'normalised power against threshold, and how long it lasted' },
      { source: 'profile', fields: 'threshold power, measured from recent rides' }
    ],
    surfaces: ['Aero ride page'],
    storageKey: rpeModel.declaration.key,
    declared: rpeModel,
    mlp: rpeModel.mlp,
    training: {
      sample: 'a ride you gave a perceived-exertion rating to',
      tables: ['rides'],
      minimumUseful: 8,
      count: countRidesWith('rpe')
    }
  },
  {
    id: 'route-speed',
    name: 'Route speed',
    kind: 'model',
    answers: 'How fast will this route be ridden, and so how long will it take?',
    reads: [
      { source: 'rides', fields: 'the speed you averaged, against the climbing per kilometre' },
      { source: 'profile', fields: 'threshold power and weight' }
    ],
    surfaces: ['Aero route planner'],
    storageKey: routeSpeedModel.declaration.key,
    declared: routeSpeedModel,
    mlp: routeSpeedModel.mlp,
    training: {
      sample: 'a ride over 5 km, with the speed you actually averaged on it',
      tables: ['rides'],
      minimumUseful: 8,
      count: countRidesWith('speed')
    }
  },
  {
    id: 'cadence',
    name: 'Cadence',
    kind: 'model',
    answers: 'What cadence would a rider naturally choose at this power?',
    reads: [
      { source: 'rides', fields: 'the cadence you chose at a given power' },
      { source: 'profile', fields: 'weight, for watts per kilogram' }
    ],
    surfaces: ['Aero ride page'],
    storageKey: cadenceModel.declaration.key,
    declared: cadenceModel,
    mlp: cadenceModel.mlp,
    training: {
      sample: 'a ride recording the cadence you chose at a given power',
      tables: ['rides'],
      minimumUseful: 8,
      count: countRidesWith('avgCadence')
    }
  },
  {
    id: 'muscle-load',
    name: 'Muscle fatigue map',
    kind: 'rule',
    answers: 'How much fatigue did each session leave in each muscle?',
    reads: [
      { source: 'rides', fields: 'training stress' },
      { source: 'runs', fields: 'duration and heart rate' },
      { source: 'gym', fields: 'sets per exercise, and which muscles each trains' }
    ],
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
    reads: [
      { source: 'intake', fields: 'everything logged, on days not marked incomplete' },
      { source: 'weight', fields: 'the measured trend across the window' },
      { source: 'rides', fields: 'ride calories' },
      { source: 'gym', fields: 'session tonnage' },
      { source: 'sleep', fields: 'quality and duration against your own average' }
    ],
    surfaces: ['Fuel daily burn', 'Fuel targets'],
    storageKey: 'zane_metabolic_coefficients',
    whyNotAModel:
      'A regression on the athlete\'s own weight trend against intake, which is a '
      + 'measurement rather than a prediction. It is the independent outcome the daily '
      + 'burn model is trained against.'
  },

  // ── Aero's own networks ───────────────────────────────────────────────────
  //
  // These four live in apps/zenith-aero/src/utils/localNeuralNet.ts and were missing
  // from this registry entirely, while the page above them claimed to describe "every
  // model in Zenith". They are listed by storage key rather than by object because
  // shared cannot import from an app; statusFor only ever needed the key, so nothing
  // is lost but the learned-shift measurement, which needs a declaration.
  {
    id: 'ftp_forecast',
    name: 'Threshold forecast',
    kind: 'legacy-model',
    answers: 'Where will this rider\'s threshold power be in eight weeks?',
    reads: [
      { source: 'rides', fields: 'estimated threshold per ride, and how often you rode' },
      { source: 'load', fields: 'chronic and acute load at the time of each ride' },
      { source: 'weight', fields: 'weight change across the window' }
    ],
    surfaces: ['Aero progression'],
    storageKey: 'cyclo_ftp_nn_weights_v2',
    training: {
      sample: 'two rides 14 to 30 days apart that both produced a threshold estimate',
      tables: ['rides'],
      minimumUseful: 8,
      count: countFtpTransitions
    }
  },
  {
    id: 'ride_label',
    name: 'Ride labelling',
    kind: 'feedback',
    answers: 'What kind of ride was that - recovery, endurance, intervals?',
    reads: [
      { source: 'rides', fields: 'intensity, how steady the power was, duration and climbing' }
    ],
    surfaces: ['Aero ride page'],
    storageKey: 'cyclo_label_nn_weights'
  },
  {
    id: 'workout_suggestion',
    name: 'Workout suggestion',
    kind: 'feedback',
    answers: 'What should this rider do next, given how fresh they are?',
    reads: [
      { source: 'load', fields: 'form, chronic and acute load' },
      { source: 'rides', fields: 'how hard the last three rides felt' },
      { source: 'profile', fields: 'the goal you set' }
    ],
    surfaces: ['Aero dashboard'],
    storageKey: 'cyclo_coach_nn_weights'
  },
  {
    id: 'ride_notes',
    name: 'Ride notes reader',
    kind: 'feedback',
    answers: 'Do these ride notes describe fatigue, recovery, or illness?',
    reads: [
      { source: 'rides', fields: 'the words you wrote in the note' }
    ],
    surfaces: ['Aero ride list'],
    storageKey: 'cyclo_local_nn_weights'
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

/**
 * Days with food logged, minus the ones explicitly marked incomplete.
 *
 * fuel_days records EXCLUSIONS, not inclusions: a day the athlete never touched has no
 * row at all and is perfectly usable, which is why the app reads it as
 * `dailyCompletionMap[date] ?? true`. A first version of this counter asked for
 * `is_complete === true` and reported zero usable days out of twenty-three logged -
 * the table holds nine rows and every one of them is false. The count was wrong, not
 * the data.
 */
async function countFuelSamples(supabase: any, userId: string): Promise<TrainingDataCount> {
  const [logsRes, daysRes, weightRes] = await Promise.all([
    supabase.from('fuel_logs').select('logged_at').eq('user_id', userId),
    supabase.from('fuel_days').select('date, is_complete').eq('user_id', userId),
    supabase.from('vigor_weight').select('logged_at').eq('user_id', userId)
  ]);
  const logs = (logsRes?.data ?? []) as any[];
  const days = (daysRes?.data ?? []) as any[];
  const weights = (weightRes?.data ?? []) as any[];

  const excluded = new Set(
    days.filter(d => d.is_complete === false).map(d => String(d.date))
  );

  const loggedDays = new Set<string>();
  for (const log of logs) {
    if (!log?.logged_at) continue;
    loggedDays.add(String(log.logged_at).slice(0, 10));
  }

  const usableDays = [...loggedDays].filter(d => !excluded.has(d)).sort();

  // Only the marked days that actually carried a food log removed anything. Reporting
  // the size of the exclusion set instead read as "9 days excluded" against 23 looked
  // at and 21 usable - an arithmetic that cannot be true, and the sort of number that
  // makes an athlete distrust the rest of the page.
  const droppedDays = [...loggedDays].filter(d => excluded.has(d)).length;

  return {
    // Two weigh-ins are the floor: without a weight trend there is no independent
    // outcome to cost a day against, however completely it was logged.
    usable: weights.length >= 2 ? usableDays.length : 0,
    considered: loggedDays.size,
    oldest: usableDays[0] ?? null,
    newest: usableDays[usableDays.length - 1] ?? null,
    note: weights.length < 2
      ? 'needs at least two weigh-ins before any day can be costed'
      : droppedDays > 0
        ? `${droppedDays} day${droppedDays === 1 ? '' : 's'} you marked incomplete, excluded`
        : undefined
  };
}

/**
 * Rides carrying whichever field a cycling model learns from.
 *
 * These three were listed as having no training path at all, which was wrong: every
 * ride this athlete has recorded carries a logged RPE, an average cadence and a
 * distance with a duration. The pipeline had been deleted along with the saturated
 * networks it fed, and the registry repeated the mistake rather than catching it.
 */
function countRidesWith(
  field: 'rpe' | 'avgCadence' | 'speed'
): (supabase: any, userId: string) => Promise<TrainingDataCount> {
  return async (supabase: any, userId: string) => {
    const { data, error } = await supabase
      .from('rides')
      .select('date, distance, duration, metadata')
      .eq('user_id', userId);
    if (error || !data) return EMPTY;

    let usable = 0;
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const r of data as any[]) {
      let meta = r.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = {}; }
      }

      let ok = false;
      if (field === 'speed') {
        ok = Number(r.distance) >= 5 && Number(r.duration) > 540;
      } else {
        const raw = meta?.[field];
        ok = raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw));
      }
      if (!ok) continue;

      usable++;
      const at = Number(r.date);
      if (Number.isFinite(at)) {
        if (oldest === null || at < oldest) oldest = at;
        if (newest === null || at > newest) newest = at;
      }
    }

    const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 10));
    return {
      usable,
      considered: (data as any[]).length,
      oldest: iso(oldest),
      newest: iso(newest)
    };
  };
}

/**
 * Days the recovery model can build a sample for, and how many carry a real answer.
 *
 * It trains over the last 31 days whether or not the athlete rated them, standing the
 * heuristic in where they did not - so counting only the readiness answers reported
 * "2 usable" for a model with a month of samples. Both numbers matter: a day with a
 * rating teaches it something, a day without teaches it to repeat the formula.
 */
async function countRecoverySamples(supabase: any, userId: string): Promise<TrainingDataCount> {
  const [sleepRes, readinessRes] = await Promise.all([
    supabase.from('vigor_sleep').select('logged_at').eq('user_id', userId),
    supabase.from('vigor_readiness').select('local_date, felt').eq('user_id', userId)
  ]);

  const sleep = (sleepRes?.data ?? []) as any[];
  const readiness = ((readinessRes?.data ?? []) as any[]).filter(
    r => r.felt !== null && r.felt !== undefined
  );

  const nights = new Set(sleep.map(s => String(s.logged_at).slice(0, 10)));
  const sorted = [...nights].sort();

  return {
    usable: nights.size,
    considered: nights.size,
    oldest: sorted[0] ?? null,
    newest: sorted[sorted.length - 1] ?? null,
    note: readiness.length === 0
      ? 'none of these days has a readiness answer, so it is learning the formula rather than you'
      : `${readiness.length} of them carry your own readiness answer; the rest fall back to the formula`
  };
}

/**
 * Ride pairs the threshold forecast can learn a transition from.
 *
 * One example is a ride, and another 14 to 30 days later, where both produced an
 * estimated threshold - that gap being the window over which a change in threshold
 * is attributable to the training in between.
 */
async function countFtpTransitions(supabase: any, userId: string): Promise<TrainingDataCount> {
  const { data, error } = await supabase
    .from('rides')
    .select('date, metadata')
    .eq('user_id', userId);
  if (error || !data) return EMPTY;

  const withFtp: number[] = [];
  for (const r of data as any[]) {
    let meta = r.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { meta = {}; }
    }
    const eftp = Number(meta?.eFTP ?? meta?.eftp);
    const at = Number(r.date);
    if (Number.isFinite(eftp) && eftp > 0 && Number.isFinite(at)) withFtp.push(at);
  }
  withFtp.sort((a, b) => a - b);

  const DAY = 24 * 3600 * 1000;
  let pairs = 0;
  let oldest: number | null = null;
  let newest: number | null = null;
  for (let i = 0; i < withFtp.length; i++) {
    const partner = withFtp.find(t => t - withFtp[i] >= 14 * DAY && t - withFtp[i] <= 30 * DAY);
    if (partner === undefined) continue;
    pairs++;
    if (oldest === null || withFtp[i] < oldest) oldest = withFtp[i];
    if (newest === null || partner > newest) newest = partner;
  }

  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 10));
  return {
    usable: pairs,
    considered: withFtp.length,
    oldest: iso(oldest),
    newest: iso(newest),
    note: withFtp.length > 0 && pairs === 0
      ? 'your rides carry threshold estimates, but none are 14 to 30 days apart yet'
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
