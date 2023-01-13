import { Component, OnInit } from '@angular/core';
import { ActionSheetController, AlertController, IonModal, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Attendance } from 'src/app/utilities/interfaces';
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
  public attendance: Attendance[] = [];
  public isConductor: boolean = false;
  public notes: string;
  public typeInfo: string;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
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
    this.attendance = (await this.db.getAttendance()).map((att: Attendance): Attendance => {
      return {
        ...att,
        percentage: Object.keys(att.players).length ? Utils.getPercentage(att.players) : undefined,
      }
    });
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

  async addAttendance(modal: IonModal): Promise<void> {
    await this.db.addAttendance({
      date: this.date,
      type: this.type,
      criticalPlayers: [],
      notes: this.notes,
      typeInfo: this.typeInfo,
      playerNotes: {},
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
