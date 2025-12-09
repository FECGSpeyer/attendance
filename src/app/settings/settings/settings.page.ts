import { Component, OnInit, effect } from '@angular/core';
import { AlertController, IonItemSliding, IonModal, IonRouterOutlet, isPlatform, ModalController } from '@ionic/angular';
import { ExportPage } from 'src/app/export/export.page';
import { HistoryPage } from 'src/app/history/history.page';
import { PersonPage } from 'src/app/people/person/person.page';
import { PlanningPage } from 'src/app/planning/planning.page';
import { DbService } from 'src/app/services/db.service';
import { StatsPage } from 'src/app/stats/stats.page';
import { Role } from 'src/app/utilities/constants';
import { Admin, Group, Organisation, Parent, Person, Player, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { Viewer } from '../../utilities/interfaces';
import { Router } from '@angular/router';
import { RegisterPage } from 'src/app/register/register.page';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit {
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

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    private router: Router,
  ) {
    effect(async () => {
      this.db.tenant();
      await this.initialize();
    });
  }

  async ngOnInit(): Promise<void> {
    this.isIos = isPlatform('ios');
    await this.initialize();
  }

  async initialize(): Promise<void> {
    this.isGeneral = this.db.tenant().type === 'general';
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
    this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.maintainTeachers = this.db.tenant().maintainTeachers;

    this.pendingPersons = await this.db.getPendingPersons();
    const allConductors: Person[] = await this.db.getConductors(true);
    this.leftPlayers = Utils.getModifiedPlayersForList(
      await this.db.getLeftPlayers(),
      this.db.groups(),
      [],
      this.db.attendanceTypes(),
      this.db.getMainGroup()?.id,
      this.db.tenant().additional_fields
    );
    this.leftConductors = allConductors.filter((con: Person) => Boolean(con.left));
    this.viewers = await this.db.getViewers();
    this.parentsEnabled = this.db.tenant().parents || false;
    if (this.parentsEnabled) {
      this.parents = await this.db.getParents();
    }
    this.admins = await this.db.getAdmins();
    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
    this.tenantsFromUser = await this.db.getUserRolesForTenants(this.db.tenantUser().userId);
  }

  async ionViewWillEnter() {
    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
    this.viewers = await this.db.getViewers();
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
        this.db.tenant().additional_fields
      );
    }
  }

  async showAlertForAccountsCreation() {
    const alert = await new AlertController().create({
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
    const alert = await new AlertController().create({
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
    const alert = await new AlertController().create({
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
    const alert = await new AlertController().create({
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
    const alert = await new AlertController().create({
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

    const alert = await new AlertController().create({
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

  canDeleteTenant(tenant: Tenant): boolean {
    const found = this.tenantsFromUser.find(t => t.tenantId === tenant.id);
    return found?.role === Role.ADMIN && !this.db.isDemo();
  }

    async openAdminsAlert() {
    const alert = await new AlertController().create({
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

  async removeAdmin(admin: Admin): Promise<void> {
    if (admin.userId === this.db.tenantUser().userId) {
      Utils.showToast("Du kannst dich nicht selbst entfernen.", "danger");
      return;
    }

    const alert = await new AlertController().create({
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

  async openCalendarSubscription() {
    const link = `https://n8n.srv1053762.hstgr.cloud/webhook/attendix?tenantId=${this.db.tenant().id}`;
    const alert = await new AlertController().create({
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
}
