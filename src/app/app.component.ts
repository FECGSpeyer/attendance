import { Component, ViewChild } from '@angular/core';
import { AlertController, IonRouterOutlet, Platform } from '@ionic/angular';
import { App } from '@capacitor/app';
import { Title } from '@angular/platform-browser';
import { environment } from 'src/environments/environment';
import { Storage } from '@ionic/storage-angular';
import { Utils } from './utilities/Utils';
import { DbService } from './services/db.service';
import { Role } from './utilities/constants';
import { Person, Player } from './utilities/interfaces';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  @ViewChild(IonRouterOutlet, { static: true }) routerOutlet: IonRouterOutlet;

  constructor(
    private platform: Platform,
    private titleService: Title,
    private storage: Storage,
    private alertController: AlertController,
    private db: DbService,
  ) {
    this.initializeApp();
    this.titleService.setTitle(environment.longName);
    document.body.classList.add(environment.isChoir ? "choir" : environment.symphonyImage ? "sinfo" : "blas");
    this.listenToAuthChanges();
  }

  async ngOnInit() {
    await this.storage.create();
    await this.db.getSettings();
  }

  initializeApp() {
    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (!this.routerOutlet.canGoBack()) {
        App.exitApp();
      }
    });
  }

  async initializeTelegram() {
    const webApp: any = (window as any).Telegram.WebApp;
    if (webApp.initData?.length) {
      webApp.expand();
      let person: Person;
      if (await this.db.getRole() === Role.ADMIN) {
        person = await this.db.getConductorByAppId();
        if (!person.telegramId) {
          this.db.updateConductor({ ...person, telegramId: webApp.initDataUnsafe.user.id });
          webApp.sendData({ success: true });
        }
      } else {
        person = await this.db.getPlayerByAppId();
        if (!person.telegramId) {
          this.db.updatePlayer({ ...person, telegramId: webApp.initDataUnsafe.user.id } as Player);
          webApp.sendData({ success: true });
        }
      }
    }
  }

  async presentPasswordRecoveryAlert() {
    const alert = await this.alertController.create({
      header: "Neues Passwort eingeben",
      inputs: [
        {
          name: 'password',
          type: 'password',
          placeholder: "Min. 6 Zeichen eingeben..."
        }
      ],
      buttons: [
        {
          text: "Abbrechen",
          role: 'cancel'
        }, {
          text: "Passwort ändern",
          handler: (values: any) => {
            if (values.password.length < 6) {
              Utils.showToast("Bitte gib ein Passwort mit mindestens 6 Zeichen ein", "danger");
              this.presentPasswordRecoveryAlert();
            } else {
              this.db.updatePassword(values.password);
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async listenToAuthChanges() {
    this.db.getSupabase().auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.presentPasswordRecoveryAlert();
      }
      if (session.user) {
        this.initializeTelegram();
      }
    });
  }
}
