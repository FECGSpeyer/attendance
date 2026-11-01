import { Role } from './constants';
import { attendanceHasEnded } from './plan-days';

/** Archivierte Termine sehen nur Admins und Verantwortliche. */
export function canSeeArchivedAttendances(role: Role | number | null | undefined): boolean {
  return role === Role.ADMIN || role === Role.RESPONSIBLE;
}

/** Drops archived Termine for every role that must not see them. */
export function filterArchivedForRole<T extends { archived?: boolean | null }>(
  attendances: T[],
  role: Role | number | null | undefined,
): T[] {
  if (canSeeArchivedAttendances(role)) { return attendances; }
  return attendances.filter(att => !att?.archived);
}

/** Only Termine that are over can be archived; restoring is always possible. */
export function canArchiveAttendance(
  att: { date: string; duration_days?: number; archived?: boolean | null } | null | undefined,
  role: Role | number | null | undefined,
): boolean {
  if (!att || !canSeeArchivedAttendances(role)) { return false; }
  return Boolean(att.archived) || attendanceHasEnded(att);
}
