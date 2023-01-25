import { Component, OnInit } from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';
import { ExportPage } from 'src/app/export/export.page';
import { HistoryPage } from 'src/app/history/history.page';
import { PersonPage } from 'src/app/people/person/person.page';
import { DbService } from 'src/app/services/db.service';
import { StatsPage } from 'src/app/stats/stats.page';
import { Instrument, Person, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { environment } from 'src/environments/environment';

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
  public showTeachers: boolean = environment.showTeachers;
  public instruments: Instrument[] = [];

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
  ) { }

  async ngOnInit(): Promise<void> {
    const allConductors: Person[] = await this.db.getConductors(true);
    this.conductors = allConductors.filter((con: Person) => !con.left);
    this.selConductors = this.conductors.filter((con: Person) => Boolean(!con.left)).map((c: Person): number => c.id);
    this.instruments = await this.db.getInstruments();
    this.leftPlayers = Utils.getModifiedPlayers(await this.db.getLeftPlayers(), this.instruments);
    this.leftConductors = allConductors.filter((con: Person) => Boolean(con.left));
  }

  async ionViewWillEnter() {
    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
  }

  async logout() {
    await this.db.logout();
  }

  createPlan(conductors: number[], timeString: string | number): void {
    const shuffledConductors: string[] = this.shuffle(conductors.map((id: number): string => {
      const con: Person = this.conductors.find((c: Person): boolean => id === c.id);
      return `${con.firstName} ${con.lastName.substr(0, 1)}.`;
    }));
    const date: string = dayjs().format('DD.MM.YYYY');
    const data = [];
    const timePerUnit: number = Number(timeString) / shuffledConductors.length;

    for (let index = 0; index < conductors.length; index++) {
      const slotTime = Math.round(timePerUnit * index);
      if (environment.shortName === "BoS") {
        data.push([
          String(slotTime),
          shuffledConductors[(index) % (shuffledConductors.length)],
          shuffledConductors[(index + 1) % (shuffledConductors.length)]
        ]);
      } else {
        data.push([
          String(slotTime),
          shuffledConductors[(index) % (shuffledConductors.length)],
          shuffledConductors[(index + 1) % (shuffledConductors.length)],
          shuffledConductors[(index + 2) % (shuffledConductors.length)]
        ]);
      }
    }

    const doc = new jsPDF();
    doc.text(`${environment.shortName} Registerprobenplan: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: environment.shortName === "BoS" ? [['Minuten', 'Blechbläser', 'Holzbläser']] : [['Minuten', 'Streicher', 'Holzbläser', 'Sonstige']],
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });
    doc.save(`${environment.shortName} Registerprobenplan: ${date}.pdf`);
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

  async openPlayerModal(p: Player, isConductor: boolean) {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        existingPlayer: { ...p },
        instruments: this.instruments,
        readOnly: true,
        isConductor,
      }
    });

    await modal.present();
  }

  async createAccounts() {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(99999999);

    loading.present();

    for (let player of this.playersWithoutAccount) {
      await this.db.createAccount(player);
    }

    Utils.showToast("Die Accounts wurden erfolgreich angelegt", "success");

    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();

    loading.dismiss();
  }

}
