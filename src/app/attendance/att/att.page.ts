import { Component, Input, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Attendance, AttendanceItem, Instrument, Person, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-att',
  templateUrl: './att.page.html',
  styleUrls: ['./att.page.scss'],
})
export class AttPage implements OnInit {
  @Input() attendance: Attendance;
  public players: Player[] = [];
  public conductors: Person[] = [];

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit(): Promise<void> {
    const conductors: Person[] = await this.db.getConductors();
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
    } else {
      attPlayers = allPlayers;
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

    await this.db.updateAttendance({
      players: playerMap,
      conductors: conductorsMap,
    }, this.attendance.id);

    this.modalController.dismiss({
      updated: true
    });
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

}
