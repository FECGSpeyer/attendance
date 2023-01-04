import { Component, Input, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { PlayerHistoryType } from 'src/app/utilities/constants';
import { Attendance, AttendanceItem, Instrument, Person, Player, PlayerHistoryEntry } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { environment } from 'src/environments/environment.prod';

@Component({
  selector: 'app-att',
  templateUrl: './att.page.html',
  styleUrls: ['./att.page.scss'],
})
export class AttPage implements OnInit {
  @Input() attendance: Attendance;
  public players: Player[] = [];
  public conductors: Person[] = [];
  public excused: Set<string> = new Set();
  public withExcuses: boolean = environment.withExcuses;

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit(): Promise<void> {
    const conductors: Person[] = await this.db.getConductors(true);
    const allPlayers: Player[] = await this.db.getPlayers();
    const instruments: Instrument[] = await this.db.getInstruments();
    let attPlayers: Player[] = [];

    if (Object.keys(this.attendance.players).length) {
      for (let player of Object.keys(this.attendance.players)) {
        if (Boolean(allPlayers.find((p: Player) => p.id === Number(player)))) {
          attPlayers.push({
            ...allPlayers.find((p: Player) => p.id === Number(player)),
            isPresent: this.attendance.players[Number(player)],
          });
        }
      }
      this.excused = new Set(this.attendance.excused) || new Set<string>();
    } else {
      attPlayers = allPlayers.filter((player: Player) => !player.paused);
    }

    if (Object.keys(this.attendance.conductors).length) {
      for (let con of Object.keys(this.attendance.conductors)) {
        this.conductors.push({
          ...conductors.find((p: Player) => p.id === Number(con)),
          isPresent: this.attendance.conductors[Number(con)],
        });
      }
    } else {
      this.conductors = conductors.filter((c: Person): boolean => !c.isInactive).map((c: Person): Person => {
        return {
          ...c,
          isPresent: true,
        }
      });
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
      players: playerMap,
      conductors: conductorsMap,
      excused: Array.from(this.excused),
      criticalPlayers: this.attendance.criticalPlayers.concat(unexcusedPlayers.map((player: Player) => player.id)),
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
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Möchtest du die Eingabe wirklich beenden?",
      message: "Alle Ändeungen werden verworfen.",
      buttons: [{
        text: "Abrrechen",
      }, {
        text: "Fortfahren",
        handler: (): void => {
          this.modalController.dismiss();
        }
      }]
    });

    await alert.present();
  }

  async onAttChange(player: Player) {
    if (this.withExcuses && this.excused.has(player.id.toString())) {
      this.excused.delete(player.id.toString());
      return;
    } else if (this.withExcuses && player.isPresent) {
      this.excused.add(player.id.toString());
    }

    player.isPresent = !player.isPresent;
  }

  getPlayerLengthByInstrument(players: Player[], player: Player): number {
    return players.filter((p) => p.instrument === player.instrument).length;
  }

}
