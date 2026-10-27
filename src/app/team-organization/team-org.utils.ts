import dayjs from 'dayjs';
import {
  AGENDA_ITEMS_PLACEHOLDER_ID,
  AgendaItem,
  AttendanceType,
  FieldSelection,
  Protocol,
  ProtocolOutcome,
  Task,
} from '../utilities/interfaces';
import { Role } from '../utilities/constants';
import { translate } from '@jsverse/transloco';

/** Plan field ids of agenda items are derived from the topic, so outcomes can be traced back to it. */
const AGENDA_FIELD_PREFIX = 'agenda-';

/** Completed tasks stay in the normal lists for this many days. */
export const COMPLETED_TASK_VISIBLE_DAYS = 30;

export const OUTCOME_LABELS: Record<ProtocolOutcome, string> = {
  get discussed() { return translate('teamOrg.outcome.discussed'); },
  get decided() { return translate('teamOrg.outcome.decided'); },
  get postponed() { return translate('agenda.postponed'); },
};

/** The whole feature is only visible once at least one attendance type has it enabled. */
export function isTeamOrgEnabled(types: AttendanceType[] | undefined | null): boolean {
  return (types ?? []).some(t => !!t.enable_protocol);
}

export function isTeamLeaderRole(role: number | undefined | null): boolean {
  return role === Role.ADMIN || role === Role.RESPONSIBLE;
}

/**
 * Whether a person belongs to the circle of an attendance type (mirrors the SQL
 * function in_protocol_circle): leadership always, parents and applicants never,
 * everyone else if they are in one of the type's groups or the type has none.
 */
export function isInTypeCircle(
  type: Pick<AttendanceType, 'enable_protocol' | 'relevant_groups'>,
  role: number | undefined | null,
  groupId: number | undefined | null,
): boolean {
  if (!type.enable_protocol || role === undefined || role === null) return false;
  if (isTeamLeaderRole(role)) return true;
  if (role === Role.PARENT || role === Role.APPLICANT) return false;
  const groups = type.relevant_groups ?? [];
  return groups.length === 0 || (groupId !== undefined && groupId !== null && groups.includes(groupId));
}

export function isInAnyCircle(
  types: AttendanceType[] | undefined | null,
  role: number | undefined | null,
  groupId: number | undefined | null,
): boolean {
  return (types ?? []).some(t => isInTypeCircle(t, role, groupId));
}

export function agendaFieldId(agendaItemId: string): string {
  return `${AGENDA_FIELD_PREFIX}${agendaItemId}`;
}

export function isAgendaField(field: Pick<FieldSelection, 'agendaItemId'>): boolean {
  return !!field.agendaItemId;
}

