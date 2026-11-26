// Changes to an Ablaufplan sent by the Gemeinde App (fecg-bridge `plan_edit`).
//
// The Gemeinde App sends small operations per row (uid) instead of the whole
// plan, so two people editing different rows at the same time both keep their
// change. Only when the same row was changed meanwhile (`before` no longer
// matches) the whole edit is rejected as a conflict.
//
// Pure functions, no database access. The block rules mirror
// src/app/utilities/plan-groups.ts (heads take 0 min, Unterpunkte follow their
// head with groupId = head id).

export interface EditField {
  id: string;
  uid?: string;
  name: string;
  time: string;
  conductor?: string;
  info?: string;
  songId?: number;
  isGroup?: boolean;
  groupId?: string;
  needsBeamer?: boolean;
  [key: string]: unknown;
}

export interface EditPlan {
  title?: string;
  time?: string;
  end?: string;
  fields?: EditField[];
  unpublished?: boolean;
  [key: string]: unknown;
}

export interface NewFieldInput {
  uid?: string;
  kind?: 'item' | 'note' | 'block';
  name?: string;
  minutes?: number;
  conductor?: string;
  info?: string;
  needsBeamer?: boolean | null;
}

export type PlanOp =
  | { op: 'update'; uid: string; before?: Record<string, unknown>; changes: Record<string, unknown> }
  | { op: 'insert'; after?: string | null; group?: string | null; field: NewFieldInput }
  | { op: 'delete'; uid: string }
  | { op: 'move'; uid: string; after?: string | null; group?: string | null }
  | { op: 'meta'; before?: Record<string, unknown>; changes: Record<string, unknown> };

export class PlanConflict extends Error {
  readonly uids: string[];
  constructor(uids: string[]) {
    super('conflict');
    this.uids = uids;
  }
}

export class PlanOpInvalid extends Error {}

