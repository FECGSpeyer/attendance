// supabase/functions/_shared/message-delivery.ts
// Delivery of a Mitteilung (messages / message_recipients) via Push/Telegram,
// email and the notification center. Used by send-message (manual messages)
// and send-auto-messages (rule based). The text can differ per recipient
// (placeholders, language), so callers pass a render function.

import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUser } from "./send-push.ts";
import { messageEmail } from "./attendix-email-templates.ts";
import { Lang, t, tenantLanguage, userLanguages } from "./i18n.ts";

export const APP_URL = "https://attendix.de";
const FROM = "Attendix <noreply@attendix.de>";
const PUSH_CONCURRENCY = 8;
const EMAIL_BATCH_SIZE = 100;

export interface DeliveryPlayer {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  appId: string | null;
  instrument: number | null;
}

export interface NotificationConfig {
  id: string;
  enabled: boolean;
  telegram_chat_id: string | null;
  push_enabled: boolean | null;
  push_and_telegram: boolean | null;
  enabled_tenants: (number | string)[] | null;
}

export interface DeliveryRecipient {
  player: DeliveryPlayer;
  userId: string | null;
  email: string | null;
  config: NotificationConfig | null; // eligible push/Telegram config, else null
}

export interface RenderedMessage {
  title: string;
  bodyText: string;
  emailHtml: string;
}

export interface DeliveryParams {
  messageId: string;
  tenantId: number;
  tenantName: string;
  senderName: string;
  replyTo: string | null;
  recipients: DeliveryRecipient[];
  channels: { push: boolean; email: boolean };
  /** Text per recipient and language. */
  render: (r: DeliveryRecipient, lang: Lang) => RenderedMessage;
  logTag?: string;
}

/**
 * Push/Telegram configs of app users that may receive Mitteilungen in this
 * tenant (notifications on, "messages" toggle on, tenant allowed, a channel).
 */
export async function loadMessageConfigs(
  admin: SupabaseClient,
  tenantId: number,
  appIds: string[],
): Promise<Map<string, NotificationConfig>> {
  const configs = new Map<string, NotificationConfig>();
  const ids = Array.from(new Set(appIds.filter(Boolean)));
  // Chunked to keep the PostgREST URL (in.(...) filter) short.
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, enabled, telegram_chat_id, push_enabled, push_and_telegram, enabled_tenants")
      .eq("enabled", true)
      .eq("messages", true)
      .in("id", ids.slice(i, i + 150));
    if (error) {
      console.error("[message-delivery] notifications query failed:", error);
      continue;
    }
    for (const c of (data ?? []) as NotificationConfig[]) {
      const hasChannel = !!c.telegram_chat_id || !!c.push_enabled;
      const tenantOk = !c.enabled_tenants || c.enabled_tenants.length === 0 ||
        c.enabled_tenants.map(Number).includes(tenantId);
      if (hasChannel && tenantOk) configs.set(c.id, c);
    }
  }
  return configs;
}

export function toRecipient(p: DeliveryPlayer, configs: Map<string, NotificationConfig>): DeliveryRecipient {
  const email = (p.email ?? "").trim().toLowerCase();
  return {
    player: p,
    userId: p.appId ?? null,
    email: email.includes("@") ? email : null,
    config: p.appId ? configs.get(p.appId) ?? null : null,
  };
}

