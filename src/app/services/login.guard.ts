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
      const url: string = Utils.getUrl(this.db.tenantUser().role);

      this.router.navigateByUrl(url);
      return false;
    }

    return true;
  }

}
