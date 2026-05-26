import { Injectable, NgZone } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, ActionPerformed } from '@capacitor/push-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Badge } from '@capawesome/capacitor-badge';
import { AlertController } from '@ionic/angular';
import { supabase } from '../base/supabase';
import { NavigationEnd, Router } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { DbService } from '../db.service';
import { Role } from '../../utilities/constants';

const PUSH_PROMPT_SHOWN_KEY = 'push_prompt_shown';

@Injectable({
  providedIn: 'root'
})
export class PushService {
  private currentToken: string | null = null;
  // Set when a push action arrives; consumed by handlePendingPushNavigation()
  // after the LoginGuard's startup redirect lands. This ordering avoids a
  // race where our navigate() would otherwise be replaced by the guard's
  // redirect to Utils.getUrl(role).
  public pendingPushData: any = null;

  constructor(
    private router: Router,
    private alertController: AlertController,
    private zone: NgZone,
    private db: DbService,
  ) {
    this.setupPushListeners();
  }

  async promptAndEnable(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    const alreadyPrompted = localStorage.getItem(PUSH_PROMPT_SHOWN_KEY);
    if (alreadyPrompted) {
      await this.initPush();
      return;
    }

    const permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'granted') {
      localStorage.setItem(PUSH_PROMPT_SHOWN_KEY, 'true');
      await this.initPush();
      return;
    }

