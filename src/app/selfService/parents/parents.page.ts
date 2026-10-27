import { currentLanguage, dateFmt } from '../../i18n/languages';
import { Component, effect, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, IonModal, ModalController } from '@ionic/angular/lazy';
import { Browser } from '@capacitor/browser';
import { ActivatedRoute, Router } from '@angular/router';
import dayjs from 'dayjs';
import { attendanceHasEnded, attendanceIsRunning, isMultiDay } from '../../utilities/plan-days';
import { EventMonthGroup, PAST_PREVIEW_COUNT, eventDay, eventMeta, eventTimeRange, eventWeekday, groupByMonth, statusColor, statusLabel } from '../../utilities/event-list';
import { DbService } from 'src/app/services/db.service';
import { PushService } from 'src/app/services/push/push.service';
import { TrackingEvent, TrackingService } from 'src/app/services/tracking/tracking.service';
import { AttendanceStatus, DEFAULT_ABSENCE_REASONS, DEFAULT_LATE_REASONS } from 'src/app/utilities/constants';
import { Attendance, AttendanceType, History, Person, PersonAttendance, Plan } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { PlanViewerComponent } from 'src/app/planning/plan-viewer/plan-viewer.component';
import { ExcuseReasonPickerComponent } from 'src/app/shared/excuse-reason-picker/excuse-reason-picker.component';
import { translate } from '@jsverse/transloco';

interface KidStats {
  perc: number;
  lateCount: number;
}

@Component({
    selector: 'app-parents',
    templateUrl: './parents.page.html',
    styleUrls: ['./parents.page.scss'],
    standalone: false
})
export class ParentsPage implements OnInit {
  public kids: Person[] = [];
  public attendances: Attendance[] = [];
  public personAttendances: PersonAttendance[] = [];
  public selAttIds: string[] = [];
  public selPersAttIds: string[] = [];

  // New properties for optimized UI
  public currentAttendance: Attendance;
  public upcomingAttendances: Attendance[] = [];
  public pastAttendances: Attendance[] = [];
  public kidStats: { [key: number]: KidStats } = {};
  public kidsByAttendance: { [attendanceId: number]: PersonAttendance[] } = {};
  public upcomingGroups: EventMonthGroup<Attendance>[] = [];
  public showAllPast = false;
  public readonly pastPreviewCount = PAST_PREVIEW_COUNT;
  public upcomingSongs: { date: string; history: History[] }[] = [];
  public songsModalOpen = false;
  public absenceReasons: string[] = [];
  public lateReasons: string[] = [];

  @ViewChild('excusePicker') excusePicker: ExcuseReasonPickerComponent;
  @ViewChild('descriptionModal') descriptionModal: IonModal;
  public selectedDescription: string = '';

  constructor(
    public db: DbService,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
    private route: ActivatedRoute,
    private router: Router,
    private pushService: PushService,
    private tracking: TrackingService,
  ) {
    effect(async () => {
      if (this.db.tenant()) {
        await this.initialize();
      }
    });

    effect(async () => {
      const id = this.pushService.pendingAttendanceId();
      if (id !== null) {
        this.pushService.consumePendingAttendanceId();
        await this.waitForAttendance(id);
        this.openAttendanceById(id);
      }
    });
  }

  async onTenantChange(tenantId: number): Promise<void> {
    if (this.db.tenant().id === tenantId) { return; }
    const loading = await Utils.getLoadingElement();
    await loading.present();
    await this.db.setTenant(tenantId);
    await this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
    await loading.dismiss();
  }

  async ngOnInit() {
    await this.initialize();
  }

