import { describe, it, expect } from 'vitest';
import {
  autoregModel, epley1RM, autoregNextWeight, effortSurplus,
  progressionSteps, progressionWeight, MAX_STEPS_PER_SESSION
} from '../ml/models/strengthModels';
import { describeModel } from '../ml/declareModel';
import { WEIGHT_LIMIT } from '../ml/calibration';

const MODELS = [autoregModel];

describe('every declared model is fitted, not guessed', () => {
  it('reproduces its own reference function closely', () => {
    for (const model of MODELS) {
      const [lo, hi] = model.declaration.outputRange;
      // Within 4% of the output range is close enough that the untrained model and
      // the rule it encodes give the same practical answer.
      expect(model.calibration.rmse).toBeLessThan(0.04);
      expect(hi).toBeGreaterThan(lo);
    }
  });

  it('keeps its weights inside the clamp SimpleMLP applies', () => {
    // A fit that exceeds the clamp is truncated on the first training pass, leaving a
    // model different from the one that was fitted and checked.
    for (const model of MODELS) {
      expect(model.calibration.maxWeight).toBeLessThan(WEIGHT_LIMIT);
    }
  });

  it('is not saturated: the output moves across the input space', () => {
    for (const model of MODELS) {
      const inputs = model.declaration.inputs;
      const mid = inputs.map(i => (i.sampleRange[0] + i.sampleRange[1]) / 2);
      const low = inputs.map(i => i.sampleRange[0]);
      const high = inputs.map(i => i.sampleRange[1]);
      const [lo, hi] = model.declaration.outputRange;
      const span = hi - lo;

      const readings = [model.predict(low), model.predict(mid), model.predict(high)];
      const range = Math.max(...readings) - Math.min(...readings);
      // The old models moved by under 8% of their range across every input at once.
      expect(range).toBeGreaterThan(span * 0.3);
    }
  });
});

describe('progressive overload is a rule, deliberately', () => {
  // It was a network until the calibration refused it: fit error 0.185 against a 0.05
  // limit, because "cleared the target AND had reps in reserve" is an interaction
  // between two inputs and a network of this shape is a function of one weighted sum.
  const base = { repsBeyondTarget: 0, repsInReserve: 0, sessionsAtThisLoad: 1 };

  it('holds when the target was missed', () => {
    expect(progressionSteps({ ...base, repsBeyondTarget: -2 }).steps).toBe(0);
  });

  it('holds when the target was met with nothing left', () => {
    expect(progressionSteps({ ...base, repsBeyondTarget: 0, repsInReserve: 0 }).steps).toBe(0);
  });

  it('adds one step when the target was cleared with reps to spare', () => {
    expect(progressionSteps({ ...base, repsBeyondTarget: 1, repsInReserve: 2 }).steps).toBe(1);
  });

  it('adds two only when well clear and well recovered', () => {
    const doubled = progressionSteps({
      repsBeyondTarget: 2, repsInReserve: 3, sleepQuality: 85, cardioTsb: 5, sessionsAtThisLoad: 1
    });
    expect(doubled.steps).toBe(MAX_STEPS_PER_SESSION);
  });

  it('halves the step on poor sleep or deep fatigue', () => {
    expect(progressionSteps({ ...base, repsBeyondTarget: 2, repsInReserve: 3, sleepQuality: 45 }).steps).toBe(0.5);
    expect(progressionSteps({ ...base, repsBeyondTarget: 2, repsInReserve: 3, cardioTsb: -30 }).steps).toBe(0.5);
  });

  it('does not punish an athlete who simply did not record their sleep', () => {
    // Absent sleep must not be read as bad sleep.
    const unknown = progressionSteps({ repsBeyondTarget: 2, repsInReserve: 3, sessionsAtThisLoad: 1 });
    const good = progressionSteps({
      repsBeyondTarget: 2, repsInReserve: 3, sleepQuality: 85, cardioTsb: 0, sessionsAtThisLoad: 1
    });
    expect(unknown.steps).toBe(good.steps);
  });

  it('breaks a stall after four sessions at the same load', () => {
    expect(progressionSteps({ ...base, repsInReserve: 0, sessionsAtThisLoad: 5 }).steps).toBe(0.5);
  });

  it('never exceeds two steps whatever the inputs', () => {
    // The old model returned the top of a 0-10 kg range for every input it ever saw.
    for (const reps of [0, 3, 8]) {
      for (const rir of [0, 3, 5]) {
        for (const stuck of [0, 9]) {
          const d = progressionSteps({
            repsBeyondTarget: reps, repsInReserve: rir, sleepQuality: 100, cardioTsb: 40, sessionsAtThisLoad: stuck
          });
          expect(d.steps).toBeLessThanOrEqual(MAX_STEPS_PER_SESSION);
        }
      }
    }
  });

  it('converts steps into the weight the equipment actually moves in', () => {
    const one = progressionSteps({ ...base, repsBeyondTarget: 1, repsInReserve: 2 });
    expect(progressionWeight(one, 2.5)).toBe(2.5);
    expect(progressionWeight(one, 1.25, true)).toBe(2.5);  // per side
    expect(progressionWeight(one, 0)).toBe(0);
  });

  it('always explains itself', () => {
    expect(progressionSteps({ ...base, repsBeyondTarget: 1, repsInReserve: 2 }).reason.length).toBeGreaterThan(10);
  });
});