    if (permStatus.receive === 'denied') {
      localStorage.setItem(PUSH_PROMPT_SHOWN_KEY, 'true');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Push-Benachrichtigungen',
      message: 'Möchtest du Push-Benachrichtigungen aktivieren? Du wirst über Termine, Checklisten und wichtige Ereignisse informiert.',
      buttons: [
        {
          text: 'Später',
          role: 'cancel',
          handler: () => {
            localStorage.setItem(PUSH_PROMPT_SHOWN_KEY, 'true');
          }
        },
        {
          text: 'Aktivieren',
          handler: async () => {
            localStorage.setItem(PUSH_PROMPT_SHOWN_KEY, 'true');
            await this.initPush();
            await this.enablePushInDb();
          }
        }
      ]
    });

    await alert.present();
  }

  async initPush(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    const permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      const result = await PushNotifications.requestPermissions();
      if (result.receive !== 'granted') return;
    } else if (permStatus.receive !== 'granted') {
      return;
    }

    const isIos = Capacitor.getPlatform() === 'ios';

    // For iOS, use Firebase Messaging directly for token handling
    if (isIos) {
      try {
        // Set up listener for token changes/refreshes
        await FirebaseMessaging.addListener('tokenReceived', async (event) => {
          this.zone.run(async () => {
            if (event.token) {
              this.currentToken = event.token;
              await this.saveToken(event.token);
            }
          });
        });

        // Request Firebase Messaging permissions
        await FirebaseMessaging.requestPermissions();

        // Wait for APNS registration to complete before getting FCM token
        const registrationPromise = new Promise<void>((resolve, reject) => {
          PushNotifications.addListener('registration', (token) => {
            // APNS token received, now AppDelegate has set it on Firebase Messaging
            resolve();
          });

          PushNotifications.addListener('registrationError', (error) => {
            reject(new Error(error.error));
          });

          // Timeout after 10 seconds
          setTimeout(() => reject(new Error('Registration timeout')), 10000);
        });

        // Register for push notifications - this triggers APNS registration in AppDelegate
        await PushNotifications.register();

        // Wait for the registration listener to fire
        await registrationPromise;

        // Now get the FCM token (APNS token should be set by now)
        const result = await FirebaseMessaging.getToken();
        if (result.token) {
          this.currentToken = result.token;
          await this.saveToken(result.token);
        } else {
          console.error('iOS Push Error: no FCM token received from getToken()');
        }
      } catch (e) {
        console.error('iOS Push Error:', e);
      }
    } else {
      // Android uses standard PushNotifications plugin
      await PushNotifications.register();

      PushNotifications.addListener('registration', async (token) => {
        this.currentToken = token.value;
        await this.saveToken(token.value);
      });
    }

    PushNotifications.addListener('registrationError', async (error) => {
      console.error('Push registration error:', error);
    });

    // Clear badge when app initializes push
    await this.clearBadge();
  }

  private setupPushListeners(): void {
    if (!Capacitor.isNativePlatform()) return;

    // Use FirebaseMessaging listeners for foreground notifications. The standard
    // @capacitor/push-notifications `pushNotificationReceived` event is unreliable
    // on iOS when FirebaseMessaging is installed (FCM swizzling intercepts the
    // delivery before Capacitor's plugin sees it), so we listen via Firebase.
    // FirebaseMessaging handles both iOS and Android foreground delivery.
    FirebaseMessaging.addListener('notificationReceived', (event) => {
      this.zone.run(() => {
        const n = event.notification;
        this.showForegroundAlert({
          title: n.title || '',
          body: n.body || '',
          data: (n.data as Record<string, any>) || {},
        });
      });
    });

    FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      this.zone.run(async () => {
        await this.clearBadge();
        this.pendingPushData = event.notification.data;
        await this.handlePendingPushNavigation();
      });
    });

    // Keep the @capacitor/push-notifications action listener as a fallback. On
    // Android cold-launch the standard plugin sometimes delivers the action
    // before FirebaseMessaging is ready. Both paths funnel into the same
    // pendingPushData / handlePendingPushNavigation flow, which is idempotent.
    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      this.zone.run(async () => {
        await this.clearBadge();
        this.pendingPushData = action.notification.data;
        await this.handlePendingPushNavigation();
      });
    });
  }

  // Minimal shape used by showForegroundAlert — accepts both PushNotificationSchema
  // and FirebaseMessaging Notification.
  private async showForegroundAlert(notification: { title?: string; body?: string; data?: any }): Promise<void> {
    const alert = await this.alertController.create({
      header: notification.title || 'Benachrichtigung',
      message: notification.body || '',
      buttons: [
        { text: 'OK', role: 'cancel' },
        {
          text: 'Anzeigen',
          handler: () => {
            this.navigateFromData(notification.data);
          }
        }
      ]
    });
    await alert.present();
  }

  /**
   * Resolve any pending push navigation. Called from:
   *   - the push action listener itself (warm start: runs immediately)
   *   - AppComponent after auth state and initial route are settled (cold start)
   *
   * The two-step design avoids a race with LoginGuard, which on cold start
   * also runs db.checkToken() and then navigates the user to Utils.getUrl(role).
   * If we navigated first, the guard's later navigate() would replace us and
   * the openAttendance query param would be lost.
   */
  async handlePendingPushNavigation(): Promise<void> {
    if (!this.pendingPushData) return;

    // Wait for the first NavigationEnd so the initial route (login redirect or
    // restored route) has settled. Then our navigation runs last and wins.
    if (!this.router.navigated) {
      try {
        await firstValueFrom(
          this.router.events.pipe(filter(e => e instanceof NavigationEnd), take(1))
        );
      } catch {
        /* router never settles — proceed anyway */
      }
    }

    // Ensure tenant + tenantUser are loaded. checkToken is idempotent (uses
    // initPromise) so this is safe even if a guard already triggered it.
    await this.db.checkToken();

    const data = this.pendingPushData;
    this.pendingPushData = null;
    await this.navigateFromData(data);
  }

  private async navigateFromData(data: any): Promise<void> {
    if (!data) return;

    // tenant/tenantUser must be loaded — caller (handlePendingPushNavigation)
    // has already awaited checkToken. For warm-start "Anzeigen" it's already set.
    if (!this.db.tenant() || !this.db.tenantUser()) {
      // No session — nothing we can do. Let the normal login flow proceed.
      return;
    }

    if (data.tenantId && Number(data.tenantId) !== this.db.tenant()?.id) {
      await this.db.setTenant(Number(data.tenantId));
    }

    if (data.route) {
      await this.router.navigateByUrl(data.route);
      return;
    }

    switch (data.type) {
      case 'attendance':
      case 'reminder':
      case 'checklist':
        if (data.attendanceId) {
          const role = this.db.tenantUser()?.role;
          if (role === Role.ADMIN || role === Role.RESPONSIBLE || role === Role.HELPER || role === Role.VOICE_LEADER_HELPER) {
            await this.router.navigate(['/tabs/attendance'], { queryParams: { openAttendance: data.attendanceId } });
          } else if (role === Role.PARENT) {
            await this.router.navigate(['/tabs/parents'], { queryParams: { openAttendance: data.attendanceId } });
          } else {
            await this.router.navigate(['/tabs/signout'], { queryParams: { openAttendance: data.attendanceId } });
          }
        } else {
          await this.router.navigateByUrl('/tabs/attendance');
        }
        break;
      case 'criticals':
        await this.router.navigateByUrl('/tabs/list');
        break;
      default:
        await this.router.navigateByUrl('/tabs/player');
    }
  }

  async removeToken(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (!this.currentToken) return;

    await supabase
      .from('device_tokens')
      .delete()
      .eq('token', this.currentToken);

    if (Capacitor.getPlatform() === 'ios') {
      try {
        await FirebaseMessaging.deleteToken();
      } catch (e) {
        console.error('Failed to delete FCM token:', e);
      }
    }

    this.currentToken = null;
  }

  private async clearBadge(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Badge.clear();
    } catch (e) {
      // Badge API not available on all platforms
      console.debug('Could not clear badge:', e);
    }
  }

  async togglePush(enabled: boolean, userId: string): Promise<void> {
    await supabase
      .from('notifications')
      .update({ push_enabled: enabled })
      .eq('id', userId);

    if (enabled) {
      await this.initPush();
    }
  }

  private async enablePushInDb(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ push_enabled: true })
      .eq('id', user.id);
  }

  private async saveToken(token: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('Save Token Error: no authenticated user found');
      return;
    }

    const platform = Capacitor.getPlatform();

    try {
      // Remove this token from other users (ensures a token is only for one user)
      await supabase
        .from('device_tokens')
        .delete()
        .eq('token', token)
        .neq('user_id', user.id);

      // Remove other tokens for this user (one token per user)
      await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', user.id)
        .neq('token', token);

      // Upsert the current token (handles both insert and update cases)
      const { error } = await supabase
        .from('device_tokens')
        .upsert({
          user_id: user.id,
          token,
          platform,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Save Token Error:', error);
      }
    } catch (e) {
      console.error('Save Token Exception:', e);
    }
  }
}
