// supabase/functions/_shared/send-email.ts
// Shared helper for sending transactional emails via the Resend API.
// Requires the RESEND_API_KEY secret and a verified sender domain in Resend.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Attendix <noreply@attendix.de>';

interface EmailParams {
  to: string[];
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email to one or more recipients via Resend.
 *
 * Sends one request per recipient so a single bad address (or Resend's
 * per-request recipient cap) can't fail the whole batch — mirroring the
 * best-effort per-recipient loops used by the push/Telegram senders.
 *
 * Resilient by design: if RESEND_API_KEY is missing this logs a warning and
 * returns 0 instead of throwing, so the calling reminder flow keeps working.
 *
 * @returns the number of recipients Resend accepted.
 */
export async function sendEmail(params: EmailParams): Promise<number> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('[send-email] RESEND_API_KEY not configured; skipping email send');
    return 0;
  }

  const from = params.from || DEFAULT_FROM;
  let sent = 0;

  for (const recipient of params.to) {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: recipient,
          subject: params.subject,
          html: params.html,
        }),
      });

      if (res.ok) {
        sent++;
      } else {
        console.error(`[send-email] failed for ${recipient}: ${res.status} ${await res.text()}`);
      }
    } catch (e) {
      console.error(`[send-email] error for ${recipient}:`, e);
    }
  }

  return sent;
}
