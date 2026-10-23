// supabase/functions/send-document/index.ts
// Deploy: supabase functions deploy send-document
// Sends a document via Telegram, or just a link when sendAsUrl is set
// (used for song files that are not PDFs).
//
// Rebuilt on 23.10.2026: the deployed source could not be downloaded from
// Supabase Cloud anymore. Same request shape as before: { url, chat_id, sendAsUrl? }.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, chat_id, sendAsUrl } = await req.json();

    if (!url || !chat_id) {
      return json({ error: 'Missing required parameters: url and chat_id' }, 400);
    }

    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!telegramToken) {
      return json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, 500);
    }

    const method = sendAsUrl ? 'sendMessage' : 'sendDocument';
    const payload = sendAsUrl
      ? { chat_id, text: url }
      : { chat_id, document: url };

    const response = await fetch(`https://api.telegram.org/bot${telegramToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Telegram API error:', result);
      return json({ error: result.description || 'Failed to send document' }, 500);
    }

    return json({ success: true, message_id: result.result?.message_id });
  } catch (error) {
    console.error('Error in send-document:', error);
    return json({ error: (error as Error).message }, 500);
  }
});
