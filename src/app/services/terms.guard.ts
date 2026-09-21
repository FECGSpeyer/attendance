import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { DbService } from './db.service';

@Injectable({ providedIn: 'root' })
export class TermsGuard implements CanActivate {
  constructor(private db: DbService, private router: Router) {}

  async canActivate(): Promise<boolean> {
    await this.db.checkToken();
    if (!this.db.user) {
      return true; // AuthGuard handles unauthenticated users
    }
    if (!this.db.user.user_metadata?.['terms_accepted_at']) {
      this.router.navigateByUrl('/terms');
      return false;
    }
    return true;
  }
}
