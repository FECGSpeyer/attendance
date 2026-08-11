/**
 * Import Mapper Unit Tests
 */
import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import {
  autoMapHeaders,
  splitFullName,
  parseGermanDate,
  resolveGroupId,
  mapRow,
  mapRows,
  detectDuplicates,
  buildImportTemplateHeaders,
  mappingHasName,
  MapContext,
  EXTRA_PREFIX,
} from './import-mapper';
import { ExtraField, Group } from './interfaces';
import { FieldType } from './constants';

const groups: Group[] = [
  { id: 1, name: 'Sopran' },
  { id: 2, name: 'Alt' },
  { id: 5, name: 'Orchester' },
];

const additionalFields: ExtraField[] = [
  { id: 'f_active', name: 'Aktiv', type: FieldType.BOOLEAN, defaultValue: false },
  { id: 'f_shirt', name: 'Shirtgröße', type: FieldType.TEXT, defaultValue: '' },
  { id: 'f_num', name: 'Nummer', type: FieldType.NUMBER, defaultValue: 0 },
];

const ctx: MapContext = { groups, mainGroupId: 5, additionalFields };

describe('parseGermanDate', () => {
  it('parses DD.MM.YYYY', () => {
    expect(parseGermanDate('15.03.1990')).toBe(dayjs('1990-03-15').startOf('day').utc(true).toISOString());
  });

  it('parses ISO YYYY-MM-DD', () => {
    expect(parseGermanDate('1990-03-15')).toBe(dayjs('1990-03-15').startOf('day').utc(true).toISOString());
  });

  it('parses DD/MM/YYYY', () => {
    expect(parseGermanDate('15/03/1990')).toBe(dayjs('1990-03-15').startOf('day').utc(true).toISOString());
  });

  it('parses a JS Date (SheetJS cellDates)', () => {
    const d = new Date(Date.UTC(1990, 2, 15));
    expect(parseGermanDate(d)).toBe(dayjs('1990-03-15').startOf('day').utc(true).toISOString());
  });

  it('parses an Excel serial number', () => {
    // 32947 = 1990-03-15 (Excel epoch 1899-12-30)
    expect(parseGermanDate(32947)).toBe(dayjs('1990-03-15').startOf('day').utc(true).toISOString());
  });

  it('returns null for empty/garbage', () => {
    expect(parseGermanDate('')).toBeNull();
    expect(parseGermanDate(null)).toBeNull();
    expect(parseGermanDate(undefined)).toBeNull();
    expect(parseGermanDate('not a date')).toBeNull();
    expect(parseGermanDate('99.99.9999')).toBeNull();
  });
});

describe('resolveGroupId', () => {
  it('matches exact name', () => {
    expect(resolveGroupId('Alt', groups)).toBe(2);
  });
  it('matches case-insensitively and trims', () => {
    expect(resolveGroupId('  sOpRaN ', groups)).toBe(1);
  });
  it('returns null for unknown/blank', () => {
    expect(resolveGroupId('Tenor', groups)).toBeNull();
    expect(resolveGroupId('', groups)).toBeNull();
    expect(resolveGroupId(null, groups)).toBeNull();
  });
});

describe('splitFullName', () => {
  it('splits "First Last"', () => {
    expect(splitFullName('Anna Müller')).toEqual({ firstName: 'Anna', lastName: 'Müller' });
  });
  it('multi-token first name keeps last token as last name', () => {
    expect(splitFullName('Anna Maria Müller')).toEqual({ firstName: 'Anna Maria', lastName: 'Müller' });
  });
  it('splits "Last, First" comma form', () => {
    expect(splitFullName('Müller, Anna Maria')).toEqual({ firstName: 'Anna Maria', lastName: 'Müller' });
  });
  it('single token -> first name only', () => {
    expect(splitFullName('Anna')).toEqual({ firstName: 'Anna', lastName: '' });
  });
  it('empty -> empty', () => {
    expect(splitFullName('')).toEqual({ firstName: '', lastName: '' });
    expect(splitFullName(null)).toEqual({ firstName: '', lastName: '' });
  });
});

describe('autoMapHeaders', () => {
  it('maps standard German headers and additional fields', () => {
    const map = autoMapHeaders(['Vorname', 'Nachname', 'Gruppe', 'E-Mail', 'Aktiv'], ctx);
    expect(map['Vorname']).toBe('Vorname');
    expect(map['Gruppe']).toBe('Gruppe');
    expect(map['E-Mail']).toBe('E-Mail');
    expect(map['Aktiv']).toBe(`${EXTRA_PREFIX}f_active`);
  });
  it('maps a "Name" column to the combined target and aliases', () => {
    const map = autoMapHeaders(['Name', 'email', 'Telefonnummer', 'Instrument'], ctx);
    expect(map['Name']).toBe('Name');
    expect(map['email']).toBe('E-Mail');
    expect(map['Telefonnummer']).toBe('Telefon');
    expect(map['Instrument']).toBe('Gruppe');
  });
  it('unknown headers map to null (ignored)', () => {
    const map = autoMapHeaders(['Foobar'], ctx);
    expect(map['Foobar']).toBeNull();
  });
});

describe('mappingHasName', () => {
  it('true with combined Name column', () => {
    expect(mappingHasName({ A: 'Name' })).toBe(true);
  });
  it('true with both Vorname and Nachname', () => {
    expect(mappingHasName({ A: 'Vorname', B: 'Nachname' })).toBe(true);
  });
  it('false with only one of the split columns', () => {
    expect(mappingHasName({ A: 'Vorname', B: null })).toBe(false);
  });
});

