import { toDateKeyFromDate } from '@zenith/shared';

/** Monday of the week containing `d`, at local midnight. */
export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Local calendar day for a Date.
 *
 * Delegates to the shared helper rather than keeping a fourth hand-rolled copy
 * of the same logic - Vigor, Kratos and the training-load service each had one
 * too, and two of those had drifted to a UTC-based implementation that put
 * entries on the wrong day for anyone off UTC+0.
 */
export function formatDateString(d: Date): string {
  return toDateKeyFromDate(d);
}

/**
 * Date portion of a stored timestamp string.
 *
 * Deliberately a substring rather than a Date round-trip: these values are
 * compared against other stored strings, so reparsing would reintroduce a
 * timezone shift where none currently exists.
 */
export function toYYYYMMDD(dateTimeStr: string | undefined | null): string {
  if (!dateTimeStr) return '';
  return dateTimeStr.substring(0, 10);
}
