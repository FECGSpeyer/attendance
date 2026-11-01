import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import { Role } from './constants';
import { canArchiveAttendance, canSeeArchivedAttendances, filterArchivedForRole } from './archived';

describe('archived attendances', () => {
  const past = dayjs().subtract(3, 'day').toISOString();
  const future = dayjs().add(3, 'day').toISOString();

  it('only admins and responsibles see archived Termine', () => {
    expect(canSeeArchivedAttendances(Role.ADMIN)).toBe(true);
    expect(canSeeArchivedAttendances(Role.RESPONSIBLE)).toBe(true);
    for (const role of [Role.PLAYER, Role.VIEWER, Role.HELPER, Role.PARENT, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER, Role.APPLICANT, Role.NONE, undefined]) {
      expect(canSeeArchivedAttendances(role)).toBe(false);
    }
  });

  it('filters archived Termine for members', () => {
    const atts = [{ id: 1, archived: false }, { id: 2, archived: true }, { id: 3 }];
    expect(filterArchivedForRole(atts, Role.PLAYER).map(a => a.id)).toEqual([1, 3]);
    expect(filterArchivedForRole(atts, Role.VIEWER).map(a => a.id)).toEqual([1, 3]);
    expect(filterArchivedForRole(atts, Role.ADMIN).map(a => a.id)).toEqual([1, 2, 3]);
  });

  it('allows archiving only past Termine', () => {
    expect(canArchiveAttendance({ date: past }, Role.ADMIN)).toBe(true);
    expect(canArchiveAttendance({ date: future }, Role.ADMIN)).toBe(false);
    expect(canArchiveAttendance({ date: dayjs().toISOString() }, Role.RESPONSIBLE)).toBe(false);
    // a Freizeit that is still running is not over yet
    expect(canArchiveAttendance({ date: dayjs().subtract(1, 'day').toISOString(), duration_days: 3 }, Role.ADMIN)).toBe(false);
    expect(canArchiveAttendance({ date: past }, Role.VIEWER)).toBe(false);
  });

  it('always allows restoring an archived Termin', () => {
    expect(canArchiveAttendance({ date: future, archived: true }, Role.ADMIN)).toBe(true);
  });
});
