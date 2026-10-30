import { describe, it, expect } from 'vitest';
import { FieldType } from './constants';
import { ExtraField, Group, Song } from './interfaces';
import {
  findSongsWithSameName,
  instrumentIdsFromFiles,
  isSongNumberTaken,
  mapExtraFields,
  mapGroupByName,
  nextFreeSongNumber,
} from './song-copy';

const group = (id: number, name: string, synonyms?: string): Group =>
  ({ id, name, synonyms, maingroup: false, tenantId: 9 } as Group);

const song = (name: string, number: number, prefix?: string): Song =>
  ({ name, number, prefix, withChoir: false, withSolo: false } as Song);

describe('mapGroupByName', () => {
  const target = [group(10, 'Violine 1'), group(11, 'Cello', 'Violoncello'), group(12, 'Flöte')];

  it('keeps reserved ids and maps empty ids to null', () => {
    expect(mapGroupByName(1, 'Aufnahme', null, target)).toBe(1);
    expect(mapGroupByName(2, null, null, target)).toBe(2);
    expect(mapGroupByName(null, 'Cello', null, target)).toBeNull();
  });

  it('matches by name case-insensitively', () => {
    expect(mapGroupByName(55, 'violine 1', null, target)).toBe(10);
  });

  it('matches by synonyms on either side', () => {
    expect(mapGroupByName(56, 'Violoncello', null, target)).toBe(11);
    expect(mapGroupByName(57, 'Querflöte', 'Flöte', target)).toBe(12);
  });

  it('returns null without a match', () => {
    expect(mapGroupByName(58, 'Tuba', null, target)).toBeNull();
  });
});

describe('song numbers and names', () => {
  const songs = [song('Großer Gott', 3), song('Halleluja', 7, 'A'), song('Amen', 5)];

  it('finds songs with the same name', () => {
    expect(findSongsWithSameName('  großer  gott ', songs).length).toBe(1);
    expect(findSongsWithSameName('Großer Gott wir loben', songs).length).toBe(0);
  });

  it('checks numbers per prefix', () => {
    expect(isSongNumberTaken(3, null, songs)).toBe(true);
    expect(isSongNumberTaken(7, null, songs)).toBe(false);
    expect(isSongNumberTaken(7, 'a', songs)).toBe(true);
  });

  it('suggests the next free number per prefix', () => {
    expect(nextFreeSongNumber(undefined, songs)).toBe(6);
    expect(nextFreeSongNumber('A', songs)).toBe(8);
    expect(nextFreeSongNumber('B', songs)).toBe(1);
  });
});

describe('mapExtraFields', () => {
  const field = (id: string, name: string, type: FieldType, options?: string[]): ExtraField =>
    ({ id, name, type, defaultValue: null, options });

  it('maps by name and type and skips empty or unknown values', () => {
    const source = [
      field('a', 'Tonart', FieldType.TEXT),
      field('b', 'Dauer', FieldType.NUMBER),
      field('c', 'Stil', FieldType.SELECT, ['Pop', 'Klassik']),
      field('d', 'Leer', FieldType.TEXT),
    ];
    const target = [
      field('x', 'tonart', FieldType.TEXT),
      field('y', 'Dauer', FieldType.TEXT),
      field('z', 'Stil', FieldType.SELECT, ['Klassik']),
      field('w', 'Leer', FieldType.TEXT),
    ];
    const mapped = mapExtraFields({ a: 'D-Dur', b: 4, c: 'Pop', d: '' }, source, target);
    expect(mapped.map(m => [m.targetField.id, m.value])).toEqual([['x', 'D-Dur']]);
  });
});

describe('instrumentIdsFromFiles', () => {
  it('drops reserved ids, null and the main group', () => {
    expect(instrumentIdsFromFiles([{ instrumentId: 1 }, { instrumentId: 2 }, { instrumentId: null }, { instrumentId: 9 }, { instrumentId: 9 }, { instrumentId: 4 }], 4))
      .toEqual([9]);
  });
});
