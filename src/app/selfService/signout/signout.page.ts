import { dateFmt } from '../../i18n/languages';
/* eslint-disable arrow-body-style */
import { Component, effect, inject, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, AlertController, IonAccordionGroup, IonModal, isPlatform, ModalController } from '@ionic/angular/lazy';
import { Browser } from '@capacitor/browser';
import { ActivatedRoute, Router } from '@angular/router';
import dayjs from 'dayjs';
import { attendanceHasEnded, attendanceIsRunning, isMultiDay } from '../../utilities/plan-days';
import { EventMonthGroup, PAST_PREVIEW_COUNT, eventDay, eventMeta, eventTimeRange, eventWeekday, groupByMonth, percentageColor, statusColor, statusLabel } from '../../utilities/event-list';
import { DbService } from 'src/app/services/db.service';
import { PushService } from 'src/app/services/push/push.service';
import { AudioPlayerService } from 'src/app/services/audio-player/audio-player.service';
import { TelegramService } from 'src/app/services/telegram/telegram.service';
import { AttendanceStatus, DEFAULT_ABSENCE_REASONS, DEFAULT_LATE_REASONS, defaultShowAllAttendancesInfoText, PlayerHistoryType, Role } from 'src/app/utilities/constants';
import { Attendance, PersonAttendance, Player, PlayerAbsence, PlayerHistoryEntry, Song, Tenant, History, SongFile, AttendanceType, Plan, RegistrationField } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { countsForAverage, isCancelled, isDutyType, occupiesDuty } from 'src/app/utilities/duty';
import { DutyTermin } from 'src/app/services/duty/duty.service';
import { UnavailabilityModalComponent } from 'src/app/duty/unavailability-modal/unavailability-modal.component';
import { PrintService } from 'src/app/services/print/print.service';
import { PlanViewerComponent } from 'src/app/planning/plan-viewer/plan-viewer.component';
import { ExcuseReasonPickerComponent } from 'src/app/shared/excuse-reason-picker/excuse-reason-picker.component';
import { MyTasksComponent } from 'src/app/tasks/my-tasks/my-tasks.component';
import { translate } from '@jsverse/transloco';

@Component({
  selector: 'app-signout',
  templateUrl: './signout.page.html',
  styleUrls: ['./signout.page.scss'],
  standalone: false
})
export class SignoutPage implements OnInit {
  private audioPlayer = inject(AudioPlayerService);
  private printService = inject(PrintService);
  @ViewChild('signoutAccordionGroup') signoutAccordionGroup: IonAccordionGroup;
  @ViewChild('excusePicker') excusePicker: ExcuseReasonPickerComponent;
  @ViewChild('descriptionModal') descriptionModal: IonModal;
  @ViewChild(MyTasksComponent) myTasks?: MyTasksComponent;
  private viewEntered = false;
  public selectedDescription: string = '';
  public player: Player;
  public attendances: Attendance[] = [];
  public personAttendances: PersonAttendance[] = [];
  public actualAttendances: PersonAttendance[] = [];
  public currentAttendance: PersonAttendance;
  public selAttIds: string[] = [];
  public perc: number;
  public name: string;
  public signoutTitle: string;
  public lateCount = 0;
  public songs: Song[] = [];
  public tenantId: number;
  public tenants: Tenant[] = [];
  public songsModalOpen = false;
  public upcomingSongs: { date: string; history: History[] }[] = [];
  public isApplicant = false;
  public absenceReasons: string[] = [];
  public lateReasons: string[] = [];
  public canSelfPause = false;
  public isPauseModalOpen = false;
  public pauseReason = '';
  public pauseUntil = '';
  public isAbsenceModalOpen = false;
  public absenceReason = '';
  public absenceFrom = '';
  public absenceUntil = '';
  public canPlannedAbsence = false;
  public playerAbsences: PlayerAbsence[] = [];
  public showAllAttendances = false;
  public showAllPast = false;
  public readonly pastPreviewCount = PAST_PREVIEW_COUNT;
  private upcomingGroupsCache: { src: PersonAttendance[]; groups: EventMonthGroup<PersonAttendance>[] };
  private pastCache: { src: PersonAttendance[]; list: PersonAttendance[] };
  public showAllAttendancesInfoText = '';
  public isRegFieldsModalOpen = false;
  public pendingSigninAttendance: PersonAttendance | null = null;
  public regFieldAnswers: { [fieldId: string]: any } = {};
  public regFieldsMode: 'signin' | 'edit' = 'signin';
  private pendingSigninNote = '';
  /** Dienstplan: assignments waiting for my confirmation. */
  public dutyRequests: PersonAttendance[] = [];
  /** Dienstplan: duties I could take (not full, I am a stand-in). */
  public openDuties: DutyTermin[] = [];
  /** Dienstplan: I am in the circle of at least one upcoming duty. */
  public inDutyCircle = false;
  public isOpenDutiesModalOpen = false;
  /** translate('signout.myDuties') layout (C4): tenant switch on and the person is in a duty circle. */
  public useDutyView = false;
  public nextDuty: PersonAttendance | undefined;
  public myDuties: PersonAttendance[] = [];
  public dutiesThisMonth = 0;
  public showOtherTermine = false;
  private myDutyTermine: DutyTermin[] = [];

