import { dateFmt } from '../../i18n/languages';
import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild, signal, WritableSignal } from '@angular/core';
import { ActionSheetButton, ActionSheetController, AlertController, IonContent, IonItemSliding, IonModal, IonSelect, LoadingController, ModalController } from '@ionic/angular/lazy';
import { format, parseISO } from 'date-fns';
import { DbService } from 'src/app/services/db.service';
import { Group, Organisation, Parent, Person, PersonAttendance, Player, PlayerAbsence, PlayerHistoryEntry, ShiftPlan, Teacher, Tenant } from 'src/app/utilities/interfaces';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Utils } from 'src/app/utilities/Utils';
import { AttendanceStatus, DefaultAttendanceType, DEFAULT_IMAGE, PlayerHistoryType, Role, FieldType } from 'src/app/utilities/constants';
import { RankedMatch } from 'src/app/utilities/person-matcher';
import { UnavailabilityModalComponent } from 'src/app/duty/unavailability-modal/unavailability-modal.component';
import { translate } from '@jsverse/transloco';
dayjs.extend(utc);

@Component({
  selector: 'app-person',
  templateUrl: './person.page.html',
  styleUrls: ['./person.page.scss'],
  standalone: false
})
export class PersonPage implements OnInit, AfterViewInit {
  @Input() existingPlayer: Player;
  @Input() approveMode: boolean;
  @Input() readOnly: boolean;
  @Input() hasLeft: boolean;
  @ViewChild('select') select: IonSelect;
  @ViewChild('content') content: IonContent;
  @ViewChild('chooser') chooser: ElementRef;

  public newPlayer: Player = {
    firstName: '',
    lastName: '',
    instrument: 1,
    playsSince: dayjs().startOf('day').utc(true).toISOString(),
    joined: dayjs().startOf('day').utc(true).toISOString(),
    birthday: dayjs().startOf('day').utc(true).toISOString(),
    hasTeacher: false,
    isLeader: false,
    notes: '',
    teacher: null,
    isCritical: false,
    correctBirthday: false,
    history: [],
    paused: false,
    tenantId: 999999999,
    phone: '',
    pending: false,
    self_register: false,
  };
  public readonly PLAYER: Role = Role.PLAYER;
  public readonly HELPER: Role = Role.HELPER;
  public readonly RESPONSIBLE: Role = Role.RESPONSIBLE;
  public readonly VOICE_LEADER_HELPER: Role = Role.VOICE_LEADER_HELPER;
  public readonly VOICE_LEADER: Role = Role.VOICE_LEADER;
  public player: Player;
  public isChurchModalOpen = false;
  public churchSearch = '';
  public birthdayString: string = format(new Date(), 'dd.MM.yyyy');
  public playsSinceString: string = format(new Date(), 'dd.MM.yyyy');
  public joinedString: string = format(new Date(), 'dd.MM.yyyy');
  public max: string = new Date().toISOString();
  public personAttendance: PersonAttendance[] = [];
  public upcomingAttendances: PersonAttendance[] = [];
  public history: any[] = [];
  public teachers: Teacher[] = [];
  public allTeachers: Teacher[] = [];
  public perc = 0;
  public maintainTeachers: boolean;
  public isVoS: boolean;
  public solved = false;
  public hasChanges = false;
  public notes = '';
  public isAdmin = false;
  public isChoir = false;
  public isGeneral = false;
  public lateCount = 0;
  public lateCountExcused = 0;
  public lateThreshold = 999;  // Derived from critical_rules
  public showTeachers = false;
  public isMainGroup = false;
  public role: Role = Role.PLAYER;
  public parentsEnabled = false;
  public parents: Parent[] = [];
  public isParent = false;
  public otherTenants: Tenant[] = [];
  public isArchiveModalOpen = false;
  public archiveDate: string = dayjs().format('YYYY-MM-DD');
  public archiveNote = '';
  public isPauseModalOpen = false;
  public pauseReason = '';
  public pauseFrom = '';
  public pauseUntil = '';
  public minPauseDate: string = dayjs().format('YYYY-MM-DD');
  public isAbsenceModalOpen = false;
  public absenceReason = '';
  public absenceFrom = '';
  public absenceUntil = '';
  public playerAbsences: PlayerAbsence[] = [];
  public canManagePlannedAbsences = false;
  public isTransferModalOpen = false;
  public copy = false;
  public tenantId: number;
  public tenants: Tenant[] = [];
  public organisation: Organisation | null;
  public tenantGroups: Group[] = [];
  public targetGroupId: number;
  public fieldTypes = FieldType;
  public shift: ShiftPlan = null;
  public isImageViewerOpen = false;
  public editingName = false;

