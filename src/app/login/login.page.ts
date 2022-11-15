import { Component, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { IonInput } from '@ionic/angular';
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
  loginForm: FormGroup;
  registerCredentials = { password: '', email: '' };

  constructor(
    private db: DbService,
  ) { }

  async ngOnInit() {
    this.db.register("eckstaedt98@gmail.com", "123People");
    this.loginForm = new FormGroup({
      user: new FormControl('', [
        Validators.required,
        Validators.minLength(5)
      ]),
      password: new FormControl('', [
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
    const res: boolean = await this.db.login(this.registerCredentials.email, this.registerCredentials.password);

    if (!res) {
      Utils.showToast("Fehler bei der Anmeldung, versuche es erneut", "danger");
    }
  }
}
