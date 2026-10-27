import { Component, effect } from '@angular/core';
import { Router } from '@angular/router';
import dayjs from 'dayjs';
import { DbService } from '../../../services/db.service';
import { CrossTenantPersonAttendance } from '../../../utilities/interfaces';
import { calendarMark, CalendarMark, dayKey, groupByDay, mergeCalendarEntries } from '../../../utilities/calendar';
import { eventTimeRange } from '../../../utilities/event-list';
import { Utils } from '../../../utilities/Utils';
import { currentLanguage, dateFmt } from '../../../i18n/languages';

/** Week of Termine across all instances of the user; tapping "Monat" opens the Übersicht calendar. */
@Component({
  selector: 'app-calendar-card',
  templateUrl: './calendar-card.component.html',
  styleUrls: ['./calendar-card.component.scss'],
  standalone: false,
})
export class CalendarCardComponent {
  public entries: CrossTenantPersonAttendance[] = [];
  public selectedDay = dayKey(dayjs());
  public loading = true;
  private byDay = new Map<string, CrossTenantPersonAttendance[]>();
  private loadDone = false;

  constructor(public db: DbService, private router: Router) {
    effect(() => {
      if (this.db.tenants() && this.db.tenantUsers() && !this.loadDone) {
        this.loadDone = true;
        this.load(false);
      }
    });
  }

  async load(forceRefresh = true): Promise<void> {
    this.loading = true;
    try {
      const [own, managed] = await Promise.all([
        this.db.loadAllPersonAttendancesAcrossTenants(forceRefresh),
        this.db.loadManagedEventsAcrossTenants(),
      ]);
      this.entries = mergeCalendarEntries(own, managed);
      this.byDay = groupByDay(this.entries);
    } finally {
      this.loading = false;
    }
  }

  get dayEntries(): CrossTenantPersonAttendance[] {
    return this.byDay.get(this.selectedDay) ?? [];
  }

  get selectedDayLabel(): string {
    return dayjs(this.selectedDay).locale(currentLanguage()).format(`dddd, ${dateFmt('dayMonth')}`);
  }

  title(att: CrossTenantPersonAttendance): string {
    return att.title || Utils.getReadableDate(att.date, att.attendanceType);
  }

  time(att: CrossTenantPersonAttendance): string {
    return eventTimeRange(att.attendance?.start_time ?? att.attendanceType?.start_time, att.attendance?.end_time ?? att.attendanceType?.end_time);
  }

  mark(att: CrossTenantPersonAttendance): CalendarMark {
    return calendarMark(att);
  }

  openMonth(): void {
    this.router.navigate(['/tabs/overview'], { queryParams: { view: 'calendar', from: 'dashboard' } });
  }
}
