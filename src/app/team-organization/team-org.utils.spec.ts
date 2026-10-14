import { describe, it, expect } from 'vitest';
import { AGENDA_ITEMS_PLACEHOLDER_ID, AgendaItem, AttendanceType, FieldSelection, Task } from '../utilities/interfaces';
import { Role } from '../utilities/constants';
import {
  agendaFieldId,
  buildAgendaField,
  fieldDisplayName,
  fieldStartTimes,
  groupTasksByDue,
  insertAgendaFields,
  isEditedAfterPublish,
  isInAnyCircle,
  isInTypeCircle,
  isTeamOrgEnabled,
  postponedAgendaItemIds,
  protocolSections,
  sortTopicsForPlanning,
  topNumbers,
} from './team-org.utils';

const type = (enable: boolean, groups: number[] = []) =>
  ({ enable_protocol: enable, relevant_groups: groups } as AttendanceType);

const topic = (id: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id, tenant_id: 1, title: `Thema ${id}`, status: 'open', priority: 'medium', ...extra,
});

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, tenant_id: 1, title: `Aufgabe ${id}`, status: 'open', priority: 'medium', ...extra,
});

describe('visibility', () => {
  it('is enabled only when a type has the protocol switched on', () => {
    expect(isTeamOrgEnabled([])).toBe(false);
    expect(isTeamOrgEnabled([type(false)])).toBe(false);
    expect(isTeamOrgEnabled([type(false), type(true)])).toBe(true);
  });

  it('puts leadership always in the circle', () => {
    expect(isInTypeCircle(type(true, [5]), Role.ADMIN, 9)).toBe(true);
    expect(isInTypeCircle(type(true, [5]), Role.RESPONSIBLE, null)).toBe(true);
  });

  it('never puts parents or applicants in the circle', () => {
    expect(isInTypeCircle(type(true), Role.PARENT, 1)).toBe(false);
    expect(isInTypeCircle(type(true), Role.APPLICANT, 1)).toBe(false);
  });

  it('uses the relevant groups, or everyone when there are none', () => {
    expect(isInTypeCircle(type(true, [5]), Role.PLAYER, 5)).toBe(true);
    expect(isInTypeCircle(type(true, [5]), Role.PLAYER, 6)).toBe(false);
    expect(isInTypeCircle(type(true, []), Role.PLAYER, 6)).toBe(true);
    expect(isInTypeCircle(type(false, []), Role.PLAYER, 6)).toBe(false);
  });

  it('checks every type for the overall circle', () => {
    expect(isInAnyCircle([type(true, [1]), type(true, [2])], Role.PLAYER, 2)).toBe(true);
    expect(isInAnyCircle([type(true, [1])], Role.PLAYER, 2)).toBe(false);
  });
});

