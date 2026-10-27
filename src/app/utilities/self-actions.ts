import dayjs from 'dayjs';
import { AttendanceStatus } from './constants';
import { CrossTenantPersonAttendance } from './interfaces';

/**
 * Zusagen/Absagen rules for one's own Termin, shared by the Übersicht and the Dashboard-Karte Kalender.
 */

/** Sign-in stays open until the deadline of the Termin. */
export function isSigninOpen(att: CrossTenantPersonAttendance): boolean {
  if (!att.attendance?.deadline) {
    return true;
  }
  const localDeadline = dayjs(att.attendance.deadline).subtract(dayjs().utcOffset(), 'minute');
  return !dayjs().isAfter(localDeadline);
}

/** Which direct buttons a Termin offers and which one is active. */
export function quickActions(att: CrossTenantPersonAttendance) {
  const attType = att.attendanceType;
  const isExcused = att.status === AttendanceStatus.Excused || att.status === AttendanceStatus.LateExcused;
  return {
    present: att.text === 'X',
    canSignin: att.text !== 'X' && isSigninOpen(att),
    late: att.status === AttendanceStatus.LateExcused,
    excused: att.status === AttendanceStatus.Excused,
    blocked: isExcused || att.text === 'A',
    allowLate: !attType || attType.available_statuses.includes(AttendanceStatus.Late),
    allowExcuse: !attType || attType.available_statuses.includes(AttendanceStatus.Excused),
  };
}

/** Kind of sign-in the server expects for the current status. */
export function signinKind(att: CrossTenantPersonAttendance): string {
  return att.status === AttendanceStatus.LateExcused ? 'lateSignIn' :
    att.status === AttendanceStatus.Neutral ? 'neutralSignin' : 'signin';
}
