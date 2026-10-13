// supabase/functions/send-message/index.ts
// Deploy: supabase functions deploy send-message
//
// Mitteilungen: an ADMIN or RESPONSIBLE sends a formatted message to all active
// members of a tenant (optionally only some groups). Delivery mirrors the ad hoc
// reminder: Push (preferred) / Telegram (fallback, or both with
// push_and_telegram) for users with notifications + the "messages" toggle on,
// plus an email to every recipient with an email address. Every app user also
// gets a notification-center entry.
//
// POST body:
//   { tenantId, groupIds?: number[], channels?: { push: boolean, email: boolean },
//     dryRun: true }                       → recipient counts for the compose screen
//   { tenantId, title, content (Tiptap JSON), groupIds?, channels? }
//                                          → creates the message, returns { messageId }
//                                            immediately and delivers in the background.
//
// Per-recipient delivery and read state is tracked in message_recipients;
// email delivered/opened/bounced events arrive via the resend-webhook function.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUser } from "../_shared/send-push.ts";
import { messageEmail } from "../_shared/attendix-email-templates.ts";
import { renderHtml, renderText, TiptapNode } from "../_shared/message-render.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ROLE_ADMIN = 1;
const ROLE_RESPONSIBLE = 5;
const APP_URL = "https://attendix.de";
const FROM = "Attendix <noreply@attendix.de>";
const MAX_TITLE = 200;
const MAX_CONTENT_BYTES = 100_000;
const PUSH_CONCURRENCY = 8;
const EMAIL_BATCH_SIZE = 100;

interface Player {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  appId: string | null;
  instrument: number | null;
}

interface NotificationConfig {
  id: string;
  enabled: boolean;
  telegram_chat_id: string | null;
  push_enabled: boolean | null;
  push_and_telegram: boolean | null;
  enabled_tenants: (number | string)[] | null;
}