export function personName(person?: { firstName?: string; lastName?: string } | null): string {
  if (!person) return '';
  return `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
}

/** Builds the plan field (TOP) for a topic. */
export function buildAgendaField(item: AgendaItem, durationMinutes: number): FieldSelection {
  const field: FieldSelection = {
    id: agendaFieldId(item.id),
    name: item.title,
    time: String(Math.max(1, Math.round(durationMinutes))),
    agendaItemId: item.id,
  };
  const responsible = personName(item.responsible_person);
  if (responsible) field.conductor = responsible;
  return field;
}

/**
 * Inserts TOP fields into a plan: at the marker (placeholder) if there is one,
 * otherwise at the end. Topics that are already in the plan are skipped.
 * Returns a new array; the marker stays behind the inserted fields so the next
 * insert continues after them.
 */
export function insertAgendaFields(fields: FieldSelection[], newFields: FieldSelection[]): FieldSelection[] {
  const existing = new Set(fields.map(f => f.agendaItemId).filter(Boolean));
  const toAdd = newFields.filter(f => !existing.has(f.agendaItemId));
  if (!toAdd.length) return [...fields];
  const markerIndex = fields.findIndex(f => f.id === AGENDA_ITEMS_PLACEHOLDER_ID);
  if (markerIndex === -1) return [...fields, ...toAdd];
  return [...fields.slice(0, markerIndex), ...toAdd, ...fields.slice(markerIndex)];
}

/** Fields that get a section in the protocol: every plan field except the marker. */
export function protocolSections(fields: FieldSelection[] | undefined | null): FieldSelection[] {
  return (fields ?? []).filter(f => f.id !== AGENDA_ITEMS_PLACEHOLDER_ID);
}

/** TOP numbers (1, 2, …) by field id, counting only agenda fields in plan order. */
export function topNumbers(fields: FieldSelection[] | undefined | null): Map<string, number> {
  const result = new Map<string, number>();
  let n = 0;
  for (const f of fields ?? []) {
    if (f.agendaItemId) result.set(f.id, ++n);
  }
  return result;
}

/** Display name of a plan field, with "TOP n · " in front of agenda items. */
export function fieldDisplayName(field: FieldSelection, numbers: Map<string, number>): string {
  const n = numbers.get(field.id);
  return n ? translate('teamOrg.topName', { n, name: field.name }) : field.name;
}

/**
 * Start time (HH:mm) of every field, by field id. The marker takes no time.
 * `start` is either "HH:mm" or an ISO date time.
 */
export function fieldStartTimes(start: string | undefined | null, fields: FieldSelection[] | undefined | null): Map<string, string> {
  const result = new Map<string, string>();
  if (!start) return result;
  let current = dayjs(start);
  if (!current.isValid() || /^\d{1,2}:\d{2}$/.test(start)) {
    const [h, m] = start.split(':').map(Number);
    current = dayjs().hour(h || 0).minute(m || 0).second(0);
  }
  for (const f of fields ?? []) {
    result.set(f.id, current.format('HH:mm'));
    if (f.id !== AGENDA_ITEMS_PLACEHOLDER_ID) {
      current = current.add(parseInt(f.time, 10) || 0, 'minute');
    }
  }
  return result;
}

/**
 * Topic ids whose most recent result in a protocol was "postponed". Protocols
 * must be sorted newest first; the latest result per topic wins.
 */
export function postponedAgendaItemIds(protocols: Pick<Protocol, 'outcomes'>[]): Set<string> {
  const latest = new Map<string, ProtocolOutcome>();
  for (const p of protocols) {
    for (const [fieldId, outcome] of Object.entries(p.outcomes ?? {})) {
      if (!fieldId.startsWith(AGENDA_FIELD_PREFIX)) continue;
      const id = fieldId.slice(AGENDA_FIELD_PREFIX.length);
      if (!latest.has(id)) latest.set(id, outcome);
    }
  }
  return new Set([...latest].filter(([, outcome]) => outcome === 'postponed').map(([id]) => id));
}

/** Open topics, postponed ones first, then by priority. Pending/rejected suggestions are excluded. */
export function sortTopicsForPlanning(items: AgendaItem[], postponed: Set<string>): AgendaItem[] {
  const prio = { high: 0, medium: 1, low: 2 } as const;
  return items
    .filter(i => i.status === 'open' && (!i.proposal_status || i.proposal_status === 'accepted'))
    .sort((a, b) =>
      Number(!postponed.has(a.id)) - Number(!postponed.has(b.id))
      || prio[a.priority] - prio[b.priority]
      || a.title.localeCompare(b.title));
}

export type TaskGroupKey = 'overdue' | 'week' | 'later' | 'none' | 'done';

export interface TaskGroup {
  key: TaskGroupKey;
  label: string;
  tasks: Task[];
}

const TASK_GROUP_LABELS: Record<TaskGroupKey, string> = {
  get overdue() { return translate('teamOrg.group.overdue'); },
  get week() { return translate('teamOrg.group.week'); },
  get later() { return translate('svc.later'); },
  get none() { return translate('teamOrg.group.none'); },
  get done() { return translate('tasks.done'); },
};

export function isTaskOverdue(task: Task, today: string): boolean {
  return task.status !== 'completed' && !!task.due_date && task.due_date < today;
}

/** Completed tasks older than COMPLETED_TASK_VISIBLE_DAYS are hidden unless explicitly shown. */
export function isCompletedTaskArchived(task: Task, now: Date = new Date()): boolean {
  if (task.status !== 'completed') return false;
  const doneAt = task.completed_at ?? task.updated_at;
  if (!doneAt) return false;
  return dayjs(now).diff(dayjs(doneAt), 'day') >= COMPLETED_TASK_VISIBLE_DAYS;
}

/**
 * Groups tasks by due date: overdue, due within the next 7 days, later, without
 * date, and completed. Empty groups are left out.
 */
export function groupTasksByDue(tasks: Task[], today: string, includeArchived = false, now: Date = new Date()): TaskGroup[] {
  const weekEnd = dayjs(today).add(7, 'day').format('YYYY-MM-DD');
  const buckets: Record<TaskGroupKey, Task[]> = { overdue: [], week: [], later: [], none: [], done: [] };
  for (const t of tasks) {
    if (t.status === 'completed') {
      if (includeArchived || !isCompletedTaskArchived(t, now)) buckets.done.push(t);
    } else if (!t.due_date) {
      buckets.none.push(t);
    } else if (t.due_date < today) {
      buckets.overdue.push(t);
    } else if (t.due_date <= weekEnd) {
      buckets.week.push(t);
    } else {
      buckets.later.push(t);
    }
  }
  const byDue = (a: Task, b: Task) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.title.localeCompare(b.title);
  buckets.overdue.sort(byDue);
  buckets.week.sort(byDue);
  buckets.later.sort(byDue);
  buckets.none.sort((a, b) => a.title.localeCompare(b.title));
  buckets.done.sort((a, b) => (b.completed_at ?? b.updated_at ?? '').localeCompare(a.completed_at ?? a.updated_at ?? ''));
  return (Object.keys(buckets) as TaskGroupKey[])
    .filter(k => buckets[k].length)
    .map(k => ({ key: k, label: TASK_GROUP_LABELS[k], tasks: buckets[k] }));
}

/** True when a published protocol was changed afterwards ("geändert am …"). */
export function isEditedAfterPublish(protocol: Pick<Protocol, 'status' | 'published_at' | 'updated_at'> | null | undefined): boolean {
  if (!protocol || protocol.status !== 'published' || !protocol.published_at || !protocol.updated_at) return false;
  return dayjs(protocol.updated_at).diff(dayjs(protocol.published_at), 'second') > 60;
}
