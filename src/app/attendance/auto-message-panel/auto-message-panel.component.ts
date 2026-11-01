import { Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AlertController, IonicModule, ModalController } from '@ionic/angular/lazy';
import { TranslocoModule, translate } from '@jsverse/transloco';
import { DbService } from 'src/app/services/db.service';
import { AutoMessageService, formatTerminDate, textToDoc } from 'src/app/services/auto-message/auto-message.service';
import { MessageComposeComponent } from 'src/app/messages/message-compose/message-compose.component';
import { Attendance, AttendanceResponse, AutoMessageRule, AutoMessageRun, PersonAttendance } from 'src/app/utilities/interfaces';
import { AttendanceStatus, Role } from 'src/app/utilities/constants';
import { Utils } from 'src/app/utilities/Utils';

interface RuleState {
  rule: AutoMessageRule;
  run: AutoMessageRun | null;
  sendAt: Date;
}

type ResponseRow = AttendanceResponse;

/**
 * On a Termin (admins/responsibles): what the automatic messages do for it
 * ("goes out at 23:30" / "went to 4 people", suspend for this Termin), the
 * members' answers to confirm or reject, and "Unentschuldigte anschreiben".
 */
@Component({
  selector: 'app-auto-message-panel',
  standalone: true,
  imports: [CommonModule, IonicModule, TranslocoModule],
  templateUrl: './auto-message-panel.component.html',
  styleUrls: ['./auto-message-panel.component.scss'],
})
export class AutoMessagePanelComponent implements OnChanges {
  private db = inject(DbService);
  private service = inject(AutoMessageService);
  private modalController = inject(ModalController);
  private alertController = inject(AlertController);
  private router = inject(Router);

  @Input() attendance: Attendance | null = null;
  @Input() people: PersonAttendance[] = [];

  rules: RuleState[] = [];
  responses: ResponseRow[] = [];
  busy = new Set<string>();
  private loadedFor: number | null = null;

  get isManager(): boolean {
    return [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser()?.role);
  }

  /** Termin has started (messages and answers only make sense afterwards). */
  get started(): boolean {
    return !!this.attendance && this.startOf(this.attendance).getTime() <= Date.now();
  }

  get unexcused(): PersonAttendance[] {
    return this.people.filter(p => p.status === AttendanceStatus.Absent && p.person && !p.person.left);
  }

  get pending(): ResponseRow[] {
    return this.responses.filter(r => r.state === 'pending');
  }

  async ngOnChanges(): Promise<void> {
    if (!this.attendance?.id || !this.isManager) return;
    if (this.loadedFor === this.attendance.id) return;
    this.loadedFor = this.attendance.id;
    await this.load();
  }

  async load(): Promise<void> {
    if (!this.attendance?.id) return;
    try {
      const [rules, runs, responses] = await Promise.all([
        this.service.getRules(this.db.tenant().id),
        this.service.getRunsForAttendance(this.attendance.id),
        this.service.getResponsesForAttendance(this.attendance.id),
      ]);
      const end = this.endOf(this.attendance);
      this.rules = rules
        .filter(r => !r.type_ids?.length || r.type_ids.includes(this.attendance!.type_id))
        .map(rule => ({ rule, run: runs.find(x => x.rule_id === rule.id) ?? null, sendAt: new Date(end.getTime() + rule.delay_minutes * 60_000) }))
        // Show rules that are on, plus anything that already happened for this Termin.
        .filter(s => (s.rule.enabled && (!s.rule.enabled_at || end >= new Date(s.rule.enabled_at))) || s.run);
      this.responses = responses;
    } catch (e) {
      console.error('[auto-message-panel] load failed:', e);
    }
  }

  nameOf(r: ResponseRow): string {
    const p = this.people.find(x => x.id === r.person_attendance_id);
    if (!p) return '';
    return (p.person ? `${p.person.firstName ?? ''} ${p.person.lastName ?? ''}` : `${p.firstName ?? ''} ${p.lastName ?? ''}`).trim();
  }

  isFuture(s: RuleState): boolean {
    return !s.run && s.sendAt.getTime() > Date.now();
  }

