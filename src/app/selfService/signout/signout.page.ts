import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Attendance, PersonAttendance, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-signout',
  templateUrl: './signout.page.html',
  styleUrls: ['./signout.page.scss'],
})
export class SignoutPage implements OnInit {
  public player: Player;
  public attendances: Attendance[] = [];
  public excusedAttendances: Attendance[] = [];
  public playerAttendance: PersonAttendance[] = [];
  public selAttIds: number[] = [];
  public reason: string;
  public perc: number;
  public version: string = require('../../../../package.json').version;
  public name: string = environment.longName;

  constructor(
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.player = await this.db.getPlayerByAppId();
    await this.getAttendances();
  }

  async signout() {
    await this.db.signout(this.player, this.selAttIds, this.reason);
    this.reason = "";

    Utils.showToast("Vielen Dank für deine rechtzeitige Abmeldung und Gottes Segen dir.", "success", 4000);

    await this.getAttendances();
  }

  async signin(id: number) {
    await this.db.signin(this.player, id);

    Utils.showToast("Schön, dass du doch kommen kannst.", "success", 4000);

    await this.getAttendances();
  }

  async getAttendances() {
    if (!this.player.paused) {
      const allAttendances: Attendance[] = await this.db.getAttendance();

      this.excusedAttendances = allAttendances.filter((attendance: Attendance) => {
        return dayjs(attendance.date).isAfter(dayjs(), "day") &&
          Object.keys(attendance.players).includes(String(this.player.id)) &&
          attendance.excused.includes(String(this.player.id));
      });

      this.attendances = allAttendances.filter((attendance: Attendance) => {
        return dayjs(attendance.date).isAfter(dayjs(), "day") &&
          Object.keys(attendance.players).includes(String(this.player.id)) &&
          !attendance.excused.includes(String(this.player.id));
      }).sort((a: Attendance, b: Attendance) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (this.attendances.length) {
        this.selAttIds = [this.attendances[0].id];
      } else {
        this.selAttIds = [];
      }
    }

    this.playerAttendance = await this.db.getPlayerAttendance(this.player.id);
    const vergangene: any[] = this.playerAttendance.filter((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs().startOf("day")));
    if (vergangene.length) {
      vergangene[0].showDivider = true;
      this.perc = Math.round(vergangene.filter((att: PersonAttendance) => att.attended).length / vergangene.length * 100);
    }
  }

  logout() {
    this.db.logout();
  }

  canEdit(id: number): boolean {
    return Boolean(this.excusedAttendances.find((att: Attendance) => att.id === id));
  }

  async removeExcuse(id: number) {
    if (!this.excusedAttendances.find((att: Attendance) => att.id === id)) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Bestätigung',
      message: 'Ich kann <strong>doch</strong> anwesend sein',
      buttons: [
        {
          text: 'Abbrechen',
        }, {
          text: 'Anpassen',
          handler: () => {
            this.signin(id);
          }
        }
      ]
    });

    await alert.present();
  }

}
