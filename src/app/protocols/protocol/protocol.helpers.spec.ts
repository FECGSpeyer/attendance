import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { AGENDA_ITEMS_PLACEHOLDER_ID, FieldSelection, PROTOCOL_GENERAL_SECTION_ID } from '../../utilities/interfaces';
import { AttendanceStatus } from '../../utilities/constants';
import {
  topicClosureCandidates,
  docToLines,
  docToPlainText,
  groupByMonth,
  initials,
  isDocEmpty,
  isPresentStatus,
  joinNames,
  leftoverSections,
  liveSection,
  matchesSearch,
  nextSectionId,
  planStartDateTime,
  publishSummary,
  taskRefIds,
  taskSections,
  clampSideWidth,
  parseColumnWidths,
  DEFAULT_COLUMN_WIDTHS,
} from './protocol.helpers';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content: any[]) => ({ type: 'doc', content });

const field = (id: string, time: string, extra: Partial<FieldSelection> = {}): FieldSelection => ({ id, name: id, time, ...extra });

describe('isDocEmpty / docToPlainText', () => {
  it('treats missing, empty and whitespace-only docs as empty', () => {
    expect(isDocEmpty(null)).toBe(true);
    expect(isDocEmpty(doc())).toBe(true);
    expect(isDocEmpty(doc({ type: 'paragraph' }, p('  ')))).toBe(true);
    expect(isDocEmpty(doc(p('Hallo')))).toBe(false);
  });

  it('counts task references as content', () => {
    expect(isDocEmpty(doc({ type: 'taskRef', attrs: { id: 't1', title: 'Mappen' } }))).toBe(false);
  });

  it('joins blocks with spaces and truncates', () => {
    expect(docToPlainText(doc(p('Erster'), p('Zweiter')))).toBe('Erster Zweiter');
    expect(docToPlainText(doc(p('abcdefghij')), 5)).toBe('abcd…');
  });
});

describe('docToLines', () => {
  it('renders headings, paragraphs and nested lists', () => {
    const lines = docToLines(doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Titel' }] },
      p('Text mit '),
      { type: 'paragraph' },
      {
        type: 'bulletList', content: [
          { type: 'listItem', content: [p('A'), { type: 'bulletList', content: [{ type: 'listItem', content: [p('A1')] }] }] },
          { type: 'listItem', content: [p('B')] },
        ],
      },
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p('Drei')] }, { type: 'listItem', content: [p('Vier')] }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('Erledigt')] }] },
      { type: 'taskRef', attrs: { id: 't1', title: 'Mappen bestellen' } },
    ));
    expect(lines).toEqual([
      { kind: 'heading', text: 'Titel', indent: 0, level: 2 },
      { kind: 'paragraph', text: 'Text mit', indent: 0 },
      { kind: 'bullet', text: 'A', indent: 0, marker: '•' },
      { kind: 'bullet', text: 'A1', indent: 1, marker: '•' },
      { kind: 'bullet', text: 'B', indent: 0, marker: '•' },
      { kind: 'bullet', text: 'Drei', indent: 0, marker: '3.' },
      { kind: 'bullet', text: 'Vier', indent: 0, marker: '4.' },
      { kind: 'task', text: 'Erledigt', indent: 0, marker: '☑' },
      { kind: 'paragraph', text: 'Aufgabe: Mappen bestellen', indent: 0 },
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(docToLines(null)).toEqual([]);
  });
});

describe('task references', () => {
  it('finds task ids and maps tasks to sections', () => {
    const content = {
      a: doc(p('x'), { type: 'taskRef', attrs: { id: 't1' } }),
      b: doc({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'taskRef', attrs: { id: 't2' } }] }] }),
    };
    expect(taskRefIds(content.b)).toEqual(['t2']);
    const fields = [field('a', '5'), field('agenda-x', '10', { agendaItemId: 'x' })];
    const map = taskSections(content, [
      { id: 't1' }, { id: 't2' }, { id: 't3', agenda_item_id: 'x' }, { id: 't4', agenda_item_id: 'y' },
    ], fields);
    expect(map.get('t1')).toBe('a');
    expect(map.get('t2')).toBe('b');
    expect(map.get('t3')).toBe('agenda-x');
    expect(map.has('t4')).toBe(false);
  });
});

