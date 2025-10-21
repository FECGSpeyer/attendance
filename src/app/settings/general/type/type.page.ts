import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonItemSliding, IonPopover, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DataService } from 'src/app/services/data.service';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus } from 'src/app/utilities/constants';
import { AttendanceType, FieldSelection, Plan } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-type',
  templateUrl: './type.page.html',
  styleUrls: ['./type.page.scss'],
})
export class TypePage implements OnInit {
  @Input() isNew: boolean;
  public type: AttendanceType;
  public isGeneral: boolean = false;
  public attendanceStatuses = [
    AttendanceStatus.Neutral,
    AttendanceStatus.Present,
    AttendanceStatus.Absent,
    AttendanceStatus.Excused,
    AttendanceStatus.Late,
  ];
  public defaultPlan: Plan = {
    time: '',
    end: '',
    fields: [],
  };
  public end: string;

  constructor(
    public modalController: ModalController,
    public db: DbService,
    public dataService: DataService,
    public route: ActivatedRoute,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.isGeneral = this.db.tenant().type === 'general';
    if (this.isNew) {
      this.type = {
        name: '',
        default_status: AttendanceStatus.Present,
        available_statuses: [
          AttendanceStatus.Neutral,
          AttendanceStatus.Present,
          AttendanceStatus.Absent,
          AttendanceStatus.Excused,
          AttendanceStatus.Late,
        ],
        manage_songs: false,
        start_time: '19:00',
        end_time: '20:30',
        relevant_groups: [],
        tenant_id: this.db.tenant().id,
        index: 999,
      };
      this.type.default_plan = { ...this.defaultPlan };
    } else {
      let existingType = this.dataService.getAttendanceTypeData();

      if (!existingType) {
        const id = this.route.snapshot.paramMap.get('id');
        existingType = await this.db.getAttendanceType(id);
      }

      this.type = {
        ...existingType,
        default_plan: existingType.default_plan ? { ...existingType.default_plan } : undefined
      };

      if (!this.type.default_plan?.fields) {
        this.type.default_plan = { ...this.defaultPlan };
      }
    }
  }

  async save() {
    if (!this.validate()) {
      return;
    }

    try {
      await this.db.updateAttendanceType(this.type.id, this.type);
      Utils.showToast("Anwesenheitstyp erfolgreich aktualisiert", "success");
    } catch (error) {
      Utils.showToast("Fehler beim Aktualisieren des Anwesenheitstyps", "danger");
    }
  }

  async createType() {
    if (!this.validate()) {
      return;
    }

    try {
      this.type = await this.db.addAttendanceType(this.type);
      Utils.showToast("Anwesenheitstyp erfolgreich erstellt", "success");
    } catch (error) {
      Utils.showToast("Fehler beim Erstellen des Anwesenheitstyps", "danger");
    }
  }

  validate(): boolean {
    if (!this.type.name || this.type.name.trim().length === 0) {
      Utils.showToast("Bitte einen Namen für den Anwesenheitstyp eingeben.", "danger");
      return false;
    }

    return true;
  }

  async deleteType() {
    const alert = await this.alertController.create({
      header: 'Anwesenheitstyp löschen',
      message: `Möchtest du den Anwesenheitstyp "${this.type.name}" wirklich löschen? Alle Anwesenheiten dieses Typs werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`,
      buttons: [{
        text: "Abbrechen",
        role: "destructive",
      }, {
        text: "Löschen",
        handler: async () => {
          try {
            await this.db.deleteAttendanceType(this.type.id);
            Utils.showToast("Anwesenheitstyp erfolgreich gelöscht", "success");
            this.dismiss();
          } catch (error) {
            Utils.showToast("Fehler beim Löschen des Anwesenheitstyps", "danger");
          }
        }
      }]
    });

    await alert.present();
  }

  async dismiss() {
    await this.modalController.dismiss();
  }

  getAttendanceStatusDescription(status: AttendanceStatus): string {
    return Utils.getAttendanceStatusDescription(status);
  }

  calculateTime(field: FieldSelection, index: number) {
    let minutesToAdd: number = 0;
    let currentIndex: number = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.type.default_plan.fields[currentIndex].time);
      currentIndex++;
    }

    const time: dayjs.Dayjs = dayjs(this.type.start_time).isValid() ? dayjs(this.type.start_time) : dayjs().hour(Number(this.type.start_time.substring(0, 2))).minute(Number(this.type.start_time.substring(3, 5)));
    return `${time.add(minutesToAdd, "minute").format("HH:mm")} ${field.conductor ? `| ${field.conductor}` : ""}`;
  }

  async addExtraField(popover: IonPopover) {
    await popover.dismiss();

    const alert = await this.alertController.create({
      header: 'Feld hinzufügen',
      inputs: [{
        type: "textarea",
        name: "field",
        placeholder: "Freitext eingeben..."
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Hinzufügen",
        handler: (evt: any) => {
          this.type.default_plan.fields.push({
            id: evt.field,
            name: evt.field,
            time: "20",
          });

          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  addSongPlaceholder(popover: IonPopover) {
    popover.dismiss();

    const numberOfSongs = this.type.default_plan.fields.filter(f => f.id?.startsWith("song-placeholder-")).length;

    this.type.default_plan.fields.push({
      id: `song-placeholder-${numberOfSongs + 1}`,
      name: `Werk Platzhalter ${numberOfSongs + 1}`,
      time: "20",
    });

    this.calculateEnd();
  }

  handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    ev.detail.complete(this.type.default_plan.fields);

    this.calculateEnd();
  }

  removeField(index: number, slider: IonItemSliding) {
    this.type.default_plan.fields.splice(index, 1);
    slider.close();
    this.calculateEnd();
  }

  async changeField(field: FieldSelection, slider?: IonItemSliding) {
    slider?.close();
    const clone: FieldSelection = JSON.parse(JSON.stringify(field));
    const alert = await this.alertController.create({
      header: 'Feld bearbeiten',
      inputs: [{
        label: "Programmpunkt",
        type: "text",
        name: "field",
        value: clone.name,
        placeholder: "Programmpunkt eingeben..."
      }, {
        label: "Ausführender",
        type: "text",
        name: "conductor",
        value: clone.conductor,
        placeholder: "Ausführenden eingeben..."
      }],
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
          field.conductor = evt.conductor;
          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  calculateEnd(): void {
    let currentTime = dayjs(this.type.start_time);
    if (!currentTime.isValid()) {
      currentTime = dayjs().hour(Number(this.type.start_time.substring(0, 2))).minute(Number(this.type.start_time.substring(3, 5)));
    }

    for (let field of this.type.default_plan.fields) {
      currentTime = currentTime.add(parseInt(field.time), "minutes");
    }

    this.end = currentTime.format("YYYY-MM-DDTHH:mm");
  }
}
