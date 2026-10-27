import { Component, effect, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { Task } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { groupTasksByDue, isTaskOverdue } from 'src/app/team-organization/team-org.utils';
import { formatTaskDue, localToday } from 'src/app/team-organization/tasks-tab/tasks-tab.utils';
import { translate } from '@jsverse/transloco';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Compact "Meine Aufgaben" card: the signed-in person's open tasks. Used as a
 * dashboard card (leadership) and on "Meine Termine" (members). Renders
 * nothing when the feature is off or there is nothing open.
 */
@Component({
  selector: 'app-my-tasks',
  templateUrl: './my-tasks.component.html',
  styleUrls: ['./my-tasks.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, TranslocoModule],
})
export class MyTasksComponent {
  /** Maximum number of tasks listed in the card. */
  @Input() limit = 5;

  openTasks: Task[] = [];
  today = localToday();
  loaded = false;
  private loadedTenantId: number | null = null;
  private busy = new Set<string>();

  constructor(public db: DbService) {
    effect(() => {
      const tenantId = this.db.tenant()?.id ?? null;
      if (tenantId && this.db.teamOrgEnabled() && tenantId !== this.loadedTenantId) {
        this.loadedTenantId = tenantId;
        void this.load();
      }
    });
  }

  get visible(): boolean {
    return this.db.teamOrgEnabled() && this.openTasks.length > 0;
  }

  /** Overdue first, then by due date; tasks without date last. */
  get shownTasks(): Task[] {
    return this.openTasks.slice(0, this.limit);
  }

  get overdueCount(): number {
    return this.openTasks.filter(t => isTaskOverdue(t, this.today)).length;
  }

  get subtitle(): string {
    const open = translate('tasks.openCount', { count: this.openTasks.length });
    return this.overdueCount ? `${open} · ${translate('tasks.overdueCount', { count: this.overdueCount })}` : open;
  }

  async load(): Promise<void> {
    if (!this.db.teamOrgEnabled()) {
      this.openTasks = [];
      return;
    }
    this.today = localToday();
    try {
      const tasks = await this.db.getMyTasks();
      this.openTasks = groupTasksByDue(tasks.filter(t => t.status !== 'completed'), this.today)
        .flatMap(g => g.tasks);
    } catch (error) {
      console.error('My tasks load error:', error);
      this.openTasks = [];
    } finally {
      this.loaded = true;
    }
  }

  isOverdue(task: Task): boolean {
    return isTaskOverdue(task, this.today);
  }

  dueLabel(task: Task): string {
    if (!task.due_date) return translate('tasks.noDue');
    const label = formatTaskDue(task, this.today);
    return this.isOverdue(task) ? translate('tasks.overdueLabel', { label }) : translate('tasks.dueLabel', { label });
  }

  async complete(task: Task, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (!task.id || this.busy.has(task.id)) return;
    this.busy.add(task.id);
    const index = this.openTasks.indexOf(task);
    this.openTasks = this.openTasks.filter(t => t !== task);
    try {
      await this.db.updateTask(task.id, { status: 'completed' });
      Utils.showToast(translate('tasks.done'));
    } catch (error) {
      console.error('Task complete error:', error);
      const restored = [...this.openTasks];
      restored.splice(Math.max(0, index), 0, task);
      this.openTasks = restored;
      Utils.showToast(translate('tasks.statusFailed'), 'danger');
    } finally {
      this.busy.delete(task.id);
    }
  }
}
