import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  applySelfStatus,
  berlinNow,
  loadAttendanceRules,
  reasonsOf,
  STATUS_NEUTRAL,
} from '../_shared/self-status.ts';

// Bridge for the Gemeinde App (FECG Speyer, FECG Schwegenheim). Auth: header x-gemeinde-app-key,
// of which tenant_groups stores only the SHA-256.
//
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   ORG plans with "Beamer-Datei nötig" per row
//                                      (default: today until 8 weeks ahead), plus the
//                                      20 most recent plans before `from` (past: true).
//                                      Also `ensembles` (the org's tenants) and `events`
//                                      (every Termin of those tenants in [from, to], any
//                                      type, with its Attendix link) so the Gemeinde App
//                                      can link its calendar entries to them.
// POST { action: 'point', plan, field, file }   SongBeamer file of a Programmpunkt
// POST { action: 'song', songId, file }         SongBeamer file of a Werk
//   file = { name, path } or null to remove it. Points are written through the SQL function
//   fecg_set_beamer_file (supabase/sql/add_gemeinde_app_write.sql), so a concurrent save in
//   Attendix keeps the file.
//
// Attendance card in the Gemeinde App group chats (2026-11-21):
// POST { action: 'persons' }                      active persons of all the org's tenants, so
//                                                 the Gemeinde App can link them to its members
//                                                 (email and Microsoft oid of the account, if any).
// POST { action: 'attendance', attendanceId }     one Termin with deadline, allowed statuses,
//                                                 reasons and every person's status.
// POST { action: 'status', attendanceId, personId, status: 'present' | 'late' | 'excused', reason? }
//                                                 the same as a self sign-in / sign-out in Attendix
//                                                 (same rules, same notification via quick-processor).
//                                                 A person needs no Attendix account for this.
// POST { action: 'groups', ensembleId }          groups (voices/instruments) of one tenant, for
//                                                 creating a person from the Gemeinde App.
// POST { action: 'create_person', ensembleId, groupId, firstName, lastName, email? }
//                                                 adds a person without creating an account and without
//                                                 any email. If an Attendix account with that email exists,
//                                                 the person is linked to it right away. An active person
//                                                 with the same email or account is returned instead
//                                                 (existing: true). The person is added to all upcoming
//                                                 Termine like in Attendix.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

interface BeamerFile { name: string; path: string; linkedAt?: string }

interface FieldSelection {
  id: string;
  uid?: string;
  name: string;
  time: string;
  conductor?: string;
  info?: string;
  songId?: number;
  isGroup?: boolean;
  groupId?: string;
  needsBeamer?: boolean;
  beamerFile?: BeamerFile;
}

interface Plan { time?: string; end?: string; title?: string; label?: string; day?: number; fields?: FieldSelection[] }

const PAST_PLANS_LIMIT = 20;
const EVENTS_LIMIT = 2000;
const AGENDA_ITEMS_PLACEHOLDER_ID = 'agenda-items-placeholder';
const AUTO_BEAMER_WORDS = /lied|gedicht/i;

