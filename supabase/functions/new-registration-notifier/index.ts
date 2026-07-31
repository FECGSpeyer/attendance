import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/send-push.ts';
import { logNotification } from '../_shared/log-notification.ts';

interface NotificationConfig {
  id: string;
  enabled: boolean;
  telegram_chat_id: string | null;
  registrations: boolean;
  enabled_tenants: number[] | null;
  push_enabled: boolean;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    const payload = await req.json().catch(() => null);
    if (!payload) {
      return new Response('Bad Request: invalid JSON', { status: 400 });
    }

    // The DB trigger sends the new row under "new" or "record".
    const record = payload.new ?? payload.record ?? payload;
    if (!record) {
      return new Response('Bad Request: missing record', { status: 400 });
    }

    const tenantId = record.tenantId;
    const name = `${record.firstName} ${record.lastName}`;
    const phone = record.phone;
    const pending = record.pending;
    const self_register = record.self_register;
    const groupId = record.instrument;

    if (!self_register) {
      return new Response(JSON.stringify({
        message: 'Not registered by his own',
        tenantId,
      }), { headers: CORS_HEADERS });
    }

    if (!tenantId || !name) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters',
      }), { status: 400, headers: CORS_HEADERS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

    console.log(`[new-registration-notifier] start tenant=${tenantId} pending=${!!pending}`);

    // Admins (role 5) and responsibles (role 1) of the tenant.
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenantUsers')
      .select('userId')
      .or('role.eq.5,role.eq.1')
      .eq('tenantId', tenantId);
    if (tenantError || !tenantData) {
      console.error(`[new-registration-notifier] tenant=${tenantId} tenantUsers lookup failed:`, tenantError);
      return new Response(JSON.stringify({
        error: 'Tenant users record not found',
      }), { status: 404, headers: CORS_HEADERS });
    }

    const { data: notiData, error: notiError } = await supabase
      .from('notifications')
      .select('*')
      .or(`${tenantData.map((entry: any) => `id.eq.${entry.userId}`).join(',')}`);
    if (notiError || !notiData) {
      console.error(`[new-registration-notifier] tenant=${tenantId} notifications lookup failed:`, notiError);
      return new Response(JSON.stringify({
        error: 'Notification config not found',
      }), { status: 404, headers: CORS_HEADERS });
    }

    const chatIds: { userId: string; chatId: string }[] = [];
    const pushUserIds: string[] = [];

    for (const noti of notiData as NotificationConfig[]) {
      if (!noti.enabled) continue;
      if (noti.enabled_tenants && !noti.enabled_tenants.includes(tenantId)) continue;
      if (!noti.registrations) continue;

      if (noti.push_enabled) {
        pushUserIds.push(noti.id);
      }
      if (noti.telegram_chat_id) {
        chatIds.push({ userId: noti.id, chatId: noti.telegram_chat_id });
      }
    }

    // Tenant name + group name for the message body.
    const { data: tenantMetadata, error: tenantMetaError } = await supabase
      .from('tenants')
      .select('longName')
      .eq('id', tenantId)
      .single();
    if (tenantMetaError || !tenantMetadata) {
      console.error(`[new-registration-notifier] tenant=${tenantId} tenant lookup failed:`, tenantMetaError);
      return new Response(JSON.stringify({
        error: 'Tenant record not found',
      }), { status: 404, headers: CORS_HEADERS });
    }
    const tenantName = tenantMetadata.longName;

    // Group is optional — a registration may not carry a group/instrument.
    let group = '';
    if (groupId) {
      const { data: groupData } = await supabase
        .from('instruments')
        .select('name')
        .eq('id', groupId)
        .single();
      group = groupData?.name ?? '';
    }

    const detailLines = [name, phone, group].filter((line) => line && String(line).length).join('\n');
    const heading = pending ? 'Neue ausstehende Registrierung:' : 'Neue Registrierung:';
    const messageText = `*${tenantName}*\n${heading}\n${detailLines}`;
    // Push has no markdown — reuse the same content without the asterisks/newlines heading marker.
    const pushBody = `${heading} ${[name, group].filter((line) => line && String(line).length).join(', ')}`;
    const pushTitle = tenantName;
    const notifData = { type: 'registration', tenantId: String(tenantId) };

    // Push first (preferred channel).
    const pushSentUserIds = new Set<string>();
    for (const userId of pushUserIds) {
      const pushSent = await sendPushToUser(supabase, userId, {
        title: pushTitle,
        body: pushBody,
        data: notifData,
      });
      if (pushSent > 0) {
        pushSentUserIds.add(userId);
        await logNotification(supabase, {
          userId,
          tenantId,
          type: 'registration',
          title: pushTitle,
          body: pushBody,
          channels: ['push'],
          data: notifData,
        });
      }
    }

    // Telegram only for recipients who did not receive a push.
    for (const { userId, chatId } of chatIds) {
      if (pushSentUserIds.has(userId)) continue;
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: 'markdown',
        }),
      });
      await logNotification(supabase, {
        userId,
        tenantId,
        type: 'registration',
        title: pushTitle,
        body: pushBody,
        channels: ['telegram'],
        data: notifData,
      });
    }

    console.log(`[new-registration-notifier] done tenant=${tenantId} push=${pushSentUserIds.size} telegram=${chatIds.filter((c) => !pushSentUserIds.has(c.userId)).length}`);
    return new Response(JSON.stringify({
      message: 'Registration notification sent successfully',
      tenantId,
    }), { headers: CORS_HEADERS });
  } catch (error) {
    console.error('[new-registration-notifier] fatal:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      details: error.message,
    }), { status: 500, headers: CORS_HEADERS });
  }
});
