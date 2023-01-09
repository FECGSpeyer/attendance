import { Component, OnInit } from '@angular/core';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Attendance, PersonAttendance, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-signout',
  templateUrl: './signout.page.html',
  styleUrls: ['./signout.page.scss'],
})
export class SignoutPage implements OnInit {
  public player: Player;
  public attendances: Attendance[] = [];
  public playerAttendance: PersonAttendance[] = [];
  public selAttIds: number[] = [];
  public reason: string;
  public perc: number;

  constructor(
    private db: DbService,
  ) { }

  async ngOnInit() {
    this.player = await this.db.getPlayerByAppId();
    await this.getAttendances();
  }

  async signout() {
    await this.db.signout(this.player.id, this.selAttIds, this.reason);

    Utils.showToast("Vielen Dank für deine Abmeldung! Gottes Segen.");

    await this.getAttendances();
  }

  async getAttendances() {
    this.attendances = (await this.db.getAttendance()).filter((attendance: Attendance) => {
      return dayjs(attendance.date).isAfter(dayjs()) &&
        Object.keys(attendance.players).includes(String(this.player.id)) &&
        !attendance.excused.includes(String(this.player.id));
    });

    if (this.attendances.length) {
      this.selAttIds = [this.attendances[0].id];
    } else {
      this.selAttIds = [];
    }

    this.playerAttendance = await this.db.getPlayerAttendance(this.player.id);
    this.perc = Math.round(this.playerAttendance.filter((att: PersonAttendance) => att.attended).length / this.playerAttendance.length * 100);
  }

}
