// supabase/functions/send-auto-messages/index.ts
// Deploy: supabase functions deploy send-auto-messages
// Cron: */15 * * * * (see supabase/sql/add_auto_messages.sql)
//
// Automatische Nachrichten: evaluates the enabled auto_message_rules. For each
// rule and Termin whose end + delay has passed, the people whose status matches
// the rule (e.g. still "unexcused") get one Mitteilung (messages /
// message_recipients, delivered like send-message). One auto_message_runs row
// per rule and Termin makes the send happen at most once.
//
// Safety: a Termin is only evaluated when attendance was actually taken after
// its start (attendance.status_recorded_at, set by a trigger when an admin,
// responsible, helper or voice leader changes a status). Termine that ended
// before the rule was switched on are never sent.
//
// POST {}                                   → cron run over all enabled rules
// POST { dryRun: true, tenantId, rule }     → preview for the last Termine
//                                             (caller must be admin/responsible)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  countRecipients,
  deliverMessage,
  DeliveryPlayer,
  DeliveryRecipient,
  fillPlaceholders,
  loadMessageConfigs,
  recipientLanguages,
  toRecipient,
} from "../_shared/message-delivery.ts";
import { renderHtml, renderText, TiptapNode } from "../_shared/message-render.ts";
import { formatDate, Lang, t, tenantLanguage } from "../_shared/i18n.ts";
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

const DEFAULT_TIMEZONE = "Europe/Berlin";
const LOOKBACK_DAYS = 5;            // Termine older than this are not looked at any more
const NOT_RECORDED_GRACE_H = 48;    // wait this long after the due time for attendance to be taken
const HISTORY_LIMIT = 60;           // earlier Termine considered for streak/window
const LANGS: Lang[] = ["de", "en"];
const TEMPLATE_KEYS = ["absent", "late", "noAnswer", "streak"];

const STATUS_EXCUSED = [2, 5];

interface Rule {
  id?: string;
  tenantId: number;
  name: string;
  enabled?: boolean;
  enabled_at?: string | null;
  statuses: number[];
  type_ids: string[] | null;
  group_ids: number[] | null;
  delay_minutes: number;
  frequency: "each" | "streak" | "window";
  frequency_count: number;
  frequency_days: number;
  channels: string[];
  use_template: boolean;
  template_key: string;
  title: string | null;
  body_json: TiptapNode | null;
  allow_responses: boolean;
  instant_excuse: boolean;
  copy_responsibles: boolean;
  copy_voice_leaders: boolean;
}

interface AttendanceRow {
  id: number;
  tenantId: number;
  date: string;
  type_id: string | null;
  typeInfo: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_days: number | null;
  status_recorded_at: string | null;
}

interface AttendanceType {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean | null;
  duty_mode: boolean | null;
}

interface Person extends DeliveryPlayer {
  left: string | null;
  paused: boolean | null;
  pending: boolean | null;
}

interface PersonAttendanceRow {
  id: string;
  person_id: number;
  status: number;
  duty_state: string | null;
  person: Person | null;
}

interface Target {
  pa: PersonAttendanceRow;
  person: Person;
  count: number; // streak length incl. this Termin
}

interface Evaluation {
  recorded: boolean;
  targets: Target[];
  excused: number;
  paused: number;
}

interface TenantInfo {
  id: number;
  name: string;
  timezone: string;
}