// Same rule as src/app/utilities/plan-beamer.ts, keep both in sync.
function needsBeamer(f: FieldSelection): boolean {
  if (f.id.includes('noteFld') || f.isGroup || f.id === AGENDA_ITEMS_PLACEHOLDER_ID) { return false; }
  return f.needsBeamer ?? (!!f.songId || AUTO_BEAMER_WORDS.test(f.name ?? ''));
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function validDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Rows saved before the link have no uid yet; fall back to id plus occurrence. */
function rowUid(f: FieldSelection, seen: Map<string, number>): string {
  if (f.uid) { return f.uid; }
  const n = (seen.get(f.id) ?? 0) + 1;
  seen.set(f.id, n);
  return n > 1 ? `${f.id}#${n}` : f.id;
}

function mapFields(fields: FieldSelection[], beamerActive: boolean, songFiles: Map<number, BeamerFile>) {
  const seen = new Map<string, number>();
  return fields.map(f => ({
    uid: rowUid(f, seen),
    name: f.name,
    minutes: f.isGroup ? 0 : (Number(f.time) || 0),
    conductor: f.conductor || null,
    info: f.info || null,
    note: f.id.includes('noteFld'),
    isGroup: !!f.isGroup,
    groupUid: f.groupId ?? null,
    songId: f.songId ?? null,
    needsBeamer: beamerActive && needsBeamer(f),
    beamerFile: f.beamerFile ?? null,
    songBeamerFile: f.songId ? songFiles.get(f.songId) ?? null : null,
  }));
}

interface Org {
  id: number;
  name: string;
  beamer_files_enabled: boolean;
  logo_url?: string | null;
  branding_text?: string | null;
}

interface Branding { logoUrl: string | null; text: string | null }

/** Same source as DbService.getBrandingSource: the organisation, else the tenant. */
function branding(org: Org, tenant?: { logo_url?: string | null; branding_text?: string | null }): Branding | null {
  const source = org.logo_url || org.branding_text ? org : tenant;
  if (!source?.logo_url && !source?.branding_text?.trim()) { return null; }
  return { logoUrl: source.logo_url || null, text: source.branding_text?.trim() || null };
}

async function orgForKey(req: Request): Promise<Org | null> {
  const key = req.headers.get('x-gemeinde-app-key');
  if (!key || !key.startsWith('atx_')) { return null; }
  const { data } = await supabase
    .from('tenant_groups')
    .select('id, name, beamer_files_enabled, logo_url, branding_text')
    .eq('gemeinde_app_key_hash', await sha256(key))
    .eq('fecg_link_enabled', true)
    .maybeSingle();
  return (data as Org | null) ?? null;
}

async function orgTenantIds(orgId: number): Promise<number[]> {
  const { data } = await supabase.from('tenant_group_tenants').select('tenant_id').eq('tenant_group', orgId);
  return (data ?? []).map((t: any) => t.tenant_id);
}

/** { name, path } of an .sng, or null; anything else is rejected (undefined). */
function parseFile(raw: unknown): BeamerFile | null | undefined {
  if (raw === null) { return null; }
  if (!raw || typeof raw !== 'object') { return undefined; }
  const { name, path } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || typeof path !== 'string') { return undefined; }
  const n = name.trim();
  const p = path.trim();
  if (!n || n.length > 200 || !p || p.length > 400 || !/\.sng$/i.test(p)) { return undefined; }
  return { name: n, path: p, linkedAt: new Date().toISOString() };
}