interface Recipient {
  player: Player;
  userId: string | null;
  email: string | null;
  config: NotificationConfig | null; // eligible push/Telegram config, else null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid token" }, 401);
    }
    const caller = userData.user;

    const body = await req.json().catch(() => null);
    const tenantId = Number(body?.tenantId);
    if (!tenantId) {
      return json({ error: "Missing tenantId" }, 400);
    }
    const groupIds: number[] | null = Array.isArray(body?.groupIds) && body.groupIds.length > 0
      ? body.groupIds.map(Number).filter((n: number) => Number.isFinite(n))
      : null;
    const channels = {
      push: body?.channels?.push !== false,
      email: body?.channels?.email !== false,
    };

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Only admins/responsibles of the tenant may send messages.
    const { data: membership, error: memberErr } = await admin
      .from("tenantUsers")
      .select("role")
      .eq("tenantId", tenantId)
      .eq("userId", caller.id)
      .in("role", [ROLE_ADMIN, ROLE_RESPONSIBLE])
      .limit(1)
      .maybeSingle();
    if (memberErr) {
      console.error("[send-message] membership lookup failed:", memberErr);
      return json({ error: "Membership lookup failed" }, 500);
    }
    if (!membership) {
      return json({ error: "Forbidden" }, 403);
    }

    const recipients = await resolveRecipients(admin, tenantId, groupIds);
    const counts = countRecipients(recipients, channels);

    if (body?.dryRun) {
      return json(counts);
    }

    const title = String(body?.title ?? "").trim();
    const content = body?.content as TiptapNode | undefined;
    if (!title || title.length > MAX_TITLE) {
      return json({ error: "Invalid title" }, 400);
    }
    if (!content || content.type !== "doc" || JSON.stringify(content).length > MAX_CONTENT_BYTES) {
      return json({ error: "Invalid content" }, 400);
    }
    if (!channels.push && !channels.email) {
      return json({ error: "No channel selected" }, 400);
    }
    if (recipients.length === 0) {
      return json({ error: "No recipients" }, 400);
    }

    const bodyHtml = renderHtml(content);
    const bodyText = renderText(content);
    if (!bodyText) {
      return json({ error: "Empty message" }, 400);
    }

    const senderName = await resolveSenderName(admin, tenantId, caller.id, caller.email ?? "");
    const { data: tenant } = await admin
      .from("tenants")
      .select("longName, shortName")
      .eq("id", tenantId)
      .single();
    const tenantName = (tenant?.longName || tenant?.shortName || "Attendix") as string;

    const { data: message, error: msgErr } = await admin
      .from("messages")
      .insert({
        tenantId,
        sender_id: caller.id,
        sender_name: senderName,
        title,
        body_json: content,
        body_html: bodyHtml,
        body_text: bodyText,
        channels: [channels.push ? "push" : null, channels.email ? "email" : null].filter(Boolean),
        group_ids: groupIds,
        recipient_count: recipients.length,
        status: "sending",
      })
      .select("id")
      .single();
    if (msgErr || !message) {
      console.error("[send-message] insert message failed:", msgErr);
      return json({ error: "Could not create message" }, 500);
    }
    const messageId = message.id as string;

    const rows = recipients.map((r) => ({
      message_id: messageId,
      tenantId,
      player_id: r.player.id,
      user_id: r.userId,
      name: `${r.player.firstName ?? ""} ${r.player.lastName ?? ""}`.trim(),
      group_id: r.player.instrument,
      email: channels.email ? r.email : null,
      push_enabled: channels.push && !!r.config,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("message_recipients").insert(rows.slice(i, i + 500));
      if (error) {
        console.error("[send-message] insert recipients failed:", error);
        await admin.from("messages").delete().eq("id", messageId);
        return json({ error: "Could not create recipients" }, 500);
      }
    }

    console.log(`[send-message] created message=${messageId} tenant=${tenantId} recipients=${recipients.length} push=${counts.push} email=${counts.email}`);

    const delivery = deliver(admin, {
      messageId,
      tenantId,
      tenantName,
      title,
      bodyText,
      emailHtml: renderHtml(content, { email: true }),
      senderName,
      replyTo: caller.email ?? null,
      recipients,
      channels,
    }).catch((e) => console.error(`[send-message] delivery failed message=${messageId}:`, e));

    // Respond right away; delivery continues in the background.
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(delivery);
    } else {
      await delivery;
    }

    return json({ messageId, ...counts });
  } catch (e) {
    console.error("[send-message] fatal:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function resolveRecipients(
  admin: SupabaseClient,
  tenantId: number,
  groupIds: number[] | null,
): Promise<Recipient[]> {
  // All active members: not archived, not a pending registration. The main
  // group is included on purpose (unlike reminder emails).
  let query = admin
    .from("player")
    .select("id, firstName, lastName, email, appId, instrument")
    .eq("tenantId", tenantId)
    .is("left", null)
    .or("pending.is.null,pending.eq.false")
    .range(0, 4999);
  if (groupIds) {
    query = query.in("instrument", groupIds);
  }
  const { data: players, error } = await query;
  if (error) {
    throw new Error(`player query failed: ${error.message}`);
  }

  const appIds = Array.from(new Set((players ?? []).map((p: Player) => p.appId).filter(Boolean))) as string[];
  const configs = new Map<string, NotificationConfig>();
  // Chunked to keep the PostgREST URL (in.(...) filter) short.
  for (let i = 0; i < appIds.length; i += 150) {
    const { data, error: nErr } = await admin
      .from("notifications")
      .select("id, enabled, telegram_chat_id, push_enabled, push_and_telegram, enabled_tenants")
      .eq("enabled", true)
      .eq("messages", true)
      .in("id", appIds.slice(i, i + 150));
    if (nErr) {
      console.error("[send-message] notifications query failed:", nErr);
      continue;
    }
    for (const c of (data ?? []) as NotificationConfig[]) {
      const hasChannel = !!c.telegram_chat_id || !!c.push_enabled;
      const tenantOk = !c.enabled_tenants || c.enabled_tenants.length === 0 ||
        c.enabled_tenants.map(Number).includes(tenantId);
      if (hasChannel && tenantOk) configs.set(c.id, c);
    }
  }

  return (players ?? []).map((p: Player) => {
    const email = (p.email ?? "").trim().toLowerCase();
    return {
      player: p,
      userId: p.appId ?? null,
      email: email.includes("@") ? email : null,
      config: p.appId ? configs.get(p.appId) ?? null : null,
    };
  });
}

function countRecipients(recipients: Recipient[], channels: { push: boolean; email: boolean }) {
  let push = 0;
  let email = 0;
  let unreachable = 0;
  for (const r of recipients) {
    const viaPush = channels.push && !!r.config;
    const viaEmail = channels.email && !!r.email;
    if (viaPush) push++;
    if (viaEmail) email++;
    if (!viaPush && !viaEmail) unreachable++;
  }
  return { recipients: recipients.length, push, email, unreachable };
}

async function resolveSenderName(admin: SupabaseClient, tenantId: number, userId: string, fallback: string): Promise<string> {
  const { data } = await admin
    .from("player")
    .select("firstName, lastName")
    .eq("tenantId", tenantId)
    .eq("appId", userId)
    .limit(1)
    .maybeSingle();
  const name = data ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() : "";
  return name || fallback;
}

interface DeliveryParams {
  messageId: string;
  tenantId: number;
  tenantName: string;
  title: string;
  bodyText: string;
  emailHtml: string;
  senderName: string;
  replyTo: string | null;
  recipients: Recipient[];
  channels: { push: boolean; email: boolean };
}

async function deliver(admin: SupabaseClient, p: DeliveryParams): Promise<void> {
  const startedAt = Date.now();
  const url = `${APP_URL}/tabs/messages/${p.messageId}`;
  const channelsByUser = new Map<string, Set<string>>();
  const addChannel = (userId: string, ch: string) => {
    if (!channelsByUser.has(userId)) channelsByUser.set(userId, new Set());
    channelsByUser.get(userId)!.add(ch);
  };

  // 1. Push / Telegram ---------------------------------------------------------
  if (p.channels.push) {
    const pushTitle = `📣 ${p.title}`;
    const pushBody = p.bodyText.length > 180 ? `${p.bodyText.slice(0, 177).trimEnd()}…` : p.bodyText;
    const telegramText = `📣 ${p.title}\n\n${p.bodyText}\n\nIn der App öffnen: ${url}`.slice(0, 4000);
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const seen = new Set<string>();
    const targets = p.recipients.filter((r) => {
      if (!r.config || !r.userId || seen.has(r.userId)) return false;
      seen.add(r.userId);
      return true;
    });

    await runPool(targets, PUSH_CONCURRENCY, async (r) => {
      const config = r.config!;
      const parallelMode = !!config.push_and_telegram && !!config.push_enabled && !!config.telegram_chat_id;
      let pushSent = 0;
      let telegramSent = false;

      if (config.push_enabled) {
        try {
          pushSent = await sendPushToUser(admin, config.id, {
            title: pushTitle,
            body: pushBody,
            data: { type: "message", messageId: p.messageId, tenantId: String(p.tenantId) },
          });
        } catch (e) {
          console.error(`[send-message] push error user=${config.id}:`, e);
        }
      }

      if (config.telegram_chat_id && telegramToken && (parallelMode || pushSent === 0)) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: config.telegram_chat_id, text: telegramText, disable_web_page_preview: true }),
          });
          telegramSent = res.ok;
          if (!res.ok) console.error(`[send-message] telegram ${res.status} user=${config.id}: ${await res.text()}`);
        } catch (e) {
          console.error(`[send-message] telegram error user=${config.id}:`, e);
        }
      }

      const now = new Date().toISOString();
      const update: Record<string, unknown> = { push_failed: pushSent === 0 && !telegramSent };
      if (pushSent > 0) { update.push_sent_at = now; addChannel(r.userId!, "push"); }
      if (telegramSent) { update.telegram_sent_at = now; addChannel(r.userId!, "telegram"); }
      await admin.from("message_recipients").update(update)
        .eq("message_id", p.messageId).eq("user_id", r.userId!);
    });
  }

  // 2. Email ------------------------------------------------------------------
  if (p.channels.email) {
    const emails = Array.from(new Set(p.recipients.map((r) => r.email).filter(Boolean))) as string[];
    const content = messageEmail({
      title: p.title,
      bodyHtml: p.emailHtml,
      preview: p.bodyText.slice(0, 140),
      senderName: p.senderName,
      tenant: p.tenantName,
      url,
    });
    const results = await sendEmails(emails, content.subject, content.html, p.replyTo, p.messageId);
    const now = new Date().toISOString();
    for (const [email, result] of results) {
      const update = result.id
        ? { email_sent_at: now, resend_email_id: result.id }
        : { email_failed: true };
      await admin.from("message_recipients").update(update)
        .eq("message_id", p.messageId).eq("email", email);
      if (result.id) {
        for (const r of p.recipients) {
          if (r.email === email && r.userId) addChannel(r.userId, "email");
        }
      }
    }
  }

  // 3. Notification center: one entry per app user, always ---------------------
  const feedUsers = Array.from(new Set(p.recipients.map((r) => r.userId).filter(Boolean))) as string[];
  // The bell lists only the body, so it leads with the title.
  const preview = p.bodyText.replace(/\s+/g, " ");
  const feedBody = `📣 ${p.title}: ${preview.length > 250 ? `${preview.slice(0, 247).trimEnd()}…` : preview}`;
  const feedRows = feedUsers.map((userId) => ({
    user_id: userId,
    tenantId: p.tenantId,
    type: "message",
    title: `📣 ${p.title}`,
    body: feedBody,
    channels: Array.from(channelsByUser.get(userId) ?? []),
    data: { messageId: p.messageId, tenantId: String(p.tenantId) },
    read: false,
  }));
  for (let i = 0; i < feedRows.length; i += 500) {
    const { error } = await admin.from("user_notifications").insert(feedRows.slice(i, i + 500));
    if (error) console.error("[send-message] feed insert failed:", error);
  }

  await admin.from("messages")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", p.messageId);

  console.log(`[send-message] delivered message=${p.messageId} feed=${feedRows.length} elapsedMs=${Date.now() - startedAt}`);
}

