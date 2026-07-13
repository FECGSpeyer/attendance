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
import { LiveUpdateService } from './services/live-update/live-update.service';

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html',
    styleUrls: ['app.component.scss'],
    standalone: false
})
export class AppComponent {
  @ViewChild(IonRouterOutlet, { static: true }) routerOutlet: IonRouterOutlet;

  private passwordRecoveryAlertOpen = false;

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
    private liveUpdate: LiveUpdateService,
  ) {
    this.initializeApp();
    this.titleService.setTitle('Attendix');
    this.listenToAuthChanges();
    this.checkForUpdates();
    this.liveUpdate.init();
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
    // Guard against showing two alerts: both the explicit call from the deep
    // link handler and a possible PASSWORD_RECOVERY auth event can arrive.
    if (this.passwordRecoveryAlertOpen) {
      return;
    }
    this.passwordRecoveryAlertOpen = true;

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
              // The alert dismisses after this handler runs; reset the guard so
              // the re-prompt isn't suppressed by it.
              this.passwordRecoveryAlertOpen = false;
              this.presentPasswordRecoveryAlert();
            } else {
              this.db.updatePassword(values.password);
            }
          }
        }
      ]
    });

    await alert.present();
    await alert.onDidDismiss();
    this.passwordRecoveryAlertOpen = false;
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
        const url = this.router.url.split('?')[0];
        if (url.startsWith('/tabs')) {
          this.router.navigateByUrl('/login');
        }
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
    if (shown) return;

    localStorage.setItem('native_app_ad_shown', 'true');

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const storeUrl = isIOS
      ? 'https://apps.apple.com/app/attendix/id6771119302'
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
      this.zone.run(async () => {
        const url = new URL(event.url);

        // Supabase auth deep links (password recovery + signup email confirmation).
        // Two possible shapes:
        //   PKCE (default in supabase-js v2):  ?code=...
        //   Implicit (legacy):                 #access_token=...&refresh_token=...&type=recovery|signup
        // In both cases we must feed the tokens/code to supabase-js manually because
        // Capacitor never surfaces the URL to window.location, so detectSessionInUrl can't fire.
        const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.substring(1) : url.hash);
        const query = url.searchParams;
        const type = hash.get('type') || query.get('type');
        const code = query.get('code');
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        const errorDescription = hash.get('error_description') || query.get('error_description');

        const isRecovery = type === 'recovery' || (!!code && url.pathname.includes('resetPassword'));
        const isSignupConfirm = type === 'signup' || (!!code && !isRecovery);

        if (isRecovery || isSignupConfirm) {
          if (errorDescription) {
            Utils.showToast(decodeURIComponent(errorDescription), 'danger');
            this.router.navigateByUrl('/login');
            return;
          }

          try {
            if (accessToken && refreshToken) {
              await this.db.getSupabase().auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
            } else if (code) {
              await this.db.getSupabase().auth.exchangeCodeForSession(code);
            }

            if (isRecovery) {
              // Route to /login for a stable host page, then present the
              // password reset alert directly. We must NOT rely on the
              // PASSWORD_RECOVERY auth event here: the PKCE flow
              // (exchangeCodeForSession) emits SIGNED_IN rather than
              // PASSWORD_RECOVERY, so the onAuthStateChange handler would
              // never show the alert and the user would be stuck.
              await this.router.navigateByUrl('/login');
              this.presentPasswordRecoveryAlert();
            } else {
              // Signup confirmation: user is now signed in. Confirm to the user and let
              // the SIGNED_IN listener route them into the app.
              Utils.showToast('E-Mail-Adresse bestätigt. Willkommen!', 'success', 4000);
            }
          } catch (e) {
            Utils.showToast(
              isRecovery
                ? 'Der Link zum Zurücksetzen ist ungültig oder abgelaufen.'
                : 'Der Bestätigungslink ist ungültig oder abgelaufen.',
              'danger'
            );
            this.router.navigateByUrl('/login');
          }
          return;
        }

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
