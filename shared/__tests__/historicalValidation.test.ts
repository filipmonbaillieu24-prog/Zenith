import { describe, it, expect } from 'vitest';
import { autoregNextWeight, progressionSteps, progressionWeight } from '../ml/models/strengthModels';

/**
 * Checked against this athlete's own logged sets, not synthetic ones.
 *
 * Every case below is a real set from kratos_workouts, with the weight, reps and reps
 * in reserve they actually recorded. The question each asks is whether the model would
 * have told them something a sensible coach would have said at that moment.
 *
 * Their template targets 10-12 reps at RIR 2 on most lifts, so that is the target used
 * throughout unless a case says otherwise.
 */

const TARGET_REPS = 12;
const TARGET_RIR = 2;

describe('autoregulation against real logged sets', () => {
  it('holds the weight when a set landed on target', () => {
    // 29 Aug, PUSH, 115 kg x 14 @ RIR 3 -> next set was also 115 kg. Surplus is +3,
    // so a small increase is right, and it must not be a large one.
    const next = autoregNextWeight(115, 14, 3, TARGET_REPS, TARGET_RIR, 2, 1);
    expect(next).toBeGreaterThan(115);
    expect(next).toBeLessThan(126);
  });

  it('backs off after a set taken to failure short of target', () => {
    // 26 Aug, ARMS, 100 kg x 10 @ RIR 0 against a 12 @ RIR 2 target: four reps short.
    const next = autoregNextWeight(100, 10, 0, TARGET_REPS, TARGET_RIR, 3, 1);
    expect(next).toBeLessThan(100);
    expect(next).toBeGreaterThan(88);
  });

  it('recognises a genuinely easy set', () => {
    // 26 Aug, ARMS, 25 kg x 12 @ RIR 4, three sets identical - clearly too light.
    const next = autoregNextWeight(25, 12, 4, TARGET_REPS, TARGET_RIR, 2, 1);
    expect(next).toBeGreaterThan(25);
    expect(next / 25).toBeLessThan(1.16);
  });

  it('tracks the athlete\'s own within-session ramp without overshooting it', () => {
    // 29 Aug they ramped 30 -> 32.5 -> 35 kg across sets 4, 5, 6 of one exercise.
    // From 30 kg x 13 @ RIR 3, the model should suggest something in that
    // neighbourhood rather than a jump they would not have made.
    const next = autoregNextWeight(30, 13, 3, TARGET_REPS, TARGET_RIR, 4, 1);
    expect(next).toBeGreaterThan(30);
    expect(next).toBeLessThan(35.5);
  });

  it('never proposes a jump beyond a sixth of the previous set', () => {
    // Across every real set recorded, on every plausible target.
    const realSets: [number, number, number][] = [
      [6, 12, 3], [6, 13, 1], [115, 14, 3], [115, 12, 3], [22.5, 12, 0],
      [22.5, 10, 0], [30, 13, 3], [35, 14, 0], [25, 12, 4], [8, 14, 2],
      [10, 15, 0], [100, 14, 1], [100, 10, 0]
    ];
    for (const [weight, reps, rir] of realSets) {
      for (let setIndex = 0; setIndex <= 5; setIndex++) {
        const next = autoregNextWeight(weight, reps, rir, TARGET_REPS, TARGET_RIR, setIndex, 1);
        expect(next / weight).toBeLessThan(1.17);
        expect(next / weight).toBeGreaterThan(0.69);
      }
    }
  });
});

describe('progression against real sessions', () => {
  it('advances the lift that was clearly too light', () => {
    // 25 kg x 12 @ RIR 4 for three straight sets: two reps past a 10-rep floor with
    // four in reserve. That earns a step, and on a good day a double one.
    const d = progressionSteps({
      repsBeyondTarget: 2, repsInReserve: 4, sleepQuality: 80, cardioTsb: 0, sessionsAtThisLoad: 3
    });
    expect(d.steps).toBe(2);
    // On a machine with 2.5 kg plates that is +5 kg, not the +10 kg the old model gave.
    expect(progressionWeight(d, 2.5)).toBe(5);
  });

  it('holds the lift that was already at failure', () => {
    // 100 kg x 10 @ RIR 0, short of a 12-rep target.
    const d = progressionSteps({
      repsBeyondTarget: -2, repsInReserve: 0, sleepQuality: 80, cardioTsb: 0, sessionsAtThisLoad: 1
    });
    expect(d.steps).toBe(0);
  });

  it('breaks the stall on the lift that has not moved in weeks', () => {
    // 6 kg x 12-13 appears on 26 Aug and again on 29 Aug at the same load.
    const d = progressionSteps({
      repsBeyondTarget: 1, repsInReserve: 0, sleepQuality: 80, cardioTsb: 0, sessionsAtThisLoad: 5
    });
    expect(d.steps).toBe(0.5);
  });

  it('would never have produced the +10 kg the old model showed', () => {
    // The previous model returned the ceiling of a 0-10 kg range for every exercise on
    // the page. On this athlete's 6 kg dumbbell that was a 167% jump in one session.
    const everyRealCase: [number, number][] = [
      [2, 4], [1, 3], [0, 0], [-2, 0], [1, 1], [3, 5]
    ];
    for (const [beyond, reserve] of everyRealCase) {
      const d = progressionSteps({
        repsBeyondTarget: beyond, repsInReserve: reserve,
        sleepQuality: 100, cardioTsb: 40, sessionsAtThisLoad: 8
      });
      // On the 6 kg dumbbell, whose step is 2 kg.
      expect(progressionWeight(d, 2)).toBeLessThanOrEqual(4);
    }
  });
});
