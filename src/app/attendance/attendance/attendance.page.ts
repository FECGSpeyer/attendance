import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ConnectionStatus, Network } from '@capacitor/network';
import { AlertController, IonItemSliding, ModalController } from '@ionic/angular';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus, Role } from 'src/app/utilities/constants';
import { Attendance, FieldSelection, Instrument, Person, PersonAttendance, Player, Song } from 'src/app/utilities/interfaces';
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
  public playerNotes: { [prop: number]: string } = {};
  public attendance: Attendance;
  private sub: RealtimeChannel;
  private personAttSub: RealtimeChannel;
  public isHelper: boolean = false;
  public songs: Song[] = [];
  public selectedSongs: number[] = [];

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit(): Promise<void> {
    document.addEventListener("visibilitychange", async () => {
      if (!document.hidden) {
        this.attendance = await this.db.getAttendanceById(this.attendanceId);
        this.initializeAttObjects();
        this.sub.unsubscribe();
        this.personAttSub.unsubscribe();
        this.subsribeOnChannels();
      }
    });
    this.withExcuses = this.db.tenant().withExcuses;
    this.attendance = await this.db.getAttendanceById(this.attendanceId);
    this.isHelper = await this.db.tenantUser().role === Role.HELPER;
    void this.listenOnNetworkChanges();
    this.songs = await this.db.getSongs();
    this.selectedSongs = this.attendance.songs || [];

    this.subsribeOnChannels();
    this.initializeAttObjects();
  }

  subsribeOnChannels() {
    this.sub = this.db.getSupabase()
      .channel('att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (payload: RealtimePostgresChangesPayload<any>) => this.onAttRealtimeChanges(payload))
      .subscribe();
    this.personAttSub = this.db.getSupabase()
      .channel('att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'person_attendances' },
        (payload: RealtimePostgresChangesPayload<any>) => this.onPersonAttRealtimeChanges(payload))
      .subscribe();
  }

  userById(_: number, person: Person): string {
    return String(person.id);
  }

  initializeAttObjects() {
    if (!this.attendance.persons) {
      return;
    }

    this.players = Utils.getModifiedPlayers(this.attendance.persons);
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
    if (!this.withExcuses) {
      if (individual.status === AttendanceStatus.Absent) {
        individual.status = AttendanceStatus.Present;
      } else {
        individual.status = AttendanceStatus.Absent;
      }
    } else {
      // First Case is for: Condition ('N' OR 'A') to '✓'
      // Second Case is for: Condition '✓' to 'L'
      // Third Case is for: Condition 'L to 'E'
      // Fourth Case is for: Condition  'E' to 'A'
      if (individual.status === AttendanceStatus.Neutral || individual.status === AttendanceStatus.Absent) {
        individual.status = AttendanceStatus.Present;
      } else if (individual.status === AttendanceStatus.Present) {
        individual.status = AttendanceStatus.Excused;
      } else if (individual.status === AttendanceStatus.Excused) {
        individual.status = AttendanceStatus.Late;
      } else if (individual.status === AttendanceStatus.Late) {
        individual.status = AttendanceStatus.Absent;
      }
    }

    this.db.updatePersonAttendance(individual.id, { status: individual.status });
  }

  getPlayerLengthByInstrument(players: Player[], player: Player): number {
    return players.filter((p: Player) => p.instrument === player.instrument).length;
  }

  getAttendedPlayers(players: Player[]): number {
    return players.filter((p: Player) => p.isPresent).length;
  }

  async addNote(player: PersonAttendance, slider: IonItemSliding) {
    slider.close();
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Notiz hinzufügen",
      inputs: [{
        type: "textarea",
        placeholder: "Notiz eingeben...",
        value: this.playerNotes[player.id],
        name: "note",
      }],
      buttons: [{
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
      }]
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
    });
  }

  async onInfoChanged() {
    await this.db.updateAttendance({
      type: this.attendance.type,
      typeInfo: this.attendance.typeInfo,
      notes: this.attendance.notes,
    }, this.attendance.id);
  }
}
