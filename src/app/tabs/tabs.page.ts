import { Component } from '@angular/core';
import { DbService } from '../services/db.service';
import { AttendanceType, Role } from '../utilities/constants';
import { TenantService } from '../services/tenant.service';

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
    private tenantService: TenantService,
  ) {
    this.initialize();
  }

  initialize() {
    this.db.authenticationState.subscribe((state: { role: Role }) => {
      this.isConductor = state.role === Role.ADMIN || state.role === Role.VIEWER;
      this.isChoir = this.tenantService.tenant?.type === AttendanceType.CHOIR;
    });
  }

}
