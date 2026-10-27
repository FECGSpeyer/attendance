import { Component, ElementRef, OnDestroy, OnInit, ViewChild, effect } from '@angular/core';
import { ActionSheetButton, ActionSheetController, AlertController, IonItemSliding, IonModal, IonRouterOutlet, isPlatform, ModalController } from '@ionic/angular/lazy';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { ExportPage } from 'src/app/export/export.page';
import { HistoryPage } from 'src/app/history/history.page';
import { PersonPage } from 'src/app/people/person/person.page';
import { PlanningPage } from 'src/app/planning/planning.page';
import { DbService } from 'src/app/services/db.service';
import { TeamsService } from 'src/app/services/teams/teams.service';
import { LiveUpdateService } from 'src/app/services/live-update/live-update.service';
import { StatsPage } from 'src/app/stats/stats.page';
import { DEFAULT_IMAGE, FieldType, Role } from 'src/app/utilities/constants';
import { Admin, Church, Parent, Person, Player, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { environment } from 'src/environments/environment';
import { Viewer } from '../../utilities/interfaces';
import { Router } from '@angular/router';
import { RegisterPage } from 'src/app/register/register.page';
import { RealtimeChannel } from '@supabase/supabase-js';
import { translate } from '@jsverse/transloco';
import { LocaleService } from 'src/app/i18n/locale.service';
import { currentLanguage, ENABLED_LANGUAGES, LANGUAGE_NAMES } from 'src/app/i18n/languages';

@Component({
    selector: 'app-settings',
    templateUrl: './settings.page.html',
    styleUrls: ['./settings.page.scss'],
    standalone: false
})
export class SettingsPage implements OnInit, OnDestroy {
  @ViewChild('imgChooser') chooser: ElementRef;
  public leftPlayers: Player[] = [];
  public leftConductors: Person[] = [];
  public playersWithoutAccount: Player[] = [];
  public version: string = require('../../../../package.json').version;
  public viewers: Viewer[] = [];
  public parents: Parent[] = [];
  public admins: Admin[] = [];
  public isAdmin = false;
  public hasOwnTasks = false;
  public isSuperAdmin = false;
  public isHelper = false;
  public isPlayer = false;
  public isGeneral = false;
  public isVoiceLeader = false;
  public tenantsFromUser: { tenantId: number; role: Role }[] = [];
  public isIos = false;
  public isInstancesModalOpen = false;
  public parentsEnabled = false;
  public maintainTeachers = false;
  public pendingPersons: Player[] = [];
  public isApplicant = false;
  public churches: Church[] = [];
  public isChurchModalOpen = false;
  public churchSearch = '';
  public userData: Person | null = null;
  public oldUserData: Person | null = null;
  public isImageViewerOpen = false;
  public max: string = new Date().toISOString();
  public helpQuestion = '';
  public feedbackText = '';
  public anonymous = false;
  public feedbackRating = 0;
  public feedbackPhone = '';
  private sub: RealtimeChannel | null = null;
  public versionHistory = require('../../../../version-history.json').versions;
  public wantInstanceSelection = false;
  public showAppPromo = false;
  public isMobile = false;
  public fieldTypes = FieldType;
  public languages = ENABLED_LANGUAGES.map(value => ({ value, label: LANGUAGE_NAMES[value] }));
  public language: string = '';

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    private router: Router,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private teams: TeamsService,
    public liveUpdate: LiveUpdateService,
    private locale: LocaleService,
  ) {
    effect(async () => {
      this.db.tenant();
      await this.initialize();
    });
  }

  async onLanguageChange(value: string): Promise<void> {
    if (value === this.locale.language) {
      return;
    }
    this.language = this.locale.setLanguage(value);
    if (this.db.user?.id) {
      await this.locale.saveToAccount(this.db.user.id, this.locale.language);
    }
    // Many labels are resolved once when a page is built, so reload to show
    // every screen in the new language.
    window.location.reload();
  }

  async ngOnInit(): Promise<void> {
    this.language = this.locale.language;
    this.isIos = isPlatform('ios');
    this.isMobile = isPlatform('ios') || isPlatform('android');
    this.checkAppPromo();
    await this.initialize();
  }

  async initialize(): Promise<void> {
    // Check if tenant and tenantUser are available
    if (!this.db.tenant() || !this.db.tenantUser()) {
      return;
    }

    this.isGeneral = this.db.tenant().type === 'general';
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER || this.db.tenantUser().role === Role.VOICE_LEADER_HELPER;
    this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.isApplicant = this.db.tenantUser().role === Role.APPLICANT;
    this.isVoiceLeader = [Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER].includes(this.db.tenantUser().role);
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.parentsEnabled = this.db.tenant().parents || false;
    void this.loadTeamAccess();

    // Parallel fetch all independent data for faster loading
    const [
      pendingPersons,
      allConductors,
      leftPlayersRaw,
      viewers,
      parents,
      admins,
      churches,
      playersWithoutAccount,
      tenantsFromUser,
      oldUserData
    ] = await Promise.all([
      this.db.getPendingPersons(),
      this.db.getConductors(true),
      this.db.getLeftPlayers(),
      this.db.getViewers(),
      this.parentsEnabled ? this.db.getParents() : Promise.resolve([]),
      this.db.getAdmins(),
      this.db.getPersonExtraFields().some(f => f.type === FieldType.BFECG_CHURCH) ? this.db.getChurches() : Promise.resolve([]),
      this.db.getPlayersWithoutAccount(),
      this.db.getUserRolesForTenants(this.db.tenantUser().userId),
      this.db.getPlayerProfile()
    ]);

    this.pendingPersons = pendingPersons;
    this.leftPlayers = Utils.getModifiedPlayersForList(
      leftPlayersRaw,
      this.db.groups(),
      [],
      this.db.attendanceTypes(),
      this.db.getMainGroup()?.id,
      this.db.getPersonExtraFields(),
      this.db.churches()
    );
    this.leftConductors = allConductors.filter((con: Person) => Boolean(con.left));
    this.viewers = viewers;
    this.parents = parents;
    this.admins = admins;
    this.churches = churches;
    this.playersWithoutAccount = playersWithoutAccount;
    this.tenantsFromUser = tenantsFromUser;
    this.oldUserData = oldUserData;

    if (this.oldUserData) {
      await this.db.hydrateSharedPersonFieldValues([this.oldUserData]);
      this.userData = { ...this.oldUserData };
      if (!this.userData.additional_fields) {
        this.userData.additional_fields = {};
      }
      // Pre-fill editable extra fields with default values if not yet set
      for (const field of this.getVisibleExtraFields()) {
        if (field.editableByPlayers && this.userData.additional_fields[field.id] === undefined && field.defaultValue !== undefined) {
          this.userData.additional_fields[field.id] = field.defaultValue;
        }
      }
    }

    this.wantInstanceSelection = this.db.user.user_metadata?.wantInstanceSelection || false;

    this.subscribe();
  }

  async handleRefresh(event: any): Promise<void> {
    await this.initialize();
    event.target.complete();
  }

  subscribe() {
    this.sub?.unsubscribe();

    this.sub = this.db.getSupabase()
      .channel('pending-player-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player' },
        async (event: any) => {
          if ((event.new?.tenantId === this.db.tenant().id && event.new?.pending) || event.old?.id) {
            this.pendingPersons = await this.db.getPendingPersons();
          }
        })
      .subscribe();
  }

  async ionViewWillEnter() {
    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
    this.pendingPersons = await this.db.getPendingPersons();
    this.viewers = await this.db.getViewers();
  }

  checkAppPromo(): void {
    // Hidden behind super-developer check until the native apps are publicly released.
    if (!this.db.isSuperDeveloper()) return;
    if (Capacitor.isNativePlatform()) return;
    // Inside a Teams tab there's no point promoting the native app store.
    if (this.teams.isInTeams()) return;
    const dismissed = localStorage.getItem('appPromoDismissed');

    if (!dismissed) {
      this.showAppPromo = true;
    }
  }

  dismissAppPromo(): void {
    this.showAppPromo = false;
    localStorage.setItem('appPromoDismissed', 'true');
  }

  openAppStore(platform: 'ios' | 'android' | 'auto' = 'auto'): void {
    const target = platform === 'auto' ? (this.isIos ? 'ios' : 'android') : platform;
    const url = target === 'ios'
      ? 'https://apps.apple.com/app/attendix/id6771119302'
      : 'https://play.google.com/store/apps/details?id=io.stephanus.attendix';
    window.open(url, '_blank');
  }

  async logout() {
    await this.db.logout();
  }

  async openHistoryModal(): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: HistoryPage,
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
  }

  async openStats(): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: StatsPage,
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
  }

  async openExport(): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: ExportPage,
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
  }

  async openPlanning(): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PlanningPage,
      presentingElement: this.routerOutlet.nativeEl,
      cssClass: 'planningModal',
    });

    await modal.present();
  }

  async openPlayerModal(p: Player | Person) {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        existingPlayer: { ...p },
        readOnly: true,
        hasLeft: true,
      }
    });

    await modal.present();

    const data = await modal.onDidDismiss();

    if (data?.data?.activated) {
      this.leftPlayers = Utils.getModifiedPlayersForList(
        await this.db.getLeftPlayers(),
        this.db.groups(),
        [],
        this.db.attendanceTypes(),
        this.db.getMainGroup()?.id,
        this.db.getPersonExtraFields(),
        this.db.churches()
      );
    }
  }

  async showAlertForAccountsCreation() {
    const alert = await this.alertController.create({
      header: translate('settings.createAccounts'),
      message: translate('settings.createAccountsMessage', { names: this.playersWithoutAccount.map((p: Player) => `${p.firstName} ${p.lastName}`).join(', ') }),
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('settings.continue'),
        handler: async () => {
          await this.createAccounts();
        }
      }]
    });

    await alert.present();
  }

  async createAccounts() {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(99999999);

    loading.present();

    try {
      for (const player of this.playersWithoutAccount) {
        await this.db.createAccount(player);
      }
    } catch (error) {
      this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
      Utils.showToast(translate('settings.createAccountsFailed', { error: error.message }), 'danger');
      loading.dismiss();
      return;
    }

    Utils.showToast(translate('settings.accountsCreated'), 'success');

    loading.dismiss();
  }

  async removeViewer(viewer: Viewer): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('settings.removeViewer'),
      message: translate('settings.removeMessage', { name: viewer.firstName }),
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('common.yes'),
        handler: async () => {
          await this.db.deleteViewer(viewer);
          this.viewers = await this.db.getViewers();
        }
      }]
    });

    await alert.present();
  }

  async removeParent(parent: Parent): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('settings.removeParent'),
      message: translate('settings.removeMessage', { name: parent.firstName }),
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('common.yes'),
        handler: async () => {
          await this.db.deleteParent(parent);
          this.parents = await this.db.getParents();
        }
      }]
    });

    await alert.present();
  }

  async onTenantChange(tenantId: number, modal?: IonModal): Promise<void> {
    if (this.db.tenant().id === tenantId) {
      return;
    }

    const loading = await Utils.getLoadingElement();
    await loading.present();

    modal?.dismiss();

    await this.db.setTenant(tenantId);
    await this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
    await loading.dismiss();
  }

  async openCreateInstanceModal(instancesModal: IonModal) {
    instancesModal?.dismiss();
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: RegisterPage,
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
  }



  async openViewerAlert() {
    const alert = await this.alertController.create({
      header: translate('settings.addViewer'),
      inputs: [{
        type: 'email',
        name: 'email',
        placeholder: translate('settings.emailAddress'),
      }, {
        name: 'firstName',
        placeholder: translate('people.firstName'),
      }, {
        name: 'lastName',
        placeholder: translate('people.lastName'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('settings.invite'),
        handler: async (data: { email: string; firstName: string; lastName: string }) => {
          if (Utils.validateEmail(data.email) && data.firstName.length && data.lastName.length) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createViewer(data);
              this.viewers = await this.db.getViewers();
              Utils.showToast(translate('settings.userCreated'), 'success');
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, 'danger');
              await loading.dismiss();
            }
          } else {
            alert.message = translate('admin.invalidValues');
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  async openParentsAlert() {
    const alert = await this.alertController.create({
      header: translate('settings.addParent'),
      inputs: [{
        type: 'email',
        name: 'email',
        placeholder: translate('settings.emailAddress'),
      }, {
        name: 'firstName',
        placeholder: translate('people.firstName'),
      }, {
        name: 'lastName',
        placeholder: translate('people.lastName'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('settings.invite'),
        handler: async (data: { email: string; firstName: string; lastName: string }) => {
          if (Utils.validateEmail(data.email) && data.firstName.length && data.lastName.length) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createParent(data);
              this.parents = await this.db.getParents();
              Utils.showToast(translate('settings.userCreated'), 'success');
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, 'danger');
              await loading.dismiss();
            }
          } else {
            alert.message = translate('admin.invalidValues');
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  async deleteInstance(tenant: Tenant, slider: IonItemSliding, modal: IonModal) {
    slider.close();

    if (!this.canDeleteTenant(tenant)) {
      Utils.showToast(translate('settings.cannotDeleteTenant'), 'danger');
      return;
    }

    const message = translate('settings.deleteTenantMessage', { name: tenant.longName });

    const alert = await this.alertController.create({
      header: translate('settings.deleteTenant'),
      message,
      inputs: [{
        type: 'text',
        placeholder: translate('settings.tenantNamePh'),
        name: 'name'
      }],
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('common.delete'),
        handler: async (evt) => {
          if (evt.name === tenant.longName) {
            const loading = await Utils.getLoadingElement(9999, translate('settings.removingTenant'));
            await loading.present();
            modal?.dismiss();
            await this.db.deleteInstance(tenant.id);
            await loading.dismiss();
          } else {
            alert.message = translate('settings.wrongName');
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  async setInstanceAsFavorite(tenant: Tenant, slider: IonItemSliding) {
    const loading = await Utils.getLoadingElement(5000);
    await loading.present();

    slider.close();

    try {
      await this.db.setFavoriteTenant(tenant.id, !tenant.favorite);
      await loading.dismiss();
      await Utils.showToast(translate(!tenant.favorite ? 'settings.favoriteSet' : 'settings.favoriteRemoved', { name: tenant.longName }), 'success', 3000);
    } catch (error) {
      await loading.dismiss();
    }
  }

  canDeleteTenant(tenant: Tenant): boolean {
    const found = this.tenantsFromUser.find(t => t.tenantId === tenant.id);
    return found?.role === Role.ADMIN && !this.db.isDemo();
  }

  isVorkursTenant(tenant: Tenant): boolean {
    return tenant.shortName?.toLowerCase().includes('vorkurs') ||
           tenant.longName?.toLowerCase().includes('vorkurs');
  }

  async generateVorkursCertificates(): Promise<void> {
    const groups = this.db.groups();

    const alert = await this.alertController.create({
      header: translate('settings.selectGroups'),
      message: translate('settings.certificatesFor'),
      inputs: groups.map(g => ({
        type: 'checkbox' as const,
        label: g.name,
        value: g.id,
        checked: true,
      })),
      buttons: [{
        text: translate('common.cancel'),
        role: 'cancel',
      }, {
        text: translate('settings.generate'),
        handler: async (selectedGroupIds: number[]) => {
          if (!selectedGroupIds?.length) {
            Utils.showToast(translate('settings.selectOneGroup'), 'warning');
            return false;
          }
          const loading = await Utils.getLoadingElement(9999, translate('settings.creatingCertificates'));
          await loading.present();
          try {
            const players = await this.db.getPlayers(true);
            const filtered = players.filter(p =>
              !p.left && !p.paused && !p.pending &&
              selectedGroupIds.includes(p.instrument)
            );
            if (!filtered.length) {
              Utils.showToast(translate('settings.noPersonsInGroups'), 'warning');
              return;
            }
            await Utils.generateVorkursCertificates(filtered);
          } catch {
            Utils.showToast(translate('settings.certificatesFailed'), 'danger');
          } finally {
            await loading.dismiss();
          }
        },
      }],
    });

    await alert.present();
  }

  async openAdminsAlert() {
    const alert = await this.alertController.create({
      header: translate('settings.addAdmin'),
      inputs: [{
        type: 'email',
        name: 'email',
        placeholder: translate('settings.emailAddress'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('attendance.add'),
        handler: async (data: { email: string }) => {
          if (Utils.validateEmail(data.email)) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createAdmin(data.email);
              this.admins = await this.db.getAdmins();
              Utils.showToast(translate('settings.adminAdded'), 'success');
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, 'danger');
              await loading.dismiss();
            }
          } else {
            alert.message = translate('admin.invalidValues');
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  async openChurchInput() {
    const alert = await this.alertController.create({
      header: translate('admin.addChurch'),
      inputs: [{
        type: 'text',
        name: 'name',
        placeholder: translate('admin.churchName'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('attendance.add'),
        handler: async (data: { name: string }) => {
          if (data.name.length) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createChurch(data.name);
              Utils.showToast(translate('admin.churchAdded'), 'success');
              this.churches = await this.db.getChurches();
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, 'danger');
              await loading.dismiss();
            }
          } else {
            alert.message = translate('admin.invalidValues');
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  async removeAdmin(admin: Admin): Promise<void> {
    if (admin.userId === this.db.tenantUser().userId) {
      Utils.showToast(translate('settings.cannotRemoveSelf'), 'danger');
      return;
    }

    const alert = await this.alertController.create({
      header: translate('settings.removeAdmin'),
      message: translate('settings.removeMessage', { name: admin.email }),
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('common.yes'),
        handler: async () => {
          await this.db.removeEmailFromAuth(admin.userId, admin.email, true);
          this.admins = await this.db.getAdmins();
          Utils.showToast(translate('settings.adminRemoved'), 'success');
        }
      }]
    });

    await alert.present();
  }

  hasChurches(): boolean {
    return this.db.churches()?.length && this.db.getPersonExtraFields().find((f => f.type === FieldType.BFECG_CHURCH)) !== undefined;
  }

  /** Members outside every circle still get "Meine Aufgaben" when tasks are assigned to them. */
  private async loadTeamAccess(): Promise<void> {
    if (!this.db.teamOrgEnabled()) {
      this.hasOwnTasks = false;
      return;
    }
    await this.db.loadTeamPerson();
    if (!this.db.isTeamLeader() && !this.db.inTeamCircle()) {
      this.hasOwnTasks = (await this.db.getMyTasks()).length > 0;
    }
  }

  getVisibleExtraFields() {
    return this.db.getPersonExtraFields().filter(f => f.visibleToPlayers);
  }

  getRoleName(): string {
    const role = this.db.tenantUser()?.role;
    const map: Partial<Record<Role, string>> = {
      [Role.ADMIN]: translate('roles.administrator'),
      [Role.RESPONSIBLE]: translate('roles.responsible'),
      [Role.HELPER]: translate('roles.helper'),
      [Role.VOICE_LEADER]: translate('settings.voiceLeader'),
      [Role.VOICE_LEADER_HELPER]: translate('roles.voiceLeaderHelper'),
      [Role.PLAYER]: translate('roles.member'),
      [Role.VIEWER]: translate('settings.viewers'),
      [Role.PARENT]: translate('roles.parent'),
      [Role.APPLICANT]: translate('roles.applicant'),
    };
    return map[role] ?? '';
  }

  get filteredChurches(): Church[] {
    const term = this.churchSearch.trim().toLowerCase();
    if (!term) { return this.churches; }
    return this.churches.filter(c => c.name.toLowerCase().includes(term));
  }

  getChurchLabel(): string {
    const value = this.userData?.additional_fields?.['bfecg_church'];
    if (value === null || value === undefined) { return translate('settings.pleaseSelect'); }
    if (value === '') { return translate('settings.notListed'); }
    const church = this.churches.find(c => c.id === value);
    return church ? church.name : translate('settings.pleaseSelect');
  }

  openChurchModal() {
    this.churchSearch = '';
    this.isChurchModalOpen = true;
  }

  selectChurch(fieldId: string, churchId: string) {
    this.userData.additional_fields[fieldId] = churchId;
    this.isChurchModalOpen = false;
  }

  getExtraFieldDisplayValue(field: any): string {
    let value = this.userData?.additional_fields?.[field.id];
    if (field.type === FieldType.BOOLEAN) {return value ? translate('common.yes') : translate('common.no');}
    if (value === undefined || value === null || value === '') {
      value = field.defaultValue;
    }
    if (value === undefined || value === null || value === '') {return '—';}
    if (field.type === FieldType.BFECG_CHURCH) {
      const church = this.db.churches()?.find(c => c.id === value);
      return church?.name || String(value);
    }
    return String(value);
  }

  async openCalendarSubscription() {
    let link = `${environment.apiUrl}/functions/v1/ical-tenant?tenantId=${this.db.tenant().id}`;
    let personal = false;
    if (!this.isAdmin) {
      const personId = await this.db.getPersonIdForTenant(this.db.tenant().id);
      if (personId) {
        link += `&personId=${personId}`;
        personal = true;
      }
    }
    // Calendar texts (status, reminders) in the app language; German is the server default.
    if (currentLanguage() !== 'de') {
      link += `&lang=${currentLanguage()}`;
    }
    const alert = await this.alertController.create({
      header: translate('settings.subscribeCalendar'),
      message: translate('settings.calendarMessage', { link }),
      // Personal feeds can leave out Termine you cancelled (default: shown with status).
      inputs: personal ? [{ type: 'checkbox', label: translate('settings.hideCancelled'), value: 'hideExcused' }] : [],
      buttons: [
        {
          text: translate('settings.copyLink'),
          handler: (values?: string[]) => {
            const finalLink = Array.isArray(values) && values.includes('hideExcused') ? `${link}&hideExcused=1` : link;
            navigator?.clipboard.writeText(finalLink);
            Utils.showToast(translate('settings.linkCopied'), 'success');
            return false;
          },
        },
        {
          text: translate('settings.openGuide'),
          handler: () => {
            Browser.open({ url: this.isIos ? 'https://support.apple.com/de-de/102301' : 'https://support.google.com/calendar/answer/37100?hl=de&co=GENIE.Platform%3DAndroid' });
          },
        },
        { text: translate('common.close'), role: 'cancel' },
      ],
    });
    await alert.present();
  }

  async openApprovePersonModal(p: Player) {
    const modal = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        existingPlayer: { ...p },
        approveMode: true,
      }
    });

    await modal.present();

    const data = await modal.onDidDismiss();

    if (data?.data?.approved) {
      this.pendingPersons = await this.db.getPendingPersons();
    }
  }

  async changeImg() {
    const additionalButtons: ActionSheetButton[] = [];

    if (this.userData.img && this.userData.img !== DEFAULT_IMAGE) {
      additionalButtons.push({
        text: translate('settings.viewPhoto'),
        handler: () => {
          this.openPassImageViewer();
        }
      }, {
        text: translate('settings.removePhoto'),
        role: 'destructive',
        handler: () => {
          this.removeImg();
        }
      });
    }

    const actionSheet = await this.actionSheetController.create({
      buttons: [{
        text: translate('settings.replacePhoto'),
        handler: () => {
          this.chooser.nativeElement.click();
        }
      }, ...additionalButtons, {
        text: translate('common.cancel')
      }]
    });

    await actionSheet.present();
  }

  async removeImg(): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('settings.removePhoto'),
      message: translate('settings.removePhotoConfirm'),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
        },
        {
          text: translate('common.remove'),
          role: 'destructive',
          handler: async () => {
            try {
              const fileName = this.userData.img.split('/').pop().replace('?quality=20', '');
              await this.db.removeImage(this.userData.id, fileName, false, this.userData.appId || '');
              this.userData.img = DEFAULT_IMAGE;
              this.closePassImageViewer();
              Utils.showToast(translate('settings.photoRemoved'), 'success');
            } catch (error) {
              Utils.showToast(translate('settings.photoRemoveFailed'), 'danger');
            }
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


  async updateUserData() {
    let churchId;

    if (this.userData.additional_fields?.bfecg_church !== this.oldUserData.additional_fields?.bfecg_church) {
      churchId = this.userData.additional_fields?.bfecg_church;
    }

    const editableFields = this.getVisibleExtraFields().filter(f => f.editableByPlayers);
    let additionalFields = this.oldUserData.additional_fields || {};
    const sharedValues: Record<string, any> = {};
    const organisationFieldIds = new Set(
      (this.db.organisation()?.additional_fields ?? []).map(field => field.id)
    );
    if (editableFields.length && this.userData.additional_fields) {
      additionalFields = { ...additionalFields };
      for (const field of editableFields) {
        if (organisationFieldIds.has(field.id)) {
          sharedValues[field.id] = this.userData.additional_fields[field.id];
          delete additionalFields[field.id];
        } else {
          additionalFields[field.id] = this.userData.additional_fields[field.id];
        }
      }
    }

    await this.db.updateSharedPersonFieldValues(this.userData, sharedValues);

    await this.db.updateProfile({
      firstName: this.userData.firstName,
      lastName: this.userData.lastName,
      phone: this.userData.phone,
      birthday: this.userData.birthday,
      img: this.userData.img,
      // Only confirm the birthday when the user actually changed it; saving
      // other profile fields must not turn a placeholder date into a real one.
      ...(this.userData.birthday !== this.oldUserData.birthday ? { correctBirthday: true } : {}),
      additional_fields: additionalFields,
    }, churchId);

    Utils.showToast(translate('settings.profileUpdated'), 'success');
  }

  async onImageSelect(evt: any) {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const imgFile: File = evt.target.files[0];

    if (imgFile) {
      if (imgFile.size > 2 * 1024 * 1024) {
        loading.dismiss();
        Utils.showToast(translate('settings.imageTooBig'), 'danger');
        return;
      }

      if (imgFile.type.substring(0, 5) === 'image') {
        const reader: FileReader = new FileReader();

        reader.readAsDataURL(imgFile);

        try {
          const url: string = await this.db.updateImage(this.userData.id, imgFile, this.userData.appId);
          this.userData.img = url;
          loading.dismiss();
          Utils.showToast(translate('settings.photoChanged'), 'success');
        } catch (error) {
          Utils.showToast(error, 'danger');
          loading.dismiss();
        }
      } else {
        loading.dismiss();
        Utils.showToast(translate('settings.photoChangeFailed'), 'danger');
      }
    }
  }

  openTelegramSupport() {
    Browser.open({ url: 'https://t.me/Eckstaedt' });
  }

  async sendQuestion(modal: IonModal) {
    const loading = await Utils.getLoadingElement();
    loading.present();

    try {
      await this.db.sendQuestion(
        this.helpQuestion,
        this.feedbackPhone
      );
      modal.dismiss();
      this.helpQuestion = '';
      this.anonymous = false;
      this.feedbackPhone = '';

      Utils.showToast(translate('settings.questionSent'), 'success');
      loading.dismiss();
    } catch (error) {
      Utils.showToast(translate('settings.questionFailed', { error: error.message }), 'danger');
      loading.dismiss();
    }
  }

  async sendFeedback(modal: IonModal) {
    const loading = await Utils.getLoadingElement();
    loading.present();

    if (this.feedbackRating === 0) {
      Utils.showToast(translate('settings.ratingRequired'), 'danger');
      loading.dismiss();
      return;
    }

    try {
      await this.db.sendFeedback(
        this.feedbackText,
        this.feedbackRating,
        this.anonymous,
        this.feedbackPhone
      );
      modal.dismiss();
      this.feedbackText = '';
      this.feedbackRating = 0;
      this.anonymous = false;
      this.feedbackPhone = '';

      Utils.showToast(translate('settings.feedbackSent'), 'success');
      loading.dismiss();
    } catch (error) {
      Utils.showToast(translate('settings.feedbackFailed', { error: error.message }), 'danger');
      loading.dismiss();
    }
  }

  async onTenantSelectionChange() {
    this.db.getSupabase().auth.updateUser({
      data: {
        currentTenantId: this.db.user.user_metadata?.currentTenantId ?? null,
        wantInstanceSelection: this.wantInstanceSelection,
      }
    });
  }

  async changePassword() {
    const alert = await this.alertController.create({
      header: translate('settings.changePassword'),
      inputs: [{
        type: 'password',
        placeholder: translate('settings.newPasswordPh'),
        name: 'password'
      }, {
        type: 'password',
        placeholder: translate('settings.repeatPasswordPh'),
        name: 'passwordConfirm'
      }],
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('settings.change'),
        handler: async (evt) => {
          if (evt.password !== evt.passwordConfirm) {
            Utils.showToast(translate('settings.passwordsMismatch'), 'danger');
            return false;
          } else if (evt.password.length < 6) {
            Utils.showToast(translate('settings.passwordTooShort'), 'danger');
            return false;
          } else {
            try {
              await this.db.changePassword(evt.password);
              Utils.showToast(translate('settings.passwordChanged'));
            } catch (error) {
              Utils.showToast(translate('settings.passwordFailed'), 'danger');
            }
          }
        }
      }]
    });

    await alert.present();
  }

  async ngOnDestroy() {
    await this.sub?.unsubscribe();
  }
}
