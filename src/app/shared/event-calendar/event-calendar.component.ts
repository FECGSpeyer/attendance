import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { TranslocoModule } from '@jsverse/transloco';
import dayjs from 'dayjs';
import { currentLanguage, dateFmt } from '../../i18n/languages';
import { CrossTenantPersonAttendance } from '../../utilities/interfaces';
import { CalendarDay, CalendarMark, calendarMark, dayKey, groupByDay, monthGrid, startOfWeek, weekDays, weekdayLabels } from '../../utilities/calendar';

/** Dots drawn per day before "+n". */
const MAX_DOTS = 3;

interface CalendarDot {
  color: string;
  mark: CalendarMark;
}

export interface CalendarTenant {
  id: number;
  name: string;
  color: string;
}

/**
 * Month or week grid of Termine across instances: dot colour = instance,
 * dot style = own status (see `calendarMark`). The host lists the selected day.
 */
@Component({
  selector: 'app-event-calendar',
  standalone: true,
  imports: [CommonModule, IonicModule, TranslocoModule],
  templateUrl: './event-calendar.component.html',
  styleUrls: ['./event-calendar.component.scss'],
})
export class EventCalendarComponent implements OnChanges {
  @Input() entries: CrossTenantPersonAttendance[] = [];
  @Input() mode: 'month' | 'week' = 'month';
  /** Selected day, YYYY-MM-DD. */
  @Input() selected = dayKey(dayjs());
  /** Instances switched off in the legend. */
  @Input() hiddenTenants: number[] = [];
  @Input() showLegend = true;

  @Output() selectedChange = new EventEmitter<string>();
  @Output() hiddenTenantsChange = new EventEmitter<number[]>();

  public anchor = dayjs();
  public weeks: CalendarDay[][] = [];
  public tenants: CalendarTenant[] = [];
  public readonly weekdays = weekdayLabels();
  private byDay = new Map<string, CrossTenantPersonAttendance[]>();
  /** Once the user paged, new data must not jump back to the selected day. */
  private anchorTouched = false;

  ngOnChanges(): void {
    if (!this.anchorTouched) {
      this.anchor = dayjs(this.selected);
    }
    this.rebuild();
  }

  private rebuild(): void {
    const tenants = new Map<number, CalendarTenant>();
    for (const e of this.entries) {
      if (!tenants.has(e.tenantId)) {
        tenants.set(e.tenantId, { id: e.tenantId, name: e.tenantName, color: e.tenantColor });
      }
    }
    this.tenants = [...tenants.values()];
    const visible = this.entries.filter(e => !this.hiddenTenants.includes(e.tenantId));
    this.byDay = groupByDay(visible);
    this.weeks = this.mode === 'month' ? monthGrid(this.anchor) : [weekDays(this.anchor)];
  }

  get title(): string {
    const lang = currentLanguage();
    if (this.mode === 'month') {
      return this.anchor.locale(lang).format('MMMM YYYY');
    }
    const start = startOfWeek(this.anchor);
    return `${start.format(dateFmt('dayMonth'))} – ${start.add(6, 'day').format(dateFmt('dayMonth'))}`;
  }

  get hasEventOnly(): boolean {
    return this.entries.some(e => e.eventOnly);
  }

  get showsToday(): boolean {
    return this.weeks.some(w => w.some(d => d.isToday && d.inMonth));
  }

  dots(key: string): CalendarDot[] {
    return (this.byDay.get(key) ?? []).slice(0, MAX_DOTS).map(e => ({ color: e.tenantColor, mark: calendarMark(e) }));
  }

  more(key: string): number {
    return Math.max((this.byDay.get(key)?.length ?? 0) - MAX_DOTS, 0);
  }

  count(key: string): number {
    return this.byDay.get(key)?.length ?? 0;
  }

  move(step: number): void {
    this.anchorTouched = true;
    this.anchor = this.anchor.add(step, this.mode === 'month' ? 'month' : 'week');
    this.rebuild();
  }

  goToday(): void {
    this.anchorTouched = true;
    this.anchor = dayjs();
    this.rebuild();
    this.select(dayKey(dayjs()));
  }

  select(key: string): void {
    this.selected = key;
    this.selectedChange.emit(key);
  }

  isHidden(id: number): boolean {
    return this.hiddenTenants.includes(id);
  }

  toggleTenant(id: number): void {
    this.hiddenTenants = this.isHidden(id) ? this.hiddenTenants.filter(t => t !== id) : [...this.hiddenTenants, id];
    this.hiddenTenantsChange.emit(this.hiddenTenants);
    this.rebuild();
  }

  dayAria(day: CalendarDay): string {
    return dayjs(day.key).locale(currentLanguage()).format(`dddd, ${dateFmt()}`);
  }
}
