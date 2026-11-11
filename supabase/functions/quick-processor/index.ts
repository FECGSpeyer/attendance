import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/send-push.ts'
import { logNotification } from '../_shared/log-notification.ts'
import { formatDate, Lang, normalizeLang, t } from '../_shared/i18n.ts'

interface NotificationConfig {
  id: string;
  enabled: boolean;
  telegram_chat_id: string | null;
  signins: boolean;
  signouts: boolean;
  enabled_tenants: number[] | null;
  push_enabled: boolean;
  push_and_telegram?: boolean | null;
  language?: string | null;
}

// New push format (test): only for the user ids in PUSH_V2_USERS
// (comma-separated). Everybody else gets exactly the old texts.
const PUSH_V2_USERS = new Set(
  (Deno.env.get('PUSH_V2_USERS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
);

/** Today in Europe/Berlin as YYYY-MM-DD. */
function berlinToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

/** "Heute" / "Morgen" / "Gestern" / "So 6.12."; days = Termin minus today. */
function relativeDay(lang: Lang, date: string): { label: string; days: number } {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { label: formatDate(lang, date), days: 99 };
  const day = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const t0 = berlinToday().split('-').map(Number);
  const days = Math.round((day - Date.UTC(t0[0], t0[1] - 1, t0[2])) / 86400000);
  if (days === 0) return { label: t(lang, 'qp2.today'), days };
  if (days === 1) return { label: t(lang, 'qp2.tomorrow'), days };
  if (days === -1) return { label: t(lang, 'qp2.yesterday'), days };
  const weekday = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(day)).replace('.', '');
  return { label: `${weekday} ${+m[3]}.${+m[2]}.`, days };
}

Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405
    });
  }
  try {
    const { attId, reason, type, notes, isParents, isSelf, playerId, tenantId: pauseTenantId, pauseUntil } = await req.json();

    // --- Player self-pause notification path ---
    if (type === 'playerPaused' && playerId && pauseTenantId) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      console.log(`[quick-processor] playerPaused playerId=${playerId} tenantId=${pauseTenantId}`);

      const { data: playerData } = await supabase.from('player').select('firstName, lastName').eq('id', playerId).single();
      const { data: tenantDataRow } = await supabase.from('tenants').select('longName').eq('id', pauseTenantId).single();
      const { data: tenantUsers } = await supabase.from('tenantUsers').select('userId').or('role.eq.5,role.eq.1').eq('tenantId', pauseTenantId).range(0, 4999);

      if (!playerData || !tenantDataRow || !tenantUsers?.length) {
        return new Response(JSON.stringify({ message: 'No recipients or player not found' }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
        });
      }

      const { data: notiData } = await supabase.from('notifications').select('*').or(tenantUsers.map((e: any) => `id.eq.${e.userId}`).join(','));

      const name = `${playerData.firstName} ${playerData.lastName}`;
      const tenantName = tenantDataRow.longName;
      const pauseTexts = (lang: Lang) => {
        const until = pauseUntil ? t(lang, 'qp.untilSuffix', { date: formatDate(lang, pauseUntil) }) : '';
        const paused = t(lang, 'qp.paused', { name, until });
        return {
          pushBody: `${paused}${reason ? t(lang, 'qp.reasonInline', { reason }) : ''}`,
          messageText: `*${tenantName}*\n${paused}${reason ? t(lang, 'qp.reasonLine', { reason }) : ''}`,
        };
      };

      for (const noti of (notiData ?? []) as NotificationConfig[]) {
        if (!noti.enabled) continue;
        if (noti.enabled_tenants && !noti.enabled_tenants.includes(Number(pauseTenantId))) continue;
        if (!noti.signins) continue;

        const hasPush = !!noti.push_enabled;
        const hasTelegram = !!noti.telegram_chat_id;
        const parallelMode = !!noti.push_and_telegram && hasPush && hasTelegram;

        let pushSent = 0;
        let telegramSent = false;
        const { pushBody, messageText } = pauseTexts(normalizeLang(noti.language));

        if (hasPush) {
          pushSent = await sendPushToUser(supabase, noti.id, { title: tenantName, body: pushBody, data: { type: 'pause', tenantId: String(pauseTenantId) } });
        }
        if (hasTelegram && (parallelMode || pushSent === 0)) {
          const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: noti.telegram_chat_id, text: messageText, parse_mode: 'markdown' }),
          });
          telegramSent = res.ok;
        }
        if (pushSent > 0 || telegramSent) {
          const channels: string[] = [];
          if (pushSent > 0) channels.push('push');
          if (telegramSent) channels.push('telegram');
          await logNotification(supabase, { userId: noti.id, tenantId: Number(pauseTenantId), type: 'pause', title: tenantName, body: pushBody, channels, data: { type: 'pause', tenantId: String(pauseTenantId) } });
        }
      }

      console.log(`[quick-processor] playerPaused done`);
      return new Response(JSON.stringify({ message: 'Pause notifications sent' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
      });
    }

    // --- Standard attendance notification path ---
    if (!attId || !type) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    console.log(`[quick-processor] start attId=${attId} type=${type} isParents=${!!isParents}`);
    const { data: attendanceData, error: attendanceError } = await supabase.from('person_attendances').select('*, attendance:attendance_id(date, type, typeInfo, tenant:tenantId(id, longName)), person:person_id(firstName, lastName)').eq('id', attId).single();
    if (attendanceError || !attendanceData) {
      console.error(`[quick-processor] attId=${attId} attendance lookup failed:`, attendanceError);
      return new Response(JSON.stringify({
        error: 'Attendance record not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      });
    }
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const { data: tenantData, error: tenantError } = await supabase.from("tenantUsers").select("userId").or('role.eq.5,role.eq.1').eq('tenantId', attendanceData.attendance.tenant.id).range(0, 4999);
    if (tenantError || !tenantData) {
      console.error(`[quick-processor] attId=${attId} tenant=${attendanceData.attendance.tenant.id} tenantUsers lookup failed:`, tenantError);
      return new Response(JSON.stringify({
        error: 'Tenant users record not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      });
    }
    if (tenantData.length >= 4900) {
      console.warn(`[quick-processor] tenant=${attendanceData.attendance.tenant.id} tenantUsers=${tenantData.length} approaching the 5000-row range cap`);
    }
    const { data: notiData, error: notiError } = await supabase.from("notifications").select("*").or(`${tenantData.map((entry: any)=>`id.eq.${entry.userId}`).join(",")}`).range(0, 4999);
    if (notiError || !notiData) {
      console.error(`[quick-processor] attId=${attId} notifications lookup failed:`, notiError);
      return new Response(JSON.stringify({
        error: 'Notification config not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      });
    }

    const recipients: { userId: string; chatId: string | null; pushEnabled: boolean; parallelMode: boolean; lang: Lang }[] = [];

    for (const noti of notiData as NotificationConfig[]) {
      if (!noti.enabled) continue;
      if (noti.enabled_tenants && !noti.enabled_tenants.includes(attendanceData.attendance.tenant.id)) continue;

      const isSigninType = type === "signin" || type === "lateSignin" || type === "neutralSignin" || type === "noteUpdate";
      const isSignoutType = type === "signout" || type === "lateSignout" || type === "noteUpdate";

      const shouldNotify = (noti.signins && isSigninType) || (noti.signouts && isSignoutType);
      if (!shouldNotify) continue;

      const hasPush = !!noti.push_enabled;
      const hasTelegram = !!noti.telegram_chat_id;
      recipients.push({
        userId: noti.id,
        chatId: hasTelegram ? noti.telegram_chat_id : null,
        pushEnabled: hasPush,
        parallelMode: !!noti.push_and_telegram && hasPush && hasTelegram,
        lang: normalizeLang(noti.language),
      });
    }

    // Build message (per recipient language)
    const name = attendanceData.person.firstName + " " + attendanceData.person.lastName;
    const att = attendanceData.attendance;
    const buildTexts = (lang: Lang) => {
      const typeText = att.typeInfo ? " " + att.typeInfo : att.type === "vortrag" ? t(lang, 'qp.lecture') : "";
      const date = formatDate(lang, `${att.date}`) + typeText;
      const suffix = isParents ? t(lang, 'qp.byParent') : "";
      const attendanceLink = `\n\n[${t(lang, 'qp.openAttendance')}](https://attendix.de/open-attendance?id=${attendanceData.attendance_id}&tenantId=${att.tenant.id})`;
      const noteLine = notes && notes.length ? t(lang, 'qp.noteLine', { notes }) : '';
      const noteInline = notes && notes.length ? t(lang, 'qp.noteInline', { notes }) : '';

      let main: string;
      let line = '';
      let inline = '';
      switch (type) {
        case 'neutralSignin':
          main = t(lang, 'qp.signin', { name, date });
          break;
        case 'signin':
          main = t(lang, 'qp.signin', { name, date });
          line = noteLine;
          inline = noteInline;
          break;
        case 'lateSignout':
          main = t(lang, 'qp.late', { name, date });
          line = t(lang, 'qp.reasonLine', { reason });
          inline = t(lang, 'qp.reasonInline', { reason });
          break;
        case 'lateSignin':
          main = t(lang, 'qp.onTime', { name, date });
          line = noteLine;
          inline = noteInline;
          break;
        case 'noteUpdate':
          main = t(lang, 'qp.noteUpdate', { name, date, reason });
          return {
            messageText: `*${att.tenant.longName}*\n${main}${attendanceLink}`,
            pushBody: main,
          };
        default:
          main = t(lang, 'qp.signout', { name, date });
          line = t(lang, 'qp.reasonLine', { reason });
          inline = t(lang, 'qp.reasonInline', { reason });
      }
      return {
        messageText: `*${att.tenant.longName}*\n${main}${line}${suffix}${attendanceLink}`,
        pushBody: `${main}${inline}${suffix}`,
      };
    };

    // New push format (test): event name and group count, only when needed.
    const v2Users = recipients.filter((r) => r.pushEnabled && PUSH_V2_USERS.has(r.userId)).map((r) => r.userId);
    let v2TypeName = '';
    const v2MultiGroup = new Set<string>();
    if (v2Users.length) {
      try {
        const { data: typeRow } = await supabase.from('attendance').select('attType:type_id(name, hide_name)').eq('id', attendanceData.attendance_id).maybeSingle();
        const at = (typeRow as any)?.attType;
        if (at && !at.hide_name && at.name) v2TypeName = String(at.name);
        const { data: memberships } = await supabase.from('tenantUsers').select('userId').in('userId', v2Users);
        const counts = new Map<string, number>();
        for (const row of memberships ?? []) counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1);
        for (const [id, n] of counts) if (n > 1) v2MultiGroup.add(id);
      } catch (e) {
        console.error('[quick-processor] v2 lookup failed:', e);
      }
    }
    const buildV2 = (lang: Lang, userId: string) => {
      const key = type === 'lateSignout' ? 'qp2.late'
        : type === 'lateSignin' ? 'qp2.onTime'
        : type === 'signin' || type === 'neutralSignin' ? 'qp2.signin'
        : type === 'noteUpdate' ? 'qp2.noteUpdate'
        : 'qp2.signout';
      const title = t(lang, key, { name });
      const { label, days } = relativeDay(lang, `${att.date}`);
      const event = att.typeInfo || v2TypeName || (att.type === 'vortrag' ? t(lang, 'qp2.lecture') : '');
      const subtitle = [label, event, v2MultiGroup.has(userId) ? att.tenant.longName : ''].filter(Boolean).join(' · ');
      const detail = type === 'noteUpdate' ? reason
        : type === 'signin' || type === 'lateSignin' ? notes
        : type === 'neutralSignin' ? ''
        : reason;
      const body = [detail ? String(detail) : '', isParents && type !== 'noteUpdate' ? t(lang, 'qp2.byParent') : '']
        .filter(Boolean).join(' · ');
      return { title, subtitle, body, quiet: days > 1 || days < 0 };
    };

    // Send push and/or Telegram per recipient
    const pushTitle = attendanceData.attendance.tenant.longName;
    for (const r of recipients) {
      let pushSent = 0;
      let telegramSent = false;
      const { messageText, pushBody } = buildTexts(r.lang);

      if (r.pushEnabled) {
        const data = { type: 'attendance', attendanceId: String(attendanceData.attendance_id), tenantId: String(attendanceData.attendance.tenant.id) };
        let v2: ReturnType<typeof buildV2> | null = null;
        if (PUSH_V2_USERS.has(r.userId)) {
          try {
            v2 = buildV2(r.lang, r.userId);
          } catch (e) {
            console.error('[quick-processor] v2 text failed, sending the old one:', e);
          }
        }
        pushSent = await sendPushToUser(supabase, r.userId, v2
          ? {
            title: v2.title,
            body: v2.body,
            data,
            layout: { subtitle: v2.subtitle, threadId: `att-${attendanceData.attendance_id}`, quiet: v2.quiet },
          }
          : { title: pushTitle, body: pushBody, data });
      }

      if (r.chatId && (r.parallelMode || pushSent === 0)) {
        const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: r.chatId, text: messageText, parse_mode: "markdown" }),
        });
        telegramSent = res.ok;
      }

      if (pushSent > 0 || telegramSent) {
        const channels: string[] = [];
        if (pushSent > 0) channels.push('push');
        if (telegramSent) channels.push('telegram');
        await logNotification(supabase, {
          userId: r.userId,
          tenantId: attendanceData.attendance.tenant.id,
          type: 'attendance',
          title: pushTitle,
          body: pushBody,
          channels,
          data: { type: 'attendance', attendanceId: String(attendanceData.attendance_id), tenantId: String(attendanceData.attendance.tenant.id) },
        });
      }
    }

    console.log(`[quick-processor] done attId=${attId} tenantUsers=${tenantData.length} notifications=${notiData.length}`);
    return new Response(JSON.stringify({
      message: 'Notifications sent successfully',
      attId: attId
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  } catch (error) {
    console.error('[quick-processor] fatal:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      details: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
});
