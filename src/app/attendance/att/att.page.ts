import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { AlertController, IonItemSliding, ModalController } from '@ionic/angular';
import { FaceMatch } from 'face-api.js';
import { DbService } from 'src/app/services/db.service';
import { FaceRecService } from 'src/app/services/face-rec.service';
import { PlayerHistoryType } from 'src/app/utilities/constants';
import { Attendance, AttendanceItem, Instrument, Person, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { environment } from 'src/environments/environment.prod';

@Component({
  selector: 'app-att',
  templateUrl: './att.page.html',
  styleUrls: ['./att.page.scss'],
})
export class AttPage implements OnInit {
  @Input() attendance: Attendance;
  @ViewChild('chooser') chooser: ElementRef;
  public players: Player[] = [];
  public conductors: Person[] = [];
  public excused: Set<string> = new Set();
  public withExcuses: boolean = environment.withExcuses;
  private playerNotes: { [prop: number]: string } = {};
  private oldAttendance: Attendance;
  private hasChanges: boolean = false;

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
    private faceRecService: FaceRecService,
  ) { }

  async ngOnInit(): Promise<void> {
    const conductors: Person[] = await this.db.getConductors(true);
    const allPlayers: Player[] = await this.db.getPlayers();
    const instruments: Instrument[] = await this.db.getInstruments();
    let attPlayers: Player[] = [];
    this.hasChanges = false;

    this.oldAttendance = { ...this.attendance };

    for (let player of Object.keys(this.attendance.players)) {
      if (Boolean(allPlayers.find((p: Player) => p.id === Number(player)))) {
        attPlayers.push({
          ...allPlayers.find((p: Player) => p.id === Number(player)),
          isPresent: this.attendance.players[Number(player)],
        });
      }
    }
    this.excused = new Set([...this.attendance.excused]) || new Set<string>();
    this.playerNotes = { ...this.attendance.playerNotes } || {};

    for (let con of Object.keys(this.attendance.conductors)) {
      if (Boolean(conductors.find((p: Player) => p.id === Number(con)))) {
        this.conductors.push({
          ...conductors.find((p: Player) => p.id === Number(con)),
          isPresent: this.attendance.conductors[Number(con)],
        });
      }
    }

    this.players = Utils.getModifiedPlayers(attPlayers, instruments).map((p: Player): Player => {
      return {
        ...p,
        isPresent: Object.keys(this.attendance.players).length ? p.isPresent : true,
      }
    });
  }

  async save(): Promise<void> {
    const playerMap: AttendanceItem = {};
    const conductorsMap: AttendanceItem = {};

    for (const player of this.players) {
      playerMap[player.id] = player.isPresent;
    }

    for (const con of this.conductors) {
      conductorsMap[con.id] = con.isPresent;
    }

    const unexcusedPlayers: Player[] = this.players.filter((p: Player) =>
      !p.isPresent && !p.isCritical && !this.excused.has(String(p.id)) && !this.attendance.criticalPlayers.includes(p.id)
    );

    await this.db.updateAttendance({
      notes: this.attendance.notes,
      typeInfo: this.attendance.type === "sonstiges" ? this.attendance.typeInfo : "",
      type: this.attendance.type,
      players: playerMap,
      conductors: conductorsMap,
      excused: Array.from(this.excused),
      playerNotes: this.playerNotes,
      criticalPlayers: [...this.attendance.criticalPlayers].concat(unexcusedPlayers.map((player: Player) => player.id)),
    }, this.attendance.id);

    if (this.withExcuses) {
      await this.updateCriticalPlayers(unexcusedPlayers);
    }

    this.modalController.dismiss({
      updated: true
    });
  }

  async updateCriticalPlayers(unexcusedPlayers: Player[]) {
    for (const player of unexcusedPlayers) {
      this.db.updatePlayer({
        ...player,
        isCritical: true,
        criticalReason: PlayerHistoryType.UNEXCUSED,
      });
    }
  }

  async dismiss(): Promise<void> {
    if (JSON.stringify(this.attendance) === JSON.stringify(this.oldAttendance) && !this.hasChanges) {
      let hasChanged: boolean = false;

      for (const con of this.conductors) {
        if (this.attendance.conductors?.[con.id] !== con.isPresent) {
          hasChanged = true;
        }
      }

      if (!hasChanged) {
        this.close();
        return;
      }
    }

    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Möchtest du die Eingabe wirklich beenden?",
      message: "Alle Ändeungen werden verworfen.",
      buttons: [{
        text: "Abrrechen",
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

  async onAttChange(player: Player) {
    this.hasChanges = true;
    if (this.withExcuses && this.excused.has(player.id.toString())) {
      this.excused.delete(player.id.toString());
      return;
    } else if (this.withExcuses && player.isPresent) {
      this.excused.add(player.id.toString());
    }

    player.isPresent = !player.isPresent;
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

  async exportPlan() {
    Utils.createPlanExport({
      ...this.attendance.plan,
      history: await this.db.getUpcomingHistory(),
      attendance: this.attendance.id,
      attendances: await this.db.getAttendance(),
    });
  }

}
