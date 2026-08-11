import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { ExtraField, Group, Player } from './interfaces';
import { DEFAULT_IMAGE, FieldType } from './constants';

dayjs.extend(utc);
dayjs.extend(customParseFormat);

/**
 * Pure, dependency-free (no Angular/Supabase) helpers for importing persons
 * from a parsed spreadsheet. Consumers pass plain row objects (from SheetJS
 * `sheet_to_json`) and the tenant context; these functions map them to
 * `Player` objects ready for `DbService.addPlayer`. Kept pure so the German
 * date/name/group edge cases are unit-testable without a TestBed.
 */

/** Canonical German headers, matching the export vocabulary (export.page.ts). */
export const PARSED_HEADERS = [
  'Vorname',
  'Nachname',
  'Geburtsdatum',
  'Gruppe',
  'E-Mail',
  'Telefon',
  'Eingetreten',
  'Notizen',
] as const;

/**
 * A mapping target. Standard header keys, a combined-name key ('Name'), the
 * "ignore this column" sentinel (null is used for that in the map), or an
 * additional field addressed as `extra_<fieldId>`.
 */
export type FieldKey =
  | 'Vorname'
  | 'Nachname'
  | 'Name'
  | 'Geburtsdatum'
  | 'Gruppe'
  | 'E-Mail'
  | 'Telefon'
  | 'Eingetreten'
  | 'Notizen'
  | string; // `extra_<fieldId>`

export const EXTRA_PREFIX = 'extra_';

export interface MapContext {
  groups: Group[];
  mainGroupId?: number;
  additionalFields: ExtraField[];
}

export interface MappedRow {
  player: Player;
  rowIndex: number;
  errors: string[];
  warnings: string[];
  isDuplicate?: boolean;
  /** Raw group cell from the file (for showing what couldn't be matched). */
  rawGroup?: string;
  /** False when the file's group name didn't match any tenant group. */
  groupResolved: boolean;
}

/** A file-column -> target-field mapping. `null` means "ignore this column". */
export type ColumnMapping = Record<string, FieldKey | null>;

const norm = (s: string): string => (s ?? '').toString().trim().toLowerCase();

/**
 * Auto-match each file column to a target field by German header name
 * (case-insensitive, trimmed). Standard headers, a literal "Name" column
 * (combined first+last), and tenant additional fields (matched by name) are
 * recognised. Unmatched columns map to null (ignored) and can be overridden by
 * the user in the UI.
 */
export function autoMapHeaders(fileHeaders: string[], ctx: MapContext): ColumnMapping {
  const mapping: ColumnMapping = {};

  const standardByNorm = new Map<string, FieldKey>();
  for (const h of PARSED_HEADERS) {
    standardByNorm.set(norm(h), h);
  }
  standardByNorm.set('name', 'Name');
  // A few common aliases people use in their sheets.
  standardByNorm.set('email', 'E-Mail');
  standardByNorm.set('e-mail-adresse', 'E-Mail');
  standardByNorm.set('telefonnummer', 'Telefon');
  standardByNorm.set('gruppe/instrument', 'Gruppe');
  standardByNorm.set('instrument', 'Gruppe');

  const extraByNorm = new Map<string, FieldKey>();
  for (const field of ctx.additionalFields ?? []) {
    extraByNorm.set(norm(field.name), `${EXTRA_PREFIX}${field.id}`);
  }

  for (const header of fileHeaders) {
    const n = norm(header);
    mapping[header] = standardByNorm.get(n) ?? extraByNorm.get(n) ?? null;
  }

  return mapping;
}

/**
 * Split a single "full name" cell into first/last name.
 * - "Nachname, Vorname" (comma form) -> last = before comma, first = after.
 * - Otherwise last whitespace-delimited token is the last name, the rest is
 *   the first name ("Anna Maria Müller" -> first "Anna Maria", last "Müller").
 * - A single token becomes the first name only.
 */
export function splitFullName(value: any): { firstName: string; lastName: string } {
  const raw = (value ?? '').toString().trim();
  if (!raw) {
    return { firstName: '', lastName: '' };
  }

  if (raw.includes(',')) {
    const [last, ...rest] = raw.split(',');
    return {
      firstName: rest.join(',').trim(),
      lastName: last.trim(),
    };
  }

  const parts = raw.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}

