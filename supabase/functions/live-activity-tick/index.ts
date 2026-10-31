// supabase/functions/live-activity-tick/index.ts
// Deploy: supabase functions deploy live-activity-tick
// Cron: every minute (see supabase/sql/live_activity.sql)
//
// Keeps the "laufender Ablaufplan" Live Activity (iOS) / live notification
// (Android) of every recipient in sync while the app is closed:
//   - starts it 15 min before the first item (iOS 17.2+ push-to-start, Android data push)
//   - updates it whenever the current item changes or the plan is edited
//   - ends it when the plan is over
// ORG plans (Termine marked as ORG-Plan and ad-hoc plans of the organisation)
// also go to the admins and Verantwortliche of every choir in the organisation.
// Ad-hoc plans have no Termin: attendance_id 0, plan key "org-<shared_plans.id>".
// Only pushes when the visible state changed (live_activity_sent).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAccessToken } from '../_shared/send-push.ts'
import {
  buildSchedule,
  liveStateAt,
  liveStateKey,
  withLiveColor,
  iosLiveState,
  LIVE_TAIL_MINUTES,
  LivePlanState,
} from '../_shared/live-plan-state.ts'
import { intlLocale, Lang, t, userLanguages } from '../_shared/i18n.ts'

const DEFAULT_TIMEZONE = 'Europe/Berlin';
const LOOKBACK_DAYS = 14;
const EXCUSED = 2;
const LEADER_ROLES = [1, 5]; // ADMIN, RESPONSIBLE
const NO_PLAN_ROLES = [3, 7, 99]; // VIEWER (Beobachter), APPLICANT, NONE

interface PlanJson {
  id?: string;
  label?: string;
  day?: number | null;
  time?: string;
  fields?: any[];
}

interface AttendanceRow {
  id: number;
  tenantId: number;
  date: string;
  plan: PlanJson | null;
  extra_plans: PlanJson[] | null;
  duration_days: number | null;
  share_plan: boolean | null;
  type_id: string | null;
  typeInfo: string | null;
  is_org_plan: boolean | null;
}

interface SharedPlanRow {
  id: string;
  plan_title: string | null;
  date: string | null;
  time: string | null;
  fields: any[] | null;
  org_id: number;
}

interface LivePlan {
  attendance: AttendanceRow;
  planKey: string;
  title: string;
  state: LivePlanState | null;
  /** Organisation whose leaders also get this plan (ORG plans). */
  orgId?: number | null;
  /** Ad-hoc ORG plan without a Termin: only the organisation's leaders get it. */
  orgOnly?: boolean;
}

interface SentRow {
  user_id: string;
  attendance_id: number;
  plan_key: string;
  state_key: string;
  phase: string;
}

interface TokenRow {
  user_id: string;
  kind: 'start' | 'update';
  attendance_id: number;
  plan_key: string;
  token: string;
  platform: string;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Same label rules as plan-days.ts planLabel (custom label, else day, else "Plan n"). */
function planLabel(att: AttendanceRow, plans: PlanJson[], index: number, timezone: string): string {
  const custom = plans[index]?.label?.trim();
  if (custom) return custom;
  const multiDay = (Number(att.duration_days) || 1) > 1;
  const day = plans[index]?.day ?? (index === 0 && multiDay ? 0 : undefined);
  if (day !== undefined && day !== null && multiDay) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(att.date.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')));
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
    const d = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + Number(day)));
    return `${WEEKDAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`;
  }
  return `Plan ${index + 1}`;
}

function livePlans(att: AttendanceRow, typeName: string, typeColor: string | undefined, timezone: string, now: number): LivePlan[] {
  if (!att.plan) return [];
  const plans = [att.plan, ...(att.extra_plans ?? []).filter(Boolean)];
  const name = att.typeInfo?.trim() || typeName || 'Termin';
  return plans.map((plan, index) => {
    const day = plan.day ?? 0;
    const schedule = plan.time && plan.fields?.length
      ? buildSchedule({ date: att.date, planTime: plan.time, dayOffset: Number(day) || 0, fields: plan.fields, timezone })
      : [];
    return {
      attendance: att,
      planKey: plan.id || 'main',
      title: plans.length > 1 ? `${name} · ${planLabel(att, plans, index, timezone)}` : name,
      state: withLiveColor(liveStateAt(schedule, now), typeColor),
    };
  });
}