interface Timing {
  start: Date;
  end: Date;
  localDate: string; // YYYY-MM-DD in the tenant's timezone
  startTime: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.dryRun) {
      return await preview(req, admin, body);
    }
    const result = await runAll(admin);
    return json(result);
  } catch (e) {
    console.error("[send-auto-messages] fatal:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Cron run
// ---------------------------------------------------------------------------

async function runAll(admin: SupabaseClient) {
  const startedAt = Date.now();
  const { data: rules, error } = await admin
    .from("auto_message_rules")
    .select("*")
    .eq("enabled", true);
  if (error) throw new Error(`rules query failed: ${error.message}`);

  const now = new Date();
  const tenants = new Map<number, TenantInfo>();
  let sent = 0;
  for (const rule of (rules ?? []) as Rule[]) {
    try {
      if (!tenants.has(rule.tenantId)) {
        tenants.set(rule.tenantId, await loadTenant(admin, rule.tenantId));
      }
      sent += await runRule(admin, rule as Rule & { id: string }, tenants.get(rule.tenantId)!, now);
    } catch (e) {
      console.error(`[send-auto-messages] rule=${rule.id} failed:`, e);
    }
  }
  console.log(`[send-auto-messages] rules=${rules?.length ?? 0} messages=${sent} elapsedMs=${Date.now() - startedAt}`);
  return { rules: rules?.length ?? 0, messages: sent };
}

async function runRule(admin: SupabaseClient, rule: Rule & { id: string }, tenant: TenantInfo, now: Date): Promise<number> {
  const enabledAt = rule.enabled_at ? new Date(rule.enabled_at) : now;
  const types = await loadTypes(admin, rule.tenantId);
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86400_000);
  const attendances = await loadAttendances(admin, rule, from, new Date(now.getTime() + 86400_000), 200);
  if (!attendances.length) return 0;

  const { data: runs } = await admin
    .from("auto_message_runs")
    .select("attendance_id")
    .eq("rule_id", rule.id)
    .in("attendance_id", attendances.map((a) => a.id));
  const done = new Set((runs ?? []).map((r: { attendance_id: number }) => Number(r.attendance_id)));

  let sent = 0;
  for (const att of attendances) {
    if (done.has(att.id)) continue;
    const type = att.type_id ? types.get(att.type_id) ?? null : null;
    const timing = attendanceTiming(att, type, tenant.timezone);
    if (timing.end < enabledAt) continue;
    const due = new Date(timing.end.getTime() + rule.delay_minutes * 60_000);
    if (due > now) continue;

    const recorded = isRecorded(att, timing);
    if (!recorded) {
      if (now.getTime() > due.getTime() + NOT_RECORDED_GRACE_H * 3600_000) {
        await claimRun(admin, rule, att, "not_recorded");
      }
      continue;
    }

    const evaluation = await evaluate(admin, rule, att, type, timing, types, tenant.timezone);
    if (!evaluation.targets.length) {
      await claimRun(admin, rule, att, "none");
      continue;
    }
    // Claim first: the unique (rule_id, attendance_id) stops a parallel run.
    const runId = await claimRun(admin, rule, att, "sent", evaluation.targets.length);
    if (!runId) continue;
    try {
      const messageId = await sendForTermin(admin, rule, att, type, timing, tenant, evaluation.targets);
      await admin.from("auto_message_runs").update({ message_id: messageId }).eq("id", runId);
      sent++;
    } catch (e) {
      console.error(`[send-auto-messages] send failed rule=${rule.id} att=${att.id}:`, e);
      // Release the claim so the next run retries.
      await admin.from("auto_message_runs").delete().eq("id", runId);
    }
  }
  return sent;
}

async function claimRun(admin: SupabaseClient, rule: Rule & { id: string }, att: AttendanceRow, status: string, count = 0): Promise<string | null> {
  const { data, error } = await admin
    .from("auto_message_runs")
    .insert({ rule_id: rule.id, tenantId: rule.tenantId, attendance_id: att.id, status, recipient_count: count })
    .select("id")
    .single();
  if (error) {
    if (error.code !== "23505") console.error(`[send-auto-messages] claim failed rule=${rule.id} att=${att.id}:`, error);
    return null;
  }
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function isRecorded(att: AttendanceRow, timing: Timing): boolean {
  if (!att.status_recorded_at) return false;
  // Allow a little slack: attendance taken right before the start counts.
  return new Date(att.status_recorded_at).getTime() >= timing.start.getTime() - 15 * 60_000;
}

async function evaluate(
  admin: SupabaseClient,
  rule: Rule,
  att: AttendanceRow,
  type: AttendanceType | null,
  timing: Timing,
  types: Map<string, AttendanceType>,
  timezone: string,
): Promise<Evaluation> {
  const recorded = isRecorded(att, timing);
  const { data, error } = await admin
    .from("person_attendances")
    .select("id, person_id, status, duty_state, person:person_id(id, firstName, lastName, email, appId, instrument, left, paused, pending)")
    .eq("attendance_id", att.id)
    .range(0, 4999);
  if (error) throw new Error(`person_attendances query failed: ${error.message}`);

  let excused = 0;
  let paused = 0;
  const candidates: { pa: PersonAttendanceRow; person: Person }[] = [];
  for (const pa of (data ?? []) as unknown as PersonAttendanceRow[]) {
    const person = pa.person;
    if (!person || person.left || person.pending) continue;
    if (rule.group_ids?.length && !rule.group_ids.map(Number).includes(Number(person.instrument))) continue;
    // Dienst-Modus: only assigned persons are expected.
    if (type?.duty_mode && !pa.duty_state) continue;
    if (STATUS_EXCUSED.includes(pa.status)) { excused++; continue; }
    if (!rule.statuses.includes(pa.status)) continue;
    if (person.paused) { paused++; continue; }
    candidates.push({ pa, person });
  }
  if (!recorded || !candidates.length) {
    return { recorded, targets: [], excused, paused };
  }

  const counts = await streaks(admin, rule, att, candidates.map((c) => c.person.id), types, timezone);
  const targets: Target[] = [];
  for (const c of candidates) {
    const h = counts.get(c.person.id) ?? { streak: 1, window: 1 };
    const ok = rule.frequency === "each"
      || (rule.frequency === "streak" && h.streak === rule.frequency_count)
      || (rule.frequency === "window" && h.window === rule.frequency_count);
    if (ok) targets.push({ ...c, count: h.streak });
  }
  return { recorded, targets, excused, paused };
}

/**
 * Per person: how often in a row (incl. this Termin) and how often within
 * frequency_days the status matched the rule, over earlier recorded Termine of
 * the rule's types.
 */
async function streaks(
  admin: SupabaseClient,
  rule: Rule,
  att: AttendanceRow,
  personIds: number[],
  types: Map<string, AttendanceType>,
  timezone: string,
): Promise<Map<number, { streak: number; window: number }>> {
  const result = new Map<number, { streak: number; window: number }>();
  personIds.forEach((id) => result.set(id, { streak: 1, window: 1 }));
  if (rule.frequency === "each" && !needsCount(rule)) return result;

  let query = admin
    .from("attendance")
    .select("id, tenantId, date, type_id, typeInfo, start_time, end_time, duration_days, status_recorded_at")
    .eq("tenantId", rule.tenantId)
    .lt("date", att.date)
    .not("status_recorded_at", "is", null)
    .order("date", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (rule.type_ids?.length) query = query.in("type_id", rule.type_ids);
  const { data: earlier } = await query;
  const recordedEarlier = ((earlier ?? []) as AttendanceRow[]).filter((a) =>
    isRecorded(a, attendanceTiming(a, a.type_id ? types.get(a.type_id) ?? null : null, timezone))
  );
  if (!recordedEarlier.length) return result;

  const { data: rows } = await admin
    .from("person_attendances")
    .select("attendance_id, person_id, status")
    .in("attendance_id", recordedEarlier.map((a) => a.id))
    .in("person_id", personIds)
    .range(0, 49999);
  const statusOf = new Map<string, number>();
  for (const r of (rows ?? []) as { attendance_id: number; person_id: number; status: number }[]) {
    statusOf.set(`${r.attendance_id}:${r.person_id}`, r.status);
  }

  const windowStart = new Date(att.date).getTime() - rule.frequency_days * 86400_000;
  for (const id of personIds) {
    let streak = 1;
    let broken = false;
    let window = 1;
    for (const a of recordedEarlier) { // newest first
      const status = statusOf.get(`${a.id}:${id}`);
      if (status === undefined) continue; // not part of that Termin
      const match = rule.statuses.includes(status);
      if (!broken) {
        if (match) streak++;
        else broken = true;
      }
      if (match && new Date(a.date).getTime() >= windowStart) window++;
    }
    result.set(id, { streak, window });
  }
  return result;
}

/** Whether the text shows {anzahl}, so the streak must be counted even for "each". */
function needsCount(rule: Rule): boolean {
  if (rule.use_template) return rule.template_key === "streak";
  return `${rule.title ?? ""}${JSON.stringify(rule.body_json ?? {})}`.includes("{anzahl}");
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function sendForTermin(
  admin: SupabaseClient,
  rule: Rule & { id: string },
  att: AttendanceRow,
  type: AttendanceType | null,
  timing: Timing,
  tenant: TenantInfo,
  targets: Target[],
): Promise<string> {
  const tenantLang = await tenantLanguage(admin, tenant.id);
  const shared = {
    termin: terminName(att, type),
    date: timing.localDate,
    uhrzeit: timing.startTime ?? "",
    instanz: tenant.name,
  };
  const texts = buildTexts(rule);
  const base = texts(tenantLang);
  const sharedFor = (lang: Lang) => ({ ...shared, datum: formatDate(lang, shared.date) });

  const configs = await loadMessageConfigs(admin, tenant.id, targets.map((x) => x.person.appId ?? ""));
  const recipients = targets.map((x) => toRecipient(x.person, configs));
  const targetOf = new Map<DeliveryRecipient, Target>();
  recipients.forEach((r, i) => targetOf.set(r, targets[i]));
  const langOf = await recipientLanguages(admin, tenant.id, recipients);
  const channels = { push: rule.channels.includes("push"), email: rule.channels.includes("email") };
  const senderName = t(tenantLang, "auto.sender", { rule: rule.name });

  const { data: message, error } = await admin
    .from("messages")
    .insert({
      tenantId: tenant.id,
      sender_id: "system",
      sender_name: senderName,
      title: fillPlaceholders(base.title, sharedFor(tenantLang)),
      body_json: base.doc,
      body_html: fillPlaceholders(renderHtml(base.doc), sharedFor(tenantLang), true),
      body_text: fillPlaceholders(renderText(base.doc), sharedFor(tenantLang)),
      channels: [channels.push ? "push" : null, channels.email ? "email" : null].filter(Boolean),
      group_ids: rule.group_ids,
      recipient_count: recipients.length,
      status: "sending",
      auto_rule_id: rule.id,
      attendance_id: att.id,
      allow_responses: rule.allow_responses,
      vars: shared,
      i18n: rule.use_template
        ? Object.fromEntries(LANGS.map((lang) => {
          const x = texts(lang);
          return [lang, { title: x.title, html: renderHtml(x.doc), text: renderText(x.doc) }];
        }))
        : null,
    })
    .select("id")
    .single();
  if (error || !message) throw new Error(`insert message failed: ${error?.message}`);
  const messageId = message.id as string;

  const personal = (x: Target) => ({
    vorname: x.person.firstName ?? "",
    name: `${x.person.firstName ?? ""} ${x.person.lastName ?? ""}`.trim(),
    anzahl: x.count,
  });
  const rows = recipients.map((r) => {
    const x = targetOf.get(r)!;
    return {
      message_id: messageId,
      tenantId: tenant.id,
      player_id: x.person.id,
      user_id: r.userId,
      name: `${x.person.firstName ?? ""} ${x.person.lastName ?? ""}`.trim(),
      group_id: x.person.instrument,
      email: channels.email ? r.email : null,
      push_enabled: channels.push && !!r.config,
      person_attendance_id: x.pa.id,
      vars: personal(x),
      lang: rule.use_template ? langOf(r) : null,
    };
  });
  const { error: recErr } = await admin.from("message_recipients").insert(rows);
  if (recErr) {
    await admin.from("messages").delete().eq("id", messageId);
    throw new Error(`insert recipients failed: ${recErr.message}`);
  }

  const counts = countRecipients(recipients, channels);
  console.log(`[send-auto-messages] rule=${rule.id} att=${att.id} message=${messageId} recipients=${recipients.length} push=${counts.push} email=${counts.email}`);

  await deliverMessage(admin, {
    messageId,
    tenantId: tenant.id,
    tenantName: tenant.name,
    senderName,
    replyTo: null,
    recipients,
    channels,
    render: (r, lang) => {
      const x = texts(rule.use_template ? lang : tenantLang);
      const vars = { ...sharedFor(lang), ...personal(targetOf.get(r)!) };
      return {
        title: fillPlaceholders(x.title, vars),
        bodyText: fillPlaceholders(renderText(x.doc), vars),
        emailHtml: fillPlaceholders(renderHtml(x.doc, { email: true }), vars, true),
      };
    },
    logTag: "[send-auto-messages]",
  });

  if (rule.copy_responsibles || rule.copy_voice_leaders) {
    try {
      await sendSummaries(admin, rule, att, tenant, sharedFor, targets);
    } catch (e) {
      console.error(`[send-auto-messages] summaries failed rule=${rule.id}:`, e);
    }
  }
  return messageId;
}

/** Title + Tiptap doc of the rule's text in a language. */
function buildTexts(rule: Rule): (lang: Lang) => { title: string; doc: TiptapNode } {
  if (!rule.use_template && rule.title && rule.body_json?.type === "doc") {
    const custom = { title: rule.title, doc: rule.body_json };
    return () => custom;
  }
  const key = TEMPLATE_KEYS.includes(rule.template_key) ? rule.template_key : "absent";
  return (lang: Lang) => ({
    title: t(lang, `auto.tpl.${key}.title`),
    doc: textToDoc(t(lang, `auto.tpl.${key}.body`)),
  });
}

function textToDoc(text: string): TiptapNode {
  return {
    type: "doc",
    content: text.split(/\n\n+/).map((para) => ({
      type: "paragraph",
      content: para.split("\n").flatMap((line, i) => [
        ...(i > 0 ? [{ type: "hardBreak" }] : []),
        ...(line ? [{ type: "text", text: line }] : []),
      ]),
    })),
  } as TiptapNode;
}

function terminName(att: AttendanceRow, type: AttendanceType | null): string {
  return (att.typeInfo || type?.name || "").trim();
}

/**
 * Optional copy: one summary per Termin to admins/responsibles (everyone
 * contacted) and/or voice leaders (only people of their group).
 */
async function sendSummaries(
  admin: SupabaseClient,
  rule: Rule & { id: string },
  att: AttendanceRow,
  tenant: TenantInfo,
  sharedFor: (lang: Lang) => Record<string, unknown>,
  targets: Target[],
): Promise<void> {
  const roles = [
    ...(rule.copy_responsibles ? [1, 5] : []),
    ...(rule.copy_voice_leaders ? [8, 9] : []),
  ];
  const { data: users } = await admin
    .from("tenantUsers")
    .select("userId, role")
    .eq("tenantId", tenant.id)
    .in("role", roles)
    .range(0, 4999);
  const list = (users ?? []) as { userId: string; role: number }[];
  if (!list.length) return;

  // Group of each voice leader (their own player entry in this tenant).
  const leaderIds = list.filter((u) => u.role === 8 || u.role === 9).map((u) => u.userId);
  const leaderGroup = new Map<string, number>();
  if (leaderIds.length) {
    const { data: players } = await admin
      .from("player")
      .select("appId, instrument")
      .eq("tenantId", tenant.id)
      .in("appId", leaderIds);
    for (const p of players ?? []) leaderGroup.set(String(p.appId), Number(p.instrument));
  }

  const configs = await loadMessageConfigs(admin, tenant.id, list.map((u) => u.userId));
  const { data: langs } = await admin.from("notifications").select("id, language").in("id", list.map((u) => u.userId));
  const langMap = new Map<string, string>((langs ?? []).map((l: { id: string; language: string }) => [l.id, l.language]));
  const tenantLang = await tenantLanguage(admin, tenant.id);
  const seen = new Set<string>();

  for (const u of list) {
    if (seen.has(u.userId)) continue;
    seen.add(u.userId);
    const isLeader = u.role === 8 || u.role === 9;
    const mine = isLeader ? targets.filter((x) => Number(x.person.instrument) === leaderGroup.get(u.userId)) : targets;
    if (!mine.length) continue;
    const lang = (["de", "en"].includes(String(langMap.get(u.userId))) ? langMap.get(u.userId) : tenantLang) as Lang;
    const names = mine.map((x) => `${x.person.firstName ?? ""} ${x.person.lastName ?? ""}`.trim()).join(", ");
    const title = t(lang, "auto.summary.title", { ...sharedFor(lang), count: mine.length });
    const body = t(lang, "auto.summary.body", { rule: rule.name, names });
    const data = { type: "attendance", attendanceId: String(att.id), tenantId: String(tenant.id) };
    const channels: string[] = [];
    const config = configs.get(u.userId);
    if (config?.push_enabled) {
      const sent = await sendPushToUser(admin, u.userId, { title, body, data }).catch(() => 0);
      if (sent > 0) channels.push("push");
    }
    await logNotification(admin, { userId: u.userId, tenantId: tenant.id, type: "attendance", title, body, channels, data });
  }
}

// ---------------------------------------------------------------------------
// Preview (dry run from the rule editor)
// ---------------------------------------------------------------------------

async function preview(req: Request, admin: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);

  const tenantId = Number(body.tenantId);
  const { data: membership } = await admin
    .from("tenantUsers")
    .select("role")
    .eq("tenantId", tenantId)
    .eq("userId", userData.user.id)
    .in("role", [1, 5])
    .limit(1)
    .maybeSingle();
  if (!membership) return json({ error: "Forbidden" }, 403);

  const input = (body.rule ?? {}) as Partial<Rule>;
  const rule: Rule = {
    tenantId,
    name: String(input.name ?? ""),
    statuses: (input.statuses ?? [4]).map(Number),
    type_ids: input.type_ids?.length ? input.type_ids.map(String) : null,
    group_ids: input.group_ids?.length ? input.group_ids.map(Number) : null,
    delay_minutes: Number(input.delay_minutes ?? 120),
    frequency: (input.frequency ?? "each") as Rule["frequency"],
    frequency_count: Number(input.frequency_count ?? 2),
    frequency_days: Number(input.frequency_days ?? 30),
    channels: input.channels ?? ["push"],
    use_template: input.use_template !== false,
    template_key: String(input.template_key ?? "absent"),
    title: input.title ?? null,
    body_json: (input.body_json ?? null) as TiptapNode | null,
    allow_responses: input.allow_responses !== false,
    instant_excuse: !!input.instant_excuse,
    copy_responsibles: !!input.copy_responsibles,
    copy_voice_leaders: !!input.copy_voice_leaders,
  };

  const tenant = await loadTenant(admin, tenantId);
  const types = await loadTypes(admin, tenantId);
  const now = new Date();
  const candidates = await loadAttendances(admin, rule, new Date(now.getTime() - 60 * 86400_000), now, 20);
  const past = candidates
    .map((att) => ({ att, type: att.type_id ? types.get(att.type_id) ?? null : null }))
    .map((x) => ({ ...x, timing: attendanceTiming(x.att, x.type, tenant.timezone) }))
    .filter((x) => x.timing.end <= now)
    .sort((a, b) => b.timing.end.getTime() - a.timing.end.getTime())
    .slice(0, 3);

  const termine = [];
  for (const x of past) {
    const ev = await evaluate(admin, rule, x.att, x.type, x.timing, types, tenant.timezone);
    const channels = { push: rule.channels.includes("push"), email: rule.channels.includes("email") };
    let counts = { recipients: 0, push: 0, email: 0, unreachable: 0 };
    if (ev.targets.length) {
      const configs = await loadMessageConfigs(admin, tenantId, ev.targets.map((t) => t.person.appId ?? ""));
      counts = countRecipients(ev.targets.map((t) => toRecipient(t.person, configs)), channels);
    }
    termine.push({
      attendanceId: x.att.id,
      title: terminName(x.att, x.type),
      date: x.timing.localDate,
      startTime: x.timing.startTime,
      sendAt: new Date(x.timing.end.getTime() + rule.delay_minutes * 60_000).toISOString(),
      recorded: ev.recorded,
      people: ev.targets.map((t) => ({
        id: t.person.id,
        name: `${t.person.firstName ?? ""} ${t.person.lastName ?? ""}`.trim(),
        groupId: t.person.instrument,
        count: t.count,
        email: !!toRecipient(t.person, new Map()).email,
        app: !!t.person.appId,
      })),
      excused: ev.excused,
      paused: ev.paused,
      counts,
    });
  }
  return json({ termine });
}

// ---------------------------------------------------------------------------
// Data + time helpers
// ---------------------------------------------------------------------------

async function loadTenant(admin: SupabaseClient, tenantId: number): Promise<TenantInfo> {
  const { data } = await admin.from("tenants").select("id, longName, shortName, timezone").eq("id", tenantId).single();
  return {
    id: tenantId,
    name: (data?.longName || data?.shortName || "Attendix") as string,
    timezone: (data?.timezone || DEFAULT_TIMEZONE) as string,
  };
}

async function loadTypes(admin: SupabaseClient, tenantId: number): Promise<Map<string, AttendanceType>> {
  const { data } = await admin
    .from("attendance_types")
    .select("id, name, start_time, end_time, all_day, duty_mode")
    .eq("tenant_id", tenantId);
  return new Map(((data ?? []) as AttendanceType[]).map((x) => [String(x.id), x]));
}

async function loadAttendances(admin: SupabaseClient, rule: Rule, from: Date, to: Date, limit: number): Promise<AttendanceRow[]> {
  let query = admin
    .from("attendance")
    .select("id, tenantId, date, type_id, typeInfo, start_time, end_time, duration_days, status_recorded_at")
    .eq("tenantId", rule.tenantId)
    .gte("date", new Date(from.getTime() - 86400_000).toISOString())
    .lte("date", to.toISOString())
    .order("date", { ascending: false })
    .limit(limit);
  if (rule.type_ids?.length) query = query.in("type_id", rule.type_ids);
  const { data, error } = await query;
  if (error) throw new Error(`attendance query failed: ${error.message}`);
  return (data ?? []) as AttendanceRow[];
}

/** Start and end of a Termin as instants, from its local date and times. */
function attendanceTiming(att: AttendanceRow, type: AttendanceType | null, timezone: string): Timing {
  const localDate = localDateOf(att.date, timezone);
  const [y, m, d] = localDate.split("-").map(Number);
  const startTime = validTime(att.start_time) ?? validTime(type?.start_time) ?? null;
  const endTime = validTime(att.end_time) ?? validTime(type?.end_time) ?? null;
  const days = Math.max(1, Number(att.duration_days) || 1);
  const allDay = !!type?.all_day || (!startTime && !endTime);

  const start = startTime && !allDay
    ? zonedToUtc(y, m, d, ...splitTime(startTime), timezone)
    : zonedToUtc(y, m, d, 0, 0, timezone);
  let end: Date;
  if (allDay) {
    end = zonedToUtc(y, m, d + days, 0, 0, timezone);
  } else if (endTime) {
    end = zonedToUtc(y, m, d + days - 1, ...splitTime(endTime), timezone);
    if (end <= start) end = new Date(end.getTime() + 86400_000); // ends after midnight
  } else {
    end = new Date(start.getTime() + 2 * 3600_000);
  }
  return { start, end, localDate, startTime: allDay ? null : startTime };
}

function validTime(value: string | null | undefined): string | null {
  return value && /^\d{1,2}:\d{2}/.test(value) ? value.slice(0, 5) : null;
}

function splitTime(value: string): [number, number] {
  const [h, m] = value.split(":").map(Number);
  return [h, m];
}

function localDateOf(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return parts; // en-CA formats as YYYY-MM-DD
}

function tzOffsetMs(instant: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(instant / 1000) * 1000;
}

/** Wall-clock time in a timezone → instant (Date.UTC handles day overflow). */
function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, timezone: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let result = guess - tzOffsetMs(guess, timezone);
  const second = guess - tzOffsetMs(result, timezone);
  if (second !== result) result = second;
  return new Date(result);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
