import { Component, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, IonModal } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus } from 'src/app/utilities/constants';
import { Attendance, Person, PersonAttendance } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-parents',
  templateUrl: './parents.page.html',
  styleUrls: ['./parents.page.scss'],
})
export class ParentsPage implements OnInit {
  public kids: Person[] = [];
  public attendances: Attendance[] = [];
  public personAttendances: PersonAttendance[] = [];
  public reason: string;
  public isLateComingEvent: boolean;
  public selAttIds: string[] = [];
  public selPersAttIds: string[] = [];
  public reasonSelection: string;
  @ViewChild('excuseModal') excuseModal: IonModal;

  constructor(
    public db: DbService,
    private actionSheetController: ActionSheetController,
  ) { }

  async ngOnInit() {
    this.kids = await this.db.getPlayers();
    this.attendances = (await this.db.getUpcomingAttendances()).reverse();
    this.personAttendances = await this.db.getParentAttendances(this.kids, this.attendances);
  }

  getStatusText(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Present:
        return '✓';
      case AttendanceStatus.Absent:
        return 'X';
      case AttendanceStatus.Late:
      case AttendanceStatus.LateExcused:
        return 'L';
      case AttendanceStatus.Neutral:
        return 'N';
      default:
        return 'E';
    }
  }

  async openActionSheet(attendance: any, allKids: boolean = false, personAttendance?: any) {
    this.selAttIds = allKids ? this.personAttendances.filter((pa) => pa.attendance_id === attendance.id).map((pa) => pa.id) : personAttendance ? [personAttendance.id] : [];
    this.reasonSelection = 'Krankheitsbedingt';
    let buttons = [
      {
        text: 'Anmelden',
        handler: () => this.signin(attendance),
      },
      {
        text: 'Abmelden',
        handler: () => {
          if (dayjs(attendance.date).isSame(dayjs(), "day")) {
            this.reasonSelection = 'Sonstiger Grund';
            this.reason = '';
          } else {
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
          if (dayjs(attendance.date).isSame(dayjs(), "day")) {
            this.reasonSelection = 'Sonstiger Grund';
            this.reason = '';
          } else {
            this.reason = 'Krankheitsbedingt';
          }
          this.excuseModal.present();
          this.isLateComingEvent = true;
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Abbrechen',
        handler: () => { },
        role: 'destructive',
        data: {
          action: 'cancel',
        },
      },
    ];

    if (personAttendance) {
      if (personAttendance.status === AttendanceStatus.Present) {
        buttons = buttons.filter((btn) => btn.text !== 'Anmelden');
      } else if (personAttendance.status === AttendanceStatus.Absent) {
        buttons = buttons.filter((btn) => btn.text !== 'Abmelden');
      } else if (personAttendance.status === AttendanceStatus.Late) {
        buttons = buttons.filter((btn) => btn.text !== 'Verspätung eintragen');
      }
    }

    const actionSheet = await new ActionSheetController().create({
      buttons,
    });

    await actionSheet.present();
  }

    async signout() {
    await this.db.signout(this.selAttIds, this.reason, this.isLateComingEvent, true);

    this.excuseModal.dismiss();
    this.reason = "";

    Utils.showToast(this.isLateComingEvent ? "Vielen Dank für die Info und Gottes Segen!" : "Vielen Dank für die rechtzeitige Abmeldung und Gottes Segen!", "success", 4000);

    this.reasonSelection = '';

    this.personAttendances = await this.db.getParentAttendances(this.kids, this.attendances);
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

  async signin(attendance: PersonAttendance) {
    for (const attId of this.selAttIds) {
      await this.db.signin(attId, attendance.status === AttendanceStatus.LateExcused ? 'lateSignIn' : attendance.status === AttendanceStatus.Neutral ? "neutralSignin" : 'signin');
    }

    Utils.showToast("Danke für die Anmeldung 🙂", "success", 4000);

    this.personAttendances = await this.db.getParentAttendances(this.kids, this.attendances);
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
}