describe('leftoverSections', () => {
  it('returns non-empty notes whose keys are not in the plan', () => {
    const content = {
      a: doc(p('aktuell')),
      old: doc(p('alter Punkt')),
      empty: doc(),
      __agenda__abc: doc(p('Thema alt')),
      [PROTOCOL_GENERAL_SECTION_ID]: doc(p('Allgemein')),
      [AGENDA_ITEMS_PLACEHOLDER_ID]: doc(p('Marker')),
    };
    const result = leftoverSections(content, ['a']);
    expect(result.map(r => r.key)).toEqual(['old', '__agenda__abc']);
    expect(result[1].agendaItemId).toBe('abc');
    expect(result[0].agendaItemId).toBeUndefined();
  });
});

describe('live mode', () => {
  const fields = [
    field('welcome', '5'),
    field(AGENDA_ITEMS_PLACEHOLDER_ID, '30'),
    field('top1', '20'),
    field('top2', '10'),
  ];

  it('builds the start from the attendance day and HH:mm', () => {
    const start = planStartDateTime('2026-10-21T00:00:00', '19:30');
    expect(start?.format('YYYY-MM-DD HH:mm')).toBe('2026-10-21 19:30');
    expect(planStartDateTime('2026-10-21', null)).toBeNull();
  });

  it('finds the running section, skipping the marker', () => {
    const start = dayjs('2026-10-21T19:30:00');
    expect(liveSection(fields, start, dayjs('2026-10-21T19:29:00'))).toBeNull();
    expect(liveSection(fields, start, dayjs('2026-10-21T19:31:00'))).toEqual({ fieldId: 'welcome', index: 0, remainingMinutes: 4 });
    expect(liveSection(fields, start, dayjs('2026-10-21T19:47:30'))).toEqual({ fieldId: 'top1', index: 2, remainingMinutes: 8 });
    expect(liveSection(fields, start, dayjs('2026-10-21T20:04:59'))?.fieldId).toBe('top2');
    expect(liveSection(fields, start, dayjs('2026-10-21T20:05:00'))).toBeNull();
    expect(liveSection(fields, null)).toBeNull();
  });

  it('returns the next section', () => {
    const s = [{ id: 'a' }, { id: 'b' }];
    expect(nextSectionId(s, 'a')).toBe('b');
    expect(nextSectionId(s, 'b')).toBeNull();
    expect(nextSectionId(s, null)).toBe('a');
    expect(nextSectionId([], 'a')).toBeNull();
  });
});

describe('attendees', () => {
  it('counts late arrivals as present', () => {
    expect(isPresentStatus(AttendanceStatus.Present)).toBe(true);
    expect(isPresentStatus(AttendanceStatus.Late)).toBe(true);
    expect(isPresentStatus(AttendanceStatus.LateExcused)).toBe(true);
    expect(isPresentStatus(AttendanceStatus.Excused)).toBe(false);
  });

  it('builds initials', () => {
    expect(initials('anna', 'Weber')).toBe('AW');
    expect(initials('', '')).toBe('?');
  });
});

