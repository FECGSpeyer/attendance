import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { AgendaItem, AgendaItemPriority, AgendaItemStatus, Protocol, Task, TaskStatus } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

const PRIORITY_ORDER: Record<AgendaItemPriority, number> = { high: 0, medium: 1, low: 2 };

@Component({
  selector: 'app-team-organization',
  templateUrl: './team-organization.page.html',
  styleUrls: ['./team-organization.page.scss'],
  standalone: false
})
export class TeamOrganizationPage implements OnInit {
  public activeSegment = 'tasks';
  public tasks: Task[] = [];
  public agendaItems: AgendaItem[] = [];
  public protocols: Protocol[] = [];
  public isLoading = true;
  public showCompletedTasks = false;
  public showCompletedAgenda = false;
  private today: string;
  private initialized = false;

  constructor(
    private db: DbService,
    private alertController: AlertController,
  ) {
    const now = new Date();
    this.today = now.toISOString().split('T')[0];
  }

  async ngOnInit() {
    await this.loadAll();
    this.initialized = true;
  }

  async ionViewWillEnter() {
    if (this.initialized) {
      await this.loadAll(false);
    }
  }

  async loadAll(showSkeleton = true) {
    if (showSkeleton) {
      this.isLoading = true;
    }
    try {
      const [tasks, agendaItems, protocols] = await Promise.all([
        this.db.getTasks(),
        this.db.getAgendaItems(),
        this.db.getProtocols(),
      ]);
      this.tasks = tasks.sort((a, b) => {
        const completedDiff = Number(a.status === 'completed') - Number(b.status === 'completed');
        if (completedDiff !== 0) return completedDiff;
        if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
        if (!!a.due_date !== !!b.due_date) return a.due_date ? -1 : 1;
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      });
      this.agendaItems = agendaItems.sort((a, b) => {
        const completedDiff = Number(a.status === 'completed') - Number(b.status === 'completed');
        if (completedDiff !== 0) return completedDiff;
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      });
      this.protocols = protocols.slice(0, 10);
    } catch (e) {
      console.error('loadAll error', e);
    }
    this.isLoading = false;
  }

  async handleRefresh(event: any) {
    await this.loadAll(false);
    event.target.complete();
  }

  onSegmentChange(event: any) {
    this.activeSegment = event.detail.value;
  }

  get visibleTasks(): Task[] {
    return this.showCompletedTasks ? this.tasks : this.tasks.filter(t => t.status !== 'completed');
  }

  get completedTaskCount(): number {
    return this.tasks.filter(t => t.status === 'completed').length;
  }

  get visibleAgendaItems(): AgendaItem[] {
    return this.showCompletedAgenda ? this.agendaItems : this.agendaItems.filter(a => a.status !== 'completed');
  }

  get completedAgendaCount(): number {
    return this.agendaItems.filter(a => a.status === 'completed').length;
  }

  async addTask() {
    await this.promptTitle('Aufgabe hinzufügen', async (title) => {
      await this.db.addTask({
        title,
        status: 'open' as TaskStatus,
        priority: 'medium' as AgendaItemPriority,
        tenant_id: this.db.tenant().id,
      });
    }, 'Aufgabe konnte nicht angelegt werden');
  }

  async addAgendaItem() {
    await this.promptTitle('Tagesordnungspunkt hinzufügen', async (title) => {
      await this.db.addAgendaItem({
        title,
        status: 'open' as AgendaItemStatus,
        priority: 'medium' as AgendaItemPriority,
        tenant_id: this.db.tenant().id,
      });
    }, 'Tagesordnungspunkt konnte nicht angelegt werden');
  }

  async removeTask(task: Task, slider: any) {
    slider?.close();
    await this.confirmDelete('Aufgabe wirklich löschen?', () => this.db.deleteTask(task.id));
  }

  async removeAgendaItem(item: AgendaItem, slider: any) {
    slider?.close();
    await this.confirmDelete('Tagesordnungspunkt wirklich löschen?', () => this.db.deleteAgendaItem(item.id));
  }

  private async promptTitle(header: string, create: (title: string) => Promise<void>, errorMessage: string) {
    const alert = await this.alertController.create({
      header,
      inputs: [
        { name: 'title', type: 'text', placeholder: 'Titel' },
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Hinzufügen',
          handler: async (data) => {
            const title = data.title?.trim();
            if (!title) return false;
            const loading = await Utils.getLoadingElement();
            await loading.present();
            try {
              await create(title);
              await this.loadAll(false);
            } catch (error) {
              console.error(errorMessage, error);
              Utils.showToast(errorMessage, 'danger');
            } finally {
              await loading.dismiss();
            }
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  private async confirmDelete(header: string, remove: () => Promise<void>) {
    const alert = await this.alertController.create({
      header,
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Löschen',
          role: 'destructive',
          handler: async () => {
            try {
              await remove();
              Utils.showToast('Gelöscht');
              await this.loadAll(false);
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

  isOverdue(task: Task | AgendaItem): boolean {
    return task.status !== 'completed' && !!task.due_date && task.due_date < this.today;
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'warning';
      case 'postponed': return 'medium';
      default: return 'primary';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'Erledigt';
      case 'in_progress': return 'In Bearbeitung';
      case 'postponed': return 'Verschoben';
      default: return 'Offen';
    }
  }

  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return 'danger';
      case 'low': return 'medium';
      default: return 'warning';
    }
  }

  getPriorityLabel(priority: string): string {
    switch (priority) {
      case 'high': return 'Hoch';
      case 'low': return 'Niedrig';
      default: return 'Mittel';
    }
  }
}
