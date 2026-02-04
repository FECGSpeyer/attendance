// supabase/functions/send-photo/index.ts
// Deploy: supabase functions deploy send-photo
// Sends a photo via Telegram

Deno.serve(async (req) => {
  try {
      if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
    const { url, chat_id } = await req.json();

    if (!url || !chat_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: url and chat_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } }
      );
    }

    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!telegramToken) {
      return new Response(
        JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }),
        {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
            }
        }
      );
    }

    // Send photo via Telegram API
    const response = await fetch(
      `https://api.telegram.org/bot${telegramToken}/sendPhoto`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
        body: JSON.stringify({
          chat_id,
          photo: url,
        }),
      }
    );

    const result = await response.json();

    if (!result.ok) {
      console.error('Telegram API error:', result);
      return new Response(
        JSON.stringify({ error: result.description || 'Failed to send photo' }),
        { status: 500, headers: { 'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message_id: result.result?.message_id }),
      { headers: { 'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } }
    );

  } catch (error) {
    console.error('Error in send-photo:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } }
    );
  }
});
