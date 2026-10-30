import { describe, expect, it } from 'vitest';
import { AGENDA_ITEMS_PLACEHOLDER_ID, FieldSelection, Organisation } from './interfaces';
import { autoNeedsBeamer, beamerActive, ensureFieldUids, needsBeamer } from './plan-beamer';

const f = (name: string, extra: Partial<FieldSelection> = {}): FieldSelection => ({ id: `fld-${name}`, name, time: '5', ...extra });
const org = (extra: Partial<Organisation> = {}): Organisation => ({ name: 'FECG Speyer', fecg_link_enabled: true, beamer_files_enabled: true, ...extra });

describe('plan-beamer', () => {
  it('is active only for linked orgs with the setting on and an ORG plan', () => {
    expect(beamerActive(org(), true)).toBe(true);
    expect(beamerActive(org(), false)).toBe(false);
    expect(beamerActive(org({ beamer_files_enabled: false }), true)).toBe(false);
    expect(beamerActive(org({ fecg_link_enabled: false }), true)).toBe(false);
    expect(beamerActive(null, true)).toBe(false);
  });

  it('switches on for Werke and titles with Lied or Gedicht', () => {
    expect(autoNeedsBeamer({ name: 'Herr, reich mir die Hände', songId: 47 })).toBe(true);
    expect(autoNeedsBeamer({ name: 'Gemeindelied' })).toBe(true);
    expect(autoNeedsBeamer({ name: 'gedicht: Dank' })).toBe(true);
    expect(autoNeedsBeamer({ name: 'Predigt' })).toBe(false);
  });

  it('keeps a value set by hand', () => {
    expect(needsBeamer(f('Lied', { needsBeamer: false }))).toBe(false);
    expect(needsBeamer(f('Predigt', { needsBeamer: true }))).toBe(true);
  });

  it('never needs a file for notes, block heads and the agenda marker', () => {
    expect(needsBeamer({ id: 'noteFld Lied', name: 'Lied', time: '0', needsBeamer: true })).toBe(false);
    expect(needsBeamer(f('Lieder', { isGroup: true }))).toBe(false);
    expect(needsBeamer({ id: AGENDA_ITEMS_PLACEHOLDER_ID, name: 'Lied', time: '0' })).toBe(false);
  });

  it('gives each row a unique uid and drops the file of copied rows', () => {
    const file = { name: 'a.sng', path: 'Songs/a.sng' };
    const fields = ensureFieldUids([f('a', { uid: 'u1', beamerFile: file }), f('b'), f('c', { uid: 'u1', beamerFile: file })]);
    expect(fields[0].uid).toBe('u1');
    expect(fields[0].beamerFile).toEqual(file);
    expect(fields[1].uid).toBeTruthy();
    expect(fields[2].uid).not.toBe('u1');
    expect(fields[2].beamerFile).toBeUndefined();
    expect(new Set(fields.map(x => x.uid)).size).toBe(3);
  });
});
