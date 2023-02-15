import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { Role } from '../utilities/constants';
import { AuthObject } from '../utilities/interfaces';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(public db: DbService, private router: Router) { }

  async canActivate(
    _: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean> {
    await this.db.checkToken();
    const value: AuthObject = this.db.authenticationState.value;

    if (state.url === "/tabs/attendance") {
      return value.role === Role.ADMIN || value.role === Role.HELPER || value.role === Role.VIEWER;
    } else if (state.url === "/signout") {
      return value.role === Role.PLAYER;
    } else if (value.role === Role.HELPER) {
      this.router.navigateByUrl("/tabs/attendance");
      return false;
    }

    return value.role === Role.ADMIN || value.role === Role.VIEWER;
  }

}
