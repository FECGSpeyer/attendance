import { Component, OnDestroy } from '@angular/core';
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
export class RegisterModalComponent implements OnDestroy {
  email = '';
  password = '';
  passwordConfirm = '';
  privacyAccepted = false;
  showPassword = false;
  submitting = false;
  /** Passwordless email-OTP (code) registration state. */
  otpMode = false;
  otpSent = false;
  otpCode = '';
  resendCooldown = 0;
  private cooldownTimer: any = null;

  constructor(private modalController: ModalController, private db: DbService) {}

  ngOnDestroy() {
    this.clearCooldown();
  }

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

  /** Route ngSubmit/Enter to the action appropriate for the current mode. */
  onSubmit() {
    if (this.otpMode) {
      if (this.otpSent) {
        this.verifyCode();
      } else {
        this.requestCode();
      }
      return;
    }
    this.submit();
  }

  enterOtpMode() {
    this.otpMode = true;
    this.otpSent = false;
    this.otpCode = '';
  }

  exitOtpMode() {
    this.otpMode = false;
    this.otpSent = false;
    this.otpCode = '';
    this.clearCooldown();
  }

  /** Segment handler: switch between password and email-code (OTP) registration. */
  onModeChange(ev: CustomEvent) {
    if (this.submitting) {
      return;
    }
    if (ev.detail.value === 'otp') {
      this.enterOtpMode();
    } else {
      this.exitOtpMode();
    }
  }

  async requestCode() {
    if (this.submitting) {
      return;
    }
    if (!Utils.validateEmail(this.email)) {
      Utils.showToast('Ungültige E-Mail-Adresse', 'danger');
      return;
    }
    if (!this.privacyAccepted) {
      Utils.showToast('Bitte stimme der Datenschutzerklärung zu', 'danger');
      return;
    }
    this.submitting = true;
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      // Registration surface: allow creating a new account.
      const ok = await this.db.sendEmailOtp(this.email.toLowerCase().trim(), true);
      if (ok) {
        this.otpSent = true;
        this.startResendCooldown();
      }
    } finally {
      await loading.dismiss();
      this.submitting = false;
    }
  }

  async resendCode() {
    if (this.resendCooldown > 0) {
      return;
    }
    await this.requestCode();
  }

  async verifyCode() {
    if (this.submitting) {
      return;
    }
    this.submitting = true;
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      // returnEarly: don't route from inside the modal — dismiss with signedIn so
      // the login page routes via routeAfterAuth (new user -> /register).
      const ok = await this.db.verifyEmailOtp(this.email.toLowerCase().trim(), this.otpCode, true);
      if (!ok) {
        return;
      }
      await this.modalController.dismiss({ success: true, signedIn: true });
    } finally {
      await loading.dismiss();
      this.submitting = false;
    }
  }

  private startResendCooldown() {
    this.clearCooldown();
    this.resendCooldown = 30;
    this.cooldownTimer = setInterval(() => {
      this.resendCooldown -= 1;
      if (this.resendCooldown <= 0) {
        this.clearCooldown();
      }
    }, 1000);
  }

  private clearCooldown() {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    this.resendCooldown = 0;
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
