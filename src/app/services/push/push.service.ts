import { Injectable, NgZone } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { AlertController } from '@ionic/angular';
import { supabase } from '../base/supabase';
import { Router } from '@angular/router';
import { DbService } from '../db.service';
import { Role } from '../../utilities/constants';

const PUSH_PROMPT_SHOWN_KEY = 'push_prompt_shown';

@Injectable({
  providedIn: 'root'
})
export class PushService {
  private currentToken: string | null = null;

  constructor(
    private router: Router,
    private alertController: AlertController,
    private zone: NgZone,
    private db: DbService,
  ) {}

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
        // Request Firebase Messaging permissions
        await FirebaseMessaging.requestPermissions();

        // Register for push notifications
        await PushNotifications.register();

        // Get the FCM token directly
        const { token: fcmToken } = await FirebaseMessaging.getToken();
        if (fcmToken) {
          this.currentToken = fcmToken;
          await this.saveToken(fcmToken);
          await this.showDebugAlert('iOS Push Token Saved', `Token: ${fcmToken.substring(0, 20)}...`);
        } else {
          await this.showDebugAlert('iOS Push Error', 'No FCM token received');
        }

        // Listen for token refresh
        FirebaseMessaging.addListener('tokenReceived', async (event) => {
          if (event.token) {
            this.currentToken = event.token;
            await this.saveToken(event.token);
            await this.showDebugAlert('iOS Token Refreshed', `New token: ${event.token.substring(0, 20)}...`);
          }
        });
      } catch (e) {
        await this.showDebugAlert('iOS Push Error', `Failed to initialize: ${e.message || JSON.stringify(e)}`);
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
      await this.showDebugAlert('Registration Error', error.error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      this.zone.run(() => {
        this.showForegroundAlert(notification);
      });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      this.zone.run(() => {
        this.navigateFromData(action.notification.data);
      });
    });
  }

  private async showDebugAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }

  private async showForegroundAlert(notification: PushNotificationSchema): Promise<void> {
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

  private async navigateFromData(data: any): Promise<void> {
    if (!data) return;

    if (data.tenantId && Number(data.tenantId) !== this.db.tenant()?.id) {
      await this.db.setTenant(Number(data.tenantId));
    }

    if (data.route) {
      this.router.navigateByUrl(data.route);
      return;
    }

    switch (data.type) {
      case 'attendance':
      case 'reminder':
      case 'checklist':
        if (data.attendanceId) {
          const role = this.db.tenantUser()?.role;
          if (role === Role.ADMIN || role === Role.RESPONSIBLE || role === Role.HELPER || role === Role.VOICE_LEADER_HELPER) {
            this.router.navigate(['/tabs/attendance'], { queryParams: { openAttendance: data.attendanceId } });
          } else if (role === Role.PARENT) {
            this.router.navigate(['/tabs/parents'], { queryParams: { openAttendance: data.attendanceId } });
          } else {
            this.router.navigate(['/tabs/signout'], { queryParams: { openAttendance: data.attendanceId } });
          }
        } else {
          this.router.navigateByUrl('/tabs/attendance');
        }
        break;
      case 'criticals':
        this.router.navigateByUrl('/tabs/list');
        break;
      default:
        this.router.navigateByUrl('/tabs/player');
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
      await this.showDebugAlert('Save Token Error', 'No authenticated user found');
      return;
    }

    const platform = Capacitor.getPlatform();

    try {
      // First, remove any existing entries for this token from other users
      // This ensures a device token is only associated with one user at a time
      await supabase
        .from('device_tokens')
        .delete()
        .eq('token', token);

      // Then insert the token for the current user
      const { error } = await supabase
        .from('device_tokens')
        .insert({
          user_id: user.id,
          token,
          platform,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        await this.showDebugAlert('Save Token Error', `DB Error: ${error.message}`);
      }
    } catch (e) {
      await this.showDebugAlert('Save Token Exception', `${e.message || JSON.stringify(e)}`);
    }
  }
}
