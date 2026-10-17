import dayjs from 'dayjs';
import {
  AGENDA_ITEMS_PLACEHOLDER_ID,
  AgendaItem,
  Attendance,
  AttendanceType,
  FieldSelection,
  Plan,
} from '../utilities/interfaces';
import { buildAgendaField, insertAgendaFields } from '../team-organization/team-org.utils';

/** Minutes per topic when neither the topic nor the type says otherwise. */
export const FALLBACK_TOPIC_DURATION = 10;

export interface TopicSelection {
  item: AgendaItem;
  duration: number;
}

/** Duration a topic gets in a plan: topic default → type default → 10 min. */
export function defaultTopicDuration(
  item: Pick<AgendaItem, 'default_duration'> | null | undefined,
  type: Pick<AttendanceType, 'agenda_default_duration'> | null | undefined,
): number {
  return item?.default_duration || type?.agenda_default_duration || FALLBACK_TOPIC_DURATION;
}

/** Parses "HH:mm" or an ISO date time into a dayjs on today's date (time only matters). */
function parsePlanTime(time: string): dayjs.Dayjs {
  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    return dayjs().hour(h || 0).minute(m || 0).second(0).millisecond(0);
  }
  const parsed = dayjs(time);
  return parsed.isValid() ? parsed : dayjs().hour(0).minute(0).second(0).millisecond(0);
}

/**
 * End of a plan in the format the plan editor stores ("YYYY-MM-DDTHH:mm"):
 * start plus all durations (the marker counts 0).
 */
export function computePlanEnd(time: string, fields: FieldSelection[]): string {
  let current = parsePlanTime(time);
  for (const f of fields) {
    if (f.id === AGENDA_ITEMS_PLACEHOLDER_ID) continue;
    current = current.add(parseInt(f.time, 10) || 0, 'minute');
  }
  return current.format('YYYY-MM-DDTHH:mm');
}

/**
 * Base plan for a Termin that has none yet: the type's default plan without
 * song placeholders (those need the song history of the plan editor).
 */
export function initialPlan(
  attendance: Pick<Attendance, 'start_time'>,
  type: Pick<AttendanceType, 'default_plan' | 'start_time'> | null | undefined,
): Plan {
  const fields = (type?.default_plan?.fields ?? [])
    .filter(f => !f.id.startsWith('song-placeholder-'))
    .map(f => ({ ...f }));
  const time = type?.default_plan?.time || type?.start_time || attendance.start_time || '19:00';
  return { time, fields, end: computePlanEnd(time, fields) };
}

/**
 * Returns the plan with the selected topics inserted as TOP fields (at the
 * marker, otherwise at the end) and the end time recalculated. Topics already
 * in the plan are skipped. TOPs of `removeIds` are taken out of the plan; the
 * topics themselves stay in the Themenspeicher.
 */
export function planWithTopics(
  attendance: Pick<Attendance, 'plan' | 'start_time'>,
  type: Pick<AttendanceType, 'default_plan' | 'start_time'> | null | undefined,
  selections: TopicSelection[],
  removeIds: string[] = [],
): Plan {
  const base: Plan = attendance.plan?.fields
    ? { ...attendance.plan, fields: [...attendance.plan.fields] }
    : initialPlan(attendance, type);
  const remove = new Set(removeIds);
  const kept = base.fields.filter(f => !f.agendaItemId || !remove.has(f.agendaItemId));
  const fields = insertAgendaFields(kept, selections.map(s => buildAgendaField(s.item, s.duration)));
  return { ...base, fields, end: computePlanEnd(base.time, fields) };
}

/** Name of the field after which new topics will be inserted, or null when they go first. */
export function insertAfterName(fields: FieldSelection[] | undefined | null): string | null {
  const list = fields ?? [];
  const markerIndex = list.findIndex(f => f.id === AGENDA_ITEMS_PLACEHOLDER_ID);
  const before = markerIndex === -1 ? list : list.slice(0, markerIndex);
  const last = [...before].reverse().find(f => !f.id.includes('noteFld'));
  return last?.name ?? null;
}

/**
 * Upcoming Termine of protocol-enabled types, soonest first. `attendances`
 * may contain past ones; everything before today is dropped.
 */
export function upcomingProtocolAttendances(
  attendances: Attendance[] | undefined | null,
  types: AttendanceType[] | undefined | null,
  now: Date = new Date(),
): Attendance[] {
  const enabled = new Set((types ?? []).filter(t => t.enable_protocol).map(t => t.id));
  const today = dayjs(now).startOf('day');
  return (attendances ?? [])
    .filter(a => enabled.has(a.type_id) && !dayjs(a.date).isBefore(today))
    .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
}

/**
 * Saves the selected topics into the Termin's plan (and removes the TOPs of
 * `removeIds`) and returns the new plan. The plan is re-read first so changes
 * made elsewhere in the meantime are kept.
 */
export async function addTopicsToAttendance(
  db: {
    updateAttendance(att: Partial<Attendance>, id: number): Promise<Attendance>;
    getAttendanceById?(id: number): Promise<Attendance>;
  },
  attendance: Pick<Attendance, 'id' | 'plan' | 'start_time'>,
  type: Pick<AttendanceType, 'default_plan' | 'start_time'> | null | undefined,
  selections: TopicSelection[],
  removeIds: string[] = [],
): Promise<Plan> {
  let current: Pick<Attendance, 'id' | 'plan' | 'start_time'> = attendance;
  if (db.getAttendanceById) {
    try {
      const fresh = await db.getAttendanceById(attendance.id);
      if (fresh) current = { id: attendance.id, plan: fresh.plan, start_time: fresh.start_time };
    } catch {
      current = attendance;
    }
  }
  const plan = planWithTopics(current, type, selections, removeIds);
  const result = await db.updateAttendance({ plan }, attendance.id);
  return result?.plan ?? plan;
}
