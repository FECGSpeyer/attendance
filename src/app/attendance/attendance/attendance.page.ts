import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ConnectionStatus, Network } from '@capacitor/network';
import { AlertController, IonItemSliding, ModalController } from '@ionic/angular';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { format } from 'date-fns';
import * as dayjs from 'dayjs';
import { PlanningPage } from 'src/app/planning/planning.page';
import { DbService } from 'src/app/services/db.service';
import { DefaultAttendanceType, AttendanceStatus, Role, ATTENDANCE_STATUS_MAPPING } from 'src/app/utilities/constants';
import { Attendance, FieldSelection, Person, PersonAttendance, Song, History, Group, GroupCategory, AttendanceType } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-attendance',
  templateUrl: './attendance.page.html',
  styleUrls: ['./attendance.page.scss'],
})
export class AttendancePage implements OnInit {
  @Input() attendanceId: number;
  @ViewChild('chooser') chooser: ElementRef;
  public players: PersonAttendance[] = [];
  public conductors: Person[] = [];
  public excused: Set<string> = new Set();
  public withExcuses: boolean;
  public isOnline = true;
  public attendance: Attendance;
  private sub: RealtimeChannel;
  private personAttSub: RealtimeChannel;
  public isHelper: boolean = false;
  public songs: Song[] = [];
  public selectedSongs: number[] = [];
  public mainGroup: number | undefined;
  public historyEntry: History = {
    songId: 1,
    person_id: 0,
    date: new Date().toISOString(),
  };
  public activeConductors: Person[] = [];
  public otherConductor: number = 9999999999;
  public historyEntries: History[] = [];
  public isGeneral: boolean = false;
  public instruments: Group[] = [];
  public groupCategories: GroupCategory[] = [];
  public manageSongs: boolean = false;
  public hasDeadline: boolean = false;
  public maxDeadlineDate: string = '';
  public minDeadlineDate: string = new Date().toISOString();
  public isDeadlineReadonly: boolean = false;
  public type: AttendanceType;

  constructor(
    private modalController: ModalController,
    public db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit(): Promise<void> {
    this.songs = await this.db.getSongs();
    this.instruments = this.db.groups().filter((instrument: Group) => !instrument.maingroup);
    this.groupCategories = await this.db.getGroupCategories();
    this.mainGroup = this.db.getMainGroup().id;
    document.addEventListener("visibilitychange", async () => {
      if (!document.hidden) {
        this.attendance = await this.db.getAttendanceById(this.attendanceId);
        this.initializeAttObjects();
        this.subsribeOnChannels();
      }
    });
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.conductors = await this.db.getConductors(true);
    this.activeConductors = this.conductors.filter((con: Person) => !con.left);
    this.historyEntry.person_id = this.activeConductors[0]?.id;
    this.withExcuses = this.db.tenant().withExcuses;
    this.attendance = await this.db.getAttendanceById(this.attendanceId);
    this.historyEntries = await this.db.getHistoryByAttendanceId(this.attendanceId);
    this.isHelper = await this.db.tenantUser().role === Role.HELPER;
    void this.listenOnNetworkChanges();
    this.selectedSongs = this.attendance.songs || [];
    this.type = this.db.attendanceTypes().find((type: AttendanceType) => type.id === this.attendance.type_id)
    this.manageSongs = this.type.manage_songs || false;
    this.hasDeadline = !!this.attendance.deadline;
    if (this.hasDeadline) {
      this.maxDeadlineDate = dayjs(this.attendance.date).hour(this.type.start_time ? Number(this.type.start_time.substring(0, 2)) : 19).minute(this.type.start_time ? Number(this.type.start_time.substring(3, 5)) : 30).toISOString();
      this.isDeadlineReadonly = dayjs(this.attendance.date).isBefore(dayjs());
    }

    this.subsribeOnChannels();
    this.initializeAttObjects();
  }

  subsribeOnChannels() {
    this.sub?.unsubscribe();
    this.personAttSub?.unsubscribe();
    this.sub = this.db.getSupabase()
      .channel('att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (payload: RealtimePostgresChangesPayload<any>) => this.onAttRealtimeChanges(payload))
      .subscribe();
    this.personAttSub = this.db.getSupabase()
      .channel('person-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'person_attendances' },
        (payload: RealtimePostgresChangesPayload<any>) => this.onPersonAttRealtimeChanges(payload))
      .subscribe();
  }

  userById(_: number, person: PersonAttendance): string {
    return person.id;
  }

  initializeAttObjects() {
    if (!this.attendance.persons) {
      return;
    }

    this.players = Utils.getModifiedPlayers(this.attendance.persons, this.mainGroup);
  }

  async listenOnNetworkChanges(): Promise<void> {
    this.isOnline = (await Network.getStatus()).connected;
    Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
      this.isOnline = status.connected;
      Utils.showToast(status.connected ? "Verbindung wiederhergestellt" : "Keine Internetverbindung vorhanden", status.connected ? "success" : "danger");
    });
  }

