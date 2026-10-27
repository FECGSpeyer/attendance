import { dateFmt } from '../../i18n/languages';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ActionSheetController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { AGENDA_ITEMS_PLACEHOLDER_ID, Attendance, FieldSelection, Plan, Song } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { DbService } from '../../services/db.service';
import { fieldDisplayName, topNumbers } from '../../team-organization/team-org.utils';
import { allPlans, planDate, planLabel, todayPlanIndex } from '../../utilities/plan-days';
import { PlanChipsComponent } from '../plan-chips/plan-chips.component';
import { groupDuration, isGroupHead } from '../../utilities/plan-groups';
import { openPlanShareSheet } from '../plan-share-sheet/plan-share-sheet.component';
import { translate, TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-plan-viewer',
  templateUrl: './plan-viewer.component.html',
  styleUrls: ['./plan-viewer.component.scss'],
  standalone: true,
  imports: [TranslocoModule, CommonModule, IonicModule, PlanChipsComponent]
})
export class PlanViewerComponent implements OnInit, OnDestroy {
  @Input() attendance: Partial<Attendance>;
  @Input() plan: Plan;
  @Input() isPractice = true;
  @Input() playerInstrument: number;
  @Input() songs: Song[] = [];
  @Input() defaultLive = false;
  /** Shows an edit button; the viewer then closes with role 'edit' and `{ planIndex }` so the opener can open the editor. */
  @Input() canEdit = false;

  public hasChatId = false;
  readonly AGENDA_ITEMS_PLACEHOLDER_ID = AGENDA_ITEMS_PLACEHOLDER_ID;
  public liveMode = false;
  public activeFieldIndex = -1;
  private liveInterval: any;
  /** Several plans of one Termin (e.g. one per day): chip labels, empty with a single plan. */
  public planLabels: string[] = [];
  public planIndex = 0;
  public todayIndex = -1;

  constructor(
    private modalController: ModalController,
    private actionSheetController: ActionSheetController,
    public db: DbService
  ) {}

  ngOnInit() {
    this.hasChatId = Boolean(this.db.tenantUser()?.telegram_chat_id);
    const plans = allPlans(this.attendance);
    if (plans.length > 1 && (!this.plan || this.plan === this.attendance.plan)) {
      this.planLabels = plans.map((_, i) => planLabel(this.attendance, i, plans));
      this.planIndex = todayPlanIndex(this.attendance);
      this.todayIndex = planDate(this.attendance, this.planIndex, plans).isSame(dayjs(), 'day') ? this.planIndex : -1;
      this.plan = plans[this.planIndex];
    }
    if (this.defaultLive || this.isLiveNow()) {
      this.toggleLive();
    }
  }

  /** "TOP n · Titel" for agenda fields, plain name otherwise. */
  fieldName(field: FieldSelection): string {
    return fieldDisplayName(field, topNumbers(this.plan?.fields));
  }

  ngOnDestroy() {
    this.stopLive();
  }

  dismiss() {
    this.modalController.dismiss();
  }

  edit() {
    this.modalController.dismiss({ planIndex: this.planIndex }, 'edit');
  }

  /** Date of the shown plan (Termin date plus its day). */
  currentDate(): dayjs.Dayjs {
    return this.planLabels.length ? planDate(this.attendance, this.planIndex) : dayjs(this.attendance?.date);
  }

  selectPlan(index: number) {
    this.stopLive();
    this.hasAutoScrolled = false;
    this.planIndex = index;
    this.plan = allPlans(this.attendance)[index];
    if (this.isLiveNow()) {
      this.toggleLive();
    }
  }

  isLiveNow(): boolean {
    if (!this.attendance?.date || !this.plan?.time || !this.plan?.fields?.length) { return false; }
    const now = dayjs();
    if (!now.isSame(this.currentDate(), 'day')) { return false; }
    const timeBase = dayjs(this.plan.time).isValid()
      ? dayjs(this.plan.time)
      : dayjs().hour(Number(this.plan.time.substring(0, 2))).minute(Number(this.plan.time.substring(3, 5)));
    const start = this.currentDate().hour(timeBase.hour()).minute(timeBase.minute()).second(0);
    const totalMinutes = this.plan.fields.reduce((s, f) => s + (Number(f.time) || 0), 0);
    const end = start.add(totalMinutes, 'minute');
    return now.isAfter(start.subtract(5, 'minute')) && now.isBefore(end.add(15, 'minute'));
  }

  toggleLive() {
    this.liveMode = !this.liveMode;
    if (this.liveMode) {
      this.updateActiveIndex();
      this.liveInterval = setInterval(() => this.updateActiveIndex(), 1000);
    } else {
      this.stopLive();
    }
  }

