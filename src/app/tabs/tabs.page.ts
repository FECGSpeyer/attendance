import { Component, effect } from '@angular/core';
import { DbService } from '../services/db.service';
import { AttendanceType, Role } from '../utilities/constants';

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
    this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.VIEWER || this.db.tenantUser().role === Role.CONDUCTOR;
    this.isChoir = this.db.tenant().type === AttendanceType.CHOIR;

    effect(() => {
      this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.VIEWER || this.db.tenantUser().role === Role.CONDUCTOR;
      this.isChoir = this.db.tenant().type === AttendanceType.CHOIR;
    });
  }

}
