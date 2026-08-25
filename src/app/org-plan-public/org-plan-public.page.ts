import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController } from '@ionic/angular/lazy';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { FieldSelection, SharedPlan } from '../utilities/interfaces';
import { getSupabase } from '../services/base/supabase';
import { Utils } from '../utilities/Utils';

interface OrgPlanEntry {
  kind: 'attendance';
  id: number;
  date: string;
  tenantName: string;
  title: string;
  time: string;
  end: string;
  fields: FieldSelection[];
  liveMode: boolean;
  activeFieldIndex: number;
  liveInterval: any;
}

interface AdHocEntry {
  kind: 'adhoc';
  id: string;
  date: string;
  title: string;
  time: string;
  end: string;
  fields: FieldSelection[];
  liveMode: boolean;
  activeFieldIndex: number;
  liveInterval: any;
}

type PlanEntry = OrgPlanEntry | AdHocEntry;

@Component({
  selector: 'app-org-plan-public',
  templateUrl: './org-plan-public.page.html',
  styleUrls: ['./org-plan-public.page.scss'],
  standalone: false,
})
export class OrgPlanPublicPage implements OnInit, OnDestroy {
  public loading = true;
  public notFound = false;
  public orgName = '';
  public plans: PlanEntry[] = [];
  public upcomingPlans: PlanEntry[] = [];
  public pastPlans: PlanEntry[] = [];
  public showHistory = false;
  private channels: RealtimeChannel[] = [];

  constructor(private route: ActivatedRoute, private actionSheetController: ActionSheetController) {}

  async ngOnInit() {
    const key = this.route.snapshot.queryParamMap.get('key');
    if (!key) { this.notFound = true; this.loading = false; return; }

    const { data: org } = await getSupabase()
      .from('tenant_groups')
      .select('id, name')
      .eq('public_plan_key', key)
      .single();

    if (!org) { this.notFound = true; this.loading = false; return; }

    this.orgName = org.name;

    const { data: tgts } = await getSupabase()
      .from('tenant_group_tenants')
      .select('tenant_id, tenant:tenant_id(longName)')
      .eq('tenant_group', org.id);

    const tenantIds = (tgts ?? []).map((t: any) => t.tenant_id);
    const nameById: Record<number, string> = {};
    for (const t of (tgts ?? []) as any[]) {
      nameById[t.tenant_id] = t.tenant?.longName ?? '';
    }

    const [attRows, adhocRows] = await Promise.all([
      tenantIds.length
        ? getSupabase()
            .from('attendance')
            .select('id, date, plan, typeInfo, tenantId')
            .in('tenantId', tenantIds)
            .eq('is_org_plan', true)
            .not('plan', 'is', null)
            .order('date', { ascending: true })
        : Promise.resolve({ data: [] }),
      getSupabase()
        .from('shared_plans')
        .select('*')
        .eq('org_id', org.id)
        .order('date', { ascending: true }),
    ]);

    const attEntries: OrgPlanEntry[] = ((attRows.data ?? []) as any[]).map(row => {
      const plan = row.plan as any;
      return {
        kind: 'attendance',
        id: row.id,
        date: row.date,
        tenantName: nameById[row.tenantId] ?? '',
        title: plan.title || row.typeInfo || 'Plan',
        time: plan.time || '',
        end: plan.end || '',
        fields: plan.fields || [],
        liveMode: false,
        activeFieldIndex: -1,
        liveInterval: null,
      };
    });

    const adhocEntries: AdHocEntry[] = ((adhocRows.data ?? []) as SharedPlan[]).map(row => ({
      kind: 'adhoc',
      id: row.id,
      date: row.date ?? '',
      title: row.plan_title || 'Plan',
      time: row.time ?? '',
      end: row.end_time ?? '',
      fields: (row.fields as unknown as FieldSelection[]) ?? [],
      liveMode: false,
      activeFieldIndex: -1,
      liveInterval: null,
    }));

    this.plans = [...attEntries, ...adhocEntries].sort((a, b) =>
      dayjs(a.date).isBefore(dayjs(b.date)) ? -1 : 1
    );

    const today = dayjs().startOf('day');
    this.upcomingPlans = this.plans.filter(e => !dayjs(e.date).isBefore(today));
    this.pastPlans = this.plans.filter(e => dayjs(e.date).isBefore(today)).reverse();

    this.loading = false;

    for (const entry of this.plans) {
      if (this.isLiveNow(entry)) { this.toggleLive(entry); }
      if (!dayjs(entry.date).isBefore(dayjs().startOf('day'))) {
        this.subscribeRealtime(entry);
      }
    }
  }

  ngOnDestroy() {
    for (const entry of this.plans) { this.stopLive(entry); }
    for (const ch of this.channels) { ch.unsubscribe(); }
  }

