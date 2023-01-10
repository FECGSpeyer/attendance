import { AfterViewInit, Component, Input, OnInit, ViewChild } from '@angular/core';
import { AlertController, IonContent, IonItemSliding, IonSelect, LoadingController, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import { DbService } from 'src/app/services/db.service';
import { Attendance, Instrument, Person, PersonAttendance, Player, PlayerHistoryEntry, Teacher } from 'src/app/utilities/interfaces';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { environment } from 'src/environments/environment';
import { Utils } from 'src/app/utilities/Utils';
import { PlayerHistoryType } from 'src/app/utilities/constants';
dayjs.extend(utc);

@Component({
  selector: 'app-person',
  templateUrl: './person.page.html',
  styleUrls: ['./person.page.scss'],
})
export class PersonPage implements OnInit, AfterViewInit {
  @Input() existingPlayer: Player;
  @Input() instruments: Instrument[];
  @ViewChild('select') select: IonSelect;
  @ViewChild('content') content: IonContent;

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
  };
  public withSignout: boolean = environment.withSignout;
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
  public showTeachers: boolean = environment.showTeachers;
  public isVoS: boolean = environment.shortName === "VoS";
  public solved: boolean = false;
  public hasChanges: boolean = false;
  public notes: string = "";
  public shouldReload: boolean = false;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
    private loadingController: LoadingController
  ) { }

  async ngOnInit() {
    this.hasChanges = false;
    if (environment.showTeachers) {
      this.teachers = await this.db.getTeachers();
      this.allTeachers = this.teachers;
    }
    if (this.existingPlayer) {
      this.player = { ...this.existingPlayer };
      this.birthdayString = this.formatDate(this.existingPlayer.birthday);
      this.playsSinceString = this.formatDate(this.existingPlayer.playsSince);
      this.joinedString = this.formatDate(this.existingPlayer.joined);
      this.player.teacherName = this.player.teacher ? this.teachers.find((teacher: Teacher) => teacher).name : "";
      this.player.criticalReasonText = this.player.criticalReason ? Utils.getPlayerHistoryTypeText(this.player.criticalReason) : "";

      await this.getHistoryInfo();
    } else {
      this.player = { ...this.newPlayer };
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
    this.attendance = (await this.db.getPlayerAttendance(this.player.id)).filter((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs()));
    this.perc = Math.round(this.attendance.filter((att: PersonAttendance) => att.attended).length / this.attendance.length * 100);

    this.history = this.attendance.map((att: PersonAttendance) => {
      return {
        date: att.date,
        text: att.text,
        type: PlayerHistoryType.ATTENDANCE,
        title: att.title,
        notes: att.notes,
      };
    }).concat(this.existingPlayer.history.map((his: PlayerHistoryEntry) => { return { ...his, title: "", notes: "" }; })).sort((a: PlayerHistoryEntry, b: PlayerHistoryEntry) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  onInstrumentChange(byUser = true) {
    if (byUser) {
      this.onChange();
    }
    this.teachers = this.allTeachers.filter((t: Teacher) => t.instruments.includes(this.player.instrument));
  }

  formatDate(value: string) {
    return format(parseISO(value), 'dd.MM.yyyy');
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
              this.modalController.dismiss({
                added: this.shouldReload
              });
            }
          }
        ]
      });

      await alert.present();
    } else {
      this.modalController.dismiss({
        added: this.shouldReload
      });
    }
  }

  async addPlayer(): Promise<void> {
    if (this.player.firstName && this.player.lastName) {
      await this.db.addPlayer(this.player);
      this.modalController.dismiss({
        added: true
      });
      Utils.showToast("Der Spieler wurde erfolgreich hinzugefügt", "success");
    } else {
      Utils.showToast("Bitte gib den Vornamen und Nachnamen an.", "danger");
    }
  }

  async updatePlayer(): Promise<void> {
    if (this.player.email.length && this.player.email !== this.existingPlayer.email && !Utils.validateEmail(this.player.email)) {
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
    this.modalController.dismiss({
      added: true
    });
    Utils.showToast("Die Spielerdaten wurden erfolgreich aktualisiert.", "success");
  }

  onChange() {
    if (this.existingPlayer) {
      this.hasChanges =
        this.solved ||
        JSON.stringify({ ...this.existingPlayer, email: this.existingPlayer.email || "", teacherName: this.player.teacherName, notes: this.existingPlayer.notes || "", criticalReasonText: this.player.criticalReasonText }) !== JSON.stringify(this.player);
    }
  }

  onBirthdayChange() {
    this.onChange();
    this.player.correctBirthday = true;
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
              this.shouldReload = true;
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
      await this.db.createAccount(this.player);
      await this.modalController.dismiss({
        added: true
      });
      Utils.showToast("Account wurde erfolgreich angelegt", "success");
      await loading.dismiss();
    } catch (error) {
      Utils.showToast(error, "danger");
      await loading.dismiss();
    }
  }

}
