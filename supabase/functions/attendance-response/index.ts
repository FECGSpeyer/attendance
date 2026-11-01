// supabase/functions/attendance-response/index.ts
// Deploy: supabase functions deploy attendance-response
//
// Answers to a Termin message (automatic message or "Unentschuldigte
// anschreiben"): the member adds a reason or says "I was there"; admins and
// responsibles confirm or reject. Writes go through here so the status change,
// the note on the Termin and the notifications stay consistent.
//
// POST { action: "submit", messageId, kind: "reason" | "was_present", reasonCode?, text? }
// POST { action: "decide", responseId, accept: boolean }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatDate, Lang, normalizeLang, t, tenantLanguage } from "../_shared/i18n.ts";
import { sendPushToUser } from "../_shared/send-push.ts";
import { logNotification } from "../_shared/log-notification.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const RESPONSE_DAYS = 7;
const REASONS = ["sick", "work", "family", "forgot", "other"];
const MAX_TEXT = 500;
const STATUS_PRESENT = 1;
const STATUS_EXCUSED = 2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => null);
    if (body?.action === "submit") return await submit(admin, userData.user.id, body);
    if (body?.action === "decide") return await decide(admin, userData.user.id, body);
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[attendance-response] fatal:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function submit(admin: SupabaseClient, userId: string, body: Record<string, unknown>): Promise<Response> {
  const messageId = String(body.messageId ?? "");
  const kind = body.kind === "was_present" ? "was_present" : body.kind === "reason" ? "reason" : null;
  if (!messageId || !kind) return json({ error: "Invalid request" }, 400);
  const reasonCode = kind === "reason" ? String(body.reasonCode ?? "other") : null;
  if (reasonCode && !REASONS.includes(reasonCode)) return json({ error: "Invalid reason" }, 400);
  const text = String(body.text ?? "").trim().slice(0, MAX_TEXT);

  const { data: message } = await admin
    .from("messages")
    .select("id, tenantId, attendance_id, allow_responses, auto_rule_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!message?.attendance_id || !message.allow_responses) return json({ error: "Responses not allowed" }, 403);

  const { data: recipient } = await admin
    .from("message_recipients")
    .select("player_id, person_attendance_id, name")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!recipient?.person_attendance_id) return json({ error: "Not a recipient" }, 403);

  const { data: att } = await admin
    .from("attendance")
    .select("id, date, typeInfo, type_id, tenantId")
    .eq("id", message.attendance_id)
    .single();
  if (!att) return json({ error: "Termin not found" }, 404);
  if (Date.now() > new Date(att.date).getTime() + (RESPONSE_DAYS + 1) * 86400_000) {
    return json({ error: "expired" }, 409);
  }

  const { data: existing } = await admin
    .from("attendance_responses")
    .select("id, state")
    .eq("person_attendance_id", recipient.person_attendance_id)
    .maybeSingle();
  if (existing && existing.state !== "pending") return json({ error: "alreadyDecided" }, 409);

  let instant = false;
  if (kind === "reason" && message.auto_rule_id) {
    const { data: rule } = await admin.from("auto_message_rules").select("instant_excuse").eq("id", message.auto_rule_id).maybeSingle();
    instant = !!rule?.instant_excuse;
  }

  const tenantId = Number(message.tenantId);
  const tenantLang = await tenantLanguage(admin, tenantId);
  const reasonLabel = reasonCode ? t(tenantLang, `resp.reason.${reasonCode}`) : "";
  const note = kind === "reason" ? [reasonLabel, text].filter(Boolean).join(": ") : "";

  const row = {
    tenantId,
    attendance_id: att.id,
    person_attendance_id: recipient.person_attendance_id,
    player_id: recipient.player_id,
    user_id: userId,
    message_id: messageId,
    kind,
    reason_code: reasonCode,
    text: text || null,
    state: instant ? "accepted" : "pending",
    decided_by: instant ? "system" : null,
    decided_at: instant ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
  };
  const { data: saved, error } = await admin
    .from("attendance_responses")
    .upsert(row, { onConflict: "person_attendance_id" })
    .select("id, state")
    .single();
  if (error) {
    console.error("[attendance-response] save failed:", error);
    return json({ error: "Could not save" }, 500);
  }

  // The reason always lands as a note on the Termin.
  if (kind === "reason") {
    const update: Record<string, unknown> = { notes: note, changed_at: new Date().toISOString() };
    if (instant) update.status = STATUS_EXCUSED;
    await admin.from("person_attendances").update(update).eq("id", recipient.person_attendance_id);
  }

  const termin = await terminName(admin, att);
  await notifyManagers(admin, tenantId, att, termin, recipient.name ?? "", kind, note, instant);
  console.log(`[attendance-response] submit message=${messageId} att=${att.id} kind=${kind} instant=${instant}`);
  return json({ id: saved.id, state: saved.state });
}

