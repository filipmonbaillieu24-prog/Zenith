import { describe, it, expect } from 'vitest';
import { BRAIN_REGISTRY, statusFor, measureLearnedShift } from '../ml/registry';

/**
 * The registry is what the status page reads, so it has to stay true as models change.
 * A model added without an entry here becomes invisible again, which is the state that
 * let six saturated models sit unnoticed.
 */
describe('the model registry describes what actually exists', () => {
  it('gives every entry a question it answers, inputs and a surface', () => {
    for (const entry of BRAIN_REGISTRY) {
      expect(entry.answers.length).toBeGreaterThan(15);
      expect(entry.feeds.length).toBeGreaterThan(0);
      expect(entry.surfaces.length).toBeGreaterThan(0);
    }
  });

  it('explains every rule that used to be a model', () => {
    for (const entry of BRAIN_REGISTRY.filter(e => e.kind === 'rule')) {
      expect(entry.whyNotAModel && entry.whyNotAModel.length).toBeGreaterThan(40);
    }
  });

  it('gives every declared model a storage key matching its declaration', () => {
    for (const entry of BRAIN_REGISTRY.filter(e => e.declared)) {
      expect(entry.storageKey).toBe(entry.declared!.declaration.key);
    }
  });

  it('has no duplicate ids or storage keys', () => {
    const ids = BRAIN_REGISTRY.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = BRAIN_REGISTRY.map(e => e.storageKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('has it learned anything', () => {
  const declared = BRAIN_REGISTRY.filter(e => e.declared);

  it('reports zero movement for a model still at its fitted defaults', () => {
    // This is the honest answer for a fresh install, and the page says it plainly
    // rather than implying the model is doing something.
    for (const entry of declared) {
      const { shift } = measureLearnedShift(entry.declared!);
      expect(shift).toBeLessThan(0.05);
    }
  });

  it('gives the reader real numbers to check, not just a percentage', () => {
    for (const entry of declared) {
      const { examples } = measureLearnedShift(entry.declared!);
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.inputs.length).toBeGreaterThan(5);
        expect(Number.isFinite(ex.reference)).toBe(true);
        expect(Number.isFinite(ex.current)).toBe(true);
      }
    }
  });

  it('reports never-trained rather than guessing when there are no stored weights', () => {
    const status = statusFor(BRAIN_REGISTRY[0], {});
    expect(status.hasStoredWeights).toBe(false);
    expect(status.lastTrainedAt).toBeNull();
  });

  it('picks up a stored row when one exists', () => {
    const withKey = BRAIN_REGISTRY.find(e => e.storageKey)!;
    const status = statusFor(withKey, { [withKey.storageKey!]: '2026-09-01T10:00:00Z' });
    expect(status.hasStoredWeights).toBe(true);
    expect(status.lastTrainedAt).toBe('2026-09-01T10:00:00Z');
  });
});

describe('training provenance', () => {
  it('says what one training example is, for every model that has a path', () => {
    for (const entry of BRAIN_REGISTRY.filter(e => e.training)) {
      expect(entry.training!.sample.length).toBeGreaterThan(15);
    }
  });

  it('marks the models with no training path as such, not as waiting', () => {
    // "Has not learned anything yet" and "has nothing to learn from" look identical on
    // a status page and call for opposite responses. A minimum of zero means the
    // second, and the page says "fixed formula" rather than implying a queue.
    const noPath = BRAIN_REGISTRY.filter(e => e.training?.minimumUseful === 0);
    expect(noPath.length).toBeGreaterThan(0);
    for (const entry of noPath) {
      expect(entry.training!.tables).toHaveLength(0);
    }
  });

  it('names the tables a trainable model actually reads', () => {
    for (const entry of BRAIN_REGISTRY.filter(e => (e.training?.minimumUseful ?? 0) > 0)) {
      expect(entry.training!.tables.length).toBeGreaterThan(0);
    }
  });

  it('counts nothing rather than crashing when the tables are empty', async () => {
    const emptyClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [], error: null }),
            then: (r: any) => r({ data: [], error: null })
          })
        })
      })
    } as any;

    for (const entry of BRAIN_REGISTRY.filter(e => (e.training?.minimumUseful ?? 0) > 0)) {
      const count = await entry.training!.count(emptyClient, 'nobody');
      expect(count.usable).toBe(0);
      expect(count.oldest).toBeNull();
    }
  });
});
