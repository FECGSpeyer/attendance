import { Component, OnInit } from '@angular/core';
import { DbService } from 'src/app/services/db.service';
import { AgendaItem, Protocol, Task } from 'src/app/utilities/interfaces';

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
  private today: string;

  constructor(private db: DbService) {
    const now = new Date();
    this.today = now.toISOString().split('T')[0];
  }

  async ngOnInit() {
    await this.loadAll();
  }

  async loadAll() {
    this.isLoading = true;
    const [tasks, agendaItems, protocols] = await Promise.all([
      this.db.getTasks(),
      this.db.getAgendaItems(),
      this.db.getProtocols(),
    ]);
    this.tasks = tasks.filter(t => t.status !== 'completed').slice(0, 10);
    this.agendaItems = agendaItems.filter(a => a.status !== 'completed').slice(0, 10);
    this.protocols = protocols.slice(0, 10);
    this.isLoading = false;
  }

  async handleRefresh(event: any) {
    await this.loadAll();
    event.target.complete();
  }

  onSegmentChange(event: any) {
    this.activeSegment = event.detail.value;
  }

  isOverdue(task: Task): boolean {
    return task.status !== 'completed' && !!task.due_date && task.due_date < this.today;
  }

  getTaskStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'warning';
      default: return 'primary';
    }
  }

  getTaskStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'Erledigt';
      case 'in_progress': return 'In Bearbeitung';
      default: return 'Offen';
    }
  }

  getAgendaStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'success';
      case 'postponed': return 'warning';
      default: return 'primary';
    }
  }

  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return 'danger';
      case 'low': return 'medium';
      default: return 'warning';
    }
  }
}