  private stopLive() {
    if (this.liveInterval) { clearInterval(this.liveInterval); this.liveInterval = null; }
    this.activeFieldIndex = -1;
    this.liveStart = null;
    this.liveMode = false;
  }

  updateActiveIndex() {
    if (!this.plan?.fields?.length || !this.plan.time || !this.attendance?.date) {
      this.activeFieldIndex = -1;
      return;
    }
    const now = dayjs();
    const timeBase = dayjs(this.plan.time).isValid()
      ? dayjs(this.plan.time)
      : dayjs().hour(Number(this.plan.time.substring(0, 2))).minute(Number(this.plan.time.substring(3, 5)));
    let t = this.currentDate().hour(timeBase.hour()).minute(timeBase.minute()).second(0);
    // Not started yet: nothing is running, the Start row counts down instead.
    this.liveStart = t;
    if (now.isBefore(t)) {
      this.activeFieldIndex = -1;
      return;
    }
    for (let i = 0; i < this.plan.fields.length; i++) {
      // A Programmblock head takes no time; its Unterpunkte become active instead.
      if (isGroupHead(this.plan.fields[i])) { continue; }
      t = t.add(Number(this.plan.fields[i].time) || 0, 'minute');
      if (now.isBefore(t)) {
        this.activeFieldIndex = i;
        this.scrollToActive();
        return;
      }
    }
    this.activeFieldIndex = this.plan.fields.length - 1;
    this.scrollToActive();
  }

  private hasAutoScrolled = false;

