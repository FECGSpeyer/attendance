/* eslint-disable arrow-body-style */
import { Component, effect, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, IonAccordionGroup, IonModal } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus, Role } from 'src/app/utilities/constants';
import { Attendance, PersonAttendance, Player, Song, Tenant, TenantUser } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

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
  public personAttendances: PersonAttendance[] = [];
  public selAttIds: string[] = [];
  public reason: string;
  public perc: number;
  public version: string = require('../../../../package.json').version;
  public name: string;
  public isLateComingEvent: boolean;
  public reasonSelection;
  public signoutTitle: string;
  public attIsToday: boolean;
  public lateCount: number = 0;
  public songs: Song[] = [];
  public tenantId: number;
  public tenants: Tenant[] = [];

  constructor(
    public db: DbService,
    private actionSheetController: ActionSheetController,
    private router: Router,
  ) {
    effect(async () => {
      if (this.db.tenant()) {
        this.initialize();
      }
    });
  }

  async ngOnInit() {
    await this.initialize();
  }

  async initialize() {
    this.name = this.db.tenant().longName;
    this.tenants = this.db.tenants();
    this.tenantId = this.db.tenant().id;
    if (this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.HELPER) {
      this.player = await this.db.getPlayerByAppId();
      this.songs = await this.db.getSongs();
      await this.getAttendances();
    }
  }

  async signout() {
    await this.db.signout(this.selAttIds, this.reason, this.isLateComingEvent);

    this.excuseModal.dismiss();
    this.reason = "";

    Utils.showToast(this.isLateComingEvent ? "Vielen Dank für die Info und Gottes Segen dir!" : "Vielen Dank für deine rechtzeitige Abmeldung und Gottes Segen dir.", "success", 4000);

    this.reasonSelection = '';

    await this.getAttendances();
  }

  async signin(attendance: PersonAttendance) {
    await this.db.signin(attendance.id, attendance.status === AttendanceStatus.LateExcused);

    Utils.showToast("Schön, dass du dabei bist 🙂", "success", 4000);

    await this.getAttendances();
  }

  async getAttendances() {
    const allPersonAttendances = await this.db.getPersonAttendances(this.player.id);
    if (!this.player.paused) {
      const allAttendances: Attendance[] = await this.db.getAttendance();

      this.attendances = allAttendances.filter((attendance: Attendance) => {
        if (!dayjs(attendance.date).isAfter(dayjs(), "day")) {
          return false;
        }

        return allPersonAttendances.some((personAtt: PersonAttendance) => {
          return personAtt.person_id === this.player.id &&
            personAtt.status !== AttendanceStatus.Excused && personAtt.status !== AttendanceStatus.LateExcused;
        });
      }).sort((a: Attendance, b: Attendance) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (this.attendances.length) {
        this.selAttIds = [this.attendances[0].id as any];
      } else {
        this.selAttIds = [];
      }
    }

    this.personAttendances = allPersonAttendances;
    const vergangene: PersonAttendance[] = this.personAttendances.filter((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs().startOf("day")));
    if (vergangene.length) {
      this.lateCount = vergangene.filter((a) => a.status === AttendanceStatus.Late).length;
      vergangene[0].showDivider = true;
      this.perc = Math.round(vergangene.filter((att: PersonAttendance) =>
        att.status === AttendanceStatus.Present || att.status === AttendanceStatus.Late).length / vergangene.length * 100);
    }
  }

  logout() {
    this.db.logout();
  }

  async presentActionSheetForChoice(attendance: PersonAttendance) {
    this.reasonSelection = 'Krankheitsbedingt';
    let buttons = [
      {
        text: 'Anmelden',
        handler: () => this.signin(attendance),
      },
      {
        text: 'Abmelden',
        handler: () => {
          if (this.isAttToday(attendance)) {
            this.attIsToday = true;
            this.reasonSelection = 'Sonstiger Grund';
            this.reason = '';
          } else {
            this.attIsToday = false;
            this.reason = 'Krankheitsbedingt';
          }
          this.excuseModal.present();
          this.isLateComingEvent = false;
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Verspätung eintragen',
        handler: () => {
          if (this.isAttToday(attendance)) {
            this.attIsToday = true;
            this.reasonSelection = 'Sonstiger Grund';
            this.reason = '';
          } else {
            this.attIsToday = false;
            this.reason = 'Krankheitsbedingt';
          }
          this.excuseModal.present();
          this.isLateComingEvent = true;
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Cancel',
        handler: () => { },
        role: 'cancel',
        data: {
          action: 'cancel',
        },
      },
    ];

    if (attendance.text === "X") {
      buttons = buttons.filter((btn) => btn.text !== 'Anmelden');
    } else if (attendance.text === "E") {
      buttons = buttons.filter((btn) => btn.text !== 'Abmelden');
    } else if (attendance.text === "L") {
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

    if (currentReasonSelection !== 'Sonstiger Grund') {
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

  isAttToday(att: PersonAttendance) {
    return dayjs(att.date).isSame(dayjs(), "day");
  }

  getReadableDate(date: string): string {
    dayjs.locale("de");
    return dayjs(date).format("ddd, DD.MM.YYYY");
  }

  async handleRefresh(event) {
    await this.getAttendances();

    event.target.complete();
  }

  getSongNames(songIds: number[]): string {
    return songIds.map((id: number) => {
      return `${this.songs.find((s: Song) => s.id === id).number} ${this.songs.find((s: Song) => s.id === id).name}`;
    }).join(", ");
  }

  async onTenantChange(): Promise<void> {
    this.db.tenantUser.set(this.db.tenantUsers().find((tu: TenantUser) => tu.tenantId === this.tenantId));
    this.db.tenant.set(this.db.tenants().find((tenant: Tenant) => tenant.id === this.tenantId));
    if (this.db.tenantUser().role !== Role.PLAYER) {
      this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
    }
  }
}
