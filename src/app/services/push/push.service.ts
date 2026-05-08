import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { AlertController } from '@ionic/angular';
import { supabase } from '../base/supabase';
import { Router } from '@angular/router';

const PUSH_PROMPT_SHOWN_KEY = 'push_prompt_shown';

@Injectable({
  providedIn: 'root'
})
export class PushService {
  private currentToken: string | null = null;

  constructor(
    private router: Router,
    private alertController: AlertController,
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

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      this.currentToken = token.value;
      await this.saveToken(token.value);
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error.error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received in foreground:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      const data = notification.notification.data;
      if (data?.route) {
        this.router.navigateByUrl(data.route);
      }
    });
  }

  async removeToken(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (!this.currentToken) return;

    await supabase
      .from('device_tokens')
      .delete()
      .eq('token', this.currentToken);

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
    if (!user) return;

    const platform = Capacitor.getPlatform();

    await supabase
      .from('device_tokens')
      .upsert({
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,token' });
  }
}
