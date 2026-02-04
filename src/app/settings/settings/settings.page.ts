import { Component, ElementRef, OnDestroy, OnInit, ViewChild, effect } from '@angular/core';
import { ActionSheetController, AlertButton, AlertController, IonItemSliding, IonModal, IonRouterOutlet, isPlatform, ModalController } from '@ionic/angular';
import { ExportPage } from 'src/app/export/export.page';
import { HistoryPage } from 'src/app/history/history.page';
import { PersonPage } from 'src/app/people/person/person.page';
import { PlanningPage } from 'src/app/planning/planning.page';
import { DbService } from 'src/app/services/db.service';
import { StatsPage } from 'src/app/stats/stats.page';
import { DEFAULT_IMAGE, FieldType, Role } from 'src/app/utilities/constants';
import { Admin, Church, Parent, Person, Player, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { Viewer } from '../../utilities/interfaces';
import { Router } from '@angular/router';
import { RegisterPage } from 'src/app/register/register.page';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
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
  public isAdmin: boolean = false;
  public isSuperAdmin: boolean = false;
  public isHelper: boolean = false;
  public isPlayer: boolean = false;
  public isGeneral: boolean = false;
  public tenantsFromUser: { tenantId: number, role: Role }[] = [];
  public isIos: boolean = false;
  public isInstancesModalOpen: boolean = false;
  public parentsEnabled: boolean = false;
  public maintainTeachers: boolean = false;
  public pendingPersons: Player[] = [];
  public isApplicant: boolean = false;
  public churches: Church[] = [];
  public userData: Person | null = null;
  public oldUserData: Person | null = null;
  public isImageViewerOpen: boolean = false;
  public max: string = new Date().toISOString();
  public helpQuestion: string = '';
  public feedbackText: string = '';
  public anonymous: boolean = false;
  public feedbackRating: number = 0;
  public feedbackPhone: string = '';
  private sub: RealtimeChannel | null = null;
  public versionHistory = require('../../../../version-history.json').versions;
  public wantInstanceSelection: boolean = false;
  public showPwaHint: boolean = false;

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    private router: Router,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
  ) {
    effect(async () => {
      this.db.tenant();
      await this.initialize();
    });
  }

  async ngOnInit(): Promise<void> {
    this.isIos = isPlatform('ios');
    this.checkPwaInstallation();
    await this.initialize();
  }

  async initialize(): Promise<void> {
    this.isGeneral = this.db.tenant().type === 'general';
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
    this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.isApplicant = this.db.tenantUser().role === Role.APPLICANT;
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.parentsEnabled = this.db.tenant().parents || false;

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
      this.db.isBeta() ? this.db.getChurches() : Promise.resolve([]),
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
      this.db.tenant().additional_fields,
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
      this.userData = { ...this.oldUserData };
    }

    this.wantInstanceSelection = this.db.user.user_metadata?.wantInstanceSelection || false;

    this.subscribe();
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

  checkPwaInstallation(): void {
    const isMobile = isPlatform('ios') || isPlatform('android');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    const dismissed = localStorage.getItem('pwaHintDismissed');

    if (isMobile && !isStandalone && !dismissed) {
      this.showPwaHint = true;
    }
  }

  dismissPwaHint(): void {
    this.showPwaHint = false;
    localStorage.setItem('pwaHintDismissed', 'true');
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
      cssClass: "planningModal",
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
        this.db.tenant().additional_fields,
        this.db.churches()
      );
    }
  }

  async showAlertForAccountsCreation() {
    const alert = await this.alertController.create({
      header: 'Accounts anlegen',
      message: `Folgende Accounts werden angelegt: ${this.playersWithoutAccount.map((p: Player) => `${p.firstName} ${p.lastName}`).join(', ')}`,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Fortfahren",
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
      for (let player of this.playersWithoutAccount) {
        await this.db.createAccount(player);
      }
    } catch (error) {
      this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
      Utils.showToast(`Fehler beim Erstellen der Accounts: ${error.message}`, "danger");
      loading.dismiss();
      return;
    }

    Utils.showToast("Die Accounts wurden erfolgreich angelegt", "success");

    loading.dismiss();
  }

  async removeViewer(viewer: Viewer): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Beobachter entfernen?',
      message: `Möchtest du ${viewer.firstName} wirklich entfernen?`,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Ja",
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
      header: 'Elternteil entfernen?',
      message: `Möchtest du ${parent.firstName} wirklich entfernen?`,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Ja",
        handler: async () => {
          await this.db.deleteParent(parent);
          this.parents = await this.db.getParents();
        }
      }]
    });

    await alert.present();
  }

  async onTenantChange(tenantId: number, modal: IonModal): Promise<void> {
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
      header: 'Beobachter hinzufügen',
      inputs: [{
        type: "email",
        name: "email",
        placeholder: "E-Mail-Adresse",
      }, {
        name: "firstName",
        placeholder: "Vorname",
      }, {
        name: "lastName",
        placeholder: "Nachname",
      }],
      buttons: [{
        text: "Abbrechen",
      }, {
        text: "Einladen",
        handler: async (data: { email: string, firstName: string, lastName: string }) => {
          if (Utils.validateEmail(data.email) && data.firstName.length && data.lastName.length) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createViewer(data);
              this.viewers = await this.db.getViewers();
              Utils.showToast("Der Benutzer wurde erfolgreich angelegt.", "success");
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, "danger");
              await loading.dismiss();
            }
          } else {
            alert.message = "Bitte gib gültige Werte ein.";
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  async openParentsAlert() {
    const alert = await this.alertController.create({
      header: 'Elternteil hinzufügen',
      inputs: [{
        type: "email",
        name: "email",
        placeholder: "E-Mail-Adresse",
      }, {
        name: "firstName",
        placeholder: "Vorname",
      }, {
        name: "lastName",
        placeholder: "Nachname",
      }],
      buttons: [{
        text: "Abbrechen",
      }, {
        text: "Einladen",
        handler: async (data: { email: string, firstName: string, lastName: string }) => {
          if (Utils.validateEmail(data.email) && data.firstName.length && data.lastName.length) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createParent(data);
              this.parents = await this.db.getParents();
              Utils.showToast("Der Benutzer wurde erfolgreich angelegt.", "success");
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, "danger");
              await loading.dismiss();
            }
          } else {
            alert.message = "Bitte gib gültige Werte ein.";
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
      Utils.showToast("Du kannst diese Instanz nicht löschen.", "danger");
      return;
    }

    const message = `Möchtest du die Instanz '${tenant.longName}' wirklich löschen? Dies kann nicht rückgängig gemacht werden! Wenn du die Instanz wirklich löschen willst, dann gebe den Namen der Instanz ein:`;

    const alert = await this.alertController.create({
      header: 'Instanz löschen?',
      message,
      inputs: [{
        type: "text",
        placeholder: "Name der Instanz eingeben...",
        name: "name"
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Löschen",
        handler: async (evt) => {
          if (evt.name === tenant.longName) {
            const loading = await Utils.getLoadingElement(9999, 'Instanz wird entfernt...');
            await loading.present();
            modal?.dismiss();
            await this.db.deleteInstance(tenant.id);
            await loading.dismiss();
          } else {
            alert.message = "Der eingegebene Name ist nicht korrekt.";
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
      await Utils.showToast(`Die Instanz '${tenant.longName}' wurde ${!tenant.favorite ? 'als Favorit gesetzt' : 'als Favorit entfernt'}.`, 'success', 3000);
    } catch (error) {
      await loading.dismiss();
    }
  }

  canDeleteTenant(tenant: Tenant): boolean {
    const found = this.tenantsFromUser.find(t => t.tenantId === tenant.id);
    return found?.role === Role.ADMIN && !this.db.isDemo();
  }

  async openAdminsAlert() {
    const alert = await this.alertController.create({
      header: 'Admin hinzufügen',
      inputs: [{
        type: "email",
        name: "email",
        placeholder: "E-Mail-Adresse",
      }],
      buttons: [{
        text: "Abbrechen",
      }, {
        text: "Hinzufügen",
        handler: async (data: { email: string }) => {
          if (Utils.validateEmail(data.email)) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createAdmin(data.email);
              this.admins = await this.db.getAdmins();
              Utils.showToast("Der Admin wurde erfolgreich hinzugefügt.", "success");
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, "danger");
              await loading.dismiss();
            }
          } else {
            alert.message = "Bitte gib gültige Werte ein.";
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  async openChurchInput() {
    const alert = await this.alertController.create({
      header: 'Gemeinde hinzufügen',
      inputs: [{
        type: "text",
        name: "name",
        placeholder: "Name der Gemeinde",
      }],
      buttons: [{
        text: "Abbrechen",
      }, {
        text: "Hinzufügen",
        handler: async (data: { name: string }) => {
          if (data.name.length) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createChurch(data.name);
              Utils.showToast("Die Gemeinde wurde erfolgreich hinzugefügt.", "success");
              this.churches = await this.db.getChurches();
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, "danger");
              await loading.dismiss();
            }
          } else {
            alert.message = "Bitte gib gültige Werte ein.";
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  async removeAdmin(admin: Admin): Promise<void> {
    if (admin.userId === this.db.tenantUser().userId) {
      Utils.showToast("Du kannst dich nicht selbst entfernen.", "danger");
      return;
    }

    const alert = await this.alertController.create({
      header: 'Admin entfernen?',
      message: `Möchtest du ${admin.email} wirklich entfernen?`,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Ja",
        handler: async () => {
          await this.db.removeEmailFromAuth(admin.userId, admin.email, true);
          this.admins = await this.db.getAdmins();
          Utils.showToast("Der Admin wurde erfolgreich entfernt.", "success");
        }
      }]
    });

    await alert.present();
  }

  hasChurches(): boolean {
    return this.db.churches()?.length && this.db.tenant()?.additional_fields?.find((f => f.type === FieldType.BFECG_CHURCH)) !== undefined;
  }

  async openCalendarSubscription() {
    const link = `https://n8n.srv1053762.hstgr.cloud/webhook/attendix?tenantId=${this.db.tenant().id}`;
    const alert = await this.alertController.create({
      header: 'Kalender abonnieren',
      message: `Kopiere den folgenden Link in deine Kalender-App, um die Termine zu abonnieren:\n\n${link}`,
      buttons: [{
        text: "Link kopieren",
        handler: () => {
          navigator?.clipboard.writeText(link);
          Utils.showToast("Der Link wurde in die Zwischenablage kopiert", "success");
          return false;
        }
      }, {
        text: "Anleitung öffen",
        handler: () => {
          window.open(this.isIos ? "https://support.apple.com/de-de/102301" : "https://support.google.com/calendar/answer/37100?hl=de&co=GENIE.Platform%3DAndroid", "_blank");
        }
      }, {
        text: "Schließen",
        role: "destructive"
      }]
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
    const additionalButtons: AlertButton[] = [];

    if (this.userData.img !== DEFAULT_IMAGE) {
      additionalButtons.push({
        text: 'Passbild ansehen',
        handler: () => {
          this.isImageViewerOpen = true;
        }
      });
    }

    const actionSheet = await this.actionSheetController.create({
      buttons: [{
        text: 'Passbild ersetzen',
        handler: () => {
          this.chooser.nativeElement.click();
        }
      }, ...additionalButtons, {
        text: 'Abbrechen'
      }]
    });

    await actionSheet.present();
  }

  async updateUserData() {
    let churchId;

    if (this.userData.additional_fields?.bfecg_church !== this.oldUserData.additional_fields?.bfecg_church) {
      churchId = this.userData.additional_fields?.bfecg_church;
    }

    await this.db.updateProfile({
      firstName: this.userData.firstName,
      lastName: this.userData.lastName,
      phone: this.userData.phone,
      birthday: this.userData.birthday,
      img: this.userData.img,
      correctBirthday: true,
    }, churchId);

    Utils.showToast("Die Profildaten wurden erfolgreich aktualisiert.", "success");
  }

  async onImageSelect(evt: any) {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const imgFile: File = evt.target.files[0];

    if (imgFile) {
      if (imgFile.size > 2 * 1024 * 1024) {
        loading.dismiss();
        Utils.showToast("Das Bild darf maximal 2MB groß sein.", "danger");
        return;
      }

      if (imgFile.type.substring(0, 5) === 'image') {
        const reader: FileReader = new FileReader();

        reader.readAsDataURL(imgFile);

        try {
          const url: string = await this.db.updateImage(this.userData.id, imgFile, this.userData.appId);
          this.userData.img = url;
          loading.dismiss();
          Utils.showToast("Das Passbild wurde erfolgreich geändert.", "success");
        } catch (error) {
          Utils.showToast(error, "danger");
          loading.dismiss();
        }
      } else {
        loading.dismiss();
        Utils.showToast("Fehler beim ändern des Passbildes, versuche es später erneut", "danger");
      }
    }
  }

  openTelegramSupport() {
    window.open("https://t.me/Eckstaedt", "_blank");
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

      Utils.showToast("Deine Anfrage wurde erfolgreich gesendet. Wir melden uns so schnell wie möglich bei dir.", "success");
      loading.dismiss();
    } catch (error) {
      Utils.showToast("Fehler beim Senden der Anfrage: " + error.message, "danger");
      loading.dismiss();
    }
  }

  async sendFeedback(modal: IonModal) {
    const loading = await Utils.getLoadingElement();
    loading.present();

    if (this.feedbackRating === 0) {
      Utils.showToast("Bitte gib eine Bewertung ab.", "danger");
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

      Utils.showToast("Dein Feedback wurde erfolgreich gesendet. Vielen Dank!", "success");
      loading.dismiss();
    } catch (error) {
      Utils.showToast("Fehler beim Senden des Feedbacks: " + error.message, "danger");
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
      header: 'Passwort ändern',
      inputs: [{
        type: "password",
        placeholder: "Neues Passwort eingeben...",
        name: "password"
      }, {
        type: "password",
        placeholder: "Passwort wiederholen...",
        name: "passwordConfirm"
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Ändern",
        handler: async (evt) => {
          if (evt.password !== evt.passwordConfirm) {
            Utils.showToast("Die Passwörter stimmen nicht überein.", "danger");
            return false;
          } else if (evt.password.length < 6) {
            Utils.showToast("Das Passwort muss mindestens 6 Zeichen lang sein.", "danger");
            return false;
          } else {
            try {
              await this.db.changePassword(evt.password);
              Utils.showToast("Das Passwort wurde erfolgreich geändert");
            } catch (error) {
              Utils.showToast("Fehler beim Ändern deines Passworts. Bitte versuche es später erneut.", "danger");
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
