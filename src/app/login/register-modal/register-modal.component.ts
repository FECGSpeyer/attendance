import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Utils } from '../../utilities/Utils';
import { DbService } from '../../services/db.service';
import { LegalModalComponent } from '../legal-modal/legal-modal.component';

@Component({
  selector: 'app-register-modal',
  templateUrl: './register-modal.component.html',
  styleUrls: ['./register-modal.component.scss'],
  standalone: false,
})
export class RegisterModalComponent {
  email = '';
  password = '';
  passwordConfirm = '';
  privacyAccepted = false;
  showPassword = false;
  submitting = false;

  constructor(private modalController: ModalController, private db: DbService) {}

  get canSubmit(): boolean {
    return (
      !!this.email &&
      !!this.password &&
      !!this.passwordConfirm &&
      this.privacyAccepted
    );
  }

  async openPrivacy(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const modal = await this.modalController.create({ component: LegalModalComponent });
    await modal.present();
  }

  async submit() {
    if (this.submitting) {
      return;
    }

    if (!Utils.validateEmail(this.email)) {
      Utils.showToast('Ungültige E-Mail-Adresse', 'danger');
      return;
    }

    if (this.password !== this.passwordConfirm) {
      Utils.showToast('Passwörter stimmen nicht überein', 'danger');
      return;
    }

    if (this.password.length < 6) {
      Utils.showToast('Passwort muss mindestens 6 Zeichen lang sein', 'danger');
      return;
    }

    if (!this.privacyAccepted) {
      Utils.showToast('Bitte stimme der Datenschutzerklärung zu', 'danger');
      return;
    }

    // Run the backend registration here so the modal stays open (with the
    // entered data intact) if it fails. We only dismiss on success.
    this.submitting = true;
    const loading = await Utils.getLoadingElement(0, 'Registrierung läuft...');
    await loading.present();
    try {
      const res = await this.db.register(this.email, this.password);
      if (!res) {
        // db.register already surfaced the error toast. Keep the modal open.
        return;
      }
      await this.modalController.dismiss({ success: true });
    } catch (e: any) {
      // e.g. "Deine E-Mail-Adresse existiert bereits. Bitte melde dich an."
      Utils.showToast(e?.message ?? 'Fehler beim Registrieren', 'danger');
    } finally {
      await loading.dismiss();
      this.submitting = false;
    }
  }

  async dismiss() {
    if (this.submitting) {
      return;
    }
    await this.modalController.dismiss();
  }
}
