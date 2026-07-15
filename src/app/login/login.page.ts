import { Component, OnInit, ViewChild } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { AlertController, IonInput, ModalController } from '@ionic/angular';
import { DbService } from '../services/db.service';
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
export class LoginPage implements OnInit {
  @ViewChild('emailInput', { static: true }) emailInput: IonInput;
  @ViewChild('passwordInput', { static: true }) passwordInput: IonInput;
  loginForm: UntypedFormGroup;
  registerCredentials = { password: '', email: '' };
  showPassword = false;
  public version: string = require('../../../package.json').version;

  constructor(
    private db: DbService,
    private alertController: AlertController,
    private modalController: ModalController
  ) { }

  async ngOnInit() {
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

    nativeEmailInput.addEventListener('change', (ev: Event) => {
      requestAnimationFrame(() => {
        this.registerCredentials.email = (ev.target as HTMLInputElement).value;
      });
    });

    nativePasswordInput.addEventListener('change', (ev: Event) => {
      requestAnimationFrame(() => {
        this.registerCredentials.password = (ev.target as HTMLInputElement).value;
      });
    });
  }

  async login() {
    const loading = await Utils.getLoadingElement();
    loading.present();
    try {
      // db.login shows a specific error toast and rethrows on failure, so the
      // catch below only needs to ensure the spinner is dismissed. The finally
      // guarantees dismissal whether login succeeds, returns false, or throws.
      await this.db.login(this.registerCredentials.email, this.registerCredentials.password, false, loading);
    } catch (error: any) {
      // The account exists but the email was never confirmed. Offer to resend
      // the verification mail so the user can complete registration.
      if (error?.code === 'email_not_confirmed') {
        await this.promptResendConfirmation();
      }
      // Other error toasts already surfaced by db.login.
    } finally {
      loading.dismiss();
    }
  }

  private async promptResendConfirmation(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'E-Mail nicht bestätigt',
      message: 'Deine E-Mail-Adresse wurde noch nicht bestätigt. Möchtest du die Bestätigungs-E-Mail erneut senden?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Erneut senden',
          handler: () => {
            this.db.resendConfirmationEmail(this.registerCredentials.email);
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
    const { data } = await modal.onDidDismiss<{ success: boolean } | undefined>();
    if (data?.success) {
      Utils.showToast('Registrierung erfolgreich, bitte bestätige deine E-Mail-Adresse.', 'success');
    }
  }
}
