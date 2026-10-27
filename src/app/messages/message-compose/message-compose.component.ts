import { Component, OnInit, inject } from '@angular/core';
import { AlertController, LoadingController, ModalController } from '@ionic/angular/lazy';
import { JSONContent } from '@tiptap/core';
import { DbService } from 'src/app/services/db.service';
import { MessageService } from 'src/app/services/message/message.service';
import { Group, MessageRecipientCounts } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

interface Draft {
  title: string;
  content: JSONContent | null;
}

/**
 * Full-screen modal to write and send a Mitteilung. Dismisses with the new
 * message id (role 'sent') so the caller can open its read overview.
 */
@Component({
  selector: 'app-message-compose',
  templateUrl: './message-compose.component.html',
  styleUrls: ['./message-compose.component.scss'],
  standalone: false
})
export class MessageComposeComponent implements OnInit {
  private db = inject(DbService);
  private messages = inject(MessageService);
  private modalController = inject(ModalController);
  private alertController = inject(AlertController);
  private loadingController = inject(LoadingController);

  title = '';
  content: JSONContent | null = null;
  initialContent: JSONContent | null = null;
  audience: 'all' | 'groups' = 'all';
  selectedGroups = new Set<number>();
  push = true;
  email = true;
  groups: Group[] = [];
  counts: MessageRecipientCounts | null = null;
  countsError = false;
  sending = false;

  private countsRequest = 0;

  private get draftKey(): string {
    return `message-draft-${this.db.tenant()?.id}`;
  }

  ngOnInit(): void {
    this.groups = (this.db.groups() ?? []).filter(g => g.id !== undefined);
    try {
      const raw = localStorage.getItem(this.draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Draft;
        this.title = draft.title ?? '';
        this.initialContent = draft.content ?? null;
        this.content = this.initialContent;
      }
    } catch {
      // Drafts are a convenience only.
    }
    void this.loadCounts();
  }

  get groupIds(): number[] | null {
    return this.audience === 'groups' ? Array.from(this.selectedGroups) : null;
  }

  get hasText(): boolean {
    return !!this.content && JSON.stringify(this.content).includes('"text"');
  }

  get canSend(): boolean {
    return !this.sending
      && this.title.trim().length > 0
      && this.hasText
      && (this.push || this.email)
      && (this.audience === 'all' || this.selectedGroups.size > 0)
      && (this.counts?.recipients ?? 0) > 0;
  }

  onContentChange(content: JSONContent): void {
    this.content = content;
    this.saveDraft();
  }

  onTitleChange(): void {
    this.saveDraft();
  }

  setAudience(audience: 'all' | 'groups'): void {
    this.audience = audience;
    void this.loadCounts();
  }

  toggleGroup(id: number): void {
    if (this.selectedGroups.has(id)) {
      this.selectedGroups.delete(id);
    } else {
      this.selectedGroups.add(id);
    }
    void this.loadCounts();
  }

  onChannelChange(): void {
    void this.loadCounts();
  }

  async loadCounts(): Promise<void> {
    const request = ++this.countsRequest;
    this.countsError = false;
    if (this.audience === 'groups' && this.selectedGroups.size === 0) {
      this.counts = { recipients: 0, push: 0, email: 0, unreachable: 0 };
      return;
    }
    try {
      const counts = await this.messages.getRecipientCounts(
        this.db.tenant().id,
        this.groupIds,
        { push: this.push, email: this.email },
      );
      if (request === this.countsRequest) {
        this.counts = counts;
      }
    } catch (e) {
      console.error('[message-compose] counts failed:', e);
      if (request === this.countsRequest) {
        this.countsError = true;
      }
    }
  }

  cancel(): void {
    void this.modalController.dismiss(null, 'cancel');
  }

  async confirmSend(): Promise<void> {
    if (!this.canSend || !this.counts) {
      return;
    }
    const channels: string[] = [];
    if (this.push) channels.push(translate('messages.viaPush', { count: this.counts.push }));
    if (this.email) channels.push(translate('messages.viaEmail', { count: this.counts.email }));

    const alert = await this.alertController.create({
      header: translate('messages.sendConfirm'),
      message: translate('messages.sendConfirmMessage', { title: this.title.trim(), count: this.counts.recipients, channels: channels.join(', ') }),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        { text: translate('messages.send'), handler: () => { void this.send(); } },
      ],
    });
    await alert.present();
  }

  private async send(): Promise<void> {
    if (this.sending) {
      return;
    }
    this.sending = true;
    const loading = await this.loadingController.create({ message: translate('messages.sendingNow') });
    await loading.present();
    try {
      const messageId = await this.messages.send({
        tenantId: this.db.tenant().id,
        title: this.title.trim(),
        content: this.content!,
        groupIds: this.groupIds,
        channels: { push: this.push, email: this.email },
      });
      try {
        localStorage.removeItem(this.draftKey);
      } catch {
        // ignore
      }
      Utils.showToast(translate('messages.isSending'), 'success');
      await this.modalController.dismiss(messageId, 'sent');
    } catch (e) {
      console.error('[message-compose] send failed:', e);
      Utils.showToast(translate('messages.sendFailed'), 'danger');
    } finally {
      await loading.dismiss();
      this.sending = false;
    }
  }

  private saveDraft(): void {
    try {
      localStorage.setItem(this.draftKey, JSON.stringify({ title: this.title, content: this.content } as Draft));
    } catch {
      // ignore
    }
  }
}
