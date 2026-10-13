// supabase/functions/resend-webhook/index.ts
// Deploy: supabase functions deploy resend-webhook --no-verify-jwt
//
// Receives Resend email events (Svix-signed) and records delivery/open state
// for Mitteilungen in message_recipients. Events for other emails (reminders,
// account mails) match no row and are ignored.
//
// Setup (Resend dashboard):
//   1. Domains → attendix.de → enable open tracking and click tracking.
//   2. Webhooks → add endpoint https://<project>.supabase.co/functions/v1/resend-webhook
//      with events email.delivered, email.opened, email.clicked, email.bounced.
//   3. Save the endpoint's signing secret (whsec_…) as the Supabase secret
//      RESEND_WEBHOOK_SECRET.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOLERANCE_SECONDS = 5 * 60;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET not configured");
    return new Response("Not configured", { status: 500 });
  }

  const raw = await req.text();
  const valid = await verifySignature(
    secret,
    req.headers.get("svix-id"),
    req.headers.get("svix-timestamp"),
    req.headers.get("svix-signature"),
    raw,
  );
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const emailId = event.data?.email_id;
  if (!emailId) {
    return new Response("ok");
  }
  const at = event.created_at ?? new Date().toISOString();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Each event sets its timestamp once (first occurrence wins).
  let column: string | null = null;
  const extra: Record<string, unknown> = {};
  switch (event.type) {
    case "email.delivered": column = "email_delivered_at"; break;
    case "email.opened":
    case "email.clicked": column = "email_opened_at"; break;
    case "email.bounced": column = "email_bounced_at"; extra.email_failed = true; break;
  }
  if (!column) {
    return new Response("ok");
  }

  const { error } = await admin
    .from("message_recipients")
    .update({ [column]: at, ...extra })
    .eq("resend_email_id", emailId)
    .is(column, null);
  if (error) {
    console.error(`[resend-webhook] update failed type=${event.type} email=${emailId}:`, error);
    return new Response("Update failed", { status: 500 }); // Resend retries
  }

  // An open or click implies delivery, in case that event arrives late or never.
  if (column === "email_opened_at") {
    await admin
      .from("message_recipients")
      .update({ email_delivered_at: at })
      .eq("resend_email_id", emailId)
      .is("email_delivered_at", null);
  }

  return new Response("ok");
});

/** Svix signature check as documented for Resend webhooks. */
async function verifySignature(
  secret: string,
  id: string | null,
  timestamp: string | null,
  signatureHeader: string | null,
  body: string,
): Promise<boolean> {
  if (!id || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return signatureHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && sig !== undefined && timingSafeEqual(sig, expected);
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
