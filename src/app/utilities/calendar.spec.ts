import dayjs from 'dayjs';
import { calendarMark, mergeCalendarEntries, coveredDays, groupByDay, monthGrid, startOfWeek, weekDays } from './calendar';
import { AttendanceStatus } from './constants';

describe('calendar utils', () => {
  it('starts weeks on Monday', () => {
    // 2026-11-01 is a Sunday
    expect(startOfWeek('2026-11-01').format('YYYY-MM-DD')).toBe('2026-10-26');
    expect(startOfWeek('2026-10-26').format('YYYY-MM-DD')).toBe('2026-10-26');
  });

  it('builds full weeks around the month', () => {
    const weeks = monthGrid('2026-11-15', '2026-11-10');
    expect(weeks[0][0].key).toBe('2026-10-26');
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[weeks.length - 1][6].key).toBe('2026-12-06');
    expect(weeks.every(w => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(d => d.isToday).map(d => d.key)).toEqual(['2026-11-10']);
    expect(weeks.flat().filter(d => d.inMonth)).toHaveLength(30);
  });

  it('builds the week of a day', () => {
    const days = weekDays('2026-10-29', '2026-10-27');
    expect(days.map(d => d.day)).toEqual([26, 27, 28, 29, 30, 31, 1]);
    expect(days.every(d => d.inMonth)).toBe(true);
    expect(days[1].isToday).toBe(true);
  });

  it('spreads multi-day Termine over their days', () => {
    expect(coveredDays({ date: '2026-10-30T00:00:00', attendance: { duration_days: 3 } }))
      .toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    expect(coveredDays({ date: '2026-10-30T18:00:00' })).toEqual(['2026-10-30']);
    expect(coveredDays({ date: '2026-10-30', duration_days: 500 })).toHaveLength(31);
  });

  it('groups items per day', () => {
    const a = { date: '2026-10-30', duration_days: 2 };
    const b = { date: '2026-10-31' };
    const map = groupByDay([a, b]);
    expect(map.get('2026-10-30')).toEqual([a]);
    expect(map.get('2026-10-31')).toEqual([a, b]);
  });

  it('maps status and Dienst to the dot style', () => {
    expect(calendarMark({ status: AttendanceStatus.Present })).toBe('yes');
    expect(calendarMark({ status: AttendanceStatus.LateExcused })).toBe('yes');
    expect(calendarMark({ status: AttendanceStatus.Excused })).toBe('no');
    expect(calendarMark({ status: AttendanceStatus.Absent })).toBe('no');
    expect(calendarMark({ status: AttendanceStatus.Neutral })).toBe('open');
    expect(calendarMark({ status: AttendanceStatus.Neutral, duty_state: 'requested' })).toBe('open');
    expect(calendarMark({ status: AttendanceStatus.Neutral, duty_state: 'confirmed' })).toBe('yes');
    expect(calendarMark({ eventOnly: true })).toBe('event');
  });

  it('keeps today stable for the default argument', () => {
    expect(weekDays(dayjs()).some(d => d.isToday)).toBe(true);
  });

  it('adds managed Termine only where there is no own entry', () => {
    const own = [{ tenantId: 1, attId: 5, date: '2026-11-02', status: AttendanceStatus.Present }] as any[];
    const managed = [
      { tenantId: 1, attId: 5, date: '2026-11-02', eventOnly: true },
      { tenantId: 2, attId: 5, date: '2026-11-01', eventOnly: true, attendance: { start_time: '19:00' } },
      { tenantId: 2, attId: 6, date: '2026-11-01', eventOnly: true, attendance: { start_time: '10:00' } },
    ] as any[];
    const merged = mergeCalendarEntries(own, managed);
    expect(merged.map(e => `${e.tenantId}:${e.attId}`)).toEqual(['2:6', '2:5', '1:5']);
    expect(merged[2].eventOnly).toBeUndefined();
  });
});
