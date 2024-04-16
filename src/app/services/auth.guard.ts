import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Role } from '../utilities/constants';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard  {

  constructor(public db: DbService) { }

  async canActivate(
    _: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean> {
    await this.db.checkToken();
    const role: Role = this.db.tenantUser().role;

    if (state.url === "/tabs/attendance") {
      return role === Role.ADMIN || role === Role.HELPER || role === Role.VIEWER;
    } else if (state.url === "/tabs/signout") {
      return role === Role.HELPER;
    } else if (state.url === "/signout") {
      return role === Role.PLAYER;
    }

    return role === Role.ADMIN || role === Role.VIEWER;
  }

}