  async close() {
    if (this.withExcuses) {
      // const unexcusedPlayers: Player[] = this.players.filter((p: Player) =>
      //   !p.isPresent && !p.isCritical && !this.excused.has(String(p.id)) && !this.attendance.criticalPlayers.includes(p.id)
      // );

      // await this.updateCriticalPlayers(unexcusedPlayers);
    }

    await this.sub.unsubscribe();
    await this.personAttSub.unsubscribe();
    this.modalController.dismiss();
  }

  onAttRealtimeChanges(payload: RealtimePostgresChangesPayload<any>) {
    if (!Object.keys(payload.new).length && payload.old && (payload.old as { id: number }).id === this.attendance.id) {
      Utils.showToast("Die Anwesenheit wurde soeben von einem anderen Nutzer gelöscht", "danger", 3000);
      this.close();
      return;
    }

    if (payload.new.id !== this.attendance.id) {
      return;
    }

    this.attendance = payload.new;
  }

  onPersonAttRealtimeChanges(payload: RealtimePostgresChangesPayload<any>) {
    if (!Object.keys(payload.new).length) {
      if (payload.old && this.players.find((p: PersonAttendance) => p.id === (payload.old as { id: string }).id)) {
        Utils.showToast("Die Anwesenheit wurde soeben von einem anderen Nutzer gelöscht", "danger", 3000);
        this.close();
        return;
      }
    }

    if (payload.new.attendance_id !== this.attendance.id) {
      return;
    }

    const idx: number = this.players.findIndex((p: PersonAttendance) => p.id === payload.new.id);
    this.players[idx] = {
      ...this.players[idx],
      status: payload.new.status,
      notes: payload.new.notes,
    };
  }

  async onAttChange(individual: PersonAttendance) {
      const attType = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
      let status;

      if (attType.available_statuses.length === 5) {
        status = ATTENDANCE_STATUS_MAPPING["DEFAULT"][individual.status];
      } else if ([AttendanceStatus.Excused, AttendanceStatus.Late].every(status => attType.available_statuses.includes(status))) {
        status = ATTENDANCE_STATUS_MAPPING["NO_NEUTRAL"][individual.status];
      } else if ([AttendanceStatus.Late, AttendanceStatus.Neutral].every(status => attType.available_statuses.includes(status))) {
        status = ATTENDANCE_STATUS_MAPPING["NO_EXCUSED"][individual.status];
      } else if ([AttendanceStatus.Excused, AttendanceStatus.Neutral].every(status => attType.available_statuses.includes(status))) {
        status = ATTENDANCE_STATUS_MAPPING["NO_LATE"][individual.status];
      } else if ([AttendanceStatus.Late].every(status => attType.available_statuses.includes(status))) {
        status = ATTENDANCE_STATUS_MAPPING["NO_NEUTRAL_NO_EXCUSED"][individual.status];
      } else if ([AttendanceStatus.Neutral].every(status => attType.available_statuses.includes(status))) {
        status = ATTENDANCE_STATUS_MAPPING["NO_LATE_NO_EXCUSED"][individual.status];
      } else if ([AttendanceStatus.Excused].every(status => attType.available_statuses.includes(status))) {
        status = ATTENDANCE_STATUS_MAPPING["NO_LATE_NO_NEUTRAL"][individual.status];
      } else if (attType.available_statuses.length === 2 && attType.available_statuses.includes(AttendanceStatus.Present) && attType.available_statuses.includes(AttendanceStatus.Absent)) {
        status = ATTENDANCE_STATUS_MAPPING["ONLY_PRESENT_ABSENT"][individual.status];
      } else if (attType.available_statuses.length === 2 && attType.available_statuses.includes(AttendanceStatus.Present) && attType.available_statuses.includes(AttendanceStatus.Excused)) {
        status = ATTENDANCE_STATUS_MAPPING["ONLY_PRESENT_EXCUSED"][individual.status];
      } else {
        Utils.showToast("Fehler beim Ändern des Anwesenheitsstatus, bitte versuche es später erneut", "danger");
        return;
      }

      individual.status = status;

      this.db.updatePersonAttendance(individual.id, { status: individual.status });
  }

