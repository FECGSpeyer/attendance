import dayjs from 'dayjs';
import { AttendanceStatus } from './constants';
import { Attendance, AttendanceType, DutyState, PersonAttendance, PersonUnavailability } from './interfaces';

/**
 * Dienstplan helpers (Termintypen im Dienst-Modus).
 *
 * A person "occupies" a duty when they were assigned (duty_state set) and did
 * not cancel. Persons without duty_state are stand-ins: they stay Neutral, are
 * not expected and do not count towards the attendance average.
 */

export type DutyFill = 'full' | 'requested' | 'partial' | 'open';

const CANCELLED_STATUSES = [AttendanceStatus.Excused, AttendanceStatus.LateExcused, AttendanceStatus.Absent];

export function isDutyType(type: Pick<AttendanceType, 'duty_mode'> | null | undefined): boolean {
  return !!type?.duty_mode;
}

export function dutyRequired(att: Pick<Attendance, 'duty_required'> | null | undefined, type: Pick<AttendanceType, 'duty_required'> | null | undefined): number {
  return Math.max(1, att?.duty_required ?? type?.duty_required ?? 1);
}

export function isCancelled(pa: Pick<PersonAttendance, 'status'>): boolean {
  return CANCELLED_STATUSES.includes(pa.status);
}

/** Assigned (requested, confirmed or self) and not cancelled. */
export function occupiesDuty(pa: Pick<PersonAttendance, 'duty_state' | 'status'>): boolean {
  return !!pa.duty_state && !isCancelled(pa);
}

/** Assigned and confirmed (or took the duty themselves), not cancelled. */
export function confirmedDuty(pa: Pick<PersonAttendance, 'duty_state' | 'status'>): boolean {
  return (pa.duty_state === 'confirmed' || pa.duty_state === 'self') && !isCancelled(pa);
}

export function occupiedCount(persons: PersonAttendance[] | undefined): number {
  return (persons ?? []).filter(occupiesDuty).length;
}

/**
 * full = enough persons and all confirmed, requested = enough persons but some
 * still unconfirmed, partial = some persons, open = nobody.
 */
export function dutyFill(persons: PersonAttendance[] | undefined, required: number): DutyFill {
  const occupied = (persons ?? []).filter(occupiesDuty);
  if (occupied.length >= required) {
    return occupied.every(confirmedDuty) ? 'full' : 'requested';
  }
  return occupied.length ? 'partial' : 'open';
}

export function dutyFillColor(fill: DutyFill): string {
  switch (fill) {
    case 'full': return 'success';
    case 'open': return 'danger';
    default: return 'warning';
  }
}

export function dutyStateLabel(state: DutyState | null | undefined): string {
  switch (state) {
    case 'requested': return 'angefragt';
    case 'confirmed': return 'bestätigt';
    case 'self': return 'selbst eingetragen';
    default: return '';
  }
}

/**
 * Whether a person attendance counts for the attendance average. For duty
 * types only assigned persons count; stand-ins are left out.
 */
export function countsForAverage(type: AttendanceType | null | undefined, pa: Pick<PersonAttendance, 'duty_state'>, fallback = false): boolean {
  if (!type) {
    return fallback;
  }
  if (!type.include_in_average) {
    return false;
  }
  return !(type.duty_mode && !pa.duty_state);
}

/** Persons of a Termin that count for its percentage (all, or only assigned ones for duties). */
export function averagePersons(persons: PersonAttendance[] | undefined, type: AttendanceType | null | undefined): PersonAttendance[] {
  if (!isDutyType(type)) {
    return persons ?? [];
  }
  return (persons ?? []).filter(pa => !!pa.duty_state);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a Termin date. */
export function isoWeekday(date: string): number {
  const day = dayjs(date).day();
  return day === 0 ? 7 : day;
}

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/** The first unavailability rule of a person that matches the date and type, if any. */
export function matchingUnavailability(
  rules: PersonUnavailability[],
  personId: number,
  date: string,
  typeId: string,
): PersonUnavailability | undefined {
  const weekday = isoWeekday(date);
  const day = dayjs(date);
  return rules.find(rule =>
    rule.person_id === personId &&
    rule.weekdays.includes(weekday) &&
    (!rule.type_ids?.length || rule.type_ids.includes(typeId)) &&
    (!rule.valid_until || !day.isAfter(dayjs(rule.valid_until), 'day'))
  );
}

export function unavailabilityNote(rule: PersonUnavailability): string {
  return rule.reason?.trim() ? `Regelmäßig verhindert: ${rule.reason.trim()}` : 'Regelmäßig verhindert';
}

export function weekdaysText(weekdays: number[]): string {
  return [...weekdays].sort((a, b) => a - b).map(d => WEEKDAY_SHORT[d - 1]).join(', ');
}

/**
 * Fair distribution of open duty places. Persons with the fewest duties
 * (existing + already planned in this run) are picked first; ties are broken
 * randomly so repeated runs give different but equally fair plans.
 */
export interface DutySlot {
  attendanceId: number;
  date: string;
  /** Persons that can be picked (in the Termin, not cancelled, not assigned). */
  candidates: number[];
  /** Persons already occupying the duty. */
  occupied: number[];
  open: number;
}

export interface DistributionOptions {
  maxPerPerson: number;
  notTwiceSameDay: boolean;
}

export function distributeDuties(
  slots: DutySlot[],
  baseCounts: Map<number, number>,
  options: DistributionOptions,
  random: () => number = Math.random,
): Map<number, number[]> {
  const counts = new Map(baseCounts);
  const plannedInRun = new Map<number, number>();
  const busyDays = new Map<number, Set<string>>();
  const result = new Map<number, number[]>();

  const markDay = (personId: number, date: string) => {
    const day = dayjs(date).format('YYYY-MM-DD');
    if (!busyDays.has(personId)) busyDays.set(personId, new Set());
    busyDays.get(personId).add(day);
  };
  for (const slot of slots) {
    for (const personId of slot.occupied) markDay(personId, slot.date);
  }

  const sorted = [...slots].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
  for (const slot of sorted) {
    const picked: number[] = [];
    const day = dayjs(slot.date).format('YYYY-MM-DD');
    for (let i = 0; i < slot.open; i++) {
      const pool = slot.candidates.filter(personId =>
        !picked.includes(personId) &&
        (plannedInRun.get(personId) ?? 0) < options.maxPerPerson &&
        !(options.notTwiceSameDay && busyDays.get(personId)?.has(day))
      );
      if (!pool.length) break;
      const shuffled = pool.map(id => ({ id, r: random() })).sort((a, b) => a.r - b.r).map(x => x.id);
      shuffled.sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
      const personId = shuffled[0];
      picked.push(personId);
      counts.set(personId, (counts.get(personId) ?? 0) + 1);
      plannedInRun.set(personId, (plannedInRun.get(personId) ?? 0) + 1);
      markDay(personId, slot.date);
    }
    if (picked.length) result.set(slot.attendanceId, picked);
  }
  return result;
}
