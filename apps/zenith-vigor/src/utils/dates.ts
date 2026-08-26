import { toDateKeyFromDate } from '@zenith/shared';

/**
 * Local calendar day for a timestamp, or '' when the input isn't a usable date.
 *
 * Thin wrapper over the shared helper: the null/invalid handling is what call
 * sites here rely on, but the actual day derivation must stay identical to
 * every other app's, which is why it delegates rather than reimplementing.
 */
export const getLocalDateKey = (dateInput: string | Date | null | undefined): string => {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  return toDateKeyFromDate(d);
};
