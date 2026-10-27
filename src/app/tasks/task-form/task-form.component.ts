import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { AgendaItemPriority, Player, Task } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { personName } from 'src/app/team-organization/team-org.utils';
import { formatLongDate, needsAssignmentNotice, TASK_PRIORITY_LABELS } from 'src/app/team-organization/tasks-tab/tasks-tab.utils';
import { translate } from '@jsverse/transloco';
import { TranslocoModule } from '@jsverse/transloco';

/** Inputs of the task form; the protocol and topic screens pass the presets. */
export interface TaskFormProps {
  /** Existing task to edit. Without it, a new task is created. */
  task?: Task;
  attendanceId?: number | null;
  protocolId?: string | null;
  agendaItemId?: string | null;
  presetTitle?: string;
  presetPersonId?: number | null;
  /** Shown above the form, e.g. "TOP 1 · Konzertplanung". */
  contextLabel?: string;
}

/**
 * Opens the task form as a sheet. Resolves with the created/updated task, or
 * undefined when the sheet was closed without saving.
 */
export async function openTaskForm(modalController: ModalController, props: TaskFormProps = {}): Promise<Task | undefined> {
  const modal = await modalController.create({
    component: TaskFormComponent,
    componentProps: props,
    breakpoints: [0, 1],
    initialBreakpoint: 1,
  });
  await modal.present();
  const { data, role } = await modal.onWillDismiss<Task>();
  return role === 'saved' ? data : undefined;
}

/** Neue Aufgabe / Aufgabe bearbeiten (leadership only). */
@Component({
  selector: 'app-task-form',
  templateUrl: './task-form.component.html',
  styleUrls: ['./task-form.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TranslocoModule],
})
export class TaskFormComponent implements OnInit {
  @Input() task?: Task;
  @Input() attendanceId?: number | null;
  @Input() protocolId?: string | null;
  @Input() agendaItemId?: string | null;
  @Input() presetTitle?: string;
  @Input() presetPersonId?: number | null;
  @Input() contextLabel?: string;

  title = '';
  description = '';
  personId: number | null = null;
  dueDate: string | null = null;
  priority: AgendaItemPriority = 'medium';
  notify = true;

  persons: Player[] = [];
  personSearch = '';
  isPersonPickerOpen = false;
  saving = false;

  readonly priorities: { value: AgendaItemPriority; label: string }[] = [
    { value: 'low', label: TASK_PRIORITY_LABELS.low },
    { value: 'medium', label: TASK_PRIORITY_LABELS.medium },
    { value: 'high', label: TASK_PRIORITY_LABELS.high },
  ];
  readonly formatLongDate = formatLongDate;

  constructor(
    private db: DbService,
    private modalController: ModalController,
  ) {}

  get isEdit(): boolean {
    return !!this.task?.id;
  }

  get selectedPerson(): Player | undefined {
    return this.persons.find(p => p.id === this.personId);
  }

  get selectedPersonName(): string {
    return personName(this.selectedPerson) || personName(this.task?.responsible_person_id === this.personId ? this.task?.responsible_person : null);
  }

  get filteredPersons(): Player[] {
    const q = this.personSearch.trim().toLowerCase();
    if (!q) return this.persons;
    return this.persons.filter(p => personName(p).toLowerCase().includes(q));
  }

  /** The notification switch only matters when the person is new for this task. */
  get showNotifyToggle(): boolean {
    return needsAssignmentNotice(this.task?.responsible_person_id, this.personId);
  }

  async ngOnInit() {
    if (this.task) {
      this.title = this.task.title ?? '';
      this.description = this.task.description ?? '';
      this.personId = this.task.responsible_person_id ?? null;
      this.dueDate = this.task.due_date ?? null;
      this.priority = this.task.priority ?? 'medium';
    } else {
      this.title = this.presetTitle ?? '';
      this.personId = this.presetPersonId ?? null;
    }
    try {
      const players = await this.db.getPlayers(true);
      this.persons = players
        .filter(p => !p.left && !p.pending)
        .sort((a, b) => personName(a).localeCompare(personName(b), 'de'));
    } catch {
      this.persons = [];
    }
  }

  initials(p: { firstName?: string; lastName?: string } | null | undefined): string {
    return `${p?.firstName?.charAt(0) ?? ''}${p?.lastName?.charAt(0) ?? ''}`.toUpperCase();
  }

  selectPerson(id: number | null) {
    this.personId = id;
    this.isPersonPickerOpen = false;
    this.personSearch = '';
  }

  onDueDateChange(event: CustomEvent) {
    const raw = event.detail.value as string | null;
    this.dueDate = raw ? raw.split('T')[0] : null;
  }

  close() {
    this.modalController.dismiss(undefined, 'cancel');
  }

  async save() {
    const title = this.title.trim();
    if (!title) {
      Utils.showToast(translate('tasks.enterTitle'), 'warning');
      return;
    }
    if (this.saving) return;
    this.saving = true;
    const description = this.description.trim();
    const fields = {
      title,
      responsible_person_id: this.personId,
      due_date: this.dueDate,
      priority: this.priority,
    };
    const shouldNotify = this.notify && this.showNotifyToggle;
    try {
      let saved: Task;
      if (this.isEdit) {
        // null clears the column; undefined would be dropped from the update.
        saved = await this.db.updateTask(this.task!.id!, { ...fields, description: description || (null as unknown as string) });
      } else {
        saved = await this.db.addTask({
          ...fields,
          description: description || undefined,
          tenant_id: this.db.tenant().id,
          status: 'open',
          attendance_id: this.attendanceId ?? null,
          protocol_id: this.protocolId ?? null,
          agenda_item_id: this.agendaItemId ?? null,
        });
      }
      if (shouldNotify && saved?.id) {
        void this.db.notifyTeam({ type: 'task_assigned', taskId: saved.id });
      }
      Utils.showToast(this.isEdit ? translate('tasks.saved') : translate('tasks.created'));
      await this.modalController.dismiss(saved, 'saved');
    } catch (error) {
      console.error('Task save error:', error);
      Utils.showToast(translate('tasks.saveFailed'), 'danger');
    } finally {
      this.saving = false;
    }
  }
}
