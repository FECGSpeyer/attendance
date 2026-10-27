import { currentLanguage, dateFmt } from '../../i18n/languages';
import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, effect } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ConnectionStatus, Network } from '@capacitor/network';
import { Browser } from '@capacitor/browser';
import { AlertController, ActionSheetController, IonItemSliding, IonModal, ModalController, isPlatform, LoadingController } from '@ionic/angular/lazy';
import { Storage } from '@ionic/storage-angular';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { format } from 'date-fns';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { PlanningPage } from 'src/app/planning/planning.page';
import { StatusInfoComponent } from './status-info/status-info.component';
import { ChurchOverviewComponent } from 'src/app/shared/church-overview/church-overview.component';
import { AdHocReminderModalComponent, AdHocReminderResult } from './ad-hoc-reminder-modal/ad-hoc-reminder-modal.component';
import { DbService } from 'src/app/services/db.service';
import { DefaultAttendanceType, AttendanceStatus, Role, ATTENDANCE_STATUS_MAPPING, AttendanceViewMode, CHECKLIST_DEADLINE_OPTIONS, DEFAULT_ABSENCE_REASONS } from 'src/app/utilities/constants';
import { Attendance, ExtraField, FieldSelection, Person, PersonAttendance, Song, History, Group, GroupCategory, AttendanceType, ChecklistItem, RegistrationField, AGENDA_ITEMS_PLACEHOLDER_ID, Protocol, Task, Plan } from 'src/app/utilities/interfaces';
import { AgendaPickerComponent } from 'src/app/agenda-items/agenda-picker/agenda-picker.component';
import { fieldDisplayName, isEditedAfterPublish, topNumbers } from 'src/app/team-organization/team-org.utils';
import { Utils } from 'src/app/utilities/Utils';
import { promptAttendanceDateChange } from 'src/app/utilities/attendance-date-dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subscription } from 'rxjs';
import { TrackingEvent, TrackingService } from 'src/app/services/tracking/tracking.service';
import { OfflineQueueService } from 'src/app/services/offline-queue/offline-queue.service';
import { allPlans, planDate, planLabel, todayPlanIndex } from 'src/app/utilities/plan-days';
import { openPlanShareSheet } from 'src/app/planning/plan-share-sheet/plan-share-sheet.component';
import { DutyAssignModalComponent, DutyCandidate } from 'src/app/duty/duty-assign-modal/duty-assign-modal.component';
import { dutyFill, dutyFillColor, dutyRequired, dutyStateAfterStatus, isCancelled, isDutyType, matchingUnavailability, occupiesDuty } from 'src/app/utilities/duty';
import { translate } from '@jsverse/transloco';

@Component({
    selector: 'app-attendance',
    templateUrl: './attendance.page.html',
    styleUrls: ['./attendance.page.scss'],
    standalone: false
})
export class AttendancePage implements OnInit, OnDestroy {
  @Input() isModal = false;
  public attendanceId!: number;
  public myPersonId: number | null = null;
  @ViewChild('chooser') chooser: ElementRef;
  readonly AGENDA_ITEMS_PLACEHOLDER_ID = AGENDA_ITEMS_PLACEHOLDER_ID;
  @ViewChild('legendModal') legendModal: IonModal;
  public players: PersonAttendance[] = [];
  public conductors: Person[] = [];
  public excused: Set<string> = new Set();
  public withExcuses: boolean;
  public isOnline = navigator.onLine;
  public attendance: Attendance;
  private sub: RealtimeChannel;
  private personAttSub: RealtimeChannel;
  // Bound reference so we can `removeEventListener` on close. Without this,
  // the listener leaked: when a second modal opened it triggered the previous
  // (dead) instance's handler, which re-fetched the wrong attendance and
  // re-subscribed channels on the same Supabase topics — corrupting the new
  // modal's state.
  private onVisibilityChange: () => void;
  public isHelper = false;
  /** Beobachter never see the Ablaufplan. */
  public isViewer = false;
  public canViewNotes = true;
  public canViewChecklist = true;
  public songs: Song[] = [];
  public selectedSongs: number[] = [];
  public mainGroup: number | undefined;
  public historyEntry: History = {
    songId: 1,
    person_id: 0,
    date: new Date().toISOString(),
  };
  public activeConductors: Person[] = [];
  public otherConductor = 9999999999;
  public historyEntries: History[] = [];
  public isGeneral = false;
  public instruments: Group[] = [];
  public groupCategories: GroupCategory[] = [];
  public manageSongs = false;
  public hasDeadline = false;
  public maxDeadlineDate = '';
  public minDeadlineDate: string = new Date().toISOString();
  public isDeadlineReadonly = false;
  public type: AttendanceType;
  public hasProtocol = false;
  public protocol: Protocol | null = null;
  // Tasks created in this Termin's protocol ("Aufgaben aus diesem Termin").
  public attendanceTasks: Task[] = [];
  private planNumbersCache?: { fields: FieldSelection[]; numbers: Map<string, number> };
  public attendanceViewMode: AttendanceViewMode = AttendanceViewMode.CLICK;
  public AttendanceViewMode = AttendanceViewMode;
  public showAvatars = false;
  public showRegFields = true;
  private helperGroupId: number | null = null;
  public isAddPersonModalOpen = false;
  public availablePersons: (Person & { groupName?: string })[] = [];
  public filteredAvailablePersons: (Person & { groupName?: string })[] = [];
  public selectedPersonsToAdd: number[] = [];
  public isLoadingPersons = false;
  public songSearchTerm = '';
  public filteredSongs: Song[] = [];
  public planLiveMode = false;
  public planActiveFieldIndex = -1;
  /** Plan picked via the chips; null = today's plan (or the first). */
  private selectedPlanIndex: number | null = null;
  private planLiveInterval: any;
  // True when fetchAttendance succeeded but `attendance.persons` came back
  // empty (and the helperGroupId filter isn't responsible). Surfaces an inline
  // "Neu laden" banner so the user can recover without dismissing the modal.
  public personsLoadFailed = false;
  public isRegFieldsModalOpen = false;
  public regFieldAnswers: { [fieldId: string]: any } = {};
  public regFieldsPlayer: PersonAttendance | null = null;
  public statusFilter: Set<number> = new Set();
  public extraFieldSortId: string | null = null;
  public extraFieldSortLevel: 'person' | 'registration' | null = null;
  public extraFieldSortDir: 'asc' | 'desc' = 'asc';

  get filteredPlayers(): PersonAttendance[] {
    const list = this.statusFilter.size === 0
      ? this.players
      : this.players.filter(p => this.statusFilter.has(p.status));

    if (!this.extraFieldSortId) {
      return this.recalculateGroupHeaders(list);
    }

    return [...list]
      .sort((a, b) => {
        const av = this.resolveExtraFieldSortKey(a);
        const bv = this.resolveExtraFieldSortKey(b);
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return this.extraFieldSortDir === 'asc' ? cmp : -cmp;
      })
      .map(p => ({ ...p, firstOfInstrument: false, instrumentLength: 0 }));
  }

