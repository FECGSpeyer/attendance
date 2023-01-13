import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable, CellHookData } from 'jspdf-autotable';
import { environment } from 'src/environments/environment';
import { utils, WorkBook, WorkSheet, writeFile } from 'xlsx';
import { DbService } from '../services/db.service';
import { Attendance, Player } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

@Component({
  selector: 'app-export',
  templateUrl: './export.page.html',
  styleUrls: ['./export.page.scss'],
})
export class ExportPage implements OnInit {
  public type: string = "pdf";
  public players: Player[] = [];
  public content: string = "player";
  public attendance: Attendance[] = [];

  constructor(
    private modalController: ModalController,
    private db: DbService,
  ) { }

  async ngOnInit() {
    this.players = Utils.getModifiedPlayers(await this.db.getPlayers(), await this.db.getInstruments());
  }

  dismiss() {
    this.modalController.dismiss();
  }

  export() {
    if (this.content === "player") {
      this.type === "pdf" ? this.exportPlayerPDF() : this.exportPlayerExcel();
    } else {
      this.exportType();
    }
  }

  exportPlayerExcel() {
    let row = 1;

    const date: string = dayjs().format('DD.MM.YYYY');
    const data = [['', 'Nachname', 'Vorname', 'Instrument', 'Geburtsdatum']];

    for (const user of this.players) {
      const birthday: string = dayjs(user.birthday).format('DD.MM.YYYY');
      data.push([row.toString(), user.firstName, user.lastName, user.instrumentName, birthday]);
      row++;
    }

    const ws: WorkSheet = utils.aoa_to_sheet(data);
    const wb: WorkBook = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Anwesenheit');

    writeFile(wb, `${environment.shortName}_Spielerliste_Stand_${date}.xlsx`);
  }

  exportPlayerPDF() {
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

  async exportType() {
    let row = 1;

    let attendance: Attendance[] = [...this.attendance].filter((att: Attendance) => Boolean(Object.keys(att.players).length));
    if (attendance.length > 8 && this.type === "pdf") {
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

    if (this.type === "excel") {
      data.unshift(header)
      this.exportAttExcel(data);
    } else {
      this.exportAttPDF(data, header);
    }
  }

  exportAttExcel(data) {
    const date: string = dayjs().format('DD.MM.YYYY');

    /* generate worksheet */
    const ws: WorkSheet = utils.aoa_to_sheet(data);

    /* generate workbook and add the worksheet */
    const wb: WorkBook = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Anwesenheit');

    /* save to file */
    writeFile(wb, `${environment.shortName}_Anwesenheit_Stand_${date}.xlsx`);
  }

  exportAttPDF(data, header) {
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
