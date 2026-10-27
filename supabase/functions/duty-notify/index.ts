// supabase/functions/duty-notify/index.ts
// Deploy: supabase functions deploy duty-notify
//
// Dienstplan notifications, triggered from the app via DutyService.notify():
//
//   { tenantId, type: 'assigned', attendanceId, personAttendanceIds }
//       → the assigned persons ("🎧 Du bist eingeteilt"). Leadership only.
//   { tenantId, type: 'understaffed', attendanceId }
//       → after an assigned person cancelled and the duty is below the needed
//         number: all stand-ins of the Termin who did not cancel
//         ("Wer springt ein?"). Any member of the tenant.
//   { tenantId, type: 'filled', attendanceId }
//       → after somebody took the duty: if an understaffed/urgent notice went
//         out and the duty is full again, the stand-ins learn it is covered.
//
// The server re-checks every condition, so a client can't spam the group.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  deliverDutyNotice, dutyTitle, dutyWhen, isCancelled, leaderPersonIds, loadDutyAttendance, occupies, requiredOf,
} from '../_shared/duty-delivery.ts'
import { t } from '../_shared/i18n.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ROLE_ADMIN = 1;
const ROLE_RESPONSIBLE = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => null);
    const tenantId = Number(body?.tenantId);
    const attendanceId = Number(body?.attendanceId);
    const type = String(body?.type ?? '');
    if (!tenantId || !attendanceId) return json({ error: 'Missing tenantId or attendanceId' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: membership } = await admin
      .from('tenantUsers')
      .select('role')
      .eq('tenantId', tenantId)
      .eq('userId', callerId)
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: 'Forbidden' }, 403);
    const isLeader = [ROLE_ADMIN, ROLE_RESPONSIBLE].includes(Number(membership.role));

    const loaded = await loadDutyAttendance(admin, attendanceId);
    if (!loaded || Number(loaded.att.tenantId) !== tenantId) return json({ error: 'Duty not found' }, 404);
    const { att, type: dutyType, persons } = loaded;
    const required = requiredOf(att, dutyType);
    const occupied = persons.filter(occupies);
    const inFuture = new Date(att.date).getTime() > Date.now() - 24 * 3600 * 1000;

    const { data: callerPlayer } = await admin
      .from('player')
      .select('id, firstName')
      .eq('tenantId', tenantId)
      .eq('appId', callerId)
      .limit(1)
      .maybeSingle();

    switch (type) {
      case 'assigned': {
        if (!isLeader) return json({ error: 'Forbidden' }, 403);
        const paIds: string[] = Array.isArray(body?.personAttendanceIds) ? body.personAttendanceIds.map(String) : [];
        const assigned = persons.filter((p) => paIds.includes(p.id) && p.duty_state === 'requested');
        const result = { recipients: 0, delivered: 0 };
        // Each person gets the names of the others on the same duty.
        for (const pa of assigned) {
          const others = await firstNames(admin, occupied.filter((o) => o.person_id !== pa.person_id).map((o) => o.person_id));
          const r = await deliverDutyNotice(admin, tenantId, [pa.person_id], {
            feedType: 'duty',
            text: (lang) => ({
              title: t(lang, 'duty.assignedTitle', { title: dutyTitle(att, dutyType, lang) }),
              body: t(lang, others.length ? 'duty.assignedBodyWith' : 'duty.assignedBody', { when: dutyWhen(att, dutyType, lang), names: others.join(', ') }),
            }),
            attendanceId,
          }, callerId);
          result.recipients += r.recipients;
          result.delivered += r.delivered;
        }
        return json({ success: true, ...result });
      }

      case 'understaffed': {
        if (!dutyType.duty_notify_understaffed && dutyType.duty_notify_understaffed !== null) {
          return json({ success: true, skipped: 'disabled' });
        }
        if (!inFuture || occupied.length >= required) return json({ success: true, skipped: 'not understaffed' });
        const standIns = persons.filter((p) => !p.duty_state && !isCancelled(p)).map((p) => p.person_id);
        const name = callerPlayer?.firstName;
        const result = await deliverDutyNotice(admin, tenantId, standIns, {
          feedType: 'duty_understaffed',
          text: (lang) => ({
            title: t(lang, 'duty.understaffedTitle', {
              title: dutyTitle(att, dutyType, lang), day: dutyWhen(att, dutyType, lang).split(' · ')[0], count: occupied.length, required,
            }),
            body: name ? t(lang, 'duty.understaffedBody', { name }) : t(lang, 'duty.understaffedBodyAnon'),
          }),
          attendanceId,
        }, callerId);
        await admin.from('attendance').update({ duty_alert_sent_at: new Date().toISOString() }).eq('id', attendanceId);
        return json({ success: true, ...result });
      }

      case 'filled': {
        if (!att.duty_alert_sent_at && !att.duty_urgent_sent_at) return json({ success: true, skipped: 'no alert' });
        if (occupied.length < required) return json({ success: true, skipped: 'still open' });
        const standIns = persons.filter((p) => !p.duty_state && !isCancelled(p)).map((p) => p.person_id);
        // After an urgent notice the leadership was informed too.
        const leaders = att.duty_urgent_sent_at ? await leaderPersonIds(admin, tenantId) : [];
        const name = callerPlayer?.firstName;
        const result = await deliverDutyNotice(admin, tenantId, [...standIns, ...leaders], {
          feedType: 'duty_filled',
          text: (lang) => ({
            title: t(lang, 'duty.filledTitle', { title: dutyTitle(att, dutyType, lang), day: dutyWhen(att, dutyType, lang).split(' · ')[0] }),
            body: (name ? t(lang, 'duty.filledBy', { name }) + ' ' : '') + t(lang, 'duty.filledBody'),
          }),
          attendanceId,
        }, callerId);
        await admin.from('attendance').update({ duty_alert_sent_at: null }).eq('id', attendanceId);
        return json({ success: true, ...result });
      }

      default:
        return json({ error: 'Unknown type' }, 400);
    }
  } catch (e) {
    console.error('[duty-notify] fatal:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function firstNames(admin: ReturnType<typeof createClient>, personIds: number[]): Promise<string[]> {
  if (!personIds.length) return [];
  const { data } = await admin.from('player').select('firstName').in('id', personIds);
  return (data ?? []).map((p: { firstName: string }) => p.firstName).filter(Boolean);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
