import { FieldSelection, PlanBlockTemplate } from './interfaces';

/**
 * Programmblöcke: a plan field with Unterpunkte (e.g. "Programm Jugendchor").
 *
 * `plan.fields` stays a flat list. The head (`isGroup`) stores `time: '0'` and
 * its Unterpunkte follow right after it with `groupId` = head id. Because the
 * head counts 0 min, everything that simply sums `field.time` (viewer, live
 * mode, PDF, iCal, …) keeps computing the right start times: the first
 * Unterpunkt starts with the block, and the next top-level field starts after
 * the last Unterpunkt.
 */
export const GROUP_FIELD_PREFIX = 'grpFld';

export function isGroupHead(field: FieldSelection | null | undefined): boolean {
  return !!field?.isGroup;
}

export function newGroupHead(name: string, conductor?: string, info?: string): FieldSelection {
  return {
    id: `${GROUP_FIELD_PREFIX}-${crypto.randomUUID()}`,
    name,
    conductor: conductor ?? '',
    info: info || undefined,
    time: '0',
    isGroup: true,
  };
}

/** Unterpunkte of a block, in plan order. */
export function childrenOf(fields: FieldSelection[], headId: string): FieldSelection[] {
  return fields.filter(f => f.groupId === headId);
}

/** Duration of a block in minutes: the sum of its Unterpunkte. */
export function groupDuration(fields: FieldSelection[], headId: string): number {
  return childrenOf(fields, headId).reduce((sum, f) => sum + (parseInt(f.time, 10) || 0), 0);
}

/** Minutes a field takes in the running total (heads take none). */
export function fieldMinutes(field: FieldSelection): number {
  return isGroupHead(field) ? 0 : (parseInt(field.time, 10) || 0);
}

/** Index of the last field that belongs to the block (the head itself when empty). */
export function lastIndexOfGroup(fields: FieldSelection[], headId: string): number {
  const head = fields.findIndex(f => f.id === headId);
  let last = head;
  for (let i = head + 1; i < fields.length && fields[i].groupId === headId; i++) {
    last = i;
  }
  return last;
}

/**
 * Restores the block invariants after any change: heads take 0 min and have no
 * groupId, and Unterpunkte sit contiguously right after their head. A field
 * whose groupId doesn't match the block it stands in becomes a normal field.
 */
export function normalizeGroups(fields: FieldSelection[]): FieldSelection[] {
  let current: string | undefined;
  for (const field of fields) {
    if (isGroupHead(field)) {
      field.time = '0';
      delete field.groupId;
      current = field.id;
      continue;
    }
    if (field.groupId && field.groupId !== current) {
      delete field.groupId;
    }
    if (!field.groupId) {
      current = undefined;
    }
  }
  return fields;
}

/** "1", "2", "2.1", "2.2", "3" … for numbered lists (notes and the agenda marker get none). */
export function fieldNumbers(fields: FieldSelection[], skip: (f: FieldSelection) => boolean = () => false): string[] {
  let top = 0;
  let sub = 0;
  return fields.map(field => {
    if (skip(field)) { return ''; }
    if (field.groupId) { return `${top}.${++sub}`; }
    sub = 0;
    return String(++top);
  });
}

/**
 * Moves a row of the editor list. `visible` holds the field indexes of the rows
 * that are shown (Unterpunkte of collapsed blocks are hidden), `from`/`to` are
 * row positions as reported by ion-reorder-group.
 *
 * - A head moves together with all its Unterpunkte and never lands inside
 *   another block.
 * - Any other field joins a block when dropped right below an open head or
 *   between two Unterpunkte of the same block, stays in its block when dropped
 *   right below its last Unterpunkt, and becomes a normal field otherwise.
 *   `join` overrides that choice: a block id to join it, `null` to leave any block.
 */
export function moveRow(fields: FieldSelection[], visible: number[], from: number, to: number, join?: string | null): FieldSelection[] {
  const rows = visible.map(i => fields[i]);
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved);
  const collapsedHeads = new Set(
    fields.filter(f => isGroupHead(f) && childrenOf(fields, f.id).some(c => !rows.includes(c))).map(f => f.id),
  );

  if (isGroupHead(moved)) {
    // Its Unterpunkte travel with it.
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].groupId === moved.id) { rows.splice(i, 1); }
    }
    collapsedHeads.add(moved.id);
    let pos = rows.indexOf(moved);
    const prev = rows[pos - 1];
    const next = rows[pos + 1];
    const prevGroup = prev ? (isGroupHead(prev) && !collapsedHeads.has(prev.id) ? prev.id : prev.groupId) : undefined;
    if (prevGroup && next?.groupId === prevGroup) {
      // Dropped inside another block: put it after that block instead.
      rows.splice(pos, 1);
      let end = pos;
      while (end < rows.length && rows[end].groupId === prevGroup) { end++; }
      rows.splice(end, 0, moved);
      pos = end;
    }
  } else {
    const pos = rows.indexOf(moved);
    const prev = rows[pos - 1];
    const next = rows[pos + 1];
    let group: string | undefined;
    if (prev && isGroupHead(prev)) {
      group = collapsedHeads.has(prev.id) ? undefined : prev.id;
    } else if (prev?.groupId && (next?.groupId === prev.groupId || moved.groupId === prev.groupId)) {
      group = prev.groupId;
    }
    if (join !== undefined) { group = join ?? undefined; }
    if (group) { moved.groupId = group; } else { delete moved.groupId; }
  }

  // Expand back to the full list: hidden Unterpunkte follow their head.
  const result: FieldSelection[] = [];
  for (const field of rows) {
    if (field.groupId && collapsedHeads.has(field.groupId)) { continue; }
    result.push(field);
    if (isGroupHead(field) && collapsedHeads.has(field.id)) {
      result.push(...childrenOf(fields, field.id));
    }
  }
  return normalizeGroups(result);
}

/** Copies a block (head + Unterpunkte) with fresh ids, e.g. to save or insert a template. */
export function cloneBlock(fields: FieldSelection[]): FieldSelection[] {
  const head = fields.find(isGroupHead);
  if (!head) { return fields.map(f => ({ ...f })); }
  const copy = newGroupHead(head.name, head.conductor, head.info);
  return [
    copy,
    ...fields
      .filter(f => f.groupId === head.id)
      .map(f => ({
        ...f,
        // Song fields are looked up by their id (= song id), so they keep it.
        id: f.songId || f.id.startsWith('noteFld') ? f.id : `fld-${crypto.randomUUID()}`,
        groupId: copy.id,
        // A copy is a new row: it gets its own uid and no linked Beamer file.
        uid: undefined,
        beamerFile: undefined,
      })),
  ];
}

export function blockTemplateFrom(fields: FieldSelection[], headId: string): PlanBlockTemplate {
  const head = fields.find(f => f.id === headId);
  const block = cloneBlock([head, ...childrenOf(fields, headId)].map(f => {
    // Topic links belong to one Termin only.
    const { agendaItemId, ...rest } = f;
    return rest as FieldSelection;
  }));
  return { id: crypto.randomUUID(), name: head?.name ?? 'Programmblock', fields: block };
}
