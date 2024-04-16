import { Component, OnInit, effect } from '@angular/core';
import { AlertController, IonItemSliding, IonModal, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Attendance, Player, Song } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { AttPage } from '../att/att.page';
import 'jspdf-autotable';
import { AttendanceStatus, Role } from 'src/app/utilities/constants';
import { Person } from '../../utilities/interfaces';
import { RealtimeChannel } from '@supabase/supabase-js';
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
  public isHelper: boolean = false;
  public notes: string;
  public typeInfo: string;
  public perc: number = 0;
  private sub: RealtimeChannel;
  public songs: Song[] = [];
  public selectedSongs: number[] = [];

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
  ) {
    effect(async () => {
      this.db.tenant();
      await this.getAttendance();
    });
  }

  async logout() {
    await this.db.logout();
  }

  async ngOnInit() {
    this.isConductor = this.db.tenantUser().role === Role.ADMIN;
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
    await this.getAttendance();

    this.subscribeOnAttChannel();

    this.songs = await this.db.getSongs();
  }

  subscribeOnAttChannel() {
    this.sub = this.db.getSupabase()
      .channel('att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (event: any) => {
          if (event.new?.tenantId === this.db.tenant().id || event.old?.tenantId === this.db.tenant().id) {
            this.getAttendance();
          }
        })
      .subscribe();
  }

  async ngOnDestroy() {
    await this.sub.unsubscribe();
  }

  async getAttendance(): Promise<void> {
    const attendances: Attendance[] = (await this.db.getAttendance()).filter((att: Attendance) => Boolean(att.players)).map((att: Attendance): Attendance => {
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
    } else {
      this.currentAttendance = undefined;
    }

    if (this.oldAttendances.length) {
      this.perc = Math.round((this.oldAttendances.reduce((value: number, current: Attendance) => value + current.percentage, 0)) / this.oldAttendances.length);
    }
  }

  async remove(id: number, slider: IonItemSliding): Promise<void> {
    const alert: HTMLIonAlertElement = await this.alertController.create({
      header: "Möchtest du die Anwesenheit wirklich entfernen?",
      buttons: [{
        text: "Abrrechen",
      }, {
        text: "Fortfahren",
        handler: async (): Promise<void> => {
          slider.close();
          await this.db.removeAttendance(id);
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

    for (const con of (await this.db.getConductors()).filter((con: Person) => !con.paused)) {
      conductors[con.id] = AttendanceStatus.Present;
    }

    for (const player of (await this.db.getPlayers()).filter((player: Player) => !player.paused)) {
      if (this.type === 'vortrag' && this.db.tenant().hasNeutralStatus) {
        players[player.id] = AttendanceStatus.Neutral;
      } else {
        players[player.id] = AttendanceStatus.Present;
      }
    }

    await this.db.addAttendance({
      date: this.date,
      type: this.type,
      criticalPlayers: [],
      notes: this.notes,
      typeInfo: this.typeInfo,
      songs: this.selectedSongs,
      playerNotes: {},
      players,
      conductors,
      excused: [],
    });

    await modal.dismiss();

    this.notes = '';
    this.type = 'uebung';
    this.date = new Date().toISOString();
    this.typeInfo = '';
    this.dateString = format(new Date(), 'dd.MM.yyyy');
    this.selectedSongs = [];
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
    if (!this.isConductor && !this.isHelper) {
      return;
    }

    this.sub?.unsubscribe();

    const modal: HTMLIonModalElement = await this.modalController.create({
      component: AttPage,
      componentProps: {
        attendanceId: attendance.id,
      }
    });

    await modal.present();
    await modal.onWillDismiss();
    await this.getAttendance();
    this.subscribeOnAttChannel();
  }
}
