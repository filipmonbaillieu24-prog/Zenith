import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ZenithFusionNet } from '../ml/ZenithFusionNet';
import { strengthCaloriesFromVolume } from '../services/trainingLoad';

/**
 * The model could not see how hard a day was, and could not have.
 *
 * Activity reached the network as `activeCalories > 0 ? 80 : 0` at all three of its
 * call sites, so a rest day and a 6 km run differed by a constant - its output moved
 * 4 kcal, 1969 to 1973, when a 544 kcal run was added. Underneath that, the whole
 * network was saturated: twelve near-identical hidden units, all-positive inputs, and
 * a sigmoid pinned at the 5000 kcal ceiling of its own range where no gradient exists.
 */

const REST = [2400, 0, 0, 80, 8.0, 0.25, 0.18, 60, 0, 100, 0, 87.4];
const predict = (v: number[]) =>
  ZenithFusionNet.getInstance()
    .predict(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11])
    .tdeeKcal;
const withInput = (i: number, value: number) => {
  const v = [...REST];
  v[i] = value;
  return v;
};

describe('the untrained network is usable', () => {
  it('does not sit pinned at the ceiling of its own range', () => {
    // Every one of the twelve inputs used to leave the output between 4986 and 5000.
    expect(predict(REST)).toBeLessThan(4000);
    expect(predict(REST)).toBeGreaterThan(1500);
  });

  it('starts out agreeing with the formula it is averaged against', () => {
    // 22 kcal/kg basal x 1.2 for everyday movement, plus the day's activity. Starting
    // anywhere else would mean blending an arbitrary number into a calorie target
    // from the first day.
    for (const [weight, active, strength] of [
      [87.4, 0, 0], [87.4, 544, 0], [70, 300, 200], [110, 1200, 150]
    ]) {
      const formula = 26.4 * weight + active + strength;
      const model = predict([2400, strength, active, 80, 8.0, 0.25, 0.18, 60, 0, 100, 0, weight]);
      expect(Math.abs(model - formula)).toBeLessThan(150);
    }
  });
});

describe('it can tell a hard day from an easy one', () => {
  it('charges a 544 kcal run roughly what it cost', () => {
    const gained = predict(withInput(2, 544)) - predict(REST);
    // The old flag moved this by 4 kcal.
    expect(gained).toBeGreaterThan(450);
    expect(gained).toBeLessThan(650);
  });

  it('keeps responding across the whole range rather than stepping once', () => {
    const points = [0, 300, 600, 900, 1200, 1600].map(k => predict(withInput(2, k)));
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThan(points[i - 1] + 200);
    }
  });

  it('counts strength work as well as cardio', () => {
    const gained = predict(withInput(1, 280)) - predict(REST);
    expect(gained).toBeGreaterThan(200);
    expect(gained).toBeLessThan(360);
  });

  it('adds the two together rather than tracking only one', () => {
    const both = predict([2400, 280, 544, 80, 8.0, 0.25, 0.18, 60, 0, 100, 0, 87.4]);
    const cardioOnly = predict(withInput(2, 544));
    expect(both).toBeGreaterThan(cardioOnly + 200);
  });

  it('scales with the athlete, not just the session', () => {
    expect(predict(withInput(11, 110))).toBeGreaterThan(predict(withInput(11, 70)));
  });
});

describe('what the defaults deliberately do not assume', () => {
  it('leaves sleep, HRV, caffeine and intake to be learned', () => {
    // Not because they cannot matter, but because a guessed prior on them is a number
    // nobody measured, blended into a calorie target.
    for (const i of [0, 3, 4, 5, 6, 7, 9, 10]) {
      const low = predict(withInput(i, 0));
      const high = predict(withInput(i, i === 0 ? 5000 : i === 4 ? 12 : 100));
      expect(Math.abs(high - low)).toBeLessThan(1);
    }
  });
});

describe('strength calories have one definition', () => {
  it('is stable regardless of calibration state', () => {
    expect(strengthCaloriesFromVolume(0)).toBe(0);
    expect(strengthCaloriesFromVolume(4000)).toBe(100);
    expect(strengthCaloriesFromVolume(500)).toBe(50);     // floored
    expect(strengthCaloriesFromVolume(40000)).toBe(280);  // capped
  });

  it('does not read a missing volume as a session', () => {
    expect(strengthCaloriesFromVolume(null)).toBe(0);
    expect(strengthCaloriesFromVolume(undefined)).toBe(0);
    expect(strengthCaloriesFromVolume('')).toBe(0);
  });
});

describe('the call sites agree with each other', () => {
  const REPO = join(__dirname, '..', '..');
  const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

  it('no call site substitutes a constant for activity', () => {
    for (const file of ['apps/zenith-fuel/src/App.tsx', 'apps/zenith-fuel/src/utils/fusionRetrain.ts']) {
      expect(read(file)).not.toMatch(/[Aa]ctiveCalories\w*(\[[^\]]*\]\s*\|\|\s*0)?\s*>\s*0\s*\?\s*\d+\s*:\s*0/);
    }
  });

  it('no call site sends tonnage where the network expects energy', () => {
    for (const file of ['apps/zenith-fuel/src/App.tsx', 'apps/zenith-fuel/src/utils/fusionRetrain.ts']) {
      const src = read(file);
      expect(src).not.toMatch(/predict\(\s*\n?\s*intakeCalories,\s*\n?\s*selectedDateGymVolume/);
      expect(src).not.toMatch(/^\s*gymVolumeMap\[date\] \|\| 0,\s*$/m);
    }
  });

  it('abandons weights fitted against the old inputs', () => {
    const src = read('shared/ml/ZenithFusionNet.ts');
    expect(src).not.toMatch(/'zenith_fusion_net_weights_v[1234]'/);
    expect(src).toMatch(/'zenith_fusion_net_weights_v[5-9]'/);
  });
});

describe('training can now move it', () => {
  const noStore = {
    from: () => ({
      upsert: async () => ({}),
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
    })
  } as any;

  it('learns an athlete who burns more than the formula says', async () => {
    // A saturated sigmoid has no gradient, so the old network could not be taught
    // anything: fitted on days where burn rose cleanly with activity, it settled on
    // the mean of the targets and stayed flat with respect to every input.
    const net = ZenithFusionNet.getInstance();
    const day = (active: number) => [2400, 0, active, 80, 8.0, 0.25, 0.18, 60, 0, 100, 0, 87.4];

    const before = predict(day(600));
    for (let pass = 0; pass < 40; pass++) {
      for (const active of [0, 400, 800, 1200]) {
        // 400 kcal a day above what the formula predicts.
        await net.train(noStore, 'test-user', day(active), 26.4 * 87.4 + active + 400, 70, 70);
      }
    }
    const after = predict(day(600));

    expect(after).toBeGreaterThan(before + 100);
  });
});

describe('the fitted weights survive the model\'s own clamp', () => {
  it('keeps every default weight inside SimpleMLP\'s +/-12 limit', () => {
    // An unregularised fit wanted -14.58 for one coefficient. SimpleMLP clamps to 12,
    // so that weight would have been truncated on the first training pass, leaving a
    // model different from the one that was fitted and checked.
    const src = readFileSync(join(__dirname, '..', 'ml', 'ZenithFusionNet.ts'), 'utf8');
    const block = src.slice(src.indexOf('const TDEE_W2'), src.indexOf('const TDEE_B2'));
    const weights = (block.match(/-?\d+\.\d+/g) ?? []).map(Number);
    expect(weights.length).toBe(12);
    for (const w of weights) expect(Math.abs(w)).toBeLessThan(12);
  });
});
