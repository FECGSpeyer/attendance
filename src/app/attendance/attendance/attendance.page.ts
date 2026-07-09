import { Component, ElementRef, OnDestroy, OnInit, ViewChild, effect } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ConnectionStatus, Network } from '@capacitor/network';
import { Browser } from '@capacitor/browser';
import { AlertController, ActionSheetController, IonItemSliding, ModalController, isPlatform } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { format } from 'date-fns';
import dayjs from 'dayjs';
import { PlanningPage } from 'src/app/planning/planning.page';
import { StatusInfoComponent } from './status-info/status-info.component';
import { DbService } from 'src/app/services/db.service';
import { DefaultAttendanceType, AttendanceStatus, Role, ATTENDANCE_STATUS_MAPPING, AttendanceViewMode, CHECKLIST_DEADLINE_OPTIONS, DEFAULT_ABSENCE_REASONS } from 'src/app/utilities/constants';
import { Attendance, FieldSelection, Person, PersonAttendance, Song, History, Group, GroupCategory, AttendanceType, ChecklistItem } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subscription } from 'rxjs';
import { TrackingEvent, TrackingService } from 'src/app/services/tracking/tracking.service';

@Component({
    selector: 'app-attendance',
    templateUrl: './attendance.page.html',
    styleUrls: ['./attendance.page.scss'],
    standalone: false
})
export class AttendancePage implements OnInit, OnDestroy {
  public attendanceId!: number;
  @ViewChild('chooser') chooser: ElementRef;
  public players: PersonAttendance[] = [];
  public conductors: Person[] = [];
  public excused: Set<string> = new Set();
  public withExcuses: boolean;
  public isOnline = true;
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
  public attendanceViewMode: AttendanceViewMode = AttendanceViewMode.CLICK;
  public AttendanceViewMode = AttendanceViewMode;
  private helperGroupId: number | null = null;
  public isAddPersonModalOpen = false;
  public availablePersons: (Person & { groupName?: string })[] = [];
  public filteredAvailablePersons: (Person & { groupName?: string })[] = [];
  public selectedPersonsToAdd: number[] = [];
  public isLoadingPersons = false;
  public songSearchTerm = '';
  public filteredSongs: Song[] = [];
  // True when fetchAttendance succeeded but `attendance.persons` came back
  // empty (and the helperGroupId filter isn't responsible). Surfaces an inline
  // "Neu laden" banner so the user can recover without dismissing the modal.
  public personsLoadFailed = false;

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

  constructor(
    private modalController: ModalController,
    public db: DbService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private storage: Storage,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private tracking: TrackingService,
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

    this.songs = await this.db.getSongs();
    this.filteredSongs = [...this.songs];
    this.instruments = this.db.groups().filter((instrument: Group) => !instrument.maingroup);
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
      Utils.showToast('Anwesenheit konnte nicht geladen werden — bitte erneut öffnen.', 'danger');
      this.navigateBack();
      return;
    }

    // Helper-role profile must be resolved BEFORE initializeAttObjects() so
    // helperGroupId is set when the persons filter runs. Kept in its own
    // try/catch so a profile-fetch hiccup can't block the persons render —
    // the worst case here is "helper sees the unfiltered list", which is
    // strictly better than the previous "everyone sees an empty list".
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
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

