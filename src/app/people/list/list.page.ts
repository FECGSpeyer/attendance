import { Component, OnInit } from '@angular/core';
import { ActionSheetController, AlertController, IonItemSliding, IonRouterOutlet, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Instrument, Person, Player, PlayerHistoryEntry } from 'src/app/utilities/interfaces';
import { PersonPage } from '../person/person.page';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';
import { Utils } from 'src/app/utilities/Utils';
import { utils, WorkBook, WorkSheet, writeFile } from 'xlsx';
import { environment } from 'src/environments/environment.prod';
import { ProblemModalPage } from '../problem-modal/problem-modal.page';
import { PlayerHistoryType } from 'src/app/utilities/constants';
import { Storage } from '@ionic/storage-angular';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
})
export class ListPage implements OnInit {
  public players: Player[] = [];
  public conductors: Person[] = [];
  public playersFiltered: Player[] = [];
  public instruments: Instrument[] = [];
  public searchTerm: string = "";
  public filterOpt: string = "all";
  public sortOpt: string = "instrument";
  public viewOpts: string[] = ["instrument"];
  public isVoS: boolean = environment.shortName === "VoS";
  public showNotes = false;
  public showCritical = false;
  public showLeader = false;
  public showPaused = false;
  public showNew = false;

  constructor(
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    private db: DbService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private storage: Storage,
  ) { }

  async ngOnInit() {
    this.viewOpts = JSON.parse(await this.storage.get("viewOpts") || JSON.stringify(['instrument', 'leader', 'notes', 'critical', 'paused']));
    this.instruments = await this.db.getInstruments();
    await this.getPlayers();
    this.onViewChanged();
  }

  async getPlayers(): Promise<void> {
    this.players = await this.db.getPlayers();
    this.conductors = await this.db.getConductors();
    this.players = Utils.getModifiedPlayers(this.players, this.instruments);
    this.searchTerm = "";
    this.initializeItems();
    this.onFilterChanged();
  }

  async openModal(player?: Player): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        existingPlayer: player ? { ...player } : undefined,
        instruments: this.instruments,
      },
      backdropDismiss: false,
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data?.added) {
      await this.getPlayers();
    }
  }

  onSortChanged() {
    if (this.sortOpt === "vorname") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => a.firstName.localeCompare(b.firstName));
      return;
    }

    if (this.sortOpt === "nachname") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => a.lastName.localeCompare(b.lastName));
      return;
    }

    if (this.sortOpt === "birthdayAsc") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => new Date(a.birthday).getTime() - new Date(b.birthday).getTime());
      return;
    }

    if (this.sortOpt === "birthdayDesc") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => new Date(b.birthday).getTime() - new Date(a.birthday).getTime());
      return;
    }

    if (this.sortOpt === "instrument") {
      this.initializeItems();
      this.onFilterChanged();
    }
  }

  onFilterChanged() {
    this.searchTerm = '';

    if (this.filterOpt === 'all') {
      this.initializeItems();
      return;
    }

    this.playersFiltered = this.players.filter((player: Player) => {
      if (this.filterOpt === 'criticals') {
        return player.isCritical;
      } else if (this.filterOpt === "new") {
        return player.isNew;
      } else {
        return player.isLeader;
      }
    });
  }

  onViewChanged() {
    this.players = this.players.map((p: Player) => {
      return {
        ...p,
        text: this.getSubText(p),
      }
    });
    this.playersFiltered = this.playersFiltered.map((p: Player) => {
      return {
        ...p,
        text: this.getSubText(p),
      }
    });
    this.showLeader = this.viewOpts.includes("leader");
    this.showCritical = this.viewOpts.includes("critical");
    this.showNew = this.viewOpts.includes("new");
    this.showPaused = this.viewOpts.includes("paused");
    this.showNotes = this.viewOpts.includes("notes");

    this.storage.set("viewOpts", JSON.stringify(this.viewOpts));
  }

  getSubText(player: Player): string {
    const props: string[] = [];
    if (this.viewOpts.includes("instrument")) {
      props.push(player.instrumentName);
    }
    if (this.viewOpts.includes("birthday")) {
      props.push(dayjs(player.birthday).format("DD.MM.YYYY"));
    }
    if (this.viewOpts.includes("exercises")) {
      if (player.otherExercise) {
        props.push(player.otherExercise)
      }
    }

    return props.join(" | ");
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
        text: 'Problemfälle anzeigen',
        handler: () => {
          this.showProblemPersons();
        }
      }, {
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

  async showProblemPersons() {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: ProblemModalPage,
      breakpoints: [0.5, 1],
      initialBreakpoint: 0.5,
    });

    modal.onDidDismiss().then(async () => {
      await this.getPlayers();
    });

    await modal.present();
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
    writeFile(wb, `${environment.shortName}_Spielerliste_Stand_${date}.xlsx`);
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

  async removePlayer(player: Player, slider: IonItemSliding): Promise<void> {
    const sheet: HTMLIonActionSheetElement = await this.actionSheetController.create({
      buttons: [{
        text: "Archivieren",
        handler: (): void => {
          this.archivePlayer(player);
        },
      }, {
        text: "Entfernen",
        handler: (): void => {
          this.remove(player);
        },
      }, {
        role: 'cancel',
        text: "Abbrechen",
        handler: () => {
          slider.close();
        }
      }],
    });

    await sheet.present();
  }

  async archivePlayer(player: Player): Promise<void> {
    await this.db.archivePlayer(player.id);
    await this.getPlayers();
  }

  async remove(player: Player): Promise<void> {
    await this.db.removePlayer(player.id);
    await this.getPlayers();
  }

  async pausePlayer(player: Player, slider: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Spieler pausieren',
      subHeader: 'Gib einen Grund an.',
      inputs: [{
        type: "textarea",
        name: "reason"
      }],
      buttons: [{
        text: "Abbrechen",
        handler: () => {
          slider.close();
        }
      }, {
        text: "Pausieren",
        handler: async (evt: { reason: string }) => {
          if (!evt.reason) {
            alert.message = "Bitte gib einen Grund an!";
            return false;
          }
          const history: PlayerHistoryEntry[] = player.history;
          history.push({
            date: new Date().toISOString(),
            text: evt.reason,
            type: PlayerHistoryType.PAUSED,
          });
          try {
            await this.db.updatePlayer({
              ...player,
              paused: true,
              history,
            });
            await this.getPlayers();
          } catch (error) {
            Utils.showToast(error, "danger");
          }
          slider.close();
        }
      }]
    });

    await alert.present();
  }

  async unpausePlayer(player: Player, slider: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Spieler wieder aktivieren?',
      buttons: [{
        text: "Abbrechen",
        handler: () => {
          slider.close();
        }
      }, {
        text: "Aktivieren",
        handler: async () => {
          const history: PlayerHistoryEntry[] = player.history;
          history.push({
            date: new Date().toISOString(),
            text: "Spieler wieder aktiv",
            type: PlayerHistoryType.UNPAUSED,
          });
          try {
            await this.db.updatePlayer({
              ...player,
              paused: false,
              history,
            });
            await this.getPlayers();
          } catch (error) {
            Utils.showToast(error, "danger");
          }
          slider.close();
        }
      }]
    });

    await alert.present();
  }
}
