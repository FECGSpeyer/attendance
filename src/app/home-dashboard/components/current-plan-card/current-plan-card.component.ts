import { Component, OnDestroy, effect, ChangeDetectorRef } from '@angular/core';
import { ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { PlanViewerComponent } from '../../../planning/plan-viewer/plan-viewer.component';
import { DbService } from '../../../services/db.service';
import { Attendance, Plan } from '../../../utilities/interfaces';
import { Role } from '../../../utilities/constants';
import { allPlans, planDate, todayPlanIndex } from '../../../utilities/plan-days';
import { tileDay, tileMonth } from '../shared/dashboard-date';

import { fieldNumbers, isGroupHead } from '../../../utilities/plan-groups';
import { Utils } from '../../../utilities/Utils';
import { translate } from '@jsverse/transloco';
import { currentLanguage, dateFmt } from '../../../i18n/languages';
@Component({
  selector: 'app-current-plan-card',
  templateUrl: './current-plan-card.component.html',
  styleUrls: ['./current-plan-card.component.scss'],
  standalone: false,
})
export class CurrentPlanCardComponent implements OnDestroy {
  public loading = true;
  public attendance: Attendance | null = null;
  public plan: Plan | null = null;
  public isToday = false;
  private loadDone = false;
  private liveInterval: any;
  /** Date of the shown plan; differs from the Termin date for later days of a multi-day Termin. */
  private planDay: dayjs.Dayjs | null = null;
  private multiPlan = false;

  constructor(public db: DbService, private modalController: ModalController, private cdr: ChangeDetectorRef) {
    effect(() => {
      if (this.db.tenant() && !this.loadDone) {
        this.loadDone = true;
        this.load();
      }
    });
  }

  ngOnDestroy() {
    if (this.liveInterval) { clearInterval(this.liveInterval); }
  }

  async load(): Promise<void> {
    this.loadDone = false;
    this.loading = true;
    try {
      const upcoming = await this.db.getUpcomingAttendances(undefined, true);
      const role = this.db.tenantUser()?.role;
      const isAdmin = [Role.ADMIN, Role.RESPONSIBLE].includes(role);

      const next = upcoming.find(a =>
        allPlans(a).some(p => (p?.fields?.length ?? 0) > 0) &&
        (isAdmin || a.share_plan)
      ) ?? null;

      this.attendance = next;
      // Termine with several plans (e.g. one per day) show today's plan.
      const planIndex = todayPlanIndex(next);
      this.multiPlan = allPlans(next).length > 1;
      this.plan = allPlans(next)[planIndex] ?? next?.plan ?? null;
      this.planDay = next ? planDate(next, planIndex) : null;
      this.isToday = this.planDay ? this.planDay.isSame(dayjs(), 'day') : false;
      if (this.isToday) {
        if (this.liveInterval) { clearInterval(this.liveInterval); }
        this.liveInterval = setInterval(() => this.cdr.markForCheck(), 1000);
      }
    } finally {
      this.loading = false;
    }
  }

  async openPlan(): Promise<void> {
    if (!this.attendance || !this.plan) { return; }
    const attType = this.db.attendanceTypes().find(t => t.id === this.attendance!.type_id);
    const isPractice = Utils.isPracticeTypeName(attType?.name) ||
      this.attendance.type === 'uebung';

    const modal = await this.modalController.create({
      component: PlanViewerComponent,
      componentProps: {
        attendance: this.attendance,
        plan: this.attendance.plan,
        isPractice,
        songs: [],
      },
    });
    await modal.present();
  }

  formatTime(value: string): string {
    if (!value) { return ''; }
    return dayjs(value).isValid() && value.length > 5 ? dayjs(value).format('HH:mm') : value;
  }

  fieldStartTimes(): string[] {
    if (!this.plan?.fields?.length || !this.plan.time) { return []; }
    const startStr = this.plan.time;
    let current = startStr.length > 5 ? dayjs(startStr) : dayjs().hour(Number(startStr.substring(0, 2))).minute(Number(startStr.substring(3, 5))).second(0);
    return this.plan.fields.map(field => {
      const label = current.format('HH:mm');
      current = current.add(parseInt(field.time, 10) || 0, 'minutes');
      return label;
    });
  }

  readonly isGroupHead = isGroupHead;

  /** "1", "2", "2.1" … so Unterpunkte read as part of their block. */
  get rowNumbers(): string[] {
    return fieldNumbers(this.plan?.fields ?? []);
  }

  /** Positions without block heads (a head only groups its Unterpunkte). */
  get positionCount(): number {
    return (this.plan?.fields ?? []).filter(f => !isGroupHead(f)).length;
  }

  get isLive(): boolean {
    if (!this.isToday || !this.attendance) { return false; }
    const startStr = this.multiPlan ? this.plan?.time : (this.attendance.start_time ?? this.plan?.time);
    const endStr = this.multiPlan ? this.plan?.end : (this.attendance.end_time ?? this.plan?.end);
    if (!startStr || !endStr) { return false; }
    const toHHmm = (v: string) => v.length > 5 ? dayjs(v).format('HH:mm') : v;
    const base = this.planDay ?? dayjs(this.attendance.date);
    const [sh, sm] = toHHmm(startStr).split(':').map(Number);
    const [eh, em] = toHHmm(endStr).split(':').map(Number);
    const start = base.hour(sh).minute(sm).second(0);
    const end = base.hour(eh).minute(em).second(0);
    const now = dayjs();
    return now.isAfter(start) && now.isBefore(end);
  }

  get typeName(): string {
    if (!this.attendance) { return ''; }
    const attType = this.db.attendanceTypes().find(t => t.id === this.attendance!.type_id);
    return attType?.name ?? this.attendance.typeInfo ?? this.attendance.type ?? '';
  }

  tileDay = tileDay;
  tileMonth = tileMonth;

  get planDayValue(): dayjs.Dayjs {
    return this.planDay ?? dayjs(this.attendance?.date);
  }

  get dateLabel(): string {
    if (this.isToday) { return translate('teamOrg.todayCap'); }
    return (this.planDay ?? dayjs(this.attendance?.date)).locale(currentLanguage()).format(`dddd, ${dateFmt()}`);
  }

  get activeFieldIndex(): number {
    if (!this.isLive || !this.plan?.fields?.length || !this.plan.time) { return -1; }
    const startStr = this.plan.time;
    let current = startStr.length > 5
      ? dayjs(startStr)
      : (this.planDay ?? dayjs(this.attendance!.date)).hour(Number(startStr.substring(0, 2))).minute(Number(startStr.substring(3, 5))).second(0);
    const now = dayjs();
    for (let i = 0; i < this.plan.fields.length; i++) {
      // A Programmblock head takes no time; its Unterpunkte become active instead.
      if (isGroupHead(this.plan.fields[i])) { continue; }
      current = current.add(parseInt(this.plan.fields[i].time, 10) || 0, 'minutes');
      if (now.isBefore(current)) { return i; }
    }
    return -1;
  }

  getActiveCountdown(): string {
    const idx = this.activeFieldIndex;
    if (idx < 0 || !this.plan?.fields || !this.plan.time || !this.attendance?.date) { return ''; }
    const startStr = this.plan.time;
    let t = startStr.length > 5
      ? dayjs(startStr)
      : (this.planDay ?? dayjs(this.attendance.date)).hour(Number(startStr.substring(0, 2))).minute(Number(startStr.substring(3, 5))).second(0);
    for (let i = 0; i <= idx; i++) {
      t = t.add(parseInt(this.plan.fields[i].time, 10) || 0, 'minutes');
    }
    const remaining = Math.max(0, t.diff(dayjs(), 'second'));
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
