import { describe, expect, it } from 'vitest';
import { FieldSelection } from './interfaces';
import { blockTemplateFrom, cloneBlock, fieldNumbers, groupDuration, moveRow, normalizeGroups } from './plan-groups';

const f = (id: string, time = '5', extra: Partial<FieldSelection> = {}): FieldSelection => ({ id, name: id, time, ...extra });
const head = (id: string) => f(id, '0', { isGroup: true });
const ids = (fields: FieldSelection[]) => fields.map(x => x.groupId ? `${x.groupId}>${x.id}` : x.id);

// Lied, [Block: a, b, c], Orchester
const plan = (): FieldSelection[] => [
  f('lied', '4'),
  head('G'),
  f('a', '5', { groupId: 'G' }),
  f('b', '3', { groupId: 'G' }),
  f('c', '5', { groupId: 'G' }),
  f('orch', '4'),
];
const all = (fields: FieldSelection[]) => fields.map((_, i) => i);

describe('plan-groups', () => {
  it('sums the Unterpunkte as block duration', () => {
    expect(groupDuration(plan(), 'G')).toBe(13);
  });

  it('numbers Unterpunkte below their block', () => {
    expect(fieldNumbers(plan())).toEqual(['1', '2', '2.1', '2.2', '2.3', '3']);
  });

  it('drops groupIds that are out of place and resets head time', () => {
    const fields = [head('G'), f('a', '5', { groupId: 'G' }), f('x'), f('b', '5', { groupId: 'G' })];
    fields[0].time = '9';
    normalizeGroups(fields);
    expect(ids(fields)).toEqual(['G', 'G>a', 'x', 'b']);
    expect(fields[0].time).toBe('0');
  });

  it('moves a head together with its Unterpunkte', () => {
    const fields = plan();
    expect(ids(moveRow(fields, all(fields), 1, 5))).toEqual(['lied', 'orch', 'G', 'G>a', 'G>b', 'G>c']);
  });

  it('moves a collapsed block by its head', () => {
    const fields = plan();
    // rows: lied, G, orch
    expect(ids(moveRow(fields, [0, 1, 5], 1, 0))).toEqual(['G', 'G>a', 'G>b', 'G>c', 'lied', 'orch']);
  });

  it('lets a field join a block when dropped between two Unterpunkte', () => {
    const fields = plan();
    expect(ids(moveRow(fields, all(fields), 0, 2))).toEqual(['G', 'G>a', 'G>lied', 'G>b', 'G>c', 'orch']);
  });

  it('lets an Unterpunkt leave its block', () => {
    const fields = plan();
    expect(ids(moveRow(fields, all(fields), 3, 5))).toEqual(['lied', 'G', 'G>a', 'G>c', 'orch', 'b']);
  });

  it('keeps an Unterpunkt in its block when moved to its end', () => {
    const fields = plan();
    expect(ids(moveRow(fields, all(fields), 2, 4))).toEqual(['lied', 'G', 'G>b', 'G>c', 'G>a', 'orch']);
  });

  it('does not let a field join when dropped right below the last Unterpunkt', () => {
    const fields = plan();
    expect(ids(moveRow(fields, all(fields), 0, 4))).toEqual(['G', 'G>a', 'G>b', 'G>c', 'lied', 'orch']);
  });

  it('joins or leaves a block when told so', () => {
    const fields = plan();
    expect(ids(moveRow(fields, all(fields), 5, 5, 'G'))).toEqual(['lied', 'G', 'G>a', 'G>b', 'G>c', 'G>orch']);
    const again = plan();
    expect(ids(moveRow(again, all(again), 4, 4, null))).toEqual(['lied', 'G', 'G>a', 'G>b', 'c', 'orch']);
  });

  it('never drops a head inside another block', () => {
    const fields = [...plan(), head('H'), f('h1', '5', { groupId: 'H' })];
    // move H between a and b
    const moved = moveRow(fields, all(fields), 6, 3);
    expect(ids(moved)).toEqual(['lied', 'G', 'G>a', 'G>b', 'G>c', 'H', 'H>h1', 'orch']);
  });

  it('copies a block with fresh ids, keeping song ids', () => {
    const fields = [head('G'), f('a', '5', { groupId: 'G' }), f('12', '4', { groupId: 'G', songId: 12 })];
    const copy = cloneBlock(fields);
    expect(copy[0].id).not.toBe('G');
    expect(copy[1].id).not.toBe('a');
    expect(copy[2].id).toBe('12');
    expect(copy.slice(1).every(x => x.groupId === copy[0].id)).toBe(true);
  });

  it('builds a template without topic links', () => {
    const fields = [...plan()];
    fields[2].agendaItemId = 'top';
    const tpl = blockTemplateFrom(fields, 'G');
    expect(tpl.name).toBe('G');
    expect(tpl.fields).toHaveLength(4);
    expect(tpl.fields.some(x => x.agendaItemId)).toBe(false);
  });
});
