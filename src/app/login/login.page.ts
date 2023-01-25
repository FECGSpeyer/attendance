import { Component, OnInit, ViewChild } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { AlertController, IonInput } from '@ionic/angular';
import { DbService } from '../services/db.service';
import { Utils } from '../utilities/Utils';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  @ViewChild('emailInput', { static: true }) emailInput: IonInput;
  @ViewChild('passwordInput', { static: true }) passwordInput: IonInput;
  loginForm: UntypedFormGroup;
  registerCredentials = { password: '', email: '' };
  public version: string = require('../../../package.json').version;

  constructor(
    private db: DbService,
    private alertController: AlertController
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
    const res: boolean = await this.db.login(this.registerCredentials.email, this.registerCredentials.password);

    loading.dismiss();

    if (!res) {
      Utils.showToast("Fehler bei der Anmeldung, versuche es erneut", "danger");
    }
  }

  async forgotPassword(email: string) {
    const alert = await this.alertController.create({
      header: "Passwort zurücksetzen",
      inputs: [
        {
          name: 'email',
          value: email,
          type: 'email',
          placeholder: "E-Mail eingeben..."
        }
      ],
      buttons: [
        {
          text: "Abbrechen",
          role: 'cancel'
        }, {
          text: "Zurücksetzen",
          handler: (values: any) => {
            this.db.resetPassword(values.email);
          }
        }
      ]
    });

    await alert.present();
  }
}