const DATE_FORMATS = ['DD.MM.YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', 'D.M.YYYY', 'DD.MM.YY'];

/**
 * Parse a date cell into an ISO string at UTC midnight, matching how the app
 * stores `birthday`/`joined`. Accepts JS Date (SheetJS `cellDates:true`), Excel
 * serial numbers, and the German/ISO string formats above. Returns null when
 * the value is empty or unparseable.
 */
export function parseGermanDate(value: any): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return dayjs(value).startOf('day').utc(true).toISOString();
  }

  // Excel serial date number (days since 1899-12-30). Build the date from
  // whole days off the epoch so timezone/DST never shifts it by a day.
  if (typeof value === 'number' && isFinite(value)) {
    const days = Math.floor(value);
    const d = dayjs.utc('1899-12-30').add(days, 'day');
    return d.isValid() ? d.startOf('day').toISOString() : null;
  }

  const str = value.toString().trim();
  if (!str) {
    return null;
  }

  for (const fmt of DATE_FORMATS) {
    const d = dayjs(str, fmt, true);
    if (d.isValid()) {
      return d.startOf('day').utc(true).toISOString();
    }
  }

  return null;
}

/** Case-insensitive exact match of a group name to a group id. Unknown -> null. */
export function resolveGroupId(name: any, groups: Group[], mainGroupId?: number): number | null {
  const n = norm(name);
  if (!n) {
    return null;
  }
  const match = (groups ?? []).find((g) => norm(g.name) === n);
  return match?.id ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Coerce a raw cell value to the type expected by an additional field. */
function coerceExtraValue(field: ExtraField, raw: any): any {
  const str = (raw ?? '').toString().trim();
  switch (field.type) {
    case FieldType.BOOLEAN:
      return ['ja', 'yes', 'true', '1', 'x', 'wahr'].includes(str.toLowerCase());
    case FieldType.NUMBER: {
      const num = Number(str.replace(',', '.'));
      return str === '' || isNaN(num) ? (field.defaultValue ?? null) : num;
    }
    default:
      return str === '' ? (field.defaultValue ?? '') : str;
  }
}

/**
 * True if a mapping can produce a name (either a combined `Name` column, or
 * both a Vorname and a Nachname column). Used to block the mapping step.
 */
export function mappingHasName(mapping: ColumnMapping): boolean {
  const targets = Object.values(mapping);
  if (targets.includes('Name')) {
    return true;
  }
  return targets.includes('Vorname') && targets.includes('Nachname');
}

/** Find the file-column header currently mapped to a given target, if any. */
function columnFor(mapping: ColumnMapping, target: FieldKey): string | undefined {
  return Object.keys(mapping).find((col) => mapping[col] === target);
}

/**
 * Map a single spreadsheet row to a MappedRow using the (possibly user-edited)
 * column mapping. Builds the minimal valid Player object (mirrors
 * DbService.handoverPerson); `tenantId`/`id` are assigned by addPlayer.
 */
export function mapRow(row: Record<string, any>, mapping: ColumnMapping, ctx: MapContext, rowIndex: number): MappedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (target: FieldKey): any => {
    const col = columnFor(mapping, target);
    return col === undefined ? '' : row[col];
  };

  // --- Name ---
  let firstName = '';
  let lastName = '';
  if (columnFor(mapping, 'Name') !== undefined) {
    const split = splitFullName(get('Name'));
    firstName = split.firstName;
    lastName = split.lastName;
  } else {
    firstName = (get('Vorname') ?? '').toString().trim();
    lastName = (get('Nachname') ?? '').toString().trim();
  }
  if (!firstName || !lastName) {
    errors.push('Vor- und Nachname sind erforderlich');
  }

  // --- Dates ---
  // `birthday`/`joined` map to nullable `timestamptz` columns. Emit `null` (not
  // '') for an absent birthday — an empty string crashes the insert with
  // "invalid input syntax for type timestamp with time zone".
  const rawBirthday = get('Geburtsdatum');
  let birthday: string | null = null;
  if ((rawBirthday ?? '').toString().trim()) {
    const parsed = parseGermanDate(rawBirthday);
    if (parsed) {
      birthday = parsed;
    } else {
      warnings.push(`Geburtsdatum "${rawBirthday}" konnte nicht gelesen werden`);
    }
  }

  const rawJoined = get('Eingetreten');
  let joined = dayjs().startOf('day').utc(true).toISOString();
  if ((rawJoined ?? '').toString().trim()) {
    const parsed = parseGermanDate(rawJoined);
    if (parsed) {
      joined = parsed;
    } else {
      warnings.push(`Eintrittsdatum "${rawJoined}" konnte nicht gelesen werden`);
    }
  }

  // --- Group ---
  // When the file's group name can't be matched we still default to the main
  // group, but flag `groupResolved: false` so the UI can prompt the user to
  // pick a group per person. A blank cell counts as resolved (no name given).
  const rawGroup = (get('Gruppe') ?? '').toString().trim();
  const resolvedId = resolveGroupId(rawGroup, ctx.groups, ctx.mainGroupId);
  const groupResolved = resolvedId !== null || rawGroup === '';
  const instrument = resolvedId ?? ctx.mainGroupId ?? ctx.groups?.[0]?.id ?? null;

  // --- Email ---
  const email = (get('E-Mail') ?? '').toString().trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) {
    warnings.push(`E-Mail "${email}" sieht ungültig aus`);
  }

  // --- Phone / notes ---
  const phone = (get('Telefon') ?? '').toString().trim();
  const notes = (get('Notizen') ?? '').toString().trim();

  // --- Additional fields ---
  const additional_fields: { [key: string]: any } = {};
  for (const field of ctx.additionalFields ?? []) {
    const col = columnFor(mapping, `${EXTRA_PREFIX}${field.id}`);
    if (col !== undefined) {
      additional_fields[field.id] = coerceExtraValue(field, row[col]);
    }
  }

  const player = {
    firstName,
    lastName,
    instrument,
    img: DEFAULT_IMAGE,
    joined,
    email: email || undefined,
    hasTeacher: false,
    playsSince: null,
    correctBirthday: birthday !== null,
    birthday,
    isLeader: false,
    isCritical: false,
    notes,
    phone,
    history: [],
    pending: false,
    self_register: false,
    additional_fields,
  } as Player;

  return { player, rowIndex, errors, warnings, rawGroup, groupResolved };
}

