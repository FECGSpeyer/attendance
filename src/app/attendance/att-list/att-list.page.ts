import { Component, OnInit, effect } from '@angular/core';
import { AlertController, IonItemSliding, IonModal, IonRouterOutlet, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Attendance, PersonAttendance, Player, Song, History, Person } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import 'jspdf-autotable';
import { AttendanceStatus, DefaultAttendanceType, Role } from 'src/app/utilities/constants';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AttendancePage } from '../attendance/attendance.page';
require('dayjs/locale/de');

@Component({
  selector: 'app-att-list',
  templateUrl: './att-list.page.html',
  styleUrls: ['./att-list.page.scss'],
})
export class AttListPage implements OnInit {
  public dates: string[] = [new Date().toISOString()];
  public dateString: string = format(new Date(), 'dd.MM.yyyy');
  public type: string = 'uebung';
  public attendances: Attendance[] = [];
  public oldAttendances: Attendance[] = [];
  public allAttendances: Attendance[] = [];
  public currentAttendance: Attendance;
  public isConductor: boolean = false;
  public isHelper: boolean = false;
  public isChoir: boolean = false;
  public isGeneral: boolean = false;
  public notes: string;
  public typeInfo: string;
  public perc: number = 0;
  private sub: RealtimeChannel;
  private persSub: RealtimeChannel;
  public songs: Song[] = [];
  public selectedSongs: number[] = [];
  public hasNeutral: boolean = false;
  public saveInHistory: boolean = true;
  public historyEntry: History = {
    songId: 1,
    person_id: 0,
    date: new Date().toISOString(),
  };
  public holidays: { schoolHolidays: any[], publicHolidays: any[] } = { schoolHolidays: [], publicHolidays: [] };
  public activeConductors: Person[] = [];
  public otherConductor: number = 9999999999;
  public historyEntries: History[] = [];

