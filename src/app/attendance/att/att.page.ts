import { Component, Input, OnInit } from '@angular/core';
import { ActionSheetController, AlertController, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
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
  public players: Player[] = [];
  public conductors: Person[] = [];
  public excused: Set<string> = new Set();
  public withExcuses: boolean = environment.withExcuses;

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
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
      excused: Array.from(this.excused),
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

  async onAttChange(singer: Player) {
    if (this.withExcuses) {
      const actionSheet = await this.actionSheetController.create({
        header: 'Abwesenheit',
        buttons: [{
          text: 'Entschuldigt',
          handler: () => {
            this.excused.add(String(singer.id));
          }
        }, {
          text: 'Nicht entschuldigt',
        }]
      });

      if (singer.isPresent) {
        this.excused.delete(String(singer.id));
      } else {
        await actionSheet.present();
      }
    }
  }

}
