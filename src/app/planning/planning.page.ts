import { Component, OnInit } from '@angular/core';
import { AlertController, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import jsPDF from 'jspdf';
import { DbService } from '../services/db.service';
import { Player, Song } from '../utilities/interfaces';
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';

interface FieldSelection {
  id: string;
  time: string;
}

@Component({
  selector: 'app-planning',
  templateUrl: './planning.page.html',
  styleUrls: ['./planning.page.scss'],
})
export class PlanningPage implements OnInit {
  public type: string = "pdf";
  public players: Player[] = [];
  public songs: Song[] = [];
  public selectedFields: FieldSelection[] = [];
  public selectedSongs: string[] = [];
  public time: string = dayjs().hour(19).minute(0).toISOString();
  public end: string;

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.songs = await this.db.getSongs();
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
        type: "text",
        name: "field"
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Hinzufügen",
        handler: (evt: any) => {
          this.selectedFields.push({
            id: evt.field,
            time: "20",
          });
          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  onSongsChange(evt: any) {
    const selectedSongs: string[] = evt.target.value.filter((id: string) => !Boolean(this.selectedFields.find((field: FieldSelection) => field.id === id)));

    for (let id of selectedSongs) {
      this.selectedFields.push({
        id,
        time: "20"
      });
    }

    this.calculateEnd();
  }

  calculateEnd(): void {
    let currentTime = dayjs(this.time).subtract(Math.abs(new Date().getTimezoneOffset()), "minutes");

    for (let field of this.selectedFields) {
      currentTime = currentTime.add(parseInt(field.time), "minutes");
    }

    this.end = currentTime.add(Math.abs(new Date().getTimezoneOffset()), "minutes").toISOString();
  }

  export() {
    const startingTime = dayjs(this.time).subtract(Math.abs(new Date().getTimezoneOffset()), "minutes");

    const date: string = dayjs().format('DD.MM.YYYY');
    const data = [];

    let row = 1;
    let currentTime = startingTime;

    for (const field of this.selectedFields) {
      data.push([row.toString(), field.id, field.time, currentTime.format("HH:mm")]);
      currentTime = currentTime.add(parseInt(field.time), "minutes");
      row++;
    }

    const doc = new jsPDF();
    doc.text(`Probenplan: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: [["", "Werk", "Dauer", "Uhrzeit"]],
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });
    doc.save(`Probenplan_${date}.pdf`);
  }

}
