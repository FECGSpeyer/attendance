import dayjs from 'dayjs';

/**
 * Keeps one entry per calendar day (local time), in the original order.
 * The date picker can hold the same day twice in different formats
 * (e.g. the preset "now" ISO string and a picked "YYYY-MM-DD"), which
 * would otherwise create the same Termin twice.
 */
export function uniqueDates(dates: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const date of dates ?? []) {
    const d = dayjs(date);
    if (!d.isValid()) continue;
    const key = d.format('YYYY-MM-DD');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(date);
  }
  return result;
}
