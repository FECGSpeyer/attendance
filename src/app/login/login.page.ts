import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonInput, ModalController } from '@ionic/angular/lazy';
import { DbService } from '../services/db.service';
import { TeamsService } from '../services/teams/teams.service';
import { LiveUpdateService } from '../services/live-update/live-update.service';
import { Utils } from '../utilities/Utils';
import { environment } from 'src/environments/environment';
import { LegalModalComponent } from './legal-modal/legal-modal.component';
import { RegisterModalComponent } from './register-modal/register-modal.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage implements OnInit, OnDestroy {
  @ViewChild('emailInput', { static: true }) emailInput: IonInput;
  @ViewChild('passwordInput', { static: true }) passwordInput: IonInput;
  loginForm: UntypedFormGroup;
  registerCredentials = { password: '', email: '' };
  showPassword = false;
  /** One-time Teams account-linking mode (set when SSO found no linked account). */
  linkMode = false;
  /** Passwordless email-OTP (code) mode state. */
  otpMode = false;
  otpSent = false;
  otpCode = '';
  resendCooldown = 0;
  private cooldownTimer: any = null;
  public version: string = require('../../../package.json').version;

  constructor(
    private db: DbService,
    private alertController: AlertController,
    private modalController: ModalController,
    private route: ActivatedRoute,
    private teams: TeamsService,
    public liveUpdate: LiveUpdateService,
  ) { }

  async ngOnInit() {
    // Enter link mode only inside Teams when redirected here by a failed silent
    // SSO (Microsoft user verified, but not yet linked to an Attendix account).
    this.linkMode = this.teams.isInTeams()
      && this.route.snapshot.queryParamMap.get('teamsLink') === '1';

    this.loginForm = new UntypedFormGroup({
      user: new UntypedFormControl('', [
        Validators.required,
        Validators.minLength(5)
      ]),
      password: new UntypedFormControl('', [
        Validators.required,
        Validators.maxLength(6)
      ])
    });

    const nativeEmailInput = await this.emailInput.getInputElement();
    const nativePasswordInput = await this.passwordInput.getInputElement();

    // Browser/password-manager autofill often fires only a native `input` event
    // (sometimes with no `change` at all) and can bypass Ionic's ngModel sync.
    // Mirror both events straight into the model so autofilled credentials are
    // always captured, whichever event the platform emits.
    const syncEmail = (ev: Event) => {
      requestAnimationFrame(() => {
        this.registerCredentials.email = (ev.target as HTMLInputElement).value;
      });
    };
    const syncPassword = (ev: Event) => {
      requestAnimationFrame(() => {
        this.registerCredentials.password = (ev.target as HTMLInputElement).value;
      });
    };

    nativeEmailInput.addEventListener('change', syncEmail);
    nativeEmailInput.addEventListener('input', syncEmail);
    nativePasswordInput.addEventListener('change', syncPassword);
    nativePasswordInput.addEventListener('input', syncPassword);
  }

  async login() {
    const loading = await Utils.getLoadingElement();
    loading.present();
    try {
      if (this.linkMode) {
        // One-time linking: verify Attendix credentials, then bind the Microsoft
        // identity so future Teams launches sign in silently.
        const ok = await this.teams.ssoLink(
          this.registerCredentials.email,
          this.registerCredentials.password,
        );
        if (ok) {
          this.linkMode = false;
          Utils.showToast('Microsoft-Konto verknüpft. Du wirst künftig automatisch angemeldet.', 'success', 4000);
          await this.db.routeAfterAuth();
        }
        return;
      }
      // db.login shows a specific error toast and rethrows on failure, so the
      // catch below only needs to ensure the spinner is dismissed. The finally
      // guarantees dismissal whether login succeeds, returns false, or throws.
      await this.db.login(this.registerCredentials.email, this.registerCredentials.password, false, loading);
    } catch (error: any) {
      // The account exists but the email was never confirmed. Offer to resend
      // the verification mail so the user can complete registration.
      if (error?.code === 'email_not_confirmed') {
        await this.promptResendConfirmation();
      } else if (error?.code === 'invalid_login_credentials' || error?.code === 'invalid_credentials') {
        await this.promptSwitchToOtp();
      } else if (error?.code === 'user_not_found') {
        await this.promptRegister();
      }
      // Other error toasts already surfaced by db.login.
    } finally {
      loading.dismiss();
    }
  }

  ngOnDestroy() {
    this.clearCooldown();
  }

  /** Route Enter/submit to the action appropriate for the current mode. */
  onEnter() {
    if (this.otpMode) {
      if (this.otpSent) {
        this.verifyCode();
      } else {
        this.requestCode();
      }
      return;
    }
    this.login();
  }

  enterOtpMode() {
    this.otpMode = true;
    this.otpSent = false;
    this.otpCode = '';
  }

  /** Segment handler: switch between password and email-code (OTP) sign-in. */
  onModeChange(ev: CustomEvent) {
    if (ev.detail.value === 'otp') {
      this.enterOtpMode();
    } else {
      this.exitOtpMode();
    }
  }

  exitOtpMode() {
    this.otpMode = false;
    this.otpSent = false;
    this.otpCode = '';
    this.clearCooldown();
  }

  async requestCode() {
    const email = this.registerCredentials.email?.trim();
    if (!Utils.validateEmail(email)) {
      Utils.showToast('Bitte eine gültige E-Mail Adresse eingeben.', 'danger');
      return;
    }
    const loading = await Utils.getLoadingElement();
    loading.present();
    try {
      // Login surface: sign-in only, never create a new account.
      const ok = await this.db.sendEmailOtp(email, false);
      if (ok) {
        this.otpSent = true;
        this.startResendCooldown();
      }
    } catch {
      await this.promptRegister();
    } finally {
      loading.dismiss();
    }
  }

  async resendCode() {
    if (this.resendCooldown > 0) {
      return;
    }
    await this.requestCode();
  }

  async verifyCode() {
    const email = this.registerCredentials.email?.trim();
    const loading = await Utils.getLoadingElement();
    loading.present();
    try {
      // verifyEmailOtp shows its own error toast; on success it routes via routeAfterAuth.
      await this.db.verifyEmailOtp(email, this.otpCode, false, loading);
    } finally {
      loading.dismiss();
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

  private async promptResendConfirmation(): Promise<void> {
    const email = this.registerCredentials.email?.trim();
    const alert = await this.alertController.create({
      header: 'E-Mail nicht bestätigt',
      message: 'Deine E-Mail-Adresse wurde noch nicht bestätigt. Möchtest du die Bestätigungs-E-Mail erneut senden?',
      inputs: [
        {
          name: 'email',
          type: 'email',
          value: email,
          placeholder: 'E-Mail eingeben...',
        }
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Erneut senden',
          handler: (values: { email?: string }) => {
            const target = values?.email?.trim();
            if (!target) {
              Utils.showToast('Bitte gib deine E-Mail-Adresse ein.', 'warning');
              return false;
            }
            this.db.resendConfirmationEmail(target);
            return true;
          }
        }
      ]
    });

    await alert.present();
  }

  private async promptRegister(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Kein Konto gefunden',
      message: 'Für diese E-Mail-Adresse existiert noch kein Konto. Möchtest du dich jetzt registrieren?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Registrieren',
          handler: () => {
            this.register();
          }
        }
      ]
    });
    await alert.present();
  }

  private async promptSwitchToOtp(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Anmeldung fehlgeschlagen',
      message: 'E-Mail oder Passwort ist falsch. Falls du kein Passwort gesetzt hast, kannst du dich stattdessen mit einem Code per E-Mail anmelden.',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Code per E-Mail',
          handler: () => {
            this.enterOtpMode();
          }
        }
      ]
    });
    await alert.present();
  }

  async startDemo() {
    const loading = await Utils.getLoadingElement();
    loading.present();
    try {
      await this.db.login(environment.demoMail, environment.demoPassword, false, loading);
    } catch {
      // Error toast already surfaced by db.login.
    } finally {
      loading.dismiss();
    }
  }

  async openLegal() {
    const modal = await this.modalController.create({ component: LegalModalComponent });
    await modal.present();
  }

  async forgotPassword() {
    const alert = await this.alertController.create({
      header: 'Passwort zurücksetzen',
      inputs: [
        {
          name: 'email',
          value: this.registerCredentials.email,
          type: 'email',
          placeholder: 'E-Mail eingeben...'
        }
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        }, {
          text: 'Zurücksetzen',
          handler: (values: any) => {
            this.db.resetPassword(values.email);
          }
        }
      ]
    });

    await alert.present();
  }

  async register() {
    const modal = await this.modalController.create({
      component: RegisterModalComponent,
    });
    await modal.present();

    // The modal performs the backend registration itself and only dismisses
    // with { success: true } once it succeeds — so on failure it stays open
    // with the user's data intact. Nothing to retry here.
    const { data } = await modal.onDidDismiss<{ success: boolean; signedIn?: boolean } | undefined>();
    if (data?.signedIn) {
      // Passwordless OTP registration already created AND signed the user in.
      await this.db.routeAfterAuth();
    } else if (data?.success) {
      Utils.showToast('Registrierung erfolgreich, bitte bestätige deine E-Mail-Adresse.', 'success');
    }
  }
}