  private waitForAttendance(attendanceId: number): Promise<void> {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        if (this.attendances.find(a => a.id === attendanceId) || Date.now() - start > 5000) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  async initialize() {
    // Load reasons from tenant config or use defaults
    this.absenceReasons = this.db.tenant().absence_reasons?.length
      ? this.db.tenant().absence_reasons
      : DEFAULT_ABSENCE_REASONS;
    this.lateReasons = this.db.tenant().late_reasons?.length
      ? this.db.tenant().late_reasons
      : DEFAULT_LATE_REASONS;

    this.kids = await this.db.getPlayers();

    // Get all person attendances for all kids (includes past and future)
    const allPersonAttendances: PersonAttendance[] = [];
    for (const kid of this.kids) {
      const kidAttendances = await this.db.getPersonAttendances(kid.id, true);
      // Add person info to each attendance
      kidAttendances.forEach(pa => {
        (pa as any).person = { firstName: kid.firstName };
        (pa as any).person_id = kid.id;
        (pa as any).attendance_id = pa.attId;
      });
      allPersonAttendances.push(...kidAttendances);
    }

    this.personAttendances = allPersonAttendances.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Build unique attendances from personAttendances for organizing
    const uniqueAttendanceIds = new Set<number>();
    this.attendances = [];
    for (const pa of this.personAttendances) {
      if (!uniqueAttendanceIds.has(pa.attId)) {
        uniqueAttendanceIds.add(pa.attId);
        this.attendances.push({
          id: pa.attId,
          date: pa.date,
          type_id: pa.typeId,
          title: pa.title,
          type: pa.attendance?.type,
          plan: pa.attendance?.plan,
          extra_plans: pa.attendance?.extra_plans,
          duration_days: pa.attendance?.duration_days,
          share_plan: pa.attendance?.share_plan,
          description: pa.attendance?.description,
          attachment_url: pa.attendance?.attachment_url,
          attachment_name: pa.attendance?.attachment_name,
          place: pa.attendance?.place,
          start_time: pa.attendance?.start_time,
          end_time: pa.attendance?.end_time,
          highlight: pa.highlight,
        } as unknown as Attendance);
      }
    }

    // Organize attendances
    this.organizeAttendances();

    // Calculate statistics per kid
    this.calculateKidStats();

    // Get current songs
    this.upcomingSongs = await this.db.getCurrentSongs();
  }

  organizeAttendances() {
    const current: Attendance[] = [];
    const upcoming: Attendance[] = [];
    const past: Attendance[] = [];

    for (const att of this.attendances) {
      if (attendanceIsRunning(att)) {
        current.push(att);
      } else if (!attendanceHasEnded(att)) {
        upcoming.push(att);
      } else {
        past.push(att);
      }
    }

    // Sort upcoming ascending (closest first)
    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Sort past descending (most recent first)
    past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    this.currentAttendance = current[0];
    this.upcomingAttendances = upcoming;
    this.pastAttendances = past.slice(0, 10); // Limit past attendances
    this.upcomingGroups = groupByMonth(upcoming, att => att.date);

    this.kidsByAttendance = {};
    for (const pa of this.personAttendances) {
      (this.kidsByAttendance[pa.attendance_id] ??= []).push(pa);
    }
  }

  get pastPreview(): Attendance[] {
    return this.showAllPast ? this.pastAttendances : this.pastAttendances.slice(0, PAST_PREVIEW_COUNT);
  }

  weekday(date: string): string {
    return eventWeekday(date);
  }

  day(date: string): string {
    return eventDay(date);
  }

  isRunning(att: Attendance): boolean {
    return attendanceIsRunning(att);
  }

  isHighlighted(att: Attendance): boolean {
    return Boolean((att as any).highlight);
  }

  getEventTitle(att: Attendance): string {
    return (att as any).title || this.getReadableDate(att.date, att.type_id);
  }

  /** Time and place; multi-day Termine (and the current card) also show the date unless it is the title. */
  getEventMeta(att: Attendance, withDate = false, withPlace = true): string {
    const attType = this.db.attendanceTypes().find(type => type.id === att.type_id);
    const showDate = withDate || isMultiDay(att) || (attType?.all_day && (attType.duration_days ?? 1) > 1);
    const date = this.getReadableDate(att.date, att.type_id);
    return eventMeta(
      // Termine without a name already show the date as title
      showDate && date !== this.getEventTitle(att) ? date : '',
      eventTimeRange(att.start_time ?? attType?.start_time, att.end_time ?? attType?.end_time),
      withPlace ? att.place : '',
    );
  }

  initials(pa: PersonAttendance): string {
    return ((pa as any).person?.firstName ?? '').slice(0, 2).toUpperCase();
  }

  statusColorOf(status: AttendanceStatus): string {
    return statusColor(status);
  }

  statusLabelOf(status: AttendanceStatus, past = false): string {
    return statusLabel(status, past);
  }

  private openAttendanceById(attendanceId: number): void {
    const att = this.attendances.find(a => a.id === attendanceId);
    if (att) {
      this.openActionSheet(att, true);
    }
  }

  openAttachment(attendance: any) {
    if (attendance?.attachment_url) {
      Browser.open({ url: attendance.attachment_url });
    }
  }

  openDescription(attendance: any) {
    this.selectedDescription = attendance?.description || '';
    this.descriptionModal.present();
  }

  calculateKidStats() {
    this.kidStats = {};

    for (const kid of this.kids) {
      const kidAttendances = this.personAttendances.filter(
        pa => pa.person_id === kid.id && attendanceHasEnded(pa)
      );

      if (kidAttendances.length === 0) {
        this.kidStats[kid.id] = { perc: 0, lateCount: 0 };
        continue;
      }

      const shiftExcused = this.db.tenant()?.shift_excused_as_present;
      const attended = kidAttendances.filter(pa =>
        pa.status === AttendanceStatus.Present ||
        pa.status === AttendanceStatus.Late ||
        pa.status === AttendanceStatus.LateExcused ||
        (shiftExcused && pa.status === AttendanceStatus.Excused && Utils.isWorkExcused(pa.notes))
      );

      const lateCount = kidAttendances.filter(pa => pa.status === AttendanceStatus.Late).length;

      this.kidStats[kid.id] = {
        perc: Math.round((attended.length / kidAttendances.length) * 100),
        lateCount
      };
    }
  }

  getReadableDate(date: string, type_id: string): string {
    const attType = this.db.attendanceTypes().find(type => type.id === type_id);
    if (!attType) {
      // Fallback if attendance type not found
      return dayjs(date).locale(currentLanguage()).format(`ddd, ${dateFmt()}`);
    }
    return Utils.getReadableDate(date, attType);
  }

  getStatusText(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Present:
        return '✓';
      case AttendanceStatus.Absent:
        return 'A';
      case AttendanceStatus.Late:
        return 'L';
      case AttendanceStatus.LateExcused:
        return 'LE';
      case AttendanceStatus.Neutral:
        return 'N';
      default:
        return 'E';
    }
  }

