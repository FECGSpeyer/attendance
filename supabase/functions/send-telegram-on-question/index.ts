// TypeScript Edge Function: send-telegram-on-question
// Assumptions: environment variables SUPABASE_URL, SUPABASE_ANON_KEY are available automatically.
// Required secrets (set via supabase secrets): TELEGRAM_BOT_TOKEN

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return new Response("Bad Request: invalid JSON", { status: 400 });
    }

    // The trigger should send the new row under "new" or "record"
    const record = payload.new ?? payload.record ?? payload;
    if (!record) {
      return new Response("Bad Request: missing record", { status: 400 });
    }

    // Build message (adjust fields as necessary)
    const tenant_id = record.tenant_id ?? "(kein Tenant)";
    const msg = record.message ?? "";
    const phone = record.phone ?? "(keine Nummer)";

    const message = [
      `📩 Neue Frage`,
      `Frage: ${msg}`,
      `Nummmer: ${phone}`,
      `Tenant: ${tenant_id}`
    ].join("\n");

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      return new Response("Server misconfigured: missing Telegram secrets", { status: 500 });
    }

    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const tgPayload = {
      chat_id: 63117481,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    };

    const resp = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tgPayload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("Telegram API error:", resp.status, text);
      return new Response("Failed to send Telegram message", { status: 502 });
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
