import { describe, expect, it } from 'vitest';
import { attendanceEndDate, attendanceHasEnded, attendanceIsRunning } from './plan-days';

describe('attendance end date', () => {
  const freizeit = { date: '2026-10-17T00:00:00', duration_days: 3 };

  it('ends on the last day of a mehrtägiger Termin', () => {
    expect(attendanceEndDate(freizeit).format('YYYY-MM-DD')).toBe('2026-10-19');
  });

  it('is not past while it is still running', () => {
    expect(attendanceHasEnded(freizeit, '2026-10-18T10:00:00')).toBe(false);
    expect(attendanceHasEnded(freizeit, '2026-10-19T23:00:00')).toBe(false);
    expect(attendanceIsRunning(freizeit, '2026-10-18T10:00:00')).toBe(true);
  });

  it('is past the day after its last day', () => {
    expect(attendanceHasEnded(freizeit, '2026-10-20T00:30:00')).toBe(true);
    expect(attendanceIsRunning(freizeit, '2026-10-20T00:30:00')).toBe(false);
  });

  it('treats one-day Termine as before', () => {
    const single = { date: '2026-10-17T19:00:00' };
    expect(attendanceHasEnded(single, '2026-10-17T22:00:00')).toBe(false);
    expect(attendanceHasEnded(single, '2026-10-18T08:00:00')).toBe(true);
  });

  it('reads the duration from the nested Termin of an Anwesenheit', () => {
    const pa = { date: '2026-10-17T00:00:00', attendance: { duration_days: 2 } };
    expect(attendanceHasEnded(pa, '2026-10-18T12:00:00')).toBe(false);
    expect(attendanceIsRunning(pa, '2026-10-16T12:00:00')).toBe(false);
  });
});
