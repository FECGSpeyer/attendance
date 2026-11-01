import { FieldSelection, Plan, Song } from './interfaces';
import { allPlans } from './plan-days';

/** One Werk of a Termin as members see it. */
export interface AttendanceSong {
  songId: number;
  /** Undefined when the Werk is not in this instance's Werke list (e.g. planned for another instance). */
  song?: Song;
  /** "12. Name" or the plan row's text when the Werk is unknown. */
  name: string;
  conductorName: string;
}

/** A history row of a Termin, reduced to what the merge needs. */
export interface AttendanceHistoryEntry {
  songId: number;
  attendance_id: number;
  conductorName?: string;
}

type PlanSource = { plan?: Plan | null; extra_plans?: Plan[] | null };

/** Song rows of all plans of a Termin, in plan order. */
export function planSongFields(att: PlanSource | null | undefined): FieldSelection[] {
  return allPlans(att)
    .flatMap(plan => plan?.fields ?? [])
    .filter(field => !!field?.songId && !field.isGroup);
}

/**
 * Werke of one Termin: rows of the Ablaufplan (also when the plan is not shared)
 * plus the Werke entered for the Termin (`history`). Plan order first, then the
 * remaining history Werke; each Werk once.
 */
export function songsForAttendance(
  att: PlanSource | null | undefined,
  history: AttendanceHistoryEntry[],
  songs: Song[],
): AttendanceSong[] {
  const result: AttendanceSong[] = [];
  const seen = new Set<number>();
  const conductorFromHistory = new Map<number, string>();
  for (const his of history) {
    if (his.conductorName && !conductorFromHistory.has(his.songId)) {
      conductorFromHistory.set(his.songId, his.conductorName);
    }
  }

  const add = (songId: number, fallbackName: string, conductor: string) => {
    if (!songId || seen.has(songId)) { return; }
    seen.add(songId);
    const song = songs.find(s => s.id === songId);
    result.push({
      songId,
      song,
      name: song ? `${song.number}. ${song.name}` : fallbackName,
      conductorName: conductorFromHistory.get(songId) || conductor || '',
    });
  };

  for (const field of planSongFields(att)) {
    add(Number(field.songId), field.name, field.conductor ?? '');
  }
  for (const his of history) {
    add(Number(his.songId), '', '');
  }

  return result.filter(entry => entry.name);
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
