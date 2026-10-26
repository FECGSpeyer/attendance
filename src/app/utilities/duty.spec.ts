import { distributeDuties, DutySlot, dutyFill, matchingUnavailability } from './duty';
import { AttendanceStatus } from './constants';
import { PersonAttendance, PersonUnavailability } from './interfaces';

describe('duty utils', () => {
  const noRandom = () => 0.5;

  it('picks persons with the fewest duties first', () => {
    const slots: DutySlot[] = [
      { attendanceId: 1, date: '2026-11-04T18:00:00Z', candidates: [10, 11, 12], occupied: [], open: 1 },
    ];
    const result = distributeDuties(slots, new Map([[10, 3], [11, 0], [12, 2]]), { maxPerPerson: 5, notTwiceSameDay: true }, noRandom);
    expect(result.get(1)).toEqual([11]);
  });

  it('spreads duties evenly and respects the maximum per person', () => {
    const slots: DutySlot[] = [1, 2, 3, 4].map(i => ({
      attendanceId: i, date: `2026-11-0${i}T18:00:00Z`, candidates: [10, 11], occupied: [], open: 1,
    }));
    const result = distributeDuties(slots, new Map(), { maxPerPerson: 1, notTwiceSameDay: false });
    const picked = [...result.values()].flat();
    expect(picked.length).toBe(2);
    expect(new Set(picked).size).toBe(2);
  });

  it('does not assign somebody twice on the same day', () => {
    const slots: DutySlot[] = [
      { attendanceId: 1, date: '2026-11-08T08:00:00Z', candidates: [10], occupied: [], open: 1 },
      { attendanceId: 2, date: '2026-11-08T17:00:00Z', candidates: [10], occupied: [], open: 1 },
    ];
    const result = distributeDuties(slots, new Map(), { maxPerPerson: 5, notTwiceSameDay: true });
    expect(result.get(1)).toEqual([10]);
    expect(result.has(2)).toBeFalse();
  });

  it('classifies the fill state', () => {
    const pa = (state: any, status = AttendanceStatus.Present) => ({ duty_state: state, status } as PersonAttendance);
    expect(dutyFill([], 1)).toBe('open');
    expect(dutyFill([pa('requested', AttendanceStatus.Neutral)], 1)).toBe('requested');
    expect(dutyFill([pa('confirmed')], 2)).toBe('partial');
    expect(dutyFill([pa('confirmed'), pa('self')], 2)).toBe('full');
    expect(dutyFill([pa('confirmed', AttendanceStatus.Excused)], 1)).toBe('open');
  });

  it('matches weekly unavailability by weekday, type and end date', () => {
    const rule = { person_id: 5, weekdays: [3], type_ids: ['t1'], reason: 'Kinderstunde', valid_until: '2026-12-31' } as PersonUnavailability;
    expect(matchingUnavailability([rule], 5, '2026-11-04T18:00:00', 't1')).toBe(rule); // Wednesday
    expect(matchingUnavailability([rule], 5, '2026-11-05T18:00:00', 't1')).toBeUndefined();
    expect(matchingUnavailability([rule], 5, '2026-11-04T18:00:00', 't2')).toBeUndefined();
    expect(matchingUnavailability([rule], 5, '2027-01-06T18:00:00', 't1')).toBeUndefined();
  });
});
