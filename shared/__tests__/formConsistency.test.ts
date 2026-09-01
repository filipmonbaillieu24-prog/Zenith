import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Hub, Aero and Kratos each show a Form / Fitness / Fatigue card, and on 2026-09-01
 * they read -4/12/16, -1/14/15 and +0/11/10 for the same athlete on the same day.
 *
 * They already shared computePMC. What differed was the pool fed into it: Aero costed
 * a gym session with a local `volume * 0.012` and left running out entirely, and
 * Kratos passed rides and gym but no runs. Three answers to "how fresh am I", none of
 * them labelled as scoped to one sport.
 *
 * A unit test cannot diff three rendered dashboards, but it can hold the invariant
 * that actually broke: every Form card builds its pool with the shared helper, at
 * whole-athlete scope, with all three disciplines in it.
 */

const FORM_SOURCES = [
  'apps/zenith-aero/src/pages/WorkoutDashboard.tsx',
  'apps/zenith-kratos/src/App.tsx',
  'apps/zenith-hub/src/pages/hub/ZenithHubPage.tsx'
];

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/** Comments describe the old formula on purpose; only real code should be searched. */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');

describe('every Form card is built from the same pool', () => {
  it.each(FORM_SOURCES)('%s uses buildTrainingLoadPool', file => {
    expect(read(file)).toContain('buildTrainingLoadPool');
  });

  it.each(FORM_SOURCES)('%s includes runs in the whole-athlete pool', file => {
    const src = read(file);
    // The 'all'-scope pool is the Form display. Runs were the discipline silently
    // missing from two of the three.
    const allScope = src.match(/buildTrainingLoadPool\([\s\S]{0,240}?'all'\s*\)/g) ?? [];
    expect(allScope.length, 'no whole-athlete pool found').toBeGreaterThan(0);
    for (const call of allScope) {
      expect(call, `whole-athlete pool without runs in ${file}`).toMatch(/strideRuns/);
    }
  });

  it('no app costs a gym session with its own formula', () => {
    // The exact shape that drifted: a local tonnage-to-load constant.
    for (const file of FORM_SOURCES) {
      expect(readCode(file), `${file} still has a local gym-load formula`)
        .not.toMatch(/volume\s*\*\s*0\.0\d+/);
    }
  });
});