  private subscribeRealtime(entry: PlanEntry) {
    if (entry.kind === 'attendance') {
      const ch = getSupabase()
        .channel(`org-att-${entry.id}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'attendance', filter: `id=eq.${entry.id}` },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const plan = payload.new?.plan;
            if (plan) {
              entry.time = plan.time || entry.time;
              entry.end = plan.end || entry.end;
              entry.fields = plan.fields || entry.fields;
              entry.title = plan.title || entry.title;
              if (entry.liveMode) { this.updateActiveIndex(entry); }
            }
          })
        .subscribe();
      this.channels.push(ch);
    } else {
      const ch = getSupabase()
        .channel(`org-adhoc-${entry.id}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'shared_plans', filter: `id=eq.${entry.id}` },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const d = payload.new;
            if (d) {
              entry.title = d.plan_title || entry.title;
              entry.time = d.time || entry.time;
              entry.end = d.end_time || entry.end;
              entry.fields = (d.fields as FieldSelection[]) || entry.fields;
              if (entry.liveMode) { this.updateActiveIndex(entry); }
            }
          })
        .subscribe();
      this.channels.push(ch);
    }
  }

  getDateFormatted(entry: PlanEntry): string {
    return entry.date ? dayjs(entry.date).locale('de').format('dddd, DD.MM.YYYY') : entry.title;
  }

  getStartTime(entry: PlanEntry): string {
    if (!entry.time) { return ''; }
    const t = dayjs(entry.time).isValid()
      ? dayjs(entry.time)
      : dayjs().hour(Number(entry.time.substring(0, 2))).minute(Number(entry.time.substring(3, 5)));
    return t.format('HH:mm');
  }

  getEndTime(entry: PlanEntry): string {
    if (!entry.end) { return ''; }
    const t = dayjs(entry.end).isValid()
      ? dayjs(entry.end)
      : dayjs().hour(Number(entry.end.substring(0, 2))).minute(Number(entry.end.substring(3, 5)));
    return t.format('HH:mm');
  }

  calculateTime(entry: PlanEntry, field: FieldSelection, index: number): string {
    let mins = 0;
    for (let i = 0; i < index; i++) { mins += Number(entry.fields[i].time) || 0; }
    const t = dayjs(entry.time).isValid()
      ? dayjs(entry.time)
      : dayjs().hour(Number(entry.time.substring(0, 2))).minute(Number(entry.time.substring(3, 5)));
    const result = t.add(mins, 'minute').format('HH:mm');
    return field.conductor ? `${result} | ${field.conductor}` : result;
  }

  isLiveNow(entry: PlanEntry): boolean {
    if (!entry.date || !entry.time || !entry.fields.length) { return false; }
    const now = dayjs();
    if (!now.isSame(dayjs(entry.date), 'day')) { return false; }
    const startBase = dayjs(entry.time).isValid()
      ? dayjs(entry.time)
      : dayjs().hour(Number(entry.time.substring(0, 2))).minute(Number(entry.time.substring(3, 5)));
    const start = dayjs(entry.date).hour(startBase.hour()).minute(startBase.minute()).second(0);
    const total = entry.fields.reduce((s, f) => s + (Number(f.time) || 0), 0);
    return now.isAfter(start.subtract(5, 'minute')) && now.isBefore(start.add(total + 15, 'minute'));
  }

  toggleLive(entry: PlanEntry) {
    entry.liveMode = !entry.liveMode;
    if (entry.liveMode) {
      this.updateActiveIndex(entry);
      entry.liveInterval = setInterval(() => this.updateActiveIndex(entry), 30000);
    } else {
      this.stopLive(entry);
    }
  }

  private stopLive(entry: PlanEntry) {
    if (entry.liveInterval) { clearInterval(entry.liveInterval); entry.liveInterval = null; }
    entry.activeFieldIndex = -1;
  }

  updateActiveIndex(entry: PlanEntry) {
    if (!entry.fields.length || !entry.time || !entry.date) { entry.activeFieldIndex = -1; return; }
    const now = dayjs();
    const startBase = dayjs(entry.time).isValid()
      ? dayjs(entry.time)
      : dayjs().hour(Number(entry.time.substring(0, 2))).minute(Number(entry.time.substring(3, 5)));
    let t = dayjs(entry.date).hour(startBase.hour()).minute(startBase.minute()).second(0);
    for (let i = 0; i < entry.fields.length; i++) {
      t = t.add(Number(entry.fields[i].time) || 0, 'minute');
      if (now.isBefore(t)) { entry.activeFieldIndex = i; return; }
    }
    entry.activeFieldIndex = entry.fields.length - 1;
  }

  async exportPlan(entry: PlanEntry) {
    const sheet = await this.actionSheetController.create({
      header: 'Exportieren',
      buttons: [
        { text: 'PDF (A4)',    handler: () => void Utils.createPlanExport({ time: entry.time, end: entry.end, fields: entry.fields }, entry.title) },
        { text: 'PDF (2x A5)', handler: () => void Utils.createPlanExport({ time: entry.time, end: entry.end, fields: entry.fields, sideBySide: true }, entry.title) },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  trackByPlan = (_: number, e: PlanEntry) => `${e.kind}-${e.id}`;
  trackByField = (_: number, f: FieldSelection) => f.id;
}