async function handleWrite(req: Request, org: Org): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (body.action === 'persons') { return handlePersons(org); }
  if (body.action === 'attendance') { return handleAttendance(org, body); }
  if (body.action === 'status') { return handleStatus(org, body); }
  if (body.action === 'groups') { return handleGroups(org, body); }
  if (body.action === 'create_person') { return handleCreatePerson(org, body); }
  const file = parseFile(body.file);
  if (file === undefined) {
    return json({ error: 'invalid_file' }, 400);
  }
  const tenantIds = await orgTenantIds(org.id);

  if (body.action === 'song') {
    const songId = Number(body.songId);
    if (!Number.isInteger(songId) || !tenantIds.length) { return json({ error: 'not_found' }, 404); }
    const { data, error } = await supabase
      .from('songs')
      .update({ beamer_file: file })
      .eq('id', songId)
      .in('tenantId', tenantIds)
      .select('id');
    if (error) {
      console.error('fecg-bridge song write failed', error);
      return json({ error: 'write_failed' }, 500);
    }
    return data?.length ? json({ ok: true, file }) : json({ error: 'not_found' }, 404);
  }

  if (body.action !== 'point') {
    return json({ error: 'invalid_action' }, 400);
  }
  const planUid = String(body.plan ?? '');
  const fieldUid = String(body.field ?? '');
  if (!fieldUid || fieldUid.length > 80) { return json({ error: 'not_found' }, 404); }

  let args: { p_attendance_id: number | null; p_plan_index: number; p_shared_plan_id: string | null };
  const att = /^att-(\d+)-(\d+)$/.exec(planUid);
  if (att) {
    const { data: row } = await supabase
      .from('attendance')
      .select('id, tenantId, is_org_plan')
      .eq('id', Number(att[1]))
      .maybeSingle();
    if (!row || !row.is_org_plan || !tenantIds.includes(row.tenantId)) { return json({ error: 'not_found' }, 404); }
    args = { p_attendance_id: row.id, p_plan_index: Number(att[2]), p_shared_plan_id: null };
  } else if (planUid.startsWith('adhoc-')) {
    const { data: row } = await supabase
      .from('shared_plans')
      .select('id, org_id')
      .eq('id', planUid.slice('adhoc-'.length))
      .maybeSingle();
    if (!row || row.org_id !== org.id) { return json({ error: 'not_found' }, 404); }
    args = { p_attendance_id: null, p_plan_index: 0, p_shared_plan_id: row.id };
  } else {
    return json({ error: 'not_found' }, 404);
  }

  const { data: ok, error } = await supabase.rpc('fecg_set_beamer_file', {
    ...args,
    p_field_uid: fieldUid,
    p_file: file,
  });
  if (error) {
    console.error('fecg-bridge point write failed', error);
    return json({ error: 'write_failed' }, 500);
  }
  return ok ? json({ ok: true, file }) : json({ error: 'not_found' }, 404);
}

// ---------------------------------------------------------------------------
// Attendance card (Gemeinde App group chats)

// Status values, rules and the self sign-in / sign-out live in ../_shared/self-status.ts
// (shared with the Telegram card in attendix-bot).

async function handlePersons(org: Org): Promise<Response> {
  const tenantIds = await orgTenantIds(org.id);
  if (!tenantIds.length) { return json({ persons: [] }); }
  const { data, error } = await supabase
    .from('player')
    .select('id, tenantId, firstName, lastName, email, appId, instrument, pending, left')
    .in('tenantId', tenantIds)
    .is('left', null)
    .limit(5000);
  if (error) {
    console.error('fecg-bridge persons failed', error);
    return json({ error: 'load_failed' }, 500);
  }
  const rows = ((data ?? []) as any[]).filter(p => !p.pending);

  // Group names for the admin list ("Klarinette").
  const groupIds = [...new Set(rows.map(p => p.instrument).filter((x: unknown) => x != null))];
  const groupNames = new Map<number, string>();
  if (groupIds.length) {
    const { data: groups } = await supabase.from('instruments').select('id, name').in('id', groupIds);
    (groups ?? []).forEach((g: any) => groupNames.set(g.id, g.name));
  }

  // Account email and Microsoft oid (Teams sign-in) for the automatic link.
  // One page of 1000 accounts per call instead of one call per account (the per-account
  // lookups took longer than the Gemeinde App waits).
  const accounts = new Map<string, { email: string | null; msOid: string | null }>();
  const appIds = new Set(rows.map(p => p.appId).filter(Boolean) as string[]);
  for (let page = 1; appIds.size && page <= 50; page++) {
    const { data: list, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listError) {
      console.error('fecg-bridge persons listUsers failed', listError);
      break;
    }
    const users = list?.users ?? [];
    for (const u of users) {
      if (appIds.has(u.id)) {
        accounts.set(u.id, {
          email: u.email ?? null,
          msOid: typeof u.app_metadata?.msoid === 'string' ? u.app_metadata.msoid : null,
        });
      }
    }
    if (users.length < 1000 || accounts.size >= appIds.size) { break; }
  }

  return json({
    persons: rows.map(p => ({
      id: p.id,
      ensembleId: p.tenantId,
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      email: p.email || null,
      accountEmail: p.appId ? accounts.get(p.appId)?.email ?? null : null,
      msOid: p.appId ? accounts.get(p.appId)?.msOid ?? null : null,
      group: p.instrument != null ? groupNames.get(p.instrument) ?? null : null,
    })),
  });
}

