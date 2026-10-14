// supabase/functions/team-notify/index.ts
// Deploy: supabase functions deploy team-notify
//
// Teamorganisation notifications, triggered by leadership (ADMIN/RESPONSIBLE)
// from the app via DbService.notifyTeam():
//
//   { tenantId, type: 'task_assigned', taskId }
//       → the responsible person of the task ("📋 Neue Aufgabe")
//   { tenantId, type: 'protocol_published', attendanceId, pdfUrl? }
//       → persons present/late at the attendance + responsible persons of its
//         tasks ("📝 Protokoll freigegeben"); with pdfUrl the PDF is sent as a
//         Telegram document to recipients with a Telegram chat.
//   { tenantId, type: 'proposal_decided', agendaItemId }
//       → the person who suggested the topic (accepted / rejected + note)
//
// Delivery mirrors send-task-reminders: Push (preferred) / Telegram (fallback,
// or both with push_and_telegram) for users with notifications enabled, the
// tenant enabled and the "tasks" toggle not switched off. Every app user among
// the recipients also gets a notification-center entry. The caller is never
// notified about their own action.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushToUser } from '../_shared/send-push.ts'
import { logNotification } from '../_shared/log-notification.ts'

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
// AttendanceStatus (src/app/utilities/constants.ts): Present = 1, Late = 3
const STATUS_PRESENT = 1;
const STATUS_LATE = 3;
const APP_URL = 'https://attendix.de';
const PUSH_CONCURRENCY = 8;

interface Player {
  id: number;
  appId: string | null;
}

interface NotificationConfig {
  id: string;
  enabled: boolean;
  push_enabled: boolean | null;
  telegram_chat_id: string | null;
  push_and_telegram: boolean | null;
  tasks: boolean | null;
  enabled_tenants: (number | string)[] | null;
}

