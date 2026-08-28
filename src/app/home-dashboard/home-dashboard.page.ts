import { Component, OnInit } from '@angular/core';
import { DbService } from '../services/db.service';
import { DashboardCardConfig } from '../utilities/interfaces';

@Component({
  selector: 'app-home-dashboard',
  templateUrl: './home-dashboard.page.html',
  styleUrls: ['./home-dashboard.page.scss'],
  standalone: false,
})
export class HomeDashboardPage implements OnInit {
  public cards: DashboardCardConfig[] = [];

  constructor(public db: DbService) {}

  ngOnInit() {
    this.cards = this.db.getDashboardCardConfig();
  }

  ionViewWillEnter() {
    this.cards = this.db.getDashboardCardConfig();
  }

  get visibleCards(): DashboardCardConfig[] {
    return this.cards.filter(c => c.visible);
  }
}
