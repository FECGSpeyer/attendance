import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Utils } from '../utilities/Utils';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class RegisterGuard  {
  constructor(public db: DbService, private router: Router) { }

  async canActivate(): Promise<boolean> {
    await this.db.checkToken();

    if (this.db.user && Boolean(this.db.tenants()?.length === 0)) {
      return true;
    } else if (this.db.tenantUser()) {
      const url: string = Utils.getUrl(this.db.tenantUser().role);
      this.router.navigateByUrl(url);
      return false;
    } else {
      this.router.navigateByUrl("/login");
      return false;
    }
  }

}
