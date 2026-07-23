import { Component, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule } from '@ionic/angular';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DbService } from 'src/app/services/db.service';
import { PushService } from 'src/app/services/push/push.service';
import { UserNotification } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.scss'],
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  private db = inject(DbService);
  private push = inject(PushService);
  private alertController = inject(AlertController);

  unread = signal(0);
  notifications = signal<UserNotification[]>([]);
  isOpen = signal(false);
  menuOpen = signal(false);
  menuEvent: Event | undefined;

  private sub: RealtimeChannel | null = null;

  constructor() {
    // Re-subscribe and refresh whenever the active tenant changes. setTenant()
    // flips the tenant signal atomically, so this fires once per switch and
    // rescopes the realtime channel + unread count to the new tenant.
    effect(() => {
      this.db.tenant();
      this.subscribe();
      this.refreshCount();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.refreshCount();
  }

  private subscribe(): void {
    // Tear down any prior subscription before resubscribing so tenant changes
    // / repeated mounts don't accumulate channels on the same topic.
    this.sub?.unsubscribe();

    const userId = this.db.user?.id;
    const tenantId = this.db.tenant()?.id;
    if (!userId || !tenantId) return;

    this.sub = this.db.getSupabase()
      .channel(`user-notif-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const rowTenant = payload.new?.tenantId ?? payload.old?.tenantId;
          if (rowTenant === this.db.tenant()?.id) {
            this.refreshCount();
            if (this.isOpen()) {
              this.load();
            }
          }
        })
      .subscribe();
  }

  async refreshCount(): Promise<void> {
    try {
      this.unread.set(await this.db.getUnreadNotificationCount());
    } catch (e) {
      console.error('[notification-bell] refreshCount failed:', e);
    }
  }

  async load(): Promise<void> {
    try {
      this.notifications.set(await this.db.getUserNotifications());
    } catch (e) {
      console.error('[notification-bell] load failed:', e);
    }
  }

  async open(): Promise<void> {
    // Show a loading indicator while we fetch. We load first so we know whether
    // there is anything to show — with no notifications we skip the (empty)
    // modal and just show an info toast.
    const loading = await Utils.getLoadingElement(10000);
    await loading.present();
    try {
      await this.load();
      await this.refreshCount();
    } finally {
      await loading.dismiss();
    }

    if (this.notifications().length === 0) {
      Utils.showToast('Keine Benachrichtigungen vorhanden.', 'medium');
      return;
    }

    this.isOpen.set(true);
  }

  onDismiss(): void {
    this.isOpen.set(false);
  }

  async handleRefresh(event: any): Promise<void> {
    await this.load();
    await this.refreshCount();
    event.target.complete();
  }

  openMenu(event: Event): void {
    this.menuEvent = event;
    this.menuOpen.set(true);
  }

  async markAll(): Promise<void> {
    this.menuOpen.set(false);
    await this.db.markAllNotificationsRead();
    await this.load();
    await this.refreshCount();
  }

  async deleteAll(): Promise<void> {
    this.menuOpen.set(false);
    const alert = await this.alertController.create({
      header: 'Alle Benachrichtigungen löschen?',
      message: 'Diese Aktion kann nicht rückgängig gemacht werden.',
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Löschen',
        role: 'destructive',
        handler: async (): Promise<void> => {
          await this.db.deleteAllNotifications();
          await this.load();
          await this.refreshCount();
        }
      }]
    });
    await alert.present();
  }

  async onTap(n: UserNotification): Promise<void> {
    if (!n.read) {
      await this.db.markNotificationRead(n.id);
      n.read = true;
      await this.refreshCount();
    }

    const attId = n.data?.attendanceId ? Number(n.data.attendanceId) : null;
    if (!attId) {
      // Nothing to open (criticals / birthday) — just close.
      this.isOpen.set(false);
      return;
    }

    // Switch tenant first if the notification belongs to a different one.
    const targetTenant = n.data?.tenantId ? Number(n.data.tenantId) : null;
    if (targetTenant && targetTenant !== this.db.tenant()?.id) {
      await this.db.setTenant(targetTenant);
    }

    this.isOpen.set(false);
    await this.push.navigateToAttendance(attId);
  }

  async ngOnDestroy(): Promise<void> {
    await this.sub?.unsubscribe();
  }
}
