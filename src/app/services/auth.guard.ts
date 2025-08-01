import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Role } from '../utilities/constants';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard  {

  constructor(
    public db: DbService,
    private router: Router
  ) { }

  async canActivate(
    _: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean> {
    await this.db.checkToken();
    const role = this.db.tenantUser()?.role;

    if (!role) {
      this.router.navigateByUrl("/login");
      return false;
    }

    if (state.url === "/tabs/attendance") {
      return role === Role.ADMIN || role === Role.HELPER || role === Role.VIEWER || role === Role.RESPONSIBLE;
    } else if (state.url === "/tabs/signout") {
      return role === Role.HELPER;
    } else if (state.url === "/signout") {
      return role === Role.PLAYER;
    }

    return role === Role.ADMIN || role === Role.RESPONSIBLE || role === Role.VIEWER;
  }

}
