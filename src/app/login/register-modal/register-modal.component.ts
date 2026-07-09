import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Utils } from '../../utilities/Utils';
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

  constructor(private modalController: ModalController) {}

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

    await this.modalController.dismiss({
      email: this.email,
      password: this.password,
    });
  }

  async dismiss() {
    await this.modalController.dismiss();
  }
}