describe('autoregulation', () => {
  // [effortSurplus, setIndex, restRatio]
  it('holds roughly the same weight when the last set hit target exactly', () => {
    const ratio = autoregModel.predict([0, 1, 1]);
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.02);
  });

  it('goes up when the last set was easier than asked', () => {
    expect(autoregModel.predict([5, 1, 1])).toBeGreaterThan(autoregModel.predict([0, 1, 1]));
  });

  it('backs off when the last set fell short', () => {
    expect(autoregModel.predict([-5, 1, 1])).toBeLessThan(0.98);
  });

  it('values a rep of surplus at roughly the 2.5% the guardrails already use', () => {
    const perRep = (autoregModel.predict([4, 0, 1]) - autoregModel.predict([0, 0, 1])) / 4;
    expect(perRep).toBeGreaterThan(0.015);
    expect(perRep).toBeLessThan(0.035);
  });

  it('never suggests a jump a person could not make', () => {
    // The old model predicted a 324-388 kg one-rep max and relied entirely on
    // downstream guardrails to turn that into something a human could lift.
    for (const surplus of [-10, 0, 10]) {
      for (const setIndex of [0, 8]) {
        const ratio = autoregModel.predict([surplus, setIndex, 1]);
        expect(ratio).toBeGreaterThan(0.69);
        expect(ratio).toBeLessThan(1.17);
      }
    }
  });

  it('reduces the load deeper into a session', () => {
    expect(autoregModel.predict([0, 5, 1])).toBeLessThan(autoregModel.predict([0, 0, 1]));
  });

  it('reduces it again on a short rest', () => {
    expect(autoregModel.predict([0, 1, 0.4])).toBeLessThan(autoregModel.predict([0, 1, 1.2]));
  });

  it('turns a ratio into kilograms from the set that was actually done', () => {
    const w = autoregNextWeight(80, 12, 4, 10, 2, 1, 1);
    expect(w).toBeGreaterThan(80);
    expect(w).toBeLessThan(92);
    expect(autoregNextWeight(0, 10, 2, 10, 2, 1, 1)).toBe(0);
  });

  it('measures surplus as reps-to-failure delivered minus asked', () => {
    expect(effortSurplus(12, 4, 10, 2)).toBe(4);
    expect(effortSurplus(8, 0, 10, 2)).toBe(-4);
  });
});

describe('epley', () => {
  it('counts reps in reserve as reps not done', () => {
    expect(epley1RM(100, 10, 2)).toBeCloseTo(140);
    expect(epley1RM(0, 10, 2)).toBe(0);
  });
});

describe('diagnostics', () => {
  it('describes each model in one line', () => {
    for (const model of MODELS) {
      expect(describeModel(model)).toContain(model.declaration.key);
    }
  });
});
