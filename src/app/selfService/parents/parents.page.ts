import { Component, effect, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, IonModal } from '@ionic/angular';
import dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus } from 'src/app/utilities/constants';
import { Attendance, History, Person, PersonAttendance } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

interface KidStats {
  perc: number;
  lateCount: number;
}

@Component({
    selector: 'app-parents',
    templateUrl: './parents.page.html',
    styleUrls: ['./parents.page.scss'],
    standalone: false
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

  // New properties for optimized UI
  public currentAttendance: Attendance;
  public upcomingAttendances: Attendance[] = [];
  public pastAttendances: Attendance[] = [];
  public kidStats: { [key: number]: KidStats } = {};
  public upcomingSongs: { date: string; history: History[] }[] = [];
  public songsModalOpen: boolean = false;

  @ViewChild('excuseModal') excuseModal: IonModal;

  constructor(
    public db: DbService,
    private actionSheetController: ActionSheetController,
  ) {
    effect(async () => {
      if (this.db.tenant()) {
        await this.initialize();
      }
    });
  }

  async ngOnInit() {
    await this.initialize();
  }

  async initialize() {
    this.kids = await this.db.getPlayers();

    // Get all person attendances for all kids (includes past and future)
    const allPersonAttendances: PersonAttendance[] = [];
    for (const kid of this.kids) {
      const kidAttendances = await this.db.getPersonAttendances(kid.id, true);
      // Add person info to each attendance
      kidAttendances.forEach(pa => {
        (pa as any).person = { firstName: kid.firstName };
        (pa as any).person_id = kid.id;
        (pa as any).attendance_id = pa.attId;
      });
      allPersonAttendances.push(...kidAttendances);
    }

    this.personAttendances = allPersonAttendances.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Build unique attendances from personAttendances for organizing
    const uniqueAttendanceIds = new Set<number>();
    this.attendances = [];
    for (const pa of this.personAttendances) {
      if (!uniqueAttendanceIds.has(pa.attId)) {
        uniqueAttendanceIds.add(pa.attId);
        this.attendances.push({
          id: pa.attId,
          date: pa.date,
          type_id: pa.typeId,
          title: pa.title,
        } as unknown as Attendance);
      }
    }

    // Organize attendances
    this.organizeAttendances();

    // Calculate statistics per kid
    this.calculateKidStats();

    // Get current songs
    this.upcomingSongs = await this.db.getCurrentSongs();
  }

  organizeAttendances() {
    const today = dayjs().startOf('day');

    const current: Attendance[] = [];
    const upcoming: Attendance[] = [];
    const past: Attendance[] = [];

    for (const att of this.attendances) {
      const attDate = dayjs(att.date);
      if (attDate.isSame(today, 'day')) {
        current.push(att);
      } else if (attDate.isAfter(today)) {
        upcoming.push(att);
      } else {
        past.push(att);
      }
    }

    // Sort upcoming ascending (closest first)
    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Sort past descending (most recent first)
    past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    this.currentAttendance = current[0];
    this.upcomingAttendances = upcoming;
    this.pastAttendances = past.slice(0, 10); // Limit past attendances
  }

  calculateKidStats() {
    this.kidStats = {};

    for (const kid of this.kids) {
      const kidAttendances = this.personAttendances.filter(
        pa => pa.person_id === kid.id && dayjs(pa.date).isBefore(dayjs().startOf('day'))
      );

      if (kidAttendances.length === 0) {
        this.kidStats[kid.id] = { perc: 0, lateCount: 0 };
        continue;
      }

      const attended = kidAttendances.filter(pa =>
        pa.status === AttendanceStatus.Present ||
        pa.status === AttendanceStatus.Late ||
        pa.status === AttendanceStatus.LateExcused
      );

      const lateCount = kidAttendances.filter(pa => pa.status === AttendanceStatus.Late).length;

      this.kidStats[kid.id] = {
        perc: Math.round((attended.length / kidAttendances.length) * 100),
        lateCount
      };
    }
  }

  getReadableDate(date: string, type_id: string): string {
    const attType = this.db.attendanceTypes().find(type => type.id === type_id);
    if (!attType) {
      // Fallback if attendance type not found
      return dayjs(date).locale('de').format('ddd, DD.MM.YYYY');
    }
    return Utils.getReadableDate(date, attType);
  }

  getStatusText(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Present:
        return '✓';
      case AttendanceStatus.Absent:
        return 'A';
      case AttendanceStatus.Late:
        return 'L';
      case AttendanceStatus.LateExcused:
        return 'LE';
      case AttendanceStatus.Neutral:
        return 'N';
      default:
        return 'E';
    }
  }

  async openActionSheet(attendance: any, allKids: boolean = false, personAttendance?: any) {
    this.selAttIds = allKids
      ? this.personAttendances.filter((pa) => pa.attendance_id === attendance.id).map((pa) => pa.id)
      : personAttendance ? [personAttendance.id] : [];
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

    const actionSheet = await this.actionSheetController.create({
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

    await this.refreshPersonAttendances();
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

    await this.refreshPersonAttendances();
  }

  async refreshPersonAttendances() {
    const allPersonAttendances: PersonAttendance[] = [];
    for (const kid of this.kids) {
      const kidAttendances = await this.db.getPersonAttendances(kid.id, true);
      kidAttendances.forEach(pa => {
        (pa as any).person = { firstName: kid.firstName };
        (pa as any).person_id = kid.id;
        (pa as any).attendance_id = pa.attId;
      });
      allPersonAttendances.push(...kidAttendances);
    }

    this.personAttendances = allPersonAttendances.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    this.organizeAttendances();
    this.calculateKidStats();
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

  isReasonSelectionInvalid(reason: string): boolean {
    if (!(reason && reason.length > 4) || /\S/.test(reason) === false) {
      return true;
    }
    return false;
  }

  async handleRefresh(event) {
    await this.initialize();
    event.target.complete();
  }

  openSongLink(link: string) {
    if (link) {
      window.open(link, "_blank");
    }
  }
}
