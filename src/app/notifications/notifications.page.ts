import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { NotificationConfig } from 'src/app/utilities/interfaces';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
})
export class NotificationsPage implements OnInit {
  public notificationConfig: NotificationConfig
  public isAdmin: boolean;

  constructor(
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.notificationConfig = await this.db.getNotifcationConfig(this.db.tenantUser().userId);
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;

    this.db.getSupabase()
      .channel('noti-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (payload.new.id === this.notificationConfig.id) {
            this.notificationConfig = payload.new;
          }
        })
      .subscribe();
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

}
