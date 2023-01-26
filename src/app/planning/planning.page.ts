import { Component, OnInit } from '@angular/core';
import { AlertController, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import jsPDF from 'jspdf';
import { DbService } from '../services/db.service';
import { Attendance, History, Player, Song } from '../utilities/interfaces';
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';
import { Utils } from '../utilities/Utils';

interface FieldSelection {
  id: string;
  name: string;
  time: string;
}

@Component({
  selector: 'app-planning',
  templateUrl: './planning.page.html',
  styleUrls: ['./planning.page.scss'],
})
export class PlanningPage implements OnInit {
  public type: string = "pdf";
  public songs: Song[] = [];
  public history: History[] = [];
  public selectedFields: FieldSelection[] = [];
  public attendances: Attendance[] = [];
  public attendance: number;
  public selectedSongs: string[] = [];
  public time: string = dayjs().utc().hour(18).minute(0).format("YYYY-MM-DDTHH:mm");
  public end: string;

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.songs = await this.db.getSongs();
    this.history = await this.db.getUpcomingHistory();
    this.attendances = (await this.db.getUpcomingAttendances()).reverse();
    if (this.attendances.length) {
      this.attendance = this.attendances[0].id;
    }

    if (this.history.length) {
      for (let his of this.history) {
        const song: Song = this.songs.find((s: Song): boolean => s.id === his.songId);
        this.selectedSongs.push(String(song.id));
      }

      this.onSongsChange();
    }
  }

  dismiss() {
    this.modalController.dismiss();
  }

  onSegmentChange() {
    this.selectedFields = [];
  }

  handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    ev.detail.complete(this.selectedFields);
  }

  removeField(index: number, slider: HTMLIonItemSlidingElement) {
    this.selectedFields.splice(index, 1);
    slider.close();
    this.calculateEnd();
  }

  async addExtraField() {
    const alert = await this.alertController.create({
      header: 'Feld hinzufügen',
      inputs: [{
        type: "textarea",
        name: "field",
        placeholder: "Werknummer oder Freitext eingeben..."
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Hinzufügen",
        handler: (evt: any) => {
          if (!isNaN(evt.field) && Boolean(this.songs.find((song: Song) => song.number === Number(evt.field)))) {
            const song: Song = this.songs.find((song: Song) => song.number === Number(evt.field));
            this.selectedFields.push({
              id: song.id.toString(),
              name: `${song.number}. ${song.name}`,
              time: "20",
            });
          } else {
            this.selectedFields.push({
              id: evt.field,
              name: evt.field,
              time: "20",
            });
          }

          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  onSongsChange() {
    this.selectedFields = this.selectedFields.filter((field: FieldSelection) => this.selectedSongs.includes(field.id));
    const selectedSongs: string[] = this.selectedSongs.filter((id: string) => !Boolean(this.selectedFields.find((field: FieldSelection) => field.id === id)));

    for (let id of selectedSongs) {
      const song: Song = this.songs.find((song: Song) => song.id === parseInt(id));
      this.selectedFields.push({
        id,
        name: `${song.number}. ${song.name}`,
        time: "20"
      });
    }

    this.calculateEnd();
  }

  calculateEnd(): void {
    let currentTime = dayjs(this.time);

    for (let field of this.selectedFields) {
      currentTime = currentTime.add(parseInt(field.time), "minutes");
    }

    this.end = currentTime.format("YYYY-MM-DDTHH:mm");
  }

  export(date: string = dayjs().format('DD.MM.YYYY'), open: boolean = true) {
    const startingTime = dayjs(this.time);
    const hasConductors = Boolean(this.history.length && this.history.find((his: History) => Boolean(this.selectedFields.find((field: FieldSelection) => field.id === his.songId.toString()))));

    const data = [];

    let row = 1;
    let currentTime = startingTime;

    for (const field of this.selectedFields) {
      if (hasConductors) {
        data.push([
          row.toString(),
          field.name,
          this.history.find((his: History) => his.songId === parseInt(field.id))?.conductorName || "",
          `${field.time} min`,
          `${currentTime.format("HH:mm")} Uhr`
        ]);
      } else {
        data.push([row.toString(), field.name, `${field.time} min`, `${currentTime.format("HH:mm")} Uhr`]);
      }
      currentTime = currentTime.add(parseInt(field.time), "minutes");
      row++;
    }

    const doc = new jsPDF();
    doc.text(`Probenplan: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: hasConductors ? [["", "Werk", "Dirigent", "Dauer", "Uhrzeit"]] : [["", "Werk", "Dauer", "Uhrzeit"]],
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });

    if (open) {
      doc.save(`Probenplan_${date}.pdf`);
    } else {
      return doc;
    }
  }

  async addToAttendance() {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(99999);
    await loading.present();
    const date: string = dayjs(this.attendances.find((att: Attendance) => att.id === this.attendance).date).format("DD.MM.YYYY");
    const doc: jsPDF = this.export(date, false);
    const pdf: Blob = doc.output('blob');

    this.db.uploadPracticePlan(pdf, this.attendance);

    doc.save(`Probenplan_${date}.pdf`);

    await loading.dismiss();
    await this.dismiss();
  }

}
