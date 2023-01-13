import { Component, OnInit } from '@angular/core';
import { AlertController, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable, CellHookData } from 'jspdf-autotable';
import { environment } from 'src/environments/environment';
import { utils, WorkBook, WorkSheet, writeFile } from 'xlsx';
import { DbService } from '../services/db.service';
import { Attendance, Player } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

const DEFAULT_PLAYER_FIELDS = ["Vorname", "Nachname", "Geburtsdatum", "Instrument"];
const DEFAULT_ATT_FIELDS = ["Vorname", "Nachname", "Instrument"];

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
  public selectedFields: string[] = DEFAULT_PLAYER_FIELDS;
  public fields: string[] = ["Vorname", "Nachname", "Geburtsdatum", "Instrument"];

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.players = Utils.getModifiedPlayers(await this.db.getPlayers(), await this.db.getInstruments());
    this.attendance = (await this.db.getAttendance()).filter((att: Attendance) => dayjs(att.date).isBefore(dayjs().startOf("day")));
  }

  dismiss() {
    this.modalController.dismiss();
  }

  onSegmentChange() {
    this.selectedFields = this.content === "player" ? DEFAULT_PLAYER_FIELDS : DEFAULT_ATT_FIELDS;
  }

  handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    ev.detail.complete(this.selectedFields);
  }

  removeField(index: number, slider: HTMLIonItemSlidingElement) {
    this.selectedFields.splice(index, 1);
    slider.close();
  }

  async addExtraField() {
    const alert = await this.alertController.create({
      header: 'Feld hinzufügen',
      inputs: [{
        type: "text",
        name: "field"
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Hinzufügen",
        handler: (evt: any) => {
          this.selectedFields.push(evt.field);
        }
      }]
    });

    await alert.present();
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
    const data = [['', ...this.selectedFields]];

    for (const user of this.players) {
      data.push([row.toString(), ...this.getFieldValues(user)]);
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
      data.push([row.toString(), ...this.getFieldValues(user)]);
      row++;
    }

    const doc = new jsPDF();
    doc.text(`${environment.shortName} Spielerliste Stand: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: [['', ...this.selectedFields]],
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

    for (const att of attendance) {
      attDates.push(dayjs(att.date).format('DD.MM.YY'));
      attPerc.push(String(att.percentage ? `${att.percentage}%` : ""));
    }

    for (const player of this.players) {
      const attInfo: string[] = [];

      for (const att of attendance) {
        if (att.players[player.id] !== undefined) {
          attInfo.push(att.players[player.id] ? "X" : att.excused.includes(player.id.toString()) ? "E" : "V");
        } else {
          attInfo.push("");
        }
      }

      data.push([row.toString(), ...this.getFieldValues(player), ...attInfo.reverse()]);
      row++;
    }

    const header: string[] = ['', ...this.selectedFields, ...attDates.reverse()];

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
        } else if (data.cell.raw === "E") {
          data.cell.styles.fillColor = [255, 196, 9];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.halign = "center";
        } else if (data.cell.raw?.toString().includes("%")) {
          data.cell.styles.halign = "center";
        }
      },
    });
    doc.save(`${environment.shortName}_Anwesenheit_Stand_${date}.pdf`);
  }

  getFieldValues(player: Player) {
    const values: string[] = [];

    for (const field of this.selectedFields) {
      switch (field) {
        case "Vorname":
          values.push(player.firstName);
          break;
        case "Nachname":
          values.push(player.lastName);
          break;
        case "Geburtsdatum":
          values.push(dayjs(player.birthday).format('DD.MM.YYYY'));
          break;
        case "Instrument":
          values.push(player.instrumentName);
          break;
        default:
          values.push("");
          break;
      }
    }

    return values;
  }

}
