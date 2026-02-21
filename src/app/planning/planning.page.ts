import { Component, Input, OnInit } from '@angular/core';
import { ActionSheetButton, ActionSheetController, AlertController, IonItemSliding, IonModal, IonPopover, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import dayjs from 'dayjs';
import { DbService } from '../services/db.service';
import { Attendance, FieldSelection, GroupCategory, History, Group, Person, Song, AttendanceType } from '../utilities/interfaces';
// jsPDF is lazy-loaded for better initial bundle size
import { Utils } from '../utilities/Utils';
import { DefaultAttendanceType } from 'src/app/utilities/constants';

@Component({
    selector: 'app-planning',
    templateUrl: './planning.page.html',
    styleUrls: ['./planning.page.scss'],
    standalone: false
})
export class PlanningPage implements OnInit {
  @Input() attendanceId?: number;
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
  public groupCategories: GroupCategory[];
  public sharePlan: boolean = false;
  public customModalOptions = {
    header: 'Werk hinzufügen',
    breakpoints: [0, 0.7, 1],
    initialBreakpoint: 0.7,
  };

  constructor(
    private modalController: ModalController,
    public db: DbService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
  ) { }

  // TrackBy function for reorderable fields list
  trackByFieldId = (_: number, field: FieldSelection): string => field.id;

  async ngOnInit() {
    this.songs = await this.db.getSongs();
    this.groupCategories = await this.db.getGroupCategories();
    this.conductors = (await this.db.getConductors()).filter((con: Person) => !con.left);
    this.selConductors = this.conductors.filter((con: Person) => Boolean(!con.left)).map((c: Person): number => c.id);
    this.hasChatId = Boolean(this.db.tenantUser().telegram_chat_id);
    this.history = await this.db.getUpcomingHistory();
    this.attendances = await this.db.getAttendance();
    const upcomingAttendances: Attendance[] = (await this.db.getUpcomingAttendances()).reverse();
    if (this.attendanceId) {
      this.attendance = this.attendanceId;
      const att = this.attendances.find((att: Attendance) => att.id === this.attendanceId);
      this.notes = att?.notes || "";
      this.sharePlan = att?.share_plan || false;
      if (att?.plan) {
        this.end = att.plan.end;
        this.time = att.plan.time;
        this.selectedFields = att.plan.fields.map((field: FieldSelection) => {
          return {
            ...field,
            conductor: field.conductor || (this.history?.find((his: History) => his.songId === Number(field.id))?.conductorName || "")
          }
        });
      } else {
        const isPractice = this.attendances.find((att: Attendance) => att.id === this.attendance)?.type === "uebung";
        this.time = isPractice ? (this.db.tenant().practiceStart || "17:50") : "10:00";
      }
    } else if (upcomingAttendances.length) {
      this.attendance = upcomingAttendances[0].id;
      this.notes = upcomingAttendances[0].notes;
      this.sharePlan = upcomingAttendances[0].share_plan || false;
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
    let inputs = [{
      label: "Programmpunkt",
      name: "field",
      value: clone.name,
      placeholder: "Programmpunkt eingeben..."
    }, {
      label: "Ausführender",
      name: "conductor",
      value: clone.conductor,
      placeholder: "Ausführenden eingeben..."
    }];

    if (field.id.includes("noteFld")) {
      inputs = [{
        label: "Notiz",
        name: "field",
        value: clone.name,
        placeholder: "Notiz eingeben..."
      }];
    }

    const alert = await this.alertController.create({
      header: 'Feld bearbeiten',
      inputs,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Updaten",
        handler: (evt: any) => {
          if (!evt.field) {
            alert.message = "Bitte einen Programmpunkt eingeben.";
            return false;
          }
          field.name = evt.field;
          field.conductor = evt.conductor ?? "";
          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  async send(asImage: boolean = false, sideBySide: boolean = false) {
    if (!this.validate()) {
      return;
    }

    const attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    const name: string = this.attendance ? dayjs(this.attendances.find((att: Attendance) => att.id === this.attendance).date).format("DD_MM_YYYY") : dayjs().format("DD_MM_YYYY");
    const type = this.db.attendanceTypes().find(type => type.id === attendance.type_id);
    const planningTitle = Utils.getPlanningTitle(type, attendance.typeInfo);
    const blob = await Utils.createPlanExport({
      time: this.time,
      end: this.end,
      fields: this.selectedFields,
      asBlob: true,
      asImage,
      sideBySide,
      attendance: this.attendance,
      attendances: this.attendances
    }, planningTitle);
    this.db.sendPlanPerTelegram(blob, `${planningTitle.replace("(", "").replace(")", "")}_${name}${sideBySide ? '_2x' : ''}`, asImage);
  }

  onAttChange() {
    const attendance: Attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);

    if (!attendance) return;

    this.notes = attendance.notes;
    this.sharePlan = attendance.share_plan || false;
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
      this.addDefaultFieldsFromAttendanceType(attendance.type_id);
    }

    this.calculateEnd();
  }

  async toggleSharePlan() {
    if (!this.attendance) return;

    await this.db.updateAttendance({ share_plan: this.sharePlan }, this.attendance);
    const att = this.attendances.find((a: Attendance) => a.id === this.attendance);
    if (att) {
      att.share_plan = this.sharePlan;
    }
  }

  dismiss() {
    this.modalController.dismiss();
  }

  handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    ev.detail.complete(this.selectedFields);

    this.calculateEnd();
  }

  removeField(index: number, slider: IonItemSliding) {
    this.selectedFields.splice(index, 1);
    slider.close();
    this.calculateEnd();
  }

  async addExtraField(popover: IonPopover) {
    popover?.dismiss();
    const alert = await this.alertController.create({
      header: 'Feld hinzufügen',
      inputs: [{
        type: "textarea",
        name: "field",
        placeholder: "Freitext eingeben..."
      }, {
        type: "text",
        name: "conductor",
        placeholder: "Ausführenden eingeben..."
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Hinzufügen",
        handler: (evt: any) => {
          this.selectedFields.push({
            id: evt.field,
            name: evt.field,
            conductor: evt.conductor ?? "",
            time: "20",
          });

          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  async addNoteField(popover: IonPopover) {
    popover?.dismiss();

    const alert = await this.alertController.create({
      header: 'Notizfeld hinzufügen',
      inputs: [{
        type: "textarea",
        name: "field",
        placeholder: "Notiz eingeben..."
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Hinzufügen",
        handler: (evt: any) => {
          this.selectedFields.push({
            id: `noteFld ${evt.field}`,
            name: evt.field,
            conductor: "",
            time: "0",
          });

          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  addCurrentSongs(popover: IonPopover) {
    popover?.dismiss();
    const songsToAdd: string[] = [];

    for (let historyItem of this.history) {
      if (!this.selectedFields.find((field: FieldSelection) => Number(field.id) === historyItem.songId)) {
        songsToAdd.push(String(historyItem.songId));
      }
    }

    this.onSongsChange(songsToAdd);
  }

  onAddSong(id: string, popover: IonPopover) {
    popover?.dismiss();
    const attendance: Attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    if (!id) return;
    this.onSongsChange([id]);
  }

  onSongsChange(ids: string[]) {
    const attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    const type = this.db.attendanceTypes().find((t: AttendanceType) => t.id === attendance?.type_id);

    for (let id of ids) {
      const song: Song = this.songs.find((song: Song) => song.id === parseInt(id));
      const conductor: string | undefined = this.history?.find((his: History) => his.songId === song.id)?.conductorName;
      const prefix = type?.planning_prefix_instance_name ? `${this.db.tenant().longName}: ` : `${song.number}. `;

      this.selectedFields.push({
        id,
        name: `${prefix}${song.name}`,
        time: "20",
        conductor: conductor || "",
        songId: song.id,
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

    this.updateAttendance();
  }

  async export(sideBySide: boolean = false) {
    if (!this.validate()) {
      return;
    }

    const attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    const type = this.db.attendanceTypes().find(type => type.id === attendance.type_id);
    const planningTitle = Utils.getPlanningTitle(type, attendance.typeInfo);

    await Utils.createPlanExport({
      time: this.time,
      end: this.end,
      fields: this.selectedFields,
      history: this.history,
      attendance: this.attendance,
      attendances: this.attendances,
      sideBySide,
    }, planningTitle);
  }

  validate(showToast: boolean = true): boolean {
    if (!this.time || !this.selectedFields.length) {
      if (showToast) {
        Utils.showToast("Bitte wähle mindestens ein Feld aus.", "warning");
      }
      return false;
    }

    if (!this.selectedFields.every(field => field.time)) {
      if (showToast) {
        Utils.showToast("Bitte fülle alle erforderlichen Felder aus.", "warning");
      }
      return false;
    }

    return true;
  }

  getAttTypeText(attendance: Attendance): string {
    const type = this.db.attendanceTypes().find((t: AttendanceType) => t.id === attendance.type_id);
    return Utils.getTypeTitle(type, attendance.typeInfo);
  }

  async showOptions() {
    const buttons: ActionSheetButton[] = [];

    if (this.selectedFields.length) {
      buttons.push({
        text: 'PDF exportieren',
        handler: () => this.export()
      });
      buttons.push({
        text: 'PDF exportieren (2x A5)',
        handler: () => this.export(true)
      });

      if (this.hasChatId) {
        buttons.push({
          text: 'Per Telegram senden (PDF)',
          handler: () => this.send(false)
        });
        buttons.push({
          text: 'Per Telegram senden (PDF 2x A5)',
          handler: () => this.send(false, true)
        });
        buttons.push({
          text: 'Per Telegram senden (Bild)',
          handler: () => this.send(true)
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
      role: 'destructive',
    });

    const actionSheet = await this.actionSheetController.create({
      header: 'Aktionen',
      buttons
    });
    await actionSheet.present();
  }

  async createPlan(conductors: number[], timeString: string | number, modal: IonModal, perTelegram?: boolean, asImage?: boolean): Promise<void> {
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

    // Lazy load jsPDF
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();
    doc.text(`${this.db.tenant().shortName} Registerprobenplan: ${date}`, 14, 25);
    (doc as any).autoTable({
      head: this.db.tenant().type === DefaultAttendanceType.CHOIR ? [["Minuten", "Sopran", "Alt", "Tenor", "Bass"]] : this.db.tenant().shortName === "BoS" ? [['Minuten', 'Blechbläser', 'Holzbläser']] : [['Minuten', 'Streicher', 'Holzbläser', 'Sonstige']], // TODO attendance type
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });

    if (perTelegram) {
      let blob: Blob = doc.output('blob');
      if (asImage) {
        const pdfDataUri = doc.output('datauristring');
        blob = await Utils.pdfDataUriToImageBlob(pdfDataUri);
      }
      this.db.sendPlanPerTelegram(blob, `Registerprobenplan_${dayjs().format('DD_MM_YYYY')}`, asImage);
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

  getMissingGroups(songId: number): string {
    const song = this.songs.find((s: Song) => s.id === songId);

    if (!song || !song.instrument_ids || !song.instrument_ids.length) {
      return "";
    }

    const text = Utils.getInstrumentText(song.instrument_ids, this.db.groups().filter((group: Group) => !group.maingroup), this.groupCategories);
    return text;
  }

  nextAtt() {
    const currentIndex = this.attendances.findIndex((att: Attendance) => att.id === this.attendance);
    if (currentIndex > 0) {
      this.attendance = this.attendances[currentIndex - 1].id;
      this.onAttChange();
    } else {
      Utils.showToast("Dies ist die aktuell erste Veranstaltung", "warning");
    }
  }

  prevAtt() {
    const currentIndex = this.attendances.findIndex((att: Attendance) => att.id === this.attendance);
    if (currentIndex < this.attendances.length - 1) {
      this.attendance = this.attendances[currentIndex + 1].id;
      this.onAttChange();
    } else {
      Utils.showToast("Dies ist die aktuell letzte Veranstaltung", "warning");
    }
  }

  async updateAttendance() {
    if (this.attendances.length && this.attendance) {
      if (!this.validate(false)) {
        return;
      }

      const result = await this.db.updateAttendance({
        plan: {
          time: this.time,
          fields: this.selectedFields,
          end: this.end,
        }
      }, this.attendance);

      const att = this.attendances.find((att: Attendance) => att.id === this.attendance);

      att.plan = result.plan;
    }
  }

  async resetPlan() {
    const alert = await this.alertController.create({
      header: 'Plan zurücksetzen',
      message: 'Möchtest du den Plan für diese Veranstaltung wirklich zurücksetzen? Alle Änderungen gehen verloren.',
      buttons: [
        {
          text: 'Abbrechen',
        },
        {
          text: 'Zurücksetzen',
          handler: () => {
            this.addDefaultFieldsFromAttendanceType(this.attendances.find((att: Attendance) => att.id === this.attendance)?.type_id);
          }
        }
      ]
    });

    await alert.present();
  }

  addDefaultFieldsFromAttendanceType(typeId: string) {
    const attType = this.db.attendanceTypes().find((at: AttendanceType) => at.id === typeId);
    const attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);

    if (attType?.default_plan?.fields?.length) {
      const songsAdded: Set<string> = new Set<string>();
      this.selectedFields = [];

      this.time = attType.start_time;

      for (let field of attType.default_plan.fields) {
        if (field.id.startsWith("song-placeholder-")) {
          const historyItem = this.history.find((his: History) => !songsAdded.has(String(his.songId)));
          if (historyItem) {
            songsAdded.add(String(historyItem.songId));
            const song: Song = this.songs.find((song: Song) => song.id === historyItem.songId);
            const conductor: string | undefined = this.history?.find((his: History) => his.songId === song.id)?.conductorName;
            const prefix = attType?.planning_prefix_instance_name ? `${this.db.tenant().longName}: ` : `${song.number}. `;

            this.selectedFields.push({
              ...field,
              id: String(song.id),
              name: `${prefix}${song.name}`,
              conductor: conductor || "",
              songId: song.id,
            });
          }
          continue;
        }

        this.selectedFields.push({ ...field });
      }
    }

    this.calculateEnd();
  }

}
