import { AgendaItemPriority, Task, TaskStatus } from '../../utilities/interfaces';
import { personName } from '../team-org.utils';

/** Filter of the task list: everything, the signed-in person's tasks, or one person (player id). */
export type TaskFilter = 'all' | 'mine' | number;

export interface TaskPersonChip {
  personId: number;
  name: string;
  /** Short name for the chip (first name, plus last name initial if the first name is not unique). */
  label: string;
  openCount: number;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  completed: 'Erledigt',
};

export const TASK_PRIORITY_LABELS: Record<AgendaItemPriority, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
};

export const TASK_PRIORITY_COLORS: Record<AgendaItemPriority, string> = {
  low: 'medium',
  medium: 'warning',
  high: 'danger',
};

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * One chip per person who has open (not completed) tasks, sorted by name.
 * Persons who only have completed tasks get no chip.
 */
export function taskPersonChips(tasks: Task[]): TaskPersonChip[] {
  const byId = new Map<number, TaskPersonChip & { firstName: string; lastName: string }>();
  for (const t of tasks) {
    if (t.status === 'completed' || !t.responsible_person_id) continue;
    const existing = byId.get(t.responsible_person_id);
    if (existing) {
      existing.openCount++;
      continue;
    }
    const p = t.responsible_person;
    byId.set(t.responsible_person_id, {
      personId: t.responsible_person_id,
      name: personName(p) || 'Unbekannt',
      firstName: p?.firstName?.trim() || personName(p) || 'Unbekannt',
      lastName: p?.lastName?.trim() ?? '',
      label: '',
      openCount: 1,
    });
  }
  const all = [...byId.values()];
  const firstNameCount = new Map<string, number>();
  for (const c of all) firstNameCount.set(c.firstName, (firstNameCount.get(c.firstName) ?? 0) + 1);
  return all
    .map(({ firstName, lastName, ...chip }) => ({
      ...chip,
      label: (firstNameCount.get(firstName) ?? 0) > 1 && lastName ? `${firstName} ${lastName.charAt(0)}.` : firstName,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Applies a filter chip. "mine" without a known person shows nothing. */
export function filterTasks(tasks: Task[], filter: TaskFilter, myPersonId: number | null | undefined): Task[] {
  if (filter === 'all') return tasks;
  const personId = filter === 'mine' ? myPersonId : filter;
  if (personId === null || personId === undefined) return [];
  return tasks.filter(t => t.responsible_person_id === personId);
}

/**
 * Short German due date: "Di, 28.10." (with year if it is not the current year),
 * "seit 12.10." for overdue tasks, "Heute"/"Morgen" for the next days.
 */
export function formatTaskDue(task: Pick<Task, 'due_date' | 'status'>, today: string): string {
  if (!task.due_date) return '';
  const [y, m, d] = task.due_date.split('-').map(Number);
  if (!y || !m || !d) return task.due_date;
  const date = new Date(y, m - 1, d);
  const sameYear = String(y) === today.slice(0, 4);
  const dayMonth = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${sameYear ? '' : y}`;
  if (task.status !== 'completed' && task.due_date < today) return `seit ${dayMonth}`;
  if (task.due_date === today) return 'Heute';
  const [ty, tm, td] = today.split('-').map(Number);
  const tomorrow = new Date(ty, tm - 1, td + 1);
  if (date.getTime() === tomorrow.getTime()) return 'Morgen';
  return `${WEEKDAYS[date.getDay()]}, ${dayMonth}`;
}

/** Long German date for detail views: "Do, 30.10.2026". */
export function formatLongDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

/** Today as YYYY-MM-DD in local time. */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Status after tapping the round check button. */
export function toggledStatus(status: TaskStatus): TaskStatus {
  return status === 'completed' ? 'open' : 'completed';
}

/** Whether the person changed so the (new) responsible person must be notified. */
export function needsAssignmentNotice(before: number | null | undefined, after: number | null | undefined): boolean {
  return !!after && after !== (before ?? null);
}
