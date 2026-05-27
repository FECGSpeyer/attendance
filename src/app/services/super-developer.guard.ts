import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class SuperDeveloperGuard {

  constructor(
    private db: DbService,
    private router: Router,
  ) { }

  async canActivate(): Promise<boolean> {
    await this.db.checkToken();
    if (this.db.isSuperDeveloper()) {
      return true;
    }
    this.router.navigateByUrl('/tabs/player');
    return false;
  }
}
