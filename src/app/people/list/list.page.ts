import { Component, OnInit } from '@angular/core';
import { ActionSheetController, IonRouterOutlet, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Instrument, Player } from 'src/app/utilities/interfaces';
import { PersonPage } from '../person/person.page';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';
import { Utils } from 'src/app/utilities/Utils';
import { utils, WorkBook, WorkSheet, writeFile } from 'xlsx';
import { environment } from 'src/environments/environment.prod';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
})
export class ListPage implements OnInit {
  public players: Player[] = [];
  public playersFiltered: Player[] = [];
  public instruments: Instrument[] = [];
  public searchTerm: string = "";

  constructor(
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    private db: DbService,
    private actionSheetController: ActionSheetController,
  ) { }

  async ngOnInit() {
    this.instruments = await this.db.getInstruments(true);
    await this.getPlayers(true);
  }

  async getPlayers(reload: boolean = false): Promise<void> {
    this.players = await this.db.getPlayers(reload);
    this.players = Utils.getModifiedPlayers(this.players, this.instruments);
    this.searchTerm = "";
    this.initializeItems();
  }

  async openModal(player?: Player): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        existingPlayer: player ? { ...player } : undefined,
        instruments: this.instruments,
      }
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data?.added) {
      await this.getPlayers(true);
    }
  }

  search(event: any): void {
    if (this.players) {
      this.searchTerm = '';
      this.initializeItems();

      this.searchTerm = event.srcElement.value;

      if (!this.searchTerm) {
        return;
      }

      this.playersFiltered = this.filter();
      this.playersFiltered = Utils.getModifiedPlayers(this.playersFiltered, this.instruments);
    }
  }

  filter(): Player[] {
    if (this.searchTerm === '') {
      return this.players;
    } else {
      return this.players.filter((player: Player) => {
        if (this.searchTerm) {
          if (player.firstName.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1 ||
            player.lastName.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1 ||
            player.instrumentName.toString().toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1) {
            return true;
          }
          return false;
        }
      });
    }
  }

  initializeItems(): void {
    this.playersFiltered = this.players;
  }

  async export(): Promise<void> {
    const actionSheet = await this.actionSheetController.create({
      buttons: [{
        text: 'Excel',
        handler: () => {
          this.exportExcel();
        }
      }, {
        text: 'PDF',
        handler: () => {
          this.exportPDF();
        }
      }, {
        text: 'Abbrechen',
        role: 'cancel',
      }]
    });

    await actionSheet.present();
  }

  exportExcel() {
    let row = 1;

    const date: string = dayjs().format('DD.MM.YYYY');
    const data = [['', 'Nachname', 'Vorname', 'Instrument', 'Geburtsdatum']];

    for (const user of this.players) {
      const birthday: string = dayjs(user.birthday).format('DD.MM.YYYY');
      data.push([row.toString(), user.firstName, user.lastName, user.instrumentName, birthday]);
      row++;
    }

    /* generate worksheet */
    const ws: WorkSheet = utils.aoa_to_sheet(data);

    /* generate workbook and add the worksheet */
    const wb: WorkBook = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Anwesenheit');

    /* save to file */
    writeFile(wb, `VoS_Spielerliste_Stand_${date}.xlsx`);
  }

  exportPDF() {
    let row = 1;

    const date: string = dayjs().format('DD.MM.YYYY');
    const data = [];

    for (const user of this.players) {
      const birthday: string = dayjs(user.birthday).format('DD.MM.YYYY');
      data.push([row.toString(), user.firstName, user.lastName, user.instrumentName, birthday]);
      row++;
    }

    const doc = new jsPDF();
    doc.text(`${environment.shortName} Spielerliste Stand: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: [['', 'Vorname', 'Nachname', 'Instrument', 'Geburtsdatum']],
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });
    doc.save(`${environment.shortName}_Spielerliste_Stand_${date}.pdf`);
  }

}
