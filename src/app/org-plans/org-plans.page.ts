import { currentLanguage, dateFmt } from '../i18n/languages';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController, ModalController } from '@ionic/angular/lazy';
import { isPlatform } from '@ionic/angular';
import { Browser } from '@capacitor/browser';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { DbService } from '../services/db.service';
import { Attendance, FieldSelection, Plan, SharedPlan } from '../utilities/interfaces';
import { PlanViewerComponent } from '../planning/plan-viewer/plan-viewer.component';
import { Utils } from '../utilities/Utils';
import { supabase } from '../services/base/supabase';
import { environment } from 'src/environments/environment';
import { translate } from '@jsverse/transloco';

interface OrgPlanRow {
  kind: 'attendance';
  attendance: Attendance & { tenantName?: string };
  plan: Plan;
}

interface AdHocPlanRow {
  kind: 'adhoc';
  sharedPlan: SharedPlan;
}

type PlanEntry = OrgPlanRow | AdHocPlanRow;

@Component({
  selector: 'app-org-plans',
  templateUrl: './org-plans.page.html',
  styleUrls: ['./org-plans.page.scss'],
  standalone: false,
})
export class OrgPlansPage implements OnInit {
  public db = inject(DbService);
  private router = inject(Router);
  private modalController = inject(ModalController);
  private actionSheetController = inject(ActionSheetController);
  private alertController = inject(AlertController);

  public plans: PlanEntry[] = [];
  public upcomingPlans: PlanEntry[] = [];
  public pastPlans: PlanEntry[] = [];
  public loading = true;
  public publicKey: string | null = null;
  public showOrgTab = false;
  public isTabRoute = false;
  public isIos = isPlatform('ios');
  public showHistory = false;

  async ngOnInit() {
    this.isTabRoute = this.router.url.startsWith('/tabs/org-plans');
    const org = this.db.organisation();
    if (!org) { this.loading = false; return; }
    this.publicKey = org.public_plan_key ?? null;
    this.showOrgTab = this.db.getShowOrgPlansTab();
    await this.loadPlans();
  }

  async handleRefresh(event: any) {
    await this.loadPlans();
    event.target.complete();
  }

  async loadPlans() {
    this.loading = true;
    const org = this.db.organisation();
    if (!org?.id) { this.loading = false; return; }

    try {
      const [attPlans, adhocPlans] = await Promise.all([
        this.db.orgSvc.getOrgPlans(org.id),
        this.loadAdHocPlans(org.id),
      ]);

      this.plans = [
        ...attPlans
          .filter(a => a.plan)
          .map(a => ({ kind: 'attendance' as const, attendance: a, plan: a.plan as Plan })),
        ...adhocPlans.map(s => ({ kind: 'adhoc' as const, sharedPlan: s })),
      ].sort((a, b) => {
        const dateA = a.kind === 'attendance' ? a.attendance.date : a.sharedPlan.date;
        const dateB = b.kind === 'attendance' ? b.attendance.date : b.sharedPlan.date;
        return dayjs(dateA).isBefore(dayjs(dateB)) ? -1 : 1;
      });

      const today = dayjs().startOf('day');
      this.upcomingPlans = this.plans.filter(e => {
        const d = e.kind === 'attendance' ? e.attendance.date : e.sharedPlan.date;
        return dayjs(d).isSame(today, 'day') || dayjs(d).isAfter(today);
      });
      this.pastPlans = this.plans.filter(e => {
        const d = e.kind === 'attendance' ? e.attendance.date : e.sharedPlan.date;
        return dayjs(d).isBefore(today);
      }).reverse();
    } finally {
      this.loading = false;
    }
  }

  private async loadAdHocPlans(orgId: number): Promise<SharedPlan[]> {
    const query = supabase.from('shared_plans').select('*') as any;
    const { data, error } = await query.eq('org_id', orgId).order('date', { ascending: true });
    if (error) { return []; }
    return data as unknown as SharedPlan[];
  }

  getPlanTitle(entry: PlanEntry): string {
    if (entry.kind === 'attendance') {
      return entry.plan.title || entry.attendance.typeInfo || translate('plans.plan');
    }
    return entry.sharedPlan.plan_title || translate('plans.plan');
  }

  getPlanDate(entry: PlanEntry): string {
    const d = entry.kind === 'attendance' ? entry.attendance.date : entry.sharedPlan.date;
    return d ? dayjs(d).locale(currentLanguage()).format(`dd, ${dateFmt()}`) : '';
  }

  getPlanTime(entry: PlanEntry): string {
    const t = entry.kind === 'attendance' ? entry.plan.time : entry.sharedPlan.time;
    return t ? dayjs(t).format('HH:mm') : '';
  }

  getPlanTenantLabel(entry: PlanEntry): string {
    if (entry.kind === 'attendance') { return entry.attendance.tenantName || ''; }
    return translate('plans.orgPlan');
  }

