import { AfterViewInit, ApplicationRef, Component, ViewChild } from '@angular/core';
import { AlertController, IonRouterOutlet, Platform } from '@ionic/angular';
import { App } from '@capacitor/app';
import { Title } from '@angular/platform-browser';
import { environment } from 'src/environments/environment';
import { Storage } from '@ionic/storage-angular';
import { Utils } from './utilities/Utils';
import { DbService } from './services/db.service';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, first } from 'rxjs/operators';

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
    private updates: SwUpdate,
    private appRef: ApplicationRef
  ) {
    this.initializeApp();
    this.titleService.setTitle(environment.longName);
    document.body.classList.add(environment.isChoir ? "choir" : environment.symphonyImage ? "sinfo" : "blas");
    this.listenToAuthChanges();
  }

  async ngOnInit() {
    await this.storage.create();
    await this.db.getSettings();
    this.checkForUpdate();
  }

  async ionViewDidEnter() {
    this.checkForUpdate();
  }

  initializeApp() {
    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (!this.routerOutlet.canGoBack()) {
        App.exitApp();
      }
    });
    this.checkForUpdate();
  }

  async checkForUpdate() {
    if (!this.updates.isEnabled) {
      return;
    }

    const appIsStable$ = this.appRef.isStable.pipe(first(isStable => isStable === true));
    if (!appIsStable$) {
      console.log('app is not stable');
      return;
    }
    try {
      const updateFound = await this.updates.checkForUpdate();
      if (updateFound) {
        const alert = await this.alertController.create({
          header: "Update verfügbar!",
          buttons: [
            {
              text: "Abbrechen",
              role: 'cancel'
            }, {
              text: "Aktualisieren",
              handler: () => {
                document.location.reload();
              }
            }
          ]
        });

        await alert.present();
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
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
    });
  }
}