async function handleGroups(org: Org, body: Record<string, unknown>): Promise<Response> {
  const tenantId = Number(body.ensembleId);
  const tenantIds = await orgTenantIds(org.id);
  if (!Number.isInteger(tenantId) || !tenantIds.includes(tenantId)) { return json({ error: 'not_found' }, 404); }
  const { data, error } = await supabase
    .from('instruments')
    .select('id, name, maingroup, sort_order')
    .eq('tenantId', tenantId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) {
    console.error('fecg-bridge groups failed', error);
    return json({ error: 'load_failed' }, 500);
  }
  return json({
    groups: ((data ?? []) as any[]).map(g => ({ id: g.id, name: g.name ?? '', main: !!g.maingroup })),
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_PLAYER = 2;
const ROLE_RESPONSIBLE = 5;

function personOut(p: any, group: string | null, existing: boolean) {
  return {
    existing,
    person: {
      id: p.id,
      ensembleId: p.tenantId,
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      email: p.email || null,
      group,
    },
  };
}

async function handleCreatePerson(org: Org, body: Record<string, unknown>): Promise<Response> {
  const tenantId = Number(body.ensembleId);
  const groupId = Number(body.groupId);
  const firstName = String(body.firstName ?? '').trim().slice(0, 100);
  const lastName = String(body.lastName ?? '').trim().slice(0, 100);
  const emailRaw = String(body.email ?? '').trim().toLowerCase();
  const email = EMAIL_RE.test(emailRaw) && emailRaw.length <= 200 ? emailRaw : null;
  if (!firstName || !lastName) { return json({ error: 'name_required' }, 400); }

  const tenantIds = await orgTenantIds(org.id);
  if (!Number.isInteger(tenantId) || !tenantIds.includes(tenantId)) { return json({ error: 'not_found' }, 404); }
  const { data: group } = await supabase
    .from('instruments')
    .select('id, name, maingroup')
    .eq('id', groupId)
    .eq('tenantId', tenantId)
    .maybeSingle();
  if (!group) { return json({ error: 'invalid_group' }, 400); }
  const groupName = (group as any).name ?? null;

  // Existing account with this email: link instead of creating one (no email is sent).
  let appId: string | null = null;
  if (email) {
    const { data: users } = await supabase.rpc('get_user_id_by_email', { email });
    appId = (users as any[] | null)?.[0]?.id ?? null;
  }

  // Already there (active): same account or same email in this tenant.
  const { data: active } = await supabase
    .from('player')
    .select('id, tenantId, firstName, lastName, email, appId, instrument, left')
    .eq('tenantId', tenantId)
    .is('left', null)
    .limit(5000);
  const twin = ((active ?? []) as any[]).find(p =>
    (appId && p.appId === appId) || (email && String(p.email ?? '').trim().toLowerCase() === email));
  if (twin) {
    let twinGroup: string | null = null;
    if (twin.instrument != null) {
      const { data: g } = await supabase.from('instruments').select('name').eq('id', twin.instrument).maybeSingle();
      twinGroup = (g as any)?.name ?? null;
    }
    return json(personOut(twin, twinGroup, true));
  }

  if (appId) {
    const { data: tu } = await supabase
      .from('tenantUsers')
      .select('userId')
      .eq('tenantId', tenantId)
      .eq('userId', appId)
      .maybeSingle();
    if (!tu) {
      const { error: tuError } = await supabase.from('tenantUsers').insert({
        userId: appId,
        tenantId,
        email,
        role: (group as any).maingroup ? ROLE_RESPONSIBLE : ROLE_PLAYER,
      });
      if (tuError) {
        console.error('fecg-bridge create_person tenantUsers failed', tuError);
        return json({ error: 'save_failed' }, 500);
      }
    }
  }

  const joined = new Date().toISOString();
  const { data: created, error } = await supabase
    .from('player')
    .insert({
      id: Math.floor(Math.random() * (999999999999 - 1000000000 + 1)) + 1000000000,
      tenantId,
      firstName,
      lastName,
      email,
      appId,
      instrument: groupId,
      joined,
      history: [],
      additional_fields: {},
    })
    .select('id, tenantId, firstName, lastName, email')
    .single();
  if (error || !created) {
    console.error('fecg-bridge create_person failed', error);
    return json({ error: 'save_failed' }, 500);
  }

  // Upcoming Termine, like addPlayerToAttendancesByDate in the app.
  const today = berlinNow().slice(0, 10);
  const [{ data: atts }, { data: types }, { data: tenant }] = await Promise.all([
    supabase.from('attendance').select('id, type_id, date').eq('tenantId', tenantId).gte('date', today),
    supabase.from('attendance_types').select('id, relevant_groups, default_status, additional_fields_filter').eq('tenant_id', tenantId),
    supabase.from('tenants').select('additional_fields').eq('id', tenantId).maybeSingle(),
  ]);
  const fields = ((tenant as any)?.additional_fields ?? []) as any[];
  const typeById = new Map(((types ?? []) as any[]).map(t => [t.id, t]));
  const rows = ((atts ?? []) as any[]).flatMap(att => {
    const type = typeById.get(att.type_id);
    if (!type) { return []; }
    const relevant: number[] = type.relevant_groups ?? [];
    if (relevant.length && !relevant.includes(groupId)) { return []; }
    const filter = type.additional_fields_filter;
    if (filter?.key && filter?.option != null) {
      const field = fields.find(f => f.id === filter.key);
      if (field && field.defaultValue !== filter.option) { return []; }
    }
    return [{ attendance_id: att.id, person_id: (created as any).id, notes: '', status: type.default_status ?? STATUS_NEUTRAL }];
  });
  if (rows.length) {
    const { error: paError } = await supabase.from('person_attendances').insert(rows);
    if (paError) { console.error('fecg-bridge create_person attendances failed', paError); }
  }

  return json(personOut(created, groupName, false));
}

async function loadAttendance(org: Org, attendanceId: number) {
  return loadAttendanceRules(supabase, attendanceId, await orgTenantIds(org.id));
}

async function handleAttendance(org: Org, body: Record<string, unknown>): Promise<Response> {
  const loaded = await loadAttendance(org, Number(body.attendanceId));
  if (!loaded) { return json({ error: 'not_found' }, 404); }
  const { a, date, deadline, rules } = loaded;
  const { data: rows, error } = await supabase
    .from('person_attendances')
    .select('person_id, status, notes')
    .eq('attendance_id', a.id)
    .limit(5000);
  if (error) {
    console.error('fecg-bridge attendance failed', error);
    return json({ error: 'load_failed' }, 500);
  }
  return json({
    attendance: {
      id: a.id,
      ensembleId: a.tenantId,
      date,
      start: a.start_time || null,
      end: a.end_time || null,
      type: a.type?.name ?? null,
      title: a.typeInfo || null,
      place: a.place || null,
      deadline,
      url: `https://attendix.de/open-attendance?id=${a.id}&tenantId=${a.tenantId}`,
      ...rules,
    },
    reasons: reasonsOf(a),
    persons: ((rows ?? []) as any[]).map(r => ({ personId: r.person_id, status: r.status ?? STATUS_NEUTRAL, notes: r.notes || '' })),
  });
}

async function handleStatus(org: Org, body: Record<string, unknown>): Promise<Response> {
  const wanted = body.status;
  if (wanted !== 'present' && wanted !== 'late' && wanted !== 'excused') {
    return json({ error: 'invalid_status' }, 400);
  }
  const personId = Number(body.personId);
  if (wanted !== 'present' && !String(body.reason ?? '').trim()) { return json({ error: 'reason_required' }, 400); }

  const loaded = await loadAttendance(org, Number(body.attendanceId));
  if (!loaded || !Number.isInteger(personId)) { return json({ error: 'not_found' }, 404); }

  const result = await applySelfStatus(supabase, loaded, personId, wanted, body.reason, 'fecg-bridge');
  if (!result.ok) {
    const code = result.error === 'not_invited' ? 404 : result.error === 'write_failed' ? 500
      : result.error === 'reason_required' ? 400 : 409;
    return json({ error: result.error }, code);
  }
  return json({ ok: true, personId, status: result.status, notes: result.notes });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  if (!req.headers.get('x-gemeinde-app-key')?.startsWith('atx_')) {
    return json({ error: 'missing_key' }, 401);
  }
  const org = await orgForKey(req);
  if (!org) {
    return json({ error: 'invalid_key' }, 401);
  }

  if (req.method === 'POST') {
    return handleWrite(req, org);
  }

  const url = new URL(req.url);
  const today = new Date();
  const from = validDate(url.searchParams.get('from')) ? url.searchParams.get('from')! : isoDate(today);
  const to = validDate(url.searchParams.get('to'))
    ? url.searchParams.get('to')!
    : isoDate(new Date(today.getTime() + 56 * 24 * 60 * 60 * 1000));

  const { data: tgts } = await supabase
    .from('tenant_group_tenants')
    .select('tenant_id, tenant:tenant_id(shortName, longName, logo_url, branding_text)')
    .eq('tenant_group', org.id);

  const tenants = new Map<number, { shortName?: string; longName?: string; logo_url?: string; branding_text?: string }>(
    (tgts ?? []).map((t: any) => [t.tenant_id, t.tenant ?? {}]),
  );
  const tenantIds = [...tenants.keys()];

  const attSelect = 'id, date, start_time, end_time, place, plan, extra_plans, typeInfo, tenantId';
  const attQuery = () => supabase
    .from('attendance')
    .select(attSelect)
    .in('tenantId', tenantIds)
    .eq('is_org_plan', true)
    .eq('archived', false)
    .not('plan', 'is', null);
  const adhocQuery = () => supabase
    .from('shared_plans')
    .select('id, date, time, end_time, plan_title, fields')
    .eq('org_id', org.id);
  const none = Promise.resolve({ data: [], error: null });

  // Upcoming plans in [from, to], plus the most recent ones before `from`. One Termin can hold
  // several plans, so up to PAST_PLANS_LIMIT rows each are loaded and the plans cut below.
  const results = await Promise.all([
    tenantIds.length
      ? attQuery().gte('date', from).lte('date', `${to}T23:59:59`).order('date', { ascending: true })
      : none,
    adhocQuery().gte('date', from).lte('date', to).order('date', { ascending: true }),
    tenantIds.length
      ? attQuery().lt('date', from).order('date', { ascending: false }).limit(PAST_PLANS_LIMIT)
      : none,
    adhocQuery().lt('date', from).order('date', { ascending: false }).limit(PAST_PLANS_LIMIT),
  ]);

  // Every Termin of the org's ensembles (Probe, Übung, Vortrag, Besprechung …).
  const eventsResult = tenantIds.length
    ? await supabase
      .from('attendance')
      .select('id, date, start_time, end_time, place, typeInfo, tenantId, type:type_id(name, all_day, duration_days)')
      .in('tenantId', tenantIds)
      .eq('archived', false)
      .gte('date', from)
      .lte('date', `${to}T23:59:59`)
      .order('date', { ascending: true })
      .limit(EVENTS_LIMIT)
    : { data: [], error: null };

  const failed = [...results, eventsResult].find((r: any) => r.error) as any;
  if (failed) {
    console.error('fecg-bridge load failed', failed.error);
    return json({ error: 'load_failed' }, 500);
  }

  const [attUp, adhocUp, attPast, adhocPast] = results.map((r: any) => (r.data ?? []) as any[]);
  const pastAttIds = new Set(attPast.map(r => r.id));
  const pastAdhocIds = new Set(adhocPast.map(r => r.id));
  const attRows = [...attPast, ...attUp];
  const adhocRows = [...adhocPast, ...adhocUp];

  // SongBeamer files of the Werke used in these plans.
  const songIds = new Set<number>();
  for (const row of attRows) {
    for (const plan of [row.plan, ...(row.extra_plans ?? [])] as Plan[]) {
      (plan?.fields ?? []).forEach(f => f.songId && songIds.add(f.songId));
    }
  }
  const songFiles = new Map<number, BeamerFile>();
  if (songIds.size) {
    const { data: songs } = await supabase.from('songs').select('id, beamer_file').in('id', [...songIds]);
    (songs ?? []).forEach((s: any) => s.beamer_file && songFiles.set(s.id, s.beamer_file));
  }

  const beamerActive = !!org.beamer_files_enabled;
  const plans: any[] = [];

  for (const row of attRows) {
    const all = [row.plan, ...(row.extra_plans ?? [])].filter(Boolean) as Plan[];
    all.forEach((plan, index) => {
      plans.push({
        uid: `att-${row.id}-${index}`,
        source: 'attendance',
        attendanceId: row.id,
        planIndex: index,
        tenant: tenants.get(row.tenantId)?.longName ?? tenants.get(row.tenantId)?.shortName ?? null,
        date: String(row.date ?? '').slice(0, 10),
        past: pastAttIds.has(row.id),
        day: plan.day ?? null,
        label: plan.label ?? null,
        title: plan.title || row.typeInfo || null,
        place: row.place ?? null,
        eventStart: row.start_time ?? null,
        eventEnd: row.end_time ?? null,
        time: plan.time ?? null,
        end: plan.end ?? null,
        branding: branding(org, tenants.get(row.tenantId)),
        fields: mapFields(plan.fields ?? [], beamerActive, songFiles),
      });
    });
  }

  for (const row of adhocRows) {
    plans.push({
      uid: `adhoc-${row.id}`,
      source: 'adhoc',
      attendanceId: null,
      planIndex: 0,
      tenant: null,
      date: String(row.date ?? '').slice(0, 10),
      past: pastAdhocIds.has(row.id),
      day: null,
      label: null,
      title: row.plan_title || null,
      place: null,
      eventStart: null,
      eventEnd: null,
      time: row.time ?? null,
      end: row.end_time ?? null,
      branding: branding(org),
      fields: mapFields((row.fields ?? []) as FieldSelection[], beamerActive, songFiles),
    });
  }

  const byDate = (a: any, b: any) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const upcoming = plans.filter(p => !p.past).sort(byDate);
  const past = plans.filter(p => p.past).sort(byDate).slice(-PAST_PLANS_LIMIT);

  const ensembles = tenantIds.map(id => ({
    id,
    shortName: tenants.get(id)?.shortName ?? null,
    name: tenants.get(id)?.longName ?? tenants.get(id)?.shortName ?? null,
  }));

  const events = ((eventsResult.data ?? []) as any[]).map(row => ({
    id: row.id,
    ensembleId: row.tenantId,
    date: String(row.date ?? '').slice(0, 10),
    start: row.start_time || null,
    end: row.end_time || null,
    allDay: !!row.type?.all_day,
    days: row.type?.duration_days ?? null,
    type: row.type?.name ?? null,
    title: row.typeInfo || null,
    place: row.place || null,
    url: `https://attendix.de/open-attendance?id=${row.id}&tenantId=${row.tenantId}`,
  }));

  return json({
    org: { id: org.id, name: org.name, beamerFilesEnabled: beamerActive },
    from,
    to,
    plans: [...past, ...upcoming],
    ensembles,
    events,
  });
});