  private scrollToActive() {
    if (this.hasAutoScrolled) { return; }
    setTimeout(() => {
      const el = document.querySelector('.active-slot');
      if (!el) { return; }
      this.hasAutoScrolled = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  readonly isGroupHead = isGroupHead;

  groupMinutes(head: FieldSelection): number {
    return groupDuration(this.plan?.fields ?? [], head.id);
  }

  /** Block head whose Unterpunkt is running right now. */
  isActiveGroup(head: FieldSelection): boolean {
    const active = this.plan?.fields?.[this.activeFieldIndex];
    return this.liveMode && !!active && active.groupId === head.id;
  }

  /** "10:37 – 10:55" for a block head. */
  groupRange(head: FieldSelection, index: number): string {
    const start = this.calculateTime({ ...head, conductor: '' }, index).trim();
    if (!start) { return ''; }
    const [h, m] = start.split(':').map(Number);
    return `${start} – ${dayjs().hour(h).minute(m).add(this.groupMinutes(head), 'minute').format('HH:mm')}`;
  }

  calculateTime(field: FieldSelection, index: number): string {
    if (!this.plan?.time) {return '';}

    let minutesToAdd = 0;
    let currentIndex = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.plan.fields[currentIndex].time);
      currentIndex++;
    }

    const time = dayjs(this.plan.time).isValid()
      ? dayjs(this.plan.time)
      : dayjs().hour(Number(this.plan.time.substring(0, 2))).minute(Number(this.plan.time.substring(3, 5)));

    return `${time.add(minutesToAdd, 'minute').format('HH:mm')} ${field.conductor ? `| ${field.conductor}` : ''}`;
  }

  /** Start of the shown plan while live mode is on. */
  private liveStart: dayjs.Dayjs | null = null;

  /** "in 04:12" on the Start row while live mode is on and the plan hasn't started. */
  getStartCountdown(): string {
    if (!this.liveMode || !this.liveStart) { return ''; }
    const remaining = this.liveStart.diff(dayjs(), 'second');
    if (remaining <= 0) { return ''; }
    if (remaining < 60) { return 'beginnt gleich'; }
    const minutes = Math.ceil(remaining / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) { return `beginnt in ${m} Min.`; }
    return m > 0 ? `beginnt in ${h} Std. ${m} Min.` : `beginnt in ${h} Std.`;
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  getActiveCountdown(): string {
    if (!this.liveMode || this.activeFieldIndex < 0 || !this.plan?.fields || !this.plan.time || !this.attendance?.date) { return ''; }
    const timeBase = dayjs(this.plan.time).isValid()
      ? dayjs(this.plan.time)
      : dayjs().hour(Number(this.plan.time.substring(0, 2))).minute(Number(this.plan.time.substring(3, 5)));
    let t = this.currentDate().hour(timeBase.hour()).minute(timeBase.minute()).second(0);
    for (let i = 0; i <= this.activeFieldIndex; i++) {
      t = t.add(Number(this.plan.fields[i].time) || 0, 'minute');
    }
    return this.formatDuration(Math.max(0, t.diff(dayjs(), 'second')));
  }

  getEndTime(): string {
    if (!this.plan?.end) {return '';}

    const end = dayjs(this.plan.end).isValid()
      ? dayjs(this.plan.end)
      : dayjs().hour(Number(this.plan.end.substring(0, 2))).minute(Number(this.plan.end.substring(3, 5)));

    return end.format('HH:mm');
  }

  getStartTime(): string {
    if (!this.plan?.time) {return '';}

    const time = dayjs(this.plan.time).isValid()
      ? dayjs(this.plan.time)
      : dayjs().hour(Number(this.plan.time.substring(0, 2))).minute(Number(this.plan.time.substring(3, 5)));

    return time.format('HH:mm');
  }

  getDateFormatted(): string {
    if (!this.attendance?.date) {return '';}
    return this.currentDate().format(dateFmt());
  }

  isInstrumentMissing(field: FieldSelection): boolean {
    if (!field.songId || !this.playerInstrument || !this.songs?.length) {
      return false;
    }

    const song = this.songs.find((s: Song) => s.id === field.songId);
    if (!song || !song.instrument_ids || !song.instrument_ids.length) {
      return false;
    }

    return !song.instrument_ids.includes(this.playerInstrument);
  }

  async showExportOptions() {
    if (this.planLabels.length) {
      const choice = await openPlanShareSheet(this.modalController, {
        currentLabel: this.planLabels[this.planIndex],
        planCount: this.planLabels.length,
        hasChatId: this.hasChatId,
      });
      if (!choice) { return; }
      const indexes = choice.scope === 'all' ? this.planLabels.map((_, i) => i) : [this.planIndex];
      const sideBySide = choice.action === 'pdf2x' || choice.action === 'telegram2x';
      const asBlob = choice.action.startsWith('telegram');
      const asImage = choice.action === 'telegramImage';
      const { blob, name } = await Utils.exportAttendancePlans({
        attendance: this.attendance,
        type: this.db.attendanceTypes().find(type => type.id === this.attendance.type_id),
        indexes,
        sideBySide,
        asBlob,
        asImage,
        branding: await Utils.buildTenantBranding(this.db.getBrandingSource()),
      });
      if (asBlob && blob) {
        this.db.sendPlanPerTelegram(blob, name, asImage);
        Utils.showToast(translate('planning.sendingTelegram'), 'success');
      }
      return;
    }
    const buttons: any[] = [
      {
        text: translate('planning.exportPdf'),
        handler: () => this.exportPdf()
      },
      {
        text: translate('planning.exportPdfA5'),
        handler: () => this.exportPdf(true)
      }
    ];

    if (this.hasChatId) {
      buttons.push({
        text: translate('attendance.telegramPdf'),
        handler: () => this.sendTelegram(false)
      });
      buttons.push({
        text: translate('attendance.telegramPdfA5'),
        handler: () => this.sendTelegram(false, true)
      });
      buttons.push({
        text: translate('attendance.telegramImage'),
        handler: () => this.sendTelegram(true)
      });
    }

    buttons.push({
      text: translate('common.cancel'),
      role: 'destructive'
    });

    const actionSheet = await this.actionSheetController.create({
      header: translate('planning.export'),
      buttons
    });

    await actionSheet.present();
  }

  async exportPdf(sideBySide: boolean = false) {
    if (!this.plan?.fields?.length) {
      Utils.showToast(translate('planning.noPlan'), 'warning');
      return;
    }

    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    const planningTitle = this.plan?.title?.trim() || Utils.getPlanningTitle(type, this.attendance.typeInfo);

    await Utils.createPlanExport({
      time: this.plan.time,
      end: this.plan.end,
      fields: this.plan.fields,
      attendance: this.attendance?.id,
      attendances: this.attendance ? [this.attendance] : [],
      sideBySide,
      branding: await Utils.buildTenantBranding(this.db.getBrandingSource()),
    }, planningTitle);
  }

  async sendTelegram(asImage: boolean, sideBySide: boolean = false) {
    if (!this.plan?.fields?.length) {
      Utils.showToast(translate('planning.noPlan'), 'warning');
      return;
    }

    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    const planningTitle = this.plan?.title?.trim() || Utils.getPlanningTitle(type, this.attendance.typeInfo);
    const name = this.attendance?.date
      ? this.currentDate().format('DD_MM_YYYY')
      : dayjs().format('DD_MM_YYYY');

    const blob = await Utils.createPlanExport({
      time: this.plan.time,
      end: this.plan.end,
      fields: this.plan.fields,
      asBlob: true,
      asImage,
      sideBySide,
      attendance: this.attendance?.id,
      attendances: this.attendance ? [this.attendance] : [],
      branding: await Utils.buildTenantBranding(this.db.getBrandingSource()),
    }, planningTitle);

    this.db.sendPlanPerTelegram(
      blob,
      `${planningTitle.replace('(', '').replace(')', '')}_${name}${sideBySide ? '_2x' : ''}`,
      asImage
    );

    Utils.showToast(translate('planning.sendingTelegram'), 'success');
  }
}
