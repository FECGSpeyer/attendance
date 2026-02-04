import { Component, OnInit } from '@angular/core';
import { AlertController, IonItemSliding, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
// jsPDF and xlsx are lazy-loaded for better initial bundle size
import { DbService } from '../services/db.service';
import { Attendance, Player } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

const DEFAULT_PLAYER_FIELDS = ["Vorname", "Nachname", "Geburtsdatum", "Gruppe"];
const DEFAULT_ATT_FIELDS = ["Vorname", "Nachname", "Gruppe"];

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
  public fields: string[] = ["Vorname", "Nachname", "Geburtsdatum", "Gruppe"];

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.players = Utils.getModifiedPlayersForList(
      await this.db.getPlayers(),
      this.db.groups(),
      [],
      this.db.attendanceTypes(),
      this.db.getMainGroup()?.id,
      this.db.tenant().additional_fields,
      this.db.churches()
    );
    this.attendance = (await this.db.getAttendance(false, true)).filter((att: Attendance) => dayjs(att.date).isBefore(dayjs().startOf("day")));
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

  removeField(index: number, slider: IonItemSliding) {
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
    const shortName: string = this.db.tenant().shortName;
    if (this.content === "player") {
      this.type === "pdf" ? this.exportPlayerPDF(shortName) : this.exportPlayerExcel(shortName);
    } else {
      this.exportType(shortName);
    }
  }

  async exportPlayerExcel(shortName: string) {
    const { utils, writeFile } = await import('xlsx');
    let row = 1;

    const date: string = dayjs().format('DD.MM.YYYY');
    const data = [['', ...this.selectedFields]];

    for (const user of this.players) {
      data.push([row.toString(), ...this.getFieldValues(user)]);
      row++;
    }

    const ws = utils.aoa_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Anwesenheit');

    writeFile(wb, `${shortName}_Spielerliste_Stand_${date}.xlsx`);
  }

  async exportPlayerPDF(shortName: string) {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    let row = 1;

    const date: string = dayjs().format('DD.MM.YYYY');
    const data = [];

    for (const user of this.players) {
      data.push([row.toString(), ...this.getFieldValues(user)]);
      row++;
    }

    const doc = new jsPDF();
    doc.text(`${shortName} Spielerliste Stand: ${date}`, 14, 25);
    (doc as any).autoTable({
      head: [['', ...this.selectedFields]],
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });
    doc.save(`${shortName}_Spielerliste_Stand_${date}.pdf`);
  }

  async exportType(shortName: string) {
    let row = 1;

    let attendance: Attendance[] = [...this.attendance].filter((att: Attendance) => Boolean(Object.keys(att.persons).length));
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
        if (att.persons.find((p) => p.person_id === player.id)) {
          attInfo.push(Utils.getAttText(att.persons.find((p) => p.person_id === player.id)));
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
      await this.exportAttExcel(data, shortName);
    } else {
      await this.exportAttPDF(data, header, shortName);
    }
  }

  async exportAttExcel(data: any[], shortName: string) {
    const { utils, writeFile } = await import('xlsx');
    const date: string = dayjs().format('DD.MM.YYYY');

    /* generate worksheet */
    const ws = utils.aoa_to_sheet(data);

    /* generate workbook and add the worksheet */
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Anwesenheit');

    /* save to file */
    writeFile(wb, `${shortName}_Anwesenheit_Stand_${date}.xlsx`);
  }

  async exportAttPDF(data: any[], header: string[], shortName: string) {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const date: string = dayjs().format('DD.MM.YYYY');
    const doc = new jsPDF();

    doc.text(`${shortName} Anwesenheit Stand: ${date}`, 14, 25);
    (doc as any).autoTable({
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
      didParseCell: (cellData: any) => {
        if (cellData.cell.raw === "A") {
          cellData.cell.styles.fillColor = [178, 34, 34];
          cellData.cell.styles.textColor = [255, 255, 255];
          cellData.cell.styles.halign = "center";
        } else if (cellData.cell.raw === "X") {
          cellData.cell.styles.fillColor = [50, 205, 50];
          cellData.cell.styles.textColor = [255, 255, 255];
          cellData.cell.styles.halign = "center";
        } else if (cellData.cell.raw === "E") {
          cellData.cell.styles.fillColor = [255, 196, 9];
          cellData.cell.styles.textColor = [255, 255, 255];
          cellData.cell.styles.halign = "center";
        } else if (cellData.cell.raw === "L") {
          cellData.cell.styles.fillColor = [0, 191, 255];
          cellData.cell.styles.textColor = [255, 255, 255];
          cellData.cell.styles.halign = "center";
        } else if (cellData.cell.raw === "N") {
          cellData.cell.styles.fillColor = [220, 220, 220];
          cellData.cell.styles.textColor = [255, 255, 255];
          cellData.cell.styles.halign = "center";
        } else if (cellData.cell.raw?.toString().includes("%")) {
          cellData.cell.styles.halign = "center";
        }
      },
    });
    doc.save(`${shortName}_Anwesenheit_Stand_${date}.pdf`);
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
        case "Gruppe":
          values.push(player.groupName);
          break;
        case "Testergebnis":
          values.push(player.testResult || "Kein Ergebnis");
          break;
        default:
          values.push("");
          break;
      }
    }

    return values;
  }

}
