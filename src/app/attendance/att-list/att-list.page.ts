import { Component, OnInit, effect } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { AlertController, IonItemSliding, IonModal, IonRouterOutlet, ModalController } from '@ionic/angular';
import { format, isSameDay, parseISO } from 'date-fns';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { DbService } from 'src/app/services/db.service';
import { Attendance, PersonAttendance, Player, Song, History, Person, ChecklistItem } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import 'jspdf-autotable';
import { DefaultAttendanceType, Role } from 'src/app/utilities/constants';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AttendancePage } from '../attendance/attendance.page';

@Component({
    selector: 'app-att-list',
    templateUrl: './att-list.page.html',
    styleUrls: ['./att-list.page.scss'],
    standalone: false
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
  public loaded: boolean = false;
  public allDayDuration: number = 1;
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
  public isAddModalOpen: boolean = false;

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
      await this.init();
    });

    effect(() => {
      this.type_id = this.db.attendanceTypes().find(type => type.visible)?.id;
    });
  }

  async ngOnInit() {
    await this.init();
  }

  async init(): Promise<void> {
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER || this.db.tenantUser().role === Role.VOICE_LEADER_HELPER;
    await this.getAttendance();

    if (this.db.tenant().showHolidays && this.db.tenant().region) {
      this.holidays = await this.db.getHolidays(this.db.tenant().region);
    }

    this.subscribeOnAttChannel();

    await this.loadSongData();
  }

  async loadSongData(): Promise<void> {
    this.songs = await this.db.getSongs();
    const conductors = await this.db.getConductors(true);
    this.activeConductors = conductors.filter((con: Person) => !con.left);
    this.historyEntry.person_id = this.activeConductors[0]?.id;
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

  async handleRefresh(event: any): Promise<void> {
    await this.getAttendance();
    event.target.complete();
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

    this.type_id = this.db.attendanceTypes().find(type => type.visible)?.id;
    this.highlightedTypes = this.db.attendanceTypes().filter(type => type.highlight).map(type => type.id);

    this.loaded = true;
  }

  async remove(id: number, slider: IonItemSliding): Promise<void> {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* Haptics not available in PWA */ }
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Möchtest du die Anwesenheit wirklich entfernen?",
      buttons: [{
        text: "Abbrechen",
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

    if (attType.additional_fields_filter?.key && attType.additional_fields_filter?.option && this.db.tenant().additional_fields?.find(field => field.id === attType.additional_fields_filter.key)) {
      allPersons = allPersons.filter((player: Player) => {
        const defaultValue = this.db.tenant().additional_fields.find(field => field.id === attType.additional_fields_filter.key)?.defaultValue;
        const additionalField = player.additional_fields[attType.additional_fields_filter.key] ?? defaultValue;
        return additionalField === attType.additional_fields_filter.option;
      });
    }

    const status = attType.default_status;

    const type = this.db.attendanceTypes().find(type => type.id === this.type_id);

    if (!type) {
      Utils.showToast("Ungültiger Anwesenheitstyp ausgewählt", "danger");
      await loading.dismiss();
      return;
    }

    for (const date of this.dates) {
      // Normalize date to noon (12:00) to avoid timezone issues between 22:00-02:00
      const normalizedDate = dayjs(date).hour(12).minute(0).second(0).millisecond(0).toISOString();

      // Prepare checklist with calculated due dates
      let checklist: ChecklistItem[] | undefined;
      if (type.checklist && type.checklist.length > 0) {
        const eventDateTime = type.start_time
          ? dayjs(normalizedDate).hour(Number(type.start_time.substring(0, 2))).minute(Number(type.start_time.substring(3, 5)))
          : dayjs(normalizedDate).hour(19).minute(0);

        checklist = type.checklist.map((item: ChecklistItem) => ({
          id: crypto.randomUUID(),
          text: item.text,
          deadlineHours: item.deadlineHours,
          completed: false,
          dueDate: item.deadlineHours !== null
            ? eventDateTime.subtract(item.deadlineHours, 'hour').toISOString()
            : null,
        }));
      }

      const attendance_id: number = await this.db.addAttendance({
        date: normalizedDate,
        type_id: this.type_id,
        notes: this.notes,
        save_in_history: true,
        typeInfo: this.typeInfo,
        start_time: type.start_time,
        end_time: type.end_time,
        duration_days: this.allDayDuration,
        checklist,
      });

      for (const player of allPersons) {
        let playerStatus = status;
        let notes = '';
        if (player.shift_id && !type.all_day) {
          const shift = this.db.shifts().find(s => s.id === player.shift_id);

          const result = Utils.getStatusByShift(
            shift,
            date,
            type.start_time || '19:00',
            type.end_time || '21:00',
            status,
            player.shift_start,
            player.shift_name,
          );

          playerStatus = result.status;
          notes = result.note;
        }

        persons.push({
          attendance_id,
          person_id: player.id,
          status: playerStatus,
          notes,
        });
      }

      await this.db.addPersonAttendances(persons);
      persons = [];
      if (this.historyEntries.length) {
        await this.db.addSongsToHistory(this.historyEntries.map((entry: History) => {
          return {
            ...entry,
            attendance_id,
            visible: true,
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

  onTypeChange(): void {
    const attType = this.db.attendanceTypes().find(type => type.id === this.type_id);
    this.allDayDuration = attType.all_day ? attType.duration_days : 1;
  }

  isAllDay(): boolean {
    const attType = this.db.attendanceTypes().find(type => type.id === this.type_id);
    return attType?.all_day || false;
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  onDateClick() {
    if (this.dates.length === 1 && isSameDay(new Date(this.dates[0]), new Date())) {
      this.dates = [];
      this.dateString = 'Kein Datum ausgewählt';
      Utils.showToast("Das aktuelle Datum wurde deselektiert", "light", 3000);
    }
  }

  getReadableDate(date: string, type_id: string): string {
    return Utils.getReadableDate(date, this.db.attendanceTypes().find(type => type.id === type_id));
  }

  getAttendanceTitle(att: Attendance): string {
    if (att.typeInfo) {
      return `${this.getReadableDate(att.date, att.type_id)} | ${att.typeInfo}`;
    }

    const attType = this.db.attendanceTypes().find(type => type.id === att.type_id);

    if (attType.hide_name) {
      return this.getReadableDate(att.date, att.type_id);
    }

    return `${this.getReadableDate(att.date, att.type_id)} | ${attType.name}`;
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
    return Boolean(this.db.attendanceTypes().find(type => type.id === this.type_id && type.manage_songs));
  }

  getCountText(att: Attendance) {
    return Math.round((att.percentage / 100) * att.persons.length) + " von " + att.persons.length + " anwesend";
  }
}