const MAX_OPS = 200;
const MAX_TEXT = 2000;
const MAX_NAME = 300;
const UID_RE = /^[A-Za-z0-9_#:. -]{1,80}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Rows saved before the Gemeinde App link have no uid yet: id, then id#2 … (same as fecg-bridge). */
export function withUids(fields: EditField[]): EditField[] {
  const seen = new Map<string, number>();
  const used = new Set<string>();
  return fields.map(f => {
    let uid = f.uid;
    if (!uid || used.has(uid)) {
      const n = (seen.get(f.id) ?? 0) + 1;
      seen.set(f.id, n);
      uid = f.uid && used.has(f.uid) ? crypto.randomUUID() : (n > 1 ? `${f.id}#${n}` : f.id);
    }
    used.add(uid);
    return { ...f, uid };
  });
}

function isHead(f: EditField | undefined): boolean {
  return !!f?.isGroup;
}

function isNote(f: EditField): boolean {
  return f.id.includes('noteFld');
}

/** Same rule as normalizeGroups in plan-groups.ts. */
export function normalizeGroups(fields: EditField[]): EditField[] {
  let current: string | undefined;
  return fields.map(f => {
    const field = { ...f };
    if (isHead(field)) {
      field.time = '0';
      delete field.groupId;
      current = field.id;
      return field;
    }
    if (field.groupId && field.groupId !== current) {
      delete field.groupId;
    }
    if (!field.groupId) {
      current = undefined;
    }
    return field;
  });
}

function minutesOf(f: EditField): number {
  return isHead(f) ? 0 : (parseInt(String(f.time ?? '0'), 10) || 0);
}

/** Comparable value: empty and missing are the same, numbers and strings too. */
function norm(value: unknown): string | null {
  if (value === undefined || value === null || value === '') { return null; }
  return typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function minutes(value: unknown): string {
  const n = Math.round(Number(value));
  return String(Number.isFinite(n) ? Math.min(Math.max(n, 0), 24 * 60) : 0);
}

function indexOfUid(fields: EditField[], uid: string): number {
  return fields.findIndex(f => f.uid === uid);
}

/** Index range [start, end) of a row plus, for a block head, its Unterpunkte. */
function rowSpan(fields: EditField[], index: number): [number, number] {
  let end = index + 1;
  if (isHead(fields[index])) {
    const headId = fields[index].id;
    while (end < fields.length && fields[end].groupId === headId) { end++; }
  }
  return [index, end];
}

/** Where a row goes: right after `after` (behind a whole block unless it joins that block). */
function insertIndex(fields: EditField[], after: string | null | undefined, groupHeadId: string | undefined): number {
  if (!after) {
    if (groupHeadId) {
      const head = fields.findIndex(f => f.id === groupHeadId);
      return head + 1;
    }
    return 0;
  }
  const at = indexOfUid(fields, after);
  if (at < 0) { return fields.length; }
  const target = fields[at];
  if (isHead(target) && target.id !== groupHeadId) {
    return rowSpan(fields, at)[1];
  }
  return at + 1;
}

function groupHead(fields: EditField[], group: string | null | undefined): string | undefined {
  if (!group) { return undefined; }
  const head = fields.find(f => f.uid === group && isHead(f));
  if (!head) { throw new PlanConflict([group]); }
  return head.id;
}

function newField(input: NewFieldInput, groupHeadId: string | undefined, used: Set<string>): EditField {
  const kind = input.kind === 'note' || input.kind === 'block' ? input.kind : 'item';
  const random = crypto.randomUUID();
  let uid = typeof input.uid === 'string' && UID_RE.test(input.uid) ? input.uid : random;
  if (used.has(uid)) { uid = crypto.randomUUID(); }
  used.add(uid);
  const name = text(input.name, MAX_NAME).trim();
  if (!name) { throw new PlanOpInvalid('name_required'); }
  const field: EditField = {
    id: kind === 'note' ? `noteFld ${random}` : kind === 'block' ? `grpFld-${random}` : `fld-${random}`,
    uid,
    name,
    time: kind === 'item' ? minutes(input.minutes ?? 5) : '0',
    conductor: text(input.conductor, MAX_NAME),
  };
  const info = text(input.info, MAX_TEXT).trim();
  if (info) { field.info = info; }
  if (kind === 'block') { field.isGroup = true; }
  if (kind === 'item' && groupHeadId) { field.groupId = groupHeadId; }
  if (kind === 'item' && typeof input.needsBeamer === 'boolean') { field.needsBeamer = input.needsBeamer; }
  return field;
}

const FIELD_KEYS = ['name', 'time', 'conductor', 'info', 'needsBeamer'] as const;
const META_KEYS = ['title', 'time', 'end', 'unpublished'] as const;

function checkBefore(current: Record<string, unknown>, before: Record<string, unknown> | undefined,
  keys: readonly string[], conflictId: string) {
  if (!before) { return; }
  for (const key of keys) {
    if (key in before && norm(current[key]) !== norm(before[key])) {
      throw new PlanConflict([conflictId]);
    }
  }
}

function applyUpdate(fields: EditField[], op: Extract<PlanOp, { op: 'update' }>): EditField[] {
  const at = indexOfUid(fields, op.uid);
  if (at < 0) { throw new PlanConflict([op.uid]); }
  const keys = FIELD_KEYS.filter(k => k in (op.changes ?? {}));
  checkBefore(fields[at], op.before, keys, op.uid);
  const field = { ...fields[at] };
  for (const key of keys) {
    const value = op.changes[key];
    if (key === 'name') {
      const name = text(value, MAX_NAME).trim();
      if (!name) { throw new PlanOpInvalid('name_required'); }
      field.name = name;
    } else if (key === 'time') {
      if (!isHead(field) && !isNote(field)) { field.time = minutes(value); }
    } else if (key === 'conductor') {
      field.conductor = text(value, MAX_NAME);
    } else if (key === 'info') {
      const info = text(value, MAX_TEXT).trim();
      if (info) { field.info = info; } else { delete field.info; }
    } else if (key === 'needsBeamer') {
      if (typeof value === 'boolean') { field.needsBeamer = value; } else { delete field.needsBeamer; }
    }
  }
  const next = [...fields];
  next[at] = field;
  return next;
}

function applyMove(fields: EditField[], op: Extract<PlanOp, { op: 'move' }>): EditField[] {
  const at = indexOfUid(fields, op.uid);
  if (at < 0) { throw new PlanConflict([op.uid]); }
  if (op.after === op.uid) { return fields; }
  const [start, end] = rowSpan(fields, at);
  const moving = fields.slice(start, end).map(f => ({ ...f }));
  const rest = [...fields.slice(0, start), ...fields.slice(end)];
  const head = isHead(moving[0]) ? undefined : groupHead(rest, op.group);
  if (head) { moving[0].groupId = head; } else if (!isHead(moving[0])) { delete moving[0].groupId; }
  const index = insertIndex(rest, op.after, head);
  rest.splice(index, 0, ...moving);
  return rest;
}

function applyDelete(fields: EditField[], op: Extract<PlanOp, { op: 'delete' }>): EditField[] {
  const at = indexOfUid(fields, op.uid);
  if (at < 0) { return fields; }
  const [start, end] = rowSpan(fields, at);
  return [...fields.slice(0, start), ...fields.slice(end)];
}

function applyInsert(fields: EditField[], op: Extract<PlanOp, { op: 'insert' }>): EditField[] {
  const head = op.field?.kind === 'block' ? undefined : groupHead(fields, op.group);
  const used = new Set(fields.map(f => f.uid ?? ''));
  const field = newField(op.field ?? {}, head, used);
  const next = [...fields];
  next.splice(insertIndex(next, op.after, head), 0, field);
  return next;
}

function applyMeta(plan: EditPlan, op: Extract<PlanOp, { op: 'meta' }>): EditPlan {
  const keys = META_KEYS.filter(k => k in (op.changes ?? {}));
  checkBefore(plan, op.before, keys, 'plan');
  const next = { ...plan };
  for (const key of keys) {
    const value = op.changes[key];
    if (key === 'unpublished') {
      if (value === true) { next.unpublished = true; } else { delete next.unpublished; }
    } else if (key === 'title') {
      const title = text(value, MAX_NAME).trim();
      if (title) { next.title = title; } else { delete next.title; }
    } else if (key === 'time') {
      if (typeof value !== 'string' || !TIME_RE.test(value)) { throw new PlanOpInvalid('invalid_time'); }
      next.time = value;
    }
  }
  return next;
}

/** "HH:mm" of a plan start: "10:00", an ISO time with zone (local time in Speyer) or without (its digits). */
export function startHHmm(start: string | undefined): string | null {
  if (!start) { return null; }
  if (TIME_RE.test(start)) { return start; }
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(start)) {
    const d = new Date(start);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Berlin' }).format(d);
    }
  }
  const m = /T(\d{2}):(\d{2})/.exec(start);
  return m ? `${m[1]}:${m[2]}` : null;
}

