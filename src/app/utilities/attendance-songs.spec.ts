import { describe, expect, it } from 'vitest';
import { FieldSelection, Plan, Song } from './interfaces';
import { groupHistoryByAttendance, planSongFields, songsForAttendance } from './attendance-songs';

const song = (id: number, number: number | string, name: string): Song => ({ id, number, name } as unknown as Song);
const songs = [song(1, 12, 'Großer Gott'), song(2, 'EG317', 'Lobe den Herren'), song(3, 48, 'Die Gnade')];
const row = (id: string, extra: Partial<FieldSelection> = {}): FieldSelection => ({ id, name: id, time: '5', ...extra });
const plan = (fields: FieldSelection[]): Plan => ({ time: '18:00', end: '', fields });

describe('attendance-songs', () => {
  it('returns nothing without plan and history', () => {
    expect(songsForAttendance({}, [], songs)).toEqual([]);
    expect(songsForAttendance(null, [], songs)).toEqual([]);
  });

  it('takes song rows of the plan in plan order', () => {
    const att = { plan: plan([row('Begrüßung'), row('2', { songId: 2, conductor: 'Lina' }), row('Pause'), row('1', { songId: 1 })]) };
    const result = songsForAttendance(att, [], songs);
    expect(result.map(r => r.songId)).toEqual([2, 1]);
    expect(result[0]).toMatchObject({ name: 'EG317. Lobe den Herren', conductorName: 'Lina' });
  });

  it('adds history Werke after the plan and keeps each Werk once', () => {
    const att = { plan: plan([row('3', { songId: 3 })]) };
    const history = [
      { songId: 1, attendance_id: 9, conductorName: 'Jonas' },
      { songId: 3, attendance_id: 9, conductorName: 'Lina' },
    ];
    const result = songsForAttendance(att, history, songs);
    expect(result.map(r => r.songId)).toEqual([3, 1]);
    // conductor of the history entry wins over the plan row
    expect(result[0].conductorName).toBe('Lina');
    expect(result[1].conductorName).toBe('Jonas');
  });

  it('includes extra plans and skips group heads', () => {
    const att = {
      plan: plan([row('G', { isGroup: true, songId: 99 }), row('1', { songId: 1 })]),
      extra_plans: [plan([row('2', { songId: 2 }), row('1b', { songId: 1 })])],
    };
    expect(planSongFields(att).map(f => f.songId)).toEqual([1, 2, 1]);
    expect(songsForAttendance(att, [], songs).map(r => r.songId)).toEqual([1, 2]);
  });

  it('keeps unknown plan Werke with the row text but drops unknown history Werke', () => {
    const att = { plan: plan([row('77', { songId: 77, name: 'Chor Neukirch: Halleluja' })]) };
    const result = songsForAttendance(att, [{ songId: 88, attendance_id: 1 }], songs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ songId: 77, song: undefined, name: 'Chor Neukirch: Halleluja' });
  });

  it('groups history by Termin', () => {
    const map = groupHistoryByAttendance([
      { songId: 1, attendance_id: 5 },
      { songId: 2, attendance_id: 5 },
      { songId: 3, attendance_id: 6 },
      { songId: 4, attendance_id: 0 },
    ]);
    expect(map.get(5)?.length).toBe(2);
    expect(map.get(6)?.length).toBe(1);
    expect(map.size).toBe(2);
  });
});
