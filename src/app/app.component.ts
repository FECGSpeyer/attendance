import { Component, ViewChild } from '@angular/core';
import { AlertController, IonRouterOutlet, Platform } from '@ionic/angular';
import { App } from '@capacitor/app';
import { Title } from '@angular/platform-browser';
import { Storage } from '@ionic/storage-angular';
import { Utils } from './utilities/Utils';
import { DbService } from './services/db.service';
import { inject } from "@vercel/analytics"

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
    this.titleService.setTitle("Attendix");
    // document.body.classList.add(environment.isChoir ? "choir" : environment.symphonyImage ? "sinfo" : "blas"); TODO
    this.listenToAuthChanges();
  }

  async ngOnInit() {
    await this.storage.create();
  }

  initializeApp() {
    inject();
    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (!this.routerOutlet.canGoBack()) {
        App.exitApp();
      }
    });
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
    this.db.getSupabase().auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.presentPasswordRecoveryAlert();
      }
    });
  }
}
