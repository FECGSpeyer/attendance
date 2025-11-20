import { Component, OnInit, effect } from '@angular/core';
import { AlertController, IonItemSliding, IonModal, IonRouterOutlet, ModalController } from '@ionic/angular';
import { format, isSameDay, parseISO } from 'date-fns';
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
  public type_id: string = '';
  public attendances: Attendance[] = [];
  public oldAttendances: Attendance[] = [];
  public viewerAttendances: Attendance[] = [];
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
  public highlightedTypes: string[] = [];

  highlightedDates = (isoString: string) => {
    const date = new Date(isoString);

    const att = this.allAttendances.find((att: Attendance) => dayjs(att.date).isSame(dayjs(date), 'day'));
    if (att?.type_id) {
      const attType = this.db.attendanceTypes().find(type => type.id === att.type_id);
      return {
        textColor: `var(--ion-color-${attType.color})`,
        backgroundColor: `rgb(var(--ion-color-${attType.color}-rgb), 0.18)`,
      };
    }

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
        textColor: 'var(--ion-color-holiday)',
        backgroundColor: 'rgb(var(--ion-color-holiday-rgb), 0.18)',
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
    public db: DbService,
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
    this.viewerAttendances = attendances.filter((att: Attendance) => dayjs(att.date).isBefore(dayjs().startOf("day")));
    if (this.attendances.length) {
      this.currentAttendance = { ...this.attendances[0] };
      this.viewerAttendances.unshift(this.attendances[0]);
      this.attendances.splice(0, 1);
    } else {
      this.currentAttendance = undefined;
    }

    if (this.oldAttendances.length) {
      this.perc = Math.round((this.oldAttendances.reduce((value: number, current: Attendance) => value + current.percentage, 0)) / this.oldAttendances.length);
    }

    if (this.db.isBeta()) {
      this.type_id = this.db.attendanceTypes().find(type => type.visible)?.id;
      this.highlightedTypes = this.db.attendanceTypes().filter(type => type.highlight).map(type => type.id);
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
    let allPersons: Person[];
    let status: AttendanceStatus = this.hasNeutral ? AttendanceStatus.Neutral : AttendanceStatus.Present;

    if (this.db.isBeta()) {
      const attType = this.db.attendanceTypes().find(type => type.id === this.type_id);
      allPersons = (await this.db.getPlayers()).filter((player: Player) => {
        if (player.paused) {
          return false;
        }
        if (attType.relevant_groups.length === 0) {
          return true;
        }
        return attType.relevant_groups.includes(player.instrument);
      });
      status = attType.default_status;
    } else {
      allPersons = (await this.db.getPlayers()).filter((player: Player) => !player.paused);
    }

    for (const date of this.dates) {
      const attendance_id: number = await this.db.addAttendance(this.db.isBeta() ? {
        date: date,
        type_id: this.type_id,
        notes: this.notes,
        save_in_history: true,
        typeInfo: this.typeInfo,
        start_time: this.db.attendanceTypes().find(type => type.id === this.type_id)?.start_time || '19:30', // TODO att type is defined after beta removal
        end_time: this.db.attendanceTypes().find(type => type.id === this.type_id)?.end_time || '21:00',
      } : {
        date: date,
        type: this.type,
        notes: this.notes,
        typeInfo: this.typeInfo,
        save_in_history: this.saveInHistory,
      });

      for (const player of allPersons) {
        persons.push({
          attendance_id,
          person_id: player.id,
          status,
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

  onDateClick() {
    if (this.dates.length === 1 && isSameDay(new Date(this.dates[0]), new Date())) {
      this.dates = [];
      this.dateString = 'Kein Datum ausgewählt';
      Utils.showToast("Das aktuelle Datum wurde deselektiert", "light", 3000);
    }
  }

  getReadableDate(date: string): string {
    dayjs.locale("de");
    return dayjs(date).format("ddd, DD.MM.YYYY");
  }

  getAttendanceTitle(att: Attendance): string {
    if (!att.type_id) {
      if (att.type === 'sonstiges' && att.typeInfo) {
        return `${this.getReadableDate(att.date)} | ${att.typeInfo}`;
      }
      return `${this.getReadableDate(att.date)} | ${Utils.getTypeText(att.type)}`;
    }

    if (att.typeInfo) {
      return `${this.getReadableDate(att.date)} | ${att.typeInfo}`;
    }

    const attType = this.db.attendanceTypes().find(type => type.id === att.type_id);

    if (attType.hide_name) {
      return this.getReadableDate(att.date);
    }

    return `${this.getReadableDate(att.date)} | ${attType.name}`;
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

  showSongsSelection(): boolean {
    return this.db.isBeta() && Boolean(this.db.attendanceTypes().find(type => type.id === this.type_id && type.manage_songs));
  }
}
