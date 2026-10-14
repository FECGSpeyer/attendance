import { describe, it, expect } from 'vitest';
import { Task } from '../../utilities/interfaces';
import {
  filterTasks,
  formatLongDate,
  formatTaskDue,
  localToday,
  needsAssignmentNotice,
  taskPersonChips,
  toggledStatus,
} from './tasks-tab.utils';

function task(partial: Partial<Task>): Task {
  return { tenant_id: 1, title: 'T', priority: 'medium', status: 'open', ...partial };
}

const anna = { id: 1, firstName: 'Anna', lastName: 'Weber' };
const annaS = { id: 3, firstName: 'Anna', lastName: 'Schmidt' };
const paul = { id: 2, firstName: 'Paul', lastName: 'Fischer' };

describe('taskPersonChips', () => {
  it('creates one chip per person with open tasks, sorted by name, with counts', () => {
    const chips = taskPersonChips([
      task({ responsible_person_id: 2, responsible_person: paul }),
      task({ responsible_person_id: 1, responsible_person: anna }),
      task({ responsible_person_id: 1, responsible_person: anna, status: 'in_progress' }),
    ]);
    expect(chips.map(c => [c.personId, c.label, c.openCount])).toEqual([
      [1, 'Anna', 2],
      [2, 'Paul', 1],
    ]);
  });

  it('ignores completed tasks and tasks without a person', () => {
    const chips = taskPersonChips([
      task({ responsible_person_id: 2, responsible_person: paul, status: 'completed' }),
      task({ responsible_person_id: null }),
    ]);
    expect(chips).toEqual([]);
  });

  it('adds the last name initial when first names repeat', () => {
    const chips = taskPersonChips([
      task({ responsible_person_id: 1, responsible_person: anna }),
      task({ responsible_person_id: 3, responsible_person: annaS }),
    ]);
    expect(chips.map(c => c.label)).toEqual(['Anna S.', 'Anna W.']);
  });
});

describe('filterTasks', () => {
  const tasks = [
    task({ id: 'a', responsible_person_id: 1 }),
    task({ id: 'b', responsible_person_id: 2 }),
    task({ id: 'c', responsible_person_id: null }),
  ];

  it('returns all tasks for "all"', () => {
    expect(filterTasks(tasks, 'all', 1)).toHaveLength(3);
  });

  it('returns own tasks for "mine"', () => {
    expect(filterTasks(tasks, 'mine', 2).map(t => t.id)).toEqual(['b']);
  });

  it('returns nothing for "mine" without a known person', () => {
    expect(filterTasks(tasks, 'mine', null)).toEqual([]);
  });

  it('filters by person id', () => {
    expect(filterTasks(tasks, 1, 2).map(t => t.id)).toEqual(['a']);
  });
});

describe('formatTaskDue', () => {
  const today = '2026-10-14'; // Wednesday

  it('is empty without a due date', () => {
    expect(formatTaskDue({ due_date: null, status: 'open' }, today)).toBe('');
  });

  it('formats overdue tasks as "seit"', () => {
    expect(formatTaskDue({ due_date: '2026-10-12', status: 'open' }, today)).toBe('seit 12.10.');
  });

  it('does not call completed tasks overdue', () => {
    expect(formatTaskDue({ due_date: '2026-10-12', status: 'completed' }, today)).toBe('Mo, 12.10.');
  });

  it('uses Heute and Morgen', () => {
    expect(formatTaskDue({ due_date: '2026-10-14', status: 'open' }, today)).toBe('Heute');
    expect(formatTaskDue({ due_date: '2026-10-15', status: 'open' }, today)).toBe('Morgen');
  });

  it('shows weekday and date, with year for other years', () => {
    expect(formatTaskDue({ due_date: '2026-10-28', status: 'open' }, today)).toBe('Mi, 28.10.');
    expect(formatTaskDue({ due_date: '2027-01-05', status: 'open' }, today)).toBe('Di, 05.01.2027');
  });
});

describe('small helpers', () => {
  it('formatLongDate', () => {
    expect(formatLongDate('2026-10-30')).toBe('Fr, 30.10.2026');
    expect(formatLongDate('2026-10-30T18:00:00')).toBe('Fr, 30.10.2026');
    expect(formatLongDate(null)).toBe('');
  });

  it('localToday', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('toggledStatus', () => {
    expect(toggledStatus('open')).toBe('completed');
    expect(toggledStatus('in_progress')).toBe('completed');
    expect(toggledStatus('completed')).toBe('open');
  });

  it('needsAssignmentNotice', () => {
    expect(needsAssignmentNotice(null, 5)).toBe(true);
    expect(needsAssignmentNotice(5, 5)).toBe(false);
    expect(needsAssignmentNotice(5, 6)).toBe(true);
    expect(needsAssignmentNotice(5, null)).toBe(false);
  });
});