/**
 * Sends one email per address through Resend's batch endpoint (100 per call),
 * falling back to single sends for a batch Resend rejects as a whole (e.g. one
 * malformed address). Returns the Resend email id per address (null = failed).
 */
async function sendEmails(
  emails: string[],
  subject: string,
  html: string,
  replyTo: string | null,
  messageId: string,
): Promise<Map<string, { id: string | null }>> {
  const results = new Map<string, { id: string | null }>();
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("[send-message] RESEND_API_KEY not configured; skipping email");
    emails.forEach((e) => results.set(e, { id: null }));
    return results;
  }

  const payload = (to: string) => ({
    from: FROM,
    to: [to],
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
    tags: [{ name: "message_id", value: messageId }],
  });

  for (let i = 0; i < emails.length; i += EMAIL_BATCH_SIZE) {
    const chunk = emails.slice(i, i + EMAIL_BATCH_SIZE);
    const res = await resendFetch(apiKey, "https://api.resend.com/emails/batch", chunk.map(payload));
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const ids: { id: string }[] = data?.data ?? [];
      chunk.forEach((email, idx) => results.set(email, { id: ids[idx]?.id ?? null }));
    } else {
      console.error(`[send-message] batch failed ${res.status}: ${await res.text()}; falling back to single sends`);
      for (const email of chunk) {
        const single = await resendFetch(apiKey, "https://api.resend.com/emails", payload(email));
        const data = single.ok ? await single.json().catch(() => null) : null;
        if (!single.ok) console.error(`[send-message] email failed for ${email}: ${single.status} ${await single.text()}`);
        results.set(email, { id: data?.id ?? null });
        await sleep(550); // stay under Resend's default 2 requests/second
      }
    }
    await sleep(550);
  }
  return results;
}

async function resendFetch(apiKey: string, url: string, body: unknown): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status !== 429 || attempt >= 3) return res;
    await res.body?.cancel();
    await sleep(1000 * (attempt + 1));
  }
}

async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        console.error("[send-message] worker error:", e);
      }
    }
  });
  await Promise.all(workers);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
