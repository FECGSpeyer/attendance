import { Component, effect } from '@angular/core';
import { ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { AttendancePage } from '../../../attendance/attendance/attendance.page';
import { DbService } from '../../../services/db.service';
import { Attendance, PersonAttendance } from '../../../utilities/interfaces';
import { Utils } from '../../../utilities/Utils';
import { AttendanceStatus, Role } from '../../../utilities/constants';

@Component({
  selector: 'app-next-event-card',
  templateUrl: './next-event-card.component.html',
  styleUrls: ['./next-event-card.component.scss'],
  standalone: false,
})
export class NextEventCardComponent {
  readonly AttendanceStatus = AttendanceStatus;
  public lastEvent: Attendance | null = null;
  public nextEvent: Attendance | null = null;

  public lastPerc = 0;
  public lastPresent = 0;
  public lastExcused = 0;
  public lastTotal = 0;

  public nextTotal = 0;
  public nextPresent = 0;
  public nextExcused = 0;
  public nextShiftWorkers = 0;
  public nextNeutral = 0;
  public nextExcusedPersons: PersonAttendance[] = [];

  public canOpenAttendance = false;
  public loading = true;
  private loadDone = false;

  constructor(public db: DbService, private modalController: ModalController) {
    effect(() => {
      if (this.db.tenant() && !this.loadDone) {
        this.loadDone = true;
        this.load();
      }
    });

    effect(() => {
      const role = this.db.tenantUser()?.role;
      this.canOpenAttendance = role === Role.ADMIN
        || role === Role.RESPONSIBLE
        || role === Role.HELPER
        || role === Role.VOICE_LEADER_HELPER;
    });
  }

  async load() {
    this.loadDone = false;
    this.loading = true;
    try {
      const all: Attendance[] = await this.db.getAttendance(false, true);
      const now = dayjs().startOf('day');
      const past = all
        .filter(a => dayjs(a.date).isBefore(now))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const upcoming = all
        .filter(a => !dayjs(a.date).isBefore(now))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      this.lastEvent = past[0] ?? null;
      this.nextEvent = upcoming[0] ?? null;

      if (this.lastEvent?.persons) {
        const persons = this.lastEvent.persons;
        this.lastPerc = Utils.getPercentage(persons, this.db.tenant()?.shift_excused_as_present);
        this.lastPresent = persons.filter(p =>
          p.status === AttendanceStatus.Present || p.status === AttendanceStatus.Late
        ).length;
        this.lastExcused = persons.filter(p =>
          p.status === AttendanceStatus.Excused || p.status === AttendanceStatus.LateExcused
        ).length;
        this.lastTotal = persons.length;
      }

      if (this.nextEvent?.persons) {
        const persons = this.nextEvent.persons;
        this.nextTotal = persons.length;
        this.nextPresent = persons.filter(p =>
          p.status === AttendanceStatus.Present || p.status === AttendanceStatus.Late
        ).length;
        this.nextExcused = persons.filter(p =>
          p.status === AttendanceStatus.Excused || p.status === AttendanceStatus.LateExcused
        ).length;
        this.nextShiftWorkers = persons.filter(p =>
          (p.status === AttendanceStatus.Excused || p.status === AttendanceStatus.LateExcused) &&
          Utils.isWorkExcused(p.notes)
        ).length;
        this.nextNeutral = persons.filter(p => p.status === AttendanceStatus.Neutral).length;
        this.nextExcusedPersons = persons
          .filter(p => p.status === AttendanceStatus.Excused || p.status === AttendanceStatus.LateExcused)
          .sort((a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? '') || (a.lastName ?? '').localeCompare(b.lastName ?? ''));
      }
    } finally {
      this.loading = false;
    }
  }

  async openAttendance(id: number): Promise<void> {
    const modal = await this.modalController.create({
      component: AttendancePage,
      presentingElement: document.querySelector('ion-router-outlet'),
      componentProps: { attendanceId: id, isModal: true },
    });
    await modal.present();
    await modal.onDidDismiss();
    await this.load();
  }

  formatDate(date: string, format: string): string {
    return dayjs(date).locale('de').format(format);
  }

  percColor(perc: number): string {
    if (perc >= 75) return 'success';
    if (perc >= 50) return 'warning';
    return 'danger';
  }

  statusLabel(status: AttendanceStatus): string {
    return status === AttendanceStatus.LateExcused ? 'Entsch. verspätet' : 'Entschuldigt';
  }

  isShift(notes: string): boolean {
    return Utils.isWorkExcused(notes);
  }
}