/** Ad-hoc ORG plan (shared_plans with org_id); attendance is a stand-in with id 0. */
function sharedLivePlan(sp: SharedPlanRow, tenantId: number, timezone: string, now: number): LivePlan {
  const schedule = sp.date && sp.time && sp.fields?.length
    ? buildSchedule({ date: sp.date, planTime: sp.time, fields: sp.fields, timezone })
    : [];
  return {
    attendance: { id: 0, tenantId } as AttendanceRow,
    planKey: `org-${sp.id}`,
    title: sp.plan_title?.trim() || 'ORG-Plan',
    state: liveStateAt(schedule, now),
    orgId: sp.org_id,
    orgOnly: true,
  };
}

async function fcmSend(accessToken: string, message: unknown): Promise<{ ok: boolean; error?: string }> {
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID') || 'app-attendix';
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (response.ok) return { ok: true };
  const body = await response.json().catch(() => ({}));
  return { ok: false, error: body?.error?.details?.[0]?.errorCode ?? body?.error?.message ?? String(response.status) };
}

/** ActivityKit push through FCM (apns.live_activity_token). */
function iosMessage(
  fcmToken: string,
  liveActivityToken: string,
  event: 'start' | 'update' | 'end',
  plan: LivePlan,
  liveState: LivePlanState,
  lang: Lang,
): unknown {
  const state = iosLiveState(liveState);
  const nowSec = Math.floor(Date.now() / 1000);
  const aps: Record<string, unknown> = {
    timestamp: nowSec,
    event,
    'content-state': state,
  };
  if (state.phase === 'running') aps['stale-date'] = state.endsAt + 60;
  if (state.phase === 'before') aps['stale-date'] = state.planStart + 60;
  if (event === 'start') {
    aps['attributes-type'] = 'PlanActivityAttributes';
    aps['attributes'] = { attendanceId: plan.attendance.id, planKey: plan.planKey, title: plan.title };
    // Push-to-start requires an alert; it is shown as the Live Activity appearing.
    aps['alert'] = { title: plan.title, body: state.phase === 'before'
      ? t(lang, 'live.startsAt', { time: clock(state.planStart, lang) })
      : t(lang, 'live.now', { title: state.title }) };
  }
  if (event === 'end') aps['dismissal-date'] = state.planEnd + LIVE_TAIL_MINUTES * 60;
  return {
    token: fcmToken,
    apns: {
      live_activity_token: liveActivityToken,
      headers: { 'apns-priority': '10' },
      payload: { aps },
    },
  };
}

let timezoneForClock = DEFAULT_TIMEZONE;
function clock(epochSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { timeZone: timezoneForClock, hour: '2-digit', minute: '2-digit' }).format(new Date(epochSec * 1000));
}

function androidMessage(fcmToken: string, event: 'start' | 'update' | 'end', plan: LivePlan, state: LivePlanState | null): unknown {
  const data: Record<string, string> = {
    type: 'live_plan',
    event,
    attendanceId: String(plan.attendance.id),
    planKey: plan.planKey,
    title: plan.title,
  };
  if (state) data.state = JSON.stringify(state);
  return { token: fcmToken, data, android: { priority: 'high', ttl: '120s' } };
}

async function recipients(supabase: SupabaseClient, plan: LivePlan, orgTenants: Map<number, number[]>): Promise<string[]> {
  const att = plan.attendance;
  let allowed: string[] = [];
  let excusedUsers = new Set<string>();
  if (!plan.orgOnly) {
    const { data: users } = await supabase
      .from('tenantUsers')
      .select('userId, role')
      .eq('tenantId', att.tenantId);
    allowed = (users ?? []).filter((u: any) =>
      !NO_PLAN_ROLES.includes(u.role) && (LEADER_ROLES.includes(u.role) || att.share_plan),
    ).map((u: any) => u.userId as string);

    // Members who excused themselves don't get it.
    const { data: excused } = await supabase
      .from('person_attendances')
      .select('status, person:person_id(appId)')
      .eq('attendance_id', att.id)
      .eq('status', EXCUSED);
    excusedUsers = new Set<string>((excused ?? []).map((e: any) => e.person?.appId).filter(Boolean));
  }

  // ORG plans: leaders of every choir in the organisation, like the ORG-Pläne page.
  const tenantIds = plan.orgId ? orgTenants.get(plan.orgId) ?? [] : [];
  if (tenantIds.length) {
    const { data: leaders } = await supabase
      .from('tenantUsers')
      .select('userId')
      .in('tenantId', tenantIds)
      .in('role', LEADER_ROLES);
    allowed.push(...(leaders ?? []).map((u: any) => u.userId as string));
  }
  if (!allowed.length) return [];

  const { data: settings } = await supabase
    .from('notifications')
    .select('id, live_activity')
    .in('id', allowed);
  const optedOut = new Set<string>((settings ?? []).filter((s: any) => s.live_activity === false).map((s: any) => s.id));

  return [...new Set<string>(allowed)].filter(id => !excusedUsers.has(id) && !optedOut.has(id));
}

