import { Component, OnInit, effect } from '@angular/core';
import { AlertController, IonItemSliding, IonModal, IonRouterOutlet, isPlatform, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { ExportPage } from 'src/app/export/export.page';
import { HistoryPage } from 'src/app/history/history.page';
import { PersonPage } from 'src/app/people/person/person.page';
import { PlanningPage } from 'src/app/planning/planning.page';
import { DbService } from 'src/app/services/db.service';
import { StatsPage } from 'src/app/stats/stats.page';
import { AttendanceType, Role } from 'src/app/utilities/constants';
import { Admin, Instrument, Organisation, Parent, Person, Player, Tenant } from 'src/app/utilities/interfaces';
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
  public maintainTeachers: boolean = false;
  public showHolidays: boolean = false;
  public region: string = 'RP';
  public instruments: Instrument[] = [];
  public viewers: Viewer[] = [];
  public parents: Parent[] = [];
  public admins: Admin[] = [];
  public isAdmin: boolean = false;
  public isSuperAdmin: boolean = false;
  public attDateString: string = format(new Date(), 'dd.MM.yyyy');
  public attDate: string = new Date().toISOString();
  public practiceStart: string;
  public practiceEnd: string;
  public shortName: string = '';
  public longName: string = '';
  public isHelper: boolean = false;
  public isPlayer: boolean = false;
  public isGeneral: boolean = false;
  public max: string = new Date().toISOString();
  public parentsEnabled: boolean = false;
  public isOrchestra: boolean = false;
  public tenantsFromUser: { tenantId: number, role: Role }[] = [];
  public organisation: Organisation | null = null;
  public holidayStates = [
    { name: "Baden-Württemberg", code: "BW" },
    { name: "Bayern", code: "BY" },
    { name: "Berlin", code: "BE" },
    { name: "Brandenburg", code: "BB" },
    { name: "Bremen", code: "HB" },
    { name: "Hamburg", code: "HH" },
    { name: "Hessen", code: "HE" },
    { name: "Mecklenburg-Vorpommern", code: "MV" },
    { name: "Niedersachsen", code: "NI" },
    { name: "Nordrhein-Westfalen", code: "NW" },
    { name: "Rheinland-Pfalz", code: "RP" },
    { name: "Saarland", code: "SL" },
    { name: "Sachsen", code: "SN" },
    { name: "Sachsen-Anhalt", code: "ST" },
    { name: "Schleswig-Holstein", code: "SH" },
    { name: "Thüringen", code: "TH" },
  ];
  public isIos: boolean = false;

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    private router: Router,
  ) {
    effect(async () => {
      this.db.tenant();
      this.shortName = this.db.tenant().shortName;
      this.longName = this.db.tenant().longName;
      await this.initialize();
    });
  }

  async ngOnInit(): Promise<void> {
    this.isIos = isPlatform('ios');
    await this.initialize();
  }

  async initialize(): Promise<void> {
    this.isOrchestra = this.db.tenant().type === 'orchestra';
    this.isGeneral = this.db.tenant().type === 'general';
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
    this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.attDate = await this.db.getCurrentAttDate();
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.region = this.db.tenant().region;
    this.showHolidays = this.db.tenant().showHolidays;
    this.practiceStart = this.db.tenant().practiceStart || '18:00';
    this.practiceEnd = this.db.tenant().practiceEnd || '20:00';
    this.parentsEnabled = this.db.tenant().parents || false;
    this.attDateString = format(new Date(this.attDate), 'dd.MM.yyyy');
    const allConductors: Person[] = await this.db.getConductors(true);
    this.instruments = await this.db.getInstruments();
    this.leftPlayers = Utils.getModifiedPlayersForList(await this.db.getLeftPlayers(), this.instruments, [], this.instruments.find(ins => ins.maingroup)?.id);
    this.leftConductors = allConductors.filter((con: Person) => Boolean(con.left));
    this.viewers = await this.db.getViewers();
    if (this.parentsEnabled) {
      this.parents = await this.db.getParents();
    }
    this.admins = await this.db.getAdmins();
    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
    this.tenantsFromUser = await this.db.getUserRolesForTenants(this.db.tenantUser().userId);
    this.organisation = await this.db.getOrganisationFromTenant();
  }

  async ionViewWillEnter() {
    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
    this.viewers = await this.db.getViewers();
  }

  async logout() {
    await this.db.logout();
  }

  async saveGeneralSettings(generalModal: IonModal) {
    try {
      await this.db.updateTenantData({
        practiceStart: this.practiceStart,
        practiceEnd: this.practiceEnd,
        seasonStart: this.attDate,
        shortName: this.shortName,
        longName: this.longName,
        parents: this.parentsEnabled,
        region: this.region,
        maintainTeachers: this.maintainTeachers,
        showHolidays: this.showHolidays,
      });
      Utils.showToast("Einstellungen gespeichert", "success");

      const alert = await new AlertController().create({
        header: 'Einstellungen gespeichert',
        message: 'Die Einstellungen wurden erfolgreich gespeichert. Bitte lade die Seite neu, um die Änderungen zu sehen.',
        buttons: [{
          text: "Abbrechen"
        }, {
          text: "Neu laden",
          handler: () => {
            window?.location?.reload();
          }
        }]
      });

      await alert.present();
    } catch (error) {
      Utils.showToast("Fehler beim Aktualisieren der Einstellungen", "danger");
    }

    await generalModal.dismiss();
  }

  onAttDateChange(value: string | string[], dateModal: IonModal) {
    if (parseInt(this.attDateString.substring(0, 2), 10) !== dayjs(this.attDate).date()) {
      dateModal.dismiss();
    }

    this.attDateString = this.formatDate(value as string);
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
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
    });

    await modal.present();
  }

  async openPlayerModal(p: Player | Person) {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        existingPlayer: { ...p },
        instruments: this.instruments,
        readOnly: true,
        hasLeft: true,
      }
    });

    await modal.present();

    const data = await modal.onDidDismiss();

    if (data?.data?.activated) {
      this.leftPlayers = Utils.getModifiedPlayersForList(await this.db.getLeftPlayers(), this.instruments, [], this.instruments.find(ins => ins.maingroup)?.id);
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

    modal?.dismiss();

    await this.db.setTenant(tenantId);
    this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
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
            modal?.dismiss();
            await this.db.deleteInstance(tenant.id);
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

  async openOrganisationAlert() {
    const organisations = await this.db.getOrganisationsFromUser();

    if (organisations.length) {
      const alert = await new AlertController().create({
        header: 'Organisation auswählen',
        inputs: organisations.map((org: Organisation, index: number) => ({
          type: 'radio',
          checked: index === 0,
          label: org.name,
          value: org,
        })),
        buttons: [{
          text: "Abbrechen",
        }, {
          text: "Auswählen",
          handler: async (data: Organisation) => {
            if (data) {
              const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
              loading.present();
              try {
                await this.db.linkTenantToOrganisation(this.db.tenant().id, data.id);
                this.organisation = data;
                Utils.showToast("Die Organisation wurde erfolgreich ausgewählt.", "success");
                await loading.dismiss();
              } catch (error) {
                Utils.showToast(error.message, "danger");
                await loading.dismiss();
              }
            } else {
              alert.message = "Bitte wähle eine Organisation aus.";
              return false;
            }
          }
        }, {
          text: "Neue Organisation erstellen",
          handler: async () => {
            alert.dismiss();
            this.openCreateOrganisationAlert();
          }
        }]
      });

      await alert.present();
      return;
    }

    this.openCreateOrganisationAlert();
  }

  async openCreateOrganisationAlert() {
    const alert = await new AlertController().create({
      header: 'Organisation erstellen',
      inputs: [{
        type: "text",
        name: "name",
        placeholder: "Name eingeben...",
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
              await this.db.createOrganisation(data.name);
              Utils.showToast("Die Organisation wurde erfolgreich erstellt.", "success");
              await loading.dismiss();
              this.organisation = await this.db.getOrganisationFromTenant();
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

  async deleteOrganisation() {
    if (!this.organisation) {
      return;
    }

    const alert = await new AlertController().create({
      header: 'Organisation von Instanz trennen?',
      message: `Möchtest du die Organisation '${this.organisation.name}' wirklich von der Instanz trennen? Dies kann nicht rückgängig gemacht werden!`,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Trennen",
        handler: async () => {
          await this.db.unlinkTenantFromOrganisation(this.organisation.id);
          this.organisation = null;
          Utils.showToast("Die Organisation wurde erfolgreich von der Instanz getrennt.", "success");
        }
      }]
    });

    await alert.present();
  }
}
