import { Component, OnInit } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';
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

  constructor(
    public db: DbService,
  ) { }

  async ngOnInit() {
    this.kids = await this.db.getPlayers();
    this.attendances = await this.db.getUpcomingAttendances();
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

  async openActionSheet(attendance: any, allKids: boolean = false) {
    let reasonSelection = 'Krankheitsbedingt';
    let buttons = [
      {
        text: 'Anmelden',
        handler: () => this.signin(attendance),
      },
      {
        text: 'Abmelden',
        handler: () => {
          // if (this.isAttToday(attendance)) {
          //   this.attIsToday = true;
          //   reasonSelection = 'Sonstiger Grund';
          //   this.reason = '';
          // } else {
          //   this.attIsToday = false;
          //   this.reason = 'Krankheitsbedingt';
          // }
          // this.excuseModal.present();
          // this.isLateComingEvent = false;
          // this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Verspätung eintragen',
        handler: () => {
          // if (this.isAttToday(attendance)) {
          //   this.attIsToday = true;
          //   this.reasonSelection = 'Sonstiger Grund';
          //   this.reason = '';
          // } else {
          //   this.attIsToday = false;
          //   this.reason = 'Krankheitsbedingt';
          // }
          // this.excuseModal.present();
          // this.isLateComingEvent = true;
          // this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Abbrechen',
        handler: () => { },
        role: 'cancel',
        data: {
          action: 'cancel',
        },
      },
    ];

    if (attendance.status === AttendanceStatus.Present) {
      buttons = buttons.filter((btn) => btn.text !== 'Anmelden');
    } else if (attendance.status === AttendanceStatus.Absent) {
      buttons = buttons.filter((btn) => btn.text !== 'Abmelden');
    } else if (attendance.status === AttendanceStatus.Late) {
      buttons = buttons.filter((btn) => btn.text !== 'Verspätung eintragen');
    }
    // this.selAttIds = [attendance.id];
    const actionSheet = await new ActionSheetController().create({
      buttons,
    });

    await actionSheet.present();
  }

  onReasonSelect(event) {
    const currentReasonSelection = event.detail.value;
    if (!currentReasonSelection) return;

    // if (currentReasonSelection !== 'Sonstiger Grund') {
    //   this.excuseModal.setCurrentBreakpoint(0.3);
    //   this.reason = currentReasonSelection;
    // } else {
    //   this.excuseModal.setCurrentBreakpoint(0.4);
    //   this.reason = '';
    // }
  }

    async signin(attendance: PersonAttendance) {
      await this.db.signin(attendance.id, attendance.status === AttendanceStatus.LateExcused ? 'lateSignIn' : attendance.status === AttendanceStatus.Neutral ? "neutralSignin" : 'signin');

      Utils.showToast("Danke für die Anmeldung 🙂", "success", 4000);

      this.personAttendances = await this.db.getParentAttendances(this.kids, this.attendances);
    }
}
