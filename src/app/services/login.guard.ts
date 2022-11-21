import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class LoginGuard implements CanActivate {
  constructor(public db: DbService, private router: Router) { }

  async canActivate(): Promise<boolean> {
    await this.db.checkToken();
    const value: { isConductor: boolean, isPlayer: boolean } = this.db.authenticationState.value;

    if (value.isPlayer || value.isConductor) {
      this.router.navigateByUrl(value.isConductor ? "/tabs/player" : "/tabs/attendance");
      return false;
    }

    return true;
  }

}
