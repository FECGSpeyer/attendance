import { Component, OnInit, effect } from '@angular/core';
import { DutyDistributeModalComponent } from 'src/app/duty/duty-distribute-modal/duty-distribute-modal.component';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Network } from '@capacitor/network';
import { AlertController, IonItemSliding, IonModal, IonRouterOutlet, ModalController } from '@ionic/angular/lazy';
import { Storage } from '@ionic/storage-angular';
import { ActivatedRoute, Router } from '@angular/router';
import { format, isSameDay, parseISO } from 'date-fns';
import dayjs from 'dayjs';
import { attendanceHasEnded, attendanceIsRunning, isMultiDay } from '../../utilities/plan-days';
import { EventMonthGroup, PAST_PREVIEW_COUNT, eventDay, eventMeta, eventTimeRange, eventWeekday, groupByMonth, percentageColor } from '../../utilities/event-list';
import 'dayjs/locale/de';
import { DbService } from 'src/app/services/db.service';
import { PushService } from 'src/app/services/push/push.service';
import { Attendance, PersonAttendance, PlayerAbsence, Song, History, Person, Plan } from 'src/app/utilities/interfaces';
import { PlanViewerComponent } from 'src/app/planning/plan-viewer/plan-viewer.component';
import { PlanningPage } from 'src/app/planning/planning.page';
import { Utils } from 'src/app/utilities/Utils';
import { createAttendanceForType, personsForAttendanceType } from 'src/app/utilities/attendance-create';
import { AttendanceStatus, DefaultAttendanceType, Role } from 'src/app/utilities/constants';
import { averagePersons, dutyFill, dutyFillColor, dutyRequired, isCancelled, isDutyType, isoWeekday, occupiedCount, occupiesDuty, weekdayLongNames } from 'src/app/utilities/duty';
import { RealtimeChannel } from '@supabase/supabase-js';
import { translate } from '@jsverse/transloco';

@Component({
    selector: 'app-att-list',
    templateUrl: './att-list.page.html',
    styleUrls: ['./att-list.page.scss'],
    standalone: false
})
export class AttListPage implements OnInit {
  public dates: string[] = [new Date().toISOString()];
  public dateString: string = format(new Date(), 'dd.MM.yyyy');
  public type = 'uebung';
  public type_id = '';
  public attendances: Attendance[] = [];
  public oldAttendances: Attendance[] = [];
  public viewerAttendances: Attendance[] = [];
  public allAttendances: Attendance[] = [];
  public currentAttendance: Attendance;
  public isConductor = false;
  public myPersonId: number | null = null;
  public isHelper = false;
  public canCreate = false;
  public isChoir = false;
  public isGeneral = false;
  public notes: string;
  public typeInfo: string;
  public place: string = '';
  public perc = 0;
  private sub: RealtimeChannel;
  private persSub: RealtimeChannel;
  public songs: Song[] = [];
  public selectedSongs: number[] = [];
  public loaded = false;
  public allDayDuration = 1;
  public historyEntry: History = {
    songId: 1,
    person_id: 0,
    date: new Date().toISOString(),
  };
  public holidays: { schoolHolidays: any[]; publicHolidays: any[] } = { schoolHolidays: [], publicHolidays: [] };
  public activeConductors: Person[] = [];
  public otherConductor = 9999999999;
  public historyEntries: History[] = [];
  public highlightedTypes: string[] = [];
  public isAddModalOpen = false;
  public filterTypeId = 'all';
  /** Dienst-Modus: persons needed per ISO weekday when creating several Termine. */
  public dutyRequiredByWeekday: Record<number, number> = {};
  public showAllPast = false;
  public readonly pastPreviewCount = PAST_PREVIEW_COUNT;
  private upcomingGroupsCache: { src: Attendance[]; groups: EventMonthGroup<Attendance>[] };
  public songSearchTerm = '';
  public filteredSongs: Song[] = [];

