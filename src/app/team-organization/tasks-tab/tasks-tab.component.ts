import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { Task } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { openTaskForm } from 'src/app/tasks/task-form/task-form.component';
import { groupTasksByDue, isCompletedTaskArchived, isTaskOverdue, personName, TaskGroup } from '../team-org.utils';
import {
  filterTasks,
  formatTaskDue,
  localToday,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TaskFilter,
  TaskPersonChip,
  taskPersonChips,
  toggledStatus,
} from './tasks-tab.utils';
import { translate } from '@jsverse/transloco';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Tab "Aufgaben" of the Teamorganisation. Leadership sees all tasks with
 * filters and can add tasks; members see only their own tasks (RLS) and can
 * complete them.
 */
@Component({
  selector: 'app-team-tasks-tab',
  templateUrl: './tasks-tab.component.html',
  styleUrls: ['./tasks-tab.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, RouterModule, TranslocoModule],
})
export class TeamTasksTabComponent implements OnInit {
  tasks: Task[] = [];
  groups: TaskGroup[] = [];
  chips: TaskPersonChip[] = [];
  filter: TaskFilter = 'all';
  includeArchived = false;
  archivedCount = 0;
  loading = true;
  today = localToday();
  myPersonId: number | null = null;

  readonly statusLabels = TASK_STATUS_LABELS;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  private busy = new Set<string>();

  constructor(
    public db: DbService,
    private modalController: ModalController,
  ) {}

  get isLeader(): boolean {
    return this.db.isTeamLeader();
  }

  async ngOnInit() {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = !this.tasks.length;
    this.today = localToday();
    try {
      const person = await this.db.loadTeamPerson();
      this.myPersonId = person?.id ?? null;
      this.tasks = this.isLeader ? await this.db.getTasks() : await this.db.getMyTasks();
    } catch (error) {
      console.error('Tasks load error:', error);
      Utils.showToast(translate('teamOrg.tasksLoadFailed'), 'danger');
    } finally {
      this.loading = false;
      this.rebuild();
    }
  }

  setFilter(filter: TaskFilter) {
    this.filter = filter;
    this.rebuild();
  }

  onArchivedToggle() {
    this.rebuild();
  }

  private rebuild() {
    this.chips = this.isLeader ? taskPersonChips(this.tasks) : [];
    if (typeof this.filter === 'number' && !this.chips.some(c => c.personId === this.filter)) {
      this.filter = 'all';
    }
    const visible = this.isLeader ? filterTasks(this.tasks, this.filter, this.myPersonId) : this.tasks;
    this.archivedCount = visible.filter(t => isCompletedTaskArchived(t)).length;
    this.groups = groupTasksByDue(visible, this.today, this.includeArchived);
  }

  get myOpenCount(): number {
    return this.myPersonId ? this.tasks.filter(t => t.responsible_person_id === this.myPersonId && t.status !== 'completed').length : 0;
  }

  get allOpenCount(): number {
    return this.tasks.filter(t => t.status !== 'completed').length;
  }

  get emptyText(): string {
    if (!this.isLeader) return translate('teamOrg.emptyMineAssigned');
    if (this.filter === 'mine') return translate('teamOrg.emptyMine');
    if (!this.tasks.length) return translate('teamOrg.emptyAll');
    return translate('teamOrg.emptyPerson');
  }

  isOverdue(task: Task): boolean {
    return isTaskOverdue(task, this.today);
  }

  dueLabel(task: Task): string {
    return formatTaskDue(task, this.today);
  }

  subtitle(task: Task): string {
    const parts: string[] = [];
    if (this.isLeader) parts.push(personName(task.responsible_person) || translate('teamOrg.nobodyAssigned'));
    const due = this.dueLabel(task);
    if (due) parts.push(due);
    else if (!this.isLeader) parts.push(translate('tasks.noDue'));
    return parts.join(' · ');
  }

  initials(task: Task): string {
    const p = task.responsible_person;
    return `${p?.firstName?.charAt(0) ?? ''}${p?.lastName?.charAt(0) ?? ''}`.toUpperCase() || '?';
  }

  async toggle(task: Task, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (!task.id || this.busy.has(task.id)) return;
    this.busy.add(task.id);
    const previous = task.status;
    task.status = toggledStatus(previous);
    if (task.status === 'completed') task.completed_at = new Date().toISOString();
    this.rebuild();
    try {
      const updated = await this.db.updateTask(task.id, { status: task.status });
      Object.assign(task, updated);
      this.rebuild();
    } catch (error) {
      console.error('Task status error:', error);
      task.status = previous;
      this.rebuild();
      Utils.showToast(translate('tasks.statusFailed'), 'danger');
    } finally {
      this.busy.delete(task.id);
    }
  }

  async addTask() {
    const created = await openTaskForm(this.modalController);
    if (created) {
      this.tasks = [...this.tasks, created];
      this.rebuild();
    }
  }
}