  getFieldCount(entry: PlanEntry): number {
    if (entry.kind === 'attendance') { return entry.plan.fields?.length ?? 0; }
    return entry.sharedPlan.fields?.length ?? 0;
  }

  async openPlan(entry: PlanEntry) {
    const date = entry.kind === 'attendance' ? entry.attendance.date : entry.sharedPlan.date;
    const isToday = dayjs(date).isSame(dayjs(), 'day');
    if (entry.kind === 'attendance') {
      const modal = await this.modalController.create({
        component: PlanViewerComponent,
        componentProps: {
          attendance: entry.attendance,
          plan: entry.plan,
          isPractice: false,
          defaultLive: isToday,
        },
      });
      await modal.present();
    } else {
      const plan: Plan = {
        time: entry.sharedPlan.time ?? '',
        end: entry.sharedPlan.end_time ?? '',
        fields: (entry.sharedPlan.fields as FieldSelection[]) ?? [],
        title: entry.sharedPlan.plan_title,
      };
      const modal = await this.modalController.create({
        component: PlanViewerComponent,
        componentProps: {
          attendance: { date: entry.sharedPlan.date },
          plan,
          isPractice: false,
          defaultLive: isToday,
        },
      });
      await modal.present();
    }
  }

  async toggleOrgTab() {
    this.showOrgTab = !this.showOrgTab;
    await this.db.setShowOrgPlansTab(this.showOrgTab);
  }

  async deleteAdHocPlan(entry: AdHocPlanRow) {
    const sheet = await this.actionSheetController.create({
      header: entry.sharedPlan.plan_title || translate('plans.plan'),
      buttons: [
        {
          text: translate('planning.deletePlan'),
          role: 'destructive',
          handler: async () => {
            const { error } = await supabase
              .from('shared_plans')
              .delete()
              .eq('id', entry.sharedPlan.id);
            if (error) {
              Utils.showToast(translate('plans.deleteFailed'), 'danger');
            } else {
              await this.loadPlans();
            }
          },
        },
        { text: translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async subscribeCalendar() {
    if (!this.publicKey) return;
    const lang = currentLanguage() !== 'de' ? `&lang=${currentLanguage()}` : '';
    const base = `${environment.apiUrl}/functions/v1/ical-org-plans?key=${this.publicKey}${lang}`;
    const sheet = await this.actionSheetController.create({
      header: translate('plans.subscribeCalendar'),
      buttons: [
        {
          text: translate('plans.simpleCalendar'),
          handler: () => this.showCalendarAlert(base),
        },
        {
          text: translate('plans.detailedCalendar'),
          handler: () => this.showCalendarAlert(`${base}&detailed=true`),
        },
        { text: translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async showCalendarAlert(link: string) {
    const alert = await this.alertController.create({
      header: translate('plans.subscribeCalendar'),
      message: translate('plans.calendarLinkMessage', { link }),
      buttons: [
        {
          text: translate('plans.copyLink'),
          handler: () => {
            navigator.clipboard.writeText(link);
            Utils.showToast(translate('plans.linkCopied'), 'success');
            return false;
          },
        },
        {
          text: translate('plans.openGuide'),
          handler: () => {
            Browser.open({ url: isPlatform('ios') ? 'https://support.apple.com/de-de/102301' : 'https://support.google.com/calendar/answer/37100?hl=de&co=GENIE.Platform%3DAndroid' });
          },
        },
        { text: translate('common.close'), role: 'cancel' },
      ],
    });
    await alert.present();
  }

  async managePublicLink() {
    const org = this.db.organisation();
    if (!org?.id) { return; }

    if (this.publicKey) {
      const url = `https://attendix.de/org-plan?key=${this.publicKey}`;
      const sheet = await this.actionSheetController.create({
        header: translate('plans.publicLink'),
        buttons: [
          {
            text: translate('plans.copyLink'),
            handler: async () => {
              await navigator.clipboard.writeText(url);
              Utils.showToast(translate('plans.linkCopied'), 'success');
            },
          },
          {
            text: translate('plans.revokeLink'),
            role: 'destructive',
            handler: async () => {
              await this.db.orgSvc.revokePublicPlanKey(org.id);
              this.publicKey = null;
              const org2 = this.db.organisation();
              if (org2) { (org2 as any).public_plan_key = null; }
              Utils.showToast(translate('plans.revokeLink'), 'success');
            },
          },
          { text: translate('common.cancel'), role: 'cancel' },
        ],
      });
      await sheet.present();
    } else {
      const key = await this.db.orgSvc.generatePublicPlanKey(org.id);
      this.publicKey = key;
      const org2 = this.db.organisation();
      if (org2) { (org2 as any).public_plan_key = key; }
      const url = `https://attendix.de/org-plan?key=${key}`;
      await navigator.clipboard.writeText(url);
      Utils.showToast(translate('plans.linkCreated'), 'success');
    }
  }
}
