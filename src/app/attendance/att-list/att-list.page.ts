import { Component, OnInit } from '@angular/core';
import { ActionSheetController, AlertController, IonModal, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Attendance, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { AttPage } from '../att/att.page';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable, CellHookData } from 'jspdf-autotable';
import { utils, WorkBook, WorkSheet, writeFile } from 'xlsx';
import { environment } from 'src/environments/environment';
require('dayjs/locale/de');

@Component({
  selector: 'app-att-list',
  templateUrl: './att-list.page.html',
  styleUrls: ['./att-list.page.scss'],
})
export class AttListPage implements OnInit {
  public date: string = new Date().toISOString();
  public dateString: string = format(new Date(), 'dd.MM.yyyy');
  public type: string = 'uebung';
  public attendance: Attendance[] = [];
  public isConductor: boolean = false;
  public notes: string;
  public typeInfo: string;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
  ) { }

  async logout() {
    await this.db.logout();
  }

  async ngOnInit() {
    await this.getAttendance(true);
    this.db.authenticationState.subscribe((state: { isConductor: boolean, isPlayer: boolean }) => {
      this.isConductor = state.isConductor;
    });
  }

  async getAttendance(reload: boolean = false): Promise<void> {
    this.attendance = (await this.db.getAttendance(reload)).map((att: Attendance): Attendance => {
      return {
        ...att,
        percentage: Object.keys(att.players).length ? Utils.getPercentage(att.players) : undefined,
      }
    });
  }

  async remove(id: number): Promise<void> {
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Möchtest du die Anwesenheit wirklich entfernen?",
      buttons: [{
        text: "Abrrechen",
      }, {
        text: "Fortfahren",
        handler: async (): Promise<void> => {
          await this.db.removeAttendance(id);
          await this.getAttendance(true);
        }
      }]
    });

    await alert.present();
  }

  async addAttendance(modal: IonModal): Promise<void> {
    await this.db.addAttendance({
      date: this.date,
      type: this.type,
      criticalPlayers: [],
      notes: this.notes,
      typeInfo: this.typeInfo,
      playerNotes: {},
    });

    await modal.dismiss();
    await this.getAttendance(true);
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  getTypeText(key: string, notes: string): string {
    if (key === "sonstiges" && notes) {
      return notes;
    }

    return Utils.getTypeText(key);
  }

  getReadableDate(date: string): string {
    dayjs.locale("de");
    return dayjs(date).format("ddd, DD.MM.YYYY");
  }

  async openAttendance(attendance): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: AttPage,
      backdropDismiss: false,
      componentProps: {
        attendance,
      }
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data?.updated) {
      await this.getAttendance(true);
    }
  }

  async export(): Promise<void> {
    const actionSheet = await this.actionSheetController.create({
      buttons: [{
        text: 'Excel',
        handler: () => {
          this.exportType("excel");
        }
      }, {
        text: 'PDF',
        handler: () => {
          this.exportType("pdf");
        }
      }, {
        text: 'Abbrechen',
        role: 'cancel',
      }]
    });

    await actionSheet.present();
  }

  async exportType(type: string) {
    let row = 1;

    let attendance: Attendance[] = [...this.attendance].filter((att: Attendance) => Boolean(Object.keys(att.players).length));
    if (attendance.length > 8 && type === "pdf") {
      attendance.length = 8;
    }
    const attDates: string[] = [];
    const attPerc: string[] = [];
    const data = [];
    const players: Player[] = Utils.getModifiedPlayers((await this.db.getPlayers()), (await this.db.getInstruments()));

    for (const att of attendance) {
      attDates.push(dayjs(att.date).format('DD.MM.YY'));
      attPerc.push(String(att.percentage ? `${att.percentage}%` : ""));
    }

    for (const player of players) {
      const attInfo: string[] = [];

      for (const att of attendance) {
        if (att.players[player.id] !== undefined) {
          attInfo.push(att.players[player.id] ? "X" : "V");
        } else {
          attInfo.push("");
        }
      }

      data.push([row.toString(), player.firstName, player.lastName, player.instrumentName, ...attInfo.reverse()]);
      row++;
    }

    data.push(["", "", "", "", ...attPerc.reverse()]);

    const header: string[] = ['', 'Nachname', 'Vorname', 'Instrument', ...attDates.reverse()];

    if (type === "excel") {
      data.unshift(header)
      this.exportExcel(data);
    } else {
      this.exportPDF(data, header);
    }
  }

  exportExcel(data) {
    const date: string = dayjs().format('DD.MM.YYYY');

    /* generate worksheet */
    const ws: WorkSheet = utils.aoa_to_sheet(data);

    /* generate workbook and add the worksheet */
    const wb: WorkBook = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Anwesenheit');

    /* save to file */
    writeFile(wb, `${environment.shortName}_Anwesenheit_Stand_${date}.xlsx`);
  }

  exportPDF(data, header) {
    const date: string = dayjs().format('DD.MM.YYYY');
    const doc = new jsPDF();

    doc.text(`${environment.shortName} Anwesenheit Stand: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: [header],
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        fontSize: 8,
        halign: 'center',
        fillColor: [0, 82, 56]
      },
      bodyStyles: {
        fontSize: 8,
      },
      didParseCell: (data: CellHookData) => {
        if (data.cell.raw === "V") {
          data.cell.styles.fillColor = [178, 34, 34];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.halign = "center";
        } else if (data.cell.raw === "X") {
          data.cell.styles.fillColor = [50, 205, 50];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.halign = "center";
        } else if (data.cell.raw.toString().includes("%")) {
          data.cell.styles.halign = "center";
        }
      },
    });
    doc.save(`${environment.shortName}_Anwesenheit_Stand_${date}.pdf`);
  }
}
