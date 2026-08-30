import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Role } from '../utilities/constants';
import { Utils } from '../utilities/Utils';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class LoginGuard  {
  constructor(public db: DbService, private router: Router) { }

  async canActivate(): Promise<boolean> {
    await this.db.checkToken();

    if (this.db.tenantUser()) {
      const role = this.db.tenantUser().role;
      const useDashboard =
        this.db.showDashboardTabSignal() &&
        [Role.ADMIN, Role.RESPONSIBLE].includes(role);
      const url = useDashboard ? '/tabs/home-dashboard' : Utils.getUrl(role);
      this.router.navigateByUrl(url);
      return false;
    }

    return true;
  }

}
