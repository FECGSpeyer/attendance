/* eslint-disable arrow-body-style */
import { Component, effect, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, AlertController, IonAccordionGroup, IonModal, isPlatform } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus, Role } from 'src/app/utilities/constants';
import { Attendance, PersonAttendance, Player, Song, Tenant, History, SongFile, AttendanceType } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-signout',
  templateUrl: './signout.page.html',
  styleUrls: ['./signout.page.scss'],
})
export class SignoutPage implements OnInit {
  @ViewChild('signoutAccordionGroup') signoutAccordionGroup: IonAccordionGroup;
  @ViewChild('excuseModal') excuseModal: IonModal;
  public player: Player;
  public attendances: Attendance[] = [];
  public personAttendances: PersonAttendance[] = [];
  public actualAttendances: PersonAttendance[] = [];
  public currentAttendance: PersonAttendance;
  public selAttIds: string[] = [];
  public reason: string;
  public perc: number;
  public name: string;
  public isLateComingEvent: boolean;
  public reasonSelection;
  public signoutTitle: string;
  public lateCount: number = 0;
  public songs: Song[] = [];
  public tenantId: number;
  public tenants: Tenant[] = [];
  public songsModalOpen: boolean = false;
  public upcomingSongs: { date: string; history: History[] }[] = [];

  constructor(
    public db: DbService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController
  ) {
    effect(async () => {
      if (this.db.tenant()) {
        this.initialize();
      }
    });
  }

  async ngOnInit() {
    await this.initialize();
  }

  async initialize() {
    this.name = this.db.tenant().longName;
    this.tenants = this.db.tenants();
    this.tenantId = this.db.tenant().id;
    if (this.db.tenantUser() && this.db.tenantUser().role === Role.NONE || this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.HELPER) {
      this.player = await this.db.getPlayerByAppId();
      this.songs = await this.db.getSongs();
      await this.getAttendances();
    }

    this.upcomingSongs = await this.db.getCurrentSongs();
  }

  async signout() {
    await this.db.signout(this.selAttIds, this.reason, this.isLateComingEvent);

    this.excuseModal.dismiss();
    this.reason = "";

    Utils.showToast(this.isLateComingEvent ? "Vielen Dank für die Info und Gottes Segen dir!" : "Vielen Dank für deine rechtzeitige Abmeldung und Gottes Segen dir.", "success", 4000);

    this.reasonSelection = '';

    await this.getAttendances();
  }

  async showNoteAlertForSignin(attendance: PersonAttendance) {
    let note = '';
    const alert = await this.alertController.create({
      header: 'Notiz für Anmeldung',
      inputs: [
        {
          name: 'note',
          type: 'textarea',
          placeholder: 'Gib hier deine Notiz ein',
          value: note,
        },
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
        },
        {
          text: 'Anmelden',
          handler: (data) => {
            note = data.note;
            this.signin(attendance, note);
          },
        },
      ],
    });

