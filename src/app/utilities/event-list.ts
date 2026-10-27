import { currentLanguage } from '../i18n/languages';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { AttendanceStatus } from './constants';
import { translate } from '@jsverse/transloco';

/**
 * Helpers for the card layout of the Terminlisten (Termine, Signout, Parents):
 * date tile, month groups, time line and status pills.
 */

/** How many past Termine are shown before "Alle anzeigen". */
export const PAST_PREVIEW_COUNT = 3;

export interface EventMonthGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Groups already sorted items by month, keeping their order. */
export function groupByMonth<T>(items: T[], getDate: (item: T) => string): EventMonthGroup<T>[] {
  const groups: EventMonthGroup<T>[] = [];
  for (const item of items) {
    const date = dayjs(getDate(item)).locale(currentLanguage());
    const key = date.format('YYYY-MM');
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: date.format('MMMM YYYY'), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** Short weekday ("Di") for the date tile. */
export function eventWeekday(date: string): string {
  return dayjs(date).locale(currentLanguage()).format('dd');
}

/** Day of month ("20") for the date tile. */
export function eventDay(date: string): string {
  return dayjs(date).format('DD');
}

/** "19:00–21:00", "19:00" or '' when no time is set. */
export function eventTimeRange(start?: string | null, end?: string | null): string {
  const s = start ? start.slice(0, 5) : '';
  const e = end ? end.slice(0, 5) : '';
  if (s && e) { return `${s}–${e}`; }
  return s;
}

/** Joins the non-empty parts of a meta line with " · ". */
export function eventMeta(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}

/** Ionic color of a percentage pill, same thresholds as before. */
export function percentageColor(perc: number): string {
  return perc >= 75 ? 'success' : perc >= 50 ? 'warning' : 'danger';
}

/** Ionic color of a status pill or dot. */
export function statusColor(status: AttendanceStatus): string {
  switch (status) {
    case AttendanceStatus.Present: return 'success';
    case AttendanceStatus.Absent: return 'danger';
    case AttendanceStatus.Late: return 'tertiary';
    case AttendanceStatus.LateExcused: return 'rosa';
    case AttendanceStatus.Neutral: return 'medium';
    default: return 'warning';
  }
}

/** Readable status for the pill; upcoming Termine read as a plan ("Zugesagt"), past ones as a result. */
export function statusLabel(status: AttendanceStatus, past = false): string {
  switch (status) {
    case AttendanceStatus.Present: return past ? translate('common.status.present') : translate('common.status.accepted');
    case AttendanceStatus.Absent: return translate('common.status.absent');
    case AttendanceStatus.Late: return translate('common.status.lateShort');
    case AttendanceStatus.LateExcused: return past ? translate('common.status.lateExcusedShort') : translate('common.status.lateReported');
    case AttendanceStatus.Neutral: return translate('common.status.neutral');
    default: return translate('common.status.excused');
  }
}
