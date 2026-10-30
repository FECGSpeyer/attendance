import { ExtraField, Group, Song } from './interfaces';

/** Reserved file "groups": 1 = Aufnahme, 2 = Liedtext. They exist in every instance. */
export const RESERVED_FILE_GROUP_IDS = [1, 2];

const norm = (value: string | null | undefined): string =>
  (value ?? '').normalize().trim().toLowerCase();

const splitSynonyms = (synonyms: string | null | undefined): string[] =>
  (synonyms ?? '').split(',').map(s => norm(s)).filter(Boolean);

/**
 * Finds the group in the target instance that matches a source group by name,
 * falling back to synonyms on either side. Reserved ids (Aufnahme, Liedtext) stay as they are.
 */
export function mapGroupByName(
  sourceGroupId: number | null | undefined,
  sourceGroupName: string | null | undefined,
  sourceSynonyms: string | null | undefined,
  targetGroups: Group[],
): number | null {
  if (!sourceGroupId) { return null; }
  if (RESERVED_FILE_GROUP_IDS.includes(sourceGroupId)) { return sourceGroupId; }
  const name = norm(sourceGroupName);
  if (!name) { return null; }

  const exact = targetGroups.find(g => norm(g.name) === name);
  if (exact) { return exact.id; }

  const synonyms = splitSynonyms(sourceSynonyms);
  const bySynonym = targetGroups.find(g => {
    const targetName = norm(g.name);
    const targetSynonyms = splitSynonyms(g.synonyms);
    return synonyms.includes(targetName)
      || targetSynonyms.includes(name)
      || targetSynonyms.some(s => synonyms.includes(s));
  });
  return bySynonym?.id ?? null;
}

/** Songs in the target library whose name matches (case- and whitespace-insensitive). */
export function findSongsWithSameName(name: string, songs: Song[]): Song[] {
  const wanted = norm(name).replace(/\s+/g, ' ');
  return songs.filter(s => norm(s.name).replace(/\s+/g, ' ') === wanted);
}

/** True if another song in the library already uses this prefix + number. */
export function isSongNumberTaken(number: number | null | undefined, prefix: string | null | undefined, songs: Song[]): boolean {
  if (number === null || number === undefined) { return false; }
  return songs.some(s => s.number === number && norm(s.prefix) === norm(prefix));
}

/** Smallest number above the current maximum for this prefix. */
export function nextFreeSongNumber(prefix: string | null | undefined, songs: Song[]): number {
  const numbers = songs.filter(s => norm(s.prefix) === norm(prefix)).map(s => s.number ?? 0);
  return (numbers.length ? Math.max(...numbers) : 0) + 1;
}

export interface MappedExtraField {
  sourceField: ExtraField;
  targetField: ExtraField;
  value: any;
}

/**
 * Pairs the source Werk's extra field values with fields of the target instance
 * that have the same name and type. Empty values are skipped.
 */
export function mapExtraFields(
  values: Record<string, any> | null | undefined,
  sourceFields: ExtraField[] | null | undefined,
  targetFields: ExtraField[] | null | undefined,
): MappedExtraField[] {
  const result: MappedExtraField[] = [];
  for (const sourceField of sourceFields ?? []) {
    const value = values?.[sourceField.id];
    if (value === null || value === undefined || value === '') { continue; }
    const targetField = (targetFields ?? []).find(f => norm(f.name) === norm(sourceField.name) && f.type === sourceField.type);
    if (!targetField) { continue; }
    if (targetField.options?.length && typeof value === 'string' && !targetField.options.includes(value)) { continue; }
    result.push({ sourceField, targetField, value });
  }
  return result;
}

/** instrument_ids of a song as derived from its files (without reserved ids and the main group). */
export function instrumentIdsFromFiles(files: { instrumentId?: number | null }[], mainGroupId?: number): number[] {
  return Array.from(new Set(
    files.map(f => f.instrumentId ?? null)
      .filter((id): id is number => id !== null && !RESERVED_FILE_GROUP_IDS.includes(id) && id !== mainGroupId)
  ));
}
