import { Component, OnInit } from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';
import { HistoryPage } from 'src/app/history/history.page';
import { DbService } from 'src/app/services/db.service';
import { Person, Player } from 'src/app/utilities/interfaces';
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
  public version: string = require('../../../../package.json').version;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
  ) { }

  async ngOnInit(): Promise<void> {
    this.conductors = await this.db.getConductors(true);
    this.selConductors = this.conductors.map((c: Person): number => c.id);
    this.leftPlayers = Utils.getModifiedPlayers(await this.db.getLeftPlayers(), await this.db.getInstruments(true));
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
      data.push([
        String(slotTime),
        shuffledConductors[(index) % (shuffledConductors.length)],
        shuffledConductors[(index + 1) % (shuffledConductors.length)],
        shuffledConductors[(index + 2) % (shuffledConductors.length)]
      ]);
    }

    const doc = new jsPDF();
    doc.text(`${environment.shortName} Registerprobenplan: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: [['Minuten', 'Streicher', 'Holzbläser', 'Sonstige']],
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

  async addUser(email: string, password: string) {
    const res: boolean = await this.db.register(email, password);
    if (res) {
      await Utils.showToast("Der User wurde erfolgreich erstellt");
    } else {
      await Utils.showToast("Fehler beim Erstellen, versuche es noch einmal", "danger");
    }
  }

}