  async openActionSheet(attendance: any, allKids: boolean = false, personAttendance?: any) {
    this.selAttIds = allKids
      ? this.personAttendances.filter((pa) => pa.attendance_id === attendance.id).map((pa) => pa.id)
      : personAttendance ? [personAttendance.id] : [];

    let buttons = [
      {
        text: translate('signout.signIn'),
        handler: () => this.signin(attendance),
      },
      {
        text: translate('signout.signOut'),
        handler: () => {
          this.actionSheetController.dismiss();
          this.excusePicker.open(false, dayjs(attendance.date).isSame(dayjs(), 'day'));
        },
      },
      {
        text: translate('signout.enterLate'),
        handler: () => {
          this.actionSheetController.dismiss();
          this.excusePicker.open(true, dayjs(attendance.date).isSame(dayjs(), 'day'));
        },
      },
      {
        text: translate('common.cancel'),
        handler: () => { },
        role: 'destructive',
        data: {
          action: 'cancel',
        },
      },
    ];

    if (personAttendance) {
      if (personAttendance.status === AttendanceStatus.Present) {
        buttons = buttons.filter((btn) => btn.text !== translate('signout.signIn'));
      } else if (personAttendance.status === AttendanceStatus.Absent) {
        buttons = buttons.filter((btn) => btn.text !== translate('signout.signOut'));
      } else if (personAttendance.status === AttendanceStatus.Late) {
        buttons = buttons.filter((btn) => btn.text !== translate('signout.enterLate'));
      }
    }

    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === attendance.type_id);
    if (attType && !attType.available_statuses.includes(AttendanceStatus.Late)) {
      buttons = buttons.filter((btn) => btn.text !== translate('signout.enterLate'));
    }

    // Add plan viewing option if share_plan is true
    if (attendance.share_plan && attendance.plan) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: translate('signout.showRunSheet'),
        handler: () => this.openPlanViewer(attendance),
      });
    }

    if (attendance.description) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: translate('signout.showDescription'),
        handler: () => this.openDescription(attendance),
      });
    }

    if (attendance.attachment_url) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: translate('signout.openAttachment'),
        handler: () => this.openAttachment(attendance),
      });
    }

    if (attendance.place) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: translate('signout.openNavigation'),
        handler: () => Utils.openNavigation(attendance.place),
      });
    }

    const actionSheet = await this.actionSheetController.create({
      buttons,
    });

    await actionSheet.present();
  }

  async onExcuseConfirm({ reason, isLate }: { reason: string; isLate: boolean }) {
    await this.db.signout(this.selAttIds, reason, isLate, true);
    this.tracking.track(TrackingEvent.ParentSignOut, { count: this.selAttIds.length, isLate });

    Utils.showToast(isLate ? translate('selfService.parentsThanksLate') : translate('selfService.parentsThanksSignout'), 'success', 4000);

    await this.refreshPersonAttendances();
  }

  async signin(attendance: PersonAttendance) {
    for (const attId of this.selAttIds) {
      await this.db.signin(attId, attendance.status === AttendanceStatus.LateExcused ? 'lateSignIn' : attendance.status === AttendanceStatus.Neutral ? 'neutralSignin' : 'signin');
    }
    this.tracking.track(TrackingEvent.ParentSignIn, { count: this.selAttIds.length });

    Utils.showToast(translate('selfService.thanksForSignIn'), 'success', 4000);

    await this.refreshPersonAttendances();
  }

  async refreshPersonAttendances() {
    const allPersonAttendances: PersonAttendance[] = [];
    for (const kid of this.kids) {
      const kidAttendances = await this.db.getPersonAttendances(kid.id, true);
      kidAttendances.forEach(pa => {
        (pa as any).person = { firstName: kid.firstName };
        (pa as any).person_id = kid.id;
        (pa as any).attendance_id = pa.attId;
      });
      allPersonAttendances.push(...kidAttendances);
    }

    this.personAttendances = allPersonAttendances.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    this.organizeAttendances();
    this.calculateKidStats();
  }

  async handleRefresh(event) {
    await this.initialize();
    event.target.complete();
  }

  openSongLink(link: string) {
    if (link) {
      Browser.open({ url: link });
    }
  }

  hasPlan(attendance: Attendance): boolean {
    return attendance?.share_plan && attendance?.plan?.fields?.length > 0;
  }

  async openPlanViewer(attendance: Attendance) {
    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === attendance.type_id);
    const isPractice = Utils.isPracticeTypeName(attType?.name) ||
                       attendance.type === 'uebung';

    const modal = await this.modalController.create({
      component: PlanViewerComponent,
      componentProps: {
        attendance,
        plan: attendance.plan as Plan,
        isPractice
      }
    });

    await modal.present();
  }
}
