import { currentLanguage, dateFmt } from '../../i18n/languages';
import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { ActionSheetButton, ActionSheetController, AlertController, ModalController, NavController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import {
  AgendaItem,
  AgendaItemHistoryEntry,
  AgendaItemPriority,
  AgendaItemStatus,
  Attendance,
  Player,
  Task,
} from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { agendaFieldId, OUTCOME_LABELS, personName } from 'src/app/team-organization/team-org.utils';
import { openTaskForm } from 'src/app/tasks/task-form/task-form.component';
import { addTopicsToAttendance, defaultTopicDuration, upcomingProtocolAttendances } from '../agenda-plan.helpers';
import { promptCreateProtocolAttendance } from 'src/app/utilities/attendance-date-dialog';
import { translate } from '@jsverse/transloco';

/** How many upcoming Termine "Einplanen" offers. */
const PLAN_CHOICES = 6;

@Component({
  selector: 'app-agenda-item-detail',
  templateUrl: './agenda-item-detail.page.html',
  styleUrls: ['./agenda-item-detail.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None
})
export class AgendaItemDetailPage implements OnInit {
  public item: AgendaItem;
  public history: AgendaItemHistoryEntry[] = [];
  public tasks: Task[] = [];
  public persons: Player[] = [];
  public isNew = false;
  public loading = true;
  private itemId: string;

  readonly statusOptions: { value: AgendaItemStatus; label: string }[] = [
    { value: 'open', label: translate('agenda.statusOpen') },
    { value: 'completed', label: translate('agenda.statusDone') },
    { value: 'dropped', label: translate('agenda.statusDropped') },
  ];

  readonly priorityOptions: { value: AgendaItemPriority; label: string }[] = [
    { value: 'high', label: translate('agenda.high') },
    { value: 'medium', label: translate('agenda.medium') },
    { value: 'low', label: translate('agenda.low') },
  ];

  readonly outcomeLabels = OUTCOME_LABELS;

  constructor(
    public db: DbService,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
    private navController: NavController,
    private location: Location,
  ) {}

  get isLeader(): boolean {
    return this.db.isTeamLeader();
  }

  get statusLabel(): string {
    return this.statusOptions.find(o => o.value === this.item?.status)?.label ?? '';
  }

  get priorityLabel(): string {
    return this.priorityOptions.find(o => o.value === this.item?.priority)?.label ?? '';
  }

  get responsibleName(): string {
    return personName(this.item?.responsible_person) || personName(this.persons.find(p => p.id === this.item?.responsible_person_id));
  }

  get proposerName(): string {
    return personName(this.item?.proposer);
  }

  get completedTaskCount(): number {
    return this.tasks.filter(t => t.status === 'completed').length;
  }

  async ngOnInit() {
    this.itemId = this.route.snapshot.params['id'];
    this.isNew = this.itemId === 'new';

    if (this.isLeader) {
      try {
        const players = await this.db.getPlayers(true);
        this.persons = players
          .filter(p => !p.left && !p.pending)
          .sort((a, b) => personName(a).localeCompare(personName(b), 'de'));
      } catch {
        this.persons = [];
      }
    }

    if (this.isNew) {
      this.item = {
        tenant_id: this.db.tenant().id,
        title: '',
        status: 'open',
        priority: 'medium',
        responsible_person_id: null,
        default_duration: null,
      };
      this.loading = false;
    } else {
      await this.loadItem();
    }
  }

  // Reload linked tasks and history when coming back from a task or protocol.
  async ionViewWillEnter() {
    if (this.item && !this.isNew) {
      await this.loadRelated();
    }
  }

  async loadItem() {
    this.loading = true;
    try {
      this.item = await this.db.getAgendaItem(this.itemId);
      await this.loadRelated();
    } finally {
      this.loading = false;
    }
  }

  private async loadRelated() {
    const [history, tasks] = await Promise.all([
      this.db.getAgendaItemHistory(this.itemId).catch(() => [] as AgendaItemHistoryEntry[]),
      this.db.getTasksForAgendaItem(this.itemId).catch(() => [] as Task[]),
    ]);
    this.history = [...history].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
    this.tasks = tasks;
  }

  historyTypeName(entry: AgendaItemHistoryEntry): string {
    const type = this.db.attendanceTypes().find(t => t.id === entry.type_id);
    return (type ? Utils.getTypeTitle(type, entry.type_info ?? '') : entry.type_info) || type?.name || translate('attendance.eventFallback');
  }

  historyStatus(entry: AgendaItemHistoryEntry): { label: string; color: string } {
    if (entry.outcome) {
      const color = entry.outcome === 'postponed' ? 'warning' : entry.outcome === 'decided' ? 'success' : 'medium';
      return { label: this.outcomeLabels[entry.outcome], color };
    }
    if (dayjs(entry.date).isAfter(dayjs().startOf('day')) || dayjs(entry.date).isSame(dayjs(), 'day')) {
      return { label: translate('agenda.planned'), color: 'primary' };
    }
    return { label: translate('agenda.noOutcome'), color: 'medium' };
  }

  openHistory(entry: AgendaItemHistoryEntry) {
    this.navController.navigateForward(['/tabs/attendance', entry.attendance_id, 'protocol']);
  }

  openTask(task: Task) {
    this.navController.navigateForward(['/tabs/settings/tasks', task.id]);
  }

  taskSubtitle(task: Task): string {
    const who = personName(task.responsible_person) || translate('attendance.nobodyAssigned');
    if (task.status === 'completed') {
      return task.completed_at ? translate('agenda.doneOn', { who, date: dayjs(task.completed_at).format(dateFmt('dayMonth')) }) : translate('agenda.done', { who });
    }
    return task.due_date ? translate('agenda.dueOn', { who, date: dayjs(task.due_date).format(dateFmt('dayMonth')) }) : who;
  }

  async createTask() {
    const task = await openTaskForm(this.modalController, {
      agendaItemId: this.itemId,
      contextLabel: this.item.title,
      presetPersonId: this.item.responsible_person_id ?? null,
    });
    if (task) {
      this.tasks = [...this.tasks, task];
    }
  }

  /** "Einplanen": puts the topic as TOP into one of the next Termine with protocol. */
  async planIntoAttendance() {
    if (!this.item?.id) return;
    let upcoming: Attendance[] = [];
    try {
      upcoming = upcomingProtocolAttendances(await this.db.getUpcomingAttendances(), this.db.attendanceTypes()).slice(0, PLAN_CHOICES);
    } catch (e) {
      console.error('upcoming attendances failed', e);
    }
    const fieldId = agendaFieldId(this.item.id);
    const buttons: ActionSheetButton[] = upcoming.map(att => {
      const type = this.db.attendanceTypes().find(t => t.id === att.type_id);
      const already = !!att.plan?.fields?.some(f => f.id === fieldId);
      return {
        text: `${dayjs(att.date).locale(currentLanguage()).format(`dd, ${dateFmt('dayMonth')}`)} · ${(type ? Utils.getTypeTitle(type, att.typeInfo) : att.typeInfo) || type?.name || translate('attendance.eventFallback')}${already ? translate('agenda.alreadyPlanned') : ''}`,
        disabled: already,
        handler: () => { void this.insertInto(att); },
      } as ActionSheetButton;
    });
    buttons.push({ text: translate('agenda.newEvent'), icon: 'add-circle-outline', handler: () => { void this.planIntoNewAttendance(); } });
    buttons.push({ text: translate('common.cancel'), role: 'cancel' });
    const sheet = await this.actionSheetController.create({
      header: upcoming.length ? translate('agenda.whichEvent') : translate('agenda.noProtocolEvent'),
      buttons,
    });
    await sheet.present();
  }

  /** Creates a Termin ad hoc and plans the topic into it right away. */
  private async planIntoNewAttendance() {
    const created = await promptCreateProtocolAttendance(this.alertController, this.db);
    if (created) await this.insertInto(created);
  }

  private async insertInto(att: Attendance) {
    const type = this.db.attendanceTypes().find(t => t.id === att.type_id);
    try {
      await addTopicsToAttendance(this.db, att, type, [{ item: this.item, duration: defaultTopicDuration(this.item, type) }]);
      Utils.showToast(translate('agenda.plannedFor', { date: dayjs(att.date).format(dateFmt('dayMonth')) }), 'success');
      await this.loadRelated();
    } catch (e) {
      console.error('plan topic failed', e);
      Utils.showToast(translate('agenda.planFailed'), 'danger');
    }
  }

  async deleteItem() {
    const alert = await this.alertController.create({
      header: translate('agenda.deleteConfirm'),
      message: translate('agenda.deleteMessage'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            try {
              await this.db.deleteAgendaItem(this.itemId);
              Utils.showToast(translate('agenda.deleted'));
              this.navController.navigateBack('/tabs/settings/team-organization?tab=topics');
            } catch (error) {
              console.error('Delete error:', error);
              Utils.showToast(translate('agenda.deleteFailed'), 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async save() {
    if (!this.item.title?.trim()) {
      Utils.showToast(translate('agenda.enterTitle'), 'warning');
      return;
    }
    const duration = Number(this.item.default_duration);
    const changes: Partial<AgendaItem> = {
      title: this.item.title.trim(),
      description: this.item.description?.trim() || null,
      status: this.item.status,
      priority: this.item.priority,
      responsible_person_id: this.item.responsible_person_id ?? null,
      default_duration: duration > 0 ? Math.round(duration) : null,
    };
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      if (this.isNew) {
        const created = await this.db.addAgendaItem({ ...changes, tenant_id: this.db.tenant().id } as AgendaItem);
        this.itemId = created.id;
        this.isNew = false;
        this.item = created;
        // Keep the URL in sync so a reload/back works with the real id.
        this.location.replaceState(`/tabs/settings/agenda-items/${created.id}`);
      } else {
        this.item = await this.db.updateAgendaItem(this.itemId, changes);
      }
      Utils.showToast(translate('duty.saved'));
    } catch (error) {
      console.error('Agenda item save error:', error);
      Utils.showToast(translate('agenda.saveFailed'), 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  getPriorityColor(priority: AgendaItemPriority): string {
    switch (priority) {
      case 'high': return 'danger';
      case 'low': return 'medium';
      default: return 'warning';
    }
  }

  getStatusColor(status: AgendaItemStatus): string {
    switch (status) {
      case 'completed': return 'success';
      case 'dropped': return 'medium';
      default: return 'primary';
    }
  }
}
