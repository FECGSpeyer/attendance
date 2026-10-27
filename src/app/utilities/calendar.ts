import dayjs from 'dayjs';
import { currentLanguage } from '../i18n/languages';
import { AttendanceStatus } from './constants';
import { CrossTenantPersonAttendance, DutyState } from './interfaces';
import { attendanceEndDate, DurationSource } from './plan-days';

/**
 * Helpers for the month/week calendar (Übersicht, Dashboard-Karte):
 * day grid, which days a Termin covers and how its dot looks.
 */

/** Weeks start on Monday in every app language (de, en-GB, ru, es). */
export const WEEK_START = 1;

/** Longest stretch a multi-day Termin is drawn over, so a typo can't fill the calendar. */
const MAX_SPAN_DAYS = 31;

/** Dot style: filled = zugesagt/eingeteilt, ring = offen, faded = abgesagt, square = Termin without own status. */
export type CalendarMark = 'yes' | 'open' | 'no' | 'event';

export interface CalendarDay {
  /** YYYY-MM-DD */
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

export interface CalendarSource extends DurationSource {
  status?: AttendanceStatus | null;
  duty_state?: DutyState | null;
  eventOnly?: boolean;
}

export function dayKey(date: dayjs.ConfigType): string {
  return dayjs(date).format('YYYY-MM-DD');
}

export function calendarMark(att: CalendarSource): CalendarMark {
  if (att.eventOnly) { return 'event'; }
  switch (att.status) {
    case AttendanceStatus.Present:
    case AttendanceStatus.Late:
    case AttendanceStatus.LateExcused:
      return 'yes';
    case AttendanceStatus.Excused:
    case AttendanceStatus.Absent:
      return 'no';
  }
  // Dienst: confirmed or taken over counts as eingeteilt; a request still waits for an answer.
  return att.duty_state === 'confirmed' || att.duty_state === 'self' ? 'yes' : 'open';
}

/** First day of the week containing `date`. */
export function startOfWeek(date: dayjs.ConfigType): dayjs.Dayjs {
  const d = dayjs(date).startOf('day');
  return d.subtract((d.day() - WEEK_START + 7) % 7, 'day');
}

function toDay(d: dayjs.Dayjs, month: number | null, today: string): CalendarDay {
  const key = dayKey(d);
  return { key, day: d.date(), inMonth: month === null || d.month() === month, isToday: key === today };
}

/** Seven days of the week containing `ref`. */
export function weekDays(ref: dayjs.ConfigType, today: dayjs.ConfigType = dayjs()): CalendarDay[] {
  const start = startOfWeek(ref);
  const todayKey = dayKey(today);
  return Array.from({ length: 7 }, (_, i) => toDay(start.add(i, 'day'), null, todayKey));
}

/** Full weeks covering the month of `ref`, days of the neighbouring months marked `inMonth: false`. */
export function monthGrid(ref: dayjs.ConfigType, today: dayjs.ConfigType = dayjs()): CalendarDay[][] {
  const first = dayjs(ref).startOf('month');
  const last = first.endOf('month');
  const todayKey = dayKey(today);
  const weeks: CalendarDay[][] = [];
  for (let start = startOfWeek(first); !start.isAfter(last, 'day'); start = start.add(7, 'day')) {
    weeks.push(Array.from({ length: 7 }, (_, i) => toDay(start.add(i, 'day'), first.month(), todayKey)));
  }
  return weeks;
}

/** Short weekday names in week order ("Mo" … "So"). */
export function weekdayLabels(): string[] {
  const start = startOfWeek(dayjs());
  return Array.from({ length: 7 }, (_, i) => start.add(i, 'day').locale(currentLanguage()).format('dd'));
}

/** Days (YYYY-MM-DD) a Termin covers; multi-day Termine appear on each day. */
export function coveredDays(att: DurationSource): string[] {
  const start = dayjs(att.date).startOf('day');
  const end = attendanceEndDate(att).startOf('day');
  const span = Math.min(Math.max(end.diff(start, 'day'), 0), MAX_SPAN_DAYS - 1);
  return Array.from({ length: span + 1 }, (_, i) => dayKey(start.add(i, 'day')));
}

/** Items per day, in the order given (sort them by date/time first). */
export function groupByDay<T extends DurationSource>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    for (const key of coveredDays(item)) {
      const list = map.get(key);
      if (list) { list.push(item); } else { map.set(key, [item]); }
    }
  }
  return map;
}

/**
 * Calendar entries: own Termine plus Termine of managed instances the person has no entry for,
 * sorted by day and start time.
 */
export function mergeCalendarEntries(own: CrossTenantPersonAttendance[], managed: CrossTenantPersonAttendance[]): CrossTenantPersonAttendance[] {
  const ownIds = new Set(own.map(a => `${a.tenantId}:${a.attId}`));
  const sortKey = (a: CrossTenantPersonAttendance) =>
    `${dayKey(a.date)} ${a.attendance?.start_time ?? a.attendanceType?.start_time ?? ''}`;
  return [...own, ...managed.filter(m => !ownIds.has(`${m.tenantId}:${m.attId}`))]
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}