  /** Live cross-tenant suggestions while the user types a name. */
  public nameSuggestions: WritableSignal<RankedMatch<Player>[]> = signal([]);
  /** Race guard for async typeahead lookups. */
  private nameLookupSeq = 0;
  /** Name the user explicitly dismissed; suppresses suggestions until name changes. */
  private dismissedFor: string | null = null;
  /** Avoid re-firing the email-blur lookup for the same value. */
  private lastEmailLookup = '';
  /** Same-tenant, account-less players who might be the same person as this pending applicant. */
  public duplicateCandidates: WritableSignal<RankedMatch<Player>[]> = signal([]);

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private actionSheetController: ActionSheetController,
  ) { }

  // TrackBy function for history list
  trackByHistoryId = (_: number, att: any): string => att.id ?? `${att.date}-${att.type}`;

  async ngOnInit() {
    this.isVoS = this.db.tenant().shortName === 'VoS';
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isParent = this.db.tenantUser().role === Role.PARENT;
    const absencePerm = this.db.getPermissionForRole(this.db.tenantUser().role);
    this.canManagePlannedAbsences = this.isAdmin || !!absencePerm?.player_planned_absence;
    this.hasChanges = false;
    this.parentsEnabled = this.db.tenant().parents;

    // Derive late threshold from critical_rules (find first rule with Late status)
    const lateRule = this.db.tenant().critical_rules?.find(
      rule => rule.statuses?.includes(AttendanceStatus.Late)
    );
    this.lateThreshold = lateRule?.threshold_value ?? 999;

    this.showTeachers = this.db.tenant().maintainTeachers;
    if (this.db.tenant().maintainTeachers) {
      this.teachers = await this.db.getTeachers();
      this.allTeachers = this.teachers;
    }

    if (this.parentsEnabled) {
      this.parents = await this.db.getParents();
    }

    if (this.existingPlayer) {
      if (!this.existingPlayer.additional_fields) {
        this.existingPlayer.additional_fields = {};
      }
      const personFields = this.db.getPersonExtraFields();
      const sharedValues = await this.db.getSharedPersonFieldValues(this.existingPlayer);
      if (personFields.length) {
        for (const field of personFields) {
          this.existingPlayer.additional_fields[field.id] = this.existingPlayer.additional_fields[field.id] ?? this.getFieldTypeDefaultValue(field.type, field.defaultValue, field.options);
          if (Object.prototype.hasOwnProperty.call(sharedValues, field.id)) {
            this.existingPlayer.additional_fields[field.id] = sharedValues[field.id];
          }
        }
      }

      this.player = { ...this.existingPlayer, additional_fields: { ...this.existingPlayer.additional_fields } };
      this.birthdayString = this.formatDate(this.existingPlayer.birthday);
      this.playsSinceString = this.existingPlayer.playsSince ? this.formatDate(this.existingPlayer.playsSince) : '';
      this.joinedString = this.formatDate(this.existingPlayer.joined);
      this.player.teacherName = this.player.teacher ? this.teachers.find((teacher: Teacher) => teacher)?.name : '';
      this.player.criticalReasonText = this.player.criticalReason ? Utils.getPlayerHistoryTypeText(this.player.criticalReason) : '';

      if (this.player.appId) {
        const role = await this.db.getRoleFromTenantUser(this.player.appId);
        this.role = role === Role.NONE || !role ? Role.PLAYER : role;

        // Reconcile half-approved state: pending=false but role still APPLICANT
        // means a previous approval committed the player update but failed to
        // update the tenantUser role. Promote now to recover.
        if (this.role === Role.APPLICANT && this.player.pending === false) {
          const mainGroupId = this.db.getMainGroup()?.id;
          const promotedRole = this.player.instrument === mainGroupId ? Role.RESPONSIBLE : Role.PLAYER;
          try {
            await this.db.updateTenantUser({ role: promotedRole }, this.player.appId);
            this.role = promotedRole;
          } catch {
            // Leave role as-is; admin can retry via approvePlayer or the role selector.
          }
        }
      } else {
        this.role = Role.PLAYER;
      }
      await this.getHistoryInfo();

      if (this.approveMode) {
        void this.loadDuplicateCandidates();
      }
    } else {
      this.player = { ...this.newPlayer };
      this.player.tenantId = this.db.tenant().id;
      this.player.instrument = this.db.groups()[0].id;
      this.role = Role.PLAYER;

      const personFields = this.db.getPersonExtraFields();
      if (personFields.length) {
        if (!this.player.additional_fields) {
          this.player.additional_fields = {};
        }

        for (const field of personFields) {
          this.player.additional_fields[field.id] = this.player.additional_fields[field.id] ?? this.getFieldTypeDefaultValue(field.type, field.defaultValue, field.options);
        }
      }
    }

    if (this.player.shift_id) {
      this.shift = this.db.shifts().find(s => s.id === this.player.shift_id);
    }

    this.onInstrumentChange(false);

    this.organisation = await this.db.getOrganisationFromTenant();
    if (this.organisation) {
      this.tenants = await this.db.getTenantsFromOrganisation();
      if (this.tenants.length) {
        this.tenantId = this.tenants[0].id;
        this.tenantGroups = await this.db.getGroups(this.tenantId);
      }
    }

    void this.loadOtherTenants();
  }

  async loadOtherTenants(): Promise<void> {
    this.otherTenants = await this.db.getTenantsFromUser(this.player.appId);

    for (const tenant of this.otherTenants) {
      const perc = await this.getAttendanceFromOtherTenant(tenant);
      tenant.perc = perc === 1000 ? translate('person.notAvailable') : `${Math.round(perc)}%`;
      if (perc === 1000) {
        tenant.percColor = 'warning';
      } else {
        tenant.percColor = perc >= 75 ? 'success' : perc >= 50 ? 'warning' : 'danger';
      }
    }
  }

  async getAttendanceFromOtherTenant(tenant: Tenant): Promise<number> {
    const person = await this.db.getPersonIdFromTenant(this.player.appId, tenant.id);
    if (!person) {return 1000;}
    const personAttendances = await this.db.getPersonAttendances(person.id);
    const tillNow = personAttendances.filter((att: PersonAttendance) => dayjs((att as any).date).isBefore(dayjs()));

    return tillNow.length ? tillNow.filter((att: PersonAttendance) => att.attended).length / tillNow.length * 100 : 1000;
  }

  getFieldTypeDefaultValue(fieldType: FieldType, defaultValue: any, options?: string[]): any {
    return Utils.getFieldTypeDefaultValue(fieldType, defaultValue, options, this.db.churches());
  }

  get filteredChurches() {
    const term = this.churchSearch.trim().toLowerCase();
    if (!term) { return this.db.churches(); }
    return this.db.churches().filter(c => c.name.toLowerCase().includes(term));
  }

  getChurchLabel(fieldId: string): string {
    const value = this.player?.additional_fields?.[fieldId];
    if (value === null || value === undefined) { return translate('person.pleaseChoose'); }
    if (value === '') { return translate('person.notListed'); }
    const church = this.db.churches()?.find(c => c.id === value);
    return church ? church.name : translate('person.pleaseChoose');
  }

  openChurchModal() {
    this.churchSearch = '';
    this.isChurchModalOpen = true;
  }

  selectChurch(fieldId: string, churchId: string) {
    this.player.additional_fields[fieldId] = churchId;
    this.isChurchModalOpen = false;
    this.onChange();
  }

  async onTenantChange(): Promise<void> {
    this.tenantGroups = [];
    this.targetGroupId = null;
    this.tenantGroups = await this.db.getGroups(this.tenantId);
  }

  getRoleText(role: Role) {
    return Utils.getRoleText(role);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      const tx = document.getElementsByTagName('textarea');
      for (let i = 0; i < tx.length; i++) {
        tx[i].setAttribute('style', 'height:' + (tx[i].scrollHeight) + 'px !important;overflow-y:hidden;');
        tx[i].addEventListener('input', OnInput, false);
      }

      function OnInput() {
        this.style.height = 0;
        this.style.height = (this.scrollHeight) + 'px';
      }
    }, 500);
  }

  getTypeText(key: number) {
    return Utils.getPlayerHistoryTypeText(key);
  }

  async getHistoryInfo(): Promise<void> {
    // Get all attendances up to today
    const allAttendances = await this.db.getPersonAttendances(this.player.id, this.hasLeft);
    const attendances = allAttendances.filter((att: PersonAttendance) => dayjs((att as any).date).isBefore(dayjs()));

    // Get upcoming attendances (after today)
    this.upcomingAttendances = allAttendances
      .filter((att: PersonAttendance) => dayjs((att as any).date).isAfter(dayjs()))
      .sort((a, b) => new Date((a as any).date).getTime() - new Date((b as any).date).getTime());

    if (this.canManagePlannedAbsences) {
      this.playerAbsences = await this.db.getPlayerAbsences(this.player.id);
    }

    // Calculate attendance percentage — include_in_average comes from the DB via getPersonAttendances
    const attendedCount = attendances.filter((att: PersonAttendance) => att.attended && (att as any).include_in_average).length;
    const allCount = attendances.filter((att: PersonAttendance) => (att as any).include_in_average).length;
    this.perc = allCount ? Math.round(attendedCount / allCount * 100) : 0;

    // Count late attendances (only after lastSolve if set)
    const lastSolveDate = this.player.lastSolve ? dayjs(this.player.lastSolve) : null;
    const attendancesAfterSolve = lastSolveDate
      ? attendances.filter((a: PersonAttendance) => dayjs((a as any).date).isAfter(lastSolveDate))
      : attendances;

    this.lateCount = attendancesAfterSolve.filter((a) => a.status === AttendanceStatus.Late).length;
    this.lateCountExcused = attendancesAfterSolve.filter((a) => a.status === AttendanceStatus.LateExcused).length;

    // Map attendance history
    const attendanceHistory = attendances.map((att: PersonAttendance) => ({
      date: (att as any).date,
      text: (att as any).text,
      type: PlayerHistoryType.ATTENDANCE,
      title: (att as any).title,
      notes: att.notes,
    }));

    // Filter and map player history
    const currentAttDate = await this.db.getCurrentAttDate();
    const playerHistory = this.existingPlayer.history
      .filter((his: PlayerHistoryEntry) =>
        this.isAdmin ||
        [PlayerHistoryType.INSTRUMENT_CHANGE, PlayerHistoryType.PAUSED, PlayerHistoryType.UNPAUSED].includes(his.type)
      )
      .filter((his: PlayerHistoryEntry) => dayjs(currentAttDate).isBefore(dayjs(his.date)))
      .map((his: PlayerHistoryEntry) => ({
        ...his,
        title: '',
        notes: '',
      }));

    // Combine and sort history
    this.history = [...attendanceHistory, ...playerHistory]
      .sort((a: PlayerHistoryEntry, b: PlayerHistoryEntry) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Reset late count by setting lastSolve to current date.
   * This marks that a conversation was held about frequent tardiness.
   * Note: This also resets the critical player status (same field is used).
   */
  async resetLateCount(): Promise<void> {
    const loading = await this.loadingController.create({ message: translate('person.resetting') });
    await loading.present();

    try {
      const now = dayjs().toISOString();
      this.player.lastSolve = now;
      this.existingPlayer.lastSolve = now;
      await this.db.updatePlayer(this.player);
      this.lateCount = 0;
      this.lateCountExcused = 0;
      await loading.dismiss();
      Utils.showToast(translate('person.lateCounterReset'), 'success');
    } catch (error) {
      console.error('Error resetting late count:', error);
      await loading.dismiss();
      Utils.showToast(translate('person.resetFailed'), 'danger');
    }
  }

  onInstrumentChange(byUser = true) {
    if (byUser) {
      this.onChange();
      this.player.isLeader = false;
    }
    this.teachers = this.allTeachers.filter((t: Teacher) => t.instruments.includes(this.player.instrument));
    if (this.db.groups().find((i: Group) => i.id === this.player.instrument).maingroup) {
      this.role = Role.RESPONSIBLE;
      this.isMainGroup = true;
    } else {
      if (this.role === Role.RESPONSIBLE && !this.player.appId) {
        this.role = Role.PLAYER;
      }
      this.isMainGroup = false;
    }
  }

  formatDate(value: string) {
    return format(parseISO(value || new Date().toISOString()), 'dd.MM.yyyy');
  }

  getDateInputValue(isoString: string): string {
    // Convert ISO string to YYYY-MM-DD format for native date input
    return isoString?.substring(0, 10) || '';
  }

  formatDateForDisplay(isoString: string): string {
    // Convert ISO string to DD.MM.YYYY for display
    if (!isoString) return '';
    return this.formatDate(isoString);
  }

  onManualDateInput(field: string, event: any) {
    const value = event.target.value?.trim();
    if (!value) return;

    // Parse DD.MM.YYYY format
    const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!match) {
      // Invalid format, revert to previous value
      if (field === 'birthday') {
        event.target.value = this.formatDateForDisplay(this.player.birthday);
      } else if (field === 'playsSince') {
        event.target.value = this.formatDateForDisplay(this.player.playsSince);
      } else if (field === 'joined') {
        event.target.value = this.formatDateForDisplay(this.player.joined);
      } else if (field.startsWith('extra-')) {
        const fieldId = field.substring(6);
        event.target.value = this.formatDateForDisplay(this.player.additional_fields[fieldId] as string);
      }
      return;
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    // Validate date
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return;
    }

    // Convert to ISO string
    const date = new Date(year, month - 1, day);
    const isoString = dayjs(date).startOf('day').utc(true).toISOString();

    if (field === 'birthday') {
      this.player.birthday = isoString;
      this.birthdayString = this.formatDate(isoString);
      this.player.correctBirthday = true;
    } else if (field === 'playsSince') {
      this.player.playsSince = isoString;
      this.playsSinceString = this.formatDate(isoString);
    } else if (field === 'joined') {
      this.player.joined = isoString;
      this.joinedString = this.formatDate(isoString);
    } else if (field.startsWith('extra-')) {
      const fieldId = field.substring(6);
      this.player.additional_fields[fieldId] = isoString;
    }

    this.onChange();
  }

  async dismiss(data?: any): Promise<void> {
    if (this.hasChanges) {
      const alert = await this.alertController.create({
        header: translate('person.discardChanges'),
        message: translate('person.discardChangesMessage'),
        buttons: [
          {
            text: translate('common.cancel'),
            role: 'destructive',
          }, {
            text: translate('common.yes'),
            handler: () => {
              this.modalController.dismiss(data);
            }
          }
        ]
      });

      await alert.present();
    } else {
      await this.modalController.dismiss(data);
    }
  }

  async addPerson(): Promise<void> {
    // Validate required fields
    if (!this.player.firstName || !this.player.lastName) {
      Utils.showToast(translate('person.enterNames'), 'danger');
      return;
    }

    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
    loading.present();

    try {
      await this.db.addPlayer(this.player, Boolean(this.player.email), this.role);
      this.modalController.dismiss();
      Utils.showToast(translate('person.added'), 'success');
    } catch (error) {
      Utils.showToast(translate('person.addFailed', { error: error.message ?? translate('common.unknownError') }), 'danger');
    }

    loading.dismiss();
  }

  async updatePlayer(): Promise<void> {
    // Validate email
    if (this.player.email?.length && this.player.email !== this.existingPlayer.email && !Utils.validateEmail(this.player.email)) {
      Utils.showToast(translate('person.invalidEmail'), 'danger');
      return;
    }

    const loading: HTMLIonLoadingElement = await this.loadingController.create();

    if (this.existingPlayer.email !== this.player.email && Utils.validateEmail(this.player.email)) {
      const alert = await this.alertController.create({
        header: translate('person.emailAdded'),
        message: translate('person.createAccountNow'),
        buttons: [
          {
            text: translate('common.cancel'),
            handler: () => {
              loading.dismiss();
            },
            role: 'destructive',
          },
          {
            text: translate('common.yes'),
            handler: async () => {
              loading.present();
              await this.continueUpdatingPlayer(true, loading, false);
            },
          },
        ],
      });
      await alert.present();
      return;
    }

    // Check if isLeader is being activated (not for general tenant, and player must have account)
    if (!this.isGeneral && this.player.appId && !this.existingPlayer.isLeader && this.player.isLeader) {
      const alert = await this.alertController.create({
        header: translate('person.enableVoiceLeader'),
        message: translate('person.voiceLeaderMessage', { name: `${this.player.firstName} ${this.player.lastName}` }),
        buttons: [
          {
            text: translate('common.cancel'),
            handler: () => {
              this.player.isLeader = false;
            },
            role: 'cancel',
          },
          {
            text: translate('person.voiceLeaderStatusOnly'),
            handler: async () => {
              loading.present();
              await this.continueUpdatingPlayer(false, loading, false);
            },
          },
          {
            text: translate('person.saveWithRole'),
            handler: async () => {
              loading.present();
              await this.continueUpdatingPlayer(false, loading, true);
            },
          },
        ],
      });
      await alert.present();
      return;
    }

    loading.present();
    await this.continueUpdatingPlayer(false, loading, false);
  }

  async continueUpdatingPlayer(createAccount = false, loading: HTMLIonLoadingElement, assignVoiceLeaderRole = false): Promise<void> {
    const mainGroupId = this.db.getMainGroup()?.id;
    if (this.player.appId && (this.existingPlayer.instrument !== this.player.instrument && this.player.instrument === mainGroupId || this.existingPlayer.instrument === mainGroupId)) {
      const currentRole = await this.db.getRoleFromTenantUser(this.player.appId);
      if (currentRole !== Role.ADMIN) {
        await this.db.updateTenantUser({ role: this.player.instrument === mainGroupId ? Role.RESPONSIBLE : Role.PLAYER }, this.player.appId);
      }
    }

    // Handle Voice Leader role assignment
    if (this.player.appId && !this.isGeneral) {
      if (assignVoiceLeaderRole) {
        // Assign Voice Leader role
        const currentRole = await this.db.getRoleFromTenantUser(this.player.appId);
        const newRole = currentRole === Role.HELPER ? Role.VOICE_LEADER_HELPER : Role.VOICE_LEADER;
        await this.db.updateTenantUser({ role: newRole }, this.player.appId);
      } else if (this.existingPlayer.isLeader && !this.player.isLeader) {
        // Remove Voice Leader role when isLeader is turned off
        const currentRole = await this.db.getRoleFromTenantUser(this.player.appId);
        if (currentRole === Role.VOICE_LEADER) {
          await this.db.updateTenantUser({ role: Role.PLAYER }, this.player.appId);
        } else if (currentRole === Role.VOICE_LEADER_HELPER) {
          await this.db.updateTenantUser({ role: Role.HELPER }, this.player.appId);
        }
      }
    }

    const history = this.player.history;
    if (this.solved) {
      history.push({
        date: new Date().toISOString(),
        text: this.notes,
        type: PlayerHistoryType.CRITICAL_PERSON,
      });
    }

    if (this.existingPlayer.instrument !== this.player.instrument) {
      history.push({
        date: new Date().toISOString(),
        text: `${this.db.groups().find((ins: Group) => ins.id === this.existingPlayer.instrument).name} -> ${this.db.groups().find((ins: Group) => ins.id === this.player.instrument).name}`,
        type: PlayerHistoryType.INSTRUMENT_CHANGE,
      });
    }

    if ((this.existingPlayer.notes || '') !== (this.player.notes || '')) {
      history.push({
        date: new Date().toISOString(),
        text: this.existingPlayer.notes || 'Keine Notiz',
        type: PlayerHistoryType.NOTES,
      });
    }

    try {
      const organisationFieldIds = new Set(
        (this.db.organisation()?.additional_fields ?? []).map(field => field.id)
      );
      const sharedValues: Record<string, any> = {};
      const localAdditionalFields = { ...(this.player.additional_fields ?? {}) };
      if (this.db.getOrganisationPersonKey(this.player)) {
        for (const fieldId of organisationFieldIds) {
          if (Object.prototype.hasOwnProperty.call(localAdditionalFields, fieldId)) {
            sharedValues[fieldId] = localAdditionalFields[fieldId];
            delete localAdditionalFields[fieldId];
          }
        }
        await this.db.updateSharedPersonFieldValues(this.player, sharedValues);
      }

      await this.db.updatePlayer({
        ...this.player,
        additional_fields: localAdditionalFields,
        isCritical: this.solved ? false : this.player.isCritical,
        lastSolve: this.solved ? new Date().toISOString() : this.player.lastSolve,
      }, false, createAccount, this.role, this.existingPlayer.shift_id !== this.player.shift_id);

      // Sync upcoming attendances if additional_fields changed and filter is used
      try {
        await this.db.syncPlayerWithUpcomingAttendancesByAdditionalFields(
          this.player,
          this.existingPlayer.additional_fields
        );
      } catch (e) {
        console.warn('Could not sync player with upcoming attendances:', e);
      }

      loading.dismiss();
      this.hasChanges = false;
      await this.dismiss();

      Utils.showToast(translate('person.updated'), 'success');
    } catch (error) {
      loading.dismiss();
      Utils.showToast(translate('person.updateFailedWith', { error: error.message ?? translate('common.unknownError') }), 'danger');
    }
  }

  async onRoleChange() {
    await this.db.updateTenantUser({ role: this.role }, this.player.appId);
    Utils.showToast(translate('person.roleUpdated'), 'success');
  }

  async removeUserFromTenant() {
    const alert = await this.alertController.create({
      header: translate('person.removeAccount'),
      message: translate('person.removeAccountMessage'),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'destructive',
        }, {
          text: translate('common.yes'),
          handler: async () => {
            try {
              await this.db.removeUserFromTenant(this.player.appId, false, this.player.id);
              await this.db.updatePlayer({
                ...this.player,
                email: null,
                appId: null,
              });
              this.hasChanges = false;
              await this.dismiss();
              Utils.showToast(translate('person.userRemoved'), 'success');
            } catch (error) {
              Utils.showToast(translate('person.userRemoveFailed'), 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * Typeahead handler — runs as the user types first/last name. Fetches
   * cross-tenant matches in linked tenants and feeds the inline suggestion
   * list (the only surface for these matches; there is no blur fallback).
   */
  async onNameInput() {
    if (this.readOnly) {return;}
    const first = (this.player.firstName ?? '').trim();
    const last = (this.player.lastName ?? '').trim();
    // Skip until the user has typed something meaningful in either field.
    if (first.length < 2 && last.length < 2) {
      this.nameSuggestions.set([]);
      return;
    }
    // In edit mode, only re-suggest if the name actually changed.
    if (this.existingPlayer
        && this.existingPlayer.firstName === this.player.firstName
        && this.existingPlayer.lastName === this.player.lastName) {
      this.nameSuggestions.set([]);
      return;
    }
    // Honour an explicit dismissal until the name changes.
    const key = `${first}|${last}`;
    if (this.dismissedFor === key) {
      this.nameSuggestions.set([]);
      return;
    }
    this.dismissedFor = null;

    const mySeq = ++this.nameLookupSeq;
    try {
      const matches = await this.db.getPossiblePersonsByName(this.player.firstName, this.player.lastName, false);
      // Drop stale results.
      if (mySeq !== this.nameLookupSeq) {return;}
      const filtered = matches.filter(m => m.candidate.id !== this.existingPlayer?.id);
      this.nameSuggestions.set(filtered);
    } catch {
      // Silent — toast already raised by the service.
    }
  }

  /**
   * Hides the suggestion list. Re-opens automatically once the user
   * changes the name; until then the dismissal is sticky.
   */
  dismissNameSuggestions(): void {
    const first = (this.player.firstName ?? '').trim();
    const last = (this.player.lastName ?? '').trim();
    this.dismissedFor = `${first}|${last}`;
    this.nameSuggestions.set([]);
  }

  /**
   * Adopts data from a matched cross-tenant person into the form.
   */
  applyMatchedPerson(value: Player): void {
    this.player.firstName = value.firstName;
    this.player.lastName = value.lastName;
    this.player.email = value.email;
    if (value.correctBirthday) {
      this.player.birthday = value.birthday;
      this.birthdayString = this.formatDate(this.player.birthday);
    }
    this.player.img = value.img || DEFAULT_IMAGE;
    this.player.otherExercise = value.otherExercise;
    this.player.range = value.range;

    const instrument = this.db.groups().find((i: Group) => i.name === (value as any).instrument?.name);
    if (instrument) {
      this.player.instrument = instrument.id;
    }

    this.nameSuggestions.set([]);
    Utils.showToast(translate('person.dataTaken'), 'success');
  }

  /**
   * On email blur, propose existing cross-tenant people who already use
   * this email, so the user can adopt their record instead of creating
   * a duplicate.
   */
  async onEmailBlur() {
    if (this.readOnly) {return;}
    const email = (this.player.email ?? '').trim();
    if (!email || !Utils.validateEmail(email)) {return;}
    if (email === this.lastEmailLookup) {return;}
    if (this.existingPlayer && this.existingPlayer.email === this.player.email) {return;}
    this.lastEmailLookup = email;

    let matches: Player[] = [];
    try {
      matches = await this.db.getPossiblePersonsByEmail(email);
    } catch {
      return;
    }
    matches = matches.filter(m => m.id !== this.existingPlayer?.id);
    if (!matches.length) {return;}

    const alert = await this.alertController.create({
      header: translate('person.emailTaken'),
      message: matches.length === 1
        ? translate('person.emailUsedBy', { name: `${matches[0].firstName} ${matches[0].lastName}` })
        : translate('person.emailUsedMany'),
      inputs: matches.length === 1 ? undefined : matches.map((p, index) => ({
        type: 'radio',
        checked: index === 0,
        label: `${p.firstName} ${p.lastName} · ${(p as any).instrument?.name ?? '?'} (${(p as any).tenantId?.longName ?? '?'})`,
        value: p,
      })),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'destructive',
        }, {
          text: translate('common.yes'),
          handler: (value: Player) => {
            this.applyMatchedPerson(value ?? matches[0]);
          }
        }
      ]
    });

    await alert.present();
  }

  /** Looks up same-tenant, account-less players similar to this pending applicant. */
  async loadDuplicateCandidates(): Promise<void> {
    try {
      const matches = await this.db.getPossibleDuplicatesInTenant(this.player.firstName, this.player.lastName, this.player.id);
      this.duplicateCandidates.set(matches);
    } catch {
      // Silent — toast already raised by the service.
    }
  }

  /**
   * Merges this pending applicant into an existing, account-less person:
   * their attendance history stays, the applicant's account is adopted.
   */
  async confirmMerge(candidate: Player): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('person.mergePeople'),
      message: translate('person.mergeMessage', {
        name: `${this.player.firstName} ${this.player.lastName}`,
        candidate: `${candidate.firstName} ${candidate.lastName}`,
      }),
      buttons: [
        { text: translate('common.cancel'), role: 'destructive' },
        {
          text: translate('person.merge'),
          handler: async () => {
            // No auto-dismiss timeout — merge involves several sequential DB calls plus an email
            // webhook and can outlast a fixed duration, which would otherwise falsely trip the catch.
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(0, translate('person.merging'));
            loading.present();
            try {
              await this.db.mergePendingPlayerIntoExisting(this.player, candidate);
              await loading.dismiss();
              this.hasChanges = false;
              await this.dismiss({ approved: true });
              Utils.showToast(translate('person.merged'), 'success');
            } catch (error) {
              await loading.dismiss().catch(() => {});
              console.error('confirmMerge failed', error);
              Utils.showToast(translate('person.mergeFailed'), 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  onChange() {
    if (!this.approveMode && !this.readOnly && this.existingPlayer) {
      const existingPerson: Player = { ...this.existingPlayer, email: this.player.email === null ? null : this.existingPlayer.email || '', teacherName: this.player.teacherName, notes: this.player.notes === null ? null : this.existingPlayer.notes || '', criticalReasonText: this.player.criticalReasonText };

      this.hasChanges =
        this.solved ||
        JSON.stringify(existingPerson) !== JSON.stringify(this.player);
    }
  }

  onBirthdayChange(value: string | string[], modal: IonModal) {
    this.onChange();
    this.player.correctBirthday = true;

    // Normalize to UTC midnight to avoid timezone shifts
    const dateStr = String(value);
    this.player.birthday = dayjs(dateStr).startOf('day').utc(true).toISOString();

    if (parseInt(this.birthdayString.substring(0, 2), 10) !== dayjs(this.player.birthday).date()) {
      modal.dismiss();
    }

    this.birthdayString = this.formatDate(this.player.birthday);
  }

  onPlaysSinceChange(value: string | string[], modal: IonModal) {
    this.onChange();

    // Normalize to UTC midnight to avoid timezone shifts
    const dateStr = String(value);
    this.player.playsSince = dayjs(dateStr).startOf('day').utc(true).toISOString();

    if (parseInt(this.playsSinceString.substring(0, 2), 10) !== dayjs(this.player.playsSince).date()) {
      modal.dismiss();
    }

    this.playsSinceString = this.formatDate(this.player.playsSince);
  }

  onJoinedChange(value: string | string[], modal: IonModal) {
    this.onChange();

    // Normalize to UTC midnight to avoid timezone shifts
    const dateStr = String(value);
    this.player.joined = dayjs(dateStr).startOf('day').utc(true).toISOString();

    if (parseInt(this.joinedString.substring(0, 2), 10) !== dayjs(this.player.joined).date()) {
      modal.dismiss();
    }

    this.joinedString = this.formatDate(this.player.joined);
  }

  async removeHis(his: PlayerHistoryEntry, slider: IonItemSliding) {
    const alert = await this.alertController.create({
      header: translate('person.removeEntry'),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'destructive',
          handler: () => slider.close()
        }, {
          text: translate('common.yes'),
          handler: async () => {
            const history = this.player.history.filter((h: PlayerHistoryEntry) => h.date !== his.date);

            try {
              const res = await this.db.updatePlayerHistory(
                this.player.id,
                history,
              );
              this.existingPlayer = { ...res } as any;
              this.player.history = res.history as any;
              this.getHistoryInfo();
              Utils.showToast(translate('person.entryRemoved'), 'success');
            } catch {
              Utils.showToast(translate('person.entryRemoveFailed'), 'danger');
            }

            slider.close();
          }
        }
      ]
    });

    await alert.present();
  }

  async register() {
    const loading: HTMLIonLoadingElement = await this.loadingController.create();
    loading.present();

    try {
      await this.db.createAccount(this.player);
      await this.modalController.dismiss();
      Utils.showToast(translate('person.accountCreated'), 'success');
      await loading.dismiss();
    } catch (error) {
      Utils.showToast(error.message, 'danger');
      await loading.dismiss();
    }
  }

  onProfileImageClick(): void {
    const hasImage = !!this.player?.img && this.player.img !== DEFAULT_IMAGE;

    if (hasImage) {
      // A picture exists: open the fullscreen viewer. Edit/remove actions
      // live inside the viewer itself.
      this.openPassImageViewer();
    } else if (!this.readOnly) {
      // No picture and editable: skip the bottom sheet and open the file
      // chooser directly to add one.
      this.chooser.nativeElement.click();
    }
  }

  /** Replace the current picture from within the viewer. */
  replaceImgFromViewer(): void {
    this.chooser.nativeElement.click();
  }

  /** Remove the current picture from within the viewer. */
  async removeImgFromViewer(): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('person.removePhoto'),
      message: translate('person.removePhotoMessage'),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
        },
        {
          text: translate('common.remove'),
          role: 'destructive',
          handler: async () => {
            if (this.existingPlayer) {
              // newUser must be false so removeImage() actually clears the
              // player.img DB column — passing true only deletes the storage
              // object and leaves the row's img URL intact, so the picture
              // came back on reload. appId lets the self-edit case match by
              // appId instead of id.
              const fileName = this.player.img.split('/').pop().replace('?quality=20', '');
              await this.db.removeImage(this.player.id, fileName, false, this.player.appId || '');
            }
            this.player.img = DEFAULT_IMAGE;
            this.closePassImageViewer();
            Utils.showToast(translate('person.photoRemoved'), 'success');
          },
        },
      ],
    });

    await alert.present();
  }

  openPassImageViewer(): void {
    this.isImageViewerOpen = true;
  }

  closePassImageViewer(): void {
    this.isImageViewerOpen = false;
  }


  async onImageSelect(evt: any) {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const imgFile: File = evt.target.files[0];

    if (imgFile) {
      if (imgFile.size > 2 * 1024 * 1024) {
        loading.dismiss();
        Utils.showToast(translate('person.photoTooLarge'), 'danger');
        return;
      }

      if (imgFile.type.substring(0, 5) === 'image') {
        if (!this.existingPlayer) {
          // New person: no player id exists yet, so keep the image as a data URL.
          // addPlayer() converts it to a File and uploads it after the insert.
          try {
            const dataUrl = await this.readFileAsDataUrl(imgFile);
            this.player.img = dataUrl;
          } catch (error) {
            Utils.showToast(translate('person.photoLoadFailed'), 'danger');
          }
          loading.dismiss();
          return;
        }

        try {
          const url: string = await this.db.updateImage(this.player.id, imgFile, this.player.appId);
          this.player.img = url;
        } catch (error) {
          Utils.showToast(error, 'danger');
        } finally {
          loading.dismiss();
        }
      } else {
        loading.dismiss();
        Utils.showToast(translate('person.photoChangeFailed'), 'danger');
      }
    } else {
      loading.dismiss();
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader: FileReader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  getAttText(text: string) {
    return text === 'X' ? '✓' :
      text === 'L' ? 'L' :
        text === 'E' ? 'E' : text === 'N' ? 'N' : 'A';
  }

  async onHisItemClicked(his: PlayerHistoryEntry) {
    if (his.type === PlayerHistoryType.NOTES) {
      const alert = await this.alertController.create({
        header: translate('person.noteChanged'),
        subHeader: dayjs(his.date).format(dateFmt()),
        message: translate('person.oldNote', { note: his.text }),
        buttons: [translate('common.ok')]
      });

      await alert.present();
    }
  }

  async searchPerson() {
    const matches = await this.db.getPossiblePersonsByName(this.player.firstName, this.player.lastName);

    if (matches.length === 0) {
      Utils.showToast(translate('person.noMatchOther'), 'danger');
      return;
    }

    const actionSheet = await this.actionSheetController.create({
      header: translate('person.chooseEntry'),
      buttons: matches.map((m) => ({
          text: `${m.candidate.firstName} ${m.candidate.lastName} · ${(m.candidate as any).instrument?.name ?? '?'} (${(m.candidate as any).tenantId?.longName ?? '?'})`,
          handler: async () => {
            const candidate = m.candidate;
            if (!candidate.email?.trim()) { return; }
            // Determine or create the shared identity UUID
            const globalPersonId: string = (candidate as any).global_person_id ?? crypto.randomUUID();

            // Copy shared identity fields from the matched candidate
            this.player.email = candidate.email;
            this.player.global_person_id = globalPersonId;

            await this.db.updatePlayer({
              ...this.player,
              email: candidate.email,
              global_person_id: globalPersonId,
            });

            // Back-fill the candidate's row if it didn't have a global_person_id yet
            if (!(candidate as any).global_person_id) {
              await this.db.setGlobalPersonId([(candidate as any).id], globalPersonId);
            }

            Utils.showToast(translate('person.emailUpdated'), 'success');
          }
        }))
    });

    await actionSheet.present();
  }

  async assignMyAccount() {
    const me = this.db.tenantUser();
    const loading = await this.loadingController.create();
    await loading.present();
    try {
      const updated = await this.db.createAccount({ ...this.player, email: me.email });
      this.player.appId = updated.appId;
      this.player.email = me.email;
      this.existingPlayer = { ...this.existingPlayer, appId: updated.appId, email: me.email };
      this.role = await this.db.getRoleFromTenantUser(updated.appId);
      Utils.showToast(translate('person.userAssigned'), 'success');
    } catch (error) {
      Utils.showToast(error.message, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async openMoreMenu() {
    const buttons: ActionSheetButton[] = [];

    if (!this.player.appId && this.isAdmin) {
      buttons.push({
        text: translate('person.assignMyUser'),
        handler: async () => {
          await this.assignMyAccount();
        }
      });
    }

    if (this.player.paused) {
      buttons.push({
        text: translate('person.reactivate'),
        handler: async () => {
          const history: PlayerHistoryEntry[] = this.player.history;
          history.push({
            date: new Date().toISOString(),
            text: translate('people.activeAgain'),
            type: PlayerHistoryType.UNPAUSED,
          });
          try {
            await this.db.updatePlayer({
              ...this.player,
              paused: false,
              paused_until: null,
              history,
            }, true);
            this.hasChanges = false;
            await this.dismiss();
          } catch (error) {
            Utils.showToast(error, 'danger');
          }
        }
      });
    } else {
      buttons.push({
        text: translate('people.pause'),
        handler: async () => {
          this.pauseReason = '';
          this.pauseFrom = '';
          this.pauseUntil = '';
          this.isPauseModalOpen = true;
        }
      });
    }

    if (this.organisation && this.tenants.length) {
      buttons.push({
        text: translate('person.transferOther'),
        handler: async (): Promise<void> => {
          this.copy = false;
          this.isTransferModalOpen = true;
        }
      });

      buttons.push({
        text: translate('person.copyOther'),
        handler: async (): Promise<void> => {
          this.copy = true;
          this.isTransferModalOpen = true;
        }
      });
    }

    buttons.push({
      text: translate('people.archive'),
      handler: (): void => {
        this.isArchiveModalOpen = true;
      },
      role: 'destructive',
    });

    if (this.player.appId !== this.db.tenantUser().userId) {
      buttons.push({
        text: translate('common.remove'),
        handler: async (): Promise<void> => {
          const alert = await this.alertController.create({
            header: translate('attendance.removePerson'),
            message: translate('person.removePersonMessage'),
            buttons: [
              {
                text: translate('common.cancel'),
                role: 'destructive',
              }, {
                text: translate('common.yes'),
                handler: async () => {
                  this.modalController.dismiss();
                  try {
                    await this.db.removePlayer(this.player);
                    Utils.showToast(translate('person.removed'), 'success');
                  } catch (error) {
                    Utils.showToast(error, 'danger');
                  }
                },
              }
            ]
          });
          await alert.present();
        },
        role: 'destructive',
      });
    }

    buttons.push({
      text: translate('common.cancel'),
      role: 'destructive',
    });

    const actionSheet = await this.actionSheetController.create({
      header: translate('person.actions'),
      buttons
    });
    await actionSheet.present();
  }

  async transferPerson() {
    const targetTenant = this.tenants.find(t => t.id === this.tenantId);
    if (!targetTenant) {
      return;
    }

    if (await this.db.personExistsInTenant(this.player, targetTenant.id)) {
      const blockAlert = await this.alertController.create({
        header: this.copy ? translate('person.copyNotPossible') : translate('person.transferNotPossible'),
        message: this.player.email
          ? translate('person.existsWithEmail', { tenant: targetTenant.longName, email: this.player.email })
          : translate('person.existsWithName', { tenant: targetTenant.longName, name: `${this.player.firstName} ${this.player.lastName}` }),
        buttons: [translate('common.ok')],
      });
      await blockAlert.present();
      return;
    }

    const alert = await this.alertController.create({
      header: this.copy ? translate('person.copyPerson') : translate('person.transferPerson'),
      message: this.copy ? translate('person.copyConfirm') : translate('person.transferConfirm'),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'destructive',
        }, {
          text: translate('common.yes'),
          handler: async () => {
            try {
              await this.db.handoverPerson(this.player, targetTenant, this.targetGroupId, this.copy, this.isMainGroup ? this.player.instrument : null);
              this.isTransferModalOpen = false;
              if (!this.copy) {
                this.hasChanges = false;
                await this.dismiss();
              }
              Utils.showToast(this.copy ? translate('person.copied') : translate('person.transferred'), 'success');
            } catch (error) {
              Utils.showToast(error, 'danger');
              return;
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async archivePlayer(): Promise<void> {
    await this.db.archivePlayer(this.player, dayjs(this.archiveDate).toISOString(), this.archiveNote);
    await this.dismissArchiveModal();
    this.hasChanges = false;
    setTimeout(async () => {
      await this.dismiss();
    }, 500);
    Utils.showToast(translate('person.archived'), 'success');
  }

  async dismissArchiveModal(): Promise<void> {
    this.archiveNote = '';
    this.isArchiveModalOpen = false;
  }

  async confirmPause(): Promise<void> {
    if (!this.pauseReason) {
      Utils.showToast(translate('signout.giveReason'), 'danger');
      return;
    }
    const segments: string[] = [];
    if (this.pauseFrom) {
      segments.push(`ab ${dayjs(this.pauseFrom).format('DD.MM.YYYY')}`);
    }
    if (this.pauseUntil) {
      segments.push(`bis ${dayjs(this.pauseUntil).format('DD.MM.YYYY')}`);
    }
    const history: PlayerHistoryEntry[] = this.player.history;
    history.push({
      date: new Date().toISOString(),
      text: this.pauseReason + (segments.length ? ` (${segments.join(' ')})` : ''),
      type: PlayerHistoryType.PAUSED,
    });
    try {
      await this.db.updatePlayer({
        ...this.player,
        paused: true,
        paused_until: this.pauseUntil || null,
        history,
      }, true, undefined, undefined, undefined, this.pauseFrom || undefined);
      this.hasChanges = false;
      this.isPauseModalOpen = false;

      if (this.otherTenants.length) {
        await this.askPauseInOtherTenants(history, this.pauseFrom);
      }

      await this.dismiss();
    } catch (error) {
      Utils.showToast(error, 'danger');
    }
  }

  private async askPauseInOtherTenants(history: PlayerHistoryEntry[], pauseFrom: string): Promise<void> {
    await new Promise<void>(async (resolve) => {
      const alert = await this.alertController.create({
        header: translate('people.pauseOthers'),
        message: `${this.player.firstName} ${this.player.lastName} ist auch in anderen Instanzen aktiv. In welchen soll die Person ebenfalls pausiert werden?`,
        inputs: this.otherTenants.map((t) => ({
          type: 'checkbox' as const,
          label: t.longName || t.shortName,
          value: t,
          checked: false,
        })),
        buttons: [
          { text: translate('people.skip'), role: 'cancel', handler: () => resolve() },
          {
            text: translate('people.pause'),
            handler: async (selected: Tenant[]) => {
              for (const tenant of selected) {
                try {
                  const personRef = await this.db.getPersonIdFromTenant(this.player.appId, tenant.id);
                  if (personRef) {
                    await this.db.pausePlayerInOtherTenant(personRef.id, tenant.id, true, this.pauseUntil || null, history, pauseFrom || undefined);
                  }
                } catch (error) {
                  Utils.showToast(translate('people.errorAt', { tenant: tenant.shortName, error: String(error) }), 'danger');
                }
              }
              resolve();
            },
          },
        ],
      });
      await alert.present();
    });
  }

  dismissPauseModal(): void {
    this.isPauseModalOpen = false;
    this.pauseReason = '';
    this.pauseFrom = '';
    this.pauseUntil = '';
  }

  openAbsenceModal(): void {
    this.isAbsenceModalOpen = true;
  }

  dismissAbsenceModal(): void {
    this.isAbsenceModalOpen = false;
    this.absenceReason = '';
    this.absenceFrom = '';
    this.absenceUntil = '';
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
      const toExcuse = this.upcomingAttendances.filter(att =>
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
      await this.getHistoryInfo();
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
      message: translate('person.deleteAbsenceMessage'),
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
              const toReset = this.upcomingAttendances.filter(att =>
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
              await this.getHistoryInfo();
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

  async activate(): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('person.reactivatePerson'),
      message: translate('person.reactivateConfirm'),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'destructive',
        }, {
          text: translate('common.yes'),
          handler: () => this.activateConfirmed()
        }
      ]
    });

    await alert.present();
  }

  async activateConfirmed(): Promise<void> {
    await this.db.activatePlayer(this.player);
    this.hasChanges = false;
    this.modalController.dismiss({ activated: true });
    Utils.showToast(translate('person.reactivated'), 'success');
  }

  getExtraFieldDateString(dateString: string): string {
    return format(parseISO(dateString), 'dd.MM.yyyy');
  }

  onExtraFieldDateChange(fieldId: string, value: string | string[], modal: IonModal) {
    this.onChange();

    // Normalize to UTC midnight to avoid timezone shifts
    const dateStr = String(value);
    this.player.additional_fields[fieldId] = dayjs(dateStr).startOf('day').utc(true).toISOString();

    if (parseInt((this.player.additional_fields[fieldId] as string).substring(0, 2), 10) !== dayjs(this.player.additional_fields[fieldId] as string).date()) {
      modal.dismiss();
    }
  }

  onShiftChange() {
    this.shift = this.db.shifts().find(s => s.id === this.player.shift_id);

    if (!this.shift) {
      this.player.shift_name = null;
      this.player.shift_start = null;
      this.onChange();
      return;
    }

    if (this.shift?.shifts.length) {
      this.player.shift_name = this.shift.shifts[0].name;
      this.player.shift_start = null;
    } else {
      this.player.shift_start = new Date().toISOString();
      this.player.shift_name = null;
    }

    this.onChange();
  }

  async showApproveActionSheet(): Promise<void> {
    const actionSheet = await this.actionSheetController.create({
      buttons: [
        {
          text: translate('person.approvePerson'),
          handler: () => this.approvePlayer(),
        },
        {
          text: translate('person.declinePerson'),
          role: 'destructive',
          handler: () => this.declinePlayer(),
        },
        {
          text: translate('common.cancel'),
          role: 'destructive',
        }
      ]
    });

    await actionSheet.present();
  }

  async declinePlayer(): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('person.declinePerson'),
      subHeader: translate('person.giveReasonShort'),
      inputs: [{
        type: 'textarea',
        name: 'reason'
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('person.decline'),
        handler: async (evt: { reason: string }) => {
          if (!evt.reason) {
            alert.message = translate('signout.giveReason');
            return false;
          }

          const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(10000, translate('person.declining'));
          loading.present();

          this.player.history.push({
            date: new Date().toISOString(),
            text: `Person abgelehnt von ${this.db.tenantUser().email}: ${evt.reason}`,
            type: PlayerHistoryType.DECLINED,
          });

          try {
            await this.db.updatePlayer({
              ...this.player,
              pending: false,
              left: new Date().toISOString(),
            });
            await this.db.removeUserFromTenant(this.player.appId, false, this.player.id);
            await this.db.informUserAboutReject(this.player.email, this.player.firstName);

            loading.dismiss();
            this.hasChanges = false;
            await this.dismiss({ approved: true });

            Utils.showToast(translate('person.updated'), 'success');
          } catch (error) {
            loading.dismiss();
            Utils.showToast(translate('person.updateFailed'), 'danger');
          }

          loading.dismiss();
        }
      }]
    });

    await alert.present();
  }

  async approvePlayer(): Promise<void> {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(10000, translate('person.approving'));
    loading.present();

    this.player.history.push({
      date: new Date().toISOString(),
      text: `Person genehmigt von ${this.db.tenantUser().email}`,
      type: PlayerHistoryType.APPROVED,
    });

    try {
      await this.db.updatePlayer({
        ...this.player,
        isCritical: this.solved ? false : this.player.isCritical,
        lastSolve: this.solved ? new Date().toISOString() : this.player.lastSolve,
        pending: false,
      });
      await this.db.updateTenantUser({ role: Role.PLAYER }, this.player.appId);
      await this.db.informUserAboutApproval(this.player.email, this.player.firstName, Role.PLAYER);
      await this.db.addPlayerToAttendancesByDate(this.player);

      loading.dismiss();
      this.hasChanges = false;
      await this.dismiss({ approved: true });

      Utils.showToast(translate('person.updated'), 'success');
    } catch (error) {
      loading.dismiss();
      Utils.showToast(translate('person.updateFailed'), 'danger');
    }

    loading.dismiss();
  }

  get hasDutyTypes(): boolean {
    return this.db.attendanceTypes().some(t => t.duty_mode);
  }

  async openUnavailability(): Promise<void> {
    const modal = await this.modalController.create({
      component: UnavailabilityModalComponent,
      componentProps: {
        personId: this.player.id,
        personName: `${this.player.firstName} ${this.player.lastName}`.trim(),
        forOther: true,
      },
    });
    await modal.present();
  }
}
