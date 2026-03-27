import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ConnectionStatus, Network } from '@capacitor/network';
import { AlertController, IonItemSliding, ModalController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { format } from 'date-fns';
import dayjs from 'dayjs';
import { PlanningPage } from 'src/app/planning/planning.page';
import { StatusInfoComponent } from './status-info/status-info.component';
import { DbService } from 'src/app/services/db.service';
import { DefaultAttendanceType, AttendanceStatus, Role, ATTENDANCE_STATUS_MAPPING, AttendanceViewMode, CHECKLIST_DEADLINE_OPTIONS } from 'src/app/utilities/constants';
import { Attendance, FieldSelection, Person, PersonAttendance, Song, History, Group, GroupCategory, AttendanceType, ChecklistItem } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
    selector: 'app-attendance',
    templateUrl: './attendance.page.html',
    styleUrls: ['./attendance.page.scss'],
    standalone: false
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
  public canViewNotes: boolean = true;
  public canViewChecklist: boolean = true;
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
  public attendanceViewMode: AttendanceViewMode = AttendanceViewMode.CLICK;
  public AttendanceViewMode = AttendanceViewMode;
  private helperGroupId: number | null = null;
  public isAddPersonModalOpen: boolean = false;
  public availablePersons: Person[] = [];
  public filteredAvailablePersons: Person[] = [];
  public selectedPersonsToAdd: number[] = [];
  public isLoadingPersons: boolean = false;

  constructor(
    private modalController: ModalController,
    public db: DbService,
    private alertController: AlertController,
    private storage: Storage
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

    const isHelperRole = this.db.tenantUser().role === Role.HELPER || this.db.tenantUser().role === Role.VOICE_LEADER_HELPER;
    if (isHelperRole) {
      const perm = this.db.getPermissionForRole(this.db.tenantUser().role);
      this.canViewNotes = perm?.player_notes_view || false;
      this.canViewChecklist = perm?.checklist_view || false;
      if (perm && !perm.attendance_all_groups) {
        const profile = await this.db.getPlayerProfile();
        this.helperGroupId = profile?.instrument ?? null;
      }
    }

    this.attendanceViewMode = await this.storage.get('attendanceViewMode') || AttendanceViewMode.CLICK;

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

    let persons = this.attendance.persons;
    if (this.helperGroupId != null) {
      persons = persons.filter((p: PersonAttendance) => p.instrument === this.helperGroupId);
    }

    this.players = Utils.getModifiedPlayers(persons, this.mainGroup, this.instruments);
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

    await Network.removeAllListeners();
    await this.sub?.unsubscribe();
    await this.personAttSub?.unsubscribe();
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
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* Haptics not available in PWA */ }
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

  async exportPlan(sideBySide: boolean = false) {
    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    await Utils.createPlanExport({
      ...this.attendance.plan,
      attendance: this.attendance.id,
      attendances: await this.db.getAttendance(),
      sideBySide,
    }, Utils.getPlanningTitle(type, this.attendance.typeInfo));
  }

  async send(asImage: boolean = false, sideBySide: boolean = false) {
    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    const planningTitle = Utils.getPlanningTitle(type, this.attendance.typeInfo);
    const blob = await Utils.createPlanExport({
      ...this.attendance.plan,
      attendance: this.attendance.id,
      attendances: await this.db.getAttendance(),
      asBlob: true,
      asImage,
      sideBySide,
    }, planningTitle);

    this.db.sendPlanPerTelegram(blob, `${planningTitle.replace("(", "").replace(")", "")}_${dayjs(this.attendance.date).format("DD_MM_YYYY")}${sideBySide ? '_2x' : ''}`, asImage);
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

  toLateExcused(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();
    player.status = AttendanceStatus.LateExcused;
    this.db.updatePersonAttendance(player.id, { status: player.status });
  }

  async removeFromAttendance(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();

    const alert = await this.alertController.create({
      header: 'Person entfernen',
      message: `Möchtest du ${player.firstName} ${player.lastName} wirklich aus dieser Anwesenheit entfernen? Diese Aktion kann nicht rückgängig gemacht werden.`,
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Entfernen',
          role: 'destructive',
          handler: async () => {
            try {
              await this.db.deletePersonAttendanceById(player.id);
              this.players = this.players.filter(p => p.id !== player.id);
              // Recalculate group headers
              this.players = Utils.getModifiedPlayers(this.players, this.mainGroup, this.instruments);
              Utils.showToast('Person aus Anwesenheit entfernt', 'success');
            } catch (error) {
              Utils.showToast('Fehler beim Entfernen der Person', 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
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

  async exportToExcel() {
    await Utils.exportAttendanceToExcel(
      this.attendance,
      this.players,
      this.db.attendanceTypes().find(type => type.id === this.attendance.type_id),
      this.db.churches(),
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

  async switchMode() {
    this.attendanceViewMode = this.attendanceViewMode === AttendanceViewMode.CLICK ? AttendanceViewMode.SELECT : AttendanceViewMode.CLICK;

    await this.storage.set('attendanceViewMode', this.attendanceViewMode);
  }

  // ========== CHECKLIST METHODS ==========

  /**
   * Toggle a checklist item's completed status
   */
  async toggleChecklistItem(index: number): Promise<void> {
    if (!this.attendance.checklist) return;

    this.attendance.checklist[index].completed = !this.attendance.checklist[index].completed;
    await this.db.updateAttendance({ checklist: this.attendance.checklist }, this.attendance.id);
  }

  /**
   * Add an ad-hoc checklist item
   */
  async addChecklistItem(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'To-Do hinzufügen',
      inputs: [
        {
          type: 'text',
          name: 'text',
          placeholder: 'To-Do Text...',
        },
        {
          type: 'number',
          name: 'deadlineHours',
          placeholder: 'Deadline in Stunden (optional)',
          min: 0,
        },
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
        },
        {
          text: 'Hinzufügen',
          handler: async (data) => {
            if (!data.text?.trim()) {
              Utils.showToast('Bitte einen Text eingeben', 'warning');
              return false;
            }

            if (!this.attendance.checklist) {
              this.attendance.checklist = [];
            }

            const deadlineHours = data.deadlineHours ? parseInt(data.deadlineHours, 10) : null;
            let dueDate: string | null = null;

            if (deadlineHours !== null && !isNaN(deadlineHours)) {
              const eventDateTime = this.attendance.start_time
                ? dayjs(this.attendance.date).hour(Number(this.attendance.start_time.substring(0, 2))).minute(Number(this.attendance.start_time.substring(3, 5)))
                : dayjs(this.attendance.date).hour(19).minute(0);
              dueDate = eventDateTime.subtract(deadlineHours, 'hour').toISOString();
            }

            const newItem: ChecklistItem = {
              id: crypto.randomUUID(),
              text: data.text.trim(),
              deadlineHours,
              completed: false,
              dueDate,
            };

            this.attendance.checklist.push(newItem);
            await this.db.updateAttendance({ checklist: this.attendance.checklist }, this.attendance.id);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Check if the default checklist from the type can be restored
   */
  canRestoreChecklist(): boolean {
    return this.type?.checklist?.length > 0 && (!this.attendance?.checklist || this.attendance.checklist.length === 0);
  }

  /**
   * Restore the default checklist from the attendance type
   */
  async restoreChecklist(): Promise<void> {
    if (!this.type?.checklist?.length) {
      Utils.showToast('Keine Standard-Checkliste vorhanden', 'warning');
      return;
    }

    // Copy checklist from type and calculate due dates
    const checklist = this.type.checklist.map((item: ChecklistItem) => {
      let dueDate: string | null = null;
      if (item.deadlineHours !== null && item.deadlineHours !== undefined) {
        const eventDateTime = this.attendance.start_time
          ? dayjs(this.attendance.date).hour(Number(this.attendance.start_time.substring(0, 2))).minute(Number(this.attendance.start_time.substring(3, 5)))
          : dayjs(this.attendance.date).hour(19).minute(0);
        dueDate = eventDateTime.subtract(item.deadlineHours, 'hour').toISOString();
      }
      return {
        ...item,
        id: crypto.randomUUID(), // New unique ID
        completed: false,
        dueDate,
      };
    });

    this.attendance.checklist = checklist;
    await this.db.updateAttendance({ checklist }, this.attendance.id);
    Utils.showToast('Checkliste wiederhergestellt', 'success');
  }

  /**
   * Remove a checklist item
   */
  async removeChecklistItem(index: number, slider?: IonItemSliding): Promise<void> {
    slider?.close();

    const alert = await this.alertController.create({
      header: 'To-Do löschen',
      message: 'Möchtest du dieses To-Do wirklich löschen?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
        },
        {
          text: 'Löschen',
          role: 'destructive',
          handler: async () => {
            if (this.attendance.checklist) {
              this.attendance.checklist.splice(index, 1);
              await this.db.updateAttendance({ checklist: this.attendance.checklist }, this.attendance.id);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Get deadline status for styling
   */
  getDeadlineStatus(item: ChecklistItem): 'overdue' | 'warning' | 'normal' {
    if (!item.dueDate || item.completed) return 'normal';

    const now = dayjs();
    const dueDate = dayjs(item.dueDate);

    if (dueDate.isBefore(now)) {
      return 'overdue';
    }

    // Warning if due within 24 hours
    if (dueDate.diff(now, 'hour') <= 24) {
      return 'warning';
    }

    return 'normal';
  }

  /**
   * Format deadline as relative time (e.g., "in 2 Tagen")
   */
  formatDeadlineRelative(item: ChecklistItem): string {
    if (!item.dueDate) return '';

    const now = dayjs();
    const dueDate = dayjs(item.dueDate);
    const diffHours = dueDate.diff(now, 'hour');
    const diffDays = dueDate.diff(now, 'day');

    if (diffHours < 0) {
      const overdueDays = Math.abs(diffDays);
      const overdueHours = Math.abs(diffHours);
      if (overdueDays >= 1) {
        return `${overdueDays} Tag(e) überfällig`;
      }
      return `${overdueHours} Stunde(n) überfällig`;
    }

    if (diffHours < 1) {
      return 'Jetzt fällig';
    }

    if (diffHours < 24) {
      return `in ${diffHours} Stunde(n)`;
    }

    return `in ${diffDays} Tag(en)`;
  }

  /**
   * Format deadline as absolute date/time
   */
  formatDeadlineAbsolute(item: ChecklistItem): string {
    if (!item.dueDate) return '';
    return format(new Date(item.dueDate), 'dd.MM.yyyy HH:mm') + ' Uhr';
  }

  /**
   * Get checklist progress (completed/total)
   */
  getChecklistProgress(): { completed: number; total: number } {
    if (!this.attendance?.checklist) {
      return { completed: 0, total: 0 };
    }

    const total = this.attendance.checklist.length;
    const completed = this.attendance.checklist.filter(item => item.completed).length;

    return { completed, total };
  }

  async showStatusInfo(): Promise<void> {
    const modal = await this.modalController.create({
      component: StatusInfoComponent,
      componentProps: {
        players: this.players,
      },
      breakpoints: [0, 0.5, 0.75],
      initialBreakpoint: 0.5,
    });

    await modal.present();
  }

  /**
   * Open modal to add persons manually to attendance
   */
  async openAddPersonModal(): Promise<void> {
    this.isAddPersonModalOpen = true;
    this.isLoadingPersons = true;
    this.selectedPersonsToAdd = [];
    this.filteredAvailablePersons = [];
    this.availablePersons = [];

    try {
      // Load all active players from the instance
      const allPersons: Person[] = await this.db.getPlayers(true);

      // Get current person IDs in this attendance
      const currentPersonIds = new Set(this.players.map(p => p.person_id));

      // Filter out persons already in attendance and paused/left persons
      let personsNotInAttendance = allPersons.filter((person: Person) =>
        !currentPersonIds.has(person.id) && !person.paused && !person.left
      );

      // Get attendance type for filtering
      const attType = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);

      // Filter persons that match the attendance type criteria
      const matchingPersons = personsNotInAttendance.filter((person: Person) => {
        // Check relevant groups
        if (attType && attType.relevant_groups.length > 0) {
          if (!attType.relevant_groups.includes((person as any).instrument)) {
            return false;
          }
        }

        // Check additional fields filter
        if (attType?.additional_fields_filter?.key && attType?.additional_fields_filter?.option && this.db.tenant().additional_fields?.find(field => field.id === attType.additional_fields_filter.key)) {
          const defaultValue = this.db.tenant().additional_fields.find(field => field.id === attType.additional_fields_filter.key)?.defaultValue;
          const additionalField = person.additional_fields?.[attType.additional_fields_filter.key] ?? defaultValue;
          return additionalField === attType.additional_fields_filter.option;
        }

        return true;
      });

      // Get persons that don't match the criteria
      const matchingPersonIds = new Set(matchingPersons.map(p => p.id));
      const otherPersons = personsNotInAttendance.filter(p => !matchingPersonIds.has(p.id));

      // Add group names to persons for display
      const addGroupNames = (persons: Person[]) => {
        return persons.map((person: Person) => {
          const instrumentId = (person as any).instrument;
          const group = this.instruments.find(g => g.id === instrumentId);
          return {
            ...person,
            groupName: group?.name || 'Keine Gruppe',
          } as any;
        });
      };

      this.filteredAvailablePersons = addGroupNames(matchingPersons);
      this.availablePersons = addGroupNames(otherPersons);
    } catch (error) {
      console.error('Error loading persons:', error);
      Utils.showToast('Fehler beim Laden der Personen', 'danger');
    } finally {
      this.isLoadingPersons = false;
    }
  }

  /**
   * Add selected persons to attendance
   */
  async addPersonsToAttendance(modal: any): Promise<void> {
    if (!this.selectedPersonsToAdd.length) {
      Utils.showToast("Bitte wähle mindestens eine Person aus", "warning");
      return;
    }

    const loading = await Utils.getLoadingElement(999999, 'Personen werden hinzugefügt...');
    await loading.present();

    try {
      const attType = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
      const defaultStatus = attType.default_status;
      const personsToAdd: PersonAttendance[] = [];

      for (const personId of this.selectedPersonsToAdd) {
        const person = this.availablePersons.find(p => p.id === personId);
        if (!person) continue;

        let playerStatus = defaultStatus;
        let notes = '';

        // Check shift if applicable
        if (person.shift_id && !attType.all_day) {
          const shift = this.db.shifts().find(s => s.id === person.shift_id);

          const result = Utils.getStatusByShift(
            shift,
            this.attendance.date,
            attType.start_time || '19:00',
            attType.end_time || '21:00',
            defaultStatus,
            person.shift_start,
            person.shift_name,
          );

          playerStatus = result.status;
          notes = result.note;
        }

        personsToAdd.push({
          attendance_id: this.attendanceId,
          person_id: personId,
          status: playerStatus,
          notes,
        });
      }

      await this.db.addPersonAttendances(personsToAdd);

      // Refresh attendance data
      this.attendance = await this.db.getAttendanceById(this.attendanceId);
      this.initializeAttObjects();

      await loading.dismiss();
      modal.dismiss();
      this.isAddPersonModalOpen = false;
      this.selectedPersonsToAdd = [];

      Utils.showToast(`${personsToAdd.length} Person(en) hinzugefügt`, 'success');
    } catch (error) {
      await loading.dismiss();
      console.error('Error adding persons:', error);
      Utils.showToast('Fehler beim Hinzufügen der Personen', 'danger');
    }
  }
}
