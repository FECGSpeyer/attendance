import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
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
    const value: { isConductor: boolean, isPlayer: boolean } = this.db.authenticationState.value;

    if (state.url === "/tabs/attendance") {
      return value.isConductor || value.isPlayer;
    } else if (!value.isConductor) {
      this.router.navigateByUrl("/tabs/attendance");
      return false;
    }

    return value.isConductor;
  }

}