  private applyPlayerStatus(id: string, status: number): void {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx >= 0) {
      const player = this.players[idx];
      // Dienstplan: status and assignment move together (see syncDutyWithStatus).
      const duty_state = this.isDuty ? dutyStateAfterStatus(player.duty_state, status) : player.duty_state;
      this.players[idx] = { ...player, status, duty_state };
    }
  }

  /** Shows a new note right away instead of waiting for the realtime echo. */
  private async savePlayerNotes(id: string, notes: string): Promise<void> {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx >= 0) { this.players[idx] = { ...this.players[idx], notes }; }
    this.inFlightWrites.add(id);
    try {
      await this.db.updatePersonAttendance(id, { notes });
    } finally {
      this.inFlightWrites.delete(id);
    }
  }

  private recalculateGroupHeaders(players: PersonAttendance[]): PersonAttendance[] {
    const seenGroups = new Set<string>();
    const groupCounts = new Map<string, number>();
    for (const p of players) {
      const g = p.groupName ?? '';
      groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
    }
    return players.map(p => {
      const g = p.groupName ?? '';
      const isFirst = !seenGroups.has(g);
      if (isFirst) seenGroups.add(g);
      return { ...p, firstOfInstrument: isFirst, instrumentLength: groupCounts.get(g) || 0 };
    });
  }

  get hasRegFields(): boolean {
    return !!((this.type as any)?.registration_fields as RegistrationField[] | undefined)?.length;
  }

  get isFilterActive(): boolean {
    return this.statusFilter.size > 0;
  }

  toggleStatusFilter(status: number): void {
    if (this.statusFilter.has(status)) {
      this.statusFilter.delete(status);
    } else {
      this.statusFilter.add(status);
    }
    this.statusFilter = new Set(this.statusFilter);
  }

  clearStatusFilter(): void {
    this.statusFilter = new Set();
  }

  // Re-entrancy guard for the ad-hoc reminder send. Prevents a second
  // "Versenden" tap from firing another send (and duplicate emails) while
  // one invocation is still in flight.
  private isSendingReminder = false;

  // Mirrors the gate used on the settings page for its instance-switcher FAB.
  // We surface a parallel FAB here for editing/creating the Ablaufplan, only
  // on iOS where the floating action pattern matches the platform's UX.
  public isIos = isPlatform('ios');

  // The tenant this page was loaded for. Captured the first time the tenant
  // signal is non-empty (init() may run before checkToken() resolves and
  // tenant() is briefly undefined on cold start). When the tenant signal
  // later flips to a different id — e.g. the user switches tenants in the
  // settings tab — we kick this page off the attendance tab's stack so it
  // can't keep showing data from the previous tenant.
  private ownedTenantId: number | undefined;

  // Tracks personAttendanceIds whose Supabase write is in-flight so the
  // realtime echo doesn't flicker the UI back to the old value.
  private inFlightWrites = new Set<string>();

  constructor(
    private modalController: ModalController,
    public db: DbService,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private actionSheetController: ActionSheetController,
    private storage: Storage,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private tracking: TrackingService,
    public offlineQueue: OfflineQueueService,
  ) {
    // Watch for cross-tenant switches. Ionic keeps each tab's stack alive, so
    // a tenant change made from the settings tab doesn't tear this page
    // down — without this effect, returning to the attendance tab would show
    // the previous tenant's record. Skip until ownedTenantId is set by init()
    // so we don't redirect during the initial cold-start race where tenant()
    // is briefly undefined.
    effect(() => {
      const currentTenantId = this.db.tenant()?.id;
      if (
        this.ownedTenantId !== undefined &&
        currentTenantId !== undefined &&
        currentTenantId !== this.ownedTenantId
      ) {
        void this.router.navigateByUrl('/tabs/attendance');
      }
    });
  }

  private routeSub?: Subscription;

  async ngOnInit(): Promise<void> {
    if (this.isModal) {
      await this.init();
      return;
    }
    // Re-run init() whenever the :id route param changes. Angular reuses the
    // component instance when only the param changes, so this is the only way
    // to refresh state on detail-to-detail navigation. Also handles the
    // initial mount.
    this.routeSub = this.route.paramMap.subscribe(async params => {
      const idParam = params.get('id');
      if (!idParam) return;
      const newId = Number(idParam);
      if (newId === this.attendanceId) return;

      // Tear down any previous run before starting a new one. Safe on first
      // mount because the listeners are undefined.
      await this.teardown();
      this.attendanceId = newId;
      await this.init();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    void this.teardown();
  }

  /**
   * Releases listeners and realtime channels owned by this page. Called by
   * the param-change subscription before a re-init and by ngOnDestroy.
   * Safe to call multiple times.
   */
  private async teardown(): Promise<void> {
    await Network.removeAllListeners();
    await this.sub?.unsubscribe();
    await this.personAttSub?.unsubscribe();
    this.sub = undefined;
    this.personAttSub = undefined;
    this.stopPlanLive();
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = undefined;
    }
    // Unpin the tenant so the cross-tenant-switch effect stays quiet until
    // the next init() repins it. Otherwise a teardown→init cycle could fire
    // a stale redirect if the tenant signal flickers between the two.
    this.ownedTenantId = undefined;
  }

  private async init(): Promise<void> {
    // Honour an explicit ?tenantId= query param. Push deep links use this so
    // a user with multiple tenants ends up looking at the right one before
    // any data load runs. checkToken() below is idempotent and re-runs after
    // setTenant() has updated the tenant signal.
    const tenantIdParam = this.route.snapshot.queryParamMap.get('tenantId');
    if (tenantIdParam && Number(tenantIdParam) !== this.db.tenant()?.id) {
      await this.db.setTenant(Number(tenantIdParam));
    }

    // When opened via push on a cold start, this page can race ahead of
    // setTenant() — tenant()/tenantUser()/groups() may still be undefined or
    // empty. checkToken() is idempotent (initPromise) and resolves once the
    // tenant context is fully loaded, so awaiting it here makes the rest of
    // init() safe to read those signals synchronously.
    await this.db.checkToken();

    // Pin the tenant this page belongs to. The constructor's effect uses
    // this to detect cross-tenant switches and navigate away.
    this.ownedTenantId = this.db.tenant()?.id;

    void this.db.getPersonIdForTenant(this.ownedTenantId).then(id => this.myPersonId = id);

    this.songs = await this.db.getSongs();
    this.filteredSongs = [...this.songs];
    this.instruments = this.db.groups().filter((instrument: Group) => instrument.maingroup !== true);
    this.groupCategories = await this.db.getGroupCategories();
    this.mainGroup = this.db.getMainGroup().id;
    // Bind so we can remove it on teardown(). The previous inline arrow
    // leaked — every dead page instance kept its handler, and on a
    // cold-start visibility flip both the dead and live pages re-fetched
    // and resubscribed, corrupting the active page's state.
    this.onVisibilityChange = async () => {
      if (!document.hidden) {
        try {
          this.attendance = await this.fetchAttendance('visibility_resume');
          this.initializeAttObjects();
          this.subsribeOnChannels();
          // If the modal was sitting on the empty-state banner waiting for
          // a manual reload, a successful resume-refetch is a recovery too.
          if (Array.isArray(this.attendance?.persons) && this.attendance.persons.length > 0) {
            this.personsLoadFailed = false;
          }
        } catch (e) {
          // Visibility-resume failure is non-fatal — the modal is already
          // open with valid data; we just couldn't refresh on resume.
          console.warn('[attendance] visibility-resume refetch failed:', e);
        }
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.conductors = await this.db.getConductors(true);
    this.activeConductors = this.conductors.filter((con: Person) => !con.left);
    this.historyEntry.person_id = this.activeConductors[0]?.id;
    this.withExcuses = this.db.tenant().withExcuses;
    try {
      this.attendance = await this.fetchAttendance('modal_open');
    } catch (e) {
      console.error('[attendance] failed to load attendance after retries + fallback:', e);
      Utils.showToast(translate('attendance.loadFailedReopen'), 'danger');
      this.navigateBack();
      return;
    }

    // Helper-role profile must be resolved BEFORE initializeAttObjects() so
    // helperGroupId is set when the persons filter runs. Kept in its own
    // try/catch so a profile-fetch hiccup can't block the persons render —
    // the worst case here is "helper sees the unfiltered list", which is
    // strictly better than the previous "everyone sees an empty list".
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
    this.isViewer = this.db.tenantUser().role === Role.VIEWER;
    const isHelperRole =
      this.db.tenantUser().role === Role.HELPER ||
      this.db.tenantUser().role === Role.VOICE_LEADER_HELPER;
    if (isHelperRole) {
      try {
        const perm = this.db.getPermissionForRole(this.db.tenantUser().role);
        this.canViewNotes = perm?.player_notes_view || false;
        this.canViewChecklist = perm?.checklist_view || false;
        if (perm && !perm.attendance_all_groups) {
          const profile = await this.db.getPlayerProfile();
          this.helperGroupId = profile?.instrument ?? null;
        }
      } catch (e) {
        console.warn('[attendance] helper-role init failed; falling back to unfiltered list:', e);
      }
    }

    // Render the persons list NOW, before any other awaited or signal-reading
    // work that could throw and abort ngOnInit. This is the actual fix for
    // the iOS push-open "0/0 modal" bug: previously, an unguarded read of
    // `this.type.manage_songs` further down threw when the type catalog
    // didn't contain the row's type_id, and initializeAttObjects() never ran.
    this.initializeAttObjects();
    if (this.isPlanLiveNow()) { this.togglePlanLive(); }

    // Detect the "fetch returned no persons" case so the UI can show a retry
    // banner instead of a silent 0/0. Telemetry shows this isn't currently
    // happening, but the inline-recovery path is the safety net for any
    // future cold-start RLS regression that the robust fetch can't recover.
    this.personsLoadFailed =
      this.helperGroupId == null &&
      Array.isArray(this.attendance?.persons) &&
      this.attendance.persons.length === 0;

    // Everything past here is supplementary: history, song selection, type
    // metadata, deadline, channel subscriptions. Each section degrades
    // gracefully when its data is missing; wrapping the whole block in a
    // try/catch means a future regression can't take the persons list down
    // with it. AttendanceSecondaryInitFailed surfaces such regressions.
    try {
      this.historyEntries = await this.db.getHistoryByAttendanceId(this.attendanceId);
      this.attendanceViewMode = await this.storage.get('attendanceViewMode') || AttendanceViewMode.CLICK;
      this.showAvatars = (await this.storage.get('attendanceShowAvatars')) ?? false;
      this.showRegFields = (await this.storage.get('attendanceShowRegFields')) ?? true;
      const savedSortField = await this.storage.get(`attSortField${this.attendanceId}`);
      const savedSortLevel = await this.storage.get(`attSortLevel${this.attendanceId}`);
      const savedSortDir = await this.storage.get(`attSortDir${this.attendanceId}`);
      if (savedSortField) {
        this.extraFieldSortId = savedSortField;
        this.extraFieldSortLevel = savedSortLevel || null;
        this.extraFieldSortDir = savedSortDir === 'desc' ? 'desc' : 'asc';
      }

      void this.listenOnNetworkChanges();
      this.selectedSongs = this.attendance.songs || [];
      this.type = await this.resolveAttendanceType();
      this.manageSongs = this.type?.manage_songs || false;
      void this.loadTeamOrg();
      this.hasDeadline = !!this.attendance.deadline;
      if (this.hasDeadline) {
        const startHour = this.type?.start_time ? Number(this.type.start_time.substring(0, 2)) : 19;
        const startMin = this.type?.start_time ? Number(this.type.start_time.substring(3, 5)) : 30;
        this.maxDeadlineDate = dayjs(this.attendance.date).hour(startHour).minute(startMin).toISOString();
        this.isDeadlineReadonly = dayjs(this.attendance.date).isBefore(dayjs());
      }

      this.subsribeOnChannels();
    } catch (e) {
      console.error('[attendance] secondary init failed (persons list still rendered):', e);
      this.tracking.track(TrackingEvent.AttendanceSecondaryInitFailed, {
        attendance_id: this.attendanceId,
        message: e?.message ?? String(e),
      });
    }
  }

  /**
   * Resolve `this.attendance.type_id` against `db.attendanceTypes()`. If the
   * catalog is empty or the id isn't there, refresh the catalog once and try
   * again — this is the deterministic recovery for cold-start signal-replay
   * cases where the catalog hadn't been populated yet when ngOnInit ran. If
   * the id is still missing, return undefined; downstream callers must
   * optional-chain access (`this.type?.X`) instead of crashing.
   */
  private async resolveAttendanceType(): Promise<AttendanceType | undefined> {
    const typeId = this.attendance?.type_id;
    if (typeId == null) return undefined;

    const catalog = this.db.attendanceTypes();
    let matched = catalog.find((t: AttendanceType) => t.id === typeId);
    if (matched) return matched;

    // Either the catalog is empty (signal-replay race) or the row references
    // a type the local catalog doesn't know about. One refresh attempt.
    const fresh = await this.db.refreshAttendanceTypes();
    matched = fresh.find((t: AttendanceType) => t.id === typeId);

    if (!matched) {
      this.tracking.track(TrackingEvent.AttendanceTypeUnresolved, {
        attendance_id: this.attendanceId,
        type_id: typeId,
        types_count_before: catalog.length,
        types_count_after: fresh.length,
      });
    }
    return matched;
  }

  /**
   * Re-fetch the attendance row and re-render the persons list. Used by the
   * inline "Neu laden" banner when `personsLoadFailed` is true.
   */
  async reloadAttendance(): Promise<void> {
    try {
      this.attendance = await this.fetchAttendance('modal_open');
    } catch (e) {
      console.warn('[attendance] reloadAttendance failed:', e);
      Utils.showToast(translate('attendance.reloadFailed'), 'danger');
      return;
    }
    this.initializeAttObjects();
    this.personsLoadFailed =
      this.helperGroupId == null &&
      Array.isArray(this.attendance?.persons) &&
      this.attendance.persons.length === 0;
  }

  subsribeOnChannels() {
    this.sub?.unsubscribe();
    this.personAttSub?.unsubscribe();
    this.sub = this.db.getSupabase()
      .channel('att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (payload: RealtimePostgresChangesPayload<any>) => this.onAttRealtimeChanges(payload))
      .subscribe();
    this.personAttSub = this.db.getSupabase()
      .channel('person-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'person_attendances' },
        (payload: RealtimePostgresChangesPayload<any>) => this.onPersonAttRealtimeChanges(payload))
      .subscribe();
  }

  userById(_: number, person: PersonAttendance): string {
    return person.id;
  }

  initializeAttObjects() {
    // attendance.persons is populated only when the row was fetched via
    // getAttendanceById (which selects the person_attendances join).
    // Realtime postgres_changes payloads only carry the bare attendance row,
    // so onAttRealtimeChanges() leaves persons undefined — bail here so we
    // don't blow away an already-populated players list.
    if (!this.attendance?.persons) {
      return;
    }

    let persons = this.attendance.persons;
    if (this.helperGroupId != null) {
      persons = persons.filter((p: PersonAttendance) => p.instrument === this.helperGroupId);
    }

    this.players = Utils.getModifiedPlayers(persons, this.mainGroup, this.instruments);
  }

  async listenOnNetworkChanges(): Promise<void> {
    this.isOnline = (await Network.getStatus()).connected;
    Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
      // Android also fires this when only the connection type or network
      // capabilities change (e.g. Wi-Fi ↔ mobile), so only react to a real
      // online/offline transition.
      if (status.connected === this.isOnline) {
        return;
      }
      this.isOnline = status.connected;
      Utils.showToast(status.connected ? translate('attendance.connectionRestored') : translate('attendance.noConnection'), status.connected ? 'success' : 'danger');
      if (status.connected) {
        void this.offlineQueue.flush();
      }
    });
  }

  /**
   * Return to the attendance list — used by the realtime "this row was
   * deleted" handlers, by the fetch-failure early-return, and before
   * navigating to a song. Prefers history.back() when there is one (so the
   * list keeps its scroll/state); falls back to a forward navigation when
   * this page was opened via a deep link / push and has no history.
   *
   * Listener and realtime-channel cleanup runs automatically through
   * ngOnDestroy → teardown() once Angular destroys this component, so no
   * explicit teardown is needed here.
   */
  // When opened as a modal (e.g. from the dashboard), a plain routerLink would
  // navigate behind the modal, so close it first.
  async openProtocol(): Promise<void> {
    if (this.isModal) {
      await this.modalController.dismiss();
    }
    await this.router.navigate(['/tabs/attendance', this.attendance.id, 'protocol']);
  }

  navigateBack(): void {
    if (this.isModal) {
      void this.modalController.dismiss();
      return;
    }
    if (window.history.length > 1) {
      this.location.back();
    } else {
      void this.router.navigateByUrl('/tabs/attendance');
    }
  }

  /**
   * Cold-start-resilient fetch. Delegates to AttendanceService's
   * getAttendanceByIdRobust which handles bounded exponential retry of the
   * embedded-resource join + a separate-query fallback if the embed keeps
   * coming back empty (RLS race after auth restore). Throws on total
   * failure — caller decides whether to toast+close or retry.
   */
  private fetchAttendance(context: 'modal_open' | 'visibility_resume'): Promise<Attendance> {
    return this.db.getAttendanceByIdRobust(this.attendanceId, { context });
  }

  onAttRealtimeChanges(payload: RealtimePostgresChangesPayload<any>) {
    if (!Object.keys(payload.new).length && payload.old && (payload.old as { id: number }).id === this.attendance.id) {
      Utils.showToast(translate('attendance.deletedByOther'), 'danger', 3000);
      this.navigateBack();
      return;
    }

    if (payload.new.id !== this.attendance.id) {
      return;
    }

    this.attendance = payload.new;
  }

  onPersonAttRealtimeChanges(payload: RealtimePostgresChangesPayload<any>) {
    if (!Object.keys(payload.new).length) {
      if (payload.old && this.players.find((p: PersonAttendance) => p.id === (payload.old as { id: string }).id)) {
        Utils.showToast(translate('attendance.deletedByOther'), 'danger', 3000);
        this.navigateBack();
        return;
      }
    }

    if (payload.new.attendance_id !== this.attendance.id) {
      return;
    }

    // Skip echo of our own in-flight write to prevent UI flicker
    if (this.inFlightWrites.has(payload.new.id)) {
      return;
    }

    const idx: number = this.players.findIndex((p: PersonAttendance) => p.id === payload.new.id);
    this.players[idx] = {
      ...this.players[idx],
      status: payload.new.status,
      notes: payload.new.notes,
      duty_state: payload.new.duty_state,
    };
  }

  async onAttChange(individual: PersonAttendance) {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* Haptics not available in PWA */ }
    const attType = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    let status;

    if (attType.available_statuses.length === 5) {
      status = ATTENDANCE_STATUS_MAPPING.DEFAULT[individual.status];
    } else if ([AttendanceStatus.Excused, AttendanceStatus.Late].every(status => attType.available_statuses.includes(status))) {
      status = ATTENDANCE_STATUS_MAPPING.NO_NEUTRAL[individual.status];
    } else if ([AttendanceStatus.Late, AttendanceStatus.Neutral].every(status => attType.available_statuses.includes(status))) {
      status = ATTENDANCE_STATUS_MAPPING.NO_EXCUSED[individual.status];
    } else if ([AttendanceStatus.Excused, AttendanceStatus.Neutral].every(status => attType.available_statuses.includes(status))) {
      status = ATTENDANCE_STATUS_MAPPING.NO_LATE[individual.status];
    } else if ([AttendanceStatus.Late].every(status => attType.available_statuses.includes(status))) {
      status = ATTENDANCE_STATUS_MAPPING.NO_NEUTRAL_NO_EXCUSED[individual.status];
    } else if ([AttendanceStatus.Neutral].every(status => attType.available_statuses.includes(status))) {
      status = ATTENDANCE_STATUS_MAPPING.NO_LATE_NO_EXCUSED[individual.status];
    } else if ([AttendanceStatus.Excused].every(status => attType.available_statuses.includes(status))) {
      status = ATTENDANCE_STATUS_MAPPING.NO_LATE_NO_NEUTRAL[individual.status];
    } else if (attType.available_statuses.length === 2 && attType.available_statuses.includes(AttendanceStatus.Present) && attType.available_statuses.includes(AttendanceStatus.Absent)) {
      status = ATTENDANCE_STATUS_MAPPING.ONLY_PRESENT_ABSENT[individual.status];
    } else if (attType.available_statuses.length === 2 && attType.available_statuses.includes(AttendanceStatus.Present) && attType.available_statuses.includes(AttendanceStatus.Excused)) {
      status = ATTENDANCE_STATUS_MAPPING.ONLY_PRESENT_EXCUSED[individual.status];
    } else {
      Utils.showToast(translate('attendance.statusChangeFailed'), 'danger');
      return;
    }

    this.applyPlayerStatus(individual.id, status);

    this.inFlightWrites.add(individual.id);
    this.db.updatePersonAttendance(individual.id, { status })
      .finally(() => this.inFlightWrites.delete(individual.id));
  }

  onAttStaticChange(individual: PersonAttendance, event: any) {
    const status = event.detail.value;
    this.applyPlayerStatus(individual.id, status);
    this.inFlightWrites.add(individual.id);
    this.db.updatePersonAttendance(individual.id, { status })
      .finally(() => this.inFlightWrites.delete(individual.id));
  }

  getAttendedPlayers(players: PersonAttendance[]): number {
    return players.filter((p: PersonAttendance) => p.status === AttendanceStatus.Late || p.status === AttendanceStatus.Present).length;
  }

  getAttendedPlayersForGroup(groupName: string, list: PersonAttendance[] = this.players): number {
    return list.filter((p: PersonAttendance) =>
      p.groupName === groupName && (
        p.status === AttendanceStatus.Late || p.status === AttendanceStatus.Present || p.status === AttendanceStatus.LateExcused
      )
    ).length;
  }

  async addNote(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();

    const presetReasons = this.getPresetReasons();

    const buttons: any[] = presetReasons.map(reason => ({
      text: reason,
      handler: async (): Promise<void> => {
        await this.savePlayerNotes(player.id, reason);
      },
    }));

    buttons.push({
      text: translate('attendance.customNoteEllipsis'),
      handler: async (): Promise<void> => {
        await this.promptCustomNote(player);
      },
    });

    if (player.notes) {
      buttons.push({
        text: translate('attendance.deleteNote'),
        role: 'destructive',
        handler: async (): Promise<void> => {
          await this.savePlayerNotes(player.id, '');
        },
      });
    }

    buttons.push({
      text: translate('common.cancel'),
      role: 'cancel',
    });

    const actionSheet = await this.actionSheetController.create({
      header: translate('attendance.addNote'),
      subHeader: player.notes ? translate('attendance.currentNote', { note: player.notes }) : undefined,
      buttons,
    });

    await actionSheet.present();
  }

  private async promptCustomNote(player: PersonAttendance): Promise<void> {
    const isPreset = player.notes && this.getPresetReasons().includes(player.notes);
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: translate('attendance.customNote'),
      inputs: [{
        type: 'textarea',
        placeholder: translate('attendance.enterNote'),
        value: isPreset ? '' : (player.notes || ''),
        name: 'note',
      }],
      buttons: [{
        text: translate('common.cancel'),
        role: 'cancel',
      }, {
        text: translate('common.save'),
        handler: async (evt: { note: string }): Promise<void> => {
          await this.savePlayerNotes(player.id, evt.note);
        },
      }],
    });

    await alert.present();
  }

  private getPresetReasons(): string[] {
    return this.db.tenant().absence_reasons?.length
      ? this.db.tenant().absence_reasons
      : DEFAULT_ABSENCE_REASONS;
  }

  async onImageSelect(evt: any) {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const imgFile: File = evt.target.files[0];

    if (imgFile) {
      if (imgFile.type.substring(0, 5) === 'image') {
        const reader: FileReader = new FileReader();

        reader.readAsDataURL(imgFile);

        try {
          const url: string = await this.db.updateAttImage(this.attendance.id, imgFile);
          this.attendance.img = url;
        } catch (error) {
          Utils.showToast(error, 'danger');
        }
      } else {
        loading.dismiss();
        Utils.showToast(translate('attendance.pictureFailed'), 'danger');
      }
    }
  }

  // ── Dienstplan ─────────────────────────────────────────────

  get isDuty(): boolean {
    return isDutyType(this.type);
  }

  get dutyRequiredCount(): number {
    return dutyRequired(this.attendance, this.type);
  }

  get dutyOccupants(): PersonAttendance[] {
    return this.players.filter(occupiesDuty);
  }

  /** Persons that cannot do this duty (cancelled assignment or excused upfront). */
  get dutyUnavailable(): PersonAttendance[] {
    return this.players.filter(p => isCancelled(p));
  }

  get dutyAvailable(): PersonAttendance[] {
    return this.players.filter(p => !p.duty_state && !isCancelled(p));
  }

  get dutyFillColor(): string {
    return dutyFillColor(dutyFill(this.players, this.dutyRequiredCount));
  }

  get canManageDuty(): boolean {
    return this.isTeamLeader;
  }

  /** Own assignment that still waits for confirmation (leaders confirm here instead of "Meine Termine"). */
  isOwnRequestedDuty(pa: PersonAttendance): boolean {
    return pa.duty_state === 'requested' && !isCancelled(pa) && !!this.myPersonId && pa.person_id === this.myPersonId;
  }

  async confirmOwnDuty(pa: PersonAttendance): Promise<void> {
    await this.db.dutySvc.confirm(pa.id, this.db.user?.id);
    this.players = this.players.map(p => p.id === pa.id
      ? { ...p, duty_state: 'confirmed', status: AttendanceStatus.Present, notes: '' }
      : p);
    Utils.showToast(translate('signout.dutyConfirmed'), 'success', 3000);
  }

  async declineOwnDuty(pa: PersonAttendance): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('signout.cannot'),
      inputs: [{ name: 'reason', type: 'textarea', placeholder: translate('duty.reasonOptional') }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.confirm'),
          handler: async ({ reason }) => {
            await this.db.signout([pa.id], reason ?? '', false, false, true);
            this.players = this.players.map(p => p.id === pa.id
              ? { ...p, status: AttendanceStatus.Excused, notes: reason ?? '' }
              : p);
            void this.db.dutySvc.notify({ type: 'understaffed', tenantId: this.db.tenant().id, attendanceId: this.attendance.id });
            Utils.showToast(translate('duty.declinedToast'), 'success', 3000);
          },
        },
      ],
    });
    await alert.present();
  }

  async changeDutyRequired(delta: number): Promise<void> {
    const next = Math.max(1, this.dutyRequiredCount + delta);
    this.attendance.duty_required = next;
    await this.db.updateAttendance({ duty_required: next }, this.attendance.id);
  }

  /** Sheet "Person einteilen" (B3). Candidates are sorted by their duties in the Termin's month. */
  async openDutyAssign(preselect?: PersonAttendance): Promise<void> {
    if (preselect) {
      await this.assignDuty([preselect.id]);
      return;
    }
    const candidates = this.players.filter(p => !occupiesDuty(p));
    const month = dayjs(this.attendance.date);
    const [counts, unavailability, sameDayTermine] = await Promise.all([
      this.db.dutySvc.getDutyCounts(
        candidates.map(c => c.person_id),
        month.startOf('month').toISOString(),
        month.endOf('month').toISOString(),
      ),
      this.db.dutySvc.getUnavailabilityForTenant(this.db.tenant().id),
      this.db.dutySvc.getUpcomingDutyTermine(this.db.tenant().id, this.db.attendanceTypes(),
        month.endOf('day').toISOString(), month.startOf('day').toISOString()),
    ]);
    const busyToday = new Set<number>();
    for (const t of sameDayTermine) {
      if (t.attendance.id === this.attendance.id) continue;
      t.persons.filter(occupiesDuty).forEach(p => busyToday.add(p.person_id));
    }

    const list: DutyCandidate[] = candidates.map(pa => {
      const rule = matchingUnavailability(unavailability, pa.person_id, this.attendance.date, this.attendance.type_id);
      let unavailableNote = '';
      if (isCancelled(pa)) {
        unavailableNote = pa.notes ? translate('attendance.cannotWithNote', { note: pa.notes }) : translate('signout.cannot');
      } else if (rule) {
        unavailableNote = rule.reason ? translate('attendance.regularlyUnavailableWithReason', { reason: rule.reason }) : translate('signout.regularlyUnavailable');
      }
      return {
        personAttendanceId: pa.id,
        name: `${pa.firstName} ${pa.lastName}`,
        img: pa.img,
        count: counts.get(pa.person_id) ?? 0,
        sameDay: busyToday.has(pa.person_id),
        unavailableNote,
      };
    });

    const modal = await this.modalController.create({
      component: DutyAssignModalComponent,
      componentProps: {
        title: `${this.type?.name ?? ''} · ${dayjs(this.attendance.date).format(dateFmt('dayMonth'))}`,
        openPlaces: Math.max(0, this.dutyRequiredCount - this.dutyOccupants.length),
        candidates: list,
        monthLabel: month.locale(currentLanguage()).format('MMMM'),
      },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm' && data?.length) {
      await this.assignDuty(data);
    }
  }

  private async assignDuty(personAttendanceIds: string[]): Promise<void> {
    const userId = this.db.user?.id;
    await this.db.dutySvc.assign(personAttendanceIds, this.attendance.id, this.db.tenant().id, userId);
    const now = new Date().toISOString();
    this.players = this.players.map(p => personAttendanceIds.includes(p.id)
      ? { ...p, duty_state: 'requested', status: AttendanceStatus.Neutral, notes: '', duty_assigned_at: now }
      : p);
    Utils.showToast(translate('attendance.assignedNotified', { count: personAttendanceIds.length }), 'success');
  }

  async removeDutyAssignment(pa: PersonAttendance): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('attendance.unassignConfirm'),
      message: `${pa.firstName} ist dann nicht mehr eingeteilt.`,
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('attendance.unassign'),
          role: 'destructive',
          handler: async () => {
            await this.db.dutySvc.unassign(pa.id, this.db.user?.id);
            this.players = this.players.map(p => p.id === pa.id
              ? { ...p, duty_state: null, status: AttendanceStatus.Neutral, notes: '' }
              : p);
          },
        },
      ],
    });
    await alert.present();
  }

  async onDescriptionChanged() {
    await this.db.updateAttendance({
      description: this.attendance.description || null,
    }, this.attendance.id);
  }

  async onPlaceChanged() {
    await this.db.updateAttendance({
      place: this.attendance.place || null,
    }, this.attendance.id);
  }

  async onFilesFolderSelected(path: string) {
    this.attendance.files_folder = path;
    await this.db.updateAttendance({
      files_folder: path,
    }, this.attendance.id);
  }

  async removeFilesFolder() {
    this.attendance.files_folder = null;
    await this.db.updateAttendance({
      files_folder: null,
    }, this.attendance.id);
  }

  async openFilesFolder() {
    if (this.attendance.files_folder) {
      if (this.isModal) {
        await this.modalController.dismiss();
      }
      await this.router.navigate(['/tabs/settings/files'], {
        queryParams: { path: this.attendance.files_folder, t: String(Date.now()) },
      });
    }
  }

  async openNavigation() {
    if (this.attendance.place) {
      await Utils.openNavigation(this.attendance.place);
    }
  }

  async onAttachmentSelect(evt: any) {
    const file: File = evt.target.files[0];
    if (!file) return;

    const loading = await Utils.getLoadingElement();
    await loading.present();

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${this.attendance.id}/attachment/${safeName}`;
      const { error } = await this.db.getSupabase().storage
        .from('attendances')
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const { data } = this.db.getSupabase().storage
        .from('attendances')
        .getPublicUrl(path);

      this.attendance.attachment_url = data.publicUrl;
      this.attendance.attachment_name = file.name;

      await this.db.updateAttendance({
        attachment_url: data.publicUrl,
        attachment_name: file.name,
      }, this.attendance.id);

      Utils.showToast(translate('attendance.attachmentUploaded'), 'success');
    } catch (error) {
      Utils.showToast(translate('attendance.uploadFailed'), 'danger');
    }

    await loading.dismiss();
    evt.target.value = '';
  }

  async removeAttachment() {
    const path = `${this.attendance.id}/attachment/${this.attendance.attachment_name}`;
    await this.db.getSupabase().storage
      .from('attendances')
      .remove([path]);

    this.attendance.attachment_url = null;
    this.attendance.attachment_name = null;

    await this.db.updateAttendance({
      attachment_url: null,
      attachment_name: null,
    }, this.attendance.id);
  }

  openAttachment() {
    if (this.attendance.attachment_url) {
      Browser.open({ url: this.attendance.attachment_url });
    }
  }

  // ---- several Ablaufpläne per Termin (see plan-days.ts) ----

  get planIndex(): number {
    const count = allPlans(this.attendance).length;
    const index = this.selectedPlanIndex ?? todayPlanIndex(this.attendance);
    return Math.min(index, Math.max(count - 1, 0));
  }

  /** The plan shown in the Ablaufplan accordion. */
  get shownPlan(): Plan | undefined {
    return allPlans(this.attendance)[this.planIndex] ?? this.attendance?.plan;
  }

  shownPlanDate(): dayjs.Dayjs {
    return planDate(this.attendance, this.planIndex);
  }

  private planLabelsCache: string[] = [];

  /** Chip labels (empty with a single plan); cached so change detection sees a stable array. */
  get planLabels(): string[] {
    const plans = allPlans(this.attendance);
    const next = plans.length > 1 ? plans.map((_, i) => planLabel(this.attendance, i, plans)) : [];
    if (next.join('|') !== this.planLabelsCache.join('|')) {
      this.planLabelsCache = next;
    }
    return this.planLabelsCache;
  }

  get todayPlanChip(): number {
    const index = todayPlanIndex(this.attendance);
    return planDate(this.attendance, index).isSame(dayjs(), 'day') ? index : -1;
  }

  selectPlan(index: number) {
    this.selectedPlanIndex = index;
    this.hasAutoScrolled = false;
    if (this.planLiveMode) {
      this.stopPlanLive();
    }
    if (this.isPlanLiveNow()) {
      this.togglePlanLive();
    }
  }

  isPlanLiveNow(): boolean {
    const plan = this.shownPlan;
    if (!plan?.time || !plan?.fields?.length || !this.attendance?.date) { return false; }
    const now = dayjs();
    const start = this.shownPlanDate()
      .hour(Number(plan.time.substring(0, 2)))
      .minute(Number(plan.time.substring(3, 5)))
      .second(0);
    const totalMinutes = plan.fields.reduce((s: number, f: FieldSelection) => s + (Number(f.time) || 0), 0);
    const end = start.add(totalMinutes, 'minute');
    return now.isAfter(start.subtract(5, 'minute')) && now.isBefore(end.add(15, 'minute'));
  }

  togglePlanLive() {
    this.planLiveMode = !this.planLiveMode;
    if (this.planLiveMode) {
      this.updatePlanActiveIndex();
      this.planLiveInterval = setInterval(() => this.updatePlanActiveIndex(), 1000);
    } else {
      this.stopPlanLive();
    }
  }

  private stopPlanLive() {
    if (this.planLiveInterval) { clearInterval(this.planLiveInterval); this.planLiveInterval = null; }
    this.planLiveMode = false;
    this.planActiveFieldIndex = -1;
  }

  updatePlanActiveIndex() {
    const plan = this.shownPlan;
    if (!plan?.fields?.length || !plan.time || !this.attendance?.date) {
      this.planActiveFieldIndex = -1;
      return;
    }
    const now = dayjs();
    let t = this.shownPlanDate()
      .hour(Number(plan.time.substring(0, 2)))
      .minute(Number(plan.time.substring(3, 5)))
      .second(0);
    for (let i = 0; i < plan.fields.length; i++) {
      t = t.add(Number(plan.fields[i].time) || 0, 'minute');
      if (now.isBefore(t)) {
        this.planActiveFieldIndex = i;
        this.scrollToActiveSlot();
        return;
      }
    }
    this.planActiveFieldIndex = plan.fields.length - 1;
    this.scrollToActiveSlot();
  }

  private hasAutoScrolled = false;

  private scrollToActiveSlot() {
    if (this.hasAutoScrolled) { return; }
    setTimeout(() => {
      const el = document.querySelector('.active-slot');
      if (!el) { return; }
      this.hasAutoScrolled = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  getPlanActiveCountdown(): string {
    if (!this.planLiveMode || this.planActiveFieldIndex < 0) { return ''; }
    const plan = this.shownPlan;
    if (!plan?.fields?.length || !plan.time || !this.attendance?.date) { return ''; }
    let t = this.shownPlanDate()
      .hour(Number(plan.time.substring(0, 2)))
      .minute(Number(plan.time.substring(3, 5)))
      .second(0);
    for (let i = 0; i <= this.planActiveFieldIndex; i++) {
      t = t.add(Number(plan.fields[i].time) || 0, 'minute');
    }
    const remaining = Math.max(0, t.diff(dayjs(), 'second'));
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  calculateTime(field: FieldSelection, index: number) {
    let minutesToAdd = 0;
    let currentIndex = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.shownPlan.fields[currentIndex].time);
      currentIndex++;
    }

    const time: dayjs.Dayjs = dayjs().hour(Number(this.shownPlan.time.substring(0, 2))).minute(Number(this.shownPlan.time.substring(3, 5)));
    return `${time.add(minutesToAdd, 'minute').format('HH:mm')} ${field.conductor ? `| ${field.conductor}` : ''}`;
  }

  async exportPlan(sideBySide: boolean = false, all: boolean = false) {
    if (all || this.planLabels.length) {
      await Utils.exportAttendancePlans({
        attendance: this.attendance,
        type: this.db.attendanceTypes().find(type => type.id === this.attendance.type_id),
        indexes: all ? allPlans(this.attendance).map((_, i) => i) : [this.planIndex],
        sideBySide,
        branding: await Utils.buildTenantBranding(this.db.getBrandingSource()),
      });
      return;
    }
    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    await Utils.createPlanExport({
      ...this.attendance.plan,
      attendance: this.attendance.id,
      attendances: await this.db.getAttendance(),
      sideBySide,
      branding: await Utils.buildTenantBranding(this.db.getBrandingSource()),
    }, Utils.getPlanningTitle(type, this.attendance.typeInfo));
  }

  // ── Teamorganisation: TOPs, protocol card, tasks ─────────

  get isTeamLeader(): boolean {
    return this.db.isTeamLeader();
  }

  /** TOP numbers of the plan, recomputed only when the fields array changes. */
  get planNumbers(): Map<string, number> {
    const fields = this.shownPlan?.fields ?? [];
    if (this.planNumbersCache?.fields !== fields) {
      this.planNumbersCache = { fields, numbers: topNumbers(fields) };
    }
    return this.planNumbersCache.numbers;
  }

  fieldName(field: FieldSelection): string {
    return fieldDisplayName(field, this.planNumbers);
  }

  get protocolEditedAfterPublish(): boolean {
    return isEditedAfterPublish(this.protocol);
  }

  async loadTeamOrg() {
    if (!this.attendance?.id || !this.type?.enable_protocol) {
      this.protocol = null;
      this.hasProtocol = false;
      this.attendanceTasks = [];
      return;
    }
    try {
      const [protocol, tasks] = await Promise.all([
        this.db.getProtocolForAttendance(this.attendance.id),
        this.db.getTasksForAttendance(this.attendance.id),
      ]);
      this.protocol = protocol;
      this.hasProtocol = !!protocol;
      this.attendanceTasks = tasks ?? [];
    } catch (e) {
      console.warn('[attendance] team-org data failed to load:', e);
    }
  }

  // Refresh after coming back from the protocol or a task.
  ionViewWillEnter() {
    void this.loadTeamOrg();
  }

  async openAgendaPicker() {
    const modal = await this.modalController.create({
      component: AgendaPickerComponent,
      componentProps: { attendance: this.attendance, type: this.type },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'saved' && data?.plan) {
      this.attendance = { ...this.attendance, plan: data.plan };
    }
  }

  // When opened as a modal (e.g. from the dashboard), a plain routerLink would
  // navigate behind the modal, so close it first.
  async navigateFromPage(commands: any[]): Promise<void> {
    if (this.isModal) {
      await this.modalController.dismiss();
    }
    await this.router.navigate(commands);
  }

  openPlanField(field: FieldSelection) {
    if (field.agendaItemId && this.isTeamLeader) {
      void this.navigateFromPage(['/tabs/settings/agenda-items', field.agendaItemId]);
    }
  }

  openTask(task: Task) {
    void this.navigateFromPage(['/tabs/settings/tasks', task.id]);
  }

  taskStatusLabel(task: Task): string {
    switch (task.status) {
      case 'completed': return translate('tasks.status.completed');
      case 'in_progress': return translate('tasks.status.inProgress');
      default: return translate('tasks.status.open');
    }
  }

  async sharePlan() {
    const labels = this.planLabels;
    if (labels.length) {
      const choice = await openPlanShareSheet(this.modalController, {
        currentLabel: labels[this.planIndex],
        planCount: labels.length,
        hasChatId: Boolean(this.db.tenantUser()?.telegram_chat_id),
      });
      if (!choice) { return; }
      const all = choice.scope === 'all';
      switch (choice.action) {
        case 'pdf': return this.exportPlan(false, all);
        case 'pdf2x': return this.exportPlan(true, all);
        case 'telegram': return this.send(false, false, all);
        case 'telegram2x': return this.send(false, true, all);
        case 'telegramImage': return this.send(true);
      }
      return;
    }
    const sheet = await this.actionSheetController.create({
      header: translate('attendance.shareRunSheet'),
      buttons: [
        {
          text: translate('attendance.exportPdf'),
          icon: 'document-outline',
          handler: () => this.exportPlan(),
        },
        {
          text: translate('attendance.exportPdfA5'),
          icon: 'documents-outline',
          handler: () => this.exportPlan(true),
        },
        {
          text: translate('attendance.telegramPdf'),
          icon: 'paper-plane-outline',
          handler: () => this.send(false),
        },
        {
          text: translate('attendance.telegramPdfA5'),
          icon: 'paper-plane-outline',
          handler: () => this.send(false, true),
        },
        {
          text: translate('attendance.telegramImage'),
          icon: 'image-outline',
          handler: () => this.send(true),
        },
        { text: translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async send(asImage: boolean = false, sideBySide: boolean = false, all: boolean = false) {
    if (all || this.planLabels.length) {
      const { blob, name } = await Utils.exportAttendancePlans({
        attendance: this.attendance,
        type: this.db.attendanceTypes().find(type => type.id === this.attendance.type_id),
        indexes: all ? allPlans(this.attendance).map((_, i) => i) : [this.planIndex],
        sideBySide,
        asBlob: true,
        asImage: asImage && !all,
        branding: await Utils.buildTenantBranding(this.db.getBrandingSource()),
      });
      if (blob) {
        this.db.sendPlanPerTelegram(blob, name, asImage && !all);
      }
      return;
    }
    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    const planningTitle = Utils.getPlanningTitle(type, this.attendance.typeInfo);
    const blob = await Utils.createPlanExport({
      ...this.attendance.plan,
      attendance: this.attendance.id,
      attendances: await this.db.getAttendance(),
      asBlob: true,
      asImage,
      sideBySide,
      branding: await Utils.buildTenantBranding(this.db.getBrandingSource()),
    }, planningTitle);

    this.db.sendPlanPerTelegram(blob, `${planningTitle.replace('(', '').replace(')', '')}_${dayjs(this.attendance.date).format('DD_MM_YYYY')}${sideBySide ? '_2x' : ''}`, asImage);
  }

  async editPlan() {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PlanningPage,
      cssClass: 'planningModal',
      componentProps: {
        attendanceId: this.attendance.id,
        initialPlanIndex: this.planIndex,
      },
    });

    await modal.present();
  }

  /** "Datum": moves the Termin to another day (asks whether to reset statuses). */
  async changeDate() {
    const updated = await promptAttendanceDateChange(this.alertController, this.db, this.attendance);
    if (updated) {
      this.attendance = updated;
      this.initializeAttObjects();
      if (this.attendance.deadline) {
        const startHour = this.type?.start_time ? Number(this.type.start_time.substring(0, 2)) : 19;
        const startMin = this.type?.start_time ? Number(this.type.start_time.substring(3, 5)) : 30;
        this.maxDeadlineDate = dayjs(this.attendance.date).hour(startHour).minute(startMin).toISOString();
      }
    }
  }

  async onInfoChanged() {
    // Remember the persisted times before normalization so we can tell whether
    // this edit actually moved the time window (vs. a type/notes/deadline edit
    // that flows through the same handler).
    const previousStart = this.attendance.start_time;
    const previousEnd = this.attendance.end_time;

    // start_time is a date string and need to be converted to "HH:mm"
    if (!this.attendance.start_time || this.attendance.start_time === 'Invalid Date') {
      this.attendance.start_time = '19:30';
    }
    if (!this.attendance.end_time || this.attendance.end_time === 'Invalid Date') {
      this.attendance.end_time = '21:00';
    }
    const start_time = this.attendance.start_time.length !== 5 ? dayjs(this.attendance.start_time).format('HH:mm') : this.attendance.start_time;
    const end_time = this.attendance.end_time.length !== 5 ? dayjs(this.attendance.end_time).format('HH:mm') : this.attendance.end_time;

    if (!this.hasDeadline) {
      this.attendance.deadline = null;
    }

    await this.db.updateAttendance({
      type: this.attendance.type,
      typeInfo: this.attendance.typeInfo,
      notes: this.attendance.notes,
      save_in_history: this.attendance.save_in_history,
      start_time,
      end_time,
      deadline: this.attendance.deadline,
    }, this.attendance.id);

    // When the time window moved, re-run the shift computation for everyone in
    // this event: a person auto-excused by a shift that overlapped the old time
    // may no longer overlap the new one (and vice versa). Then reload so the
    // list reflects the recomputed statuses.
    if (start_time !== previousStart || end_time !== previousEnd) {
      await this.db.updateShiftAssignmentsForAttendance(this.attendance.id);
      this.attendance = await this.db.getAttendanceById(this.attendanceId);
      this.initializeAttObjects();
    }

    if (this.historyEntries.length && this.historyEntries[0].visible !== this.attendance.save_in_history) {
      for (const entry of this.historyEntries) {
        await this.db.updateHistoryEntry(entry.id, { visible: this.attendance.save_in_history });
      }
    }
  }

  async addSongsToHistory(modal: any): Promise<void> {
    const songsToAdd: History[] = [];
    for (const songId of this.selectedSongs) {
      songsToAdd.push({
        ...this.historyEntry,
        date: this.attendance.date,
        songId: Number(songId),
        tenantId: this.db.tenant().id,
        attendance_id: this.attendance.id,
        person_id: Boolean(this.historyEntry.otherConductor) ? null : this.historyEntry.person_id,
        visible: true,
      });
    }

    await this.db.addSongsToHistory(songsToAdd);
    this.historyEntries = await this.db.getHistoryByAttendanceId(this.attendance.id);

    this.selectedSongs = [];
    this.historyEntry = {
      person_id: this.activeConductors[0]?.id,
      otherConductor: undefined,
      date: this.historyEntry.date,
      songId: 1,
    };

    modal.dismiss();
  }

  async removeHistoryEntry(id: number): Promise<void> {
    await this.db.removeHistoryEntry(id);
    this.historyEntries = await this.db.getHistoryByAttendanceId(this.attendance.id);
  }

  async onHistoryEntryClick(entry: History): Promise<void> {
    const actionSheet = await this.actionSheetController.create({
      header: this.getSongInfo(entry),
      subHeader: this.getConductorInfo(entry),
      buttons: [
        {
          text: translate('attendance.changeConductor'),
          handler: async (): Promise<void> => {
            await this.changeConductor(entry);
          },
        },
        {
          text: translate('attendance.toSong'),
          handler: async (): Promise<void> => {
            await this.navigateToSong(entry.songId);
          },
        },
        {
          text: translate('common.cancel'),
          role: 'cancel',
        },
      ],
    });
    await actionSheet.present();
  }

  private async changeConductor(entry: History): Promise<void> {
    const inputs: any[] = this.activeConductors.map((con: Person) => ({
      type: 'radio',
      label: `${con.firstName} ${con.lastName}`,
      value: con.id,
      checked: !entry.otherConductor && entry.person_id === con.id,
    }));
    inputs.push({
      type: 'radio',
      label: translate('attList.otherConductor'),
      value: this.otherConductor,
      checked: Boolean(entry.otherConductor),
    });

    const alert = await this.alertController.create({
      header: translate('attendance.changeConductor'),
      inputs,
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: async (selected: number): Promise<void> => {
            if (selected === undefined || selected === null) {
              return;
            }
            if (selected === this.otherConductor) {
              await this.promptOtherConductor(entry);
            } else {
              await this.db.updateHistoryEntry(entry.id, {
                person_id: selected,
                otherConductor: null,
              });
              this.historyEntries = await this.db.getHistoryByAttendanceId(this.attendance.id);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async promptOtherConductor(entry: History): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('attList.enterConductor'),
      inputs: [{
        type: 'text',
        name: 'conductor',
        placeholder: translate('attList.conductor'),
        value: entry.otherConductor || '',
      }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: async (data: { conductor: string }): Promise<void> => {
            const name = (data.conductor || '').trim();
            if (!name) {
              return;
            }
            await this.db.updateHistoryEntry(entry.id, {
              person_id: null,
              otherConductor: name,
            });
            this.historyEntries = await this.db.getHistoryByAttendanceId(this.attendance.id);
          },
        },
      ],
    });
    await alert.present();
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

    const conductor: Person | undefined = this.conductors.find((con: Person) => con.id === entry.person_id);
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

  getMissingGroups(songId: number): string {
    const song = this.songs.find((s: Song) => s.id === songId);

    if (!song || !song.instrument_ids || !song.instrument_ids.length) {
      return '';
    }

    const text = Utils.getInstrumentText(song.instrument_ids, this.instruments, this.groupCategories);
    return text;
  }

  getTypeName(type_id: string) {
    return this.db.attendanceTypes().find(type => type.id === type_id)?.name || translate('common.unknown');
  }

  toNeutral(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();
    this.applyPlayerStatus(player.id, AttendanceStatus.Neutral);
    this.inFlightWrites.add(player.id);
    this.db.updatePersonAttendance(player.id, { status: AttendanceStatus.Neutral })
      .finally(() => this.inFlightWrites.delete(player.id));
  }

  toLateExcused(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();
    this.applyPlayerStatus(player.id, AttendanceStatus.LateExcused);
    this.inFlightWrites.add(player.id);
    this.db.updatePersonAttendance(player.id, { status: AttendanceStatus.LateExcused })
      .finally(() => this.inFlightWrites.delete(player.id));
  }

  async removeFromAttendance(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();

    const alert = await this.alertController.create({
      header: translate('attendance.removePerson'),
      message: translate('attendance.removePersonConfirm', { name: `${player.firstName} ${player.lastName}` }),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel'
        },
        {
          text: translate('common.remove'),
          role: 'destructive',
          handler: async () => {
            try {
              await this.db.deletePersonAttendanceById(player.id);

              // Reload attendance data to properly rebuild the list with headers
              this.attendance = await this.db.getAttendanceById(this.attendanceId);
              this.initializeAttObjects();

              Utils.showToast(translate('attendance.personRemoved'), 'success');
            } catch (error) {
              console.error('Error removing person:', error);
              Utils.showToast(translate('attendance.personRemoveFailed'), 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async getModifierInfo(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();

    if (!player.changed_by) {
      await Utils.showToast(translate('attendance.statusNotChanged'), 'warning');
      return;
    }

    const person = this.players.find((p: PersonAttendance) => player.changed_by === p.person.appId);

    let name: string;
    if (!person) {
      name = player.changed_by === '665fe2b4-d53f-4f17-a66b-46c0949af99a' ? 'Matthias Eckstädt' : `'${translate('common.unknown')}'`;
    } else {
      name = `${person.firstName} ${person.lastName}`;
    }

    const message = player.changed_at
      ? translate('attendance.lastChangedByAt', {
        name,
        date: format(new Date(player.changed_at), 'dd.MM.yyyy'),
        time: format(new Date(player.changed_at), 'HH:mm'),
      })
      : translate('attendance.lastChangedBy', { name });

    const alert = await this.alertController.create({
      message,
      buttons: [translate('common.ok')],
    });

    await alert.present();
  }

  openRegFieldsEditor(player: PersonAttendance): void {
    const fields: RegistrationField[] = (this.type as any)?.registration_fields ?? [];
    this.regFieldAnswers = {};
    for (const field of fields) {
      const existing = (player.registration_answers ?? {} as any)[field.id];
      this.regFieldAnswers[field.id] = existing !== undefined ? existing
        : field.type === 'boolean' ? false
        : field.type === 'multi_select' ? []
        : '';
    }
    this.regFieldsPlayer = player;
    if (fields.length === 1) {
      this.showRegFieldAlert(fields[0], player);
    } else {
      this.isRegFieldsModalOpen = true;
    }
  }

  async showRegFieldAlert(field: RegistrationField, player: PersonAttendance): Promise<void> {
    let inputs: any[];
    if (field.type === 'text') {
      inputs = [{ type: 'text', name: 'answer', placeholder: '...', value: this.regFieldAnswers[field.id] ?? '' }];
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
    const alert = await this.alertController.create({
      header: field.label,
      inputs,
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: (data) => {
            const answer = field.type === 'multi_select' ? (Array.isArray(data) ? data : []) : data?.answer ?? data;
            this.saveRegFieldAnswers({ [field.id]: answer }, player);
          },
        },
      ],
    });
    await alert.present();
  }

  async saveRegFieldAnswers(answers: { [fieldId: string]: any }, player?: PersonAttendance): Promise<void> {
    const target = player ?? this.regFieldsPlayer;
    if (!target) { return; }
    const merged = { ...(target.registration_answers ?? {} as any), ...answers };
    await this.db.updatePersonAttendance(target.id, { registration_answers: merged } as any);
    target.registration_answers = merged as any;
    this.isRegFieldsModalOpen = false;
    this.regFieldsPlayer = null;
  }

  toggleRegFieldMultiSelect(fieldId: string, option: string): void {
    const arr: string[] = this.regFieldAnswers[fieldId] ?? [];
    const idx = arr.indexOf(option);
    this.regFieldAnswers[fieldId] = idx >= 0 ? arr.filter(o => o !== option) : [...arr, option];
  }

  async openMoreSheet(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();

    const buttons: any[] = [];

    if (player.status !== 0) {
      buttons.push({
        text: translate('attendance.setNeutral'),
        icon: 'remove-circle-outline',
        handler: () => {
          this.applyPlayerStatus(player.id, AttendanceStatus.Neutral);
          this.inFlightWrites.add(player.id);
          this.db.updatePersonAttendance(player.id, { status: AttendanceStatus.Neutral })
            .finally(() => this.inFlightWrites.delete(player.id));
        },
      });
    }

    if (this.type?.available_statuses.includes(3) && this.attendanceViewMode === AttendanceViewMode.CLICK) {
      buttons.push({
        text: translate('common.status.lateExcused'),
        icon: 'time-outline',
        handler: () => {
          this.applyPlayerStatus(player.id, AttendanceStatus.LateExcused);
          this.inFlightWrites.add(player.id);
          this.db.updatePersonAttendance(player.id, { status: AttendanceStatus.LateExcused })
            .finally(() => this.inFlightWrites.delete(player.id));
        },
      });
    }

    const regFields: RegistrationField[] = (this.type as any)?.registration_fields ?? [];
    if (regFields.length) {
      buttons.push({
        text: translate('attendance.editRegFields'),
        icon: 'create-outline',
        handler: () => this.openRegFieldsEditor(player),
      });
    }

    if (!this.isHelper) {
      buttons.push({
        text: translate('attendance.whoChanged'),
        icon: 'information-circle-outline',
        handler: async () => {
          await this.getModifierInfo(player, slider);
        },
      });

      buttons.push({
        text: translate('attendance.removePerson'),
        role: 'destructive',
        icon: 'trash-outline',
        handler: async () => {
          await this.removeFromAttendance(player, slider);
        },
      });
    }

    buttons.push({
      text: translate('attendance.sendReminderShort'),
      icon: 'notifications-outline',
      handler: async () => {
        await this.sendAdHocReminder(player.person?.appId);
      },
    });

    buttons.push({ text: translate('common.cancel'), role: 'cancel' });

    const sheet = await this.actionSheetController.create({
      header: `${player.firstName} ${player.lastName}`,
      buttons,
    });

    await sheet.present();
  }

  async exportToExcel() {
    await Utils.exportAttendanceToExcel(
      this.attendance,
      this.players,
      this.db.attendanceTypes().find(type => type.id === this.attendance.type_id),
      this.db.churches(),
    );
  }

  onDeadlineToggleChanged() {
    if (this.hasDeadline) {
      const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
      const hour = type.start_time ? Number(type.start_time.substring(0, 2)) + 2 : 19;
      let deadline = dayjs(this.attendance.date).subtract(1, 'day').hour(hour).minute(0).second(0).toISOString();

      if (dayjs(deadline).isBefore(dayjs())) {
        deadline = dayjs(this.attendance.date).hour(hour).minute(0).toISOString();
      }

      this.attendance.deadline = deadline;
      this.maxDeadlineDate = dayjs(this.attendance.date).hour(hour).minute(0).toISOString();
    } else {
      this.attendance.deadline = null;
    }

    this.db.updateAttendance({ deadline: this.attendance.deadline }, this.attendance.id);
  }

  async switchMode() {
    this.attendanceViewMode = this.attendanceViewMode === AttendanceViewMode.CLICK ? AttendanceViewMode.SELECT : AttendanceViewMode.CLICK;

    await this.storage.set('attendanceViewMode', this.attendanceViewMode);
  }

  async toggleShowAvatars() {
    this.showAvatars = !this.showAvatars;
    await this.storage.set('attendanceShowAvatars', this.showAvatars);
  }

  async toggleShowRegFields() {
    this.showRegFields = !this.showRegFields;
    await this.storage.set('attendanceShowRegFields', this.showRegFields);
  }

  // ========== CHECKLIST METHODS ==========

  /**
   * Toggle a checklist item's completed status
   */
  async toggleChecklistItem(index: number): Promise<void> {
    if (!this.attendance.checklist) {return;}

    this.attendance.checklist[index].completed = !this.attendance.checklist[index].completed;
    await this.db.updateAttendance({ checklist: this.attendance.checklist }, this.attendance.id);
  }

  /**
   * Add an ad-hoc checklist item
   */
  async addChecklistItem(): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('attendance.addTodo'),
      inputs: [
        {
          type: 'text',
          name: 'text',
          placeholder: translate('attendance.todoText'),
        },
        {
          type: 'number',
          name: 'deadlineHours',
          placeholder: translate('attendance.deadlineHours'),
          min: 0,
        },
      ],
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
        },
        {
          text: translate('attendance.add'),
          handler: async (data) => {
            if (!data.text?.trim()) {
              Utils.showToast(translate('attendance.enterText'), 'warning');
              return false;
            }

            if (!this.attendance.checklist) {
              this.attendance.checklist = [];
            }

            const deadlineHours = data.deadlineHours ? parseInt(data.deadlineHours, 10) : null;
            let dueDate: string | null = null;

            if (deadlineHours !== null && !isNaN(deadlineHours)) {
              const eventDateTime = this.attendance.start_time
                ? dayjs(this.attendance.date).hour(Number(this.attendance.start_time.substring(0, 2))).minute(Number(this.attendance.start_time.substring(3, 5)))
                : dayjs(this.attendance.date).hour(19).minute(0);
              dueDate = eventDateTime.subtract(deadlineHours, 'hour').toISOString();
            }

            const newItem: ChecklistItem = {
              id: crypto.randomUUID(),
              text: data.text.trim(),
              deadlineHours,
              completed: false,
              dueDate,
            };

            this.attendance.checklist.push(newItem);
            await this.db.updateAttendance({ checklist: this.attendance.checklist }, this.attendance.id);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Check if the default checklist from the type can be restored
   */
  canRestoreChecklist(): boolean {
    return this.type?.checklist?.length > 0 && (!this.attendance?.checklist || this.attendance.checklist.length === 0);
  }

  /**
   * Restore the default checklist from the attendance type
   */
  async restoreChecklist(): Promise<void> {
    if (!this.type?.checklist?.length) {
      Utils.showToast(translate('attendance.noDefaultChecklist'), 'warning');
      return;
    }

    // Copy checklist from type and calculate due dates
    const checklist = this.type.checklist.map((item: ChecklistItem) => {
      let dueDate: string | null = null;
      if (item.deadlineHours !== null && item.deadlineHours !== undefined) {
        const eventDateTime = this.attendance.start_time
          ? dayjs(this.attendance.date).hour(Number(this.attendance.start_time.substring(0, 2))).minute(Number(this.attendance.start_time.substring(3, 5)))
          : dayjs(this.attendance.date).hour(19).minute(0);
        dueDate = eventDateTime.subtract(item.deadlineHours, 'hour').toISOString();
      }
      return {
        ...item,
        id: crypto.randomUUID(), // New unique ID
        completed: false,
        dueDate,
      };
    });

    this.attendance.checklist = checklist;
    await this.db.updateAttendance({ checklist }, this.attendance.id);
    Utils.showToast(translate('attendance.checklistRestored'), 'success');
  }

  /**
   * Remove a checklist item
   */
  async removeChecklistItem(index: number, slider?: IonItemSliding): Promise<void> {
    slider?.close();

    const alert = await this.alertController.create({
      header: translate('attendance.deleteTodo'),
      message: translate('attendance.deleteTodoConfirm'),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
        },
        {
          text: translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            if (this.attendance.checklist) {
              this.attendance.checklist.splice(index, 1);
              await this.db.updateAttendance({ checklist: this.attendance.checklist }, this.attendance.id);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Get deadline status for styling
   */
  getDeadlineStatus(item: ChecklistItem): 'overdue' | 'warning' | 'normal' {
    if (!item.dueDate || item.completed) {return 'normal';}

    const now = dayjs();
    const dueDate = dayjs(item.dueDate);

    if (dueDate.isBefore(now)) {
      return 'overdue';
    }

    // Warning if due within 24 hours
    if (dueDate.diff(now, 'hour') <= 24) {
      return 'warning';
    }

    return 'normal';
  }

  /**
   * Format deadline as relative time (e.g., "in 2 Tagen")
   */
  formatDeadlineRelative(item: ChecklistItem): string {
    if (!item.dueDate) {return '';}

    const now = dayjs();
    const dueDate = dayjs(item.dueDate);
    const diffHours = dueDate.diff(now, 'hour');
    const diffDays = dueDate.diff(now, 'day');

    if (diffHours < 0) {
      const overdueDays = Math.abs(diffDays);
      const overdueHours = Math.abs(diffHours);
      if (overdueDays >= 1) {
        return translate('attendance.overdueDays', { count: overdueDays });
      }
      return translate('attendance.overdueHours', { count: overdueHours });
    }

    if (diffHours < 1) {
      return translate('attendance.dueNow');
    }

    if (diffHours < 24) {
      return translate('attendance.inHours', { count: diffHours });
    }

    return translate('attendance.inDays', { count: diffDays });
  }

  /**
   * Format deadline as absolute date/time
   */
  formatDeadlineAbsolute(item: ChecklistItem): string {
    if (!item.dueDate) {return '';}
    return translate('attendance.timeOClock', { time: format(new Date(item.dueDate), 'dd.MM.yyyy HH:mm') });
  }

  /**
   * Get checklist progress (completed/total)
   */
  getChecklistProgress(): { completed: number; total: number } {
    if (!this.attendance?.checklist) {
      return { completed: 0, total: 0 };
    }

    const total = this.attendance.checklist.length;
    const completed = this.attendance.checklist.filter(item => item.completed).length;

    return { completed, total };
  }

  async showStatusInfo(): Promise<void> {
    const modal = await this.modalController.create({
      component: StatusInfoComponent,
      componentProps: {
        players: this.players,
      },
      breakpoints: [0, 0.5, 0.75],
      initialBreakpoint: 0.5,
      handleBehavior: 'none',
    });

    await modal.present();
  }

  get churchField(): ExtraField | undefined {
    return this.db.getPersonExtraFields().find(field => field.type === 'bfecg_church');
  }

  async showChurchOverview(): Promise<void> {
    const field = this.churchField;
    if (!field) { return; }
    const presentStatuses = [AttendanceStatus.Present, AttendanceStatus.Late, AttendanceStatus.LateExcused];
    const churchIds = this.players
      .filter(p => presentStatuses.includes(p.status))
      .map(p => (p.person?.additional_fields ?? {})[field.id] as string | null);

    const modal = await this.modalController.create({
      component: ChurchOverviewComponent,
      componentProps: {
        churchIds,
        churches: this.db.churches() ?? [],
        subtitle: translate('attendance.presentPeople'),
      },
      breakpoints: [0, 0.5, 0.75, 1],
      initialBreakpoint: 0.5,
      handleBehavior: 'none',
    });

    await modal.present();
  }

  async showLegend(): Promise<void> {
    await this.legendModal.present();
  }

  async sendAdHocReminder(playerAppId?: string): Promise<void> {
    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === this.attendance.type_id);
    const typeName = attType?.name || translate('attendance.eventFallback');
    const dateStr = dayjs(this.attendance.date).format(dateFmt());
    const timeStr = this.attendance.start_time ? translate('attendance.atTime', { time: this.attendance.start_time }) : '';
    const infoStr = this.attendance.typeInfo ? ` (${this.attendance.typeInfo})` : '';
    const eventLine = translate('attendance.eventOnDate', { type: typeName, date: dateStr }) + timeStr + infoStr;
    const defaultTitle = translate('attendance.reminderTitle', { event: eventLine });
    const tenantLongName = this.db.tenant()?.longName || '';
    const defaultMessage = tenantLongName
      ? `${tenantLongName}\n${eventLine}`
      : eventLine;
    const attendanceLink = `https://attendix.de/open-attendance?id=${this.attendance.id}&tenantId=${this.attendance.tenantId}`;

    const neutralAppIds = this.players
      .filter(p => p.status === AttendanceStatus.Neutral && p.person?.appId)
      .map(p => p.person.appId as string);

    const modal = await this.modalController.create({
      component: AdHocReminderModalComponent,
      componentProps: {
        defaultTitle,
        defaultMessage,
        attendanceLink,
        hasNeutralPersons: neutralAppIds.length > 0,
      },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
      handleBehavior: 'cycle',
    });

    await modal.present();
    const { data, role } = await modal.onWillDismiss<AdHocReminderResult>();

    if (role !== 'send' || !data) {
      return;
    }

    if (this.isSendingReminder) {
      return;
    }
    this.isSendingReminder = true;
    const loading = await this.loadingController.create({ message: translate('attendance.sending') });
    await loading.present();
    try {
      const { error } = await this.db.getSupabase().functions.invoke('send-ad-hoc-reminder', {
        body: {
          attendanceId: this.attendance.id,
          tenantId: this.attendance.tenantId,
          title: data.title || undefined,
          message: data.message || undefined,
          playerAppId: playerAppId || undefined,
          playerAppIds: (data.neutralOnly && !playerAppId) ? neutralAppIds : undefined,
        },
      });
      if (error) {
        Utils.showToast(translate('attendance.sendFailed'), 'danger');
      } else {
        Utils.showToast(translate('attendance.reminderSent'), 'success');
      }
    } finally {
      await loading.dismiss();
      this.isSendingReminder = false;
    }
  }

  /**
   * Open modal to add persons manually to attendance
   */
  async openAddPersonModal(): Promise<void> {
    this.isAddPersonModalOpen = true;
    this.isLoadingPersons = true;
    this.selectedPersonsToAdd = [];
    this.filteredAvailablePersons = [];
    this.availablePersons = [];

    try {
      // Load all active players from the instance
      const allPersons: Person[] = await this.db.getPlayers(true);

      // Get current person IDs in this attendance
      const currentPersonIds = new Set(this.players.map(p => p.person_id));

      // Filter out persons already in attendance and paused/left persons
      const personsNotInAttendance = allPersons.filter((person: Person) =>
        !currentPersonIds.has(person.id) && !person.paused && !person.left
      );

      // Get attendance type for filtering
      const attType = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);

      // Filter persons that match the attendance type criteria
      const matchingPersons = personsNotInAttendance.filter((person: Person) => {
        // Check relevant groups
        if (attType && attType.relevant_groups.length > 0) {
          if (!attType.relevant_groups.includes((person as any).instrument)) {
            return false;
          }
        }

        // Check additional fields filter
        if (attType?.additional_fields_filter?.key && attType?.additional_fields_filter?.option != null && this.db.getPersonExtraFields().find(field => field.id === attType.additional_fields_filter.key)) {
          const defaultValue = this.db.getPersonExtraFields().find(field => field.id === attType.additional_fields_filter.key)?.defaultValue;
          const additionalField = person.additional_fields?.[attType.additional_fields_filter.key] ?? defaultValue;
          return additionalField === attType.additional_fields_filter.option;
        }

        return true;
      });

      // Get persons that don't match the criteria
      const matchingPersonIds = new Set(matchingPersons.map(p => p.id));
      const otherPersons = personsNotInAttendance.filter(p => !matchingPersonIds.has(p.id));

      // Add group names to persons for display
      const addGroupNames = (persons: Person[]): (Person & { groupName?: string })[] => persons.map((person: Person) => {
          const instrumentId = (person as any).instrument;
          const group = this.instruments.find(g => g.id === instrumentId);
          return {
            ...person,
            groupName: group?.name || translate('attendance.noGroup'),
            instrument: instrumentId, // Keep instrument for sorting
          };
        });

      // Sort by group (using sort_order from instruments) and then by name
      const sortByGroup = (persons: (Person & { groupName?: string })[]) => persons.sort((a, b) => {
          const aInstrument = this.instruments.find(i => i.id === (a as any).instrument);
          const bInstrument = this.instruments.find(i => i.id === (b as any).instrument);
          const aSortOrder = aInstrument?.sort_order ?? 999999;
          const bSortOrder = bInstrument?.sort_order ?? 999999;

          if (aSortOrder !== bSortOrder) {
            return aSortOrder - bSortOrder;
          }

          // Same group: sort by lastName, then firstName
          const lastNameCompare = a.lastName.localeCompare(b.lastName);
          if (lastNameCompare !== 0) {return lastNameCompare;}
          return a.firstName.localeCompare(b.firstName);
        });

      this.filteredAvailablePersons = sortByGroup(addGroupNames(matchingPersons));
      this.availablePersons = sortByGroup(addGroupNames(otherPersons));
    } catch (error) {
      console.error('Error loading persons:', error);
      Utils.showToast(translate('attendance.loadPeopleFailed'), 'danger');
    } finally {
      this.isLoadingPersons = false;
    }
  }

  /**
   * Check if a person is selected
   */
  isPersonSelected(personId: number): boolean {
    return this.selectedPersonsToAdd.includes(personId);
  }

  /**
   * Toggle person selection
   */
  togglePersonSelection(personId: number, event: any): void {
    if (event.detail.checked) {
      if (!this.selectedPersonsToAdd.includes(personId)) {
        this.selectedPersonsToAdd.push(personId);
      }
    } else {
      this.selectedPersonsToAdd = this.selectedPersonsToAdd.filter(id => id !== personId);
    }
  }

  /**
   * Add selected persons to attendance
   */
  async addPersonsToAttendance(modal: any): Promise<void> {
    if (!this.selectedPersonsToAdd.length) {
      Utils.showToast(translate('attendance.choosePersonMin'), 'warning');
      return;
    }

    const loading = await Utils.getLoadingElement(999999, translate('attendance.addingPeople'));
    await loading.present();

    try {
      const attType = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
      const defaultStatus = attType.default_status;
      const personsToAdd: PersonAttendance[] = [];

      for (const personId of this.selectedPersonsToAdd) {
        const person = this.filteredAvailablePersons.find(p => p.id === personId)
          || this.availablePersons.find(p => p.id === personId);
        if (!person) {continue;}

        let playerStatus = defaultStatus;
        let notes = '';

        // Check shift if applicable
        if (person.shift_id && !attType.all_day) {
          const shift = this.db.shifts().find(s => s.id === person.shift_id);

          const result = Utils.getStatusByShift(
            shift,
            this.attendance.date,
            attType.start_time || '19:00',
            attType.end_time || '21:00',
            defaultStatus,
            person.shift_start,
            person.shift_name,
          );

          playerStatus = result.status;
          notes = result.note;
        }

        personsToAdd.push({
          attendance_id: this.attendanceId,
          person_id: personId,
          status: playerStatus,
          notes,
        });
      }

      await this.db.addPersonAttendances(personsToAdd);

      // Refresh attendance data
      this.attendance = await this.db.getAttendanceById(this.attendanceId);
      this.initializeAttObjects();

      await loading.dismiss();
      modal.dismiss();
      this.isAddPersonModalOpen = false;
      this.selectedPersonsToAdd = [];

      Utils.showToast(translate('attendance.peopleAdded', { count: personsToAdd.length }), 'success');
    } catch (error) {
      await loading.dismiss();
      console.error('Error adding persons:', error);
      Utils.showToast(translate('attendance.addPeopleFailed'), 'danger');
    }
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

  async navigateToSong(songId: number): Promise<void> {
    await this.router.navigate([`/tabs/settings/songs/`, songId]);
  }

  getSortableExtraFields(): Array<{ id: string; name: string; level: 'person' | 'registration'; fieldType?: string }> {
    const personFields = this.db.getPersonExtraFields()
      .filter(f => f.type !== 'textarea')
      .map(f => ({ id: f.id, name: f.name, level: 'person' as const, fieldType: f.type as string }));
    const regFields = ((this.type as any)?.registration_fields as RegistrationField[] ?? [])
      .map(f => ({ id: f.id, name: f.label, level: 'registration' as const, fieldType: f.type as string }));
    return [...personFields, ...regFields];
  }

  getActiveExtraSortLabel(): string {
    const name = this.getSortableExtraFields().find(f => f.id === this.extraFieldSortId)?.name ?? '';
    return name ? `${name} ${this.extraFieldSortDir === 'asc' ? '↑' : '↓'}` : '';
  }

  private getExtraFieldValue(player: PersonAttendance, fieldId: string, level: 'person' | 'registration'): any {
    if (level === 'person') { return (player.person?.additional_fields ?? {})[fieldId]; }
    return ((player as any).registration_answers ?? {})[fieldId];
  }

  getActiveExtraSortValue(player: PersonAttendance): string {
    if (!this.extraFieldSortId) { return ''; }
    const raw = this.getExtraFieldValue(player, this.extraFieldSortId, this.extraFieldSortLevel);
    if (raw === null || raw === undefined || raw === '') { return '–'; }
    if (typeof raw === 'boolean') { return raw ? translate('common.yes') : translate('common.no'); }
    if (Array.isArray(raw)) { return raw.join(', '); }
    const field = this.getSortableExtraFields().find(f => f.id === this.extraFieldSortId);
    if (field?.fieldType === 'bfecg_church') {
      return this.db.churches()?.find(c => c.id === raw)?.name ?? String(raw);
    }
    return String(raw);
  }

  private resolveExtraFieldSortKey(player: PersonAttendance): string {
    const raw = this.getExtraFieldValue(player, this.extraFieldSortId, this.extraFieldSortLevel);
    if (raw === null || raw === undefined) { return ''; }
    const field = this.getSortableExtraFields().find(f => f.id === this.extraFieldSortId);
    if (field?.fieldType === 'bfecg_church') {
      return this.db.churches()?.find(c => c.id === raw)?.name ?? String(raw);
    }
    return String(raw);
  }

  async openSortPicker(): Promise<void> {
    const fields = this.getSortableExtraFields();
    const currentValue = this.extraFieldSortId
      ? `${this.extraFieldSortId}__${this.extraFieldSortDir}`
      : '__default__';
    const alert = await this.alertController.create({
      header: translate('attendance.sorting'),
      inputs: [
        { type: 'radio', label: translate('attendance.defaultSortGroup'), value: '__default__', checked: currentValue === '__default__' },
        ...fields.flatMap(f => [
          { type: 'radio' as const, label: `${f.name} ↑`, value: `${f.id}__asc`, checked: currentValue === `${f.id}__asc` },
          { type: 'radio' as const, label: `${f.name} ↓`, value: `${f.id}__desc`, checked: currentValue === `${f.id}__desc` },
        ]),
      ],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.ok'),
          handler: (value: string) => {
            if (value === '__default__' || !value) {
              this.extraFieldSortId = null;
              this.extraFieldSortLevel = null;
              this.extraFieldSortDir = 'asc';
              void this.storage.set(`attSortField${this.attendanceId}`, '');
              void this.storage.set(`attSortLevel${this.attendanceId}`, '');
              void this.storage.set(`attSortDir${this.attendanceId}`, '');
            } else {
              const [fieldId, dir] = value.split('__');
              const found = fields.find(f => f.id === fieldId);
              this.extraFieldSortId = fieldId;
              this.extraFieldSortLevel = found?.level ?? null;
              this.extraFieldSortDir = dir === 'desc' ? 'desc' : 'asc';
              void this.storage.set(`attSortField${this.attendanceId}`, fieldId);
              void this.storage.set(`attSortLevel${this.attendanceId}`, found?.level ?? '');
              void this.storage.set(`attSortDir${this.attendanceId}`, this.extraFieldSortDir);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  getRegistrationAnswerSummary(player: PersonAttendance): string {
    const answers = (player as any).registration_answers;
    const fields = (this.type as any)?.registration_fields as RegistrationField[] ?? [];
    if (!answers || !fields.length) { return ''; }
    return fields.map(f => {
      const val = answers[f.id];
      if (val === undefined || val === null) { return null; }
      if (f.type === 'boolean') { return `${f.label}: ${val ? translate('common.yes') : translate('common.no')}`; }
      if (f.type === 'multi_select' && Array.isArray(val)) { return `${f.label}: ${val.join(', ') || '–'}`; }
      return `${f.label}: ${val}`;
    }).filter(Boolean).join(' · ');
  }
}
