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
    this.handleWebAuthLink();
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
          // Returning false keeps the alert open so the user can retry without
          // losing the recovery session. We only let it dismiss on success.
          handler: async (values: any) => {
            const password = values?.password ?? '';
            if (password.length < 6) {
              Utils.showToast('Bitte gib ein Passwort mit mindestens 6 Zeichen ein', 'danger');
              return false;
            }

            const result = await this.db.updatePassword(password);
            if (result.success) {
              Utils.showToast(result.message, 'success');
              return true;
            }

            Utils.showToast(result.message, 'danger');
            return false;
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

        const handled = await this.handleAuthUrl(url);
        if (handled) {
          return;
        }

        const fullPath = url.pathname + url.search;
        if (fullPath) {
          this.router.navigateByUrl(fullPath);
        }
      });
    });
  }

  /**
   * Web entry point for Supabase auth links. On native, links arrive via the
   * appUrlOpen listener; on web the browser navigates directly to the URL, so
   * we inspect window.location once at startup. The token-hash flow is not
   * auto-handled by detectSessionInUrl, so we must process it ourselves here
   * too. Runs only on web to avoid double-handling on native.
   */
  private async handleWebAuthLink() {
    if (Capacitor.isNativePlatform()) {
      return;
    }
    try {
      const url = new URL(window.location.href);
      await this.handleAuthUrl(url);
    } catch {
      // Malformed URL – nothing to handle.
    }
  }

  /**
   * Process a Supabase auth deep link (password recovery + signup confirmation).
   * Possible shapes, in order of preference:
   *   Token-hash (OTP):  ?token_hash=...&type=recovery|signup   (verifyOtp)
   *   PKCE:              ?code=...                              (exchangeCodeForSession)
   *   Implicit (legacy): #access_token=...&refresh_token=...&type=...  (setSession)
   * We feed the tokens/code to supabase-js manually because on native Capacitor
   * never surfaces the URL to window.location, so detectSessionInUrl can't fire.
   * The token-hash flow is preferred: it carries no PKCE code_verifier
   * dependency, so it works even when the link is opened on a different
   * device/app instance than the one that requested the reset.
   * @returns true if the URL was an auth link and was handled, false otherwise.
   */
  private async handleAuthUrl(url: URL): Promise<boolean> {
    const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.substring(1) : url.hash);
    const query = url.searchParams;
    const type = hash.get('type') || query.get('type');
    const tokenHash = query.get('token_hash') || hash.get('token_hash');
    const code = query.get('code');
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const errorDescription = hash.get('error_description') || query.get('error_description');

    // `type` (recovery|signup) is authoritative when present. The pathname is
    // only a fallback for legacy links that carry a code/token but no type.
    // Note: signup-confirmation links may also point at /resetPassword, so we
    // must NOT infer recovery from the path when type explicitly says signup.
    const isRecovery = type === 'recovery' ||
      (!type && (!!code || !!tokenHash) && url.pathname.includes('resetPassword'));
    const isSignupConfirm = type === 'signup' || ((!!code || !!tokenHash) && !isRecovery);

    if (!isRecovery && !isSignupConfirm) {
      return false;
    }

    if (errorDescription) {
      Utils.showToast(decodeURIComponent(errorDescription), 'danger');
      this.router.navigateByUrl('/login');
      return true;
    }

    try {
      let sessionError: unknown = null;

      if (tokenHash) {
        const { error } = await this.db.getSupabase().auth.verifyOtp({
          token_hash: tokenHash,
          type: isRecovery ? 'recovery' : 'signup',
        });
        sessionError = error;
      } else if (accessToken && refreshToken) {
        const { error } = await this.db.getSupabase().auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        sessionError = error;
      } else if (code) {
        const { error } = await this.db.getSupabase().auth.exchangeCodeForSession(code);
        sessionError = error;
      }

      // supabase-js returns errors in the result object rather than throwing.
      // If verification failed we have no session, so updateUser() would later
      // fail with "Auth session missing". Surface it here instead of showing a
      // dead recovery alert.
      if (sessionError) {
        throw sessionError;
      }

      if (isRecovery) {
        // Route to /login for a stable host page, then present the password
        // reset alert directly. We must NOT rely on the PASSWORD_RECOVERY auth
        // event here: verifyOtp/exchangeCodeForSession emit SIGNED_IN rather
        // than PASSWORD_RECOVERY, so the onAuthStateChange handler would never
        // show the alert and the user would be stuck.
        await this.router.navigateByUrl('/login');
        this.presentPasswordRecoveryAlert();
      } else {
        // Signup confirmation: verifyOtp/exchangeCodeForSession established a
        // session. Load the tenant context and route to the correct landing
        // page (freshly-confirmed users without a tenant go to /register).
        Utils.showToast('E-Mail-Adresse bestätigt. Willkommen!', 'success', 4000);
        await this.db.routeAfterAuth();
      }
    } catch (e) {
      console.error('[handleAuthUrl] failed:', e);
      Utils.showToast(
        isRecovery
          ? 'Der Link zum Zurücksetzen ist ungültig oder abgelaufen.'
          : 'Der Bestätigungslink ist ungültig oder abgelaufen.',
        'danger'
      );
      this.router.navigateByUrl('/login');
    }
    return true;
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