interface Notice {
  /** Feed type: task | protocol | proposal */
  feedType: string;
  title: string;
  body: string;
  telegramText: string;
  data: Record<string, string>;
  /** Public PDF URL, sent as Telegram document instead of a text message. */
  documentUrl?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: 'Invalid token' }, 401);
    }
    const callerId = userData.user.id;

    const body = await req.json().catch(() => null);
    const tenantId = Number(body?.tenantId);
    const type = String(body?.type ?? '');
    if (!tenantId) {
      return json({ error: 'Missing tenantId' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Only leadership of the tenant may trigger team notifications.
    const { data: membership, error: memberErr } = await admin
      .from('tenantUsers')
      .select('role')
      .eq('tenantId', tenantId)
      .eq('userId', callerId)
      .in('role', [ROLE_ADMIN, ROLE_RESPONSIBLE])
      .limit(1)
      .maybeSingle();
    if (memberErr) {
      console.error('[team-notify] membership lookup failed:', memberErr);
      return json({ error: 'Membership lookup failed' }, 500);
    }
    if (!membership) {
      return json({ error: 'Forbidden' }, 403);
    }

    let prepared: { personIds: number[]; notice: Notice } | Response;
    switch (type) {
      case 'task_assigned':
        prepared = await prepareTaskAssigned(admin, tenantId, String(body?.taskId ?? ''));
        break;
      case 'protocol_published':
        prepared = await prepareProtocolPublished(admin, tenantId, Number(body?.attendanceId), body?.pdfUrl);
        break;
      case 'proposal_decided':
        prepared = await prepareProposalDecided(admin, tenantId, String(body?.agendaItemId ?? ''));
        break;
      default:
        return json({ error: 'Unknown type' }, 400);
    }
    if (prepared instanceof Response) return prepared;

    const result = await deliver(admin, tenantId, callerId, prepared.personIds, prepared.notice);
    console.log(`[team-notify] type=${type} tenant=${tenantId} recipients=${result.recipients} delivered=${result.delivered}`);
    return json({ success: true, ...result });
  } catch (e) {
    console.error('[team-notify] fatal:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ── Payload types ──────────────────────────────────────────────────────────

async function prepareTaskAssigned(admin: SupabaseClient, tenantId: number, taskId: string) {
  if (!taskId) return json({ error: 'Missing taskId' }, 400);
  const { data: task, error } = await admin
    .from('tasks')
    .select('id, title, due_date, tenant_id, responsible_person_id, status')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw error;
  if (!task || Number(task.tenant_id) !== tenantId) return json({ error: 'Task not found' }, 404);
  if (!task.responsible_person_id || task.status === 'completed') {
    return { personIds: [], notice: emptyNotice() };
  }

  const due = task.due_date ? `Fällig am ${formatDate(task.due_date)}` : '';
  const route = `/tabs/settings/tasks/${task.id}`;
  return {
    personIds: [Number(task.responsible_person_id)],
    notice: {
      feedType: 'task',
      title: '📋 Neue Aufgabe',
      body: due ? `${task.title} · ${due}` : task.title,
      telegramText: `📋 Neue Aufgabe\n\n${task.title}${due ? `\n📅 ${due}` : ''}\n\nIn der App öffnen: ${APP_URL}${route}`,
      data: { type: 'task', taskId: String(task.id), tenantId: String(tenantId), route },
    },
  };
}

async function prepareProtocolPublished(admin: SupabaseClient, tenantId: number, attendanceId: number, pdfUrl: unknown) {
  if (!attendanceId) return json({ error: 'Missing attendanceId' }, 400);
  const { data: attendance, error } = await admin
    .from('attendance')
    .select('id, date, typeInfo, type_id, tenantId')
    .eq('id', attendanceId)
    .maybeSingle();
  if (error) throw error;
  if (!attendance || Number(attendance.tenantId) !== tenantId) return json({ error: 'Attendance not found' }, 404);

  const { data: protocol } = await admin
    .from('protocols')
    .select('id, status')
    .eq('attendance_id', attendanceId)
    .limit(1)
    .maybeSingle();
  if (!protocol || protocol.status !== 'published') return json({ error: 'Protocol not published' }, 409);

  let typeName = (attendance.typeInfo as string | null)?.trim() || '';
  if (!typeName && attendance.type_id) {
    const { data: attType } = await admin.from('attendance_types').select('name').eq('id', attendance.type_id).maybeSingle();
    typeName = attType?.name ?? '';
  }
  typeName = typeName || 'Termin';

  const [{ data: present, error: paErr }, { data: tasks, error: taskErr }] = await Promise.all([
    admin.from('person_attendances')
      .select('person_id')
      .eq('attendance_id', attendanceId)
      .in('status', [STATUS_PRESENT, STATUS_LATE])
      .range(0, 4999),
    admin.from('tasks')
      .select('responsible_person_id')
      .eq('attendance_id', attendanceId)
      .not('responsible_person_id', 'is', null)
      .range(0, 999),
  ]);
  if (paErr) throw paErr;
  if (taskErr) throw taskErr;

  const personIds = [
    ...(present ?? []).map((p: { person_id: number }) => Number(p.person_id)),
    ...(tasks ?? []).map((t: { responsible_person_id: number }) => Number(t.responsible_person_id)),
  ];

  const date = formatDate(attendance.date);
  const title = `📝 Protokoll freigegeben: ${typeName} vom ${date}`;
  const route = `/tabs/attendance/${attendanceId}/protocol`;
  const documentUrl = isAllowedPdfUrl(pdfUrl) ? pdfUrl : undefined;
  if (pdfUrl && !documentUrl) console.warn('[team-notify] ignoring pdfUrl outside of Supabase storage');

  return {
    personIds,
    notice: {
      feedType: 'protocol',
      title,
      body: 'Tippe hier, um das Protokoll zu lesen.',
      telegramText: `${title}\n\nIn der App öffnen: ${APP_URL}${route}`,
      data: { type: 'protocol', attendanceId: String(attendanceId), tenantId: String(tenantId), route },
      documentUrl,
    },
  };
}

async function prepareProposalDecided(admin: SupabaseClient, tenantId: number, agendaItemId: string) {
  if (!agendaItemId) return json({ error: 'Missing agendaItemId' }, 400);
  const { data: item, error } = await admin
    .from('agenda_items')
    .select('id, title, tenant_id, proposed_by, proposal_status, decision_note')
    .eq('id', agendaItemId)
    .maybeSingle();
  if (error) throw error;
  if (!item || Number(item.tenant_id) !== tenantId) return json({ error: 'Agenda item not found' }, 404);
  if (!item.proposed_by || !['accepted', 'rejected'].includes(item.proposal_status)) {
    return { personIds: [], notice: emptyNotice() };
  }

  const accepted = item.proposal_status === 'accepted';
  const title = accepted ? '✅ Dein Vorschlag wurde angenommen' : '💬 Dein Vorschlag wurde abgelehnt';
  const note = (item.decision_note as string | null)?.trim() ?? '';
  const body = note ? `${item.title} – ${note}` : item.title;
  const route = '/tabs/settings/team-organization?tab=topics';
  return {
    personIds: [Number(item.proposed_by)],
    notice: {
      feedType: 'proposal',
      title,
      body,
      telegramText: `${title}\n\n💡 ${item.title}${note ? `\n\nBegründung: ${note}` : ''}\n\nIn der App öffnen: ${APP_URL}${route}`,
      data: { type: 'proposal', agendaItemId: String(item.id), tenantId: String(tenantId), route },
    },
  };
}

// ── Delivery ────────────────────────────────────────────────────────────────

async function deliver(
  admin: SupabaseClient,
  tenantId: number,
  callerId: string,
  personIds: number[],
  notice: Notice,
): Promise<{ recipients: number; delivered: number }> {
  const ids = Array.from(new Set(personIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (ids.length === 0) return { recipients: 0, delivered: 0 };

  const { data: players, error } = await admin
    .from('player')
    .select('id, appId')
    .eq('tenantId', tenantId)
    .in('id', ids)
    .not('appId', 'is', null)
    .is('left', null);
  if (error) throw error;

  const appIds = Array.from(new Set(
    ((players ?? []) as Player[]).map((p) => p.appId).filter((id): id is string => !!id && id !== callerId),
  ));
  if (appIds.length === 0) return { recipients: 0, delivered: 0 };

  const configs = new Map<string, NotificationConfig>();
  for (let i = 0; i < appIds.length; i += 150) {
    const { data, error: nErr } = await admin
      .from('notifications')
      .select('id, enabled, push_enabled, telegram_chat_id, push_and_telegram, tasks, enabled_tenants')
      .eq('enabled', true)
      .in('id', appIds.slice(i, i + 150));
    if (nErr) {
      console.error('[team-notify] notifications query failed:', nErr);
      continue;
    }
    for (const c of (data ?? []) as NotificationConfig[]) {
      if (c.tasks === false) continue; // opt-out; null counts as on
      const tenantOk = !c.enabled_tenants || c.enabled_tenants.length === 0 ||
        c.enabled_tenants.map(Number).includes(tenantId);
      if (tenantOk) configs.set(c.id, c);
    }
  }

  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  let delivered = 0;

  await runPool(appIds, PUSH_CONCURRENCY, async (userId) => {
    const config = configs.get(userId);
    const channels: string[] = [];

    if (config) {
      const parallelMode = !!config.push_and_telegram && !!config.push_enabled && !!config.telegram_chat_id;
      let pushSent = 0;
      if (config.push_enabled) {
        try {
          pushSent = await sendPushToUser(admin, config.id, { title: notice.title, body: notice.body, data: notice.data });
        } catch (e) {
          console.error(`[team-notify] push error user=${userId}:`, e);
        }
      }
      if (pushSent > 0) channels.push('push');

      if (config.telegram_chat_id && telegramToken) {
        // The PDF always goes to Telegram users; otherwise Telegram is the fallback (or parallel).
        const sendDocument = !!notice.documentUrl;
        if (sendDocument || parallelMode || pushSent === 0) {
          const ok = sendDocument
            ? await telegramDocument(telegramToken, config.telegram_chat_id, notice)
            : await telegramMessage(telegramToken, config.telegram_chat_id, notice.telegramText);
          if (ok) channels.push('telegram');
        }
      }
    }

    if (channels.length) delivered++;
    // Notification center: every app user among the recipients gets an entry.
    await logNotification(admin, {
      userId,
      tenantId,
      type: notice.feedType,
      title: notice.title,
      body: notice.body,
      channels,
      data: notice.data,
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
    if (!res.ok) console.error(`[team-notify] telegram ${res.status}: ${await res.text()}`);
    return res.ok;
  } catch (e) {
    console.error('[team-notify] telegram error:', e);
    return false;
  }
}

/** Sends the protocol PDF; falls back to a text message if Telegram rejects the document. */
async function telegramDocument(token: string, chatId: string, notice: Notice): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, document: notice.documentUrl, caption: notice.telegramText.slice(0, 1000) }),
    });
    if (res.ok) return true;
    console.error(`[team-notify] telegram document ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error('[team-notify] telegram document error:', e);
  }
  return telegramMessage(token, chatId, notice.telegramText);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function emptyNotice(): Notice {
  return { feedType: 'task', title: '', body: '', telegramText: '', data: {} };
}

/** Only PDFs from this project's Supabase storage may be forwarded to Telegram. */
function isAllowedPdfUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 2000) return false;
  try {
    const parsed = new URL(url);
    const base = new URL(SUPABASE_URL);
    return parsed.protocol === 'https:' && parsed.host === base.host && parsed.pathname.startsWith('/storage/v1/object/');
  } catch {
    return false;
  }
}

function formatDate(value: string): string {
  // Plain dates (YYYY-MM-DD) are formatted as-is to avoid a timezone shift.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
  });
}

async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        console.error('[team-notify] worker error:', e);
      }
    }
  });
  await Promise.all(workers);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
