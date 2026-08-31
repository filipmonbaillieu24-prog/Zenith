import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { toDateKey, toDateKeyFromDate } from '../dateKey';

describe('local calendar day', () => {
  it('uses the day the athlete actually lived, not the UTC one', () => {
    // A late-evening moment. In any timezone west of UTC this is already
    // "tomorrow" in UTC, which is how an evening ride ends up filed on the wrong
    // day - the exact failure shared/dateKey.ts exists to prevent.
    const evening = new Date(2026, 7, 26, 23, 30, 0); // 26 Aug 2026, 23:30 local
    expect(toDateKeyFromDate(evening)).toBe('2026-08-26');
    expect(toDateKey(evening.getTime())).toBe('2026-08-26');
  });

  it('handles the small hours, when UTC is still on the previous day east of it', () => {
    const earlyHours = new Date(2026, 7, 26, 0, 30, 0); // 26 Aug 2026, 00:30 local
    expect(toDateKeyFromDate(earlyHours)).toBe('2026-08-26');
  });

  it('pads single-digit months and days', () => {
    expect(toDateKeyFromDate(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });
});

/**
 * A convention this codebase kept breaking: Aero had 17 UTC day-keys and never
 * imported the shared helper at all, so rides were bucketed on the UTC calendar
 * while every other app used the local one. Hub's background trainer had nine
 * more, which meant a ride logged late in the evening was trained against the
 * wrong night's sleep.
 *
 * Grepping for it in a test is blunt, but the alternative is finding the next one
 * by noticing a number looks wrong on a dashboard, which is how the last several
 * were found.
 */
describe('no UTC day-keys in date-bucketing code', () => {
  const REPO = join(__dirname, '..', '..');
  const APPS = join(REPO, 'apps');

  // Places where a UTC-formatted date is genuinely fine: it names a downloaded
  // file, or bounds a date picker.
  const ALLOWED = [
    'SystemConsolePage.tsx',
    'ProfilePage.tsx',
  ];

  const offenders: string[] = [];
  const pattern = /\.toISOString\(\)\s*\.\s*(?:slice\(0,\s*10\)|split\('T'\)\[0\])/;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build' || entry === '.git') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry)) continue;
      if (ALLOWED.some(a => entry === a)) continue;
      const src = readFileSync(full, 'utf8');
      src.split('\n').forEach((line, i) => {
        if (pattern.test(line)) offenders.push(`${relative(REPO, full)}:${i + 1}`);
      });
    }
  };

  it('every app buckets days with the shared helper', () => {
    walk(APPS);
    expect(offenders).toEqual([]);
  });
});
