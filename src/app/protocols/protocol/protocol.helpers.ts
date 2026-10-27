import dayjs from 'dayjs';
import {
  AGENDA_ITEMS_PLACEHOLDER_ID,
  AgendaItem,
  FieldSelection,
  PROTOCOL_GENERAL_SECTION_ID,
  Protocol,
  ProtocolOutcome,
  Task,
} from '../../utilities/interfaces';
import { AttendanceStatus } from '../../utilities/constants';
import { translate } from '@jsverse/transloco';
import { currentIntlLocale, currentLanguage } from '../../i18n/languages';

/** Minimal Tiptap/ProseMirror JSON node, enough for reading stored protocol docs. */
export interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, any>;
  content?: DocNode[];
  marks?: unknown[];
}

/** Key prefix of agenda notes written by the first protocol version (`__agenda__<agendaItemId>`). */
export const LEGACY_AGENDA_PREFIX = '__agenda__';

// ── Tiptap content ─────────────────────────────────────────

/** Plain text of a single node (inline text, hard breaks as spaces, task refs by title). */
function inlineText(node: DocNode | undefined | null): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'taskRef') return translate('protocol.taskRef', { title: node.attrs?.['title'] ?? '' });
  if (node.type === 'agendaItemRef') return translate('protocol.topicRef', { title: node.attrs?.['title'] ?? '' });
  return (node.content ?? []).map(inlineText).join('');
}

/** True when a stored doc has neither text nor reference nodes. */
export function isDocEmpty(doc: DocNode | Record<string, unknown> | undefined | null): boolean {
  if (!doc) return true;
  const walk = (n: DocNode): boolean => {
    if (n.type === 'text' && (n.text ?? '').trim()) return true;
    if (n.type === 'taskRef' || n.type === 'agendaItemRef') return true;
    return (n.content ?? []).some(walk);
  };
  return !walk(doc as DocNode);
}

/** Whole doc as one line of text, e.g. for a preview under a collapsed section. */
export function docToPlainText(doc: DocNode | Record<string, unknown> | undefined | null, maxLength = 0): string {
  if (!doc) return '';
  const parts: string[] = [];
  const walk = (n: DocNode) => {
    if (n.type === 'text' || n.type === 'taskRef' || n.type === 'agendaItemRef' || n.type === 'hardBreak') {
      parts.push(inlineText(n));
      return;
    }
    const before = parts.length;
    (n.content ?? []).forEach(walk);
    // Separate blocks with a space so "Absatz1" + "Absatz2" don't run together.
    if (parts.length > before && n.type !== 'doc') parts.push(' ');
  };
  walk(doc as DocNode);
  const text = parts.join('').replace(/\s+/g, ' ').trim();
  if (maxLength > 0 && text.length > maxLength) {
    return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
  }
  return text;
}

export type DocLineKind = 'heading' | 'paragraph' | 'bullet' | 'task' | 'quote' | 'code' | 'rule';

/** One output line for the PDF (or any plain-text rendering). */
export interface DocLine {
  kind: DocLineKind;
  text: string;
  /** Nesting depth of lists (0 = top level). */
  indent: number;
  /** Bullet marker: "•", "1.", "☐", "☑". Only for bullet and task lines. */
  marker?: string;
  /** Heading level 1-3. */
  level?: number;
}

/**
 * Converts a Tiptap JSON doc into flat lines with headings, (nested) bullet and
 * numbered lists, checklists, quotes and code blocks. Empty paragraphs are dropped.
 */
