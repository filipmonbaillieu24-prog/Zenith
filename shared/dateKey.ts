// ==========================================================
// ZENITH ECOSYSTEM - CANONICAL LOCAL DATE KEY
// ==========================================================
//
// "Which calendar day does this timestamp belong to?" is asked all over the
// ecosystem - PMC day buckets, sleep logs, step totals, manual entries - and
// it has to be answered the SAME way everywhere or data silently lands in
// mismatched buckets.
//
// The trap is `new Date(ms).toISOString().slice(0, 10)`, which yields the UTC
// calendar day. For any user not at UTC+0 that disagrees with the day they
// actually lived: an evening workout in UTC+2 is "tomorrow" in UTC, and a
// late-evening entry in UTC-5 is still "today" in UTC. When one side of a
// join uses UTC keys and the other uses local keys, lookups miss and the
// data quietly reads as zero rather than failing loudly.
//
// Everything that buckets by day must use these helpers.

/** Local calendar day (YYYY-MM-DD) for a timestamp in epoch milliseconds. */
export function toDateKey(ms: number): string {
  return toDateKeyFromDate(new Date(ms));
}

/** Local calendar day (YYYY-MM-DD) for a Date. */
export function toDateKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Turns a date-picker value ("YYYY-MM-DD") into an ISO timestamp at LOCAL
 * midday, for storing a manually-entered log.
 *
 * `new Date('2026-08-26').toISOString()` parses the bare date string as UTC
 * midnight, so a user west of UTC gets a timestamp that reads back as the
 * PREVIOUS day - the entry they filed on the 26th shows up on the 25th.
 * Anchoring at local midday instead keeps the timestamp inside the intended
 * calendar day in every timezone, even after a UTC round-trip.
 */
export function localDateToISO(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}
