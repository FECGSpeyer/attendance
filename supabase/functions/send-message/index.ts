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
//   Optional playerIds: number[] (instead of groupIds) + attendanceId: the
//   "Unentschuldigte anschreiben" message of a Termin; allowResponses lets the
//   recipients answer with a reason / "I was there" (attendance-response).
//
// Per-recipient delivery and read state is tracked in message_recipients;
// email delivered/opened/bounced events arrive via the resend-webhook function.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  countRecipients,
  deliverMessage,
  DeliveryPlayer,
  DeliveryRecipient,
  loadMessageConfigs,
  toRecipient,
} from "../_shared/message-delivery.ts";
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
const MAX_TITLE = 200;
const MAX_CONTENT_BYTES = 100_000;

type Recipient = DeliveryRecipient;

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
    const playerIds: number[] | null = Array.isArray(body?.playerIds) && body.playerIds.length > 0
      ? body.playerIds.map(Number).filter((n: number) => Number.isFinite(n)).slice(0, 5000)
      : null;
    const attendanceId = Number(body?.attendanceId) || null;
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

    if (attendanceId) {
      const { data: att } = await admin.from("attendance").select("tenantId").eq("id", attendanceId).maybeSingle();
      if (!att || Number(att.tenantId) !== tenantId) {
        return json({ error: "Invalid attendanceId" }, 400);
      }
    }

    const recipients = await resolveRecipients(admin, tenantId, groupIds, playerIds);
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
        attendance_id: attendanceId,
        allow_responses: !!attendanceId && body?.allowResponses === true,
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

    const paByPlayer = new Map<number, string>();
    if (attendanceId) {
      const { data: pas } = await admin.from("person_attendances").select("id, person_id")
        .eq("attendance_id", attendanceId).range(0, 4999);
      for (const pa of pas ?? []) paByPlayer.set(Number(pa.person_id), pa.id as string);
    }
    const rows = recipients.map((r) => ({
      person_attendance_id: paByPlayer.get(r.player.id) ?? null,
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

    const emailHtml = renderHtml(content, { email: true });
    const delivery = deliverMessage(admin, {
      messageId,
      tenantId,
      tenantName,
      senderName,
      replyTo: caller.email ?? null,
      recipients,
      channels,
      // The message is the sender's text and is not translated.
      render: () => ({ title, bodyText, emailHtml }),
      logTag: "[send-message]",
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
  playerIds: number[] | null = null,
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
  if (playerIds) {
    query = query.in("id", playerIds);
  } else if (groupIds) {
    query = query.in("instrument", groupIds);
  }
  const { data: players, error } = await query;
  if (error) {
    throw new Error(`player query failed: ${error.message}`);
  }

  const list = (players ?? []) as DeliveryPlayer[];
  const configs = await loadMessageConfigs(admin, tenantId, list.map((p) => p.appId ?? ""));
  return list.map((p) => toRecipient(p, configs));
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