export function docToLines(doc: DocNode | Record<string, unknown> | undefined | null): DocLine[] {
  const lines: DocLine[] = [];
  if (!doc) return lines;

  const pushText = (kind: DocLineKind, node: DocNode, indent: number, extra: Partial<DocLine> = {}) => {
    const text = inlineText(node).trim();
    if (!text) return;
    lines.push({ kind, text, indent, ...extra });
  };

  const walkList = (list: DocNode, indent: number) => {
    const ordered = list.type === 'orderedList';
    const isTaskList = list.type === 'taskList';
    let n = Number(list.attrs?.['start'] ?? 1) || 1;
    for (const item of list.content ?? []) {
      const marker = isTaskList
        ? (item.attrs?.['checked'] ? '☑' : '☐')
        : ordered ? `${n++}.` : '•';
      let first = true;
      for (const child of item.content ?? []) {
        if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
          walkList(child, indent + 1);
        } else if (first) {
          const text = inlineText(child).trim();
          if (text) {
            lines.push({ kind: isTaskList ? 'task' : 'bullet', text, indent, marker });
            first = false;
          }
        } else {
          // Further paragraphs of the same item: continue without a marker.
          pushText('paragraph', child, indent + 1);
        }
      }
    }
  };

  const walk = (node: DocNode) => {
    switch (node.type) {
      case 'doc':
        (node.content ?? []).forEach(walk);
        break;
      case 'heading':
        pushText('heading', node, 0, { level: Number(node.attrs?.['level'] ?? 2) || 2 });
        break;
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        walkList(node, 0);
        break;
      case 'blockquote':
        for (const child of node.content ?? []) pushText('quote', child, 0);
        break;
      case 'codeBlock':
        for (const part of inlineText(node).split('\n')) {
          if (part.trim()) lines.push({ kind: 'code', text: part, indent: 0 });
        }
        break;
      case 'horizontalRule':
        lines.push({ kind: 'rule', text: '', indent: 0 });
        break;
      case 'taskRef':
      case 'agendaItemRef':
        lines.push({ kind: 'paragraph', text: inlineText(node), indent: 0 });
        break;
      default:
        pushText('paragraph', node, 0);
    }
  };
  walk(doc as DocNode);
  return lines;
}

/** Ids of all task references (taskRef nodes) in a doc. */
export function taskRefIds(doc: DocNode | Record<string, unknown> | undefined | null): string[] {
  const ids: string[] = [];
  const walk = (n: DocNode) => {
    if (n.type === 'taskRef' && n.attrs?.['id']) ids.push(String(n.attrs['id']));
    (n.content ?? []).forEach(walk);
  };
  if (doc) walk(doc as DocNode);
  return ids;
}

/**
 * Section (field id) each task belongs to: the section whose notes reference it,
 * otherwise the TOP of its topic. Tasks without either are left out.
 */
export function taskSections(
  content: Protocol['content'] | undefined | null,
  tasks: Pick<Task, 'id' | 'agenda_item_id'>[],
  fields: FieldSelection[],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [fieldId, doc] of Object.entries(content ?? {})) {
    for (const id of taskRefIds(doc)) {
      if (!result.has(id)) result.set(id, fieldId);
    }
  }
  for (const t of tasks) {
    if (!t.id || result.has(t.id) || !t.agenda_item_id) continue;
    const field = fields.find(f => f.agendaItemId === t.agenda_item_id);
    if (field) result.set(t.id, field.id);
  }
  return result;
}

// ── Sections ───────────────────────────────────────────────

export interface LeftoverSection {
  key: string;
  /** Set for notes of the first protocol version (`__agenda__<id>`). */
  agendaItemId?: string;
  doc: Record<string, unknown>;
}

/**
 * Notes stored under keys that are no longer part of the plan (older field ids,
 * `__agenda__<id>` from the first version). Only non-empty ones are returned, in
 * stored order, so nothing written earlier gets hidden.
 */
export function leftoverSections(
  content: Protocol['content'] | undefined | null,
  sectionIds: Iterable<string>,
): LeftoverSection[] {
  const known = new Set(sectionIds);
  known.add(PROTOCOL_GENERAL_SECTION_ID);
  known.add(AGENDA_ITEMS_PLACEHOLDER_ID);
  return Object.entries(content ?? {})
    .filter(([key, doc]) => !known.has(key) && !isDocEmpty(doc))
    .map(([key, doc]) => ({
      key,
      doc,
      ...(key.startsWith(LEGACY_AGENDA_PREFIX) ? { agendaItemId: key.slice(LEGACY_AGENDA_PREFIX.length) } : {}),
    }));
}

// ── Live mode ──────────────────────────────────────────────

/**
 * Start of the plan as date time: the attendance day plus the plan start
 * ("HH:mm"). An ISO start (date time) is used as is.
 */
