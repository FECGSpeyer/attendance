import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DbService } from '../services/db.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {

  loginForm: FormGroup;
  registerCredentials = { password: '', email: '' };

  constructor(
    private db: DbService,
  ) { }

  ngOnInit() {
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
  }

  async login() {
    await this.db.login(this.registerCredentials.email, this.registerCredentials.password);
  }
}
