import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
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
      return value.isConductor || value.isHelper;
    } else if (state.url === "/signout") {
      return value.isPlayer;
    } else if (value.isHelper) {
      this.router.navigateByUrl("/tabs/attendance");
      return false;
    }

    return value.isConductor;
  }

}
