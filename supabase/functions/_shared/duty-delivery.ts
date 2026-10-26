// supabase/functions/_shared/duty-delivery.ts
// Shared delivery for Dienstplan notifications (duty-notify, send-duty-reminders).
//
// Push (preferred) / Telegram (fallback, or both with push_and_telegram) for
// users with notifications enabled, the tenant enabled and the "duties" toggle
// not switched off (null counts as on). Every app user among the recipients
// also gets a notification-center entry. Leaders land on the Termin, everybody
// else on "Meine Termine" (Telegram link; the app routes pushes by role).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushToUser } from './send-push.ts'
import { logNotification } from './log-notification.ts'

export const STATUS_NEUTRAL = 0;
export const STATUS_PRESENT = 1;
export const STATUS_EXCUSED = 2;
export const STATUS_ABSENT = 4;
export const STATUS_LATE_EXCUSED = 5;
const CANCELLED = [STATUS_EXCUSED, STATUS_ABSENT, STATUS_LATE_EXCUSED];
const LEADER_ROLES = [1, 5];
const APP_URL = 'https://attendix.de';
const PUSH_CONCURRENCY = 8;

export interface DutyPerson {
  id: string;
  person_id: number;
  status: number;
  notes: string | null;
  duty_state: string | null;
  duty_assigned_at?: string | null;
  duty_reminder_sent?: boolean;
}

export interface DutyAttendance {
  id: number;
  date: string;
  typeInfo: string | null;
  type_id: string;
  tenantId: number;
  start_time: string | null;
  duty_required: number | null;
  duty_alert_sent_at: string | null;
  duty_urgent_sent_at: string | null;
}

export interface DutyType {
  id: string;
  name: string;
  duty_mode: boolean;
  duty_required: number | null;
  duty_self_signup: boolean | null;
  duty_confirm_reminder_days: number | null;
  duty_notify_understaffed: boolean | null;
  duty_urgent_hours: number | null;
  start_time: string | null;
}

export interface DutyNotice {
  feedType: string;
  title: string;
  body: string;
  attendanceId: number;
  urgent?: boolean;
}

interface NotificationConfig {
  id: string;
  enabled: boolean;
  push_enabled: boolean | null;
  telegram_chat_id: string | null;
  push_and_telegram: boolean | null;
  duties: boolean | null;
  enabled_tenants: (number | string)[] | null;
}

export function isCancelled(pa: Pick<DutyPerson, 'status'>): boolean {
  return CANCELLED.includes(pa.status);
}

export function occupies(pa: Pick<DutyPerson, 'status' | 'duty_state'>): boolean {
  return !!pa.duty_state && !isCancelled(pa);
}

export function requiredOf(att: Pick<DutyAttendance, 'duty_required'>, type: Pick<DutyType, 'duty_required'>): number {
  return Math.max(1, att.duty_required ?? type.duty_required ?? 1);
}

