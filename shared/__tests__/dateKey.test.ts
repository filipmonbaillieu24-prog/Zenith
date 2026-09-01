import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { toDateKey, toDateKeyFromDate, calendarDaysAgo } from '../dateKey';

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
  let visited = 0;
  const pattern = /\.toISOString\(\)\s*\.\s*(?:slice\(0,\s*10\)|split\('T'\)\[0\])/;

  // withFileTypes rather than a statSync per entry - see the note in
  // rulesOfHooks.test.ts. Both walks were ~4.5s against a 5s timeout.
  const SKIP = new Set(['node_modules', 'dist', 'build', '.git', '.gradle', 'gradle', '.idea', 'coverage']);
  const walk = (dir: string) => {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const entry = dirent.name;
      if (SKIP.has(entry)) continue;
      const full = join(dir, entry);
      if (dirent.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry)) continue;
      visited++;
      if (ALLOWED.some(a => entry === a)) continue;
      const src = readFileSync(full, 'utf8');
      src.split('\n').forEach((line, i) => {
        if (pattern.test(line)) offenders.push(`${relative(REPO, full)}:${i + 1}`);
      });
    }
  };

  it('every app buckets days with the shared helper', () => {
    walk(APPS);
    // A walk that quietly stops walking passes this test with zero offenders, which
    // is the one failure mode a greppy guard cannot survive. Hold the floor.
    expect(visited, 'the walk stopped finding source files').toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});

/**
 * "Yesterday" is a calendar word. Elapsed hours cannot answer it, and the muscle
 * heatmap used to try: a session at 20:00 was still "Today (13h ago)" at 09:00 the
 * next morning, and floor(hours / 24) under-counted any span that did not begin at
 * midnight.
 */
describe('calendarDaysAgo', () => {
  const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 0, 0);

  it('counts an evening session as yesterday the next morning', () => {
    const trained = at(2026, 8, 30, 20);   // 13 hours before...
    const now = at(2026, 8, 31, 9);        // ...this
    expect(calendarDaysAgo(trained.getTime(), now)).toBe(1);
  });

  it('still calls this morning today, hours later', () => {
    expect(calendarDaysAgo(at(2026, 8, 31, 8).getTime(), at(2026, 8, 31, 23))).toBe(0);
  });

  it('does not under-count a span that started late in the day', () => {
    // 58 hours, spanning three calendar days. floor(58/24) said 2.
    const trained = at(2026, 8, 28, 23);
    const now = at(2026, 8, 31, 9);
    expect(calendarDaysAgo(trained.getTime(), now)).toBe(3);
  });

  it("matches this athlete's real last session", () => {
    // Last Kratos workout 26 Aug 21:00 local, viewed on 31 Aug. Five calendar days;
    // the hours-based rule reported four.
    expect(calendarDaysAgo(at(2026, 8, 26, 21).getTime(), at(2026, 8, 31, 11))).toBe(5);
  });
});