describe('agenda fields in the plan', () => {
  const plan: FieldSelection[] = [
    { id: 'a', name: 'Begrüßung', time: '5' },
    { id: AGENDA_ITEMS_PLACEHOLDER_ID, name: 'Tagesordnung', time: '0' },
    { id: 'z', name: 'Verschiedenes', time: '10' },
  ];

  it('builds a field with duration and responsible person', () => {
    const field = buildAgendaField(topic('t1', { responsible_person: { id: 1, firstName: 'Anna', lastName: 'Weber' } }), 20);
    expect(field).toEqual({ id: agendaFieldId('t1'), name: 'Thema t1', time: '20', agendaItemId: 't1', conductor: 'Anna Weber' });
  });

  it('inserts at the marker and keeps the marker behind the new fields', () => {
    const first = insertAgendaFields(plan, [buildAgendaField(topic('t1'), 10)]);
    const second = insertAgendaFields(first, [buildAgendaField(topic('t2'), 15)]);
    expect(second.map(f => f.id)).toEqual(['a', 'agenda-t1', 'agenda-t2', AGENDA_ITEMS_PLACEHOLDER_ID, 'z']);
  });

  it('appends at the end without a marker and skips topics already in the plan', () => {
    const noMarker = plan.filter(f => f.id !== AGENDA_ITEMS_PLACEHOLDER_ID);
    const once = insertAgendaFields(noMarker, [buildAgendaField(topic('t1'), 10)]);
    const twice = insertAgendaFields(once, [buildAgendaField(topic('t1'), 10)]);
    expect(twice.map(f => f.id)).toEqual(['a', 'z', 'agenda-t1']);
  });

  it('extends the plan by the duration of inserted topics', () => {
    const fields = insertAgendaFields(plan, [buildAgendaField(topic('t1'), 20), buildAgendaField(topic('t2'), 15)]);
    const times = fieldStartTimes('19:30', fields);
    expect(times.get('a')).toBe('19:30');
    expect(times.get('agenda-t1')).toBe('19:35');
    expect(times.get('agenda-t2')).toBe('19:55');
    expect(times.get('z')).toBe('20:10');
  });

  it('numbers only agenda fields and leaves the marker out of the protocol', () => {
    const fields = insertAgendaFields(plan, [buildAgendaField(topic('t1'), 20), buildAgendaField(topic('t2'), 15)]);
    const numbers = topNumbers(fields);
    expect(fieldDisplayName(fields[1], numbers)).toBe('TOP 1 · Thema t1');
    expect(fieldDisplayName(fields[2], numbers)).toBe('TOP 2 · Thema t2');
    expect(fieldDisplayName(fields[0], numbers)).toBe('Begrüßung');
    expect(protocolSections(fields).map(f => f.id)).toEqual(['a', 'agenda-t1', 'agenda-t2', 'z']);
  });
});

describe('postponed topics', () => {
  it('uses the latest result per topic', () => {
    const ids = postponedAgendaItemIds([
      { outcomes: { 'agenda-t1': 'decided', 'agenda-t2': 'postponed', a: 'postponed' } },
      { outcomes: { 'agenda-t1': 'postponed', 'agenda-t3': 'postponed' } },
    ]);
    expect([...ids].sort()).toEqual(['t2', 't3']);
  });

  it('lists postponed open topics first and hides suggestions', () => {
    const sorted = sortTopicsForPlanning([
      topic('a', { priority: 'high' }),
      topic('b'),
      topic('c', { status: 'completed' }),
      topic('d', { proposal_status: 'pending' }),
      topic('e', { proposal_status: 'accepted', priority: 'low' }),
    ], new Set(['b']));
    expect(sorted.map(t => t.id)).toEqual(['b', 'a', 'e']);
  });
});

describe('task groups', () => {
  const now = new Date('2026-10-14T10:00:00Z');

  it('groups by due date and hides old completed tasks', () => {
    const groups = groupTasksByDue([
      task('late', { due_date: '2026-10-10' }),
      task('soon', { due_date: '2026-10-18' }),
      task('later', { due_date: '2026-11-30' }),
      task('nodate'),
      task('done', { status: 'completed', completed_at: '2026-10-01T10:00:00Z' }),
      task('old', { status: 'completed', completed_at: '2026-08-01T10:00:00Z' }),
    ], '2026-10-14', false, now);
    expect(groups.map(g => [g.key, g.tasks.map(t => t.id)])).toEqual([
      ['overdue', ['late']],
      ['week', ['soon']],
      ['later', ['later']],
      ['none', ['nodate']],
      ['done', ['done']],
    ]);
  });

  it('shows archived completed tasks on request', () => {
    const groups = groupTasksByDue([task('old', { status: 'completed', completed_at: '2026-08-01T10:00:00Z' })], '2026-10-14', true, now);
    expect(groups[0].tasks.map(t => t.id)).toEqual(['old']);
  });
});

describe('published protocols', () => {
  it('flags changes after publishing', () => {
    expect(isEditedAfterPublish({ status: 'published', published_at: '2026-10-14T10:00:00Z', updated_at: '2026-10-14T10:00:20Z' })).toBe(false);
    expect(isEditedAfterPublish({ status: 'published', published_at: '2026-10-14T10:00:00Z', updated_at: '2026-10-15T08:00:00Z' })).toBe(true);
    expect(isEditedAfterPublish({ status: 'draft', published_at: null, updated_at: '2026-10-15T08:00:00Z' })).toBe(false);
  });
});
