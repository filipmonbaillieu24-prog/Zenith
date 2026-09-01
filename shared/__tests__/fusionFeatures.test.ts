import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The input that told the model nothing.
 *
 * Active calories reached the fusion network as `activeCalories > 0 ? 80 : 0` at all
 * three of its call sites - live training, prediction, and the history retrain. A
 * rest day and a day with a 6 km run differed by a constant, so the model could not
 * represent how hard a day was, only whether anything had happened at all. Its output
 * moved 4 kcal, 1969 to 1973, when a 544 kcal run was added to the day. It could not
 * have done otherwise.
 *
 * A greppy guard, in the same spirit as the day-key and hooks tests: the three call
 * sites have to agree with each other and with the scaler, and nothing in a type
 * signature makes them.
 */
describe('the fusion net is fed measured activity, not a flag', () => {
  const REPO = join(__dirname, '..', '..');
  const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

  const CALL_SITES = [
    'apps/zenith-fuel/src/App.tsx',
    'apps/zenith-fuel/src/utils/fusionRetrain.ts',
  ];

  it('no call site substitutes a constant for the activity input', () => {
    for (const file of CALL_SITES) {
      const src = read(file);
      // The exact shape of the bug, and the near-misses of it.
      expect(src).not.toMatch(/[Aa]ctiveCalories\w*(\[[^\]]*\]\s*\|\|\s*0)?\s*>\s*0\s*\?\s*\d+\s*:\s*0/);
    }
  });

  it('the scaler covers a real day rather than a TSS range', () => {
    const src = read('shared/ml/ZenithFusionNet.ts');
    // 0..300 was a TSS range for an input that now carries kilocalories; a hard day
    // would have pinned at the top of it.
    expect(src).toMatch(/activeCaloriesScaler\s*=\s*new MinMaxScaler\(0,\s*(1[5-9]\d{2}|[2-9]\d{3})\)/);
  });

  it('the stored weights key was bumped away from the flag-trained ones', () => {
    const src = read('shared/ml/ZenithFusionNet.ts');
    // Weights fitted against a constant encode "activity happened" where the input
    // now says "how much". Reusing them would be worse than starting over.
    expect(src).not.toMatch(/'zenith_fusion_net_weights_v2'/);
    expect(src).toMatch(/'zenith_fusion_net_weights_v[3-9]'/);
  });
});
