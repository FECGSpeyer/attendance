import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { AgendaItemPriority, Task, TaskStatus } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-task-list',
  templateUrl: './task-list.page.html',
  styleUrls: ['./task-list.page.scss'],
  standalone: false
})
export class TaskListPage implements OnInit {
  public tasks: Task[] = [];
  public filteredTasks: Task[] = [];
  public activeSegment: string = 'open';
  public isLoading = true;
  private today: string;

  constructor(
    private db: DbService,
    private alertController: AlertController,
  ) {
    const now = new Date();
    this.today = now.toISOString().split('T')[0];
  }

  async ngOnInit() {
    await this.loadTasks();
  }

  async loadTasks() {
    this.isLoading = true;
    try {
      this.tasks = await this.db.getTasks();
      this.filterTasks();
    } catch (e) {
      console.error('loadTasks error', e);
    }
    this.isLoading = false;
  }

  filterTasks() {
    if (this.activeSegment === 'all') {
      this.filteredTasks = this.tasks;
    } else if (this.activeSegment === 'open') {
      this.filteredTasks = this.tasks.filter(t => t.status === 'open');
    } else if (this.activeSegment === 'in_progress') {
      this.filteredTasks = this.tasks.filter(t => t.status === 'in_progress');
    } else if (this.activeSegment === 'completed') {
      this.filteredTasks = this.tasks.filter(t => t.status === 'completed');
    }
  }

  onSegmentChange(event: any) {
    this.activeSegment = event.detail.value;
    this.filterTasks();
  }

  async handleRefresh(event: any) {
    await this.loadTasks();
    event.target.complete();
  }

  trackById = (_index: number, task: Task): string => task.id;

  isOverdue(task: Task): boolean {
    return task.status !== 'completed' && !!task.due_date && task.due_date < this.today;
  }

  async addTask() {
    const alert = await this.alertController.create({
      header: 'Aufgabe hinzufügen',
      inputs: [
        { name: 'title', type: 'text', placeholder: 'Titel' },
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Hinzufügen',
          handler: async (data) => {
            if (!data.title?.trim()) return;
            const loading = await Utils.getLoadingElement();
            await loading.present();
            await this.db.addTask({
              title: data.title.trim(),
              status: 'open' as TaskStatus,
              priority: 'medium' as AgendaItemPriority,
              tenant_id: this.db.tenant().id,
            });
            await this.loadTasks();
            await loading.dismiss();
          }
        }
      ]
    });
    await alert.present();
  }

  async removeTask(id: string, slider: any) {
    slider.close();
    const alert = await this.alertController.create({
      header: 'Aufgabe wirklich entfernen?',
      buttons: [
        { text: 'Abbrechen' },
        {
          text: 'Entfernen',
          role: 'destructive',
          handler: async () => {
            await this.db.deleteTask(id);
            await this.loadTasks();
          }
        }
      ]
    });
    await alert.present();
  }

  getStatusColor(status: TaskStatus): string {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'warning';
      default: return 'primary';
    }
  }

  getStatusLabel(status: TaskStatus): string {
    switch (status) {
      case 'completed': return 'Erledigt';
      case 'in_progress': return 'In Bearbeitung';
      default: return 'Offen';
    }
  }

  getPriorityColor(priority: AgendaItemPriority): string {
    switch (priority) {
      case 'high': return 'danger';
      case 'low': return 'medium';
      default: return 'warning';
    }
  }
}
