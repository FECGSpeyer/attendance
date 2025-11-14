/* eslint-disable arrow-body-style */
import { Component, effect, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, IonAccordionGroup, IonModal, isPlatform } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus, Role } from 'src/app/utilities/constants';
import { Attendance, PersonAttendance, Player, Song, Tenant, History, SongFile } from 'src/app/utilities/interfaces';
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
    private actionSheetController: ActionSheetController
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

  async signin(attendance: PersonAttendance) {
    await this.db.signin(attendance.id, attendance.status === AttendanceStatus.LateExcused ? 'lateSignIn' : attendance.status === AttendanceStatus.Neutral ? "neutralSignin" : 'signin');

    Utils.showToast("Schön, dass du dabei bist 🙂", "success", 4000);

    await this.getAttendances();
  }

  async getAttendances() {
    const allPersonAttendances = (await this.db.getPersonAttendances(this.player.id)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (!this.player.paused) {
      const allAttendances: Attendance[] = await this.db.getAttendance();

      this.attendances = allAttendances.filter((attendance: Attendance) => {
        if (!dayjs(attendance.date).isAfter(dayjs(), "day")) {
          return false;
        }

        return allPersonAttendances.some((personAtt: PersonAttendance) => {
          return personAtt.person_id === this.player.id &&
            personAtt.status !== AttendanceStatus.Excused && personAtt.status !== AttendanceStatus.LateExcused;
        });
      }).sort((a: Attendance, b: Attendance) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (this.attendances.length) {
        this.selAttIds = [this.attendances[0].id as any];
      } else {
        this.selAttIds = [];
      }
    }

    this.personAttendances = allPersonAttendances;

    const vergangene: PersonAttendance[] = this.personAttendances.filter((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs().startOf("day")));
    if (vergangene.length) {
      this.lateCount = vergangene.filter((a) => a.status === AttendanceStatus.Late).length;
      vergangene[0].showDivider = true;
      const attended = vergangene.filter((att: PersonAttendance) => att.attended);
      this.perc = Math.round(attended.length / vergangene.length * 100);
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

    let attType;
    if (this.db.isBeta()) {
      const att = this.attendances.find((a: Attendance) => a.id === attendance.attId);
      attType = this.db.attendanceTypes().find((type: any) => type.id === att.type_id);
    }

    if (attendance.text === "X") {
      buttons = buttons.filter((btn) => btn.text !== 'Anmelden');
    } else if (attendance.text === "E" || (attType && !attType.available_statuses.includes(AttendanceStatus.Excused))) {
      buttons = buttons.filter((btn) => btn.text !== 'Abmelden');
    } else if (attendance.text === "L" || (attType && !attType.available_statuses.includes(AttendanceStatus.Late))) {
      buttons = buttons.filter((btn) => btn.text !== 'Verspätung eintragen');
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
}
