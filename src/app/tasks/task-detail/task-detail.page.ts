import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, NavController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { AgendaItemPriority, Person, Task, TaskStatus } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-task-detail',
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None
})
export class TaskDetailPage implements OnInit {
  public task: Task;
  public conductors: Person[] = [];
  public isNew = false;
  private taskId: string;
  private today: string;

  readonly statusOptions: { value: TaskStatus; label: string }[] = [
    { value: 'open', label: 'Offen' },
    { value: 'in_progress', label: 'In Bearbeitung' },
    { value: 'completed', label: 'Erledigt' },
  ];

  readonly priorityOptions: { value: AgendaItemPriority; label: string }[] = [
    { value: 'high', label: 'Hoch' },
    { value: 'medium', label: 'Mittel' },
    { value: 'low', label: 'Niedrig' },
  ];

  constructor(
    private db: DbService,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private navController: NavController,
  ) {
    const now = new Date();
    this.today = now.toISOString().split('T')[0];
  }

  async ngOnInit() {
    this.taskId = this.route.snapshot.params['id'];
    this.isNew = this.taskId === 'new';

    const allConductors = await this.db.getConductors(true);
    this.conductors = allConductors.filter((c: Person) => !c.left);

    if (this.isNew) {
      this.task = {
        tenant_id: this.db.tenant().id,
        title: '',
        status: 'open',
        priority: 'medium',
      };
    } else {
      this.task = await this.db.getTask(this.taskId);
    }
  }

  isOverdue(): boolean {
    return this.task?.status !== 'completed' && !!this.task?.due_date && this.task.due_date < this.today;
  }

  onTaskDateChange(event: CustomEvent, modal: { dismiss: () => Promise<boolean> }) {
    const raw = event.detail.value;
    this.task.due_date = raw ? (raw as string).split('T')[0] : null;
    if (!raw) {
      modal.dismiss();
    }
  }

  async deleteTask() {
    const alert = await this.alertController.create({
      header: 'Aufgabe wirklich löschen?',
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Löschen',
          role: 'destructive',
          handler: async () => {
            try {
              await this.db.deleteTask(this.taskId);
              Utils.showToast('Gelöscht');
              this.navController.navigateBack('/tabs/settings/team-organization');
            } catch (error) {
              console.error('Delete error:', error);
              Utils.showToast('Löschen fehlgeschlagen', 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async save() {
    if (!this.task.title?.trim()) {
      Utils.showToast('Bitte einen Titel eingeben', 'warning');
      return;
    }
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      if (this.isNew) {
        const created = await this.db.addTask(this.task);
        this.taskId = created.id;
        this.isNew = false;
        this.task = created;
      } else {
        this.task = await this.db.updateTask(this.taskId, this.task);
      }
      Utils.showToast('Gespeichert');
    } catch (error) {
      console.error('Task save error:', error);
      Utils.showToast('Aufgabe konnte nicht gespeichert werden', 'danger');
    } finally {
      await loading.dismiss();
    }
  }
}
