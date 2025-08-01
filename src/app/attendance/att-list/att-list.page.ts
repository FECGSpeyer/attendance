import { Component, OnInit, effect } from '@angular/core';
import { AlertController, IonItemSliding, IonModal, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Attendance, PersonAttendance, Player, Song } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import 'jspdf-autotable';
import { AttendanceStatus, AttendanceType, Role } from 'src/app/utilities/constants';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AttendancePage } from '../attendance/attendance.page';
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
  public isChoir: boolean = false;
  public notes: string;
  public typeInfo: string;
  public perc: number = 0;
  private sub: RealtimeChannel;
  private persSub: RealtimeChannel;
  public songs: Song[] = [];
  public selectedSongs: number[] = [];
  public hasNeutral: boolean = false;

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
    this.isChoir = this.db.tenant().type === AttendanceType.CHOIR;
    this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
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
          if (event.new?.tenantId === this.db.tenant().id || event.old?.id) {
            this.getAttendance();
          }
        })
      .subscribe();

    this.persSub = this.db.getSupabase()
      .channel('person-att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'person_attendances' },
        (event: any) => {
          if (event.new?.tenantId === this.db.tenant().id) {
            this.getAttendance();
          }
        })
      .subscribe();
  }

  async ngOnDestroy() {
    await this.sub.unsubscribe();
    await this.persSub.unsubscribe();
  }

  async getAttendance(): Promise<void> {
    const attendances: Attendance[] = (await this.db.getAttendance(false, true)).map((att: Attendance): Attendance => {
      return {
        ...att,
        percentage: Utils.getPercentage(att.persons),
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

  onDateChanged(value: string | string[], dateModal: IonModal): void {
    if (parseInt(this.dateString.substring(0, 2), 10) !== dayjs(this.date).date()) {
      dateModal.dismiss();
    }

    this.dateString = this.formatDate(String(value));
  }

  async addAttendance(modal: IonModal): Promise<void> {
    const persons: PersonAttendance[] = [];

    const attendance_id: number = await this.db.addAttendance({
      date: this.date,
      type: this.type,
      notes: this.notes,
      typeInfo: this.typeInfo,
      songs: this.selectedSongs,
    });

    for (const player of (await this.db.getPlayers()).filter((player: Player) => !player.paused)) {
      persons.push({
        attendance_id,
        person_id: player.id,
        status: this.hasNeutral ? AttendanceStatus.Neutral : AttendanceStatus.Present,
        notes: '',
      });
    }

    await this.db.addPersonAttendances(persons);

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
    this.persSub?.unsubscribe();

    const modal = await this.modalController.create({
      component: AttendancePage,
      componentProps: {
        attendanceId: attendance.id,
      }
    });

    await modal.present();
    await modal.onWillDismiss();
    await this.getAttendance();
    this.subscribeOnAttChannel();
  }

  onTypeChange(): void {
    this.hasNeutral = this.type !== 'uebung';
  }
}
