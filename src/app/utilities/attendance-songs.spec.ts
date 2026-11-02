import { describe, expect, it } from 'vitest';
import { Song } from './interfaces';
import { groupHistoryByAttendance, songsForAttendance } from './attendance-songs';

const song = (id: number, number: number | string, name: string): Song => ({ id, number, name } as unknown as Song);
const songs = [song(1, 12, 'Großer Gott'), song(2, 'EG317', 'Lobe den Herren'), song(3, 48, 'Die Gnade')];

describe('attendance-songs', () => {
  it('returns nothing without selected Werke', () => {
    expect(songsForAttendance([], songs)).toEqual([]);
  });

  it('lists the selected Werke in the order they were added, each once', () => {
    const result = songsForAttendance([
      { songId: 2, attendance_id: 9, conductorName: 'Lina' },
      { songId: 1, attendance_id: 9, conductorName: 'Jonas' },
      { songId: 2, attendance_id: 9, conductorName: 'Jonas' },
    ], songs);
    expect(result.map(r => r.songId)).toEqual([2, 1]);
    expect(result[0]).toMatchObject({ name: 'EG317. Lobe den Herren', conductorName: 'Lina' });
    expect(result[1].conductorName).toBe('Jonas');
  });

  it('leaves out Werke that are not in the Werke list', () => {
    expect(songsForAttendance([{ songId: 88, attendance_id: 1 }], songs)).toEqual([]);
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
