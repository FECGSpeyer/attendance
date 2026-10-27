import { Component, ViewChild, effect } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetButton, ActionSheetController, ModalController } from '@ionic/angular/lazy';
import { translate } from '@jsverse/transloco';
import { AttendancePage } from '../../../attendance/attendance/attendance.page';
import { ExcuseReasonPickerComponent } from '../../../shared/excuse-reason-picker/excuse-reason-picker.component';
import { TrackingEvent, TrackingService } from '../../../services/tracking/tracking.service';
import { DEFAULT_ABSENCE_REASONS, DEFAULT_LATE_REASONS } from '../../../utilities/constants';
import { attendanceHasEnded, attendanceIsRunning } from '../../../utilities/plan-days';
import { quickActions, signinKind } from '../../../utilities/self-actions';
import dayjs from 'dayjs';
import { DbService } from '../../../services/db.service';
import { CrossTenantPersonAttendance } from '../../../utilities/interfaces';
import { calendarMark, CalendarMark, dayKey, groupByDay, mergeCalendarEntries } from '../../../utilities/calendar';
import { eventTimeRange, statusColor, statusLabel } from '../../../utilities/event-list';
import { Utils } from '../../../utilities/Utils';
import { currentLanguage, dateFmt } from '../../../i18n/languages';

/** Week of Termine across all instances of the user; tapping "Monat" opens the Übersicht calendar. */
@Component({
  selector: 'app-calendar-card',
  templateUrl: './calendar-card.component.html',
  styleUrls: ['./calendar-card.component.scss'],
  standalone: false,
})
export class CalendarCardComponent {
  @ViewChild('excusePicker') excusePicker: ExcuseReasonPickerComponent;
  public absenceReasons: string[] = DEFAULT_ABSENCE_REASONS;
  public lateReasons: string[] = DEFAULT_LATE_REASONS;
  private pending: CrossTenantPersonAttendance | null = null;
  public entries: CrossTenantPersonAttendance[] = [];
  public selectedDay = dayKey(dayjs());
  public loading = true;
  private byDay = new Map<string, CrossTenantPersonAttendance[]>();
  private loadDone = false;

  constructor(
    public db: DbService,
    private router: Router,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
    private tracking: TrackingService,
  ) {
    effect(() => {
      if (this.db.tenants() && this.db.tenantUsers() && !this.loadDone) {
        this.loadDone = true;
        this.load(false);
      }
    });
  }

  async load(forceRefresh = true): Promise<void> {
    // Spinner only on the first load, so the excuse picker stays mounted on reloads.
    this.loading = !this.entries.length;
    try {
      const [own, managed] = await Promise.all([
        this.db.loadAllPersonAttendancesAcrossTenants(forceRefresh),
        this.db.loadManagedEventsAcrossTenants(),
      ]);
      this.entries = mergeCalendarEntries(own, managed);
      this.byDay = groupByDay(this.entries);
    } finally {
      this.loading = false;
    }
  }

  get dayEntries(): CrossTenantPersonAttendance[] {
    return this.byDay.get(this.selectedDay) ?? [];
  }

  get selectedDayLabel(): string {
    return dayjs(this.selectedDay).locale(currentLanguage()).format(`dddd, ${dateFmt('dayMonth')}`);
  }

  title(att: CrossTenantPersonAttendance): string {
    return att.title || Utils.getReadableDate(att.date, att.attendanceType);
  }

  time(att: CrossTenantPersonAttendance): string {
    return eventTimeRange(att.attendance?.start_time ?? att.attendanceType?.start_time, att.attendance?.end_time ?? att.attendanceType?.end_time);
  }

  statusColor(att: CrossTenantPersonAttendance): string {
    return statusColor(att.status);
  }

  statusLabel(att: CrossTenantPersonAttendance): string {
    return statusLabel(att.status, this.isPast(att));
  }

  mark(att: CrossTenantPersonAttendance): CalendarMark {
    return calendarMark(att);
  }

  openMonth(day?: string): void {
    this.router.navigate(['/tabs/overview'], { queryParams: { view: 'calendar', from: 'dashboard', ...(day ? { day } : {}) } });
  }

  isPast(att: CrossTenantPersonAttendance): boolean {
    return attendanceHasEnded(att);
  }

  /** Own Termin: Zusagen/Verspätung/Absagen; Termin of the current instance: open it; else the month. */
  async open(att: CrossTenantPersonAttendance): Promise<void> {
    if (att.eventOnly) {
      if (att.tenantId === this.db.tenant()?.id) {
        await this.openAttendance(att.attId);
      } else {
        this.openMonth(this.selectedDay);
      }
      return;
    }

    const qa = quickActions(att);
    const past = this.isPast(att);
    const buttons: ActionSheetButton[] = [];
    if (!past && qa.canSignin) {
      buttons.push({ text: translate('signout.accept'), handler: () => { void this.signin(att); } });
    }
    if (!past && qa.allowLate && !qa.blocked) {
      buttons.push({ text: translate('signout.lateButton'), handler: () => this.excuse(att, true) });
    }
    if (!past && qa.allowExcuse && !qa.blocked) {
      buttons.push({ text: translate('signout.decline'), handler: () => this.excuse(att, false) });
    }
    buttons.push({ text: translate('calendar.openMonth'), handler: () => this.openMonth(this.selectedDay) });
    buttons.push({ text: translate('common.cancel'), role: 'cancel' });

    const sheet = await this.actionSheetController.create({ header: this.title(att), subHeader: att.tenantName, buttons });
    await sheet.present();
  }

  private async signin(att: CrossTenantPersonAttendance): Promise<void> {
    await this.db.signin(att.id!, signinKind(att), '');
    this.tracking.track(TrackingEvent.AttendanceCheckIn);
    Utils.showToast(translate('signout.gladYouCome'), 'success', 4000);
    await this.load();
  }

  private excuse(att: CrossTenantPersonAttendance, isLate: boolean): void {
    // Reasons come from the Termin's instance, not the one currently selected.
    const tenant = this.db.tenants()?.find(t => t.id === att.tenantId);
    this.absenceReasons = tenant?.absence_reasons?.length ? tenant.absence_reasons : DEFAULT_ABSENCE_REASONS;
    this.lateReasons = tenant?.late_reasons?.length ? tenant.late_reasons : DEFAULT_LATE_REASONS;
    this.pending = att;
    void this.excusePicker.open(isLate, attendanceIsRunning(att));
  }

  async onExcuseConfirm({ reason, isLate }: { reason: string; isLate: boolean }): Promise<void> {
    if (!this.pending) { return; }
    await this.db.signout([this.pending.id!], reason, isLate);
    this.tracking.track(TrackingEvent.AttendanceCheckOut, { count: 1, isLate });
    Utils.showToast(translate(isLate ? 'signout.thanksLate' : 'signout.thanksSignout'), 'success', 4000);
    this.pending = null;
    await this.load();
  }

  private async openAttendance(id: number): Promise<void> {
    const modal = await this.modalController.create({
      component: AttendancePage,
      presentingElement: document.querySelector('ion-router-outlet'),
      componentProps: { attendanceId: id, isModal: true },
    });
    await modal.present();
    await modal.onDidDismiss();
    await this.load();
  }
}
