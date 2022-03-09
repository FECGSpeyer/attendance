import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(public db: DbService, private router: Router) { }

  canActivate(
    _: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): boolean {
    const value: { isConductor: boolean, isPlayer: boolean } = this.db.authenticationState.value;

    if (state.url === "/login") {
      if (value.isConductor || value.isPlayer) {
        this.router.navigateByUrl(value.isConductor ? "/tabs/player" : "/tabs/attendance");
        return false;
      } else {
        return true;
      }
    }

    if (state.url === "/tabs/attendance") {
      return value.isConductor || value.isPlayer;
    } else if (!value.isConductor) {
      this.router.navigateByUrl("/tabs/attendance");
      return false;
    }

    return value.isConductor;
  }

}
