import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { AlertController, IonItemSliding, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus, PlayerHistoryType } from 'src/app/utilities/constants';
import { Attendance, AttendanceItem, FieldSelection, Instrument, Person, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { environment } from 'src/environments/environment.prod';
import { ConnectionStatus, Network } from '@capacitor/network';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { Storage } from '@ionic/storage-angular';

@Component({
  selector: 'app-att',
  templateUrl: './att.page.html',
  styleUrls: ['./att.page.scss'],
})
export class AttPage implements OnInit {
  @Input() attendance: Attendance;
  @ViewChild('chooser') chooser: ElementRef;
  public players: Player[] = [];
  public allPlayers: Player[] = [];
  public attPlayers: Player[] = [];
  public conductors: Person[] = [];
  public allConductors: Person[] = [];
  public instruments: Instrument[] = [];
  public excused: Set<string> = new Set();
  public lateExcused: Set<string> = new Set();
  public withExcuses: boolean = environment.withExcuses;
  public isOnline = true;
  private playerNotes: { [prop: number]: string } = {};
  private oldAttendance: Attendance;
  private hasChanges = false;
  public realtimeAttendance: boolean = false;

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
    private storage: Storage,
  ) { }

  async ngOnInit(): Promise<void> {
    this.realtimeAttendance = await this.storage.get("realtimeAttendance") || false;
    void this.listenOnNetworkChanges();
    this.allConductors = await this.db.getConductors(true);
    this.allPlayers = await this.db.getPlayers();
    this.instruments = await this.db.getInstruments();
    this.hasChanges = false;

    this.db.getAttChannel().on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'attendance' },
      (payload: RealtimePostgresChangesPayload<any>) => this.onAttRealtimeChanges(payload))
      .subscribe();

    this.oldAttendance = { ...this.attendance };
    this.initializeAttObjects();
  }

  userById(player: Player) {
    return player.id;
  }

  initializeAttObjects() {
    this.attPlayers = [];
    this.conductors = [];
    this.excused = new Set([...this.attendance.excused]) || new Set<string>();
    this.lateExcused = new Set(...[this.attendance.lateExcused] || []) || new Set<string>();
    this.playerNotes = { ...this.attendance.playerNotes } || {};

    for (let player of Object.keys(this.attendance.players)) {
      if (Boolean(this.allPlayers.find((p: Player) => p.id === Number(player)))) {
        let attStatus = this.attendance.players[String(player)];
        if (typeof attStatus == 'boolean') {
          attStatus = this.convertOldAttToNewAttStatus(player, this.excused, this.lateExcused);
        }
        this.attPlayers.push({
          ...this.allPlayers.find((p: Player) => p.id === Number(player)),
          attStatus: (attStatus as unknown as AttendanceStatus),
          isPresent: (attStatus as any) === AttendanceStatus.Present || (attStatus as any) === AttendanceStatus.Late || (attStatus as any) === true,
        });
      }
    }

    for (let con of Object.keys(this.attendance.conductors)) {
      if (Boolean(this.allConductors.find((p: Player) => p.id === Number(con)))) {
        let attStatus = this.attendance.conductors[String(con)];
        if (typeof attStatus == 'boolean') {
          attStatus = this.convertOldAttToNewAttStatus(con, this.excused, this.lateExcused);
        }
        this.conductors.push({
          ...this.allConductors.find((p: Player) => p.id === Number(con)),
          attStatus: (attStatus as unknown as AttendanceStatus),
          isPresent: (attStatus as unknown as AttendanceStatus) === AttendanceStatus.Present || (attStatus as unknown as AttendanceStatus) === AttendanceStatus.Late,
          isConductor: true
        });
      }
    }

    this.players = Utils.getModifiedPlayers(this.attPlayers, this.instruments).map((p: Player): Player => {
      return {
        ...p,
        isPresent: p.attStatus === AttendanceStatus.Present || p.attStatus === AttendanceStatus.Late,
      };
    });
  }

  async listenOnNetworkChanges(): Promise<void> {
    this.isOnline = (await Network.getStatus()).connected;
    Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
      this.isOnline = status.connected;
      Utils.showToast(status.connected ? "Verbindung wiederhergestellt" : "Keine Internetverbindung vorhanden", status.connected ? "success" : "danger");
    });
  }

  async save(): Promise<void> {
    const playerMap: AttendanceItem = {};
    const conductorsMap: AttendanceItem = {};

    for (const player of this.players) {
      playerMap[player.id] = (player.attStatus as any);
    }

    for (const con of this.conductors) {
      conductorsMap[con.id] = (con.attStatus as any);
    }

    const unexcusedPlayers: Player[] = this.players.filter((p: Player) =>
      !p.isPresent && !p.isCritical && !this.excused.has(String(p.id)) && !this.attendance.criticalPlayers.includes(p.id)
    );

    const attData: Partial<Attendance> = {
      notes: this.attendance.notes,
      typeInfo: this.attendance.type === "sonstiges" ? this.attendance.typeInfo : "",
      type: this.attendance.type,
      players: playerMap,
      conductors: conductorsMap,
      playerNotes: this.playerNotes,
      criticalPlayers: [...this.attendance.criticalPlayers].concat(unexcusedPlayers.map((player: Player) => player.id)),
    };

    if (this.lateExcused.size === 0) {
      delete attData.lateExcused;
    }

    await this.db.updateAttendance(attData, this.attendance.id);

    if (!this.realtimeAttendance) {
      if (this.withExcuses) {
        await this.updateCriticalPlayers(unexcusedPlayers);
      }

      this.modalController.dismiss({
        updated: true
      });
    }
  }

  async updateCriticalPlayers(unexcusedPlayers: Player[]) {
    if (!environment.isChoir) {
      return;
    }
    for (const player of unexcusedPlayers) {
      this.db.updatePlayer({
        ...player,
        isCritical: true,
        criticalReason: PlayerHistoryType.UNEXCUSED,
      });
    }
  }

  async dismiss(): Promise<void> {
    if (!this.hasChanges || this.realtimeAttendance) {
      this.close();
      return;
    }

    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Möchtest du die Eingabe wirklich beenden?",
      message: "Alle Änderungen werden verworfen.",
      buttons: [{
        text: "Abbrechen",
      }, {
        text: "Fortfahren",
        handler: (): void => {
          this.close();
        }
      }]
    });

    await alert.present();
  }


  async close() {
    if (this.withExcuses && this.realtimeAttendance) {
      const unexcusedPlayers: Player[] = this.players.filter((p: Player) =>
        !p.isPresent && !p.isCritical && !this.excused.has(String(p.id)) && !this.attendance.criticalPlayers.includes(p.id)
      );

      await this.updateCriticalPlayers(unexcusedPlayers);
    } else {
      this.attendance = this.oldAttendance;
    }

    this.modalController.dismiss();
  }

  onAttRealtimeChanges(payload: RealtimePostgresChangesPayload<any>) {
    if (!this.realtimeAttendance) {
      return;
    }

    if (
      payload.new.id !== this.attendance.id ||
      this.oldAttendance.type !== payload.new.type ||
      this.oldAttendance.typeInfo !== payload.new.typeInfo ||
      this.oldAttendance.notes !== payload.new.notes
    ) {
      return;
    }

    this.attendance = payload.new;
    this.initializeAttObjects();
  }

  async onAttChange(individual: (Person)) {
    if (!this.realtimeAttendance) {
      this.hasChanges = true;
    }
    if (!this.withExcuses) {
      if (individual.attStatus === AttendanceStatus.Absent) {
        individual.attStatus = AttendanceStatus.Present;
      } else {
        individual.attStatus = AttendanceStatus.Absent;
      }

      return;
    }
    // First Case is for: Condition ('N' OR 'A') to '✓'
    // Second Case is for: Condition '✓' to 'L'
    // Third Case is for: Condition 'L to 'E'
    // Fourth Case is for: Condition  'E' to 'A'
    if (individual.attStatus === AttendanceStatus.Neutral || individual.attStatus === AttendanceStatus.Absent) {
      individual.attStatus = AttendanceStatus.Present;
    } else if (individual.attStatus === AttendanceStatus.Present) {
      individual.attStatus = AttendanceStatus.Excused;
    } else if (individual.attStatus === AttendanceStatus.Excused) {
      individual.attStatus = AttendanceStatus.Late;
    } else if (individual.attStatus === AttendanceStatus.Late) {
      individual.attStatus = AttendanceStatus.Absent;
    }

    if (this.realtimeAttendance) {
      this.save();
    }
  }

  getPlayerLengthByInstrument(players: Player[], player: Player): number {
    return players.filter((p: Player) => p.instrument === player.instrument).length;
  }

  getAttendedPlayers(players: Player[]): number {
    return players.filter((p: Player) => p.isPresent).length;
  }

  async addNote(player: Player, slider: IonItemSliding) {
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
        handler: (): void => {
          if (this.playerNotes[player.id]) {
            if (!this.realtimeAttendance) {
              this.hasChanges = true;
            }
            delete this.playerNotes[player.id];
          }
        }
      }, {
        text: "Speichern",
        handler: (evt: { note: string }): void => {
          if (!this.realtimeAttendance) {
            this.hasChanges = true;
          }
          this.playerNotes[player.id] = evt.note;
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

  convertOldAttToNewAttStatus(id: string, excused: Set<string>, lateExcused: Set<string>): any {
    if (excused?.has(id.toString())) {
      return AttendanceStatus.Excused;
    } else if (lateExcused?.has(id.toString())) {
      return AttendanceStatus.Late;
    } else if (this.attendance.players[String(id)] === true || this.attendance.conductors[String(id)] === true) {
      return AttendanceStatus.Present;
    }
    return AttendanceStatus.Absent;
  }

  async onInfoChanged() {
    await this.db.updateAttendance({
      type: this.attendance.type,
      typeInfo: this.attendance.typeInfo,
      notes: this.attendance.notes,
    }, this.attendance.id);
  }
}

