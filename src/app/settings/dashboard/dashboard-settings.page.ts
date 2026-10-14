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
  'current-plan': 'Aktueller Ablaufplan',
  'my-tasks': 'Meine Aufgaben',
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

  /** Cards that can be configured: "Meine Aufgaben" only exists with Teamorganisation. */
  get shownCards(): DashboardCardConfig[] {
    return this.cards.filter(c => c.id !== 'my-tasks' || this.db.teamOrgEnabled());
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
    // Indices refer to the shown cards; hidden cards keep their place at the end.
    const shown = [...this.shownCards];
    const hidden = this.cards.filter(c => !shown.includes(c));
    const [moved] = shown.splice(from, 1);
    shown.splice(to, 0, moved);
    this.cards = [...shown, ...hidden];
    this.db.setDashboardCardConfig(this.cards);
  }
}