export function dutyTitle(att: Pick<DutyAttendance, 'typeInfo'>, type: Pick<DutyType, 'name'>): string {
  return (att.typeInfo ?? '').trim() || type.name || 'Dienst';
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** "So, 8.11." plus " · 17:00" when a start time is known. */
export function dutyWhen(att: Pick<DutyAttendance, 'date' | 'start_time'>, type?: Pick<DutyType, 'start_time'>): string {
  const d = new Date(att.date);
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const day = `${WEEKDAYS[local.getDay()]}, ${local.getDate()}.${local.getMonth() + 1}.`;
  const time = (att.start_time ?? type?.start_time ?? '').slice(0, 5);
  return time ? `${day} · ${time}` : day;
}

export async function loadDutyAttendance(admin: SupabaseClient, attendanceId: number): Promise<{ att: DutyAttendance; type: DutyType; persons: DutyPerson[] } | null> {
  const { data: att, error } = await admin
    .from('attendance')
    .select('id, date, typeInfo, type_id, tenantId, start_time, duty_required, duty_alert_sent_at, duty_urgent_sent_at')
    .eq('id', attendanceId)
    .maybeSingle();
  if (error) throw error;
  if (!att) return null;

  const { data: type, error: typeErr } = await admin
    .from('attendance_types')
    .select('id, name, duty_mode, duty_required, duty_self_signup, duty_confirm_reminder_days, duty_notify_understaffed, duty_urgent_hours, start_time')
    .eq('id', att.type_id)
    .maybeSingle();
  if (typeErr) throw typeErr;
  if (!type?.duty_mode) return null;

  const { data: persons, error: paErr } = await admin
    .from('person_attendances')
    .select('id, person_id, status, notes, duty_state, duty_assigned_at, duty_reminder_sent')
    .eq('attendance_id', attendanceId)
    .range(0, 4999);
  if (paErr) throw paErr;

  return { att: att as DutyAttendance, type: type as DutyType, persons: (persons ?? []) as DutyPerson[] };
}

export async function leaderPersonIds(admin: SupabaseClient, tenantId: number): Promise<number[]> {
  const { data: leaders } = await admin
    .from('tenantUsers')
    .select('userId')
    .eq('tenantId', tenantId)
    .in('role', LEADER_ROLES)
    .range(0, 999);
  const appIds = (leaders ?? []).map((l: { userId: string }) => l.userId).filter(Boolean);
  if (!appIds.length) return [];
  const { data: players } = await admin
    .from('player')
    .select('id')
    .eq('tenantId', tenantId)
    .in('appId', appIds)
    .is('left', null);
  return (players ?? []).map((p: { id: number }) => Number(p.id));
}

/**
 * Delivers a notice to persons (player ids) of a tenant. `extraUserIds` are
 * app users without a player row in the tenant (e.g. conductors) that should
 * get it too. The caller (if given) is never notified about their own action.
 */
export async function deliverDutyNotice(
  admin: SupabaseClient,
  tenantId: number,
  personIds: number[],
  notice: DutyNotice,
  callerId?: string | null,
  extraUserIds: string[] = [],
): Promise<{ recipients: number; delivered: number }> {
  const ids = Array.from(new Set(personIds.filter((id) => Number.isFinite(id) && id > 0)));
  let appIds: string[] = [];
  if (ids.length) {
    const { data: players, error } = await admin
      .from('player')
      .select('id, appId')
      .eq('tenantId', tenantId)
      .in('id', ids)
      .not('appId', 'is', null)
      .is('left', null);
    if (error) throw error;
    appIds = (players ?? []).map((p: { appId: string | null }) => p.appId).filter((id): id is string => !!id);
  }
  appIds = Array.from(new Set([...appIds, ...extraUserIds])).filter((id) => id !== callerId);
  if (appIds.length === 0) return { recipients: 0, delivered: 0 };

  const { data: roles } = await admin
    .from('tenantUsers')
    .select('userId, role')
    .eq('tenantId', tenantId)
    .in('userId', appIds);
  const leaders = new Set((roles ?? []).filter((r: { role: number }) => LEADER_ROLES.includes(r.role)).map((r: { userId: string }) => r.userId));

  const configs = new Map<string, NotificationConfig>();
  for (let i = 0; i < appIds.length; i += 150) {
    const { data, error: nErr } = await admin
      .from('notifications')
      .select('id, enabled, push_enabled, telegram_chat_id, push_and_telegram, duties, enabled_tenants')
      .eq('enabled', true)
      .in('id', appIds.slice(i, i + 150));
    if (nErr) {
      console.error('[duty] notifications query failed:', nErr);
      continue;
    }
    for (const c of (data ?? []) as NotificationConfig[]) {
      // Urgent notices ignore the opt-out: the duty would otherwise stay empty.
      if (c.duties === false && !notice.urgent) continue;
      const tenantOk = !c.enabled_tenants || c.enabled_tenants.length === 0 ||
        c.enabled_tenants.map(Number).includes(tenantId);
      if (tenantOk) configs.set(c.id, c);
    }
  }

  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  let delivered = 0;

  await runPool(appIds, PUSH_CONCURRENCY, async (userId) => {
    const route = leaders.has(userId) ? `/tabs/attendance/${notice.attendanceId}` : '/tabs/signout';
    // No `route`: the app opens duty notices by role (leaders the Termin,
    // members "Meine Termine" with the duty or the open duties).
    const data = {
      type: notice.feedType,
      attendanceId: String(notice.attendanceId),
      tenantId: String(tenantId),
    };
    const config = configs.get(userId);
    const channels: string[] = [];

    if (config) {
      const parallelMode = !!config.push_and_telegram && !!config.push_enabled && !!config.telegram_chat_id;
      let pushSent = 0;
      if (config.push_enabled) {
        try {
          pushSent = await sendPushToUser(admin, config.id, { title: notice.title, body: notice.body, data, urgent: notice.urgent });
        } catch (e) {
          console.error(`[duty] push error user=${userId}:`, e);
        }
      }
      if (pushSent > 0) channels.push('push');

      if (config.telegram_chat_id && telegramToken && (parallelMode || pushSent === 0)) {
        const ok = await telegramMessage(telegramToken, config.telegram_chat_id, `${notice.title}\n\n${notice.body}\n\nIn der App öffnen: ${APP_URL}${route}`);
        if (ok) channels.push('telegram');
      }
    }

    if (channels.length) delivered++;
    await logNotification(admin, {
      userId,
      tenantId,
      type: notice.feedType,
      title: notice.title,
      body: notice.body,
      channels,
      data,
    });
  });

  return { recipients: appIds.length, delivered };
}

async function telegramMessage(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    });
    if (!res.ok) console.error(`[duty] telegram ${res.status}: ${await res.text()}`);
    return res.ok;
  } catch (e) {
    console.error('[duty] telegram error:', e);
    return false;
  }
}

async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        console.error('[duty] worker error:', e);
      }
    }
  });
  await Promise.all(workers);
}