  constructor(
    public db: DbService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private modalController: ModalController,
    private route: ActivatedRoute,
    private router: Router,
    private pushService: PushService,
    private telegramService: TelegramService,
  ) {
    effect(async () => {
      if (this.db.tenant()) {
        this.initialize();
      }
    });

    effect(async () => {
      const id = this.pushService.pendingAttendanceId();
      if (id !== null) {
        this.pushService.consumePendingAttendanceId();
        await this.waitForPersonAttendance(id);
        await this.waitForStableViewport();
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

  /**
   * After tapping a push the app comes back from the background and iOS still
   * resizes the web view for a moment. An action sheet presented during that
   * ends up in the middle of the screen, so wait until the height is stable.
   */
  private waitForStableViewport(): Promise<void> {
    return new Promise(resolve => {
      const start = Date.now();
      let lastHeight = window.innerHeight;
      let stableSince = Date.now();
      const check = () => {
        const height = window.innerHeight;
        if (height !== lastHeight || document.visibilityState !== 'visible') {
          lastHeight = height;
          stableSince = Date.now();
        }
        if (Date.now() - stableSince >= 400 || Date.now() - start > 3000) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      setTimeout(check, 100);
    });
  }

  private waitForPersonAttendance(attendanceId: number): Promise<void> {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        if (this.personAttendances.find(pa => (pa.attendance_id ?? pa.attId) === attendanceId)
        || this.openDuties.some(t => t.attendance.id === attendanceId)
        || Date.now() - start > 5000) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  async initialize() {
    this.name = this.db.tenant().longName;
    this.tenants = this.db.tenants();
    this.tenantId = this.db.tenant().id;
    this.showAllAttendances = this.db.tenant().show_all_attendances === true;
    this.showAllAttendancesInfoText = this.db.tenant().show_all_attendances_info_text
      || defaultShowAllAttendancesInfoText();

    // Load reasons from tenant config or use defaults
    this.absenceReasons = this.db.tenant().absence_reasons?.length
      ? this.db.tenant().absence_reasons
      : DEFAULT_ABSENCE_REASONS;
    this.lateReasons = this.db.tenant().late_reasons?.length
      ? this.db.tenant().late_reasons
      : DEFAULT_LATE_REASONS;

    if (
      this.db.tenantUser() &&
      (this.db.tenantUser().role === Role.NONE
        || this.db.tenantUser().role === Role.PLAYER
        || this.db.tenantUser().role === Role.HELPER
        || this.db.tenantUser().role === Role.VOICE_LEADER
        || this.db.tenantUser().role === Role.VOICE_LEADER_HELPER
      )
    ) {
      this.player = await this.db.getPlayerByAppId();
      this.songs = await this.db.getSongs();
      await this.getAttendances();

      const perm = this.db.getPermissionForRole(Role.PLAYER);
      this.canSelfPause = !!perm?.player_self_pause;
      if (this.canSelfPause) {
        await this.db.checkAndUnpausePlayers();
        this.player = await this.db.getPlayerByAppId();
      }

      const role = this.db.tenantUser().role;
      const absencePerm = this.db.getPermissionForRole(role);
      this.canPlannedAbsence = !!absencePerm?.player_planned_absence;
      if (this.canPlannedAbsence && this.player) {
        this.playerAbsences = await this.db.getPlayerAbsences(this.player.id);
      }
    } if (this.db.tenantUser()?.role === Role.APPLICANT) {
      this.player = await this.db.getPlayerByAppId();
      this.isApplicant = true;
    }

    const songs = await this.db.getCurrentSongs();
    this.upcomingSongs = [];
    for (const song of songs) {
      const history = song.history.filter((h: History) => this.personAttendances.some((att: PersonAttendance) => att.attendance.id === (h.attendance_id as unknown as Attendance).id));
      if (history.length) {
        this.upcomingSongs.push({
          date: song.date,
          history
        });
      }
    }
  }

  async onExcuseConfirm({ reason, isLate }: { reason: string; isLate: boolean }) {
    const loading = await Utils.getLoadingElement(10000);
    await loading.present();
    try {
      // Assigned duties that are cancelled now may leave the duty understaffed.
      const cancelledDuties = this.personAttendances
        .filter(att => this.selAttIds.includes(att.id) && this.isDutyPa(att) && occupiesDuty(att));
      await this.db.signout(this.selAttIds, reason, isLate, false, true);
      for (const att of cancelledDuties) {
        void this.db.dutySvc.notify({
          type: 'understaffed',
          tenantId: this.db.tenant().id,
          attendanceId: att.attendance_id ?? att.attId,
        });
      }

      Utils.showToast(isLate ? translate('signout.thanksLate') : translate('signout.thanksSignout'), 'success', 4000);

      await this.getAttendances();
    } finally {
      await loading.dismiss();
    }
  }

  async showNoteAlertForSignin(attendance: PersonAttendance) {
    let note = '';
    const alert = await this.alertController.create({
      header: translate('signout.noteForSignin'),
      inputs: [
        {
          name: 'note',
          type: 'textarea',
          placeholder: translate('signout.enterNote'),
          value: note,
        },
      ],
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
        },
        {
          text: translate('signout.signIn'),
          handler: (data) => {
            note = data.note;
            this.handleSigninWithFields(attendance, note);
          },
        },
      ],
    });

    await alert.present();
  }

  async signin(attendance: PersonAttendance, notes: string = '') {
    // translate('signout.accept') on a duty I was assigned to confirms it.
    if (attendance.duty_state === 'requested') {
      await this.confirmDuty(attendance);
      return;
    }
    await this.db.signin(
      attendance.id,
      attendance.status === AttendanceStatus.LateExcused ? 'lateSignIn' : attendance.status === AttendanceStatus.Neutral ? 'neutralSignin' : 'signin',
      notes
    );

    Utils.showToast(translate('signout.gladYouCome'), 'success', 4000);

    await this.getAttendances();
  }

  async getAttendances() {
    if (!this.player.paused) {
      this.selAttIds = [];
    }

    if (this.showAllAttendances) {
      // Vergangene: nur eigene Teilnahmen
      const pastPAs = (await this.db.getPersonAttendances(this.player.id, true))
        .filter((att: PersonAttendance) => attendanceHasEnded(att))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Zukünftige: alle Termine der Instanz + eigener Status
      const upcomingAll = await this.db.getAllUpcomingAttendancesForSignout(this.player.id);

      this.personAttendances = [...pastPAs, ...[...upcomingAll].reverse()];

      if (pastPAs.length) {
        this.lateCount = pastPAs.filter((a) => a.status === AttendanceStatus.Late).length;
        const vergangeneToCalcPerc = pastPAs.filter((att: PersonAttendance) => {
          const type = this.db.attendanceTypes().find((t) => t.id === att.typeId);
          return countsForAverage(type, att, true);
        });
        pastPAs[0].showDivider = true;
        const attended = vergangeneToCalcPerc.filter((att: PersonAttendance) => att.attended);
        this.perc = vergangeneToCalcPerc.length
          ? Math.round(attended.length / vergangeneToCalcPerc.length * 100)
          : 0;
      } else {
        this.perc = 0;
        this.lateCount = 0;
      }

      this.actualAttendances = [...upcomingAll];
      if (this.actualAttendances.length) {
        this.currentAttendance = this.actualAttendances[0];
        this.actualAttendances.splice(0, 1);
      }
    } else {
      const allPersonAttendances = (await this.db.getPersonAttendances(this.player.id)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      this.personAttendances = allPersonAttendances;

      const vergangene: PersonAttendance[] = this.personAttendances.filter((att: PersonAttendance) => attendanceHasEnded(att));
      if (vergangene.length) {
        this.lateCount = vergangene.filter((a) => a.status === AttendanceStatus.Late).length;
        const vergangeneToCalcPerc = vergangene.filter((att: PersonAttendance) => {
          const type = this.db.attendanceTypes().find((t) => t.id === att.typeId);
          return countsForAverage(type, att, true);
        });
        vergangene[0].showDivider = true;
        const attended = vergangeneToCalcPerc.filter((att: PersonAttendance) => att.attended);
        this.perc = vergangeneToCalcPerc.length ? Math.round(
          attended.length / vergangeneToCalcPerc.length * 100) : 0;
      } else {
        this.perc = 0;
      }

      this.actualAttendances = allPersonAttendances.filter((att: PersonAttendance) => !attendanceHasEnded(att)).reverse();
      if (this.actualAttendances.length) {
        this.currentAttendance = this.actualAttendances[0];
        this.actualAttendances.splice(0, 1);
      }
    }

    this.applyDutyView();
    void this.loadOpenDuties();
  }

  // ── Dienstplan ─────────────────────────────────────────────

  private typeOf(att: PersonAttendance) {
    return this.db.attendanceTypes().find(t => t.id === (att.typeId ?? att.attendance?.type_id));
  }

  /** Duties only show up for persons who were assigned; open ones live behind the tile. */
  private isUnassignedDuty(att: PersonAttendance): boolean {
    return !att.duty_state && isDutyType(this.typeOf(att));
  }

  isDutyPa(att: PersonAttendance): boolean {
    return !!att.duty_state && isDutyType(this.typeOf(att));
  }

  private applyDutyView(): void {
    if (!this.db.attendanceTypes().some(t => t.duty_mode)) {
      this.dutyRequests = [];
      return;
    }
    const upcoming = [this.currentAttendance, ...(this.actualAttendances ?? [])]
      .filter(Boolean)
      .filter(att => !this.isUnassignedDuty(att));
    this.currentAttendance = upcoming.shift();
    this.actualAttendances = upcoming;
    this.personAttendances = this.personAttendances.filter(att => !this.isUnassignedDuty(att));
    this.dutyRequests = [this.currentAttendance, ...upcoming]
      .filter(Boolean)
      .filter(att => att.duty_state === 'requested' && !isCancelled(att));
  }

  private async loadOpenDuties(): Promise<void> {
    const types = this.db.attendanceTypes();
    if (!this.player || !types.some(t => t.duty_mode)) {
      this.openDuties = [];
      this.inDutyCircle = false;
      return;
    }
    const termine = await this.db.dutySvc.getUpcomingDutyTermine(this.db.tenant().id, types);
    const mine = termine.filter(t => t.persons.some(p => p.person_id === this.player.id));
    this.inDutyCircle = mine.length > 0;
    this.myDutyTermine = mine;
    this.openDuties = mine.filter(t => {
      const own = t.persons.find(p => p.person_id === this.player.id);
      return t.type?.duty_self_signup !== false && !own.duty_state && !isCancelled(own) && t.occupied < t.required;
    });
    this.applyDutyLayout();
  }

  /** Splits the upcoming list into own duties and the (rare) other Termine. */
  private applyDutyLayout(): void {
    this.useDutyView = !!this.db.tenant()?.duty_view && this.inDutyCircle;
    if (!this.useDutyView) {
      return;
    }
    const all = [this.currentAttendance, ...(this.actualAttendances ?? [])].filter(Boolean);
    const duties = all.filter(att => this.isDutyPa(att) && !isCancelled(att));
    const confirmed = duties.filter(att => att.duty_state !== 'requested');
    this.nextDuty = confirmed[0];
    this.myDuties = confirmed.slice(1);
    const month = dayjs().format('YYYY-MM');
    this.dutiesThisMonth = duties.filter(att => dayjs(att.date).format('YYYY-MM') === month).length;
    const others = all.filter(att => !this.isDutyPa(att));
    this.currentAttendance = others.shift();
    this.actualAttendances = others;
  }

  get otherTermineCount(): number {
    return (this.currentAttendance ? 1 : 0) + (this.actualAttendances?.length ?? 0);
  }

  get otherTermineNames(): string {
    const names = [this.currentAttendance, ...(this.actualAttendances ?? [])]
      .filter(Boolean)
      .map(att => this.getEventTitle(att));
    return Array.from(new Set(names)).slice(0, 2).join(', ');
  }

  /** First names of the others on the same duty. */
  dutyTeam(att: PersonAttendance): string[] {
    const id = att.attendance_id ?? att.attId;
    const termin = this.myDutyTermine.find(t => t.attendance.id === id);
    return (termin?.persons ?? [])
      .filter(p => p.person_id !== this.player?.id && occupiesDuty(p))
      .map(p => (p as any).person?.firstName)
      .filter(Boolean);
  }

  isUrgentDuty(t: DutyTermin): boolean {
    const hours = t.type?.duty_urgent_hours;
    if (!hours) return false;
    const time = (t.attendance.start_time ?? t.type?.start_time ?? '00:00').slice(0, 5);
    const start = dayjs(`${dayjs(t.attendance.date).format('YYYY-MM-DD')}T${time}`);
    return start.diff(dayjs(), 'hour', true) <= hours;
  }

  get openDutiesPreview(): DutyTermin[] {
    return [...this.openDuties]
      .sort((a, b) => Number(this.isUrgentDuty(b)) - Number(this.isUrgentDuty(a)))
      .slice(0, 3);
  }

  scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async openUnavailability(): Promise<void> {
    if (!this.player) return;
    this.isOpenDutiesModalOpen = false;
    const modal = await this.modalController.create({
      component: UnavailabilityModalComponent,
      componentProps: { personId: this.player.id },
    });
    await modal.present();
    await modal.onDidDismiss();
    await this.getAttendances();
  }

  dutyMeta(t: DutyTermin): string {
    const time = t.attendance.start_time ?? t.type?.start_time;
    return `${time ? time.slice(0, 5) + ' · ' : ''}${translate('signout.dutyOccupied', { occupied: t.occupied, required: t.required })}`;
  }

  dutyTitle(t: DutyTermin): string {
    return t.attendance.typeInfo || t.type?.name || translate('signout.duty');
  }

  async confirmDuty(att: PersonAttendance): Promise<void> {
    await this.db.dutySvc.confirm(att.id, this.db.user?.id);
    Utils.showToast(translate('signout.dutyConfirmed'), 'success', 3000);
    await this.getAttendances();
  }

  declineDuty(att: PersonAttendance): void {
    this.quickSignout(att, false);
  }

  async takeDuty(t: DutyTermin): Promise<void> {
    const result = await this.db.dutySvc.take(t.attendance.id, this.db.tenant().id);
    switch (result) {
      case 'ok':
        Utils.showToast(translate('signout.dutySignedUp'), 'success', 3000);
        break;
      case 'full':
        Utils.showToast(translate('signout.dutyFull'), 'warning', 4000);
        break;
      default:
        Utils.showToast(translate('signout.dutyNotAllowed'), 'warning', 4000);
    }
    await this.getAttendances();
    if (!this.openDuties.length) {
      this.isOpenDutiesModalOpen = false;
    }
  }

  private openAttendanceById(attendanceId: number): void {
    const att = this.personAttendances.find(pa => (pa.attendance_id ?? pa.attId) === attendanceId);
    if (att && this.useDutyView && this.isDutyPa(att) && !isCancelled(att)) {
      // The duty view shows the right buttons on the page itself.
      if (att.duty_state === 'requested') {
        this.scrollToSection('duty-requests');
      } else if (att.id !== this.nextDuty?.id) {
        this.scrollToSection('duty-mine');
      }
    } else if (att) {
      this.presentActionSheetForChoice(att);
    } else if (this.openDuties.some(t => t.attendance.id === attendanceId)) {
      // Push "wer springt ein?" for a duty I am not assigned to.
      this.isOpenDutiesModalOpen = true;
    }
  }

  hasFilesFolder(attendance: PersonAttendance): boolean {
    return Boolean(attendance?.attendance?.files_folder) && this.db.canAccessFiles();
  }

  async openFilesFolder(attendance: PersonAttendance): Promise<void> {
    if (!this.hasFilesFolder(attendance)) {
      return;
    }
    await this.router.navigate(['/tabs/settings/files'], {
      queryParams: { path: attendance.attendance.files_folder, t: String(Date.now()) },
    });
  }

  openAttachment(attendance: any) {
    if (attendance?.attachment_url) {
      Browser.open({ url: attendance.attachment_url });
    }
  }

  openRoute(attendance: PersonAttendance) {
    if (attendance.attendance?.place) {
      Utils.openNavigation(attendance.attendance.place);
    }
  }

  async openDescription(attendance: PersonAttendance) {
    this.selectedDescription = attendance.attendance?.description || '';
    this.descriptionModal.present();
  }

  /**
   * @param hideQuickActions on the current card Zusagen / Verspätung / Absagen already
   * sit as buttons, so the sheet then only offers what is not shown there.
   */
  async presentActionSheetForChoice(attendance: PersonAttendance, hideQuickActions = false) {
    const isExcused = attendance.status === AttendanceStatus.Excused || attendance.status === AttendanceStatus.LateExcused;

    // Read-only for non-participants in show-all mode
    if (this.showAllAttendances && !attendance.id) {
      if (attendance.attendance?.description) {
        await this.openDescription(attendance);
      } else if (attendance.attendance?.share_plan && attendance.attendance?.plan) {
        await this.openPlanViewer(attendance);
      } else if (attendance.attendance?.attachment_url) {
        this.openAttachment(attendance.attendance);
      } else if (attendance.attendance?.place) {
        await Utils.openNavigation(attendance.attendance.place);
      } else if (this.hasFilesFolder(attendance)) {
        await this.openFilesFolder(attendance);
      }
      return;
    }

    let buttons = [
      {
        text: isExcused ? translate('signout.undoSignout') : translate('signout.signIn'),
        handler: () => this.handleSigninWithFields(attendance),
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
        text: translate('signout.editRegistrationFields'),
        handler: () => this.handleSigninWithFields(attendance, '', 'edit'),
      },
      {
        text: translate('signout.editNote'),
        handler: async () => {
          let note = attendance.notes || '';
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
              {
                text: translate('common.cancel'),
                role: 'cancel',
              },
              {
                text: translate('common.save'),
                handler: async (data) => {
                  note = data.note;
                  await this.db.updateAttendanceNote(attendance.id, note);
                  Utils.showToast(translate('signout.noteUpdated'), 'success', 4000);
                  await this.getAttendances();
                },
              },
            ],
          });

          await alert.present();
          this.actionSheetController.dismiss();
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

    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === attendance.typeId);

    const canSignin = this.isSigninOpen(attendance);

    if (attendance.text === 'X' || !canSignin) {
      buttons = buttons.filter((btn) => btn.text !== translate('signout.signIn') && btn.text !== translate('signout.undoSignout') && btn.text !== translate('signout.signInWithNote'));
    }
    if (attType && !attType.available_statuses.includes(AttendanceStatus.Excused)) {
      buttons = buttons.filter((btn) => btn.text !== translate('signout.signOut'));
    }
    if (attType && !attType.available_statuses.includes(AttendanceStatus.Late)) {
      buttons = buttons.filter((btn) => btn.text !== translate('signout.enterLate'));
    }

    if (attendance.text !== 'X') {
      buttons = buttons.filter((btn) => btn.text !== translate('signout.editNote'));
    }

    const isSignedIn = attendance.status === AttendanceStatus.Present || attendance.status === AttendanceStatus.Late;
    if (!isSignedIn || !canSignin || !this.getRegistrationFields(attendance).length) {
      buttons = buttons.filter((btn) => btn.text !== translate('signout.editRegistrationFields'));
    }

    if (isExcused) {
      buttons = buttons.filter((btn) => btn.text !== translate('signout.signInWithNote') && btn.text !== translate('signout.signOut') && btn.text !== translate('signout.enterLate'));
    } else if (attendance.text === 'A') {
      buttons = buttons.filter((btn) => btn.text !== translate('signout.signOut') && btn.text !== translate('signout.enterLate'));
    }

    if (hideQuickActions) {
      const qa = this.quickActions(attendance);
      if (qa) {
        const shown = [translate('signout.signIn'), translate('signout.undoSignout')];
        if (qa.allowExcuse) { shown.push(translate('signout.signOut')); }
        if (qa.allowLate) { shown.push(translate('signout.enterLate')); }
        buttons = buttons.filter((btn) => !shown.includes(btn.text));
      }
    }

    // On the current card plan, infos, attachment, route and files are chips already
    // Add plan viewing option if share_plan is true
    if (attendance.attendance?.share_plan && attendance.attendance?.plan && !(hideQuickActions && this.hasPlan(attendance))) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: translate('signout.showRunSheet'),
        handler: () => this.openPlanViewer(attendance),
      });
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

    if (attendance.attendance?.place && !hideQuickActions) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: translate('signout.openNavigation'),
        handler: () => Utils.openNavigation(attendance.attendance.place),
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

    this.selAttIds = [attendance.id];
    const actionSheet = await this.actionSheetController.create({
      buttons,
    });

    await actionSheet.present();
  }

  // ========== ANMELDEFELDER SIGN-IN GATE ==========

  getRegistrationFields(attendance: PersonAttendance): RegistrationField[] {
    return (attendance?.attendance as any)?.attType?.registration_fields ?? [];
  }

  async handleSigninWithFields(attendance: PersonAttendance, note: string = '', mode: 'signin' | 'edit' = 'signin'): Promise<void> {
    const fields = this.getRegistrationFields(attendance);
    if (!fields.length) {
      if (mode === 'signin') {
        await this.signin(attendance, note);
      }
      return;
    }
    this.regFieldsMode = mode;
    this.pendingSigninNote = note;
    this.regFieldAnswers = {};
    for (const field of fields) {
      const existing = (attendance.registration_answers ?? {})[field.id];
      this.regFieldAnswers[field.id] = existing !== undefined ? existing
        : field.type === 'boolean' ? false
        : field.type === 'multi_select' ? []
        : '';
    }
    this.pendingSigninAttendance = attendance;
    if (fields.length === 1) {
      await this.showSingleFieldAlert(fields[0]);
    } else {
      this.isRegFieldsModalOpen = true;
    }
  }

  async showSingleFieldAlert(field: RegistrationField): Promise<void> {
    let inputs: any[];
    if (field.type === 'text') {
      inputs = [{
        type: 'text',
        name: 'answer',
        placeholder: '...',
        value: this.regFieldAnswers[field.id] ?? '',
      }];
    } else if (field.type === 'boolean') {
      inputs = [
        { type: 'radio', name: 'answer', label: translate('common.yes'), value: true, checked: this.regFieldAnswers[field.id] === true },
        { type: 'radio', name: 'answer', label: translate('common.no'), value: false, checked: this.regFieldAnswers[field.id] === false },
      ];
    } else {
      inputs = (field.options ?? []).map(opt => ({
        type: field.type === 'multi_select' ? 'checkbox' : 'radio',
        name: 'answer',
        label: opt,
        value: opt,
        checked: field.type === 'multi_select'
          ? (this.regFieldAnswers[field.id] as string[] ?? []).includes(opt)
          : this.regFieldAnswers[field.id] === opt,
      }));
    }

    const isEdit = this.regFieldsMode === 'edit';
    const alert = await this.alertController.create({
      header: field.label,
      backdropDismiss: isEdit,
      inputs,
      buttons: [
        ...(isEdit ? [{
          text: translate('common.cancel'),
          role: 'cancel',
          handler: () => { this.pendingSigninAttendance = null; },
        }] : []),
        {
          text: isEdit ? translate('common.save') : translate('signout.signIn'),
          handler: (data) => {
            const answer = field.type === 'multi_select' ? (Array.isArray(data) ? data : []) : data?.answer ?? data;
            this.confirmRegistrationAnswers({ [field.id]: answer });
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmRegistrationAnswers(answers: { [fieldId: string]: any }): Promise<void> {
    const fields = this.getRegistrationFields(this.pendingSigninAttendance);
    for (const field of fields) {
      if (field.type === 'text' && !answers[field.id]?.toString().trim()) {
        Utils.showToast(translate('signout.fillField', { field: field.label }), 'warning');
        return;
      }
    }
    await this.db.updatePersonAttendance(this.pendingSigninAttendance.id, { registration_answers: answers } as any);
    const att = this.pendingSigninAttendance;
    const note = this.pendingSigninNote;
    this.pendingSigninAttendance = null;
    this.pendingSigninNote = '';
    this.isRegFieldsModalOpen = false;
    if (this.regFieldsMode === 'edit') {
      att.registration_answers = answers;
      Utils.showToast(translate('signout.registrationFieldsSaved'), 'success', 4000);
      await this.getAttendances();
      return;
    }
    await this.signin(att, note);
  }

  cancelRegFieldsEdit(): void {
    this.pendingSigninAttendance = null;
    this.pendingSigninNote = '';
    this.isRegFieldsModalOpen = false;
  }

  toggleMultiSelectOption(fieldId: string, option: string): void {
    const arr: string[] = this.regFieldAnswers[fieldId] ?? [];
    const idx = arr.indexOf(option);
    this.regFieldAnswers[fieldId] = idx >= 0 ? arr.filter(o => o !== option) : [...arr, option];
  }

  // ========== TERMINLISTEN (Karten-Layout) ==========

  get upcomingGroups(): EventMonthGroup<PersonAttendance>[] {
    if (this.upcomingGroupsCache?.src !== this.actualAttendances) {
      this.upcomingGroupsCache = { src: this.actualAttendances, groups: groupByMonth(this.actualAttendances, att => att.date) };
    }
    return this.upcomingGroupsCache.groups;
  }

  /** Own past Termine, newest first. */
  get pastAttendances(): PersonAttendance[] {
    if (this.pastCache?.src !== this.personAttendances) {
      this.pastCache = { src: this.personAttendances, list: this.personAttendances.filter(att => attendanceHasEnded(att)) };
    }
    return this.pastCache.list;
  }

  get pastPreview(): PersonAttendance[] {
    return this.showAllPast ? this.pastAttendances : this.pastAttendances.slice(0, PAST_PREVIEW_COUNT);
  }

  weekday(date: string): string {
    return eventWeekday(date);
  }

  day(date: string): string {
    return eventDay(date);
  }

  getEventTitle(att: PersonAttendance): string {
    return att.title || this.getReadableDate(att.date, att.typeId);
  }

  /** Time and place; multi-day Termine (and the current card) also show the date unless it is the title. */
  getEventMeta(att: PersonAttendance, withDate = false, withPlace = true): string {
    const attType = this.db.attendanceTypes().find(type => type.id === att.typeId);
    const showDate = withDate || isMultiDay(att.attendance) || (attType?.all_day && (attType.duration_days ?? 1) > 1);
    const date = this.getReadableDate(att.date, att.typeId);
    return eventMeta(
      // Termine without a name already show the date as title
      showDate && date !== this.getEventTitle(att) ? date : '',
      eventTimeRange(att.attendance?.start_time ?? attType?.start_time, att.attendance?.end_time ?? attType?.end_time),
      withPlace ? att.attendance?.place : '',
    );
  }

  /** In "alle Termine anzeigen" mode the person may not be part of a Termin; then there is no status. */
  isOwnAttendance(att: PersonAttendance): boolean {
    return !this.showAllAttendances || att.isMember;
  }

  percColor(perc: number): string {
    return percentageColor(perc);
  }

  statusColorOf(att: PersonAttendance): string {
    if (att.duty_state === 'requested' && !isCancelled(att) && !attendanceHasEnded(att)) {
      return 'warning';
    }
    return statusColor(att.status);
  }

  statusLabelOf(att: PersonAttendance, past = false): string {
    if (!past && att.duty_state === 'requested' && !isCancelled(att)) {
      return translate('signout.pleaseConfirm');
    }
    return statusLabel(att.status, past);
  }

  isSigninOpen(attendance: PersonAttendance): boolean {
    if (!attendance.attendance?.deadline) {
      return true;
    }
    const localDeadline = dayjs(attendance.attendance.deadline).subtract(dayjs().utcOffset(), 'minute');
    return !dayjs().isAfter(localDeadline);
  }

  /** Direct buttons on the current card; follows the same rules as the action sheet. */
  quickActions(att: PersonAttendance) {
    if (!this.isOwnAttendance(att) || !att.id) {
      return null;
    }
    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === att.typeId);
    return {
      present: att.text === 'X',
      canSignin: att.text !== 'X' && this.isSigninOpen(att),
      late: att.status === AttendanceStatus.LateExcused,
      excused: att.status === AttendanceStatus.Excused,
      blocked: this.isExcusedStatus(att) || att.text === 'A',
      allowLate: !attType || attType.available_statuses.includes(AttendanceStatus.Late),
      allowExcuse: !attType || attType.available_statuses.includes(AttendanceStatus.Excused),
    };
  }

  quickSignout(att: PersonAttendance, isLate: boolean): void {
    this.selAttIds = [att.id];
    this.excusePicker.open(isLate, this.isAttToday(att));
  }

  attIsInFuture(att: PersonAttendance) {
    return dayjs(att.date).isAfter(dayjs(), 'day');
  }

  isExcusedStatus(att: PersonAttendance): boolean {
    return att.status === AttendanceStatus.Excused || att.status === AttendanceStatus.LateExcused;
  }

  isAttToday(att: PersonAttendance) {
    return attendanceIsRunning(att);
  }

  getReadableDate(date: string, type_id: string): string {
    return Utils.getReadableDate(date, this.db.attendanceTypes().find(type => type.id === type_id));
  }

  ionViewWillEnter() {
    // Tasks may have been completed on the detail page meanwhile.
    if (this.viewEntered) {
      void this.myTasks?.load();
    }
    this.viewEntered = true;
  }

  async handleRefresh(event) {
    await Promise.all([this.getAttendances(), this.myTasks?.load()]);

    event.target.complete();
  }

  trackByHistoryId = (_: number, item: History): number => item.id;

  async openPlanViewer(attendance: PersonAttendance) {
    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === attendance.typeId);
    const isPractice = Utils.isPracticeTypeName(attType?.name) ||
      attendance.attendance?.type === 'uebung';

    const modal = await this.modalController.create({
      component: PlanViewerComponent,
      componentProps: {
        attendance: attendance.attendance,
        plan: attendance.attendance?.plan as Plan,
        isPractice,
        playerInstrument: this.player?.instrument,
        songs: this.songs
      }
    });

    await modal.present();
  }

  hasPlan(attendance: PersonAttendance): boolean {
    return attendance.attendance?.share_plan && attendance.attendance?.plan?.fields?.length > 0;
  }

  getSongNames(songIds: number[]): string {
    return songIds.map((id: number) => {
      return `${this.songs.find((s: Song) => s.id === id).number} ${this.songs.find((s: Song) => s.id === id).name}`;
    }).join(', ');
  }

  openSongLink(link: string) {
    if (link) {
      Browser.open({ url: link });
    }
  }

  async openSongOptions(song: Song) {
    if (!this.hasSongNotesForPlayer(song)) {
      Utils.showToast(translate('signout.noScoresForInstrument'), 'danger', 4000);
    }

    const buttons = [];

    if (song.link) {
      buttons.push({
        text: translate('signout.openScoreLink'),
        handler: () => this.openSongLink(song.link),
      });
    }

    // Get files for player's instrument or Chor notes
    let files = song.files.filter((file: SongFile) => file.instrumentId === this.player.instrument);

    // For choir type, also include files with note="Chor"
    if (this.db.tenant().type === 'choir') {
      const choirFiles = song.files.filter((file: SongFile) =>
        file.note?.toLowerCase() === 'chor'
      );
      files = [...files, ...choirFiles];
      // Remove duplicates if a file is both for the instrument and has "Chor" note
      files = files.filter((file, index, self) =>
        index === self.findIndex(f => f.fileName === file.fileName)
      );
    }

    if (files.length === 1) {
      if (!isPlatform('ios')) {
        buttons.push({
          text: translate('signout.downloadScores'),
          handler: async () => {
            const file = files[0];
            if (file) {
              const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), song.id);
              Utils.downloadFileNative(blob, file.fileName);
            }
          },
        });
      }

      buttons.push({
        text: translate('signout.showScores'),
        handler: () => {
          const file = files[0];
          if (file) {
            Utils.openFileNative(file.url, file.fileName);
          }
        },
      });

      buttons.push({
        text: translate('signout.printScores'),
        handler: async () => {
          const file = files[0];
          if (file) {
            await this.printService.printSongFile(song, file);
          }
        },
      });
    } else if (files.length > 1) {
      if (!isPlatform('ios')) {
        buttons.push({
          text: translate('signout.downloadScores'),
          handler: async () => {
            const fileOptions = files.map((file: SongFile) => {
              return {
                text: file.fileName,
                role: '',
                handler: async () => {
                  const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), song.id);
                  Utils.downloadFileNative(blob, file.fileName);
                },
              };
            });

            fileOptions.push({
              text: translate('common.cancel'),
              role: 'destructive',
              handler: () => Promise.resolve(),
            });

            const fileActionSheet = await this.actionSheetController.create({
              header: translate('signout.chooseScoresFor', { song: `${song.number}. ${song.name}` }),
              buttons: fileOptions,
            });

            await fileActionSheet.present();
          },
        });
      }

      buttons.push({
        text: translate('signout.showScores'),
        handler: async () => {
          const fileOptions = files.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: () => {
                Utils.openFileNative(file.url, file.fileName);
              },
            };
          });

          fileOptions.push({
            text: translate('common.cancel'),
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetController.create({
            header: translate('signout.chooseScoresFor', { song: `${song.number}. ${song.name}` }),
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });

      buttons.push({
        text: translate('signout.printScores'),
        handler: async () => {
          const fileOptions = files.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: async () => {
                await this.printService.printSongFile(song, file);
              },
            };
          });

          fileOptions.push({
            text: translate('common.cancel'),
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetController.create({
            header: translate('signout.printScoresFor', { song: `${song.number}. ${song.name}` }),
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });
    }

    const audioFile = song.files.find(f => f.instrumentId === 1);
    if (audioFile) {
      buttons.push({
        text: translate('signout.listenRecording'),
        handler: () => {
          this.audioPlayer.play(audioFile, `${song.number} ${song.name}`);
        },
      });
      buttons.push({
        text: translate('signout.downloadRecording'),
        handler: async () => {
          const blob = await this.db.downloadSongFile(audioFile.storageName ?? audioFile.url.split('/').pop(), song.id);
          Utils.downloadFileNative(blob, audioFile.fileName);
        },
      });
    }

    const liedtextFiles = song.files.filter((file: SongFile) => file.instrumentId === 2);
    if (liedtextFiles.length === 1) {
      buttons.push({
        text: translate('signout.viewLyrics'),
        handler: () => {
          const file = liedtextFiles[0];
          Utils.openFileNative(file.url, file.fileName);
        },
      });
    } else if (liedtextFiles.length > 1) {
      buttons.push({
        text: translate('signout.viewLyrics'),
        handler: async () => {
          const fileOptions = liedtextFiles.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: () => {
                Utils.openFileNative(file.url, file.fileName);
              },
            };
          });

          fileOptions.push({
            text: translate('common.cancel'),
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetController.create({
            header: translate('signout.chooseLyricsFor', { song: `${song.number}. ${song.name}` }),
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });
    }

    buttons.push({
      text: translate('common.cancel'),
      handler: () => { },
      role: 'destructive',
      data: {
        action: 'cancel',
      },
    });

    if (buttons.length === 1) {
      Utils.showToast(translate('signout.noSongActions'), 'warning', 4000);
      return;
    }

    const actionSheet = await this.actionSheetController.create({
      header: `${song.number}. ${song.name}`,
      buttons,
    });

    await actionSheet.present();
  }

  async printAllCurrentFiles(): Promise<void> {
    const filesToPrint: { song: Song; file: SongFile }[] = [];

    // Collect all files for the player's instrument from upcoming songs
    for (const group of this.upcomingSongs) {
      for (const his of group.history) {
        if (his.song?.files) {
          // Get files for player's instrument
          let file = his.song.files.find(f => f.instrumentId === this.player.instrument);

          // For choir type, also check for files with note="Chor" if no instrument file found
          if (!file && this.db.tenant().type === 'choir') {
            file = his.song.files.find(f => f.note?.toLowerCase() === 'chor');
          }

          if (file) {
            filesToPrint.push({ song: his.song, file });
          }
        }
      }
    }

    if (filesToPrint.length === 0) {
      Utils.showToast(translate('signout.noScoresFound'), 'warning');
      return;
    }

    await this.printService.printEntries(filesToPrint, 'aktuelle_noten.pdf');
  }

  showDeadlineInfo(attendance: PersonAttendance): boolean {
    return Boolean(attendance.attendance.deadline);
  }

  getDeadlineText(attendance: PersonAttendance): string {
    const deadline = dayjs(attendance.attendance.deadline);
    const localDeadline = deadline.subtract(dayjs().utcOffset(), 'minute');
    const now = dayjs();

    if (now.isAfter(localDeadline)) {
      return translate('signout.deadlinePassed');
    } else {
      return translate('signout.deadline', { date: localDeadline.format(`${dateFmt()} HH:mm`) });
    }
  }

  /**
   * Check if a song has notes available for the player's instrument.
   * For choir attendance types, also check if there are files with note="Chor".
   */
  hasSongNotesForPlayer(song: Song): boolean {
    if (!song) {return false;}

    // Check if song has the player's instrument in instrument_ids
    const hasInstrumentId = song.instrument_ids?.includes(this.player.instrument);

    // For choir type, also check for files with note="Chor"
    const tenantType = this.db.tenant().type;
    if (tenantType === 'choir') {
      const hasChoirNote = song.files?.some(file =>
        file.note?.toLowerCase() === 'chor'
      );
      return hasInstrumentId || hasChoirNote;
    }

    return hasInstrumentId;
  }

  openPauseModal(): void {
    this.pauseReason = '';
    this.pauseUntil = '';
    this.isPauseModalOpen = true;
  }

  dismissPauseModal(): void {
    this.isPauseModalOpen = false;
    this.pauseReason = '';
    this.pauseUntil = '';
  }

  async confirmPause(): Promise<void> {
    if (!this.pauseReason) {
      Utils.showToast(translate('signout.giveReason'), 'warning');
      return;
    }

    const segments: string[] = [];
    if (this.pauseUntil) {
      segments.push(`bis ${dayjs(this.pauseUntil).format('DD.MM.YYYY')}`);
    }
    const pauseText = segments.length
      ? `${this.pauseReason} (${segments.join(' ')})`
      : this.pauseReason;

    const history: PlayerHistoryEntry[] = [...this.player.history];
    history.push({
      date: new Date().toISOString(),
      text: pauseText,
      type: PlayerHistoryType.PAUSED,
    });

    try {
      await this.db.updatePlayer({
        ...this.player,
        paused: true,
        paused_until: this.pauseUntil || null,
        history,
      }, true);
      this.telegramService.notifyPlayerPaused(this.player.id, this.tenantId, this.pauseReason, this.pauseUntil);
      this.player = await this.db.getPlayerByAppId();
      this.dismissPauseModal();
    } catch (error) {
      Utils.showToast(error, 'danger');
    }
  }

  dismissAbsenceModal(): void {
    this.isAbsenceModalOpen = false;
    this.absenceReason = '';
    this.absenceFrom = '';
    this.absenceUntil = '';
  }

  resetAbsenceRange(): void {
    this.absenceFrom = '';
    this.absenceUntil = '';
  }

  onAbsenceDatePick(event: CustomEvent): void {
    const picked: string = event.detail.value;
    if (!picked) return;
    const date = picked.substring(0, 10);
    if (!this.absenceFrom || (this.absenceFrom && this.absenceUntil)) {
      // First tap: set start, clear end
      this.absenceFrom = date;
      this.absenceUntil = '';
    } else {
      // Second tap: set end (swap if before start)
      if (date < this.absenceFrom) {
        this.absenceUntil = this.absenceFrom;
        this.absenceFrom = date;
      } else {
        this.absenceUntil = date;
      }
    }
  }

  get absenceHighlightedDates(): ((dateString: string) => { textColor: string; backgroundColor: string }) | undefined {
    if (!this.absenceFrom || !this.absenceUntil) return undefined;
    const from = this.absenceFrom;
    const until = this.absenceUntil;
    return (dateString: string) => {
      const d = dateString.substring(0, 10);
      if (d === from || d === until) {
        return { textColor: '#ffffff', backgroundColor: 'var(--ion-color-primary)' };
      }
      if (d > from && d < until) {
        return { textColor: 'var(--ion-color-primary)', backgroundColor: 'rgba(var(--ion-color-primary-rgb), 0.15)' };
      }
      return undefined;
    };
  }

  async confirmAbsence(): Promise<void> {
    if (!this.absenceReason || !this.absenceFrom || !this.absenceUntil) {
      Utils.showToast(translate('signout.fillRequired'), 'danger');
      return;
    }

    const loading = await Utils.getLoadingElement();
    await loading.present();

    try {
      await this.db.addPlayerAbsence({
        tenant_id: this.db.tenant().id,
        person_id: this.player.id,
        from_date: this.absenceFrom,
        until_date: this.absenceUntil,
        reason: this.absenceReason,
      });

      const from = dayjs(this.absenceFrom);
      const until = dayjs(this.absenceUntil);
      const allUpcoming = [
        ...(this.currentAttendance ? [this.currentAttendance] : []),
        ...this.actualAttendances,
      ];
      const toExcuse = allUpcoming.filter(att =>
        !dayjs((att as any).date).isBefore(from, 'day') &&
        !dayjs((att as any).date).isAfter(until, 'day') &&
        att.status !== AttendanceStatus.Excused
      );

      for (const att of toExcuse) {
        await this.db.updatePersonAttendance(att.id, {
          status: AttendanceStatus.Excused,
          notes: this.absenceReason,
        });
      }

      this.dismissAbsenceModal();
      this.playerAbsences = await this.db.getPlayerAbsences(this.player.id);
      await this.getAttendances();
      Utils.showToast(
        toExcuse.length > 0
          ? translate('signout.absenceEnteredCount', { count: toExcuse.length })
          : translate('signout.absenceEntered'),
        'success'
      );
    } finally {
      await loading.dismiss();
    }
  }

  async deleteAbsence(absence: PlayerAbsence): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('signout.deleteAbsence'),
      message: translate('signout.deleteAbsenceMessage'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            const loading = await Utils.getLoadingElement();
            await loading.present();
            try {
              await this.db.deletePlayerAbsence(absence.id);

              const from = dayjs(absence.from_date);
              const until = dayjs(absence.until_date);
              const allUpcoming = [
                ...(this.currentAttendance ? [this.currentAttendance] : []),
                ...this.actualAttendances,
              ];
              const toReset = allUpcoming.filter(att =>
                !dayjs((att as any).date).isBefore(from, 'day') &&
                !dayjs((att as any).date).isAfter(until, 'day') &&
                att.status === AttendanceStatus.Excused &&
                att.notes === absence.reason
              );
              for (const att of toReset) {
                const attType = this.db.attendanceTypes().find(t => t.id === att.typeId);
                await this.db.updatePersonAttendance(att.id, {
                  status: attType?.default_status ?? AttendanceStatus.Neutral,
                  notes: '',
                });
              }
              this.playerAbsences = await this.db.getPlayerAbsences(this.player.id);
              await this.getAttendances();
              Utils.showToast(translate('signout.absenceDeleted'), 'success');
            } finally {
              await loading.dismiss();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmUnpause(): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('signout.endPause'),
      message: translate('signout.endPauseMessage'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('signout.reactivate'),
          handler: async () => {
            const history: PlayerHistoryEntry[] = [...this.player.history];
            history.push({
              date: new Date().toISOString(),
              text: 'Selbst reaktiviert',
              type: PlayerHistoryType.UNPAUSED,
            });

            try {
              await this.db.updatePlayer({
                ...this.player,
                paused: false,
                paused_until: null,
                history,
              }, true);
              this.player = await this.db.getPlayerByAppId();
            } catch (error) {
              Utils.showToast(error, 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }
}
