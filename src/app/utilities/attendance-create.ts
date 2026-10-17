import dayjs from 'dayjs';
import { AttendanceStatus } from './constants';
import { AttendanceType, ChecklistItem, PersonAttendance, Player, PlayerAbsence } from './interfaces';
import { Utils } from './Utils';
import type { DbService } from '../services/db.service';

export interface NewAttendanceOptions {
  /** Any time on the day; it is stored at 12:00 to avoid timezone issues. */
  date: string;
  notes?: string;
  typeInfo?: string;
  durationDays?: number;
  place?: string | null;
}

/** Persons a new Termin of this type is created for (not paused, in the type's groups and extra-field filter). */
export async function personsForAttendanceType(db: DbService, type: AttendanceType): Promise<Player[]> {
  let persons = (await db.getPlayers()).filter((player: Player) => {
    if (player.paused) {
      return false;
    }
    if (!type.relevant_groups?.length) {
      return true;
    }
    return type.relevant_groups.includes(player.instrument);
  });

  const filterField = type.additional_fields_filter?.key
    ? db.getPersonExtraFields().find(field => field.id === type.additional_fields_filter.key)
    : undefined;
  if (filterField && type.additional_fields_filter?.option != null) {
    persons = persons.filter((player: Player) => {
      const value = player.additional_fields?.[type.additional_fields_filter.key] ?? filterField.defaultValue;
      return value === type.additional_fields_filter.option;
    });
  }
  return persons;
}

/**
 * Creates one Termin of the given type with its checklist and the person
 * attendances (default status, shifts and absences applied). Returns the id.
 */
export async function createAttendanceForType(
  db: DbService,
  type: AttendanceType,
  options: NewAttendanceOptions,
  persons: Player[],
  absences: PlayerAbsence[] = [],
): Promise<number> {
  // Normalize date to noon (12:00) to avoid timezone issues between 22:00-02:00
  const normalizedDate = dayjs(options.date).hour(12).minute(0).second(0).millisecond(0).toISOString();

  // Prepare checklist with calculated due dates
  let checklist: ChecklistItem[] | undefined;
  if (type.checklist && type.checklist.length > 0) {
    const eventDateTime = type.start_time
      ? dayjs(normalizedDate).hour(Number(type.start_time.substring(0, 2))).minute(Number(type.start_time.substring(3, 5)))
      : dayjs(normalizedDate).hour(19).minute(0);

    checklist = type.checklist.map((item: ChecklistItem) => ({
      id: crypto.randomUUID(),
      text: item.text,
      deadlineHours: item.deadlineHours,
      completed: false,
      dueDate: item.deadlineHours !== null
        ? eventDateTime.subtract(item.deadlineHours, 'hour').toISOString()
        : null,
    }));
  }

  const attendance_id: number = await db.addAttendance({
    date: normalizedDate,
    type_id: type.id,
    notes: options.notes ?? '',
    save_in_history: true,
    typeInfo: options.typeInfo ?? '',
    start_time: type.start_time,
    end_time: type.end_time,
    duration_days: options.durationDays ?? (type.all_day ? type.duration_days : 1),
    is_org_plan: type.is_default_org_plan ?? false,
    checklist,
    place: options.place || null,
  });

  const personAttendances: PersonAttendance[] = persons.map(player => {
    let status = type.default_status;
    let notes = '';
    if (player.shift_id && !type.all_day) {
      const shift = db.shifts().find(s => s.id === player.shift_id);
      const result = Utils.getStatusByShift(
        shift,
        options.date,
        type.start_time || '19:00',
        type.end_time || '21:00',
        status,
        player.shift_start,
        player.shift_name,
      );
      status = result.status;
      notes = result.note;
    }

    const day = dayjs(normalizedDate);
    const absence = absences.find(a =>
      a.person_id === player.id &&
      !day.isBefore(dayjs(a.from_date), 'day') &&
      !day.isAfter(dayjs(a.until_date), 'day')
    );
    if (absence) {
      status = AttendanceStatus.Excused;
      notes = absence.reason;
    }

    return { attendance_id, person_id: player.id, status, notes };
  });

  await db.addPersonAttendances(personAttendances);
  return attendance_id;
}
