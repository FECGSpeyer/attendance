import { Component, OnInit } from '@angular/core';
import { AlertController, IonModal, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Attendance, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { AttPage } from '../att/att.page';
import 'jspdf-autotable';
require('dayjs/locale/de');

@Component({
  selector: 'app-att-list',
  templateUrl: './att-list.page.html',
  styleUrls: ['./att-list.page.scss'],
})
export class AttListPage implements OnInit {
  public date: string = new Date().toISOString();
  public dateString: string = format(new Date(), 'dd.MM.yyyy');
  public type: string = 'uebung';
  public attendances: Attendance[] = [];
  public oldAttendances: Attendance[] = [];
  public currentAttendance: Attendance;
  public isConductor: boolean = false;
  public notes: string;
  public typeInfo: string;
  public perc: number = 0;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
  ) { }

  async logout() {
    await this.db.logout();
  }

  async ngOnInit() {
    await this.getAttendance();
    this.db.authenticationState.subscribe((state: { isConductor: boolean, isHelper: boolean }) => {
      this.isConductor = state.isConductor;
    });
  }

  async getAttendance(): Promise<void> {
    const attendances: Attendance[] = (await this.db.getAttendance()).map((att: Attendance): Attendance => {
      return {
        ...att,
        percentage: Object.keys(att.players).length ? Utils.getPercentage(att.players) : undefined,
      }
    });

    this.attendances = attendances.filter((att: Attendance) => dayjs(att.date).isAfter(dayjs().startOf("day"))).reverse();
    this.oldAttendances = attendances.filter((att: Attendance) => dayjs(att.date).isBefore(dayjs().startOf("day")));
    if (this.attendances.length) {
      this.currentAttendance = { ...this.attendances[0] };
      this.attendances.splice(0, 1);
    }

    if (this.oldAttendances.length) {
      this.perc = Math.round((this.oldAttendances.reduce((value: number, current: Attendance) => value + current.percentage, 0)) / this.oldAttendances.length);
    }
  }

  async remove(id: number): Promise<void> {
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Möchtest du die Anwesenheit wirklich entfernen?",
      buttons: [{
        text: "Abrrechen",
      }, {
        text: "Fortfahren",
        handler: async (): Promise<void> => {
          await this.db.removeAttendance(id);
          await this.getAttendance();
        }
      }]
    });

    await alert.present();
  }

  onDateChanged(value: string, dateModal: IonModal): void {
    if (parseInt(this.dateString.substring(0, 2), 10) !== dayjs(this.date).date()) {
      dateModal.dismiss();
    }

    this.dateString = this.formatDate(value);
  }

  async addAttendance(modal: IonModal): Promise<void> {
    const conductors: {} = {};
    const players: {} = {};

    for (const con of (await this.db.getConductors())) {
      conductors[con.id] = true;
    }

    for (const player of (await this.db.getPlayers()).filter((player: Player) => !player.paused)) {
      players[player.id] = true;
    }

    await this.db.addAttendance({
      date: this.date,
      type: this.type,
      criticalPlayers: [],
      notes: this.notes,
      typeInfo: this.typeInfo,
      playerNotes: {},
      players,
      conductors,
      excused: [],
    });

    await modal.dismiss();
    await this.getAttendance();
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  getTypeText(key: string, notes: string): string {
    if (key === "sonstiges" && notes) {
      return notes;
    }

    return Utils.getTypeText(key);
  }

  getReadableDate(date: string): string {
    dayjs.locale("de");
    return dayjs(date).format("ddd, DD.MM.YYYY");
  }

  async openAttendance(attendance): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: AttPage,
      backdropDismiss: false,
      componentProps: {
        attendance,
      }
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data?.updated) {
      await this.getAttendance();
    }
  }
}
