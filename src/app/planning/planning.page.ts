import { Component, OnInit } from '@angular/core';
import { AlertController, IonItemSliding, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from '../services/db.service';
import { Attendance, FieldSelection, History, Settings, Song } from '../utilities/interfaces';

import { Utils } from '../utilities/Utils';

@Component({
  selector: 'app-planning',
  templateUrl: './planning.page.html',
  styleUrls: ['./planning.page.scss'],
})
export class PlanningPage implements OnInit {
  public type: string = "pdf";
  public songs: Song[] = [];
  public history: History[] = [];
  public selectedFields: FieldSelection[] = [{
    id: "",
    name: "Wort ",
    time: "5",
  }];
  public attendances: Attendance[] = [];
  public attendance: number;
  public time: string = dayjs().utc().hour(17).minute(50).format("YYYY-MM-DDTHH:mm");
  public end: string;
  public notes: string = "";
  public settings: Settings;

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.settings = await this.db.getSettings();
    this.songs = await this.db.getSongs();
    this.history = await this.db.getUpcomingHistory();
    this.attendances = await this.db.getAttendance();
    const upcomingAttendances: Attendance[] = (await this.db.getUpcomingAttendances()).reverse();
    if (upcomingAttendances.length) {
      this.attendance = upcomingAttendances[0].id;
      this.notes = upcomingAttendances[0].notes;
      if (upcomingAttendances[0].plan) {
        this.end = upcomingAttendances[0].plan.end;
        this.time = upcomingAttendances[0].plan.time;
        this.selectedFields = upcomingAttendances[0].plan.fields;
      } else {
        this.time = this.settings.practiceStart || "17:50";
      }
    }

    if (this.history.length && this.selectedFields.length === 1) {
      for (let his of this.history) {
        const song: Song = this.songs.find((s: Song): boolean => s.id === his.songId);
        this.onSongsChange([String(song.id)]);
      }
    }
  }

  calculateTime(field: FieldSelection, index: number) {
    let minutesToAdd: number = 0;
    let currentIndex: number = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.selectedFields[currentIndex].time);
      currentIndex++;
    }

    return `${dayjs(this.time).add(minutesToAdd, "minute").format("HH:mm")} ${field.conductor ? `| ${field.conductor}` : ""}`;
  }

  async changeField(field: FieldSelection, slider: IonItemSliding) {
    slider.close();
    const clone: FieldSelection = JSON.parse(JSON.stringify(field));
    const alert = await this.alertController.create({
      header: 'Feld bearbeiten',
      inputs: [{
        type: "textarea",
        name: "field",
        value: clone.name,
        placeholder: "Werknummer oder Freitext eingeben..."
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Updaten",
        handler: (evt: any) => {
          if (evt.field.includes("(") && evt.field.includes(")")) {
            field.conductor = evt.field.substring(evt.field.indexOf("(") + 1, evt.field.indexOf(")"));
            evt.field = evt.field.substring(0, evt.field.indexOf("("));
          }
          field.name = evt.field;
          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  send() {
    const name: string = this.attendance ? dayjs(this.attendances.find((att: Attendance) => att.id === this.attendance).date).format("DD_MM_YYYY") : dayjs(this.time).format("DD_MM_YYYY");
    const blob: Blob = Utils.createPlanExport({
      time: this.time,
      end: this.end,
      fields: this.selectedFields,
      asBlob: true,
      attendance: this.attendance,
      attendances: this.attendances
    });
    this.db.sendPlanPerTelegram(blob, `Probenplan_${name}`);
  }

  onAttChange() {
    const attendance: Attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    this.notes = attendance.notes;
    if (attendance.plan) {
      this.end = attendance.plan.end;
      this.time = attendance.plan.time;
      this.selectedFields = attendance.plan.fields;
    } else if (this.history.length) {
      this.selectedFields = [{
        id: "",
        name: "Wort ",
        time: "5",
      }];
      for (let his of this.history) {
        const song: Song = this.songs.find((s: Song): boolean => s.id === his.songId);
        this.onSongsChange([String(song.id)]);
      }
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
            const conductor: string | undefined = this.history?.find((his: History) => his.songId === song.id)?.conductorName;
            this.selectedFields.push({
              id: song.id.toString(),
              name: `${song.number}. ${song.name}`,
              time: "20",
              conductor: conductor || "",
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

  onSongsChange(ids: string[]) {
    for (let id of ids) {
      const song: Song = this.songs.find((song: Song) => song.id === parseInt(id));
      const conductor: string | undefined = this.history?.find((his: History) => his.songId === song.id)?.conductorName;

      this.selectedFields.push({
        id,
        name: `${song.number}. ${song.name}`,
        time: "20",
        conductor: conductor || "",
      });
    }

    this.calculateEnd();
  }

  calculateEnd(): void {
    let currentTime = dayjs(this.time);
    if (!currentTime.isValid()) {
      currentTime = dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    }

    for (let field of this.selectedFields) {
      currentTime = currentTime.add(parseInt(field.time), "minutes");
    }

    this.end = currentTime.format("YYYY-MM-DDTHH:mm");
  }

  export() {
    Utils.createPlanExport({
      time: this.time,
      end: this.end,
      fields: this.selectedFields,
      history: this.history,
    });
  }

  async addToAttendance() {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(99999);
    await loading.present();

    this.db.updateAttendance({
      plan: {
        time: this.time,
        fields: this.selectedFields,
        end: this.end,
      }
    }, this.attendance);

    await loading.dismiss();
    Utils.showToast("Probenplan wurde hinzugefügt!", "success");
  }

}
