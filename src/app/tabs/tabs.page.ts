import { Component } from '@angular/core';
import { DbService } from '../services/db.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss']
})
export class TabsPage {
  public isConductor: boolean = false;

  constructor(
    private db: DbService,
  ) {
    this.initialize();
  }

  initialize() {
    this.db.authenticationState.subscribe((state: { isConductor: boolean, isPlayer: boolean }) => {
      this.isConductor = state.isConductor;
    });
  }

}
