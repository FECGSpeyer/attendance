import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Role } from '../utilities/constants';
import { AuthObject } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class LoginGuard  {
  constructor(public db: DbService, private router: Router) { }

  async canActivate(): Promise<boolean> {
    await this.db.checkToken();
    const value: AuthObject = this.db.authenticationState.value;

    if (value.role !== Role.NONE) {
      const url: string = Utils.getUrl(value.role);

      this.router.navigateByUrl(url);
      return false;
    }

    return true;
  }

}