export function planStartDateTime(attendanceDate: string | undefined | null, start: string | undefined | null): dayjs.Dayjs | null {
  if (!start) return null;
  if (/^\d{1,2}:\d{2}/.test(start)) {
    if (!attendanceDate) return null;
    const [h, m] = start.split(':').map(Number);
    const day = dayjs(attendanceDate);
    if (!day.isValid()) return null;
    return day.hour(h || 0).minute(m || 0).second(0).millisecond(0);
  }
  const d = dayjs(start);
  return d.isValid() ? d : null;
}

export interface LiveSection {
  fieldId: string;
  index: number;
  /** Whole minutes left (rounded up, at least 1). */
  remainingMinutes: number;
}

/**
 * The section running at `now`, computed from the plan start and the field
 * durations. Null before the start, after the end, or without a valid start.
 * The agenda marker takes no time and is never running.
 */
export function liveSection(
  fields: FieldSelection[] | undefined | null,
  start: dayjs.Dayjs | null,
  now: Date | dayjs.Dayjs = new Date(),
): LiveSection | null {
  if (!start || !fields?.length) return null;
  const at = dayjs(now);
  if (at.isBefore(start)) return null;
  let end = start;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.id === AGENDA_ITEMS_PLACEHOLDER_ID) continue;
    const minutes = parseInt(f.time, 10) || 0;
    if (minutes <= 0) continue;
    end = end.add(minutes, 'minute');
    if (at.isBefore(end)) {
      const remaining = Math.max(1, Math.ceil(end.diff(at, 'second') / 60));
      return { fieldId: f.id, index: i, remainingMinutes: remaining };
    }
  }
  return null;
}

/** Id of the section after `currentId` (null at the end or when unknown). */
export function nextSectionId(sections: Pick<FieldSelection, 'id'>[], currentId: string | null | undefined): string | null {
  if (!sections.length) return null;
  if (!currentId) return sections[0].id;
  const i = sections.findIndex(s => s.id === currentId);
  if (i === -1) return sections[0].id;
  return i + 1 < sections.length ? sections[i + 1].id : null;
}

// ── Attendees ──────────────────────────────────────────────

export function isPresentStatus(status: AttendanceStatus | undefined | null): boolean {
  return status === AttendanceStatus.Present || status === AttendanceStatus.Late || status === AttendanceStatus.LateExcused;
}

export function initials(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? '').trim().charAt(0);
  const b = (lastName ?? '').trim().charAt(0);
  return (a + b).toUpperCase() || '?';
}

// ── Publish summary ────────────────────────────────────────

export interface PublishSummary {
  decided: string[];
  discussed: string[];
  postponed: string[];
  /** TOPs without a result. */
  withoutOutcome: string[];
  /** Sections (any field) without notes. */
  withoutNotes: string[];
  taskCount: number;
  /** Distinct names of the people with tasks (first names). */
  taskOwners: string[];
  recipientCount: number;
}

/**
 * What the leadership sees before publishing: results per TOP, sections that
 * are still empty, new tasks and how many attendees will be notified.
 */
export function publishSummary(
  sections: { id: string; name: string; isTop: boolean }[],
  protocol: Pick<Protocol, 'content' | 'outcomes'> | null | undefined,
  tasks: Pick<Task, 'responsible_person'>[],
  recipientCount: number,
): PublishSummary {
  const result: PublishSummary = {
    decided: [], discussed: [], postponed: [], withoutOutcome: [], withoutNotes: [],
    taskCount: tasks.length, taskOwners: [], recipientCount,
  };
  const outcomes = protocol?.outcomes ?? {};
  for (const s of sections) {
    const outcome: ProtocolOutcome | undefined = outcomes[s.id];
    if (outcome) result[outcome].push(s.name);
    else if (s.isTop) result.withoutOutcome.push(s.name);
    if (isDocEmpty(protocol?.content?.[s.id])) result.withoutNotes.push(s.name);
  }
  const owners = new Set<string>();
  for (const t of tasks) {
    const name = t.responsible_person?.firstName?.trim() || t.responsible_person?.lastName?.trim();
    if (name) owners.add(name);
  }
  result.taskOwners = [...owners];
  return result;
}

