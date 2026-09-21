import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { AgendaItem, AgendaItemPriority, AgendaItemStatus } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-agenda-item-list',
  templateUrl: './agenda-item-list.page.html',
  styleUrls: ['./agenda-item-list.page.scss'],
  standalone: false
})
export class AgendaItemListPage implements OnInit {
  public agendaItems: AgendaItem[] = [];
  public isLoading = true;

  constructor(
    private db: DbService,
    private alertController: AlertController,
  ) {}

  async ngOnInit() {
    await this.loadItems();
  }

  async loadItems() {
    this.isLoading = true;
    try {
      this.agendaItems = await this.db.getAgendaItems();
      this.agendaItems.sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        const priorityOrder: Record<AgendaItemPriority, number> = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    } catch (e) {
      console.error('loadItems error', e);
    }
    this.isLoading = false;
  }

  async handleRefresh(event: any) {
    await this.loadItems();
    event.target.complete();
  }

  trackById = (_index: number, item: AgendaItem): string => item.id;

  async addItem() {
    const alert = await this.alertController.create({
      header: 'Tagesordnungspunkt hinzufügen',
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
            await this.db.addAgendaItem({
              title: data.title.trim(),
              status: 'open' as AgendaItemStatus,
              priority: 'medium' as AgendaItemPriority,
              tenant_id: this.db.tenant().id,
            });
            await this.loadItems();
            await loading.dismiss();
          }
        }
      ]
    });
    await alert.present();
  }

  async removeItem(id: string, slider: any) {
    slider.close();
    const alert = await this.alertController.create({
      header: 'Tagesordnungspunkt wirklich entfernen?',
      buttons: [
        { text: 'Abbrechen' },
        {
          text: 'Entfernen',
          role: 'destructive',
          handler: async () => {
            await this.db.deleteAgendaItem(id);
            await this.loadItems();
          }
        }
      ]
    });
    await alert.present();
  }

  getStatusColor(status: AgendaItemStatus): string {
    switch (status) {
      case 'completed': return 'success';
      case 'postponed': return 'warning';
      default: return 'primary';
    }
  }

  getStatusLabel(status: AgendaItemStatus): string {
    switch (status) {
      case 'completed': return 'Erledigt';
      case 'postponed': return 'Verschoben';
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

  getPriorityLabel(priority: AgendaItemPriority): string {
    switch (priority) {
      case 'high': return 'Hoch';
      case 'low': return 'Niedrig';
      default: return 'Mittel';
    }
  }
}
