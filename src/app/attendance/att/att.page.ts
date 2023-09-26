import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { AlertController, IonItemSliding, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { FaceMatch } from 'face-api.js';
import { DbService } from 'src/app/services/db.service';
import { FaceRecService } from 'src/app/services/face-rec.service';
import { AttendanceStatus, PlayerHistoryType } from 'src/app/utilities/constants';
import { Attendance, AttendanceItem, FieldSelection, Instrument, Person, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { environment } from 'src/environments/environment.prod';
import { ConnectionStatus, Network } from '@capacitor/network';

@Component({
  selector: 'app-att',
  templateUrl: './att.page.html',
  styleUrls: ['./att.page.scss'],
})
export class AttPage implements OnInit {
  @Input() attendance: Attendance;
  @ViewChild('chooser') chooser: ElementRef;
  public players: Player[] = [];
  public attPlayers: Player[] = [];
  public conductors: Person[] = [];
  public excused: Set<string> = new Set();
  public lateExcused: Set<string> = new Set();
  public withExcuses: boolean = environment.withExcuses;
  public isOnline = true;
  private playerNotes: { [prop: number]: string } = {};
  private oldAttendance: Attendance;
  private hasChanges = false;


  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
    private faceRecService: FaceRecService,
  ) { }

  async ngOnInit(): Promise<void> {
    void this.listenOnNetworkChanges();
    const conductors: Person[] = await this.db.getConductors(true);
    const allPlayers: Player[] = await this.db.getPlayers();
    const instruments: Instrument[] = await this.db.getInstruments();
    this.hasChanges = false;

    this.oldAttendance = { ...this.attendance };

    this.excused = new Set([...this.attendance.excused]) || new Set<string>();
    this.lateExcused = new Set(...[this.attendance.lateExcused] || []) || new Set<string>();
    this.playerNotes = { ...this.attendance.playerNotes } || {};

    for (let player of Object.keys(this.attendance.players)) {
      if (Boolean(allPlayers.find((p: Player) => p.id === Number(player)))) {
        let attStatus = this.attendance.players[String(player)];
        if (typeof attStatus == 'boolean') {
          attStatus = this.convertOldAttToNewAttStatus(player, this.excused, this.lateExcused);
        }
        this.attPlayers.push({
          ...allPlayers.find((p: Player) => p.id === Number(player)),
          attStatus: (attStatus as unknown as AttendanceStatus),
          isPresent: (attStatus as any) === AttendanceStatus.Present || (attStatus as any) === AttendanceStatus.Late || (attStatus as any) === true,
        });
      }
    }

    for (let con of Object.keys(this.attendance.conductors)) {
      if (Boolean(conductors.find((p: Player) => p.id === Number(con)))) {
        let attStatus = this.attendance.conductors[String(con)];
        if (typeof attStatus == 'boolean') {
          attStatus = this.convertOldAttToNewAttStatus(con, this.excused, this.lateExcused);
        }
        this.conductors.push({
          ...conductors.find((p: Player) => p.id === Number(con)),
          attStatus: (attStatus as unknown as AttendanceStatus),
          isPresent: (attStatus as unknown as AttendanceStatus) === AttendanceStatus.Present || (attStatus as unknown as AttendanceStatus) === AttendanceStatus.Late,
          isConductor: true
        });
      }
    }

    this.players = Utils.getModifiedPlayers(this.attPlayers, instruments).map((p: Player): Player => {
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

    if (this.withExcuses) {
      await this.updateCriticalPlayers(unexcusedPlayers);
    }

    this.modalController.dismiss({
      updated: true
    });
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
    if (!this.hasChanges) {
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

  close() {
    this.attendance = this.oldAttendance;
    this.modalController.dismiss();
  }

  async onAttChange(individual: (Player | Person)) {
    this.hasChanges = true;
    // First Case is for: Condition ('N' OR 'A') to '✓'
    // Second Case is for: Condition '✓' to 'L'
    // Third Case is for: Condition 'L to 'E'
    // Fourth Case is for: Condition  'E' to 'A'
    if (individual.attStatus === AttendanceStatus.Neutral || individual.attStatus === AttendanceStatus.Absent) {
      individual.attStatus = AttendanceStatus.Present;
      }else if (individual.attStatus === AttendanceStatus.Present) {
      individual.attStatus = AttendanceStatus.Excused;
    } else if (individual.attStatus === AttendanceStatus.Excused) {
      individual.attStatus = AttendanceStatus.Late;
    } else if (individual.attStatus === AttendanceStatus.Late) {
      individual.attStatus = AttendanceStatus.Absent;
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
            this.hasChanges = true;
            delete this.playerNotes[player.id];
          }
        }
      }, {
        text: "Speichern",
        handler: (evt: { note: string }): void => {
          this.hasChanges = true;
          this.playerNotes[player.id] = evt.note;
        }
      }]
    });

    await alert.present();
  }

  async recognizeFaces() {
    if (this.attendance.img) {
      const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(99999999);
      loading.present();
      const res: FaceMatch[] = (await this.faceRecService.initialize(this.players, this.conductors, this.attendance.img)).filter((match: FaceMatch) => match.label !== "unknown");
      loading.dismiss();
      if (res.length) {
        Utils.showToast(res.map((match: FaceMatch) => match.label).join(", ") + " gefunden");
      } else {
        Utils.showToast("Keine Personen gefunden", "danger");
      }
    } else {
      this.chooser.nativeElement.click();
    }
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
}

