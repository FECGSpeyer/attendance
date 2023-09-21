/* eslint-disable arrow-body-style */
import { Component, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, AlertController, IonAccordionGroup, IonModal, IonTextarea, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus } from 'src/app/utilities/constants';
import { Attendance, PersonAttendance, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-signout',
  templateUrl: './signout.page.html',
  styleUrls: ['./signout.page.scss'],
})
export class SignoutPage implements OnInit {
  @ViewChild('signoutAccordionGroup') signoutAccordionGroup: IonAccordionGroup;
  @ViewChild('excuseModal') excuseModal: IonModal;
  public player: Player;
  public attendances: Attendance[] = [];
  public excusedAttendances: Attendance[] = [];
  public lateExcusedAttendances: Attendance[] = [];
  public playerAttendance: PersonAttendance[] = [];
  public selAttIds: number[] = [];
  public reason: string;
  public perc: number;
  public version: string = require('../../../../package.json').version;
  public name: string = environment.longName;
  public isLateComingEvent: boolean;
  public reasonSelection;
  public signoutTitle: string;

  constructor(
    private db: DbService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
  ) { }

  async ngOnInit() {
    this.player = await this.db.getPlayerByAppId();
    await this.getAttendances();
  }

  async signout() {
    await this.db.signout(this.player, this.selAttIds, this.reason, this.isLateComingEvent);

    this.excuseModal.dismiss();
    this.reason = "";
    
    Utils.showToast("Vielen Dank für deine rechtzeitige Abmeldung und Gottes Segen dir.", "success", 4000);
    
    this.reasonSelection = '';

    await this.getAttendances();
  }

  async signin(id: number) {
    await this.db.signin(this.player, id);

    Utils.showToast("Schön, dass du dabei bist 🙂", "success", 4000);

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

      this.lateExcusedAttendances = allAttendances.filter((attendance: Attendance) => {
        return dayjs(attendance.date).isAfter(dayjs(), "day") &&
          Object.keys(attendance.players).includes(String(this.player.id)) &&
          attendance.lateExcused.includes(String(this.player.id));
      });

      this.attendances = allAttendances.filter((attendance: Attendance) => {
        return dayjs(attendance.date).isAfter(dayjs(), "day") &&
          Object.keys(attendance.players).includes(String(this.player.id)) &&
          !attendance.excused.includes(String(this.player.id)) &&
          !attendance.lateExcused.includes(String(this.player.id));
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
      this.perc = Math.round(vergangene.filter((att: PersonAttendance) => 
          (att.attended as any) === AttendanceStatus.Present || (att.attended as any) === AttendanceStatus.Late || att.attended === true).length / vergangene.length * 100);
    }
    debugger;
  }

  logout() {
    this.db.logout();
  }

  async presentActionSheetForChoice(attendance: PersonAttendance) {
    this.reasonSelection = 'Krankheitsbedingt';
    let buttons = [
      {
        text: 'Anmelden',
        handler: () => this.signin(attendance.id),
      },
      {
        text: 'Abmelden',
        handler: () => {
          this.excuseModal.present();
          this.isLateComingEvent = false;
          this.reason = 'Krankheitsbedingt';
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Verspätung eintragen',
        handler: () => {
          this.excuseModal.present();
          this.isLateComingEvent = true;
          this.reason = 'Krankheitsbedingt';
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Cancel',
        handler: () => {},
        role: 'cancel',
        data: {
          action: 'cancel',
        },
      },
    ];

    if((attendance.attended as any) === AttendanceStatus.Present) {
      buttons = buttons.filter((btn) => btn.text !== 'Anmelden');
    } else if((attendance.attended as any) === AttendanceStatus.Excused) {
      buttons = buttons.filter((btn) => btn.text !== 'Abmelden');
    } else if((attendance.attended as any) === AttendanceStatus.Late) {
      buttons = buttons.filter((btn) => btn.text !== 'Verspätung eintragen');
    }
    this.selAttIds = [attendance.id];
    const actionSheet = await this.actionSheetController.create({
      buttons,
    });

    await actionSheet.present();
  }

  onReasonSelect(event) {
    const currentReasonSelection = event.detail.value;
    if (!currentReasonSelection) return;
    if(currentReasonSelection !== 'Sonstiger Grund') {
      this.excuseModal.setCurrentBreakpoint(0.3);
      this.reason = currentReasonSelection;
    } else {
    this.excuseModal.setCurrentBreakpoint(0.4);
      this.reason = '';
    }
  }

  dismissExcuseModal() {
    this.excuseModal.dismiss();
  }

  increaseModalBreakpoint() {
    this.excuseModal.setCurrentBreakpoint(0.8);
  }

  decreaseModalBreakpoint() {
    this.excuseModal.setCurrentBreakpoint(0.4);
  }

  attHasPassed(att: PersonAttendance) {
    return dayjs(att.date).isBefore(dayjs(), "day");
  }

  attIsInFuture(att: PersonAttendance) {
    return dayjs(att.date).isAfter(dayjs(), "day");
  }

  async handleRefresh(event) {
    await this.getAttendances();

    event.target.complete();
  }

  doNothing(){
    this.reasonSelection = 'Familienbedingt';
  }
}
