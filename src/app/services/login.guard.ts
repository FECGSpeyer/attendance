import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthObject } from '../utilities/interfaces';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class LoginGuard implements CanActivate {
  constructor(public db: DbService, private router: Router) { }

  async canActivate(): Promise<boolean> {
    await this.db.checkToken();
    const value: AuthObject = this.db.authenticationState.value;

    if (value.isHelper || value.isConductor || value.isPlayer) {
      this.router.navigateByUrl(value.isConductor ? "/tabs/player" : value.isHelper ? "/tabs/attendance" : "/tabs/signout");
      return false;
    }

    return true;
  }

}