  onAttStaticChange(individual: PersonAttendance, event: any) {
    this.db.updatePersonAttendance(individual.id, { status: event.detail.value });
  }

  getAttendedPlayers(players: PersonAttendance[]): number {
    return players.filter((p: PersonAttendance) => p.status === AttendanceStatus.Late || p.status === AttendanceStatus.Present).length;
  }

  async addNote(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();

    const buttons = [{
      text: "Abbrechen",
    }, {
      text: "Notiz löschen",
      handler: async (): Promise<void> => {
        this.db.updatePersonAttendance(player.id, { notes: "" });
      }
    }, {
      text: "Speichern",
      handler: async (evt: { note: string }): Promise<void> => {
        this.db.updatePersonAttendance(player.id, { notes: evt.note });
      }
    }];

    if (!player.notes || player.notes === "") {
      buttons.splice(1, 1);
    }

    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Notiz hinzufügen",
      inputs: [{
        type: "textarea",
        placeholder: "Notiz eingeben...",
        value: player.notes,
        name: "note",
      }],
      buttons,
    });

    await alert.present();
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
          const url: string = await this.db.updateAttImage(this.attendance.id, imgFile);
          this.attendance.img = url;
        } catch (error) {
          Utils.showToast(error, "danger");
        }
      } else {
        loading.dismiss();
        Utils.showToast("Fehler beim hinzufügen des Bildes, versuche es später erneut", "danger");
      }
    }
  }

  calculateTime(field: FieldSelection, index: number) {
    let minutesToAdd: number = 0;
    let currentIndex: number = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.attendance.plan.fields[currentIndex].time);
      currentIndex++;
    }

    const time: dayjs.Dayjs = dayjs().hour(Number(this.attendance.plan.time.substring(0, 2))).minute(Number(this.attendance.plan.time.substring(3, 5)));
    return `${time.add(minutesToAdd, "minute").format("HH:mm")} ${field.conductor ? `| ${field.conductor}` : ""}`;
  }

  async exportPlan() {
    Utils.createPlanExport({
      ...this.attendance.plan,
      attendance: this.attendance.id,
      attendances: await this.db.getAttendance(),
    }, this.attendance.type === "uebung");
  }

  async send() {
    const blob = Utils.createPlanExport({
      ...this.attendance.plan,
      attendance: this.attendance.id,
      attendances: await this.db.getAttendance(),
      asBlob: true,
    }, this.attendance.type === "uebung");

    this.db.sendPlanPerTelegram(blob, `${this.attendance?.type === "uebung" ? "Probenplan" : "Gottesdienst"}_${dayjs(this.attendance.date).format("DD_MM_YYYY")}`);
  }

  async editPlan() {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PlanningPage,
      cssClass: "planningModal",
      componentProps: {
        attendanceId: this.attendance.id,
      },
    });

    await modal.present();
  }

  async onInfoChanged() {
    // start_time is a date string and need to be converted to "HH:mm"
    if (!this.attendance.start_time || this.attendance.start_time === "Invalid Date") {
      this.attendance.start_time = "19:30";
    }
    if (!this.attendance.end_time || this.attendance.end_time === "Invalid Date") {
      this.attendance.end_time = "21:00";
    }
    const start_time = this.attendance.start_time.length !== 5 ? dayjs(this.attendance.start_time).format("HH:mm") : this.attendance.start_time;
    const end_time = this.attendance.end_time.length !== 5 ? dayjs(this.attendance.end_time).format("HH:mm") : this.attendance.end_time;

    if (!this.hasDeadline) {
      this.attendance.deadline = null;
    }

    await this.db.updateAttendance({
      type: this.attendance.type,
      typeInfo: this.attendance.typeInfo,
      notes: this.attendance.notes,
      save_in_history: this.attendance.save_in_history,
      start_time,
      end_time,
      deadline: this.attendance.deadline,
    }, this.attendance.id);

    if (this.historyEntries.length && this.historyEntries[0].visible !== this.attendance.save_in_history) {
      for (const entry of this.historyEntries) {
        await this.db.updateHistoryEntry(entry.id, { visible: this.attendance.save_in_history });
      }
    }
  }

  async addSongsToHistory(modal: any): Promise<void> {
    const songsToAdd: History[] = [];
    for (const songId of this.selectedSongs) {
      songsToAdd.push({
        ...this.historyEntry,
        date: this.attendance.date,
        songId: Number(songId),
        tenantId: this.db.tenant().id,
        attendance_id: this.attendance.id,
        person_id: Boolean(this.historyEntry.otherConductor) ? null : this.historyEntry.person_id,
      });
    }

    await this.db.addSongsToHistory(songsToAdd);
    this.historyEntries = await this.db.getHistoryByAttendanceId(this.attendance.id);

    this.selectedSongs = [];
    this.historyEntry = {
      person_id: this.activeConductors[0]?.id,
      otherConductor: undefined,
      date: this.historyEntry.date,
      songId: 1,
    };

    modal.dismiss();
  }

  async removeHistoryEntry(id: number): Promise<void> {
    await this.db.removeHistoryEntry(id);
    this.historyEntries = await this.db.getHistoryByAttendanceId(this.attendance.id);
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

    const conductor: Person | undefined = this.conductors.find((con: Person) => con.id === entry.person_id);
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

  getMissingGroups(songId: number): string {
    const song = this.songs.find((s: Song) => s.id === songId);

    if (!song || !song.instrument_ids || !song.instrument_ids.length) {
      return "";
    }

    const text = Utils.getInstrumentText(song.instrument_ids, this.instruments, this.groupCategories);
    return text;
  }

  getTypeName(type_id: string) {
    return this.db.attendanceTypes().find(type => type.id === type_id)?.name || 'Unbekannt';
  }

  toNeutral(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();
    player.status = AttendanceStatus.Neutral;
    this.db.updatePersonAttendance(player.id, { status: player.status });
  }

  async getModifierInfo(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();

    if (!player.changed_by) {
      await Utils.showToast("Der Status wurde bisher nicht verändert", "warning");
      return;
    }

    let message;

    const person = this.players.find((p: PersonAttendance) => player.changed_by === p.person.appId);

    if (!person) {
      message = player.changed_by === '665fe2b4-d53f-4f17-a66b-46c0949af99a' ? "Zuletzt geändert von Matthias Eckstädt" : "Zuletzt geänderrt von 'Unbekannt'";
    } else {
      message = `Zuletzt geändert von ${person.firstName} ${person.lastName}`;
    }

    if (player.changed_at) {
      message += ` am ${format(new Date(player.changed_at), "dd.MM.yyyy")} um ${format(new Date(player.changed_at), "HH:mm")} Uhr`;
    }

    const alert = await this.alertController.create({
      message,
      buttons: ["Ok"],
    });

    await alert.present();
  }

  exportToExcel() {
    Utils.exportAttendanceToExcel(
      this.attendance,
      this.players,
      this.db.attendanceTypes().find(type => type.id === this.attendance.type_id)
    );
  }

  onDeadlineToggleChanged() {
    if (this.hasDeadline) {
      const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
      const hour = type.start_time ? Number(type.start_time.substring(0, 2)) + 2 : 19;
      let deadline = dayjs(this.attendance.date).subtract(1, 'day').hour(hour).minute(0).second(0).toISOString();

      if (dayjs(deadline).isBefore(dayjs())) {
        deadline = dayjs(this.attendance.date).hour(hour).minute(0).toISOString();
      }

      this.attendance.deadline = deadline;
      this.maxDeadlineDate = dayjs(this.attendance.date).hour(hour).minute(0).toISOString();
    } else {
      this.attendance.deadline = null;
    }

    this.db.updateAttendance({ deadline: this.attendance.deadline }, this.attendance.id);
  }
}