/** "Anna", "Anna und Jonas", "Anna, Jonas und Paul". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return new Intl.ListFormat(currentIntlLocale(), { type: 'conjunction' }).format(names);
}

// ── Protocol list ──────────────────────────────────────────

export interface MonthGroup<T> {
  key: string;
  label: string;
  items: T[];
}

export function monthLabel(date: string): string {
  return dayjs(date).locale(currentLanguage()).format('MMMM YYYY');
}

/** Groups items (already sorted) by month of their date, keeping the order. */
export function groupByMonth<T>(items: T[], dateOf: (item: T) => string | undefined | null): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const item of items) {
    const date = dateOf(item);
    const key = date ? dayjs(date).format('YYYY-MM') : 'none';
    let group = groups.find(g => g.key === key);
    if (!group) {
      group = { key, label: date ? monthLabel(date) : translate('teamOrg.group.none'), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** Case-insensitive search over the given texts; every word of the query must match. */
export function matchesSearch(query: string, texts: (string | undefined | null)[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = texts.filter(Boolean).join(' ').toLowerCase();
  return words.every(w => haystack.includes(w));
}

export interface TopicClosure {
  agendaItemId: string;
  title: string;
  outcome: 'decided' | 'discussed';
  /** Mark the topic as done when publishing. */
  close: boolean;
}

/**
 * Open topics that were decided or discussed in this protocol. When publishing,
 * decided ones are pre-selected to be marked as done, discussed ones are not
 * (they often continue).
 */
export function topicClosureCandidates(
  sections: { id: string; name: string; agendaItemId?: string | null }[],
  outcomes: Record<string, ProtocolOutcome> | null | undefined,
  items: Pick<AgendaItem, 'id' | 'status'>[],
): TopicClosure[] {
  const open = new Set(items.filter(i => i.status === 'open').map(i => i.id));
  const result: TopicClosure[] = [];
  for (const s of sections) {
    const outcome = outcomes?.[s.id];
    if (!s.agendaItemId || !open.has(s.agendaItemId)) continue;
    if (outcome !== 'decided' && outcome !== 'discussed') continue;
    if (result.some(r => r.agendaItemId === s.agendaItemId)) continue;
    result.push({ agendaItemId: s.agendaItemId, title: s.name, outcome, close: outcome === 'decided' });
  }
  return result;
}

// ── Resizable columns (wide layout) ─────────────────────────

export interface ColumnWidths { left: number; right: number; }

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { left: 280, right: 280 };
export const MIN_SIDE_WIDTH = 160;
/** Upper bound for stored values; the real limit is the free space on screen. */
export const MAX_SIDE_WIDTH = 2000;
export const MIN_MAIN_WIDTH = 280;
/** Width of each drag handle between two columns. */
export const RESIZER_WIDTH = 8;

/**
 * Clamps one side column to at least MIN_SIDE_WIDTH while leaving the middle
 * column at least MIN_MAIN_WIDTH, given the other side's width.
 */
export function clampSideWidth(width: number, otherSide: number, containerWidth: number): number {
  const room = containerWidth > 0
    ? containerWidth - otherSide - MIN_MAIN_WIDTH - 2 * RESIZER_WIDTH
    : MAX_SIDE_WIDTH;
  const max = Math.max(MIN_SIDE_WIDTH, Math.min(MAX_SIDE_WIDTH, room));
  return Math.round(Math.min(max, Math.max(MIN_SIDE_WIDTH, width)));
}

/** Parses stored widths, falling back to the defaults for anything invalid. */
export function parseColumnWidths(raw: string | null | undefined): ColumnWidths {
  try {
    const v = raw ? JSON.parse(raw) : null;
    const ok = (n: unknown) => typeof n === 'number' && isFinite(n) && n >= MIN_SIDE_WIDTH && n <= MAX_SIDE_WIDTH;
    return {
      left: ok(v?.left) ? v.left : DEFAULT_COLUMN_WIDTHS.left,
      right: ok(v?.right) ? v.right : DEFAULT_COLUMN_WIDTHS.right,
    };
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }
}
