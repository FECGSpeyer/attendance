import { Component } from '@angular/core';
import dayjs from 'dayjs';
import { DbService } from '../../../services/db.service';
import { Attendance } from '../../../utilities/interfaces';
import { Utils } from '../../../utilities/Utils';
import { AttendanceStatus } from '../../../utilities/constants';

@Component({
  selector: 'app-next-event-card',
  templateUrl: './next-event-card.component.html',
  styleUrls: ['./next-event-card.component.scss'],
  standalone: false,
})
export class NextEventCardComponent {
  public lastEvent: Attendance | null = null;
  public nextEvent: Attendance | null = null;

  // Letzter Termin
  public lastPerc = 0;
  public lastPresent = 0;
  public lastExcused = 0;
  public lastTotal = 0;

  // Nächster Termin
  public nextTotal = 0;
  public nextExcused = 0;
  public nextShiftWorkers = 0;
  public nextNeutral = 0;

  public loading = true;

  constructor(public db: DbService) {}

  async load() {
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
        this.nextExcused = persons.filter(p =>
          p.status === AttendanceStatus.Excused || p.status === AttendanceStatus.LateExcused
        ).length;
        this.nextShiftWorkers = persons.filter(p =>
          (p.status === AttendanceStatus.Excused || p.status === AttendanceStatus.LateExcused) &&
          Utils.isWorkExcused(p.notes)
        ).length;
        this.nextNeutral = persons.filter(p => p.status === AttendanceStatus.Neutral).length;
      }
    } finally {
      this.loading = false;
    }
  }

  percColor(perc: number): string {
    if (perc >= 75) return 'success';
    if (perc >= 50) return 'warning';
    return 'danger';
  }
}
