// supabase/functions/attendix-bot/index.ts
// Deploy: supabase functions deploy attendix-bot --no-verify-jwt
// Telegram webhook for @attendix_bot.
//
// The app links an account via https://t.me/attendix_bot?start=<userId>
// (notifications.page.ts → connectTelegram). Telegram then posts
// "/start <userId>" here and we store the chat id in notifications.telegram_chat_id.
//
// Rebuilt on 23.10.2026: the deployed source could not be downloaded from
// Supabase Cloud anymore.
//
// Optional secret TELEGRAM_WEBHOOK_SECRET: when set, requests must carry the
// same value in X-Telegram-Bot-Api-Secret-Token (pass it as secret_token to setWebhook).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function reply(token: string, chatId: number, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error('Telegram API error:', res.status, await res.text().catch(() => ''));
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (webhookSecret && req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) {
    return new Response('Forbidden', { status: 403 });
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN not configured');
    return new Response('ok');
  }

  try {
    const update = await req.json();
    const message = update?.message;
    const chatId: number | undefined = message?.chat?.id;
    const text: string = (message?.text ?? '').trim();

    // Always answer 200, otherwise Telegram keeps retrying the update.
    if (!chatId || !text.startsWith('/start')) {
      if (chatId) {
        await reply(token, chatId, 'Hallo! Verknüpfe dein Konto in Attendix unter Einstellungen → Benachrichtigungen → Telegramverknüpfung.');
      }
      return new Response('ok');
    }

    const userId = text.split(/\s+/)[1] ?? '';
    if (!UUID_RE.test(userId)) {
      await reply(token, chatId, 'Willkommen bei Attendix! Bitte starte die Verknüpfung direkt aus der App unter Einstellungen → Benachrichtigungen.');
      return new Response('ok');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase
      .from('notifications')
      .update({ telegram_chat_id: String(chatId) })
      .eq('id', userId)
      .select('id');

    if (error) {
      console.error('Failed to store chat id:', error);
      await reply(token, chatId, 'Die Verknüpfung hat leider nicht geklappt. Bitte versuche es später erneut.');
    } else if (!data?.length) {
      await reply(token, chatId, 'Konto nicht gefunden. Bitte öffne einmal die Benachrichtigungs-Einstellungen in der App und versuche es dann erneut.');
    } else {
      await reply(token, chatId, '✅ Dein Attendix-Konto ist jetzt mit Telegram verknüpft.');
    }
  } catch (err) {
    console.error('Error in attendix-bot:', err);
  }

  return new Response('ok');
});