async function decide(admin: SupabaseClient, userId: string, body: Record<string, unknown>): Promise<Response> {
  const responseId = String(body.responseId ?? "");
  const accept = body.accept === true;
  const { data: response } = await admin
    .from("attendance_responses")
    .select("*")
    .eq("id", responseId)
    .maybeSingle();
  if (!response) return json({ error: "Not found" }, 404);

  const { data: membership } = await admin
    .from("tenantUsers")
    .select("role")
    .eq("tenantId", response.tenantId)
    .eq("userId", userId)
    .in("role", [1, 5])
    .limit(1)
    .maybeSingle();
  if (!membership) return json({ error: "Forbidden" }, 403);
  if (response.state !== "pending") return json({ error: "alreadyDecided" }, 409);

  const deciderName = await playerName(admin, Number(response.tenantId), userId);
  const now = new Date().toISOString();
  const { error } = await admin
    .from("attendance_responses")
    .update({ state: accept ? "accepted" : "rejected", decided_by: userId, decided_by_name: deciderName, decided_at: now })
    .eq("id", responseId)
    .eq("state", "pending");
  if (error) return json({ error: "Could not save" }, 500);

  if (accept) {
    await admin.from("person_attendances")
      .update({ status: response.kind === "was_present" ? STATUS_PRESENT : STATUS_EXCUSED, changed_by: userId, changed_at: now })
      .eq("id", response.person_attendance_id);
  }

  if (response.user_id) {
    const { data: att } = await admin.from("attendance").select("id, date, typeInfo, type_id, tenantId").eq("id", response.attendance_id).single();
    if (att) {
      const { data: noti } = await admin.from("notifications").select("enabled, push_enabled, language").eq("id", response.user_id).maybeSingle();
      const lang: Lang = noti?.language ? normalizeLang(noti.language) : await tenantLanguage(admin, Number(att.tenantId));
      const vars = { termin: await terminName(admin, att), datum: formatDate(lang, att.date) };
      const title = t(lang, accept ? "resp.member.accepted.title" : "resp.member.rejected.title");
      const text = accept
        ? t(lang, response.kind === "was_present" ? "resp.member.accepted.wasPresent" : "resp.member.accepted.reason", vars)
        : t(lang, "resp.member.rejected.body", vars);
      const data = { type: "attendance", attendanceId: String(att.id), tenantId: String(att.tenantId) };
      const channels: string[] = [];
      if (noti?.enabled && noti.push_enabled) {
        const sent = await sendPushToUser(admin, response.user_id, { title, body: text, data }).catch(() => 0);
        if (sent > 0) channels.push("push");
      }
      await logNotification(admin, { userId: response.user_id, tenantId: Number(att.tenantId), type: "attendance", title, body: text, channels, data });
    }
  }
  console.log(`[attendance-response] decide response=${responseId} accept=${accept}`);
  return json({ state: accept ? "accepted" : "rejected" });
}

/** Push + notification-center entry for admins/responsibles with signout notifications on. */
async function notifyManagers(
  admin: SupabaseClient,
  tenantId: number,
  att: { id: number; date: string },
  termin: string,
  name: string,
  kind: string,
  note: string,
  instant: boolean,
): Promise<void> {
  const { data: users } = await admin
    .from("tenantUsers")
    .select("userId")
    .eq("tenantId", tenantId)
    .in("role", [1, 5])
    .range(0, 4999);
  const ids = Array.from(new Set((users ?? []).map((u: { userId: string }) => u.userId)));
  if (!ids.length) return;
  const { data: configs } = await admin
    .from("notifications")
    .select("id, enabled, push_enabled, signouts, enabled_tenants, language")
    .in("id", ids);
  const tenantLang = await tenantLanguage(admin, tenantId);
  for (const c of (configs ?? []) as { id: string; enabled: boolean; push_enabled: boolean | null; signouts: boolean | null; enabled_tenants: number[] | null; language: string | null }[]) {
    if (!c.enabled || !c.signouts) continue;
    if (c.enabled_tenants?.length && !c.enabled_tenants.map(Number).includes(tenantId)) continue;
    const lang = c.language ? normalizeLang(c.language) : tenantLang;
    const vars = { name, termin, datum: formatDate(lang, att.date), reason: note };
    const text = t(lang, kind === "was_present" ? "resp.manager.wasPresent" : instant ? "resp.manager.instant" : "resp.manager.reason", vars);
    const data = { type: "attendance", attendanceId: String(att.id), tenantId: String(tenantId) };
    const channels: string[] = [];
    if (c.push_enabled) {
      const sent = await sendPushToUser(admin, c.id, { title: termin, body: text, data }).catch(() => 0);
      if (sent > 0) channels.push("push");
    }
    await logNotification(admin, { userId: c.id, tenantId, type: "attendance", title: termin, body: text, channels, data });
  }
}

async function terminName(admin: SupabaseClient, att: { typeInfo?: string | null; type_id?: string | null }): Promise<string> {
  if (att.typeInfo) return att.typeInfo;
  if (!att.type_id) return "";
  const { data } = await admin.from("attendance_types").select("name").eq("id", att.type_id).maybeSingle();
  return (data?.name ?? "") as string;
}

async function playerName(admin: SupabaseClient, tenantId: number, userId: string): Promise<string> {
  const { data } = await admin.from("player").select("firstName, lastName").eq("tenantId", tenantId).eq("appId", userId).limit(1).maybeSingle();
  return data ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() : "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
