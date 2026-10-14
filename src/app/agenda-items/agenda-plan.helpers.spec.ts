import { describe, it, expect, vi } from 'vitest';
import { AGENDA_ITEMS_PLACEHOLDER_ID, AgendaItem, Attendance, AttendanceType, FieldSelection } from '../utilities/interfaces';
import {
  addTopicsToAttendance,
  computePlanEnd,
  defaultTopicDuration,
  initialPlan,
  insertAfterName,
  planWithTopics,
  upcomingProtocolAttendances,
} from './agenda-plan.helpers';

const topic = (id: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id, tenant_id: 1, title: `Thema ${id}`, status: 'open', priority: 'medium', ...extra,
});

const marker: FieldSelection = { id: AGENDA_ITEMS_PLACEHOLDER_ID, name: '[Tagesordnungspunkte]', time: '0' };

describe('defaultTopicDuration', () => {
  it('prefers the topic, then the type, then 10', () => {
    expect(defaultTopicDuration({ default_duration: 25 }, { agenda_default_duration: 15 })).toBe(25);
    expect(defaultTopicDuration({ default_duration: null }, { agenda_default_duration: 15 })).toBe(15);
    expect(defaultTopicDuration({}, {})).toBe(10);
    expect(defaultTopicDuration(null, null)).toBe(10);
  });
});

describe('computePlanEnd', () => {
  it('adds all durations to an HH:mm start', () => {
    const end = computePlanEnd('19:30', [
      { id: 'a', name: 'A', time: '5' },
      marker,
      { id: 'b', name: 'B', time: '20' },
      { id: 'c', name: 'C', time: 'x' },
    ]);
    expect(end.slice(-5)).toBe('19:55');
  });

  it('accepts ISO start times', () => {
    expect(computePlanEnd('2026-10-21T18:00', [{ id: 'a', name: 'A', time: '45' }])).toBe('2026-10-21T18:45');
  });
});

describe('initialPlan', () => {
  it('copies the default plan without song placeholders', () => {
    const type = {
      start_time: '19:00',
      default_plan: { time: '19:30', end: '', fields: [
        { id: 'w', name: 'Begrüßung', time: '5' },
        { id: 'song-placeholder-1', name: 'Werk', time: '20' },
        marker,
      ] },
    } as Pick<AttendanceType, 'default_plan' | 'start_time'>;
    const plan = initialPlan({ start_time: '18:00' }, type);
    expect(plan.time).toBe('19:30');
    expect(plan.fields.map(f => f.id)).toEqual(['w', AGENDA_ITEMS_PLACEHOLDER_ID]);
    expect(plan.end.slice(-5)).toBe('19:35');
  });

  it('falls back to the Termin start and an empty plan', () => {
    const plan = initialPlan({ start_time: '18:00' }, null);
    expect(plan.time).toBe('18:00');
    expect(plan.fields).toEqual([]);
  });
});

describe('planWithTopics', () => {
  it('inserts TOPs at the marker and recalculates the end', () => {
    const att = { start_time: '19:00', plan: { time: '19:30', end: '', fields: [
      { id: 'w', name: 'Begrüßung', time: '5' }, marker, { id: 'v', name: 'Verschiedenes', time: '10' },
    ] } };
    const plan = planWithTopics(att, null, [
      { item: topic('1', { responsible_person: { id: 1, firstName: 'Anna', lastName: 'Weber' } }), duration: 20 },
      { item: topic('2'), duration: 10 },
    ]);
    expect(plan.fields.map(f => f.id)).toEqual(['w', 'agenda-1', 'agenda-2', AGENDA_ITEMS_PLACEHOLDER_ID, 'v']);
    expect(plan.fields[1].conductor).toBe('Anna Weber');
    expect(plan.fields[1].time).toBe('20');
    expect(plan.end.slice(-5)).toBe('20:15');
    // input untouched
    expect(att.plan.fields.length).toBe(3);
  });

  it('skips topics already in the plan', () => {
    const att = { plan: { time: '19:00', end: '', fields: [{ id: 'agenda-1', name: 'Thema 1', time: '10', agendaItemId: '1' }] } };
    const plan = planWithTopics(att, null, [{ item: topic('1'), duration: 30 }, { item: topic('2'), duration: 5 }]);
    expect(plan.fields.map(f => f.id)).toEqual(['agenda-1', 'agenda-2']);
    expect(plan.end.slice(-5)).toBe('19:15');
  });

  it('builds a plan from the type when the Termin has none', () => {
    const type = { start_time: '20:00', default_plan: { time: '', end: '', fields: [marker] } };
    const plan = planWithTopics({}, type, [{ item: topic('1'), duration: 15 }]);
    expect(plan.time).toBe('20:00');
    expect(plan.fields.map(f => f.id)).toEqual(['agenda-1', AGENDA_ITEMS_PLACEHOLDER_ID]);
  });
});

describe('insertAfterName', () => {
  it('names the field before the marker', () => {
    expect(insertAfterName([{ id: 'a', name: 'A', time: '1' }, marker, { id: 'b', name: 'B', time: '1' }])).toBe('A');
  });
  it('names the last field without marker', () => {
    expect(insertAfterName([{ id: 'a', name: 'A', time: '1' }, { id: 'b', name: 'B', time: '1' }])).toBe('B');
  });
  it('is null when topics go first', () => {
    expect(insertAfterName([marker])).toBeNull();
    expect(insertAfterName(undefined)).toBeNull();
  });
});

describe('upcomingProtocolAttendances', () => {
  it('keeps future Termine of enabled types, soonest first', () => {
    const types = [
      { id: 't1', enable_protocol: true },
      { id: 't2', enable_protocol: false },
    ] as AttendanceType[];
    const atts = [
      { id: 1, type_id: 't1', date: '2026-10-30T18:00:00Z' },
      { id: 2, type_id: 't2', date: '2026-10-20T18:00:00Z' },
      { id: 3, type_id: 't1', date: '2026-10-01T18:00:00Z' },
      { id: 4, type_id: 't1', date: '2026-10-21T18:00:00Z' },
    ] as Attendance[];
    const result = upcomingProtocolAttendances(atts, types, new Date('2026-10-14T12:00:00Z'));
    expect(result.map(a => a.id)).toEqual([4, 1]);
  });
});

describe('addTopicsToAttendance', () => {
  it('saves the new plan via updateAttendance', async () => {
    const updateAttendance = vi.fn(async (att: Partial<Attendance>) => ({ plan: att.plan } as Attendance));
    const plan = await addTopicsToAttendance({ updateAttendance }, { id: 7, plan: { time: '19:00', end: '', fields: [] } }, null,
      [{ item: topic('1'), duration: 10 }]);
    expect(updateAttendance).toHaveBeenCalledWith({ plan }, 7);
    expect(plan.fields[0].agendaItemId).toBe('1');
  });
});