  async suspend(s: RuleState): Promise<void> {
    if (!this.attendance?.id) return;
    const me = this.db.teamPerson();
    const name = me ? `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() : (this.db.user?.email ?? '');
    try {
      await this.service.suspend(s.rule, this.attendance.id, this.db.user.id, name);
      await this.load();
    } catch (e) {
      console.error('[auto-message-panel] suspend failed:', e);
      Utils.showToast(translate('autoMessages.saveFailed'), 'danger');
    }
  }

  async unsuspend(s: RuleState): Promise<void> {
    if (!s.run) return;
    try {
      await this.service.unsuspend(s.run.id);
      await this.load();
    } catch (e) {
      console.error('[auto-message-panel] unsuspend failed:', e);
      Utils.showToast(translate('autoMessages.saveFailed'), 'danger');
    }
  }

  openRun(s: RuleState): void {
    if (s.run?.message_id) {
      void this.router.navigateByUrl(`/tabs/messages/${s.run.message_id}`);
    } else {
      void this.router.navigateByUrl(`/tabs/settings/auto-messages/${s.rule.id}?tab=history`);
    }
  }

  async decide(r: ResponseRow, accept: boolean): Promise<void> {
    if (this.busy.has(r.id)) return;
    const alert = await this.alertController.create({
      header: this.nameOf(r),
      message: translate(accept
        ? (r.kind === 'was_present' ? 'autoMessages.decideAcceptPresent' : 'autoMessages.decideAcceptReason')
        : 'autoMessages.decideReject'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate(accept ? (r.kind === 'was_present' ? 'autoMessages.setPresent' : 'autoMessages.excuse') : 'autoMessages.reject'),
          role: accept ? undefined : 'destructive',
          handler: () => { void this.doDecide(r, accept); },
        },
      ],
    });
    await alert.present();
  }

  private async doDecide(r: ResponseRow, accept: boolean): Promise<void> {
    this.busy.add(r.id);
    try {
      await this.service.decideResponse(r.id, accept);
      r.state = accept ? 'accepted' : 'rejected';
      Utils.showToast(translate(accept ? 'autoMessages.decidedAccepted' : 'autoMessages.decidedRejected'), 'success');
    } catch (e) {
      console.error('[auto-message-panel] decide failed:', e);
      Utils.showToast(translate('autoMessages.saveFailed'), 'danger');
    } finally {
      this.busy.delete(r.id);
    }
  }

  async writeUnexcused(): Promise<void> {
    if (!this.attendance) return;
    const people = this.unexcused;
    if (!people.length) return;
    const typeName = this.db.attendanceTypes().find(t => t.id === this.attendance!.type_id)?.name ?? '';
    const vars = {
      termin: this.attendance.typeInfo || typeName,
      datum: formatTerminDate(this.attendance.date),
      instanz: this.db.tenant()?.longName || this.db.tenant()?.shortName || '',
    };
    const modal = await this.modalController.create({
      component: MessageComposeComponent,
      componentProps: {
        playerIds: people.map(p => p.person_id),
        attendanceId: this.attendance.id,
        allowResponses: true,
        recipientsLabel: translate('autoMessages.manualRecipients', { count: people.length }),
        presetTitle: translate('autoMessages.manualTitle', vars),
        presetContent: textToDoc(translate('autoMessages.manualBody', vars)),
      },
    });
    await modal.present();
  }

  private startOf(att: Attendance): Date {
    const type = this.db.attendanceTypes().find(t => t.id === att.type_id);
    const d = new Date(att.date);
    const time = att.start_time || type?.start_time;
    if (!time || type?.all_day) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }

  private endOf(att: Attendance): Date {
    const type = this.db.attendanceTypes().find(t => t.id === att.type_id);
    const start = this.startOf(att);
    const days = Math.max(1, Number(att.duration_days) || 1);
    const endTime = att.end_time || type?.end_time;
    if (type?.all_day || (!att.start_time && !type?.start_time && !endTime)) {
      const d = new Date(start);
      d.setDate(d.getDate() + days);
      return d;
    }
    if (!endTime) return new Date(start.getTime() + 2 * 3600_000);
    const [h, m] = endTime.split(':').map(Number);
    const end = new Date(start);
    end.setDate(end.getDate() + days - 1);
    end.setHours(h, m, 0, 0);
    return end <= start ? new Date(end.getTime() + 86400_000) : end;
  }
}
