import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from '../services/db.service';
import { Attendance, Player } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';
import { DefaultAttendanceType } from '../utilities/constants';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.page.html',
  styleUrls: ['./stats.page.scss'],
})
export class StatsPage implements OnInit {
  public attendances: Attendance[] = [];
  public pratices: Attendance[] = [];
  public vortraege: Attendance[] = [];
  public hochzeiten: Attendance[] = [];
  public otherAttendances: Attendance[] = [];
  public players: Player[] = [];
  public leftPlayers: Player[] = [];
  public activePlayers: Player[] = [];
  public pausedPlayers: Player[] = [];
  public bestAttendance: Attendance;
  public worstAttendance: Attendance;
  public attPerc: number;
  public isChoir: boolean = false;
  public curAttDate: Date;
  public isGeneral: boolean = false;

  constructor(
    private db: DbService,
    private modalController: ModalController,
  ) { }

  async ngOnInit() {
    this.curAttDate = new Date(await this.db.getCurrentAttDate());
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.attendances = (await this.db.getAttendance(false, true)).filter((att: Attendance) => dayjs(att.date).isBefore(dayjs().add(1, "day"))).map((att: Attendance) => {
      return {
        ...att,
        percentage: Utils.getPercentage(att.persons),
      };
    });
    this.players = await this.db.getPlayers(true);
    this.leftPlayers = this.players.filter((player: Player) => player.left);
    this.activePlayers = this.players.filter((player: Player) => !player.left && !player.paused);
    this.pausedPlayers = this.players.filter((player: Player) => player.paused && !player.left);

    const sort: Attendance[] = this.attendances.sort((a: Attendance, b: Attendance) => a.percentage - b.percentage);
    this.worstAttendance = sort[0];
    this.bestAttendance = sort[sort.length - 1];
    this.pratices = this.attendances.filter((att: Attendance) => att.type === "uebung");
    this.vortraege = this.attendances.filter((att: Attendance) => att.type === "vortrag");
    this.hochzeiten = this.attendances.filter((att: Attendance) => att.type === "hochzeit");
    this.otherAttendances = this.attendances.filter((att: Attendance) => att.type === "sonstiges");
    this.attPerc = Math.round(((this.attendances.map((att: Attendance) => att.percentage).reduce((a: number, b: number) => a + b, 0)) / (this.attendances.length * 100)) * 100);
  }

  dismiss() {
    this.modalController.dismiss();
  }

}