/** Whether a raw row is entirely empty (all cells blank). */
function isEmptyRow(row: Record<string, any>): boolean {
  return Object.values(row).every((v) => (v ?? '').toString().trim() === '');
}

/**
 * Map all rows, skipping fully-empty ones and flagging duplicate emails that
 * appear more than once within the same file.
 */
export function mapRows(rows: Record<string, any>[], mapping: ColumnMapping, ctx: MapContext): MappedRow[] {
  const result: MappedRow[] = [];
  const seenEmails = new Set<string>();

  rows.forEach((row, index) => {
    if (isEmptyRow(row)) {
      return;
    }
    const mapped = mapRow(row, mapping, ctx, index);
    const email = mapped.player.email;
    if (email) {
      if (seenEmails.has(email)) {
        mapped.warnings.push('Doppelte E-Mail in der Datei');
        mapped.isDuplicate = true;
      } else {
        seenEmails.add(email);
      }
    }
    result.push(mapped);
  });

  return result;
}

/**
 * Mark rows whose email already exists in the tenant. `existingEmails` must be
 * a set of lowercased emails (kept as a parameter so this stays pure).
 */
export function detectDuplicates(mapped: MappedRow[], existingEmails: Set<string>): MappedRow[] {
  for (const row of mapped) {
    const email = row.player.email;
    if (email && existingEmails.has(email)) {
      row.isDuplicate = true;
      if (!row.warnings.includes('E-Mail existiert bereits in dieser Instanz')) {
        row.warnings.push('E-Mail existiert bereits in dieser Instanz');
      }
    }
  }
  return mapped;
}

/** Headers for the downloadable import template. */
export function buildImportTemplateHeaders(additionalFields: ExtraField[]): string[] {
  return [...PARSED_HEADERS, ...(additionalFields ?? []).map((f) => f.name)];
}
