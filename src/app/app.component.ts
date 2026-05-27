import { Component, NgZone, ViewChild } from '@angular/core';
import { AlertController, IonRouterOutlet, Platform } from '@ionic/angular';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { Utils } from './utilities/Utils';
import { DbService } from './services/db.service';
import { PushService } from './services/push/push.service';
import { TrackingEvent, TrackingService } from './services/tracking/tracking.service';

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html',
    styleUrls: ['app.component.scss'],
    standalone: false
})
export class AppComponent {
  @ViewChild(IonRouterOutlet, { static: true }) routerOutlet: IonRouterOutlet;

  constructor(
    private platform: Platform,
    private titleService: Title,
    private storage: Storage,
    private alertController: AlertController,
    private db: DbService,
    private swUpdate: SwUpdate,
    private pushService: PushService,
    private router: Router,
    private zone: NgZone,
    private tracking: TrackingService,
  ) {
    this.initializeApp();
    this.titleService.setTitle('Attendix');
    this.listenToAuthChanges();
    this.checkForUpdates();
    this.setupDeepLinks();
    this.trackPageViews();
  }

  async ngOnInit() {
    await this.storage.create();
  }

  initializeApp() {
    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (!this.routerOutlet.canGoBack()) {
        App.exitApp();
      }
    });
  }

  async presentPasswordRecoveryAlert() {
    const alert = await this.alertController.create({
      header: 'Neues Passwort eingeben',
      inputs: [
        {
          name: 'password',
          type: 'password',
          placeholder: 'Min. 6 Zeichen eingeben...'
        }
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        }, {
          text: 'Passwort ändern',
          handler: (values: any) => {
            if (values.password.length < 6) {
              Utils.showToast('Bitte gib ein Passwort mit mindestens 6 Zeichen ein', 'danger');
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
      if (event === 'SIGNED_IN') {
        this.tracking.track(TrackingEvent.Login);
        this.pushService.promptAndEnable();
        this.showNativeAppAd();
      }
      if (event === 'SIGNED_OUT') {
        this.pushService.removeToken();
        this.db.clearState();
      }
    });
  }

  checkForUpdates() {
    if (Capacitor.isNativePlatform()) return;
    if (this.swUpdate.isEnabled) {
      // Listen for version ready events
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(async () => {
          const alert = await this.alertController.create({
            header: 'Update verfügbar',
            message: 'Eine neue Version ist verfügbar. Jetzt aktualisieren?',
            buttons: [
              { text: 'Später', role: 'cancel' },
              {
                text: 'Aktualisieren',
                handler: () => document.location.reload()
              }
            ]
          });
          await alert.present();
        });

      // Check for updates every 30 seconds
      setInterval(() => {
        this.swUpdate.checkForUpdate();
      }, 30000);

      // Also check immediately on app start
      this.swUpdate.checkForUpdate();
    }
  }

  async showNativeAppAd() {
    if (Capacitor.isNativePlatform()) return;
    const shown = localStorage.getItem('native_app_ad_shown');
    if (true || shown) return;

    localStorage.setItem('native_app_ad_shown', 'true');

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const storeUrl = isIOS
      ? 'https://apps.apple.com/app/attendix/id6743612798'
      : 'https://play.google.com/store/apps/details?id=io.stephanus.attendix';
    const storeName = isIOS ? 'App Store' : 'Play Store';

    const alert = await this.alertController.create({
      header: 'Attendix als App verfügbar!',
      message: `Attendix gibt es jetzt als native App mit Push-Benachrichtigungen und schnellerem Zugriff. Jetzt im ${storeName} herunterladen!`,
      buttons: [
        { text: 'Später', role: 'cancel' },
        {
          text: 'Zum ' + storeName,
          handler: () => {
            window.open(storeUrl, '_blank');
          }
        }
      ]
    });
    await alert.present();
  }

  setupDeepLinks() {
    App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      this.zone.run(() => {
        const url = new URL(event.url);
        const fullPath = url.pathname + url.search;
        if (fullPath) {
          this.router.navigateByUrl(fullPath);
        }
      });
    });
  }

  private trackPageViews() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(event => {
        const url = event.urlAfterRedirects;
        if (url.includes('/login') || url.includes('/legal')) return;
        this.tracking.track(TrackingEvent.PageView, { url });
      });
  }
}