describe('mapRow', () => {
  const stdMapping = {
    Vorname: 'Vorname',
    Nachname: 'Nachname',
    Geburtsdatum: 'Geburtsdatum',
    Gruppe: 'Gruppe',
    'E-Mail': 'E-Mail',
    Telefon: 'Telefon',
    Notizen: 'Notizen',
  } as const;

  it('maps a valid row to a Player with no errors', () => {
    const row = {
      Vorname: 'Anna',
      Nachname: 'Müller',
      Geburtsdatum: '15.03.1990',
      Gruppe: 'Alt',
      'E-Mail': 'Anna@Example.com',
      Telefon: '123',
      Notizen: 'hi',
    };
    const res = mapRow(row, stdMapping as any, ctx, 0);
    expect(res.errors).toEqual([]);
    expect(res.player.firstName).toBe('Anna');
    expect(res.player.lastName).toBe('Müller');
    expect(res.player.instrument).toBe(2);
    expect(res.player.email).toBe('anna@example.com');
    expect(res.player.phone).toBe('123');
    expect(res.player.birthday).toBe(dayjs('1990-03-15').startOf('day').utc(true).toISOString());
  });

  it('errors when first or last name missing', () => {
    const res = mapRow({ Vorname: 'Anna', Nachname: '' }, stdMapping as any, ctx, 0);
    expect(res.errors).toContain('Vor- und Nachname sind erforderlich');
  });

  it('splits a combined Name column', () => {
    const res = mapRow({ N: 'Müller, Anna' }, { N: 'Name' }, ctx, 0);
    expect(res.player.firstName).toBe('Anna');
    expect(res.player.lastName).toBe('Müller');
    expect(res.errors).toEqual([]);
  });

  it('falls back to main group for unknown group but flags it unresolved', () => {
    const res = mapRow({ Vorname: 'A', Nachname: 'B', Gruppe: 'Tenor' }, stdMapping as any, ctx, 0);
    expect(res.player.instrument).toBe(5);
    expect(res.groupResolved).toBe(false);
    expect(res.rawGroup).toBe('Tenor');
  });

  it('marks a matched group as resolved', () => {
    const res = mapRow({ Vorname: 'A', Nachname: 'B', Gruppe: 'Alt' }, stdMapping as any, ctx, 0);
    expect(res.player.instrument).toBe(2);
    expect(res.groupResolved).toBe(true);
  });

  it('falls back to main group and stays resolved when group blank', () => {
    const res = mapRow({ Vorname: 'A', Nachname: 'B', Gruppe: '' }, stdMapping as any, ctx, 0);
    expect(res.player.instrument).toBe(5);
    expect(res.groupResolved).toBe(true);
  });

  it('warns on unparseable birthday but still maps with null birthday', () => {
    const res = mapRow({ Vorname: 'A', Nachname: 'B', Geburtsdatum: 'xx' }, stdMapping as any, ctx, 0);
    expect(res.player.birthday).toBeNull();
    expect(res.player.correctBirthday).toBe(false);
    expect(res.warnings.some((w) => w.includes('Geburtsdatum'))).toBe(true);
  });

  it('leaves birthday null when no birthday given', () => {
    const res = mapRow({ Vorname: 'A', Nachname: 'B' }, stdMapping as any, ctx, 0);
    expect(res.player.birthday).toBeNull();
    expect(res.player.correctBirthday).toBe(false);
  });

  it('coerces additional field types', () => {
    const mapping = {
      Vorname: 'Vorname',
      Nachname: 'Nachname',
      Aktiv: `${EXTRA_PREFIX}f_active`,
      Nummer: `${EXTRA_PREFIX}f_num`,
    };
    const res = mapRow({ Vorname: 'A', Nachname: 'B', Aktiv: 'Ja', Nummer: '42' }, mapping as any, ctx, 0);
    expect(res.player.additional_fields['f_active']).toBe(true);
    expect(res.player.additional_fields['f_num']).toBe(42);
  });
});

describe('mapRows', () => {
  const mapping = { Vorname: 'Vorname', Nachname: 'Nachname', 'E-Mail': 'E-Mail' } as const;

  it('skips fully-empty rows', () => {
    const rows = [
      { Vorname: 'A', Nachname: 'B', 'E-Mail': '' },
      { Vorname: '', Nachname: '', 'E-Mail': '' },
    ];
    const res = mapRows(rows, mapping as any, ctx);
    expect(res.length).toBe(1);
  });

  it('flags in-file duplicate emails', () => {
    const rows = [
      { Vorname: 'A', Nachname: 'B', 'E-Mail': 'x@y.com' },
      { Vorname: 'C', Nachname: 'D', 'E-Mail': 'X@Y.com' },
    ];
    const res = mapRows(rows, mapping as any, ctx);
    expect(res[0].isDuplicate).toBeUndefined();
    expect(res[1].isDuplicate).toBe(true);
    expect(res[1].warnings).toContain('Doppelte E-Mail in der Datei');
  });
});

describe('detectDuplicates', () => {
  it('marks rows whose email exists in the tenant', () => {
    const mapping = { Vorname: 'Vorname', Nachname: 'Nachname', 'E-Mail': 'E-Mail' } as const;
    const rows = mapRows(
      [{ Vorname: 'A', Nachname: 'B', 'E-Mail': 'exists@y.com' }],
      mapping as any,
      ctx,
    );
    detectDuplicates(rows, new Set(['exists@y.com']));
    expect(rows[0].isDuplicate).toBe(true);
    expect(rows[0].warnings).toContain('E-Mail existiert bereits in dieser Instanz');
  });
});

describe('buildImportTemplateHeaders', () => {
  it('appends additional field names', () => {
    const headers = buildImportTemplateHeaders(additionalFields);
    expect(headers).toContain('Vorname');
    expect(headers).toContain('Aktiv');
    expect(headers).toContain('Shirtgröße');
  });
});
