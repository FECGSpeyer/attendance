import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { DbService } from 'src/app/services/db.service';
import { AgendaItem, AgendaItemAttendance, AgendaItemPriority, AgendaItemStatus, Person, Task } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-agenda-item-detail',
  templateUrl: './agenda-item-detail.page.html',
  styleUrls: ['./agenda-item-detail.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None
})
export class AgendaItemDetailPage implements OnInit {
  public item: AgendaItem;
  public linkedAttendances: AgendaItemAttendance[] = [];
  public tasks: Task[] = [];
  public conductors: Person[] = [];
  public isNew = false;
  private itemId: string;

  readonly statusOptions: { value: AgendaItemStatus; label: string }[] = [
    { value: 'open', label: 'Offen' },
    { value: 'in_progress' as any, label: 'In Bearbeitung' },
    { value: 'postponed', label: 'Verschoben' },
    { value: 'completed', label: 'Erledigt' },
  ];

  readonly priorityOptions: { value: AgendaItemPriority; label: string }[] = [
    { value: 'high', label: 'Hoch' },
    { value: 'medium', label: 'Mittel' },
    { value: 'low', label: 'Niedrig' },
  ];

  constructor(private db: DbService) {}

  async ngOnInit() {
    const segments = window.location.pathname.split('/');
    this.itemId = segments[segments.length - 1];
    this.isNew = this.itemId === 'new';

    const [conductors] = await Promise.all([
      this.db.getConductors(true),
    ]);
    this.conductors = conductors.filter((c: Person) => !c.left);

    if (this.isNew) {
      this.item = {
        tenant_id: this.db.tenant().id,
        title: '',
        status: 'open',
        priority: 'medium',
      };
    } else {
      await this.loadItem();
    }
  }

  async loadItem() {
    const [item, linked, tasks] = await Promise.all([
      this.db.getAgendaItem(this.itemId),
      this.db.getLinkedAttendancesForAgendaItem(this.itemId),
      this.db.getTasksForAgendaItem(this.itemId),
    ]);
    this.item = item;
    this.linkedAttendances = linked;
    this.tasks = tasks;
  }

  async save() {
    if (!this.item.title?.trim()) {
      Utils.showToast('Bitte einen Titel eingeben', 'warning');
      return;
    }
    const loading = await Utils.getLoadingElement();
    await loading.present();
    if (this.isNew) {
      const created = await this.db.addAgendaItem(this.item);
      this.itemId = created.id;
      this.isNew = false;
      this.item = created;
    } else {
      this.item = await this.db.updateAgendaItem(this.itemId, this.item);
    }
    await loading.dismiss();
    Utils.showToast('Gespeichert');
  }

  getStatusColor(status: AgendaItemStatus): string {
    switch (status) {
      case 'completed': return 'success';
      case 'postponed': return 'warning';
      default: return 'primary';
    }
  }

  getPriorityColor(priority: AgendaItemPriority): string {
    switch (priority) {
      case 'high': return 'danger';
      case 'low': return 'medium';
      default: return 'warning';
    }
  }

  getTaskStatusLabel(status: string): string {
    switch (status) {
      case 'completed': return 'Erledigt';
      case 'in_progress': return 'In Bearbeitung';
      default: return 'Offen';
    }
  }
}