describe('publishSummary', () => {
  it('summarises results, empty sections and tasks', () => {
    const sections = [
      { id: 'welcome', name: 'Begrüßung', isTop: false },
      { id: 'a', name: 'Konzert', isTop: true },
      { id: 'b', name: 'Mappen', isTop: true },
      { id: 'c', name: 'Wochenende', isTop: true },
    ];
    const summary = publishSummary(sections, {
      content: { a: doc(p('x')), welcome: doc(p('Hallo')) },
      outcomes: { a: 'decided', c: 'postponed' },
    }, [
      { responsible_person: { id: 1, firstName: 'Anna', lastName: 'W' } },
      { responsible_person: { id: 1, firstName: 'Anna', lastName: 'W' } },
      { responsible_person: { id: 2, firstName: 'Jonas', lastName: 'B' } },
      {},
    ], 6);
    expect(summary.decided).toEqual(['Konzert']);
    expect(summary.postponed).toEqual(['Wochenende']);
    expect(summary.withoutOutcome).toEqual(['Mappen']);
    expect(summary.withoutNotes).toEqual(['Mappen', 'Wochenende']);
    expect(summary.taskCount).toBe(4);
    expect(summary.taskOwners).toEqual(['Anna', 'Jonas']);
    expect(summary.recipientCount).toBe(6);
  });

  it('joins names in German', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Anna'])).toBe('Anna');
    expect(joinNames(['Anna', 'Jonas', 'Paul'])).toBe('Anna, Jonas und Paul');
  });
});

describe('protocol list', () => {
  it('groups by month keeping the order', () => {
    const groups = groupByMonth(
      [{ d: '2026-10-21' }, { d: '2026-10-07' }, { d: '2026-09-30' }, { d: null }],
      i => i.d,
    );
    expect(groups.map(g => g.label)).toEqual(['Oktober 2026', 'September 2026', 'Ohne Datum']);
    expect(groups[0].items.length).toBe(2);
  });

  it('matches every search word', () => {
    expect(matchesSearch('', ['x'])).toBe(true);
    expect(matchesSearch('leitung 21.10', ['Leitungsteam', '21.10.2026'])).toBe(true);
    expect(matchesSearch('leitung probe', ['Leitungsteam'])).toBe(false);
  });
});

describe('topicClosureCandidates', () => {
  const sections = [
    { id: 'agenda-a', name: 'A', agendaItemId: 'a' },
    { id: 'agenda-b', name: 'B', agendaItemId: 'b' },
    { id: 'agenda-c', name: 'C', agendaItemId: 'c' },
    { id: 'agenda-d', name: 'D', agendaItemId: 'd' },
    { id: 'song-1', name: 'Lied', agendaItemId: null },
  ];
  const items = [
    { id: 'a', status: 'open' as const },
    { id: 'b', status: 'open' as const },
    { id: 'c', status: 'open' as const },
    { id: 'd', status: 'completed' as const },
  ];

  it('offers open decided and discussed topics, pre-selecting only decided ones', () => {
    const result = topicClosureCandidates(sections, {
      'agenda-a': 'decided', 'agenda-b': 'discussed', 'agenda-c': 'postponed', 'agenda-d': 'decided', 'song-1': 'decided',
    }, items);
    expect(result).toEqual([
      { agendaItemId: 'a', title: 'A', outcome: 'decided', close: true },
      { agendaItemId: 'b', title: 'B', outcome: 'discussed', close: false },
    ]);
  });

  it('returns nothing without outcomes', () => {
    expect(topicClosureCandidates(sections, undefined, items)).toEqual([]);
  });
});

describe('column widths', () => {
  it('keeps side columns within bounds and leaves room for the middle', () => {
    expect(clampSideWidth(100, 280, 1400)).toBe(160);
    // 1400 - 280 - 280 - 16 = 824
    expect(clampSideWidth(900, 280, 1400)).toBe(824);
    expect(clampSideWidth(600, 280, 1400)).toBe(600);
    // never below the minimum, even on a tight screen
    expect(clampSideWidth(300, 600, 900)).toBe(160);
  });

  it('parses stored widths with fallbacks', () => {
    expect(parseColumnWidths('{"left":320,"right":240}')).toEqual({ left: 320, right: 240 });
    expect(parseColumnWidths('{"left":5,"right":"x"}')).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(parseColumnWidths('nope')).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(parseColumnWidths(null)).toEqual(DEFAULT_COLUMN_WIDTHS);
  });
});
