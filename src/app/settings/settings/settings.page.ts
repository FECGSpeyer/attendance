import { Component, OnInit, effect } from '@angular/core';
import { AlertController, IonModal, IonRouterOutlet, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { ExportPage } from 'src/app/export/export.page';
import { HistoryPage } from 'src/app/history/history.page';
import { PersonPage } from 'src/app/people/person/person.page';
import { PlanningPage } from 'src/app/planning/planning.page';
import { DbService } from 'src/app/services/db.service';
import { StatsPage } from 'src/app/stats/stats.page';
import { AttendanceType, Role } from 'src/app/utilities/constants';
import { Instrument, Parent, Person, Player } from 'src/app/utilities/interfaces';
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
  public instruments: Instrument[] = [];
  public viewers: Viewer[] = [];
  public parents: Parent[] = [];
  public isAdmin: boolean = false;
  public isSuperAdmin: boolean = false;
  public attDateString: string = format(new Date(), 'dd.MM.yyyy');
  public attDate: string = new Date().toISOString();
  public practiceStart: string;
  public practiceEnd: string;
  public shortName: string = '';
  public longName: string = ''
  public tenantId: number;
  public isHelper: boolean = false;
  public isPlayer: boolean = false;
  public isGeneral: boolean = false;
  public max: string = new Date().toISOString();
  public parentsEnabled: boolean = false;
  public customModalOptions = {
    header: 'Instanz wechseln',
    breakpoints: [0, 0.5, 1],
    initialBreakpoint: 0.5,
  };

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
    await this.initialize();
  }

  async initialize(): Promise<void> {
    this.isGeneral = this.db.tenant().type === 'general';
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
    this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.attDate = await this.db.getCurrentAttDate();
    this.tenantId = this.db.tenant().id;
    this.maintainTeachers = this.db.tenant().maintainTeachers;
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
    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
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

  getAttendanceTypePersonaText(): string {
    if (this.db.tenant().type === AttendanceType.CHOIR) {
      return "Sänger";
    } else if (this.db.tenant().type === AttendanceType.ORCHESTRA) {
      return "Spieler";
    } else {
      return "Personen";
    }
  }

  async onTenantChange(): Promise<void> {
    await this.db.setTenant(this.tenantId);
    this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
  }

  async openCreateInstanceModal() {
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

  async deleteInstance() {
    const alert = await new AlertController().create({
      header: 'Instanz löschen?',
      message: `Möchtest du ${this.db.tenant().longName} wirklich löschen? Dies kann nicht rückgängig gemacht werden!`,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Ja",
        handler: async () => {
          await this.db.deleteInstance(this.db.tenant().id);
        }
      }]
    });

    await alert.present();
  }
}
