import { Song } from './interfaces';

/** One Werk of a Termin as members see it. */
export interface AttendanceSong {
  songId: number;
  song?: Song;
  /** "12. Name" */
  name: string;
  conductorName: string;
}

/** A history row of a Termin, reduced to what the merge needs. */
export interface AttendanceHistoryEntry {
  songId: number;
  attendance_id: number;
  conductorName?: string;
}

/**
 * Werke selected for one Termin (its `history` rows), in the order they were added;
 * each Werk once. Werke that are not in this instance's Werke list are left out.
 */
export function songsForAttendance(history: AttendanceHistoryEntry[], songs: Song[]): AttendanceSong[] {
  const result: AttendanceSong[] = [];
  const seen = new Set<number>();
  for (const his of history) {
    const songId = Number(his.songId);
    if (!songId || seen.has(songId)) { continue; }
    const song = songs.find(s => s.id === songId);
    if (!song) { continue; }
    seen.add(songId);
    result.push({
      songId,
      song,
      name: `${song.number}. ${song.name}`,
      conductorName: his.conductorName || '',
    });
  }
  return result;
}

/** Groups history rows by Termin id. */
export function groupHistoryByAttendance(history: AttendanceHistoryEntry[]): Map<number, AttendanceHistoryEntry[]> {
  const map = new Map<number, AttendanceHistoryEntry[]>();
  for (const his of history) {
    if (!his.attendance_id) { continue; }
    const list = map.get(his.attendance_id) ?? [];
    list.push(his);
    map.set(his.attendance_id, list);
  }
  return map;
}
