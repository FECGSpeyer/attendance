import { dateFmt } from '../../i18n/languages';
import { Component, effect, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, AlertController, IonModal } from '@ionic/angular/lazy';
import { Browser } from '@capacitor/browser';
import { Router } from '@angular/router';
import dayjs from 'dayjs';
import { attendanceHasEnded, attendanceIsRunning, isMultiDay } from '../../utilities/plan-days';
import { EventMonthGroup, PAST_PREVIEW_COUNT, eventDay, eventMeta, eventTimeRange, eventWeekday, groupByMonth, statusColor, statusLabel } from '../../utilities/event-list';
import { DbService } from 'src/app/services/db.service';
import { FilesService } from 'src/app/services/files/files.service';
import { AttendanceStatus, DEFAULT_ABSENCE_REASONS, DEFAULT_LATE_REASONS } from 'src/app/utilities/constants';
import { CrossTenantPersonAttendance, AttendanceType } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { TrackingEvent, TrackingService } from 'src/app/services/tracking/tracking.service';
import { ExcuseReasonPickerComponent } from 'src/app/shared/excuse-reason-picker/excuse-reason-picker.component';
import { translate } from '@jsverse/transloco';

type GroupingMode = 'chronological' | 'byTenant';

interface TenantGroup {
  tenantId: number;
  tenantName: string;
  tenantColor: string;
  attendances: CrossTenantPersonAttendance[];
}

@Component({
    selector: 'app-overview',
    templateUrl: './overview.page.html',
    styleUrls: ['./overview.page.scss'],
    standalone: false
})
export class OverviewPage implements OnInit {
  @ViewChild('excusePicker') excusePicker: ExcuseReasonPickerComponent;
  @ViewChild('descriptionModal') descriptionModal: IonModal;
  public selectedDescription: string = '';

  public attendances: CrossTenantPersonAttendance[] = [];
  public upcomingAttendances: CrossTenantPersonAttendance[] = [];
  public pastAttendances: CrossTenantPersonAttendance[] = [];
  public tenantGroups: TenantGroup[] = [];
  public tenantGroupValues: string[] = [];
  public currentAttendance: CrossTenantPersonAttendance | null = null;

  public groupingMode: GroupingMode = 'chronological';
  public selAttIds: string[] = [];
  public selectedAttendance: CrossTenantPersonAttendance | null = null;

  public showAllPast = false;
  public readonly pastPreviewCount = PAST_PREVIEW_COUNT;
  private upcomingGroupsCache: { src: CrossTenantPersonAttendance[]; groups: EventMonthGroup<CrossTenantPersonAttendance>[] };

  public perc = 0;
  public lateCount = 0;
  public absenceReasons: string[] = [];
  public lateReasons: string[] = [];

  constructor(
    public db: DbService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private tracking: TrackingService,
    private router: Router,
    private filesSvc: FilesService,
  ) {
    effect(async () => {
      if (this.db.tenants() && this.db.tenantUsers()) {
        await this.loadAttendances();
      }
    });
  }

  async ngOnInit() {
    // Load reasons from current tenant or use defaults
    if (this.db.tenant()) {
      this.absenceReasons = this.db.tenant().absence_reasons?.length
        ? this.db.tenant().absence_reasons
        : DEFAULT_ABSENCE_REASONS;
      this.lateReasons = this.db.tenant().late_reasons?.length
        ? this.db.tenant().late_reasons
        : DEFAULT_LATE_REASONS;
    }
    await this.loadAttendances();
  }

  async loadAttendances(forceRefresh: boolean = false) {
    const allAttendances = await this.db.loadAllPersonAttendancesAcrossTenants(forceRefresh);
    this.attendances = allAttendances;
    this.processAttendances();
  }

  processAttendances() {
    // Split into upcoming and past
    this.upcomingAttendances = this.attendances
      .filter(att => !attendanceHasEnded(att))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    this.pastAttendances = this.attendances
      .filter(att => attendanceHasEnded(att))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Set current attendance (next upcoming)
    this.currentAttendance = this.upcomingAttendances.length > 0 ? this.upcomingAttendances[0] : null;
    if (this.currentAttendance) {
      this.upcomingAttendances = this.upcomingAttendances.slice(1);
    }

    // Calculate statistics
    this.calculateStats();

    // Group by tenant
    this.groupByTenant();
  }

