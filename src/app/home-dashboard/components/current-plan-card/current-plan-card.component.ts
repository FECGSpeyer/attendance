import { Component, effect } from '@angular/core';
import { ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { PlanViewerComponent } from '../../../planning/plan-viewer/plan-viewer.component';
import { DbService } from '../../../services/db.service';
import { Attendance, Plan } from '../../../utilities/interfaces';
import { Role } from '../../../utilities/constants';

@Component({
  selector: 'app-current-plan-card',
  templateUrl: './current-plan-card.component.html',
  styleUrls: ['./current-plan-card.component.scss'],
  standalone: false,
})
export class CurrentPlanCardComponent {
  public loading = true;
  public attendance: Attendance | null = null;
  public plan: Plan | null = null;
  public isToday = false;

  private loadDone = false;

  constructor(public db: DbService, private modalController: ModalController) {
    effect(() => {
      if (this.db.tenant() && !this.loadDone) {
        this.loadDone = true;
        this.load();
      }
    });
  }

  async load(): Promise<void> {
    this.loadDone = false;
    this.loading = true;
    try {
      const upcoming = await this.db.getUpcomingAttendances();
      const role = this.db.tenantUser()?.role;
      const isAdmin = [Role.ADMIN, Role.RESPONSIBLE].includes(role);

      const next = upcoming.find(a =>
        (a.plan?.fields?.length ?? 0) > 0 &&
        (isAdmin || a.share_plan)
      ) ?? null;

      this.attendance = next;
      this.plan = next?.plan ?? null;
      this.isToday = next ? dayjs(next.date).isSame(dayjs(), 'day') : false;
    } finally {
      this.loading = false;
    }
  }

  async openPlan(): Promise<void> {
    if (!this.attendance || !this.plan) { return; }
    const attType = this.db.attendanceTypes().find(t => t.id === this.attendance!.type_id);
    const isPractice = attType?.name?.toLowerCase().includes('probe') ||
      attType?.name?.toLowerCase().includes('übung') ||
      this.attendance.type === 'uebung';

    const modal = await this.modalController.create({
      component: PlanViewerComponent,
      componentProps: {
        attendance: this.attendance,
        plan: this.plan,
        isPractice,
        songs: [],
      },
    });
    await modal.present();
  }

  get dateLabel(): string {
    if (this.isToday) { return 'Heute'; }
    return dayjs(this.attendance?.date).locale('de').format('dddd, DD.MM.YYYY');
  }
}
