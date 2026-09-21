import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DbService } from 'src/app/services/db.service';
import { Utils } from 'src/app/utilities/Utils';
import { supabase } from 'src/app/services/base/supabase';

@Component({
  selector: 'app-terms',
  templateUrl: './terms.page.html',
  styleUrls: ['./terms.page.scss'],
  standalone: false
})
export class TermsPage implements OnInit {
  privacyAccepted = false;
  isAdminCreated = false;

  constructor(public db: DbService, private router: Router) {}

  async ngOnInit() {
    await this.db.checkToken();
    // If user already has terms_accepted_at they shouldn't be here — route away.
    if (this.db.user?.user_metadata?.['terms_accepted_at']) {
      this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser()?.role));
      return;
    }
    // Detect admin-created: user exists and has a tenant but was never self-registered.
    this.isAdminCreated = !!this.db.user && !!this.db.tenantUser();
  }

  async accept() {
    if (!this.privacyAccepted) {
      Utils.showToast('Bitte akzeptiere die Nutzungsbedingungen und Datenschutzerklärung.', 'danger');
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase.auth.updateUser({ data: { terms_accepted_at: now } });
    if (error) {
      Utils.showToast('Fehler beim Speichern. Bitte versuche es erneut.', 'danger');
      return;
    }
    if (this.db.user?.user_metadata) {
      this.db.user.user_metadata['terms_accepted_at'] = now;
    }
    this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser()?.role));
  }
}
