import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { LegalModalComponent } from 'src/app/login/legal-modal/legal-modal.component';
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

  constructor(public db: DbService, private router: Router, private modalController: ModalController) {}

  async ngOnInit() {
    await this.db.checkToken();
    if (this.db.user?.user_metadata?.['terms_accepted_at']) {
      this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser()?.role));
      return;
    }
  }

  async openPrivacy(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const modal = await this.modalController.create({ component: LegalModalComponent });
    await modal.present();
  }

  async accept() {
    if (!this.privacyAccepted) {
      Utils.showToast('Bitte akzeptiere die Nutzungsbedingungen und Datenschutzerklärung.', 'danger');
      return;
    }
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      await supabase.auth.signOut();
      this.router.navigateByUrl('/login');
      Utils.showToast('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.', 'warning', 4000);
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
