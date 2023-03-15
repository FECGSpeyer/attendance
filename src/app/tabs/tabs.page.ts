import { Component } from '@angular/core';
import { environment } from 'src/environments/environment.prod';
import { DbService } from '../services/db.service';
import { Role } from '../utilities/constants';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss']
})
export class TabsPage {
  public isConductor: boolean = false;
  public isChoir: boolean = false;

  constructor(
    private db: DbService,
  ) {
    this.initialize();
  }

  initialize() {
    this.isChoir = environment.isChoir;
    console.log("subscribed");
    this.db.authenticationState.subscribe((state: { role: Role }) => {
      this.isConductor = state.role === Role.ADMIN || state.role === Role.VIEWER;
      console.log("changed");
    });
  }

}
