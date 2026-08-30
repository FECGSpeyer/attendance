import { Component, OnInit } from '@angular/core';
import { DbService } from '../../services/db.service';
import { DashboardCardConfig, DashboardCardId } from '../../utilities/interfaces';

const CARD_LABELS: Record<DashboardCardId, string> = {
  'birthdays': 'Geburtstage',
  'next-event': 'Termine',
  'member-changes': 'Mitglieder-Veränderungen',
  'absences': 'Abwesenheiten & Pausierungen',
  'critical-persons': 'Problemfälle',
  'current-songs': 'Aktuelle Werke',
};

@Component({
  selector: 'app-dashboard-settings',
  templateUrl: './dashboard-settings.page.html',
  styleUrls: ['./dashboard-settings.page.scss'],
  standalone: false,
})
export class DashboardSettingsPage implements OnInit {
  public showDashboardTab = false;
  public cards: DashboardCardConfig[] = [];
  public isReordering = false;
  public readonly cardLabels = CARD_LABELS;

  constructor(public db: DbService) {}

  ngOnInit() {
    this.showDashboardTab = this.db.getShowDashboardTab();
    this.cards = this.db.getDashboardCardConfig();
  }

  async onTabToggle() {
    await this.db.setShowDashboardTab(this.showDashboardTab);
  }

  async onVisibilityToggle() {
    await this.db.setDashboardCardConfig(this.cards);
  }

  async resetCards() {
    this.cards = await this.db.resetDashboardCardConfig();
  }

  handleReorder(event: any) {
    const from = event.detail.from;
    const to = event.detail.to;
    event.detail.complete(true);
    if (from === to) return;
    const [moved] = this.cards.splice(from, 1);
    this.cards.splice(to, 0, moved);
    this.cards = [...this.cards];
    this.db.setDashboardCardConfig(this.cards);
  }
}
