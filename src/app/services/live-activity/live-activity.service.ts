import { Injectable, effect, inject } from '@angular/core';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { supabase } from '../base/supabase';
import { DbService } from '../db.service';
import { Role } from '../../utilities/constants';
import { Attendance } from '../../utilities/interfaces';
import { allPlans } from '../../utilities/plan-days';
import { liveSchedule, liveStateAt, liveStateKey, liveTitle, livePlanKey, LivePlanState } from '../../utilities/live-plan';
import { LiveActivity, LiveActivityTarget } from './live-activity.plugin';

/** How often the open app re-checks running plans (the widget counts down on its own). */
const SYNC_INTERVAL_MS = 20_000;
/** Multi-day Termine can have started up to this many days ago. */
const LOOKBACK_DAYS = 14;

interface LivePlanCandidate extends LiveActivityTarget {
  title: string;
  state: LivePlanState;
}

/**
 * Shows the currently running Ablaufplan as iOS Live Activity / Android live
 * notification. While the app is open it starts and updates them itself;
 * with the app closed the `live-activity-tick` Edge Function does it via push,
 * using the tokens registered here.
 *
 * Safe on app builds without the native plugin (OTA): everything is skipped.
 */
@Injectable({ providedIn: 'root' })
export class LiveActivityService {
  private db = inject(DbService);
  private modalController = inject(ModalController);

  private supported = false;
  private started = false;
  private enabled = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: PluginListenerHandle[] = [];
  /** Last state pushed per plan, to skip no-op updates. */
  private lastKeys = new Map<string, string>();
  private loadedTenantId: number | null = null;

  constructor() {
    effect(() => {
      const tenant = this.db.tenant();
      const tenantUser = this.db.tenantUser();
      if (tenant && tenantUser && tenant.id !== this.loadedTenantId) {
        this.loadedTenantId = tenant.id;
        this.init();
      }
    });
  }

  /** True when this app build has the native plugin (i.e. not an old binary running new web code). */
  static hasNativePlugin(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LiveActivity');
  }

