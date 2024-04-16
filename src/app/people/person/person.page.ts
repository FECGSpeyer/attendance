import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, AlertController, IonContent, IonItemSliding, IonModal, IonSelect, LoadingController, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import { DbService } from 'src/app/services/db.service';
import { Instrument, PersonAttendance, Player, PlayerHistoryEntry, Teacher } from 'src/app/utilities/interfaces';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { Utils } from 'src/app/utilities/Utils';
import { AttendanceType, DEFAULT_IMAGE, PlayerHistoryType, Role } from 'src/app/utilities/constants';
import { SupabaseTable } from '../../utilities/constants';
dayjs.extend(utc);

@Component({
  selector: 'app-person',
  templateUrl: './person.page.html',
  styleUrls: ['./person.page.scss'],
})
export class PersonPage implements OnInit, AfterViewInit {
  @Input() existingPlayer: Player;
  @Input() readOnly: boolean;
  @Input() instruments: Instrument[];
  @Input() isConductor: boolean;
  @Input() hasLeft: boolean;
  @ViewChild('select') select: IonSelect;
  @ViewChild('content') content: IonContent;
  @ViewChild('chooser') chooser: ElementRef;

  public newPlayer: Player = {
    firstName: "",
    lastName: "",
    instrument: 1,
    playsSince: new Date().toISOString(),
    joined: new Date().toISOString(),
    birthday: new Date().toISOString(),
    hasTeacher: false,
    isLeader: false,
    notes: "",
    teacher: null,
    isCritical: false,
    correctBirthday: false,
    history: [],
    paused: false,
    tenantId: 999999999,
  };
  public readonly NONE: Role = Role.NONE;
  public readonly HELPER: Role = Role.HELPER;
  public player: Player;
  public birthdayString: string = format(new Date(), 'dd.MM.yyyy');
  public playsSinceString: string = format(new Date(), 'dd.MM.yyyy');
  public joinedString: string = format(new Date(), 'dd.MM.yyyy');
  public max: string = new Date().toISOString();
  public attendance: PersonAttendance[] = [];
  public history: any[] = [];
  public teachers: Teacher[] = [];
  public allTeachers: Teacher[] = [];
  public perc: number = 0;
  public maintainTeachers: boolean;
  public isVoS: boolean;
  public solved: boolean = false;
  public hasChanges: boolean = false;
  public notes: string = "";
  public isAdmin: boolean = false;
  public isChoir: boolean = false;
  public lateCount: number = 0;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private actionSheetController: ActionSheetController,
  ) { }

  async ngOnInit() {
    this.isVoS = this.db.tenant().shortName === 'VoS';
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.isChoir = this.db.tenant().type === AttendanceType.CHOIR;
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.hasChanges = false;
    if (this.db.tenant().maintainTeachers) {
      this.teachers = await this.db.getTeachers();
      this.allTeachers = this.teachers;
    }
    if (this.existingPlayer) {
      this.player = { ...this.existingPlayer };
      this.birthdayString = this.formatDate(this.existingPlayer.birthday);
      this.playsSinceString = this.existingPlayer.playsSince ? this.formatDate(this.existingPlayer.playsSince) : "";
      this.joinedString = this.formatDate(this.existingPlayer.joined);
      this.player.teacherName = this.player.teacher ? this.teachers.find((teacher: Teacher) => teacher).name : "";
      this.player.criticalReasonText = this.player.criticalReason ? Utils.getPlayerHistoryTypeText(this.player.criticalReason) : "";

      if (this.isConductor) {
        this.history = (await this.db.getConductorAttendance(this.player.id, this.hasLeft)).filter((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs())).map((att: PersonAttendance) => {
          return {
            date: att.date,
            text: att.text,
            type: PlayerHistoryType.ATTENDANCE,
            title: att.title,
            notes: att.notes,
            attended: att.attended,
          };
        });
        this.perc = Math.round(this.history.filter((att: PersonAttendance) => att.attended).length / this.history.length * 100);
      } else {
        await this.getHistoryInfo();
      }
    } else {
      this.player = { ...this.newPlayer };
      this.player.tenantId = this.db.tenant().id;
      this.player.instrument = this.instruments[0].id;
    }

    this.onInstrumentChange(false);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      const tx = document.getElementsByTagName("textarea");
      for (let i = 0; i < tx.length; i++) {
        tx[i].setAttribute("style", "height:" + (tx[i].scrollHeight) + "px !important;overflow-y:hidden;");
        tx[i].addEventListener("input", OnInput, false);
      }

      function OnInput() {
        this.style.height = 0;
        this.style.height = (this.scrollHeight) + "px";
      }
    }, 500);
  }

  getTypeText(key: number) {
    return Utils.getPlayerHistoryTypeText(key);
  }

  async getHistoryInfo(): Promise<void> {
    this.attendance = (await this.db.getPlayerAttendance(this.player.id, this.hasLeft)).filter((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs()));
    this.perc = Math.round(this.attendance.filter((att: PersonAttendance) => att.attended).length / this.attendance.length * 100);

    this.lateCount = this.attendance.filter((a) => a.text === "L").length;
    this.history = this.attendance.map((att: PersonAttendance) => {
      return {
        date: att.date,
        text: att.text,
        type: PlayerHistoryType.ATTENDANCE,
        title: att.title,
        notes: att.notes,
      };
    }).concat(this.existingPlayer.history.filter(async (his: PlayerHistoryEntry) => dayjs(await this.db.getCurrentAttDate()).isBefore(dayjs(his.date))).map((his: PlayerHistoryEntry) => { return { ...his, title: "", notes: "" }; })).sort((a: PlayerHistoryEntry, b: PlayerHistoryEntry) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  onInstrumentChange(byUser = true) {
    if (byUser) {
      this.onChange();
    }
    this.teachers = this.allTeachers.filter((t: Teacher) => t.instruments.includes(this.player.instrument));
  }

  formatDate(value: string) {
    return format(parseISO(value || new Date().toISOString()), 'dd.MM.yyyy');
  }

  async dismiss(): Promise<void> {
    if (this.hasChanges) {
      const alert = await this.alertController.create({
        header: 'Änderungen verwerfen?',
        message: 'Möchtest du die ungespeicherten Änderungen wirklich verwerfen?',
        buttons: [
          {
            text: 'Abbrechen',
          }, {
            text: 'Ja',
            handler: () => {
              this.modalController.dismiss();
            }
          }
        ]
      });

      await alert.present();
    } else {
      this.modalController.dismiss();
    }
  }

  async addPerson(): Promise<void> {
    if (this.player.firstName && this.player.lastName) {
      if (this.isConductor) {
        await this.db.addConductor(this.player);
      } else {
        await this.db.addPlayer(this.player);
      }
      this.modalController.dismiss({
        conductor: this.isConductor,
      });
      Utils.showToast(`Der ${this.isConductor ? "Dirigten" : "Spieler"} wurde erfolgreich hinzugefügt`, "success");
    } else {
      Utils.showToast("Bitte gib den Vornamen und Nachnamen an.", "danger");
    }
  }

  async updatePlayer(): Promise<void> {
    if (this.player.email?.length && this.player.email !== this.existingPlayer.email && !Utils.validateEmail(this.player.email)) {
      Utils.showToast("Bitte gib eine valide E-Mail Adresse ein...", "danger");
      return;
    }

    const history = this.player.history;
    if (this.solved) {
      history.push({
        date: new Date().toISOString(),
        text: this.notes,
        type: this.player.criticalReason,
      });
    }

    if (this.existingPlayer.instrument !== this.player.instrument) {
      history.push({
        date: new Date().toISOString(),
        text: `${this.instruments.find((ins: Instrument) => ins.id === this.existingPlayer.instrument).name} -> ${this.instruments.find((ins: Instrument) => ins.id === this.player.instrument).name}`,
        type: PlayerHistoryType.INSTRUMENT_CHANGE,
      });
    }

    if (this.isConductor) {
      await this.db.updateConductor(this.player);
      this.modalController.dismiss({
        conductor: true,
      });
      Utils.showToast("Die Dirigentendaten wurden erfolgreich aktualisiert.", "success");
    } else {
      if ((this.existingPlayer.notes || "") !== this.player.notes) {
        history.push({
          date: new Date().toISOString(),
          text: this.existingPlayer.notes || "Keine Notiz",
          type: PlayerHistoryType.NOTES,
        });
      }

      await this.db.updatePlayer({
        ...this.player,
        isCritical: this.solved ? false : this.player.isCritical,
        lastSolve: this.solved ? new Date().toISOString() : this.player.lastSolve,
      });
      this.modalController.dismiss();
      Utils.showToast("Die Spielerdaten wurden erfolgreich aktualisiert.", "success");
    }
  }

  onChange() {
    if (!this.readOnly && this.existingPlayer) {
      const existingPerson: Player = { ...this.existingPlayer, email: this.player.email === null ? null : this.existingPlayer.email || "", teacherName: this.player.teacherName, notes: this.player.notes === null ? null : this.existingPlayer.notes || "", criticalReasonText: this.player.criticalReasonText };

      this.hasChanges =
        this.solved ||
        JSON.stringify(existingPerson) !== JSON.stringify(this.player);
    }
  }

  onBirthdayChange(value: string, modal: IonModal) {
    this.onChange();
    this.player.correctBirthday = true;

    if (parseInt(this.birthdayString.substring(0, 2), 10) !== dayjs(this.player.birthday).date()) {
      modal.dismiss();
    }

    this.birthdayString = this.formatDate(value);
  }

  onPlaysSinceChange(value: string, modal: IonModal) {
    this.onChange();

    if (parseInt(this.playsSinceString.substring(0, 2), 10) !== dayjs(this.player.playsSince).date()) {
      modal.dismiss();
    }

    this.playsSinceString = this.formatDate(value);
  }

  onJoinedChange(value: string, modal: IonModal) {
    this.onChange();

    if (parseInt(this.joinedString.substring(0, 2), 10) !== dayjs(this.player.joined).date()) {
      modal.dismiss();
    }

    this.joinedString = this.formatDate(value);
  }

  async removeHis(his: PlayerHistoryEntry, slider: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Eintrag unwiderruflich entfernen?',
      buttons: [
        {
          text: 'Abbrechen',
          handler: () => slider.close()
        }, {
          text: 'Ja',
          handler: async () => {
            const history = this.player.history.filter((h: PlayerHistoryEntry) => h.date !== his.date);

            try {
              const res = await this.db.updatePlayerHistory(
                this.player.id,
                history,
              );
              this.existingPlayer = { ...res } as any;
              this.player.history = res.history as any;
              this.getHistoryInfo();
              Utils.showToast("Eintrag wurde erfolgreich entfernt.", "success");
            } catch {
              Utils.showToast("Fehler beim Löschen des Eintrags.", "danger");
            }

            slider.close();
          }
        }
      ]
    });

    await alert.present();
  }

  async register() {
    const loading: HTMLIonLoadingElement = await this.loadingController.create();
    loading.present();

    try {
      await this.db.createAccount(this.player, this.isConductor ? SupabaseTable.CONDUCTORS : SupabaseTable.PLAYER);
      await this.modalController.dismiss({
        conductor: this.isConductor,
      });
      Utils.showToast("Account wurde erfolgreich angelegt", "success");
      await loading.dismiss();
    } catch (error) {
      Utils.showToast(error.message, "danger");
      await loading.dismiss();
    }
  }

  async changeImg() {
    const additionalButtons: {}[] = [];

    if (this.player.img !== DEFAULT_IMAGE) {
      additionalButtons.push({
        text: 'Profilbild entfernen',
        handler: () => {
          this.db.removeImage(this.player.id, this.player.img.split("/")[this.player.img.split("/").length - 1], this.isConductor);
          this.player.img = DEFAULT_IMAGE;
          Utils.showToast("Das Profilbild wurde erfolgreich entfernt", "success");
        }
      });
    }

    const actionSheet = await this.actionSheetController.create({
      buttons: [{
        text: 'Profilbild ersetzen',
        handler: () => {
          this.chooser.nativeElement.click();
        }
      }, ...additionalButtons, {
        text: 'Abbrechen'
      }]
    });

    await actionSheet.present();
  }

  async onImageSelect(evt: any) {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const imgFile: File = evt.target.files[0];

    if (imgFile) {
      if (imgFile.type.substring(0, 5) === 'image') {
        const reader: FileReader = new FileReader();

        reader.readAsDataURL(imgFile);

        try {
          const url: string = await this.db.updateImage(this.player.id, imgFile, this.isConductor);
          this.player.img = url;
        } catch (error) {
          Utils.showToast(error, "danger");
        }
      } else {
        loading.dismiss();
        Utils.showToast("Fehler beim ändern des Profilbildes, versuche es später erneut", "danger");
      }
    }
  }

  getAttText(text: string) {
    return text === 'X' ? '✓' :
      text === 'L' ? 'L' :
        (this.isConductor || text === 'E') ? 'E' : 'A';
    // if (text === "X") {
    //   return "✓";
    // }else if(text === 'L') {
    //   return 'L';
    // } else {
    //   return this.isConductor || text === "E" ? "E" : "A";
    // }
  }

  async onHisItemClicked(his: PlayerHistoryEntry) {
    if (his.type === PlayerHistoryType.NOTES) {
      const alert = await this.alertController.create({
        header: 'Notiz geändert',
        subHeader: dayjs(his.date).format("DD.MM.YYYY"),
        message: `Alte Notiz: ${his.text}`,
        buttons: ['Ok']
      });

      await alert.present();
    }
  }

}