/** End of the plan = start + all minutes, as "HH:mm". */
export function planEnd(plan: EditPlan): string | undefined {
  const hhmm = startHHmm(plan.time);
  if (!hhmm) { return plan.end; }
  const total = (plan.fields ?? []).reduce((sum, f) => sum + minutesOf(f), 0);
  const mins = (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + total) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Applies all operations or throws PlanConflict / PlanOpInvalid. */
export function applyPlanOps(plan: EditPlan, ops: PlanOp[]): EditPlan {
  if (!Array.isArray(ops) || !ops.length || ops.length > MAX_OPS) { throw new PlanOpInvalid('invalid_ops'); }
  let next: EditPlan = { ...plan, fields: withUids(plan.fields ?? []) };
  for (const op of ops) {
    if (!op || typeof op !== 'object') { throw new PlanOpInvalid('invalid_ops'); }
    if (op.op === 'meta') {
      next = applyMeta(next, op);
      continue;
    }
    const fields = next.fields ?? [];
    switch (op.op) {
      case 'update': next.fields = applyUpdate(fields, op); break;
      case 'insert': next.fields = applyInsert(fields, op); break;
      case 'delete': next.fields = applyDelete(fields, op); break;
      case 'move': next.fields = applyMove(fields, op); break;
      default: throw new PlanOpInvalid('invalid_ops');
    }
    next.fields = normalizeGroups(next.fields);
  }
  const end = planEnd(next);
  if (end) { next.end = end; }
  return next;
}

/** A plan built from a template or a copy: fresh ids and uids, no Beamer files of the original rows. */
export function freshFields(fields: unknown): EditField[] {
  if (!Array.isArray(fields)) { return []; }
  const ids = new Map<string, string>();
  const result: EditField[] = [];
  for (const raw of fields.slice(0, 300)) {
    if (!raw || typeof raw !== 'object') { continue; }
    const f = raw as EditField;
    const name = text(f.name, MAX_NAME);
    const oldId = String(f.id ?? '');
    const random = crypto.randomUUID();
    const id = oldId.includes('noteFld') ? `noteFld ${random}`
      : f.isGroup ? `grpFld-${random}`
      : oldId === 'agenda-items-placeholder' ? oldId
      : `fld-${random}`;
    ids.set(oldId, id);
    const field: EditField = { id, uid: crypto.randomUUID(), name, time: f.isGroup ? '0' : minutes(f.time), conductor: text(f.conductor, MAX_NAME) };
    if (typeof f.info === 'string' && f.info.trim()) { field.info = text(f.info, MAX_TEXT); }
    if (f.isGroup) { field.isGroup = true; }
    if (f.groupId) { field.groupId = String(f.groupId); }
    if (typeof f.needsBeamer === 'boolean') { field.needsBeamer = f.needsBeamer; }
    if (typeof f.songId === 'number') { field.songId = f.songId; }
    result.push(field);
  }
  for (const f of result) {
    if (f.groupId) { f.groupId = ids.get(f.groupId) ?? undefined; if (!f.groupId) { delete f.groupId; } }
  }
  return normalizeGroups(result);
}
