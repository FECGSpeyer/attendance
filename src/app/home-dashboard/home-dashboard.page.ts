import { Component, QueryList, ViewChildren, effect } from '@angular/core';
import { Router } from '@angular/router';
import { DbService } from '../services/db.service';
import { DashboardCardConfig, DEFAULT_DASHBOARD_CARDS } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';
import { BirthdaysCardComponent } from './components/birthdays-card/birthdays-card.component';
import { NextEventCardComponent } from './components/next-event-card/next-event-card.component';
import { MemberChangesCardComponent } from './components/member-changes-card/member-changes-card.component';
import { AbsencesCardComponent } from './components/absences-card/absences-card.component';
import { CriticalPersonsCardComponent } from './components/critical-persons-card/critical-persons-card.component';

@Component({
  selector: 'app-home-dashboard',
  templateUrl: './home-dashboard.page.html',
  styleUrls: ['./home-dashboard.page.scss'],
  standalone: false,
})
export class HomeDashboardPage {
  public cards: DashboardCardConfig[] = [...DEFAULT_DASHBOARD_CARDS];

  @ViewChildren(BirthdaysCardComponent) birthdaysCards!: QueryList<BirthdaysCardComponent>;
  @ViewChildren(NextEventCardComponent) nextEventCards!: QueryList<NextEventCardComponent>;
  @ViewChildren(MemberChangesCardComponent) memberChangesCards!: QueryList<MemberChangesCardComponent>;
  @ViewChildren(AbsencesCardComponent) absencesCards!: QueryList<AbsencesCardComponent>;
  @ViewChildren(CriticalPersonsCardComponent) criticalPersonsCards!: QueryList<CriticalPersonsCardComponent>;

  constructor(public db: DbService, private router: Router) {
    effect(() => {
      if (this.db.tenant()) {
        this.cards = this.db.getDashboardCardConfig();
      }
    });
  }

  ionViewWillEnter() {
    this.cards = this.db.getDashboardCardConfig();
  }

  async refreshAllCards() {
    const reloads: Promise<void>[] = [
      ...this.birthdaysCards.map(c => c.load()),
      ...this.nextEventCards.map(c => c.load()),
      ...this.memberChangesCards.map(c => c.load()),
      ...this.absencesCards.map(c => c.load()),
      ...this.criticalPersonsCards.map(c => c.load()),
    ];
    await Promise.all(reloads);
  }

  get visibleCards(): DashboardCardConfig[] {
    return this.cards.filter(c => c.visible);
  }

  async onTenantChange(tenantId: number): Promise<void> {
    if (this.db.tenant().id === tenantId) { return; }
    const loading = await Utils.getLoadingElement();
    await loading.present();
    await this.db.setTenant(tenantId);
    await this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
    await loading.dismiss();
  }
}
