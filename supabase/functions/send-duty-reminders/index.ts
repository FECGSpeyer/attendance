// supabase/functions/send-duty-reminders/index.ts
// Deploy: supabase functions deploy send-duty-reminders
// Cron: send-duty-reminders-job, every 15 minutes (see supabase/sql/duty_roster.sql)
//
// 1. Unconfirmed duties: persons assigned by the leadership who did not
//    confirm after the type's duty_confirm_reminder_days get one reminder.
// 2. Urgent stage: duty Termine that start within the type's
//    duty_urgent_hours and are still understaffed send one time-sensitive push
//    to all stand-ins who did not cancel and to the leadership.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  deliverDutyNotice, DutyAttendance, DutyPerson, DutyType, dutyTitle, dutyWhen, isCancelled, leaderPersonIds, occupies, requiredOf,
} from '../_shared/duty-delivery.ts'
import { t } from '../_shared/i18n.ts'

const DEFAULT_TIMEZONE = 'Europe/Berlin';
const TYPE_FIELDS = 'id, name, tenant_id, duty_mode, duty_required, duty_self_signup, duty_confirm_reminder_days, duty_notify_understaffed, duty_urgent_hours, start_time';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader && req.method !== 'POST') {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { data: types, error } = await admin
      .from('attendance_types')
      .select(TYPE_FIELDS)
      .eq('duty_mode', true);
    if (error) throw error;
    const dutyTypes = (types ?? []) as (DutyType & { tenant_id: number })[];
    if (!dutyTypes.length) return json({ success: true, reminders: 0, urgent: 0 });

    const reminders = await sendConfirmReminders(admin, dutyTypes);
    const urgent = await sendUrgent(admin, dutyTypes);
    console.log(`[send-duty-reminders] reminders=${reminders} urgent=${urgent}`);
    return json({ success: true, reminders, urgent });
  } catch (e) {
    console.error('[send-duty-reminders] fatal:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function sendConfirmReminders(admin: SupabaseClient, types: (DutyType & { tenant_id: number })[]): Promise<number> {
  const withReminder = types.filter((t) => t.duty_confirm_reminder_days != null && t.duty_confirm_reminder_days > 0);
  if (!withReminder.length) return 0;

  const { data, error } = await admin
    .from('person_attendances')
    .select('id, person_id, status, notes, duty_state, duty_assigned_at, duty_reminder_sent, attendance:attendance_id!inner(id, date, typeInfo, type_id, tenantId, start_time, duty_required, duty_alert_sent_at, duty_urgent_sent_at)')
    .eq('duty_state', 'requested')
    .eq('duty_reminder_sent', false)
    .in('attendance.type_id', withReminder.map((t) => t.id))
    .gte('attendance.date', new Date().toISOString())
    .range(0, 4999);
  if (error) throw error;

  let sent = 0;
  for (const row of (data ?? []) as (DutyPerson & { attendance: DutyAttendance })[]) {
    if (isCancelled(row) || !row.duty_assigned_at) continue;
    const type = withReminder.find((t) => t.id === row.attendance.type_id);
    if (!type) continue;
    const due = new Date(row.duty_assigned_at).getTime() + (type.duty_confirm_reminder_days ?? 0) * 24 * 3600 * 1000;
    if (due > Date.now()) continue;

    await deliverDutyNotice(admin, Number(row.attendance.tenantId), [row.person_id], {
      feedType: 'duty_reminder',
      text: (lang) => ({
        title: t(lang, 'duty.confirmTitle', { title: dutyTitle(row.attendance, type, lang) }),
        body: t(lang, 'duty.confirmBody', { when: dutyWhen(row.attendance, type, lang) }),
      }),
      attendanceId: row.attendance.id,
    });
    await admin.from('person_attendances').update({ duty_reminder_sent: true }).eq('id', row.id);
    sent++;
  }
  return sent;
}

async function sendUrgent(admin: SupabaseClient, types: (DutyType & { tenant_id: number })[]): Promise<number> {
  const withUrgent = types.filter((t) => t.duty_urgent_hours != null && t.duty_urgent_hours > 0);
  if (!withUrgent.length) return 0;

  const maxHours = Math.max(...withUrgent.map((t) => t.duty_urgent_hours ?? 0));
  const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const until = new Date(Date.now() + (maxHours + 24) * 3600 * 1000).toISOString();

  const { data, error } = await admin
    .from('attendance')
    .select('id, date, typeInfo, type_id, tenantId, start_time, duty_required, duty_alert_sent_at, duty_urgent_sent_at, persons:person_attendances(id, person_id, status, notes, duty_state)')
    .in('type_id', withUrgent.map((t) => t.id))
    .is('duty_urgent_sent_at', null)
    .gte('date', from)
    .lte('date', until);
  if (error) throw error;

  const tenantIds = Array.from(new Set((data ?? []).map((a: { tenantId: number }) => Number(a.tenantId))));
  const timezones = new Map<number, string>();
  if (tenantIds.length) {
    const { data: tenants } = await admin.from('tenants').select('id, timezone').in('id', tenantIds);
    for (const t of tenants ?? []) timezones.set(Number(t.id), t.timezone || DEFAULT_TIMEZONE);
  }

  let sent = 0;
  for (const att of (data ?? []) as (DutyAttendance & { persons: DutyPerson[] })[]) {
    const type = withUrgent.find((t) => t.id === att.type_id);
    if (!type) continue;
    const tz = timezones.get(Number(att.tenantId)) ?? DEFAULT_TIMEZONE;
    const minutesUntil = minutesUntilStart(att.date, att.start_time ?? type.start_time ?? '00:00', tz);
    if (minutesUntil <= 0 || minutesUntil > (type.duty_urgent_hours ?? 0) * 60) continue;

    const required = requiredOf(att, type);
    const occupied = att.persons.filter(occupies).length;
    if (occupied >= required) continue;

    const standIns = att.persons.filter((p) => !p.duty_state && !isCancelled(p)).map((p) => p.person_id);
    const leaders = await leaderPersonIds(admin, Number(att.tenantId));
    const missing = required - occupied;
    await deliverDutyNotice(admin, Number(att.tenantId), [...standIns, ...leaders], {
      feedType: 'duty_urgent',
      text: (lang) => ({
        title: t(lang, 'duty.urgentTitle', { title: dutyTitle(att, type, lang), when: dutyWhen(att, type, lang) }),
        body: occupied === 0 ? t(lang, 'duty.urgentNobody') : t(lang, 'duty.urgentMissing', { count: missing }),
      }),
      attendanceId: att.id,
      urgent: true,
    });
    await admin.from('attendance').update({ duty_urgent_sent_at: new Date().toISOString() }).eq('id', att.id);
    sent++;
  }
  return sent;
}

/** Minutes from now until the Termin starts, both taken in the tenant's timezone. */
function minutesUntilStart(dateIso: string, startTime: string, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = (d: Date) => {
    const p = fmt.formatToParts(d);
    const get = (t: string) => parseInt(p.find((x) => x.type === t)?.value || '0', 10);
    return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute') };
  };
  const now = parts(new Date());
  const day = parts(new Date(dateIso));
  const [h, min] = (startTime || '00:00').split(':').map(Number);
  const nowMs = Date.UTC(now.y, now.m - 1, now.d, now.h, now.min);
  const startMs = Date.UTC(day.y, day.m - 1, day.d, h || 0, min || 0);
  return Math.floor((startMs - nowMs) / 60000);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
