import { Component, OnDestroy, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { NotificationConfig } from 'src/app/utilities/interfaces';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
})
export class NotificationsPage implements OnInit, OnDestroy {
  public notificationConfig: NotificationConfig;
  public isAdmin: boolean;
  private sub: RealtimeChannel;

  constructor(
    public db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.notificationConfig = await this.db.getNotifcationConfig(this.db.tenantUser().userId);
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;

    this.sub = this.db.getSupabase()
      .channel('noti-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if ((payload.new as any)?.id === this.notificationConfig?.id) {
            this.notificationConfig = payload.new as NotificationConfig;
          }
        })
      .subscribe();
  }

  async ngOnDestroy() {
    await this.sub?.unsubscribe();
  }

  async updateNotificationConfig() {
    this.db.updateNotificationConfig(this.notificationConfig);
  }

  connectTelegram() {
    window.open(`https://t.me/attendix_bot?start=${this.db.tenantUser().userId}`, "_blank");
  }

  async disconnectTelegram() {
    const alert = await this.alertController.create({
      header: "Möchtest du die Verbidnung wirklich trennen?",
      message: "Die Verbindung kann jederzeit wiederhergestellt werden",
      buttons: [{
        text: "Abbrechen",
      }, {
        text: "Ja",
        handler: async () => {
          await this.db.updateNotificationConfig({
            ...this.notificationConfig,
            telegram_chat_id: "",
          });
        }
      }]
    });

    await alert.present();
  }

  toggleTenant(tenantId: number) {
    const tenants = this.notificationConfig.enabled_tenants || [];
    if (tenants.includes(tenantId)) {
      this.notificationConfig.enabled_tenants = tenants.filter(id => id !== tenantId);
    } else {
      this.notificationConfig.enabled_tenants = [...tenants, tenantId];
    }
    this.updateNotificationConfig();
  }

}
