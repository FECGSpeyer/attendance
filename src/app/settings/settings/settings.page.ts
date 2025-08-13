import { Component, OnInit, effect } from '@angular/core';
import { AlertController, IonModal, IonRouterOutlet, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';
import { ExportPage } from 'src/app/export/export.page';
import { HistoryPage } from 'src/app/history/history.page';
import { PersonPage } from 'src/app/people/person/person.page';
import { PlanningPage } from 'src/app/planning/planning.page';
import { DbService } from 'src/app/services/db.service';
import { StatsPage } from 'src/app/stats/stats.page';
import { AttendanceType, Role } from 'src/app/utilities/constants';
import { Instrument, Person, Player } from 'src/app/utilities/interfaces';
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
  public conductors: Person[] = [];
  public selConductors: number[] = [];
  public leftPlayers: Player[] = [];
  public leftConductors: Person[] = [];
  public playersWithoutAccount: Player[] = [];
  public version: string = require('../../../../package.json').version;
  public maintainTeachers: boolean = false;
  public instruments: Instrument[] = [];
  public viewers: Viewer[] = [];
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
  public max: string = new Date().toISOString();

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
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
    this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.attDate = await this.db.getCurrentAttDate();
    this.tenantId = this.db.tenant().id;
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.practiceStart = this.db.tenant().practiceStart || '18:00';
    this.practiceEnd = this.db.tenant().practiceEnd || '20:00';
    this.attDateString = format(new Date(this.attDate), 'dd.MM.yyyy');
    const allConductors: Person[] = await this.db.getConductors(true);
    this.conductors = allConductors.filter((con: Person) => !con.left);
    this.selConductors = this.conductors.filter((con: Person) => Boolean(!con.left)).map((c: Person): number => c.id);
    this.instruments = await this.db.getInstruments();
    this.leftPlayers = Utils.getModifiedPlayersForList(await this.db.getLeftPlayers(), this.instruments, [], this.instruments.find(ins => ins.maingroup)?.id);
    this.leftConductors = allConductors.filter((con: Person) => Boolean(con.left));
    this.viewers = await this.db.getViewers();
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

  createPlan(conductors: number[], timeString: string | number, modal: IonModal, perTelegram?: boolean): void {
    const shuffledConductors: string[] = this.shuffle(conductors.map((id: number): string => {
      const con: Person = this.conductors.find((c: Person): boolean => id === c.id);
      return `${con.firstName} ${con.lastName.substr(0, 1)}.`;
    }));
    const date: string = dayjs().format('DD.MM.YYYY');
    const data = [];
    const timePerUnit: number = Number(timeString) / shuffledConductors.length;

    for (let index = 0; index < conductors.length; index++) {
      const slotTime = Math.round(timePerUnit * index);
      data.push([
        String(slotTime),
        shuffledConductors[(index) % (shuffledConductors.length)],
        shuffledConductors[(index + 1) % (shuffledConductors.length)],
        shuffledConductors[(index + 2) % (shuffledConductors.length)]
      ]); // TODO attendance type
    }

    const doc = new jsPDF();
    doc.text(`${this.db.tenant().shortName} Registerprobenplan: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: this.db.tenant().type === AttendanceType.CHOIR ? [["Minuten", "Sopran", "Alt", "Tenor", "Bass"]] : this.db.tenant().shortName === "BoS" ? [['Minuten', 'Blechbläser', 'Holzbläser']] : [['Minuten', 'Streicher', 'Holzbläser', 'Sonstige']], // TODO attendance type
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });

    if (perTelegram) {
      this.db.sendPlanPerTelegram(doc.output('blob'), `Registerprobenplan_${dayjs().format('DD_MM_YYYY')}`);
    } else {
      doc.save(`${this.db.tenant().shortName} Registerprobenplan: ${date}.pdf`);
    }

    modal.dismiss();
  }

  shuffle(a: string[]) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
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
          await this.db.removeEmailFromAuth(viewer.appId, viewer.email);
          this.viewers = await this.db.getViewers();
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
}
