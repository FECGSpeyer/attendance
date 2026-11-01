import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular/lazy';
import { JSONContent } from '@tiptap/core';
import { translate } from '@jsverse/transloco';
import { DbService } from 'src/app/services/db.service';
import {
  AUTO_MESSAGE_PLACEHOLDERS,
  AUTO_MESSAGE_TEMPLATES,
  AutoMessageService,
  defaultAutoMessageRule,
  fillPlaceholders,
  formatTerminDate,
  templateText,
  textToDoc,
} from 'src/app/services/auto-message/auto-message.service';
import { MessageEditorComponent } from 'src/app/shared/message-editor/message-editor.component';
import { AttendanceType, AutoMessagePreviewTermin, AutoMessageRule, Group } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

interface HistoryRow {
  id: string;
  title: string;
  date: string;
  status: string;
  messageId: string | null;
  recipients: number;
  read: number;
  responses: number;
  by: string | null;
}

const DELAY_OPTIONS = [0, 30, 60, 120, 180, 360, 720, 1440, 2880];

/** Create or edit one rule of Automatische Nachrichten, with preview and history. */
@Component({
  selector: 'app-auto-message-rule',
  templateUrl: './auto-message-rule.page.html',
  styleUrls: ['./auto-message-rule.page.scss'],
  standalone: false
})
export class AutoMessageRulePage implements OnInit {
  private db = inject(DbService);
  private service = inject(AutoMessageService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private alertController = inject(AlertController);

  @ViewChild(MessageEditorComponent) editor?: MessageEditorComponent;

  rule: AutoMessageRule = defaultAutoMessageRule(0);
  saved: AutoMessageRule | null = null;
  loading = true;
  saving = false;
  tab: 'rule' | 'history' = 'rule';
  types: AttendanceType[] = [];
  groups: Group[] = [];
  templates = AUTO_MESSAGE_TEMPLATES;
  placeholders = AUTO_MESSAGE_PLACEHOLDERS;
  delayOptions = DELAY_OPTIONS;
  statusOptions = [4, 3, 0];
  initialContent: JSONContent | null = null;

  preview: AutoMessagePreviewTermin[] | null = null;
  previewLoading = false;
  previewError = false;
  history: HistoryRow[] = [];

  async ngOnInit(): Promise<void> {
    const tenantId = this.db.tenant().id;
    this.types = (this.db.attendanceTypes() ?? []).filter(t => t.visible !== false);
    this.groups = (this.db.groups() ?? []).filter(g => g.id !== undefined);
    const id = this.route.snapshot.paramMap.get('id');
    try {
      if (id && id !== 'new') {
        const rule = await this.service.getRule(id);
        if (rule) {
          this.rule = { ...rule };
          this.saved = rule;
          this.initialContent = (rule.body_json as JSONContent) ?? null;
          if (this.route.snapshot.queryParamMap.get('tab') === 'history') this.tab = 'history';
          await this.loadHistory();
        }
      } else {
        this.rule = defaultAutoMessageRule(tenantId);
        const template = this.route.snapshot.queryParamMap.get('template');
        if (template && AUTO_MESSAGE_TEMPLATES.includes(template)) {
          this.applyTemplatePreset(template);
        } else {
          this.rule.name = translate('autoMessages.tplName.absent');
        }
      }
    } catch (e) {
      console.error('[auto-message-rule] load failed:', e);
      Utils.showToast(translate('autoMessages.loadFailed'), 'danger');
    } finally {
      this.loading = false;
    }
  }

  get isNew(): boolean {
    return !this.rule.id;
  }

  /** Presets for the quick-start templates on the list page. */
  private applyTemplatePreset(template: string): void {
    this.rule.name = translate(`autoMessages.tplName.${template}`);
    this.rule.template_key = template;
    if (template === 'late') this.rule.statuses = [3];
    if (template === 'noAnswer') this.rule.statuses = [0];
    if (template === 'streak') {
      this.rule.frequency = 'streak';
      this.rule.frequency_count = 2;
    }
  }

  // --- Form helpers ----------------------------------------------------------

  hasStatus(status: number): boolean {
    return this.rule.statuses.includes(status);
  }

  toggleStatus(status: number): void {
    this.rule.statuses = this.hasStatus(status)
      ? this.rule.statuses.filter(s => s !== status)
      : [...this.rule.statuses, status];
    this.preview = null;
  }

  hasType(id: string): boolean {
    return !!this.rule.type_ids?.includes(id);
  }

  toggleType(id: string): void {
    const ids = this.rule.type_ids ?? [];
    const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    this.rule.type_ids = next.length ? next : null;
    this.preview = null;
  }

  hasGroup(id: number): boolean {
    return !!this.rule.group_ids?.includes(id);
  }

  toggleGroup(id: number): void {
    const ids = this.rule.group_ids ?? [];
    const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    this.rule.group_ids = next.length ? next : null;
    this.preview = null;
  }

  hasChannel(channel: string): boolean {
    return this.rule.channels.includes(channel);
  }

  setChannel(channel: string, on: boolean): void {
    this.rule.channels = on
      ? Array.from(new Set([...this.rule.channels, channel]))
      : this.rule.channels.filter(c => c !== channel);
  }

  changeCount(field: 'frequency_count' | 'frequency_days', delta: number): void {
    const max = field === 'frequency_count' ? 50 : 365;
    this.rule[field] = Math.min(max, Math.max(field === 'frequency_count' ? 2 : 1, this.rule[field] + delta));
    this.preview = null;
  }

  delayLabel(minutes: number): string {
    if (minutes === 0) return translate('autoMessages.delayNone');
    return minutes % 60 === 0
      ? translate('autoMessages.delayHours', { count: minutes / 60 })
      : translate('autoMessages.delayMinutes', { count: minutes });
  }

  onFrequencyChange(value: string): void {
    this.rule.frequency = value as AutoMessageRule['frequency'];
    this.preview = null;
  }

  // --- Text ------------------------------------------------------------------

  templateTitle(key = this.rule.template_key): string {
    return templateText(`autoMessages.tpl.${key}.title`);
  }

  templateBody(key = this.rule.template_key): string {
    return templateText(`autoMessages.tpl.${key}.body`);
  }

  /** Template text with sample values, as members would see it. */
  get sample(): { title: string; body: string } {
    const vars = {
      vorname: translate('autoMessages.sampleFirstName'),
      name: translate('autoMessages.sampleName'),
      termin: this.types.find(t => this.rule.type_ids?.includes(t.id!))?.name ?? this.types[0]?.name ?? translate('autoMessages.sampleTermin'),
      datum: formatTerminDate(new Date().toISOString().slice(0, 10)),
      uhrzeit: '19:30',
      instanz: this.db.tenant()?.longName || this.db.tenant()?.shortName || '',
      anzahl: this.rule.frequency_count,
    };
    if (this.rule.use_template) {
      return { title: fillPlaceholders(this.templateTitle(), vars), body: fillPlaceholders(this.templateBody(), vars) };
    }
    return { title: fillPlaceholders(this.rule.title ?? '', vars), body: '' };
  }

  setTextMode(value: string): void {
    const custom = value === 'custom';
    if (custom && !this.rule.body_json) {
      // Start the own text from the chosen template.
      this.rule.title = this.templateTitle();
      this.rule.body_json = textToDoc(this.templateBody());
      this.initialContent = this.rule.body_json as JSONContent;
      setTimeout(() => this.editor?.setContent(this.initialContent!));
    }
    this.rule.use_template = !custom;
  }

  resetToTemplate(): void {
    this.rule.title = this.templateTitle();
    this.rule.body_json = textToDoc(this.templateBody());
    this.editor?.setContent(this.rule.body_json as JSONContent);
  }

  onContentChange(content: JSONContent): void {
    this.rule.body_json = content as Record<string, unknown>;
  }

  placeholderLabel(name: string): string {
    return `{${name}}`;
  }

  insertPlaceholder(name: string): void {
    this.editor?.insertText(`{${name}}`);
  }

  // --- Preview ---------------------------------------------------------------

  async loadPreview(): Promise<void> {
    this.previewLoading = true;
    this.previewError = false;
    try {
      this.preview = await this.service.preview(this.db.tenant().id, this.rule);
    } catch (e) {
      console.error('[auto-message-rule] preview failed:', e);
      this.previewError = true;
    } finally {
      this.previewLoading = false;
    }
  }

  groupName(id: number | null): string {
    return this.groups.find(g => g.id === id)?.name ?? '';
  }

  // --- Save / delete ---------------------------------------------------------

  get problems(): string[] {
    const p: string[] = [];
    if (!this.rule.name.trim()) p.push(translate('autoMessages.errName'));
    if (!this.rule.statuses.length) p.push(translate('autoMessages.errStatus'));
    if (!this.rule.channels.length) p.push(translate('autoMessages.errChannel'));
    if (!this.rule.use_template && (!this.rule.title?.trim() || !JSON.stringify(this.rule.body_json ?? {}).includes('"text"'))) {
      p.push(translate('autoMessages.errText'));
    }
    return p;
  }

  async save(): Promise<void> {
    if (this.saving) return;
    if (this.problems.length) {
      Utils.showToast(this.problems[0], 'warning');
      return;
    }
    this.saving = true;
    try {
      const rule = { ...this.rule, name: this.rule.name.trim(), title: this.rule.title?.trim() || null };
      const saved = await this.service.saveRule(rule, this.saved, this.db.user.id);
      this.rule = { ...saved };
      this.saved = saved;
      Utils.showToast(translate('autoMessages.saved'), 'success');
      await this.router.navigateByUrl('/tabs/settings/auto-messages');
    } catch (e) {
      console.error('[auto-message-rule] save failed:', e);
      Utils.showToast(translate('autoMessages.saveFailed'), 'danger');
    } finally {
      this.saving = false;
    }
  }

  async remove(): Promise<void> {
    if (!this.rule.id) return;
    const alert = await this.alertController.create({
      header: translate('autoMessages.deleteConfirm'),
      message: translate('autoMessages.deleteHint'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.deleteRule(this.rule.id!);
              await this.router.navigateByUrl('/tabs/settings/auto-messages');
            } catch (e) {
              console.error('[auto-message-rule] delete failed:', e);
              Utils.showToast(translate('autoMessages.saveFailed'), 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // --- History ---------------------------------------------------------------

  async loadHistory(): Promise<void> {
    if (!this.rule.id) return;
    const runs = await this.service.getRuns(this.rule.id);
    const atts = await this.service.getAttendanceInfo(runs.map(r => r.attendance_id));
    const messageIds = runs.map(r => r.message_id).filter(Boolean) as string[];
    const recipients = await this.service.getRecipientsOf(messageIds);
    const responses = await this.service.getResponsesForMessages(messageIds);
    this.history = runs.map(run => {
      const att = atts.find(a => a.id === run.attendance_id);
      const mine = recipients.filter(r => r.message_id === run.message_id);
      return {
        id: run.id,
        title: att?.typeInfo || this.types.find(t => t.id === att?.type_id)?.name || '',
        date: att?.date ?? run.created_at,
        status: run.status,
        messageId: run.message_id,
        recipients: run.recipient_count,
        read: mine.filter(r => r.read_at || r.email_opened_at).length,
        responses: responses.filter(x => x.message_id === run.message_id).length,
        by: run.created_by_name,
      };
    });
  }

  get totals(): { sent: number; read: number; responses: number } {
    const sent = this.history.filter(h => h.status === 'sent');
    return {
      sent: sent.reduce((s, h) => s + h.recipients, 0),
      read: sent.reduce((s, h) => s + h.read, 0),
      responses: sent.reduce((s, h) => s + h.responses, 0),
    };
  }

  openMessage(row: HistoryRow): void {
    if (row.messageId) void this.router.navigateByUrl(`/tabs/messages/${row.messageId}`);
  }
}