Deno.serve(async (req) => {
  if (!req.headers.get('Authorization') && req.method !== 'POST') {
    return new Response('Unauthorized', { status: 401 });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = Date.now();
  const stats = { plans: 0, sent: 0, failed: 0, ended: 0 };

  try {
    const { data: attendances, error } = await supabase
      .from('attendance')
      .select('id, tenantId, date, plan, extra_plans, duration_days, share_plan, type_id, typeInfo, is_org_plan')
      .gte('date', new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString())
      .lte('date', new Date(now + 2 * 86_400_000).toISOString())
      .not('plan', 'is', null);
    if (error) throw error;

    // Organisations: which choirs belong to which, for ORG plans.
    const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);
    const [{ data: orgLinks }, { data: sharedPlans }] = await Promise.all([
      supabase.from('tenant_group_tenants').select('tenant_group, tenant_id'),
      supabase.from('shared_plans').select('id, plan_title, date, time, fields, org_id')
        .not('org_id', 'is', null).gte('date', day(-1)).lte('date', day(1)),
    ]);
    const orgOfTenant = new Map<number, number>();
    const orgTenants = new Map<number, number[]>();
    for (const link of (orgLinks ?? []) as any[]) {
      orgOfTenant.set(link.tenant_id, link.tenant_group);
      orgTenants.set(link.tenant_group, [...(orgTenants.get(link.tenant_group) ?? []), link.tenant_id]);
    }

    const tenantIds = [...new Set([
      ...(attendances ?? []).map((a: AttendanceRow) => a.tenantId),
      ...[...orgTenants.values()].flat(),
    ])];
    const typeIds = [...new Set((attendances ?? []).map((a: AttendanceRow) => a.type_id).filter(Boolean))];
    const [{ data: tenants }, { data: types }, { data: sentRows }] = await Promise.all([
      supabase.from('tenants').select('id, timezone').in('id', tenantIds.length ? tenantIds : [-1]),
      supabase.from('attendance_types').select('id, name, color').in('id', typeIds.length ? typeIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('live_activity_sent').select('*'),
    ]);
    const tzOf = new Map<number, string>((tenants ?? []).map((t: any) => [t.id, t.timezone || DEFAULT_TIMEZONE]));
    const typeName = new Map<string, string>((types ?? []).map((t: any) => [t.id, t.name ?? '']));
    const typeColor = new Map<string, string>((types ?? []).map((t: any) => [t.id, t.color ?? '']));
    const sent = new Map<string, SentRow>((sentRows ?? []).map((r: SentRow) => [`${r.user_id}|${r.attendance_id}|${r.plan_key}`, r]));
    const touched = new Set<string>();

    const plans: LivePlan[] = [];
    for (const att of (attendances ?? []) as AttendanceRow[]) {
      const attPlans = livePlans(att, typeName.get(att.type_id ?? '') ?? '', typeColor.get(att.type_id ?? ''), tzOf.get(att.tenantId) ?? DEFAULT_TIMEZONE, now);
      // ORG plans are plan 1 only, like on the ORG-Pläne page.
      if (att.is_org_plan && attPlans[0]) attPlans[0].orgId = orgOfTenant.get(att.tenantId) ?? null;
      plans.push(...attPlans);
    }
    for (const sp of (sharedPlans ?? []) as SharedPlanRow[]) {
      const tenantId = orgTenants.get(sp.org_id)?.[0];
      if (tenantId === undefined) continue;
      plans.push(sharedLivePlan(sp, tenantId, tzOf.get(tenantId) ?? DEFAULT_TIMEZONE, now));
    }
    const live = plans.filter(p => p.state);
    stats.plans = live.length;

    let accessToken: string | null = null;
    const token = async () => accessToken ??= await getAccessToken();

    for (const plan of live) {
      const state = plan.state!;
      timezoneForClock = tzOf.get(plan.attendance.tenantId) ?? DEFAULT_TIMEZONE;
      const users = await recipients(supabase, plan, orgTenants);
      if (!users.length) continue;

      const [{ data: devices }, { data: laTokens }] = await Promise.all([
        supabase.from('device_tokens').select('user_id, token, platform').in('user_id', users),
        supabase.from('live_activity_tokens').select('*').in('user_id', users)
          .or(`kind.eq.start,and(attendance_id.eq.${plan.attendance.id},plan_key.eq.${plan.planKey})`),
      ]);
      const stateKey = liveStateKey(state);
      const langs = await userLanguages(supabase, users);

      for (const userId of users) {
        const key = `${userId}|${plan.attendance.id}|${plan.planKey}`;
        touched.add(key);
        const prev = sent.get(key);
        if (prev?.state_key === stateKey) continue;
        if (!prev && state.phase === 'ended') continue; // never start an already finished plan

        const device = (devices ?? []).find((d: any) => d.user_id === userId);
        if (!device) continue;
        const event: 'start' | 'update' | 'end' = state.phase === 'ended' ? 'end' : prev ? 'update' : 'start';
        let message: unknown = null;

        const tokens = (laTokens ?? []) as TokenRow[];
        if (device.platform === 'android') {
          // Only app builds with the native plugin register this; older ones would show an empty alert.
          if (tokens.some(t => t.user_id === userId && t.kind === 'start' && t.platform === 'android')) {
            message = androidMessage(device.token, event, plan, state);
          }
        } else if (device.platform === 'ios') {
          const updateToken = tokens.find(t => t.user_id === userId && t.kind === 'update');
          const startToken = tokens.find(t => t.user_id === userId && t.kind === 'start');
          if (updateToken) {
            // Already running (started by push or by the open app).
            message = iosMessage(device.token, updateToken.token, event === 'start' ? 'update' : event, plan, state, langs.get(userId) ?? 'de');
          } else if (!prev && startToken) {
            message = iosMessage(device.token, startToken.token, 'start', plan, state, langs.get(userId) ?? 'de');
          }
          // else: started, but the app hasn't reported the activity's token yet; try next minute.
        }
        if (!message) continue;

        const result = await fcmSend(await token(), message);
        if (!result.ok) {
          stats.failed++;
          console.error(`live-activity ${event} failed for ${key}: ${result.error}`);
          continue;
        }
        stats.sent++;
        await supabase.from('live_activity_sent').upsert({
          user_id: userId,
          attendance_id: plan.attendance.id,
          plan_key: plan.planKey,
          state_key: stateKey,
          phase: state.phase,
          sent_at: new Date().toISOString(),
        });
      }
    }

    // Plans whose live window is over (or that were deleted / no longer shared).
    for (const [key, row] of sent) {
      if (touched.has(key)) continue;
      stats.ended++;
      if (row.phase !== 'ended') {
        const { data: device } = await supabase.from('device_tokens').select('token, platform').eq('user_id', row.user_id).limit(1).maybeSingle();
        const fakePlan = { attendance: { id: row.attendance_id } as AttendanceRow, planKey: row.plan_key, title: '', state: null };
        const { data: capable } = await supabase.from('live_activity_tokens').select('id')
          .eq('user_id', row.user_id).eq('kind', 'start').eq('platform', 'android').limit(1).maybeSingle();
        if (device?.platform === 'android' && capable) {
          await fcmSend(await token(), androidMessage(device.token, 'end', fakePlan, null));
        } else if (device?.platform === 'ios') {
          const { data: updateToken } = await supabase.from('live_activity_tokens').select('token')
            .eq('user_id', row.user_id).eq('kind', 'update').eq('attendance_id', row.attendance_id).eq('plan_key', row.plan_key).maybeSingle();
          if (updateToken) {
            await fcmSend(await token(), {
              token: device.token,
              apns: {
                live_activity_token: updateToken.token,
                headers: { 'apns-priority': '10' },
                payload: { aps: { timestamp: Math.floor(now / 1000), event: 'end', 'dismissal-date': Math.floor(now / 1000) } },
              },
            });
          }
        }
      }
      await supabase.from('live_activity_sent').delete()
        .eq('user_id', row.user_id).eq('attendance_id', row.attendance_id).eq('plan_key', row.plan_key);
      await supabase.from('live_activity_tokens').delete()
        .eq('user_id', row.user_id).eq('kind', 'update').eq('attendance_id', row.attendance_id).eq('plan_key', row.plan_key);
    }

    return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('live-activity-tick failed', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
