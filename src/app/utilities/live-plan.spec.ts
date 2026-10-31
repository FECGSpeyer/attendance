import { describe, expect, it } from 'vitest';
import { Plan } from './interfaces';
import { buildSchedule, iosLiveState, liveColor, liveSchedule, liveStateAt, liveTitle, livePlanKey, withLiveColor, zonedTimeToUtc } from './live-plan';

const TZ = 'Europe/Berlin';
const at = (iso: string) => Date.parse(iso);

describe('live-plan', () => {
  const fields = [
    { id: 'a', name: 'Begrüßung', time: '5' },
    { id: 'b', name: 'Lied', time: 10, conductor: 'Chor' },
    { id: 'c', name: 'Predigt', time: '30' },
  ];

  it('converts wall-clock times across DST', () => {
    expect(zonedTimeToUtc(2026, 7, 1, 10, 0, TZ)).toBe(at('2026-07-01T08:00:00Z'));
    expect(zonedTimeToUtc(2026, 12, 1, 10, 0, TZ)).toBe(at('2026-12-01T09:00:00Z'));
  });

  it('builds the schedule from the Termin day in the tenant timezone', () => {
    // Postgres timestamptz as stored for attendance.date
    const s = buildSchedule({ date: '2026-10-21 10:00:00+00', planTime: '18:30', fields, timezone: TZ });
    expect(s.map(i => i.start)).toEqual([
      at('2026-10-21T16:30:00Z'), at('2026-10-21T16:35:00Z'), at('2026-10-21T16:45:00Z'),
    ]);
    expect(s[2].end).toBe(at('2026-10-21T17:15:00Z'));
    expect(s[1].subtitle).toBe('Chor');
  });

  it('uses only the clock time of a date-time plan start and honours the day offset', () => {
    const s = buildSchedule({ date: '2026-10-17', planTime: '2026-01-17T19:00:00', dayOffset: 2, fields, timezone: TZ });
    expect(s[0].start).toBe(at('2026-10-19T17:00:00Z'));
  });

  it('skips the agenda placeholder and numbers TOPs', () => {
    const s = buildSchedule({
      date: '2026-10-17', planTime: '10:00', timezone: TZ,
      fields: [{ id: 'agenda-items-placeholder', name: 'TOPs', time: '0' }, { id: 'x', name: 'Bericht', time: '10', agendaItemId: 'x' }],
    });
    expect(s.map(i => i.name)).toEqual(['TOP 1 · Bericht']);
  });

  it('reports before, running and ended phases inside the live window', () => {
    const s = buildSchedule({ date: '2026-10-17', planTime: '10:00', fields, timezone: TZ });
    expect(liveStateAt(s, at('2026-10-17T07:40:00Z'))).toBeNull();
    expect(liveStateAt(s, at('2026-10-17T07:50:00Z'))?.phase).toBe('before');

    const running = liveStateAt(s, at('2026-10-17T08:07:00Z'))!;
    expect(running.phase).toBe('running');
    expect(running.index).toBe(2);
    expect(running.title).toBe('Lied');
    expect(running.endsAt).toBe(at('2026-10-17T08:15:00Z') / 1000);
    expect(running.next.map(n => n.name)).toEqual(['Predigt']);

    expect(liveStateAt(s, at('2026-10-17T08:50:00Z'))?.phase).toBe('ended');
    expect(liveStateAt(s, at('2026-10-17T09:01:00Z'))).toBeNull();
  });

  it('picks the plan of a later day and labels it for multi-plan Termine', () => {
    const plan: Plan = { time: '09:00', end: '', fields };
    const att = { id: 1, date: '2026-10-17', duration_days: 2, plan, extra_plans: [{ ...plan, id: 'p2', day: 1, time: '20:00' }] };
    expect(liveSchedule(att, 1, TZ)[0].start).toBe(at('2026-10-18T18:00:00Z'));
    expect(livePlanKey(att.plan)).toBe('main');
    expect(livePlanKey(att.extra_plans[0])).toBe('p2');
    expect(liveTitle(att, 'Freizeit', 1)).toMatch(/^Freizeit · So 18\.10\.$/);
    expect(liveTitle({ date: '2026-10-17', plan }, 'Gottesdienst', 0)).toBe('Gottesdienst');
  });

  it('shows a countdown to the start instead of the first item before the plan starts on iOS', () => {
    const s = buildSchedule({ date: '2026-10-17', planTime: '10:00', fields: [fields[1], fields[2]], timezone: TZ });
    const before = iosLiveState(liveStateAt(s, at('2026-10-17T07:50:00Z'))!);
    expect(before.title).toBe('Beginnt in');
    expect(before.subtitle).toBe('');
    expect(before.next.map(n => n.name)).toEqual(['Lied · Chor', 'Predigt']);
    expect(before.next[0].at).toBe(at('2026-10-17T08:00:00Z') / 1000);

    const running = liveStateAt(s, at('2026-10-17T08:05:00Z'))!;
    expect(iosLiveState(running)).toBe(running);
  });

  it('gives the widget the colour of the Termin type', () => {
    expect(liveColor('rosa')).toBe('#be72c0');
    expect(liveColor('#3880FF')).toBe('#3880ff');
    expect(liveColor('unbekannt')).toBeUndefined();
    expect(liveColor(null)).toBeUndefined();
    const s = buildSchedule({ date: '2026-10-17', planTime: '10:00', fields: [fields[1], fields[2]], timezone: TZ });
    const state = liveStateAt(s, at('2026-10-17T08:05:00Z'));
    expect(withLiveColor(state, 'danger')?.color).toBe('#ff4961');
    expect(withLiveColor(state, '')).toBe(state);
    expect(withLiveColor(null, 'danger')).toBeNull();
  });
});