  calculateStats() {
    const pastToCalc = this.pastAttendances.filter(att => att.attendanceType?.include_in_average ?? true);

    if (pastToCalc.length > 0) {
      const attended = pastToCalc.filter(att => att.attended);
      this.perc = Math.round((attended.length / pastToCalc.length) * 100);
      this.lateCount = this.pastAttendances.filter(att => att.status === AttendanceStatus.Late).length;
    } else {
      this.perc = 0;
      this.lateCount = 0;
    }
  }

  groupByTenant() {
    const groupMap = new Map<number, TenantGroup>();

    for (const att of this.attendances) {
      if (!groupMap.has(att.tenantId)) {
        groupMap.set(att.tenantId, {
          tenantId: att.tenantId,
          tenantName: att.tenantName,
          tenantColor: att.tenantColor,
          attendances: [],
        });
      }
      groupMap.get(att.tenantId)!.attendances.push(att);
    }

    // Sort attendances within each group: upcoming first (ascending), then past (descending)
    const now = new Date();
    groupMap.forEach(group => {
      const upcoming = group.attendances
        .filter(a => new Date(a.date) >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const past = group.attendances
        .filter(a => new Date(a.date) < now)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      group.attendances = [...upcoming, ...past];
    });

    this.tenantGroups = Array.from(groupMap.values());
    // Generate accordion values for all tenant groups
    this.tenantGroupValues = this.tenantGroups.map((_, i) => 'tenant-' + i);
  }

  async handleRefresh(event: any) {
    await this.loadAttendances(true);
    event.target.complete();
  }

  onGroupingChange(event: any) {
    this.groupingMode = event.detail.value;
  }

  /**
   * @param hideQuickActions on the current card Zusagen / Verspätung / Absagen and the
   * info chips are buttons already, so the sheet leaves them out
   */
  async presentActionSheetForChoice(attendance: CrossTenantPersonAttendance, hideQuickActions = false) {
    this.selectedAttendance = attendance;

    let buttons = [
      {
        text: translate('signout.signIn'),
        handler: () => this.signin(attendance),
      },
      {
        text: translate('signout.signInWithNote'),
        handler: () => this.showNoteAlertForSignin(attendance),
      },
      {
        text: translate('signout.signOut'),
        handler: () => {
          this.actionSheetController.dismiss();
          this.excusePicker.open(false, this.isAttToday(attendance));
        },
      },
      {
        text: translate('signout.enterLate'),
        handler: () => {
          this.actionSheetController.dismiss();
          this.excusePicker.open(true, this.isAttToday(attendance));
        },
      },
      {
        text: translate('signout.editNote'),
        handler: async () => {
          await this.showNoteAlert(attendance);
          this.actionSheetController.dismiss();
        },
      },
      {
        text: translate('common.cancel'),
        handler: () => { },
        role: 'destructive',
        data: { action: 'cancel' },
      },
    ];

    const attType = attendance.attendanceType;

    const canSignin = this.isSigninOpen(attendance);

    if (attendance.text === 'X' || !canSignin) {
      buttons = buttons.filter(btn => btn.text !== translate('signout.signIn') && btn.text !== translate('signout.signInWithNote'));
    } else if (attType && !attType.available_statuses.includes(AttendanceStatus.Excused)) {
      buttons = buttons.filter(btn => btn.text !== translate('signout.signOut'));
    } else if (attType && !attType.available_statuses.includes(AttendanceStatus.Late)) {
      buttons = buttons.filter(btn => btn.text !== translate('signout.enterLate'));
    }

    if (attendance.text !== 'X') {
      buttons = buttons.filter(btn => btn.text !== translate('signout.editNote'));
    }

    if (attendance.text === 'E' || attendance.text === 'A') {
      buttons = buttons.filter(btn => btn.text !== translate('signout.signOut') && btn.text !== translate('signout.enterLate'));
    }

    if (hideQuickActions) {
      const qa = this.quickActions(attendance);
      const shown = [translate('signout.signIn')];
      if (qa.allowExcuse) { shown.push(translate('signout.signOut')); }
      if (qa.allowLate) { shown.push(translate('signout.enterLate')); }
      buttons = buttons.filter(btn => !shown.includes(btn.text));
    }

    if (attendance.attendance?.description && !hideQuickActions) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: translate('signout.showDescription'),
        handler: () => this.openDescription(attendance),
      });
    }

    if (attendance.attendance?.attachment_url && !hideQuickActions) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: translate('signout.openAttachment'),
        handler: () => this.openAttachment(attendance.attendance),
      });
    }

    if (this.hasFilesFolder(attendance) && !hideQuickActions) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: translate('signout.openFiles'),
        handler: () => this.openFilesFolder(attendance),
      });
    }

    if (buttons.length <= 1) {
      Utils.showToast(translate('signout.noActions'), 'warning', 4000);
      return;
    }

    this.selAttIds = [attendance.id!];
    const actionSheet = await this.actionSheetController.create({
      buttons,
    });

    await actionSheet.present();
  }

  async showNoteAlertForSignin(attendance: CrossTenantPersonAttendance) {
    const alert = await this.alertController.create({
      header: translate('signout.noteForSignin'),
      inputs: [
        {
          name: 'note',
          type: 'textarea',
          placeholder: translate('signout.enterNote'),
          value: '',
        },
      ],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('signout.signIn'),
          handler: (data) => {
            this.signin(attendance, data.note);
          },
        },
      ],
    });

    await alert.present();
  }

  async signin(attendance: CrossTenantPersonAttendance, notes: string = '') {
    await this.db.signin(
      attendance.id!,
      attendance.status === AttendanceStatus.LateExcused ? 'lateSignIn' :
        attendance.status === AttendanceStatus.Neutral ? 'neutralSignin' : 'signin',
      notes
    );
    this.tracking.track(TrackingEvent.AttendanceCheckIn);

    Utils.showToast(translate('signout.gladYouCome'), 'success', 4000);
    await this.loadAttendances(true);
  }

  async onExcuseConfirm({ reason, isLate }: { reason: string; isLate: boolean }) {
    await this.db.signout(this.selAttIds, reason, isLate);
    this.tracking.track(TrackingEvent.AttendanceCheckOut, { count: this.selAttIds.length, isLate });

    Utils.showToast(
      isLate
        ? translate('signout.thanksLate')
        : translate('signout.thanksSignout'),
      'success',
      4000
    );

    await this.loadAttendances(true);
  }

  async showNoteAlert(attendance: CrossTenantPersonAttendance) {
    const note = attendance.notes || '';
    const alert = await this.alertController.create({
      header: translate('signout.editNote'),
      inputs: [
        {
          name: 'note',
          type: 'textarea',
          placeholder: translate('signout.enterNote'),
          value: note,
        },
      ],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: async (data) => {
            await this.db.updateAttendanceNote(attendance.id!, data.note);
            Utils.showToast(translate('signout.noteUpdated'), 'success', 4000);
            await this.loadAttendances(true);
          },
        },
      ],
    });

    await alert.present();
  }

  attHasPassed(att: CrossTenantPersonAttendance): boolean {
    return attendanceHasEnded(att);
  }

  attIsInFuture(att: CrossTenantPersonAttendance): boolean {
    return dayjs(att.date).isAfter(dayjs(), 'day');
  }

  isAttToday(att: CrossTenantPersonAttendance): boolean {
    return attendanceIsRunning(att);
  }

  getReadableDate(date: string, attType?: AttendanceType): string {
    return Utils.getReadableDate(date, attType);
  }

  showDeadlineInfo(att: CrossTenantPersonAttendance): boolean {
    if (!att.attendance?.deadline) {return false;}
    const deadline = dayjs(att.attendance.deadline);
    const now = dayjs();
    return now.isBefore(deadline) && deadline.diff(now, 'day') <= 3;
  }

  getDeadlineText(att: CrossTenantPersonAttendance): string {
    if (!att.attendance?.deadline) {return '';}
    const deadline = dayjs(att.attendance.deadline);
    return translate('selfService.deadline', { date: deadline.format(`${dateFmt()} HH:mm`) });
  }

  getBadgeColor(att: CrossTenantPersonAttendance): string {
    switch (att.text) {
      case 'X': return 'success';
      case 'A': return 'danger';
      case 'L': return att.status === AttendanceStatus.Late ? 'tertiary' : 'rosa';
      case 'N': return 'medium';
      case 'E': return 'warning';
      default: return 'warning';
    }
  }

  getBadgeText(att: CrossTenantPersonAttendance): string {
    return att.text === 'X' ? '✓' : att.text || '';
  }

  hasFilesFolder(attendance: CrossTenantPersonAttendance): boolean {
    return Boolean(attendance?.attendance?.files_folder) && this.db.canAccessFiles(attendance.tenantId);
  }

  async openFilesFolder(attendance: CrossTenantPersonAttendance): Promise<void> {
    if (!this.hasFilesFolder(attendance)) {
      return;
    }
    // /open-file wechselt bei Bedarf die Instanz und öffnet den Ordner.
    await this.router.navigate(['/open-file'], {
      queryParams: this.filesSvc.getFolderOpenParams(attendance.tenantId, attendance.attendance.files_folder),
    });
  }

  openAttachment(attendance: any) {
    if (attendance?.attachment_url) {
      Browser.open({ url: attendance.attachment_url });
    }
  }

  openDescription(attendance: CrossTenantPersonAttendance) {
    this.selectedDescription = attendance.attendance?.description || '';
    this.descriptionModal.present();
  }
  get upcomingGroups(): EventMonthGroup<CrossTenantPersonAttendance>[] {
    if (this.upcomingGroupsCache?.src !== this.upcomingAttendances) {
      this.upcomingGroupsCache = { src: this.upcomingAttendances, groups: groupByMonth(this.upcomingAttendances, att => att.date) };
    }
    return this.upcomingGroupsCache.groups;
  }

  get pastPreview(): CrossTenantPersonAttendance[] {
    return this.showAllPast ? this.pastAttendances : this.pastAttendances.slice(0, PAST_PREVIEW_COUNT);
  }

  weekday(date: string): string {
    return eventWeekday(date);
  }

  day(date: string): string {
    return eventDay(date);
  }

  getEventTitle(att: CrossTenantPersonAttendance): string {
    return att.title || this.getReadableDate(att.date, att.attendanceType);
  }

  /** Time line; past, multi-day and the current Termin also show the date unless it is the title. */
  getEventMeta(att: CrossTenantPersonAttendance, withDate = false): string {
    const attType = att.attendanceType;
    const showDate = withDate || isMultiDay(att.attendance) || (attType?.all_day && (attType.duration_days ?? 1) > 1);
    const date = this.getReadableDate(att.date, attType);
    return eventMeta(
      showDate && date !== this.getEventTitle(att) ? date : '',
      eventTimeRange(att.attendance?.start_time ?? attType?.start_time, att.attendance?.end_time ?? attType?.end_time),
    );
  }

  statusColorOf(att: CrossTenantPersonAttendance): string {
    return statusColor(att.status);
  }

  statusLabelOf(att: CrossTenantPersonAttendance, past = false): string {
    return statusLabel(att.status, past);
  }

  isSigninOpen(attendance: CrossTenantPersonAttendance): boolean {
    if (!attendance.attendance?.deadline) {
      return true;
    }
    const localDeadline = dayjs(attendance.attendance.deadline).subtract(dayjs().utcOffset(), 'minute');
    return !dayjs().isAfter(localDeadline);
  }

  /** Direct buttons on the current card; follows the same rules as the action sheet. */
  quickActions(att: CrossTenantPersonAttendance) {
    const attType = att.attendanceType;
    const isExcused = att.status === AttendanceStatus.Excused || att.status === AttendanceStatus.LateExcused;
    return {
      present: att.text === 'X',
      canSignin: att.text !== 'X' && this.isSigninOpen(att),
      late: att.status === AttendanceStatus.LateExcused,
      excused: att.status === AttendanceStatus.Excused,
      blocked: isExcused || att.text === 'A',
      allowLate: !attType || attType.available_statuses.includes(AttendanceStatus.Late),
      allowExcuse: !attType || attType.available_statuses.includes(AttendanceStatus.Excused),
    };
  }

  quickSignout(att: CrossTenantPersonAttendance, isLate: boolean): void {
    this.selectedAttendance = att;
    this.selAttIds = [att.id!];
    this.excusePicker.open(isLate, this.isAttToday(att));
  }

  openRoute(attendance: CrossTenantPersonAttendance) {
    if (attendance.attendance?.place) {
      Utils.openNavigation(attendance.attendance.place);
    }
  }
}
