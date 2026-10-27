import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ModalController, NavController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { Task, TaskStatus } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { isTaskOverdue, personName } from 'src/app/team-organization/team-org.utils';
import {
  formatLongDate,
  localToday,
  TASK_PRIORITY_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from 'src/app/team-organization/tasks-tab/tasks-tab.utils';
import { openTaskForm } from '../task-form/task-form.component';
import { translate } from '@jsverse/transloco';

/**
 * Aufgabe (C2). Leadership edits everything (via the task form) and can
 * delete; the responsible person only changes the status.
 */
@Component({
  selector: 'app-task-detail',
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
  standalone: false,
})
export class TaskDetailPage implements OnInit {
  public task: Task | null = null;
  public loading = true;
  public savingStatus = false;
  public today = localToday();

  readonly statusOptions: { value: TaskStatus; label: string }[] = (['open', 'in_progress', 'completed'] as TaskStatus[])
    .map(value => ({ value, label: TASK_STATUS_LABELS[value] }));
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorityColors = TASK_PRIORITY_COLORS;
  readonly formatLongDate = formatLongDate;

  private taskId: string;

  constructor(
    public db: DbService,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private modalController: ModalController,
    private navController: NavController,
  ) {}

  get isLeader(): boolean {
    return this.db.isTeamLeader();
  }

  get backHref(): string {
    return this.isLeader ? '/tabs/settings/team-organization' : '/tabs/signout';
  }

  get isMine(): boolean {
    const me = this.db.teamPerson();
    return !!me && this.task?.responsible_person_id === me.id;
  }

  get isOverdue(): boolean {
    return !!this.task && isTaskOverdue(this.task, this.today);
  }

  get assigneeText(): string {
    if (!this.task) return '';
    if (this.isMine) return translate('tasks.assignedToYou');
    const name = personName(this.task.responsible_person);
    return name ? translate('tasks.assignedTo', { name }) : translate('tasks.notAssigned');
  }

  /** "Protokoll · Probe · Di, 21.10.2026" for the source link. */
  get attendanceLabel(): string {
    const att = this.task?.attendance as (Task['attendance'] & { type_id?: string }) | null | undefined;
    if (!att) return '';
    const typeName = att.typeInfo || this.db.attendanceTypes()?.find(t => t.id === att.type_id)?.name || translate('attendance.eventFallback');
    return translate('tasks.eventFrom', { type: typeName, date: formatLongDate(att.date) });
  }

  get hasSource(): boolean {
    return !!this.task && (!!this.task.attendance_id || !!this.task.agenda_item_id);
  }

  async ngOnInit() {
    this.taskId = this.route.snapshot.params['id'];
    await this.db.loadTeamPerson();
    await this.load();
  }

  async load() {
    this.loading = true;
    this.today = localToday();
    try {
      this.task = (await this.db.getTask(this.taskId)) ?? null;
    } catch (error) {
      console.error('Task load error:', error);
      this.task = null;
    } finally {
      this.loading = false;
    }
  }

  async handleRefresh(event: any) {
    await this.load();
    event.target.complete();
  }

  async setStatus(status: TaskStatus) {
    if (!this.task?.id || this.task.status === status || this.savingStatus) return;
    const previous = this.task.status;
    this.task.status = status;
    this.savingStatus = true;
    try {
      this.task = await this.db.updateTask(this.task.id, { status });
      if (status === 'completed') Utils.showToast(translate('tasks.doneThanks'));
    } catch (error) {
      console.error('Task status error:', error);
      if (this.task) this.task.status = previous;
      Utils.showToast(translate('tasks.statusFailed'), 'danger');
    } finally {
      this.savingStatus = false;
    }
  }

  async edit() {
    if (!this.task || !this.isLeader) return;
    const updated = await openTaskForm(this.modalController, { task: this.task });
    if (updated) this.task = updated;
  }

  async deleteTask() {
    const alert = await this.alertController.create({
      header: translate('tasks.deleteConfirm'),
      message: translate('tasks.deleteMessage'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            try {
              await this.db.deleteTask(this.taskId);
              Utils.showToast(translate('tasks.deleted'));
              this.navController.navigateBack('/tabs/settings/team-organization');
            } catch (error) {
              console.error('Delete error:', error);
              Utils.showToast(translate('tasks.deleteFailed'), 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
