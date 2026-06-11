import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushToUser } from '../_shared/send-push.ts'

const VIEWER_ROLE = 3;

interface NotificationConfig {
  id: string;
  enabled: boolean;
  telegram_chat_id: string | null;
  push_enabled: boolean | null;
  reminders: boolean | null;
  enabled_tenants: number[] | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { attendanceId, tenantId, message } = await req.json();

    if (!attendanceId || !tenantId) {
      return new Response(JSON.stringify({ error: 'Missing attendanceId or tenantId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const startedAt = Date.now();
    console.log(`[send-ad-hoc-reminder] start attendanceId=${attendanceId} tenantId=${tenantId}`);

    // Fetch attendance details
    const { data: attendance, error: attError } = await supabase
      .from('attendance')
      .select('id, date, start_time, type_id, tenantId')
      .eq('id', attendanceId)
      .single();

    if (attError || !attendance) {
      console.error(`[send-ad-hoc-reminder] attendance ${attendanceId} not found:`, attError);
      return new Response(JSON.stringify({ error: 'Attendance not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Fetch attendance type name
    const { data: attType } = await supabase
      .from('attendance_types')
      .select('name')
      .eq('id', attendance.type_id)
      .single();

    const typeName = attType?.name || 'Termin';

    // Fetch all non-viewer users in this tenant
    const { data: tenantUsers, error: tuError } = await supabase
      .from('tenantUsers')
      .select('userId, role')
      .eq('tenantId', tenantId)
      .neq('role', VIEWER_ROLE)
      .range(0, 4999); // guard against PostgREST's 1000-row default

    if (tuError || !tenantUsers || tenantUsers.length === 0) {
      console.warn(`[send-ad-hoc-reminder] tenant=${tenantId} no eligible users (tuError=${tuError?.message ?? 'none'} count=${tenantUsers?.length ?? 0})`);
      return new Response(JSON.stringify({ error: 'No eligible users found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (tenantUsers.length >= 4900) {
      console.warn(`[send-ad-hoc-reminder] tenant=${tenantId} tenantUsers=${tenantUsers.length} approaching the 5000-row range cap`);
    }

    const userIds = tenantUsers.map(tu => tu.userId);

    // Fetch notification configs
    const { data: notifConfigs, error: notifError } = await supabase
      .from('notifications')
      .select('id, enabled, telegram_chat_id, push_enabled, reminders, enabled_tenants')
      .eq('enabled', true)
      .eq('reminders', true)
      .in('id', userIds)
      .range(0, 4999); // guard against PostgREST's 1000-row default

    if (notifError || !notifConfigs || notifConfigs.length === 0) {
      console.log(`[send-ad-hoc-reminder] tenant=${tenantId} no users with reminders enabled (notifError=${notifError?.message ?? 'none'})`);
      return new Response(JSON.stringify({ sent: 0, message: 'No users with reminders enabled' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (notifConfigs.length >= 4900) {
      console.warn(`[send-ad-hoc-reminder] tenant=${tenantId} notifications=${notifConfigs.length} approaching the 5000-row range cap`);
    }

    // Filter by enabled_tenants and at least one channel
    const eligibleConfigs = (notifConfigs as NotificationConfig[]).filter(nc => {
      const hasChannel = nc.telegram_chat_id || nc.push_enabled;
      if (!hasChannel) return false;
      if (!nc.enabled_tenants || nc.enabled_tenants.length === 0) return true;
      return nc.enabled_tenants.includes(tenantId);
    });

    if (eligibleConfigs.length === 0) {
      console.log(`[send-ad-hoc-reminder] tenant=${tenantId} no eligible recipients after enabled_tenants/channel filter`);
      return new Response(JSON.stringify({ sent: 0, message: 'No eligible recipients' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    console.log(`[send-ad-hoc-reminder] tenant=${tenantId} eligibleRecipients=${eligibleConfigs.length}`);

    // Format date
    const dateObj = new Date(attendance.date);
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const timeStr = attendance.start_time || '';

    // Build messages
    const defaultBody = timeStr
      ? `${typeName} am ${formattedDate} um ${timeStr}`
      : `${typeName} am ${formattedDate}`;

    const body = message || defaultBody;
    const link = `\n\n[Anwesenheit öffnen](https://attendix.de/tabs/attendance?openAttendance=${attendanceId}&tenantId=${tenantId})`;
    const telegramMessage = `🔔 *Erinnerung*\n\n${body}${link}`;
    const pushBody = `${body}`;

    let sent = 0;

    for (const config of eligibleConfigs) {
      let pushSentSuccessfully = false;

      // Send via Push (preferred channel)
      if (config.push_enabled) {
        try {
          const pushSent = await sendPushToUser(supabase, config.id, {
            title: '🔔 Erinnerung',
            body: pushBody,
            data: { type: 'reminder', attendanceId: String(attendanceId), tenantId: String(tenantId) },
          });
          if (pushSent > 0) {
            sent++;
            pushSentSuccessfully = true;
          }
        } catch (e) {
          console.error(`Push send error for ${config.id}:`, e);
        }
      }

      // Send via Telegram only if push was not sent
      if (config.telegram_chat_id && !pushSentSuccessfully) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.telegram_chat_id,
              text: telegramMessage,
              parse_mode: 'Markdown',
            }),
          });
          if (res.ok) sent++;
        } catch (e) {
          console.error(`Telegram send error for ${config.id}:`, e);
        }
      }
    }

    console.log(`[send-ad-hoc-reminder] done attendanceId=${attendanceId} tenant=${tenantId} sent=${sent} recipients=${eligibleConfigs.length} elapsedMs=${Date.now() - startedAt}`);
    return new Response(JSON.stringify({ sent, recipients: eligibleConfigs.length }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    console.error('[send-ad-hoc-reminder] fatal:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
