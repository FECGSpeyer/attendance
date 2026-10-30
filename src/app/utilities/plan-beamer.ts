import { AGENDA_ITEMS_PLACEHOLDER_ID, FieldSelection, Organisation } from './interfaces';
import { isGroupHead } from './plan-groups';

/**
 * "Beamer-Datei nötig" for Ablaufplan rows (Gemeinde App link, FECG Speyer and FECG Schwegenheim only).
 * The same rule lives in supabase/functions/fecg-bridge, keep both in sync.
 */

/** Titles with these words need a Beamer file unless switched off by hand. */
const AUTO_BEAMER_WORDS = /lied|gedicht/i;

/** The org may use the Gemeinde App link at all (database flag, no UI). */
export function gemeindeAppLinked(org: Organisation | null | undefined): boolean {
  return !!org?.fecg_link_enabled;
}

/** Beamer rows are shown: org linked, setting on and the plan is an ORG plan. */
export function beamerActive(org: Organisation | null | undefined, isOrgPlan: boolean): boolean {
  return gemeindeAppLinked(org) && !!org?.beamer_files_enabled && isOrgPlan;
}

/** Notes, Programmblock heads and the agenda marker never need a file. */
export function canNeedBeamer(field: FieldSelection): boolean {
  return !field.id.includes('noteFld') && !isGroupHead(field) && field.id !== AGENDA_ITEMS_PLACEHOLDER_ID;
}

/** Default when nobody switched it: Werke and titles with "Lied" or "Gedicht". */
export function autoNeedsBeamer(field: Pick<FieldSelection, 'name' | 'songId'>): boolean {
  return !!field.songId || AUTO_BEAMER_WORDS.test(field.name ?? '');
}

export function needsBeamer(field: FieldSelection): boolean {
  if (!canNeedBeamer(field)) { return false; }
  return field.needsBeamer ?? autoNeedsBeamer(field);
}

/** Gives every row a unique uid so the Gemeinde App can link files to it; returns new objects only where needed. */
export function ensureFieldUids(fields: FieldSelection[]): FieldSelection[] {
  const seen = new Set<string>();
  return fields.map(field => {
    if (field.uid && !seen.has(field.uid)) {
      seen.add(field.uid);
      return field;
    }
    const uid = crypto.randomUUID();
    seen.add(uid);
    // A duplicated uid comes from a copied row: the copy has no file of its own.
    return field.uid ? { ...field, uid, beamerFile: undefined } : { ...field, uid };
  });
}