  highlightedDates = (isoString: string) => {
    const date = new Date(isoString);
    const day = date.getDay();

    const att = this.allAttendances.find((att: Attendance) => dayjs(att.date).isSame(dayjs(date), 'day'));
    if (att) {
      switch (att.type) {
        case "uebung":
          return {
            textColor: 'var(--ion-color-primary)',
            backgroundColor: 'rgb(var(--ion-color-primary-rgb), 0.18)',
          };
        case "vortrag":
          return {
            textColor: 'var(--ion-color-success)',
            backgroundColor: 'rgb(var(--ion-color-success-rgb), 0.18)',
          };
        case "hochzeit":
          return {
            textColor: 'var(--ion-color-warning)',
            backgroundColor: 'rgb(var(--ion-color-warning-rgb), 0.18)',
          };
        case "sonstiges":
          return {
            textColor: 'var(--ion-color-secondary)',
            backgroundColor: 'rgb(var(--ion-color-secondary-rgb), 0.18)',
          };
        default:
          return undefined;
      }
    }

    if (this.holidays.publicHolidays.find(h => {
      if (dayjs(date).isSame(dayjs(h.startDate), 'day')) { return true; }
      if (dayjs(date).isSame(dayjs(h.endDate), 'day')) { return true; }
      if (dayjs(date).isAfter(dayjs(h.startDate)) && dayjs(date).isBefore(dayjs(h.endDate))) { return true; }
      return false;
    })) {
      return {
        textColor: 'var(--ion-color-danger)',
        backgroundColor: 'rgb(var(--ion-color-danger-rgb), 0.18)',
      };
    }

    if (this.holidays.schoolHolidays.find(h => {
      if (dayjs(date).isSame(dayjs(h.startDate), 'day')) { return true; }
      if (dayjs(date).isSame(dayjs(h.endDate), 'day')) { return true; }
      if (dayjs(date).isAfter(dayjs(h.startDate)) && dayjs(date).isBefore(dayjs(h.endDate))) { return true; }
      return false;
    })) {
      return {
        textColor: 'var(--ion-color-medium)',
        backgroundColor: 'rgb(var(--ion-color-medium-rgb), 0.18)',
      };
    }

    // if (day === 0 || day === 6) {
    //   return {
    //     textColor: 'rgb(var(--ion-color-medium-rgb), .5)',
    //   };
    // }

    return undefined;
  };

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
    private routerOutlet: IonRouterOutlet,
  ) {
    effect(async () => {
      this.db.tenant();
      await this.getAttendance();
    });
  }

  async logout() {
    await this.db.logout();
  }

  async ngOnInit() {
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
    const conductors = await this.db.getConductors(true);
    this.activeConductors = conductors.filter((con: Person) => !con.left);
    this.historyEntry.person_id = this.activeConductors[0]?.id;
    await this.getAttendance();

    if (this.db.tenant().showHolidays && this.db.tenant().region) {
      this.holidays = await this.db.getHolidays(this.db.tenant().region);
    }

    this.subscribeOnAttChannel();

    this.songs = await this.db.getSongs();
  }

  subscribeOnAttChannel() {
    this.sub = this.db.getSupabase()
      .channel('att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (event: any) => {
          if (event.new?.tenantId === this.db.tenant().id || event.old?.id) {
            this.getAttendance();
          }
        })
      .subscribe();

    this.persSub = this.db.getSupabase()
      .channel('person-att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'person_attendances' },
        (event: any) => {
          if (event.new?.tenantId === this.db.tenant().id) {
            this.getAttendance();
          }
        })
      .subscribe();
  }

  async ngOnDestroy() {
    await this.sub.unsubscribe();
    await this.persSub.unsubscribe();
  }

  async getAttendance(): Promise<void> {
    const attendances: Attendance[] = (await this.db.getAttendance(false, true)).map((att: Attendance): Attendance => {
      return {
        ...att,
        percentage: Utils.getPercentage(att.persons),
      }
    });

    this.allAttendances = attendances;
    this.attendances = attendances.filter((att: Attendance) => dayjs(att.date).isAfter(dayjs().startOf("day"))).reverse();
    this.oldAttendances = attendances.filter((att: Attendance) => dayjs(att.date).isBefore(dayjs().startOf("day")));
    if (this.attendances.length) {
      this.currentAttendance = { ...this.attendances[0] };
      this.attendances.splice(0, 1);
    } else {
      this.currentAttendance = undefined;
    }

    if (this.oldAttendances.length) {
      this.perc = Math.round((this.oldAttendances.reduce((value: number, current: Attendance) => value + current.percentage, 0)) / this.oldAttendances.length);
    }
  }

  async remove(id: number, slider: IonItemSliding): Promise<void> {
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Möchtest du die Anwesenheit wirklich entfernen?",
      buttons: [{
        text: "Abrrechen",
      }, {
        text: "Fortfahren",
        handler: async (): Promise<void> => {
          slider.close();
          await this.db.removeAttendance(id);
        }
      }]
    });

    await alert.present();
  }

  onDateChanged(value: string | string[], dateModal: IonModal): void {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      this.dateString = 'Kein Datum ausgewählt';
      return;
    }

    this.dateString = value.length === 1 ? this.formatDate(value[0]) : `${value.length} Termine ausgewählt`;
  }

  async addAttendance(modal: IonModal): Promise<void> {
    if (!this.dates?.length) {
      Utils.showToast("Bitte wähle mindestens ein Datum aus", "warning");
      return;
    }

    const loading = await Utils.getLoadingElement();
    await loading.present();

    let persons: PersonAttendance[] = [];
    const allPlayers = (await this.db.getPlayers()).filter((player: Player) => !player.paused);

    for (const date of this.dates) {
      const attendance_id: number = await this.db.addAttendance({
        date: date,
        type: this.type,
        notes: this.notes,
        typeInfo: this.typeInfo,
        save_in_history: this.saveInHistory,
      });

      for (const player of allPlayers) {
        persons.push({
          attendance_id,
          person_id: player.id,
          status: this.hasNeutral ? AttendanceStatus.Neutral : AttendanceStatus.Present,
          notes: '',
        });
      }

      await this.db.addPersonAttendances(persons);
      persons = [];
      if (this.historyEntries.length) {
        await this.db.addSongsToHistory(this.historyEntries.map((entry: History) => {
          return {
            ...entry,
            attendance_id,
            visible: this.saveInHistory,
            date: date,
            tenantId: this.db.tenant().id,
          }
        }));
      }
    }

    await loading.dismiss();
    Utils.showToast(this.dates.length === 1 ? "Anwesenheit hinzugefügt" : "Anwesenheiten hinzugefügt", "success");
    await modal.dismiss();

    this.notes = '';
    this.type = 'uebung';
    this.dates = [new Date().toISOString()];
    this.typeInfo = '';
    this.dateString = format(new Date(), 'dd.MM.yyyy');
    this.selectedSongs = [];
    this.historyEntries = [];
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  getTypeText(key: string, notes: string): string {
    if (key === "sonstiges" && notes) {
      return notes;
    }

    return Utils.getTypeText(key);
  }

  getReadableDate(date: string): string {
    dayjs.locale("de");
    return dayjs(date).format("ddd, DD.MM.YYYY");
  }

  async openAttendance(attendance): Promise<void> {
    if (!this.isConductor && !this.isHelper) {
      return;
    }

    this.sub?.unsubscribe();
    this.persSub?.unsubscribe();

    const modal = await this.modalController.create({
      component: AttendancePage,
      componentProps: {
        attendanceId: attendance.id,
      },
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
    await modal.onWillDismiss();
    await this.getAttendance();
    this.subscribeOnAttChannel();
  }

  onTypeChange(): void {
    this.hasNeutral = this.type !== 'uebung';
    this.saveInHistory = this.type !== 'uebung';
  }

  addSong(modal: IonModal): void {
    for (const songId of this.selectedSongs) {
      this.historyEntries.push({
        ...this.historyEntry,
        songId: Number(songId),
        person_id: Boolean(this.historyEntry.otherConductor) ? null : this.historyEntry.person_id,
      });
    }

    this.selectedSongs = [];
    this.historyEntry = {
      person_id: this.activeConductors[0]?.id,
      otherConductor: undefined,
      date: this.historyEntry.date,
      songId: 1,
    };

    modal.dismiss();
  }

  getSongInfo(entry: History): string {
    const song: Song = this.songs.find((s: Song) => s.id === entry.songId);
    if (!song) {
      return "Unbekanntes Lied";
    }
    return `${song.number} ${song.name}`;
  }

  getConductorInfo(entry: History): string {
    if (entry.otherConductor) {
      return entry.otherConductor;
    }

    const conductor: Person | undefined = this.activeConductors.find((con: Person) => con.id === entry.person_id);
    if (!conductor) {
      return "Unbekannter Dirigent";
    }
    return `${conductor.firstName} ${conductor.lastName}`;
  }

  async onConChange() {
    if (this.historyEntry.person_id === this.otherConductor) {
      const alert = await this.alertController.create({
        header: 'Dirigent eingeben',
        inputs: [
          {
            type: "text",
            name: "conductor",
            placeholder: "Dirigent",
          }
        ],
        buttons: ["Abbrechen", {
          text: "Speichern",
          handler: (data: any) => {
            this.historyEntry.otherConductor = data.conductor;
          }
        }]
      });

      await alert.present();
    } else {
      delete this.historyEntry.otherConductor;
    }
  }
}
