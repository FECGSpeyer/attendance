import { Component, OnInit } from '@angular/core';
import { ActionSheetButton, ActionSheetController, AlertController, IonItemSliding, IonModal, IonPopover, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from '../services/db.service';
import { Attendance, FieldSelection, History, Person, Song } from '../utilities/interfaces';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';
import { Utils } from '../utilities/Utils';
import { AttendanceType } from 'src/app/utilities/constants';

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
    time: "10",
  }];
  public attendances: Attendance[] = [];
  public attendance: number;
  public time: string = dayjs().utc().hour(17).minute(50).format("YYYY-MM-DDTHH:mm");
  public end: string;
  public notes: string = "";
  public hasChatId: boolean = false;
  public isPlanModalOpen: boolean = false;
  public conductors: Person[] = [];
  public selConductors: number[] = [];

  constructor(
    private modalController: ModalController,
    public db: DbService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
  ) { }

  async ngOnInit() {
    this.conductors = (await this.db.getConductors()).filter((con: Person) => !con.left);
    this.selConductors = this.conductors.filter((con: Person) => Boolean(!con.left)).map((c: Person): number => c.id);
    this.hasChatId = Boolean(this.db.tenantUser().telegram_chat_id);
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
        this.selectedFields = upcomingAttendances[0].plan.fields.map((field: FieldSelection) => {
          return {
            ...field,
            conductor: field.conductor || (this.history?.find((his: History) => his.songId === Number(field.id))?.conductorName || "")
          }
        });
      } else {
        const isPractice = this.attendances.find((att: Attendance) => att.id === this.attendance)?.type === "uebung";
        this.time = isPractice ? (this.db.tenant().practiceStart || "17:50") : "10:00";
      }
    }

    if (this.history.length && this.selectedFields.length === 1) {
      this.onAttChange();
    }
  }

  calculateTime(field: FieldSelection, index: number) {
    let minutesToAdd: number = 0;
    let currentIndex: number = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.selectedFields[currentIndex].time);
      currentIndex++;
    }

    const time: dayjs.Dayjs = dayjs(this.time).isValid() ? dayjs(this.time) : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    return `${time.add(minutesToAdd, "minute").format("HH:mm")} ${field.conductor ? `| ${field.conductor}` : ""}`;
  }

  async changeField(field: FieldSelection, slider?: IonItemSliding) {
    slider?.close();
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
    const attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    const name: string = this.attendance ? dayjs(this.attendances.find((att: Attendance) => att.id === this.attendance).date).format("DD_MM_YYYY") : dayjs().format("DD_MM_YYYY");
    const blob: Blob = Utils.createPlanExport({
      time: this.time,
      end: this.end,
      fields: this.selectedFields,
      asBlob: true,
      attendance: this.attendance,
      attendances: this.attendances
    }, attendance?.type === "uebung");
    this.db.sendPlanPerTelegram(blob, `${attendance?.type === "uebung" ? "Probenplan" : "Gottesdienst"}_${name}`);
  }

  onAttChange() {
    const attendance: Attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);

    if (!attendance) return;

    this.notes = attendance.notes;
    if (attendance.plan) {
      this.end = attendance.plan.end;
      this.time = attendance.plan.time;
      this.selectedFields = attendance.plan.fields.map((field: FieldSelection) => {
        return {
          ...field,
          conductor: field.conductor || (this.history?.find((his: History) => his.songId === Number(field.id))?.conductorName || "")
        }
      });
    } else if (this.history.length) {
      if (attendance.type === "uebung") {
        this.time = this.db.tenant().practiceStart || "17:50";
        this.selectedFields = [{
          id: "",
          name: "Wort ",
          time: "10",
        }];

        for (let his of this.history) {
          const song: Song = this.songs.find((s: Song): boolean => s.id === his.songId);
          this.onSongsChange([String(song.id)], true);
        }
      } else {
        const attDate = dayjs(attendance.date);
        this.time = attDate.day() === 0 ? "10:00" : "19:00";
        // add default fields
        this.selectedFields = [{
          id: "",
          name: "Segensgebet ",
          time: "5",
        }, {
          id: "",
          name: "Gemeinsamer Gesang ",
          time: "5",
        }, {
          id: "",
          name: "1. Predigt mit Gebet ",
          time: "20",
          conductor: this.history?.find((his: History) => his.songId === this.songs[1].id)?.conductorName || ""
        }, {
          id: "",
          name: "Gemeinsamer Gesang ",
          time: "5",
        }];

        for (let his of this.history) {
          const song: Song = this.songs.find((s: Song): boolean => s.id === his.songId);
          this.onSongsChange([String(song.id)], false);
        }

        this.selectedFields.push({
          id: "",
          name: "Programm ",
          time: "20",
        });

        if (attDate.day() === 0) {
          this.selectedFields.push({
            id: "",
            name: "2. Predigt ",
            time: "15",
          });
          this.selectedFields.push({
            id: "",
            name: "Gemeinsamer Gesang ",
            time: "5",
          });
        }
        this.selectedFields.push({
          id: "",
          name: "Abschlusspredigt ",
          time: "25",
        });
      }
    }

    this.calculateEnd();
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

  removeField(index: number, slider: IonItemSliding) {
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
          } else if (evt.field.includes("(") && evt.field.includes(")")) {
            this.selectedFields.push({
              id: evt.field.substring(0, evt.field.indexOf("(")),
              name: evt.field.substring(0, evt.field.indexOf("(")),
              conductor: evt.field.substring(evt.field.indexOf("(") + 1, evt.field.indexOf(")")),
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

  onAddSong(id: string, popover: IonPopover) {
    popover?.dismiss();
    const attendance: Attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    if (!id) return;
    this.onSongsChange([id], attendance?.type === "uebung");
  }

  onSongsChange(ids: string[], isPractice: boolean = true) {
    for (let id of ids) {
      const song: Song = this.songs.find((song: Song) => song.id === parseInt(id));
      const conductor: string | undefined = this.history?.find((his: History) => his.songId === song.id)?.conductorName;

      this.selectedFields.push({
        id,
        name: `${song.number}. ${song.name}`,
        time: isPractice ? "20" : "5",
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
      attendance: this.attendance,
      attendances: this.attendances,
    }, Boolean(this.attendances.find((a: Attendance) => a.id === this.attendance).type === "uebung"));
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

  getAttTypeText(type: string, typeInfo?: string): string {
    if (type === 'uebung') {
      return '';
    } else if (type === "sonstiges") {
      return typeInfo || '';
    }
    return Utils.getTypeText(type);
  }

  async showOptions() {
    const buttons: ActionSheetButton[] = [];

    if (this.selectedFields.length) {
      if (this.attendances.length && this.attendance) {
        buttons.push({
          text: 'Zu Anwesenheit hinzufügen',
          handler: () => this.addToAttendance()
        });
      }

      buttons.push({
        text: 'PDF exportieren',
        handler: () => this.export()
      });

      if (this.hasChatId) {
        buttons.push({
          text: 'Per Telegram senden',
          handler: () => this.send()
        });
      }
    }

    buttons.push({
      text: 'Registerprobenplan erstellen',
      handler: () => {
        this.isPlanModalOpen = true;
      }
    });

    buttons.push({
      text: 'Abbrechen',
      role: 'cancel',
    });

    const actionSheet = await this.actionSheetController.create({
      header: 'Aktionen',
      buttons
    });
    await actionSheet.present();
  }

  createPlan(conductors: number[], timeString: string | number, modal: IonModal, perTelegram?: boolean): void {
    const shuffledConductors: string[] = this.shuffle(conductors.map((id: number): string => {
      const con: Person = this.conductors.find((c: Person): boolean => id === c.id);
      return `${con.firstName} ${con.lastName.substr(0, 1)}.`;
    }));
    const attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    const date: string = attendance ? dayjs(attendance.date).format('DD.MM.YYYY') : dayjs().format('DD.MM.YYYY');
    const data = [];
    const timePerUnit: number = Number(timeString) / shuffledConductors.length;

    for (let index = 0; index < conductors.length; index++) {
      const slotTime = Math.round(timePerUnit * index);
      data.push([
        String(slotTime),
        shuffledConductors[(index) % (shuffledConductors.length)],
        shuffledConductors[(index + 1) % (shuffledConductors.length)],
        shuffledConductors[(index + 2) % (shuffledConductors.length)]
      ]); // TODO attendance type
    }

    const doc = new jsPDF();
    doc.text(`${this.db.tenant().shortName} Registerprobenplan: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: this.db.tenant().type === AttendanceType.CHOIR ? [["Minuten", "Sopran", "Alt", "Tenor", "Bass"]] : this.db.tenant().shortName === "BoS" ? [['Minuten', 'Blechbläser', 'Holzbläser']] : [['Minuten', 'Streicher', 'Holzbläser', 'Sonstige']], // TODO attendance type
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });

    if (perTelegram) {
      this.db.sendPlanPerTelegram(doc.output('blob'), `Registerprobenplan_${dayjs().format('DD_MM_YYYY')}`);
    } else {
      doc.save(`${this.db.tenant().shortName} Registerprobenplan: ${date}.pdf`);
    }

    modal.dismiss();
  }

  shuffle(a: string[]) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

}