  highlightedDates = (isoString: string) => {
    const date = new Date(isoString);

    const att = this.allAttendances.find((att: Attendance) => dayjs(att.date).isSame(dayjs(date), 'day'));
    if (att?.type_id) {
      const attType = this.db.attendanceTypes().find(type => type.id === att.type_id);
      return {
        textColor: `var(--ion-color-${attType.color})`,
        backgroundColor: `rgb(var(--ion-color-${attType.color}-rgb), 0.18)`,
      };
    }

    if (this.holidays.publicHolidays.find(h => {
      if (dayjs(date).isSame(dayjs(h.startDate), 'day')) { return true; }
      if (dayjs(date).isSame(dayjs(h.endDate), 'day')) { return true; }
      if (dayjs(date).isAfter(dayjs(h.startDate)) && dayjs(date).isBefore(dayjs(h.endDate))) { return true; }
      return false;
    })) {
      return {
        textColor: 'var(--ion-color-holiday)',
        backgroundColor: 'rgb(var(--ion-color-holiday-rgb), 0.18)',
      };
    }

    if (this.holidays.schoolHolidays.find(h => {
      if (dayjs(date).isSame(dayjs(h.startDate), 'day')) { return true; }
      if (dayjs(date).isSame(dayjs(h.endDate), 'day')) { return true; }
      if (dayjs(date).isAfter(dayjs(h.startDate)) && dayjs(date).isBefore(dayjs(h.endDate))) { return true; }
      return false;
    })) {
      return {
        textColor: 'var(--ion-color-medium)',
        backgroundColor: 'rgb(var(--ion-color-medium-rgb), 0.18)',
      };
    }

    return undefined;
  };

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
    private routerOutlet: IonRouterOutlet,
    private route: ActivatedRoute,
    private router: Router,
    private pushService: PushService,
    private storage: Storage,
  ) {
    effect(async () => {
      this.db.tenant();
      // Reset loaded BEFORE awaiting init() so any consumer reading `loaded`
      // sees the in-flight state of this tenant's data instead of resolving
      // against the previous tenant's stale flag.
      this.loaded = false;
      await this.init();
    });

    effect(() => {
      this.type_id = this.db.attendanceTypes().find(type => type.visible)?.id;
    });

    // Push notifications now navigate conductor/helper roles directly to
    // /tabs/attendance/:id, so the list page no longer needs to consume the
    // pendingAttendanceId signal. PARENT and signout roles still consume it
    // from their own pages — see push.service.ts navigateFromData().
  }

  async ngOnInit() {
    // NOTE: don't call init() here. The constructor's effect on db.tenant()
    // already triggers init() once tenant is set, and a duplicate run was
    // creating a second set of realtime channels (`att-changes`,
    // `person-att-changes`) on the same Supabase topic — events ended up
    // being delivered to the older subscription, which on cold-start
    // could silently swallow updates that the modal relied on.
    this.route.queryParams.subscribe(async params => {
      const tenantId = params['tenantId'];
      if (tenantId && Number(tenantId) !== this.db.tenant()?.id) {
        await this.db.setTenant(Number(tenantId));
        // setTenant updates the tenant signal → constructor effect re-runs
        // init() automatically; no need to call it here.
      }
    });
  }

  /**
   * Refresh the list when returning from /tabs/attendance/:id. The detail
   * page edits attendance/persons rows, and while realtime usually pushes
   * those updates, the explicit refresh on re-entry is the safety net for
   * the cold-start window where the channel may have been torn down.
   */
  ionViewWillEnter(): void {
    if (this.loaded) {
      void this.getAttendance();
    }
  }

  async init(): Promise<void> {
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER || this.db.tenantUser().role === Role.VOICE_LEADER_HELPER;

    if (this.isConductor) {
      this.canCreate = true;
    } else if (this.isHelper) {
      const perm = this.db.getPermissionForRole(this.db.tenantUser().role);
      this.canCreate = perm?.attendance_create !== false;
    }
    if (this.isConductor || this.isHelper) {
      void this.db.getPersonIdForTenant(this.db.tenant().id).then(id => this.myPersonId = id);
    }
    await this.getAttendance();

    if (this.db.tenant().showHolidays && this.db.tenant().region) {
      this.holidays = await this.db.getHolidays(this.db.tenant().region);
    }

    this.subscribeOnAttChannel();

    await this.loadSongData();
  }

  async loadSongData(): Promise<void> {
    this.songs = await this.db.getSongs();
    this.filteredSongs = [...this.songs];
    const conductors = await this.db.getConductors(true);
    this.activeConductors = conductors.filter((con: Person) => !con.left);
    this.historyEntry.person_id = this.activeConductors[0]?.id;
  }

  subscribeOnAttChannel() {
    // Tear down any prior subscriptions before resubscribing. Without this,
    // tenant changes / cold-start push flow / repeated modal opens would
    // accumulate subscriptions on the same Supabase topic, and events could
    // end up delivered to a stale closure instead of the live one.
    this.sub?.unsubscribe();
    this.persSub?.unsubscribe();
    this.sub = this.db.getSupabase()
      .channel('att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (event: any) => {
          if (event.new?.tenantId === this.db.tenant().id || event.old?.id) {
            this.getAttendance();
          }
        })
      .subscribe();

    this.persSub = this.db.getSupabase()
      .channel('person-att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'person_attendances' },
        (event: any) => {
          if (event.new?.tenantId === this.db.tenant().id) {
            this.getAttendance();
          }
        })
      .subscribe();
  }

  async ngOnDestroy() {
    await this.sub.unsubscribe();
    await this.persSub.unsubscribe();
  }

  async handleRefresh(event: any): Promise<void> {
    await this.getAttendance();
    event.target.complete();
  }

  async onTenantChange(tenantId: number): Promise<void> {
    if (this.db.tenant().id === tenantId) { return; }
    const loading = await Utils.getLoadingElement();
    await loading.present();
    await this.db.setTenant(tenantId);
    await this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
    await loading.dismiss();
  }

  async getAttendance(): Promise<void> {
    const { connected } = await Network.getStatus();
    const cacheKey = `offline_att_list_v1_${this.db.tenant()?.id}`;

    if (!connected) {
      const cached = await this.storage.get(cacheKey);
      if (cached?.data) {
        this.applyAttendances(cached.data);
      }
      return;
    }

    const attendances: Attendance[] = (await this.db.getAttendance(false, true)).map((att: Attendance): Attendance => ({
        ...att,
        percentage: Utils.getPercentage(
          averagePersons(att.persons, this.db.attendanceTypes().find(t => t.id === att.type_id)),
          this.db.tenant()?.shift_excused_as_present,
        ),
      }));

    await this.storage.set(cacheKey, { tenantId: this.db.tenant()?.id, data: attendances, cachedAt: new Date().toISOString() });
    this.applyAttendances(attendances);
  }

  private applyAttendances(attendances: Attendance[]): void {
    this.allAttendances = attendances;

    const filtered = this.filterTypeId === 'all' ? attendances : attendances.filter(att => att.type_id === this.filterTypeId);

    this.attendances = filtered.filter((att: Attendance) => !attendanceHasEnded(att)).reverse();
    this.oldAttendances = filtered.filter((att: Attendance) => attendanceHasEnded(att));
    this.viewerAttendances = filtered.filter((att: Attendance) => attendanceHasEnded(att));
    if (this.attendances.length) {
      this.currentAttendance = { ...this.attendances[0] };
      this.viewerAttendances.unshift(this.attendances[0]);
      this.attendances.splice(0, 1);
    } else {
      this.currentAttendance = undefined;
    }

    // Duty Termine without anybody assigned have no meaningful percentage.
    const forAverage = this.oldAttendances.filter((att: Attendance) => !this.isDutyAttendance(att) || (att.persons ?? []).some(p => !!p.duty_state));
    if (forAverage.length) {
      this.perc = Math.round((forAverage.reduce((value: number, current: Attendance) => value + current.percentage, 0)) / forAverage.length);
    }

    this.type_id = this.db.attendanceTypes().find(type => type.visible)?.id;
    this.highlightedTypes = this.db.attendanceTypes().filter(type => type.highlight).map(type => type.id);

    this.loaded = true;
  }

  async remove(id: number, slider: IonItemSliding): Promise<void> {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* Haptics not available in PWA */ }
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: translate('attList.removeConfirm'),
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('attList.continue'),
        handler: async (): Promise<void> => {
          slider.close();
          await this.db.removeAttendance(id);
          this.attendances = this.attendances.filter(a => a.id !== id);
          this.oldAttendances = this.oldAttendances.filter(a => a.id !== id);
          this.viewerAttendances = this.viewerAttendances.filter(a => a.id !== id);
          this.allAttendances = this.allAttendances.filter(a => a.id !== id);
          if (this.currentAttendance?.id === id) { this.currentAttendance = null; }
        }
      }]
    });

    await alert.present();
  }

  onDateChanged(value: string | string[], dateModal: IonModal): void {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      this.dateString = translate('attList.noDate');
      return;
    }

    this.dateString = value.length === 1 ? this.formatDate(value[0]) : translate('attList.eventsSelected', { count: value.length });
  }

  async addAttendance(modal: IonModal): Promise<void> {
    if (!this.dates?.length) {
      Utils.showToast(translate('attList.chooseOneDate'), 'warning');
      return;
    }

    const loading = await Utils.getLoadingElement();
    await loading.present();

    let tenantAbsences: PlayerAbsence[] = [];

    try {
      tenantAbsences = await this.db.getPlayerAbsencesForTenant();
    } catch {
      // non-fatal — proceed without absence check
    }

    const type = this.db.attendanceTypes().find(type => type.id === this.type_id);

    if (!type) {
      Utils.showToast(translate('attList.invalidType'), 'danger');
      await loading.dismiss();
      return;
    }

    const allPersons = await personsForAttendanceType(this.db, type);
    const unavailability = await this.db.dutySvc.getUnavailabilityForTenant(this.db.tenant().id);

    for (const date of this.dates) {
      const attendance_id = await createAttendanceForType(this.db, type, {
        date,
        notes: this.notes,
        typeInfo: this.typeInfo,
        durationDays: this.allDayDuration,
        place: this.place || null,
        dutyRequired: isDutyType(type) ? this.dutyRequiredByWeekday[isoWeekday(date)] ?? type.duty_required : null,
      }, allPersons, tenantAbsences, unavailability);

      if (this.historyEntries.length) {
        await this.db.addSongsToHistory(this.historyEntries.map((entry: History) => ({
            ...entry,
            attendance_id,
            visible: true,
            date,
            tenantId: this.db.tenant().id,
          })));
      }
    }

    await loading.dismiss();
    Utils.showToast(this.dates.length === 1 ? translate('attList.eventAdded') : translate('attList.eventsAdded'), 'success');
    await modal.dismiss();

    // Refresh directly instead of relying solely on the `att-changes` realtime
    // channel. Realtime can silently drop the INSERT in the cold-start /
    // reconnect / backgrounded-tab window (see subscribeOnAttChannel notes),
    // which is why a freshly created attendance did not always show up in the
    // list right away. getAttendance() is idempotent — a later realtime event
    // just reloads the same rows.
    await this.getAttendance();

    this.notes = '';
    this.type = 'uebung';
    this.dates = [new Date().toISOString()];
    this.typeInfo = '';
    this.place = '';
    this.dateString = format(new Date(), 'dd.MM.yyyy');
    this.selectedSongs = [];
    this.historyEntries = [];
    this.dutyRequiredByWeekday = {};
  }

  onTypeChange(): void {
    const attType = this.db.attendanceTypes().find(type => type.id === this.type_id);
    this.allDayDuration = attType.all_day ? attType.duration_days : 1;
    this.dutyRequiredByWeekday = {};
  }

  // ── Dienst-Modus ──────────────────────────────────────────

  get hasDutyTypes(): boolean {
    return this.db.attendanceTypes().some(t => t.duty_mode);
  }

  async openDutyDistribution(): Promise<void> {
    const modal = await this.modalController.create({ component: DutyDistributeModalComponent });
    await modal.present();
    const { role } = await modal.onDidDismiss();
    if (role === 'confirm') {
      await this.getAttendance();
    }
  }

  isDutyTypeSelected(): boolean {
    return isDutyType(this.db.attendanceTypes().find(type => type.id === this.type_id));
  }

  /** Weekdays of the selected dates with the number of Termine and persons needed. */
  get dutyWeekdays(): { weekday: number; label: string; count: number; required: number }[] {
    const type = this.db.attendanceTypes().find(t => t.id === this.type_id);
    const counts = new Map<number, number>();
    for (const date of this.dates ?? []) {
      const wd = isoWeekday(date);
      counts.set(wd, (counts.get(wd) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([weekday, count]) => ({
      weekday,
      label: weekdayLongNames()[weekday - 1],
      count,
      required: this.dutyRequiredByWeekday[weekday] ?? type?.duty_required ?? 1,
    }));
  }

  changeDutyRequired(weekday: number, delta: number): void {
    const type = this.db.attendanceTypes().find(t => t.id === this.type_id);
    const current = this.dutyRequiredByWeekday[weekday] ?? type?.duty_required ?? 1;
    this.dutyRequiredByWeekday = { ...this.dutyRequiredByWeekday, [weekday]: Math.max(1, current + delta) };
  }

  /** Own upcoming duties that still wait for confirmation (leaders have no "Meine Termine" page). */
  get myDutyRequests(): { att: Attendance; pa: PersonAttendance }[] {
    if (!this.myPersonId) return [];
    const result: { att: Attendance; pa: PersonAttendance }[] = [];
    // allAttendances is sorted newest first.
    for (const att of [...this.allAttendances].reverse()) {
      if (attendanceHasEnded(att) || !this.isDutyAttendance(att)) continue;
      const pa = (att.persons ?? []).find(p => p.person_id === this.myPersonId && p.duty_state === 'requested' && !isCancelled(p));
      if (pa) result.push({ att, pa });
    }
    return result;
  }

  async confirmMyDuty(pa: PersonAttendance): Promise<void> {
    await this.db.dutySvc.confirm(pa.id, this.db.user?.id);
    Utils.showToast(translate('signout.dutyConfirmed'), 'success', 3000);
    await this.getAttendance();
  }

  async declineMyDuty(att: Attendance, pa: PersonAttendance): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('signout.cannot'),
      inputs: [{ name: 'reason', type: 'textarea', placeholder: translate('duty.reasonOptional') }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.confirm'),
          handler: async ({ reason }) => {
            await this.db.signout([pa.id], reason ?? '', false, false, true);
            void this.db.dutySvc.notify({ type: 'understaffed', tenantId: this.db.tenant().id, attendanceId: att.id });
            Utils.showToast(translate('duty.declinedToast'), 'success', 3000);
            await this.getAttendance();
          },
        },
      ],
    });
    await alert.present();
  }

  isDutyAttendance(att: Attendance): boolean {
    return isDutyType(this.db.attendanceTypes().find(type => type.id === att.type_id));
  }

  /** "1/2" plus color for duty Termine. */
  dutyBadge(att: Attendance): { text: string; color: string } {
    const type = this.db.attendanceTypes().find(t => t.id === att.type_id);
    const required = dutyRequired(att, type);
    const fill = dutyFill(att.persons, required);
    return {
      text: `${occupiedCount(att.persons)}/${required}${fill === 'requested' ? ' ?' : ''}`,
      color: dutyFillColor(fill),
    };
  }

  /** First names of the persons on duty, "angefragt" for unconfirmed ones. */
  dutyNames(att: Attendance): string {
    const names = (att.persons ?? []).filter(occupiesDuty).map(p =>
      p.duty_state === 'requested' ? `${p.firstName} (angefragt)` : p.firstName);
    return names.length ? names.join(', ') : 'noch niemand eingeteilt';
  }

  isAllDay(): boolean {
    const attType = this.db.attendanceTypes().find(type => type.id === this.type_id);
    return attType?.all_day || false;
  }

  isPlaceEnabled(): boolean {
    const attType = this.db.attendanceTypes().find(type => type.id === this.type_id);
    return attType?.place_enabled || false;
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  onDateClick() {
    if (this.dates.length === 1 && isSameDay(new Date(this.dates[0]), new Date())) {
      this.dates = [];
      this.dateString = translate('attList.noDate');
      Utils.showToast(translate('attList.todayDeselected'), 'light', 3000);
    }
  }

  getReadableDate(date: string, type_id: string): string {
    return Utils.getReadableDate(date, this.db.attendanceTypes().find(type => type.id === type_id));
  }

  async openAttendance(attendance): Promise<void> {
    if (!this.isConductor && !this.isHelper) {
      return;
    }

    await this.router.navigateByUrl(`/tabs/attendance/${attendance.id}`);
  }

  addSong(modal: IonModal): void {
    for (const songId of this.selectedSongs) {
      this.historyEntries.push({
        ...this.historyEntry,
        songId: Number(songId),
        person_id: Boolean(this.historyEntry.otherConductor) ? null : this.historyEntry.person_id,
      });
    }

    this.selectedSongs = [];
    this.historyEntry = {
      person_id: this.activeConductors[0]?.id,
      otherConductor: undefined,
      date: this.historyEntry.date,
      songId: 1,
    };

    modal.dismiss();
  }

  getSongInfo(entry: History): string {
    const song: Song = this.songs.find((s: Song) => s.id === entry.songId);
    if (!song) {
      return translate('attList.unknownSong');
    }
    return `${song.number} ${song.name}`;
  }

  getConductorInfo(entry: History): string {
    if (entry.otherConductor) {
      return entry.otherConductor;
    }

    const conductor: Person | undefined = this.activeConductors.find((con: Person) => con.id === entry.person_id);
    if (!conductor) {
      return translate('attList.unknownConductor');
    }
    return `${conductor.firstName} ${conductor.lastName}`;
  }

  async onConChange() {
    if (this.historyEntry.person_id === this.otherConductor) {
      const alert = await this.alertController.create({
        header: translate('attList.enterConductor'),
        inputs: [
          {
            type: 'text',
            name: 'conductor',
            placeholder: translate('attList.conductor'),
          }
        ],
        buttons: [translate('common.cancel'), {
          text: translate('common.save'),
          handler: (data: any) => {
            this.historyEntry.otherConductor = data.conductor;
          }
        }]
      });

      await alert.present();
    } else {
      delete this.historyEntry.otherConductor;
    }
  }

  showSongsSelection(): boolean {
    return !this.isGeneral && Boolean(this.db.attendanceTypes().find(type => type.id === this.type_id && type.manage_songs));
  }

  setFilter(typeId: string): void {
    this.filterTypeId = typeId;
    void this.getAttendance();
  }

  get upcomingGroups(): EventMonthGroup<Attendance>[] {
    if (this.upcomingGroupsCache?.src !== this.attendances) {
      this.upcomingGroupsCache = { src: this.attendances, groups: groupByMonth(this.attendances, att => att.date) };
    }
    return this.upcomingGroupsCache.groups;
  }

  /** Past Termine for conductors/helpers, everything (incl. current) for viewers. */
  get pastList(): Attendance[] {
    return this.isConductor || this.isHelper ? this.oldAttendances : this.viewerAttendances;
  }

  get pastPreview(): Attendance[] {
    return this.showAllPast ? this.pastList : this.pastList.slice(0, PAST_PREVIEW_COUNT);
  }

  weekday(date: string): string {
    return eventWeekday(date);
  }

  day(date: string): string {
    return eventDay(date);
  }

  percColor(perc: number): string {
    return percentageColor(perc);
  }

  isRunning(att: Attendance): boolean {
    return attendanceIsRunning(att);
  }

  getEventTitle(att: Attendance): string {
    if (att.typeInfo) {
      return att.typeInfo;
    }
    const attType = this.db.attendanceTypes().find(type => type.id === att.type_id);
    return attType && !attType.hide_name ? attType.name : this.getReadableDate(att.date, att.type_id);
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

  hasPlan(att: Attendance): boolean {
    // Beobachter never see the Ablaufplan.
    if (this.db.tenantUser()?.role === Role.VIEWER) { return false; }
    return (att.plan?.fields?.length ?? 0) > 0;
  }

  /** Opens the Ablaufplan read-only; a Termin running today starts in live mode. */
  async openPlanViewer(att: Attendance): Promise<void> {
    const attType = this.db.attendanceTypes().find(type => type.id === att.type_id);
    const modal = await this.modalController.create({
      component: PlanViewerComponent,
      componentProps: {
        attendance: att,
        plan: att.plan as Plan,
        isPractice: Utils.isPracticeTypeName(attType?.name) || att.type === 'uebung',
        songs: this.songs,
        defaultLive: attendanceIsRunning(att),
        canEdit: this.isConductor || this.isHelper,
      },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'edit') {
      const editor = await this.modalController.create({
        component: PlanningPage,
        cssClass: 'planningModal',
        componentProps: { attendanceId: att.id, initialPlanIndex: data?.planIndex ?? 0 },
      });
      await editor.present();
    }
  }

  getStatusCounts(att: Attendance): { present: number; excused: number; absent: number } {
    const persons = att.persons ?? [];
    return {
      present: persons.filter(p => p.status === AttendanceStatus.Present || p.status === AttendanceStatus.Late).length,
      excused: persons.filter(p => p.status === AttendanceStatus.Excused || p.status === AttendanceStatus.LateExcused).length,
      absent: persons.filter(p => p.status === AttendanceStatus.Absent).length,
    };
  }

  getCountText(att: Attendance) {
    return translate('attList.presentOf', { present: Math.round((att.percentage / 100) * att.persons.length), total: att.persons.length });
  }

  onSongSearch(event: any) {
    const searchTerm = event.detail.value?.toLowerCase() || '';
    this.songSearchTerm = searchTerm;

    if (!searchTerm.trim()) {
      this.filteredSongs = [...this.songs];
      return;
    }

    this.filteredSongs = this.songs.filter(song => {
      const songText = `${song.prefix || ''}${song.number} ${song.name}`.toLowerCase();
      return songText.includes(searchTerm);
    });
  }

  resetSongSearch() {
    this.songSearchTerm = '';
    this.filteredSongs = [...this.songs];
  }

  toggleSongSelection(songId: number) {
    // Replace the array (don't mutate in place) so Angular sees a new
    // reference and `<ion-checkbox [checked]>` updates reliably on iOS /
    // macOS Safari, which otherwise can ignore prop changes when the host
    // array reference is unchanged.
    if (this.selectedSongs.includes(songId)) {
      this.selectedSongs = this.selectedSongs.filter(id => id !== songId);
    } else {
      this.selectedSongs = [...this.selectedSongs, songId];
    }
  }
}
