import { describe, it, expect } from 'vitest';
import { BRAIN_REGISTRY, statusFor, measureLearnedShift, DATA_SOURCES } from '../ml/registry';

/**
 * The registry is what the status page reads, so it has to stay true as models change.
 * A model added without an entry here becomes invisible again, which is the state that
 * let six saturated models sit unnoticed.
 */
describe('the model registry describes what actually exists', () => {
  it('gives every entry a question it answers, inputs and a surface', () => {
    for (const entry of BRAIN_REGISTRY) {
      expect(entry.answers.length).toBeGreaterThan(15);
      expect(entry.reads.length).toBeGreaterThan(0);
      expect(entry.surfaces.length).toBeGreaterThan(0);
    }
  });

  it('reads only from sources that exist, and says what it takes from each', () => {
    // The diagram indexes DATA_SOURCES by these ids and draws a line from whatever comes
    // back. A typo used to be invisible in the type system and produced a node labelled
    // "undefined" with a line running out of it.
    for (const entry of BRAIN_REGISTRY) {
      for (const read of entry.reads) {
        expect(DATA_SOURCES[read.source], `${entry.id} reads unknown source ${read.source}`)
          .toBeDefined();
        // "sleep" is the source; "quality score and hours" is what makes the diagram
        // worth reading. A bare restatement of the label teaches nothing.
        expect(read.fields.length).toBeGreaterThan(8);
      }
      const sources = entry.reads.map(r => r.source);
      expect(new Set(sources).size, `${entry.id} lists a source twice`).toBe(sources.length);
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

  it('has no model left claiming it cannot learn', () => {
    // Three models used to carry a "no training path" marker. Every one of them had
    // data available all along - the pipeline had been deleted with the saturated
    // network it fed, and this registry repeated the claim rather than checking it.
    const noPath = BRAIN_REGISTRY.filter(e => e.training?.minimumUseful === 0);
    expect(noPath).toHaveLength(0);
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

describe('fuel_days records exclusions, not inclusions', () => {
  /**
   * A day with no row is a normal day that counts. The table holds nine rows for this
   * athlete and every one of them is false, so a counter asking for is_complete === true
   * reported zero usable days out of twenty-three logged.
   */
  const client = (logs: string[], days: { date: string; is_complete: boolean }[], weighIns: number) => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          const rows =
            table === 'fuel_logs' ? logs.map(d => ({ logged_at: `${d}T12:00:00Z` }))
            : table === 'fuel_days' ? days
            : Array.from({ length: weighIns }, () => ({ logged_at: '2026-08-01T00:00:00Z' }));
          const result = { data: rows, error: null };
          return { ...result, order: async () => result, then: (r: any) => r(result) };
        }
      })
    })
  }) as any;

  const fuelEntry = BRAIN_REGISTRY.find(e => e.id === 'fusion')!;

  it('counts a logged day with no fuel_days row as usable', () => {
    return fuelEntry.training!.count(
      client(['2026-08-10', '2026-08-11', '2026-08-12'], [], 5),
      'u'
    ).then(count => {
      expect(count.usable).toBe(3);
    });
  });

  it('excludes only the days explicitly marked incomplete', async () => {
    const count = await fuelEntry.training!.count(
      client(
        ['2026-08-10', '2026-08-11', '2026-08-12'],
        [{ date: '2026-08-11', is_complete: false }],
        5
      ),
      'u'
    );
    expect(count.usable).toBe(2);
    expect(count.considered).toBe(3);
    expect(count.note).toContain('1 day');
  });

  it('needs a weight trend before any day can be costed', async () => {
    const count = await fuelEntry.training!.count(client(['2026-08-10'], [], 1), 'u');
    expect(count.usable).toBe(0);
    expect(count.note).toContain('weigh-ins');
  });

  it('does not count the same day twice for several meals', async () => {
    const count = await fuelEntry.training!.count(
      client(['2026-08-10', '2026-08-10', '2026-08-10'], [], 5),
      'u'
    );
    expect(count.usable).toBe(1);
  });
});

describe('every model with data available has a path to use it', () => {
  /**
   * Three models were listed as having no training path at all. Every one of this
   * athlete's rides carries a logged RPE, an average cadence and a duration - the
   * signal was there, and the pipeline had been deleted along with the saturated
   * network it used to feed. The registry repeated the mistake instead of catching it.
   */
  it('leaves no model claiming it cannot learn', () => {
    for (const entry of BRAIN_REGISTRY.filter(e => e.kind !== 'rule')) {
      expect(entry.training, entry.name).toBeDefined();
      expect(entry.training!.minimumUseful, entry.name).toBeGreaterThan(0);
      expect(entry.training!.tables.length, entry.name).toBeGreaterThan(0);
    }
  });

  it('counts rides for the three that learn from them', async () => {
    const rides = [
      { date: 1, distance: 77, duration: 11460, metadata: { rpe: 7, avgCadence: 84 } },
      { date: 2, distance: 3,  duration: 600,   metadata: { avgCadence: 80 } },
      { date: 3, distance: 42, duration: 6180,  metadata: {} }
    ];
    const client = {
      from: () => ({ select: () => ({ eq: async () => ({ data: rides, error: null }) }) })
    } as any;

    const counts: Record<string, number> = {};
    for (const id of ['rpe', 'cadence', 'route-speed']) {
      const entry = BRAIN_REGISTRY.find(e => e.id === id)!;
      counts[id] = (await entry.training!.count(client, 'u')).usable;
    }

    expect(counts.rpe).toBe(1);          // only the first has a rating
    expect(counts.cadence).toBe(2);      // two recorded a cadence
    expect(counts['route-speed']).toBe(2); // the 3 km one is too short to pace from
  });
});

describe('recovery counts the days it actually trains on', () => {
  it('reports the month of samples, and how many carry a real answer', async () => {
    // It trains over the last 31 days whether or not the athlete rated them, standing
    // the heuristic in where they did not - so counting only readiness answers said
    // "2 usable" for a model with a month of samples.
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: async () => ({
            data: table === 'vigor_sleep'
              ? Array.from({ length: 22 }, (_, i) => ({ logged_at: `2026-08-${String(i + 1).padStart(2, '0')}T22:00:00Z` }))
              : [{ date: '2026-08-30', felt: 3 }, { date: '2026-08-31', felt: 4 }],
            error: null
          })
        })
      })
    } as any;

    const entry = BRAIN_REGISTRY.find(e => e.id === 'recovery')!;
    const count = await entry.training!.count(client, 'u');
    expect(count.usable).toBe(22);
    expect(count.note).toContain('2 of them');
  });

  it('says plainly when it is learning the formula rather than the athlete', async () => {
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: async () => ({
            data: table === 'vigor_sleep' ? [{ logged_at: '2026-08-01T22:00:00Z' }] : [],
            error: null
          })
        })
      })
    } as any;
    const entry = BRAIN_REGISTRY.find(e => e.id === 'recovery')!;
    const count = await entry.training!.count(client, 'u');
    expect(count.note).toContain('formula rather than you');
  });
});
