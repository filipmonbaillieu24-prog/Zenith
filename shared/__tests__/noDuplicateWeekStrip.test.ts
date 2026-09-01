import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * One week strip, not three.
 *
 * It was written out twice by hand - in the logbook and in supplements - and the two
 * had already drifted: one showed the amber "excluded from learning" dot and the
 * other did not. The dashboard, where most of the reading happens, had no date
 * control at all, so changing the day meant visiting another tab and coming back.
 *
 * Adding a third copy would have been the cheap fix. This is the guard against the
 * next one.
 */
describe('the Fuel week selector exists once', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'apps', 'zenith-fuel', 'src', 'App.tsx'),
    'utf8'
  );

  it('has no hand-written copy left in the page', () => {
    expect(src).not.toMatch(/Previous Week/);
    expect(src).not.toMatch(/Next Week/);
  });

  it('is used on the dashboard, the logbook and supplements', () => {
    const uses = src.match(/<WeekDateSelector\b/g) ?? [];
    expect(uses.length).toBe(3);
  });
});