      void this.listenOnNetworkChanges();
      this.selectedSongs = this.attendance.songs || [];
      this.type = await this.resolveAttendanceType();
      this.manageSongs = this.type?.manage_songs || false;
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
      Utils.showToast('Neu laden fehlgeschlagen — bitte erneut versuchen.', 'danger');
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
      this.isOnline = status.connected;
      Utils.showToast(status.connected ? 'Verbindung wiederhergestellt' : 'Keine Internetverbindung vorhanden', status.connected ? 'success' : 'danger');
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
  private navigateBack(): void {
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
      Utils.showToast('Die Anwesenheit wurde soeben von einem anderen Nutzer gelöscht', 'danger', 3000);
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
        Utils.showToast('Die Anwesenheit wurde soeben von einem anderen Nutzer gelöscht', 'danger', 3000);
        this.navigateBack();
        return;
      }
    }

    if (payload.new.attendance_id !== this.attendance.id) {
      return;
    }

    const idx: number = this.players.findIndex((p: PersonAttendance) => p.id === payload.new.id);
    this.players[idx] = {
      ...this.players[idx],
      status: payload.new.status,
      notes: payload.new.notes,
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
      Utils.showToast('Fehler beim Ändern des Anwesenheitsstatus, bitte versuche es später erneut', 'danger');
      return;
    }

    individual.status = status;

    this.db.updatePersonAttendance(individual.id, { status: individual.status });
  }

  onAttStaticChange(individual: PersonAttendance, event: any) {
    this.db.updatePersonAttendance(individual.id, { status: event.detail.value });
  }

  getAttendedPlayers(players: PersonAttendance[]): number {
    return players.filter((p: PersonAttendance) => p.status === AttendanceStatus.Late || p.status === AttendanceStatus.Present).length;
  }

  getAttendedPlayersForGroup(groupName: string): number {
    return this.players.filter((p: PersonAttendance) =>
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
        await this.db.updatePersonAttendance(player.id, { notes: reason });
      },
    }));

    buttons.push({
      text: 'Eigene Notiz...',
      handler: async (): Promise<void> => {
        await this.promptCustomNote(player);
      },
    });

    if (player.notes) {
      buttons.push({
        text: 'Notiz löschen',
        role: 'destructive',
        handler: async (): Promise<void> => {
          await this.db.updatePersonAttendance(player.id, { notes: '' });
        },
      });
    }

    buttons.push({
      text: 'Abbrechen',
      role: 'cancel',
    });

    const actionSheet = await this.actionSheetController.create({
      header: 'Notiz hinzufügen',
      subHeader: player.notes ? `Aktuell: ${player.notes}` : undefined,
      buttons,
    });

    await actionSheet.present();
  }

  private async promptCustomNote(player: PersonAttendance): Promise<void> {
    const isPreset = player.notes && this.getPresetReasons().includes(player.notes);
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: 'Eigene Notiz',
      inputs: [{
        type: 'textarea',
        placeholder: 'Notiz eingeben...',
        value: isPreset ? '' : (player.notes || ''),
        name: 'note',
      }],
      buttons: [{
        text: 'Abbrechen',
        role: 'cancel',
      }, {
        text: 'Speichern',
        handler: async (evt: { note: string }): Promise<void> => {
          await this.db.updatePersonAttendance(player.id, { notes: evt.note });
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
        Utils.showToast('Fehler beim hinzufügen des Bildes, versuche es später erneut', 'danger');
      }
    }
  }

  async onDescriptionChanged() {
    await this.db.updateAttendance({
      description: this.attendance.description || null,
    }, this.attendance.id);
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

      Utils.showToast('Anhang hochgeladen', 'success');
    } catch (error) {
      Utils.showToast('Fehler beim Hochladen', 'danger');
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

  calculateTime(field: FieldSelection, index: number) {
    let minutesToAdd = 0;
    let currentIndex = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.attendance.plan.fields[currentIndex].time);
      currentIndex++;
    }

    const time: dayjs.Dayjs = dayjs().hour(Number(this.attendance.plan.time.substring(0, 2))).minute(Number(this.attendance.plan.time.substring(3, 5)));
    return `${time.add(minutesToAdd, 'minute').format('HH:mm')} ${field.conductor ? `| ${field.conductor}` : ''}`;
  }

  async exportPlan(sideBySide: boolean = false) {
    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    await Utils.createPlanExport({
      ...this.attendance.plan,
      attendance: this.attendance.id,
      attendances: await this.db.getAttendance(),
      sideBySide,
    }, Utils.getPlanningTitle(type, this.attendance.typeInfo));
  }

  async send(asImage: boolean = false, sideBySide: boolean = false) {
    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    const planningTitle = Utils.getPlanningTitle(type, this.attendance.typeInfo);
    const blob = await Utils.createPlanExport({
      ...this.attendance.plan,
      attendance: this.attendance.id,
      attendances: await this.db.getAttendance(),
      asBlob: true,
      asImage,
      sideBySide,
    }, planningTitle);

    this.db.sendPlanPerTelegram(blob, `${planningTitle.replace('(', '').replace(')', '')}_${dayjs(this.attendance.date).format('DD_MM_YYYY')}${sideBySide ? '_2x' : ''}`, asImage);
  }

  async editPlan() {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PlanningPage,
      cssClass: 'planningModal',
      componentProps: {
        attendanceId: this.attendance.id,
      },
    });

    await modal.present();
  }

  async onInfoChanged() {
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
          text: 'Dirigent ändern',
          handler: async (): Promise<void> => {
            await this.changeConductor(entry);
          },
        },
        {
          text: 'Zum Werk',
          handler: async (): Promise<void> => {
            await this.navigateToSong(entry.songId);
          },
        },
        {
          text: 'Abbrechen',
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
      label: 'Anderer Dirigent',
      value: this.otherConductor,
      checked: Boolean(entry.otherConductor),
    });

    const alert = await this.alertController.create({
      header: 'Dirigent ändern',
      inputs,
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Speichern',
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
      header: 'Dirigent eingeben',
      inputs: [{
        type: 'text',
        name: 'conductor',
        placeholder: 'Dirigent',
        value: entry.otherConductor || '',
      }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Speichern',
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
      return 'Unbekanntes Lied';
    }
    return `${song.number} ${song.name}`;
  }

  getConductorInfo(entry: History): string {
    if (entry.otherConductor) {
      return entry.otherConductor;
    }

    const conductor: Person | undefined = this.conductors.find((con: Person) => con.id === entry.person_id);
    if (!conductor) {
      return 'Unbekannter Dirigent';
    }
    return `${conductor.firstName} ${conductor.lastName}`;
  }

  async onConChange() {
    if (this.historyEntry.person_id === this.otherConductor) {
      const alert = await this.alertController.create({
        header: 'Dirigent eingeben',
        inputs: [
          {
            type: 'text',
            name: 'conductor',
            placeholder: 'Dirigent',
          }
        ],
        buttons: ['Abbrechen', {
          text: 'Speichern',
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
    return this.db.attendanceTypes().find(type => type.id === type_id)?.name || 'Unbekannt';
  }

  toNeutral(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();
    player.status = AttendanceStatus.Neutral;
    this.db.updatePersonAttendance(player.id, { status: player.status });
  }

  toLateExcused(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();
    player.status = AttendanceStatus.LateExcused;
    this.db.updatePersonAttendance(player.id, { status: player.status });
  }

  async removeFromAttendance(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();

    const alert = await this.alertController.create({
      header: 'Person entfernen',
      message: `Möchtest du ${player.firstName} ${player.lastName} wirklich aus dieser Anwesenheit entfernen? Diese Aktion kann nicht rückgängig gemacht werden.`,
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Entfernen',
          role: 'destructive',
          handler: async () => {
            try {
              await this.db.deletePersonAttendanceById(player.id);

              // Reload attendance data to properly rebuild the list with headers
              this.attendance = await this.db.getAttendanceById(this.attendanceId);
              this.initializeAttObjects();

              Utils.showToast('Person aus Anwesenheit entfernt', 'success');
            } catch (error) {
              console.error('Error removing person:', error);
              Utils.showToast('Fehler beim Entfernen der Person', 'danger');
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
      await Utils.showToast('Der Status wurde bisher nicht verändert', 'warning');
      return;
    }

    let message;

    const person = this.players.find((p: PersonAttendance) => player.changed_by === p.person.appId);

    if (!person) {
      message = player.changed_by === '665fe2b4-d53f-4f17-a66b-46c0949af99a' ? 'Zuletzt geändert von Matthias Eckstädt' : 'Zuletzt geänderrt von \'Unbekannt\'';
    } else {
      message = `Zuletzt geändert von ${person.firstName} ${person.lastName}`;
    }

    if (player.changed_at) {
      message += ` am ${format(new Date(player.changed_at), 'dd.MM.yyyy')} um ${format(new Date(player.changed_at), 'HH:mm')} Uhr`;
    }

    const alert = await this.alertController.create({
      message,
      buttons: ['Ok'],
    });

    await alert.present();
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
      header: 'To-Do hinzufügen',
      inputs: [
        {
          type: 'text',
          name: 'text',
          placeholder: 'To-Do Text...',
        },
        {
          type: 'number',
          name: 'deadlineHours',
          placeholder: 'Deadline in Stunden (optional)',
          min: 0,
        },
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
        },
        {
          text: 'Hinzufügen',
          handler: async (data) => {
            if (!data.text?.trim()) {
              Utils.showToast('Bitte einen Text eingeben', 'warning');
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
      Utils.showToast('Keine Standard-Checkliste vorhanden', 'warning');
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
    Utils.showToast('Checkliste wiederhergestellt', 'success');
  }

  /**
   * Remove a checklist item
   */
  async removeChecklistItem(index: number, slider?: IonItemSliding): Promise<void> {
    slider?.close();

    const alert = await this.alertController.create({
      header: 'To-Do löschen',
      message: 'Möchtest du dieses To-Do wirklich löschen?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
        },
        {
          text: 'Löschen',
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
        return `${overdueDays} Tag(e) überfällig`;
      }
      return `${overdueHours} Stunde(n) überfällig`;
    }

    if (diffHours < 1) {
      return 'Jetzt fällig';
    }

    if (diffHours < 24) {
      return `in ${diffHours} Stunde(n)`;
    }

    return `in ${diffDays} Tag(en)`;
  }

  /**
   * Format deadline as absolute date/time
   */
  formatDeadlineAbsolute(item: ChecklistItem): string {
    if (!item.dueDate) {return '';}
    return format(new Date(item.dueDate), 'dd.MM.yyyy HH:mm') + ' Uhr';
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
    });

    await modal.present();
  }

  async sendAdHocReminder(): Promise<void> {
    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === this.attendance.type_id);
    const typeName = attType?.name || 'Termin';
    const dateStr = dayjs(this.attendance.date).format('DD.MM.YYYY');
    const timeStr = this.attendance.start_time ? ` um ${this.attendance.start_time} Uhr` : '';
    const infoStr = this.attendance.typeInfo ? ` (${this.attendance.typeInfo})` : '';
    const defaultMessage = `${typeName} am ${dateStr}${timeStr}${infoStr}`;

    const alert = await this.alertController.create({
      header: 'Erinnerung versenden',
      message: 'Möchtest du jetzt eine Erinnerung an alle Mitglieder versenden? Sie wird per App-Benachrichtigung und per E-Mail (an Mitglieder mit E-Mail-Adresse) verschickt.',
      inputs: [
        { name: 'message', type: 'textarea', placeholder: 'Nachricht', value: defaultMessage }
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Versenden',
          handler: async (data) => {
            const { error } = await this.db.getSupabase().functions.invoke('send-ad-hoc-reminder', {
              body: {
                attendanceId: this.attendance.id,
                tenantId: this.attendance.tenantId,
                message: data.message || undefined,
              },
            });
            if (error) {
              Utils.showToast('Fehler beim Versenden', 'danger');
            } else {
              Utils.showToast('Erinnerung versendet', 'success');
            }
          }
        }
      ]
    });
    await alert.present();
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
        if (attType?.additional_fields_filter?.key && attType?.additional_fields_filter?.option && this.db.tenant().additional_fields?.find(field => field.id === attType.additional_fields_filter.key)) {
          const defaultValue = this.db.tenant().additional_fields.find(field => field.id === attType.additional_fields_filter.key)?.defaultValue;
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
            groupName: group?.name || 'Keine Gruppe',
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
      Utils.showToast('Fehler beim Laden der Personen', 'danger');
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
      Utils.showToast('Bitte wähle mindestens eine Person aus', 'warning');
      return;
    }

    const loading = await Utils.getLoadingElement(999999, 'Personen werden hinzugefügt...');
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

      Utils.showToast(`${personsToAdd.length} Person(en) hinzugefügt`, 'success');
    } catch (error) {
      await loading.dismiss();
      console.error('Error adding persons:', error);
      Utils.showToast('Fehler beim Hinzufügen der Personen', 'danger');
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
}
