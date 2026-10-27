import { currentIntlLocale } from '../../i18n/languages';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular/lazy';
import { Browser } from '@capacitor/browser';
import { DbService } from 'src/app/services/db.service';
import { MessageService } from 'src/app/services/message/message.service';
import { Role } from 'src/app/utilities/constants';
import { Message } from 'src/app/utilities/interfaces';
import type { MessageRecipient } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

type Filter = 'all' | 'read' | 'open' | 'problems';
type ChipTone = 'ok' | 'bad' | 'warn' | 'neutral';

interface Chip {
  text: string;
  tone: ChipTone;
}

interface RecipientRow extends MessageRecipient {
  groupName: string;
  chips: Chip[];
  isRead: boolean;
  hasProblem: boolean;
}

/**
 * One Mitteilung. Every recipient sees the formatted message (opening it marks
 * it read); admins/responsibles of the message's tenant additionally get the
 * delivery and read overview per person.
 */
@Component({
  selector: 'app-message-detail',
  templateUrl: './message-detail.page.html',
  styleUrls: ['./message-detail.page.scss'],
  standalone: false
})
export class MessageDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private alertController = inject(AlertController);
  private messageService = inject(MessageService);
  public db = inject(DbService);

  message: Message | null = null;
  loading = true;
  isManager = false;
  showContent = false;
  filter: Filter = 'all';
  recipients: RecipientRow[] = [];
  earlier: Message[] = [];
  stats = { read: 0, total: 0, pushDelivered: 0, pushTotal: 0, emailDelivered: 0, emailTotal: 0, emailOpened: 0, readAny: 0, open: 0, problems: 0 };

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async handleRefresh(event: CustomEvent): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading = false;
      return;
    }
    try {
      this.message = await this.messageService.getMessage(id);
      if (!this.message) {
        return;
      }

      // Links from push/email may point to another instance of the user.
      if (this.message.tenantId !== this.db.tenant()?.id
        && this.db.tenants().some(t => t.id === this.message!.tenantId)) {
        await this.db.setTenant(this.message.tenantId);
      }

      this.isManager = this.message.tenantId === this.db.tenant()?.id
        && [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser()?.role);
      this.showContent = !this.isManager;

      try {
        await this.messageService.markRead(this.message.id);
      } catch (e) {
        console.error('[message-detail] markRead failed:', e);
      }

      if (this.isManager) {
        await this.loadRecipients();
      } else {
        this.earlier = (await this.messageService.getReceivedMessages(this.db.user.id, this.message.tenantId, 6))
          .filter(m => m.id !== this.message!.id)
          .slice(0, 5);
      }
    } catch (e) {
      console.error('[message-detail] load failed:', e);
      Utils.showToast(translate('messages.loadFailed'), 'danger');
    } finally {
      this.loading = false;
    }
  }

  get backHref(): string {
    return this.isManager ? '/tabs/settings/messages' : Utils.getUrl(this.db.tenantUser()?.role);
  }

  get filtered(): RecipientRow[] {
    switch (this.filter) {
      case 'read': return this.recipients.filter(r => r.isRead);
      case 'open': return this.recipients.filter(r => !r.isRead);
      case 'problems': return this.recipients.filter(r => r.hasProblem);
      default: return this.recipients;
    }
  }

  onFilterChange(value: string): void {
    this.filter = value as Filter;
  }

  /** Opens links in the message in the system browser instead of the app webview. */
  onBodyClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement)?.closest('a');
    const href = anchor?.getAttribute('href');
    if (href) {
      event.preventDefault();
      void Browser.open({ url: href });
    }
  }

  async remove(): Promise<void> {
    if (!this.message) return;
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
              await this.messageService.deleteMessage(this.message!.id);
              await this.router.navigateByUrl('/tabs/settings/messages');
            } catch (e) {
              console.error('[message-detail] delete failed:', e);
              Utils.showToast(translate('messages.deleteFailed'), 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  openMessage(m: Message): void {
    void this.router.navigateByUrl(`/tabs/messages/${m.id}`);
  }

  private async loadRecipients(): Promise<void> {
    const rows = await this.messageService.getRecipients(this.message!.id);
    const groups = new Map((this.db.groups() ?? []).map(g => [g.id, g.name]));

    this.recipients = rows.map(r => {
      const isRead = !!r.read_at || !!r.email_opened_at;
      const unreachable = !r.push_enabled && !r.email;
      const hasProblem = r.push_failed || r.email_failed || unreachable;
      return {
        ...r,
        groupName: (r.group_id && groups.get(r.group_id)) || '',
        chips: this.chipsFor(r, unreachable),
        isRead,
        hasProblem,
      };
    });

    const s = { read: 0, total: rows.length, pushDelivered: 0, pushTotal: 0, emailDelivered: 0, emailTotal: 0, emailOpened: 0, readAny: 0, open: 0, problems: 0 };
    for (const r of this.recipients) {
      if (r.read_at) s.read++;
      if (r.push_enabled) s.pushTotal++;
      if (r.push_sent_at || r.telegram_sent_at) s.pushDelivered++;
      if (r.email) s.emailTotal++;
      if (r.email_delivered_at) s.emailDelivered++;
      if (r.email_opened_at) s.emailOpened++;
      if (r.isRead) s.readAny++; else s.open++;
      if (r.hasProblem) s.problems++;
    }
    this.stats = s;
  }

  private chipsFor(r: MessageRecipient, unreachable: boolean): Chip[] {
    if (unreachable && !r.read_at) {
      return [{ text: r.user_id ? translate('messages.unreachable') : translate('messages.noAccountNoEmail'), tone: 'warn' }];
    }
    const chips: Chip[] = [];
    chips.push(r.read_at
      ? { text: translate('messages.readAt', { time: this.time(r.read_at) }), tone: 'ok' }
      : { text: translate('messages.unread'), tone: 'neutral' });

    if (!r.user_id) {
      chips.push({ text: translate('messages.noAccount'), tone: 'neutral' });
    } else if (r.push_sent_at) {
      chips.push({ text: translate('messages.push'), tone: 'ok' });
    } else if (!r.push_enabled) {
      chips.push({ text: translate('messages.pushOff'), tone: 'neutral' });
    } else if (r.push_failed) {
      chips.push({ text: translate('messages.pushFailed'), tone: 'bad' });
    }
    if (r.telegram_sent_at) {
      chips.push({ text: translate('messages.telegram'), tone: 'ok' });
    }

    if (!r.email) {
      chips.push({ text: translate('messages.noEmail'), tone: 'neutral' });
    } else if (r.email_bounced_at) {
      chips.push({ text: translate('messages.emailBounced'), tone: 'bad' });
    } else if (r.email_failed) {
      chips.push({ text: translate('messages.emailFailed'), tone: 'bad' });
    } else if (r.email_opened_at) {
      chips.push({ text: translate('messages.emailOpened', { time: this.time(r.email_opened_at) }), tone: 'ok' });
    } else if (r.email_delivered_at) {
      chips.push({ text: translate('messages.emailDeliveredChip'), tone: 'ok' });
    } else if (r.email_sent_at) {
      chips.push({ text: translate('messages.emailSent'), tone: 'neutral' });
    } else {
      chips.push({ text: translate('messages.emailPending'), tone: 'neutral' });
    }
    return chips;
  }

  private time(iso: string): string {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    const hm = d.toLocaleTimeString(currentIntlLocale(), { hour: '2-digit', minute: '2-digit' });
    return sameDay ? hm : `${d.toLocaleDateString(currentIntlLocale(), { day: '2-digit', month: '2-digit' })} ${hm}`;
  }
}
