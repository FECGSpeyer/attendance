import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonItemSliding, ModalController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { MessageService } from 'src/app/services/message/message.service';
import { Message } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { MessageComposeComponent } from '../message-compose/message-compose.component';
import { translate } from '@jsverse/transloco';

interface MessageRow extends Message {
  read: number;
  problems: number;
}

/** Mitteilungen overview for admins/responsibles: all sent messages of the tenant. */
@Component({
  selector: 'app-message-list',
  templateUrl: './message-list.page.html',
  styleUrls: ['./message-list.page.scss'],
  standalone: false
})
export class MessageListPage implements OnInit {
  private db = inject(DbService);
  private messageService = inject(MessageService);
  private modalController = inject(ModalController);
  private alertController = inject(AlertController);
  private router = inject(Router);

  messages: MessageRow[] = [];
  loading = true;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async ionViewWillEnter(): Promise<void> {
    // Refresh counts when returning from a message's read overview.
    if (!this.loading) {
      await this.load();
    }
  }

  async handleRefresh(event: CustomEvent): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  async load(): Promise<void> {
    try {
      const messages = await this.messageService.getMessages(this.db.tenant().id);
      const stats = await this.messageService.getStats(messages.map(m => m.id));
      this.messages = messages.map(m => ({
        ...m,
        read: stats.get(m.id)?.read ?? 0,
        problems: stats.get(m.id)?.problems ?? 0,
      }));
    } catch (e) {
      console.error('[message-list] load failed:', e);
      Utils.showToast(translate('messages.listLoadFailed'), 'danger');
    } finally {
      this.loading = false;
    }
  }

  readPercent(m: MessageRow): number {
    return m.recipient_count > 0 ? Math.round((m.read / m.recipient_count) * 100) : 0;
  }

  open(m: MessageRow): void {
    void this.router.navigateByUrl(`/tabs/messages/${m.id}`);
  }

  async compose(): Promise<void> {
    const modal = await this.modalController.create({
      component: MessageComposeComponent,
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<string>();
    if (role === 'sent' && data) {
      await this.router.navigateByUrl(`/tabs/messages/${data}`);
    }
  }

  async remove(m: MessageRow, sliding: IonItemSliding): Promise<void> {
    await sliding.close();
    const alert = await this.alertController.create({
      header: translate('messages.deleteConfirm'),
      message: translate('messages.deleteHint'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            try {
              await this.messageService.deleteMessage(m.id);
              this.messages = this.messages.filter(x => x.id !== m.id);
            } catch (e) {
              console.error('[message-list] delete failed:', e);
              Utils.showToast(translate('messages.deleteFailed'), 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
