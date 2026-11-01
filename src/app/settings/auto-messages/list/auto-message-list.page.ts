import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { translate } from '@jsverse/transloco';
import { DbService } from 'src/app/services/db.service';
import { AUTO_MESSAGE_TEMPLATES, AutoMessageService } from 'src/app/services/auto-message/auto-message.service';
import { AutoMessageRule } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

interface RuleRow extends AutoMessageRule {
  summary: string;
  chips: string[];
}

/** Settings › Automatische Nachrichten: the tenant's rules (admins/responsibles). */
@Component({
  selector: 'app-auto-message-list',
  templateUrl: './auto-message-list.page.html',
  styleUrls: ['./auto-message-list.page.scss'],
  standalone: false
})
export class AutoMessageListPage implements OnInit {
  private db = inject(DbService);
  private service = inject(AutoMessageService);
  private router = inject(Router);

  rules: RuleRow[] = [];
  loading = true;
  templates = AUTO_MESSAGE_TEMPLATES;
  lastWeek = { sent: 0, people: 0 };

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.loading) await this.load();
  }

  async handleRefresh(event: CustomEvent): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  async load(): Promise<void> {
    try {
      const tenantId = this.db.tenant().id;
      const rules = await this.service.getRules(tenantId);
      this.rules = rules.map(r => ({ ...r, summary: this.summary(r), chips: this.chips(r) }));
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const runs = (await this.service.getRecentRuns(tenantId, since)).filter(r => r.status === 'sent');
      this.lastWeek = { sent: runs.length, people: runs.reduce((sum, r) => sum + r.recipient_count, 0) };
    } catch (e) {
      console.error('[auto-messages] load failed:', e);
      Utils.showToast(translate('autoMessages.loadFailed'), 'danger');
    } finally {
      this.loading = false;
    }
  }

  open(rule: AutoMessageRule): void {
    void this.router.navigateByUrl(`/tabs/settings/auto-messages/${rule.id}`);
  }

  create(template?: string): void {
    void this.router.navigate(['/tabs/settings/auto-messages/new'], template ? { queryParams: { template } } : {});
  }

  async toggle(rule: RuleRow, event: CustomEvent): Promise<void> {
    const enabled = !!event.detail.checked;
    try {
      const saved = await this.service.setEnabled(rule, enabled);
      Object.assign(rule, saved);
      Utils.showToast(translate(enabled ? 'autoMessages.enabledToast' : 'autoMessages.disabledToast'), 'success');
    } catch (e) {
      console.error('[auto-messages] toggle failed:', e);
      rule.enabled = !enabled;
      Utils.showToast(translate('autoMessages.saveFailed'), 'danger');
    }
  }

  private summary(rule: AutoMessageRule): string {
    const statuses = rule.statuses.map(s => translate(`autoMessages.status.${s}`)).join(', ');
    const types = rule.type_ids?.length
      ? rule.type_ids.map(id => this.db.attendanceTypes().find(t => t.id === id)?.name).filter(Boolean).join(', ')
      : translate('autoMessages.allTypes');
    const freq = rule.frequency === 'streak'
      ? translate('autoMessages.freqStreakShort', { count: rule.frequency_count })
      : rule.frequency === 'window'
        ? translate('autoMessages.freqWindowShort', { count: rule.frequency_count, days: rule.frequency_days })
        : '';
    return [statuses + (freq ? `, ${freq}` : ''), types, this.delayText(rule.delay_minutes)].join(' · ');
  }

  private chips(rule: AutoMessageRule): string[] {
    const chips: string[] = [];
    if (rule.channels.includes('push')) chips.push(translate('autoMessages.chipPush'));
    if (rule.channels.includes('email')) chips.push(translate('autoMessages.chipEmail'));
    if (rule.allow_responses) chips.push(translate('autoMessages.chipResponses'));
    if (rule.copy_responsibles || rule.copy_voice_leaders) chips.push(translate('autoMessages.chipCopy'));
    return chips;
  }

  delayText(minutes: number): string {
    return minutes % 60 === 0
      ? translate('autoMessages.delayHours', { count: minutes / 60 })
      : translate('autoMessages.delayMinutes', { count: minutes });
  }
}