    await alert.present();
  }

  async signin(attendance: PersonAttendance, notes: string = "") {
    await this.db.signin(
      attendance.id,
      attendance.status === AttendanceStatus.LateExcused ? 'lateSignIn' : attendance.status === AttendanceStatus.Neutral ? "neutralSignin" : 'signin',
      notes
    );

    Utils.showToast("Schön, dass du dabei bist 🙂", "success", 4000);

    await this.getAttendances();
  }

  async getAttendances() {
    const allPersonAttendances = (await this.db.getPersonAttendances(this.player.id)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (!this.player.paused) {
      this.selAttIds = [];
    }

    this.personAttendances = allPersonAttendances;

    const vergangene: PersonAttendance[] = this.personAttendances.filter((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs().startOf("day")));
    if (vergangene.length) {
      this.lateCount = vergangene.filter((a) => a.status === AttendanceStatus.Late).length;
      const vergangeneToCalcPerc = vergangene.filter((att: PersonAttendance) => {
        const type = this.db.attendanceTypes().find((t) => t.id === att.typeId);
        return type?.include_in_average ?? true;
      });
      vergangene[0].showDivider = true;
      const attended = vergangeneToCalcPerc.filter((att: PersonAttendance) => att.attended);
      this.perc = Math.round(
        attended.length / vergangeneToCalcPerc.length * 100);
    }

    this.actualAttendances = allPersonAttendances.filter((att: PersonAttendance) => dayjs(att.date).isAfter(dayjs().startOf("day"))).reverse();
    if (this.actualAttendances.length) {
      this.currentAttendance = this.actualAttendances[0];
      this.actualAttendances.splice(0, 1);
    }
  }

  async presentActionSheetForChoice(attendance: PersonAttendance) {
    this.reasonSelection = 'Krankheitsbedingt';
    let buttons = [
      {
        text: 'Anmelden',
        handler: () => this.signin(attendance),
      },
      {
        text: 'Anmelden mit Notiz',
        handler: () => this.showNoteAlertForSignin(attendance),
      },
      {
        text: 'Abmelden',
        handler: () => {
          if (this.isAttToday(attendance)) {
            this.reasonSelection = 'Sonstiger Grund';
            this.reason = '';
          } else {
            this.reason = 'Krankheitsbedingt';
          }
          this.excuseModal.present();
          this.isLateComingEvent = false;
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Verspätung eintragen',
        handler: () => {
          if (this.isAttToday(attendance)) {
            this.reasonSelection = 'Sonstiger Grund';
            this.reason = '';
          } else {
            this.reason = 'Krankheitsbedingt';
          }
          this.excuseModal.present();
          this.isLateComingEvent = true;
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Abbrechen',
        handler: () => { },
        role: 'destructive',
        data: {
          action: 'cancel',
        },
      },
    ];

    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === attendance.typeId);

    let canSignin = true;
    if (attendance.attendance.deadline) {
      const deadline = dayjs(attendance.attendance.deadline);
      const localDeadline = deadline.subtract(dayjs().utcOffset(), 'minute');
      const now = dayjs();
      if (now.isAfter(localDeadline)) {
        canSignin = false;
      }
    }

    if (attendance.text === "X" || !canSignin) {
      buttons = buttons.filter((btn) => btn.text !== 'Anmelden' && btn.text !== 'Anmelden mit Notiz');
    } else if (attType && !attType.available_statuses.includes(AttendanceStatus.Excused)) {
      buttons = buttons.filter((btn) => btn.text !== 'Abmelden');
    } else if (attType && !attType.available_statuses.includes(AttendanceStatus.Late)) {
      buttons = buttons.filter((btn) => btn.text !== 'Verspätung eintragen');
    }

    if (buttons.length <= 1) {
      Utils.showToast("Für diesen Termin sind keine Aktionen verfügbar.", "warning", 4000);
      return;
    }

    this.selAttIds = [attendance.id];
    const actionSheet = await this.actionSheetController.create({
      buttons,
    });

    await actionSheet.present();
  }

  onReasonSelect(event) {
    const currentReasonSelection = event.detail.value;
    if (!currentReasonSelection) return;

    if (currentReasonSelection !== 'Sonstiger Grund') {
      this.excuseModal.setCurrentBreakpoint(0.3);
      this.reason = currentReasonSelection;
    } else {
      this.excuseModal.setCurrentBreakpoint(0.4);
      this.reason = '';
    }
  }

  dismissExcuseModal() {
    this.excuseModal.dismiss();
  }

  increaseModalBreakpoint() {
    this.excuseModal.setCurrentBreakpoint(0.8);
  }

  decreaseModalBreakpoint() {
    this.excuseModal.setCurrentBreakpoint(0.4);
  }

  attHasPassed(att: PersonAttendance) {
    return dayjs(att.date).isBefore(dayjs(), "day");
  }

  attIsInFuture(att: PersonAttendance) {
    return dayjs(att.date).isAfter(dayjs(), "day");
  }

  isAttToday(att: PersonAttendance) {
    return dayjs(att.date).isSame(dayjs(), "day");
  }

  getReadableDate(date: string): string {
    dayjs.locale("de");
    return dayjs(date).format("ddd, DD.MM.YYYY");
  }

  async handleRefresh(event) {
    await this.getAttendances();

    event.target.complete();
  }

  getSongNames(songIds: number[]): string {
    return songIds.map((id: number) => {
      return `${this.songs.find((s: Song) => s.id === id).number} ${this.songs.find((s: Song) => s.id === id).name}`;
    }).join(", ");
  }

  isReasonSelectionInvalid(reason: string): boolean {
    if (!(reason && reason.length > 4) || /\S/.test(reason) === false) {
      return true;
    }
    return false;
  }

  openSongLink(link: string) {
    if (link) {
      window.open(link, "_blank");
    }
  }

  async openSongOptions(song: Song) {
    if (!song.instrument_ids.includes(this.player.instrument)) {
      Utils.showToast("Für dein Instrument sind leider keine Noten verfügbar.", "danger", 4000);
    }

    const buttons = [];

    if (song.link) {
      buttons.push({
        text: 'Notenlink öffnen',
        handler: () => this.openSongLink(song.link),
      });
    }

    const files = song.files.filter((file: SongFile) => file.instrumentId === this.player.instrument)

    if (files.length === 1) {
      if (!isPlatform('ios')) {
        buttons.push({
          text: 'Noten downloaden',
          handler: async () => {
            const file = song.files.find(f => f.instrumentId === this.player.instrument);
            if (file) {
              const blob = await this.db.downloadSongFile(file.storageName, song.id);
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = file.fileName;
              a.click();
              window.URL.revokeObjectURL(url);
            }
          },
        });
      }

      buttons.push({
        text: 'Noten anzeigen',
        handler: () => {
          const file = song.files.find(f => f.instrumentId === this.player.instrument);
          if (file) {
            window.open(file.url, "_blank");
          }
        },
      });
    } else if (files.length > 1) {
      if (!isPlatform('ios')) {
        buttons.push({
          text: 'Noten downloaden',
          handler: async () => {
            const fileOptions = files.map((file: SongFile) => {
              return {
                text: file.fileName,
                role: '',
                handler: async () => {
                  const blob = await this.db.downloadSongFile(file.storageName, song.id);
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = file.fileName;
                  a.click();
                  window.URL.revokeObjectURL(url);
                },
              };
            });

            fileOptions.push({
              text: 'Abbrechen',
              role: 'destructive',
              handler: () => Promise.resolve(),
            });

            const fileActionSheet = await this.actionSheetController.create({
              header: `Noten für ${song.number}. ${song.name} auswählen`,
              buttons: fileOptions,
            });

            await fileActionSheet.present();
          },
        });
      }

      buttons.push({
        text: 'Noten anzeigen',
        handler: async () => {
          const fileOptions = files.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: () => {
                window.open(file.url, "_blank");
              },
            };
          });

          fileOptions.push({
            text: 'Abbrechen',
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetController.create({
            header: `Noten für ${song.number}. ${song.name} auswählen`,
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });
    }

    if (song.files.find(f => f.instrumentId === 1)) {
      buttons.push({
        text: 'Aufnahme anhören',
        handler: () => {
          const file = song.files.find(f => f.instrumentId === 1);
          if (file) {
            window.open(file.url, "_blank");
          }
        },
      });
    }

    buttons.push({
      text: 'Abbrechen',
      handler: () => { },
      role: 'destructive',
      data: {
        action: 'cancel',
      },
    });

    if (buttons.length === 1) {
      Utils.showToast("Für dieses Werk sind keine Aktionen verfügbar.", "warning", 4000);
      return;
    }

    const actionSheet = await this.actionSheetController.create({
      header: `${song.number}. ${song.name}`,
      buttons,
    });

    await actionSheet.present();
  }

  showDeadlineInfo(attendance: PersonAttendance): boolean {
    return Boolean(attendance.attendance.deadline);
  }

  getDeadlineText(attendance: PersonAttendance): string {
    const deadline = dayjs(attendance.attendance.deadline);
    const localDeadline = deadline.subtract(dayjs().utcOffset(), 'minute');
    const now = dayjs();

    if (now.isAfter(localDeadline)) {
      return `Anmeldefrist abgelaufen`;
    } else {
      return `Anmeldefrist: ${localDeadline.format('DD.MM.YYYY HH:mm')} Uhr`;
    }
  }
}