export function countRecipients(recipients: DeliveryRecipient[], channels: { push: boolean; email: boolean }) {
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

/** Language of each recipient: their app language, else the tenant default. */
export async function recipientLanguages(
  admin: SupabaseClient,
  tenantId: number,
  recipients: DeliveryRecipient[],
): Promise<(r: DeliveryRecipient) => Lang> {
  const userLangs = await userLanguages(admin, recipients.map((r) => r.userId ?? ""));
  const tenantLang = await tenantLanguage(admin, tenantId);
  return (r: DeliveryRecipient): Lang => (r.userId && userLangs.get(r.userId)) || tenantLang;
}

export async function deliverMessage(admin: SupabaseClient, p: DeliveryParams): Promise<void> {
  const tag = p.logTag ?? "[message-delivery]";
  const startedAt = Date.now();
  const url = `${APP_URL}/tabs/messages/${p.messageId}`;
  const channelsByUser = new Map<string, Set<string>>();
  const addChannel = (userId: string, ch: string) => {
    if (!channelsByUser.has(userId)) channelsByUser.set(userId, new Set());
    channelsByUser.get(userId)!.add(ch);
  };
  const langOf = await recipientLanguages(admin, p.tenantId, p.recipients);
  const rendered = new Map<DeliveryRecipient, RenderedMessage>();
  const renderFor = (r: DeliveryRecipient): RenderedMessage => {
    if (!rendered.has(r)) rendered.set(r, p.render(r, langOf(r)));
    return rendered.get(r)!;
  };

  // 1. Push / Telegram ---------------------------------------------------------
  if (p.channels.push) {
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const seen = new Set<string>();
    const targets = p.recipients.filter((r) => {
      if (!r.config || !r.userId || seen.has(r.userId)) return false;
      seen.add(r.userId);
      return true;
    });

    await runPool(targets, PUSH_CONCURRENCY, async (r) => {
      const config = r.config!;
      const msg = renderFor(r);
      const parallelMode = !!config.push_and_telegram && !!config.push_enabled && !!config.telegram_chat_id;
      let pushSent = 0;
      let telegramSent = false;

      if (config.push_enabled) {
        try {
          pushSent = await sendPushToUser(admin, config.id, {
            title: `📣 ${msg.title}`,
            body: msg.bodyText.length > 180 ? `${msg.bodyText.slice(0, 177).trimEnd()}…` : msg.bodyText,
            data: { type: "message", messageId: p.messageId, tenantId: String(p.tenantId) },
          });
        } catch (e) {
          console.error(`${tag} push error user=${config.id}:`, e);
        }
      }

      if (config.telegram_chat_id && telegramToken && (parallelMode || pushSent === 0)) {
        try {
          const text = `📣 ${msg.title}\n\n${msg.bodyText}\n\n${t(langOf(r), "telegram.openInApp", { url })}`.slice(0, 4000);
          const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: config.telegram_chat_id, text, disable_web_page_preview: true }),
          });
          telegramSent = res.ok;
          if (!res.ok) console.error(`${tag} telegram ${res.status} user=${config.id}: ${await res.text()}`);
        } catch (e) {
          console.error(`${tag} telegram error user=${config.id}:`, e);
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
    // An address shared by several people gets one mail only (the first one).
    const byEmail = new Map<string, DeliveryRecipient>();
    for (const r of p.recipients) {
      if (r.email && !byEmail.has(r.email)) byEmail.set(r.email, r);
    }
    const mails = [...byEmail.entries()].map(([to, r]) => {
      const msg = renderFor(r);
      const content = messageEmail({
        title: msg.title,
        bodyHtml: msg.emailHtml,
        preview: msg.bodyText.slice(0, 140),
        senderName: p.senderName,
        tenant: p.tenantName,
        url,
      }, langOf(r));
      return { to, subject: content.subject, html: content.html };
    });
    const results = await sendEmails(mails, p.replyTo, p.messageId, tag);
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
  const feedRows: Record<string, unknown>[] = [];
  const feedSeen = new Set<string>();
  for (const r of p.recipients) {
    if (!r.userId || feedSeen.has(r.userId)) continue;
    feedSeen.add(r.userId);
    const msg = renderFor(r);
    // The bell lists only the body, so it leads with the title.
    const preview = msg.bodyText.replace(/\s+/g, " ");
    feedRows.push({
      user_id: r.userId,
      tenantId: p.tenantId,
      type: "message",
      title: `📣 ${msg.title}`,
      body: `📣 ${msg.title}: ${preview.length > 250 ? `${preview.slice(0, 247).trimEnd()}…` : preview}`,
      channels: Array.from(channelsByUser.get(r.userId) ?? []),
      data: { messageId: p.messageId, tenantId: String(p.tenantId) },
      read: false,
    });
  }
  for (let i = 0; i < feedRows.length; i += 500) {
    const { error } = await admin.from("user_notifications").insert(feedRows.slice(i, i + 500));
    if (error) console.error(`${tag} feed insert failed:`, error);
  }

  await admin.from("messages")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", p.messageId);

  console.log(`${tag} delivered message=${p.messageId} feed=${feedRows.length} elapsedMs=${Date.now() - startedAt}`);
}

/**
 * Sends the mails through Resend's batch endpoint (100 per call), falling back
 * to single sends for a batch Resend rejects as a whole (e.g. one malformed
 * address). Returns the Resend email id per address (null = failed).
 */
async function sendEmails(
  mails: { to: string; subject: string; html: string }[],
  replyTo: string | null,
  messageId: string,
  tag: string,
): Promise<Map<string, { id: string | null }>> {
  const results = new Map<string, { id: string | null }>();
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn(`${tag} RESEND_API_KEY not configured; skipping email`);
    mails.forEach((m) => results.set(m.to, { id: null }));
    return results;
  }

  const payload = (m: { to: string; subject: string; html: string }) => ({
    from: FROM,
    to: [m.to],
    subject: m.subject,
    html: m.html,
    ...(replyTo ? { reply_to: replyTo } : {}),
    tags: [{ name: "message_id", value: messageId }],
  });

  for (let i = 0; i < mails.length; i += EMAIL_BATCH_SIZE) {
    const chunk = mails.slice(i, i + EMAIL_BATCH_SIZE);
    const res = await resendFetch(apiKey, "https://api.resend.com/emails/batch", chunk.map(payload));
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const ids: { id: string }[] = data?.data ?? [];
      chunk.forEach((m, idx) => results.set(m.to, { id: ids[idx]?.id ?? null }));
    } else {
      console.error(`${tag} batch failed ${res.status}: ${await res.text()}; falling back to single sends`);
      for (const m of chunk) {
        const single = await resendFetch(apiKey, "https://api.resend.com/emails", payload(m));
        const data = single.ok ? await single.json().catch(() => null) : null;
        if (!single.ok) console.error(`${tag} email failed for ${m.to}: ${single.status} ${await single.text()}`);
        results.set(m.to, { id: data?.id ?? null });
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

export async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        console.error("[message-delivery] worker error:", e);
      }
    }
  });
  await Promise.all(workers);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Replaces {name} placeholders. Unknown placeholders stay as they are. */
export function fillPlaceholders(text: string, vars: Record<string, unknown>, escapeHtml = false): string {
  return text.replace(/\{(\w+)\}/g, (m, name: string) => {
    if (!(name in vars) || vars[name] === null || vars[name] === undefined) return m;
    const value = String(vars[name]);
    return escapeHtml ? escape(value) : value;
  });
}

export function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