  private async init(): Promise<void> {
    if (!LiveActivityService.hasNativePlugin()) { return; }
    try {
      const { available } = await LiveActivity.isAvailable();
      this.supported = available;
    } catch {
      this.supported = false;
    }
    if (!this.supported) { return; }

    this.enabled = await this.loadEnabled();
    if (!this.started) {
      this.started = true;
      await this.registerTokenListeners();
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) { this.startLoop(); } else { this.stopLoop(); }
      });
    }
    this.startLoop();
  }

  private async loadEnabled(): Promise<boolean> {
    const userId = this.db.tenantUser()?.userId;
    if (!userId) { return true; }
    const { data } = await supabase.from('notifications').select('live_activity').eq('id', userId).maybeSingle();
    return (data as any)?.live_activity !== false;
  }

  /** Called from the notification settings toggle. */
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    if (!this.supported) { return; }
    if (!enabled) {
      this.lastKeys.clear();
      await LiveActivity.endAll().catch(() => undefined);
    } else {
      await this.sync();
    }
  }

  private startLoop(): void {
    this.stopLoop();
    this.sync();
    this.timer = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
  }

  private stopLoop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Starts, updates and ends Live Activities to match the plans running right now. */
  async sync(): Promise<void> {
    if (!this.supported || !this.db.tenant()) { return; }
    try {
      const candidates = this.enabled ? await this.runningPlans() : [];
      const { activities } = await LiveActivity.list();
      const key = (t: LiveActivityTarget) => `${t.attendanceId}:${t.planKey}`;
      const wanted = new Set(candidates.map(key));

      for (const c of candidates) {
        const k = key(c);
        const stateKey = liveStateKey(c.state);
        const running = activities.some(a => key(a) === k);
        if (running && this.lastKeys.get(k) === stateKey) { continue; }
        if (c.state.phase === 'ended') {
          if (running) { await LiveActivity.end({ attendanceId: c.attendanceId, planKey: c.planKey, state: c.state }); }
        } else if (running) {
          await LiveActivity.update({ attendanceId: c.attendanceId, planKey: c.planKey, state: c.state });
        } else {
          await LiveActivity.start(c);
        }
        this.lastKeys.set(k, stateKey);
      }
      // Plans that are over, deleted or no longer visible to this user.
      for (const a of activities) {
        if (!wanted.has(key(a))) {
          await LiveActivity.end({ attendanceId: a.attendanceId, planKey: a.planKey, immediate: true });
          this.lastKeys.delete(key(a));
        }
      }
    } catch (e) {
      console.warn('Live Activity sync failed', e);
    }
  }

  /** Plans of the current tenant whose live window contains now, limited like the home "current plan" card. */
  private async runningPlans(): Promise<LivePlanCandidate[]> {
    const tenant = this.db.tenant();
    const role = this.db.tenantUser()?.role;
    const isLeader = [Role.ADMIN, Role.RESPONSIBLE].includes(role);
    const timezone = tenant.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
    const { data } = await supabase
      .from('attendance')
      .select('id, date, plan, extra_plans, duration_days, share_plan, type_id, typeInfo')
      .eq('tenantId', tenant.id)
      .gte('date', dayjs().subtract(LOOKBACK_DAYS, 'day').startOf('day').toISOString())
      .lte('date', dayjs().add(1, 'day').endOf('day').toISOString())
      .not('plan', 'is', null);

    const now = Date.now();
    const result: LivePlanCandidate[] = [];
    for (const att of (data ?? []) as Partial<Attendance>[]) {
      if (!isLeader && !att.share_plan) { continue; }
      const plans = allPlans(att);
      const typeName = this.db.attendanceTypes().find(t => t.id === att.type_id)?.name ?? '';
      plans.forEach((plan, index) => {
        const state = liveStateAt(liveSchedule(att, index, timezone, plans), now);
        if (!state) { return; }
        result.push({
          attendanceId: att.id,
          planKey: livePlanKey(plan),
          title: liveTitle(att, typeName, index, plans),
          state,
        });
      });
    }
    return result;
  }

  private async registerTokenListeners(): Promise<void> {
    this.listeners.push(await LiveActivity.addListener('pushToStartToken', e => this.saveToken('start', e.token)));
    this.listeners.push(await LiveActivity.addListener('activityToken', e => this.saveToken('update', e.token, e)));
    try {
      const tokens = await LiveActivity.getTokens();
      if (tokens.pushToStartToken) { await this.saveToken('start', tokens.pushToStartToken); }
      for (const t of tokens.activityTokens ?? []) { await this.saveToken('update', t.token, t); }
    } catch { /* plugin without tokens (Android) */ }
  }

  private async saveToken(kind: 'start' | 'update', token: string, target?: LiveActivityTarget): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !token) { return; }
    const { error } = await supabase.from('live_activity_tokens').upsert({
      user_id: user.id,
      kind,
      attendance_id: target?.attendanceId ?? 0,
      plan_key: target?.planKey ?? '',
      token,
      platform: Capacitor.getPlatform(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,kind,attendance_id,plan_key' });
    if (error) { console.warn('Live Activity token not saved', error); }
  }

  /** Handles attendix://live-plan?attendance=…&plan=… from a tap on the Live Activity. Returns true when handled. */
  async openFromUrl(url: URL): Promise<boolean> {
    if (url.protocol !== 'attendix:' || url.hostname !== 'live-plan') { return false; }
    const attendanceId = Number(url.searchParams.get('attendance'));
    if (!attendanceId) { return true; }
    await this.db.checkToken();
    const attendance = await this.db.getAttendanceById(attendanceId).catch(() => null);
    if (!attendance?.plan) { return true; }
    const { PlanViewerComponent } = await import('../../planning/plan-viewer/plan-viewer.component');
    const attType = this.db.attendanceTypes().find(t => t.id === attendance.type_id);
    const isPractice = attType?.name?.toLowerCase().includes('probe') || attType?.name?.toLowerCase().includes('übung');
    const modal = await this.modalController.create({
      component: PlanViewerComponent,
      componentProps: { attendance, plan: attendance.plan, isPractice, songs: [], defaultLive: true },
    });
    await modal.present();
    return true;
  }
}
