import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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

// Same values as AttendanceStatus in src/app/utilities/constants.ts.
const STATUS_NEUTRAL = 0;
const STATUS_PRESENT = 1;
const STATUS_EXCUSED = 2;
const STATUS_LATE = 3;
const STATUS_ABSENT = 4;
const STATUS_LATE_EXCUSED = 5;
const MAX_REASON = 300;

// Same defaults as DEFAULT_ABSENCE_REASONS / DEFAULT_LATE_REASONS in constants.ts.
const DEFAULT_ABSENCE_REASONS = ['Krankheitsbedingt', 'Urlaubsbedingt', 'Arbeitsbedingt', 'Familienbedingt'];
const DEFAULT_LATE_REASONS = ['Krankheitsbedingt', 'Urlaubsbedingt', 'Arbeitsbedingt', 'Familienbedingt'];

/** Wall clock in Europe/Berlin as "YYYY-MM-DDTHH:MM". */
export function berlinNow(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Attendix stores the deadline as wall clock with a UTC marker (see isSigninOpen in overview.page.ts). */
export function deadlineWallClock(deadline: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(deadline ?? '');
  return m ? `${m[1]}T${m[2]}` : null;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Wall clock when the Termin is over: its end (or start), else the end of its last day. */
export function endWallClock(date: string, start: string | null, end: string | null, days: number | null): string {
  const lastDay = addDays(date, Math.max(1, days ?? 1) - 1);
  const time = /^\d{2}:\d{2}/.exec(end || '')?.[0] ?? /^\d{2}:\d{2}/.exec(start || '')?.[0];
  return time && (days ?? 1) <= 1 ? `${date}T${time}` : `${lastDay}T23:59`;
}

export interface CardRules {
  past: boolean;
  deadlinePassed: boolean;
  allowLate: boolean;
  allowExcuse: boolean;
}

/**
 * What a person may do on the card; mirrors presentActionSheetForChoice in
 * selfService/overview: signing in closes at the deadline, signing out and
 * reporting late stay open, but not once the person is excused or absent.
 */
export function allowedActions(rules: CardRules, current: number): { present: boolean; late: boolean; excused: boolean } {
  if (rules.past) { return { present: false, late: false, excused: false }; }
  const blocked = current === STATUS_EXCUSED || current === STATUS_ABSENT;
  return {
    present: !rules.deadlinePassed && current !== STATUS_PRESENT,
    late: rules.allowLate && !blocked,
    excused: rules.allowExcuse && !blocked,
  };
}

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
  const accounts = new Map<string, { email: string | null; msOid: string | null }>();
  const appIds = [...new Set(rows.map(p => p.appId).filter(Boolean))] as string[];
  for (let i = 0; i < appIds.length; i += 20) {
    await Promise.all(appIds.slice(i, i + 20).map(async id => {
      const { data: u } = await supabase.auth.admin.getUserById(id);
      if (u?.user) {
        accounts.set(id, {
          email: u.user.email ?? null,
          msOid: typeof u.user.app_metadata?.msoid === 'string' ? u.user.app_metadata.msoid : null,
        });
      }
    }));
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

async function loadAttendance(org: Org, attendanceId: number) {
  const tenantIds = await orgTenantIds(org.id);
  if (!Number.isInteger(attendanceId) || !tenantIds.length) { return null; }
  const { data: att } = await supabase
    .from('attendance')
    .select('id, tenantId, date, start_time, end_time, deadline, place, typeInfo, duration_days, archived, type:type_id(name, available_statuses, duration_days), tenant:tenantId(absence_reasons, late_reasons)')
    .eq('id', attendanceId)
    .in('tenantId', tenantIds)
    .maybeSingle();
  if (!att || (att as any).archived) { return null; }
  const a = att as any;
  const date = String(a.date ?? '').slice(0, 10);
  const now = berlinNow();
  const deadline = deadlineWallClock(a.deadline);
  const statuses: number[] = a.type?.available_statuses ?? [];
  const rules: CardRules = {
    past: endWallClock(date, a.start_time, a.end_time, a.duration_days ?? a.type?.duration_days ?? 1) < now,
    deadlinePassed: !!deadline && deadline < now,
    allowLate: !a.type || statuses.includes(STATUS_LATE),
    allowExcuse: !a.type || statuses.includes(STATUS_EXCUSED),
  };
  return { a, date, deadline, rules };
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
    reasons: {
      absence: a.tenant?.absence_reasons?.length ? a.tenant.absence_reasons : DEFAULT_ABSENCE_REASONS,
      late: a.tenant?.late_reasons?.length ? a.tenant.late_reasons : DEFAULT_LATE_REASONS,
    },
    persons: ((rows ?? []) as any[]).map(r => ({ personId: r.person_id, status: r.status ?? STATUS_NEUTRAL, notes: r.notes || '' })),
  });
}

async function handleStatus(org: Org, body: Record<string, unknown>): Promise<Response> {
  const wanted = body.status;
  if (wanted !== 'present' && wanted !== 'late' && wanted !== 'excused') {
    return json({ error: 'invalid_status' }, 400);
  }
  const personId = Number(body.personId);
  const reason = String(body.reason ?? '').trim().slice(0, MAX_REASON);
  if (wanted !== 'present' && !reason) { return json({ error: 'reason_required' }, 400); }

  const loaded = await loadAttendance(org, Number(body.attendanceId));
  if (!loaded || !Number.isInteger(personId)) { return json({ error: 'not_found' }, 404); }
  const { a, rules } = loaded;

  const { data: pa } = await supabase
    .from('person_attendances')
    .select('id, status')
    .eq('attendance_id', a.id)
    .eq('person_id', personId)
    .maybeSingle();
  if (!pa) { return json({ error: 'not_invited' }, 404); }

  const current = (pa as any).status ?? STATUS_NEUTRAL;
  const allowed = allowedActions(rules, current);
  if (!allowed[wanted]) {
    const why = rules.past ? 'past' : wanted === 'present' && rules.deadlinePassed ? 'deadline' : 'not_allowed';
    return json({ error: why }, 409);
  }

  const status = wanted === 'present' ? STATUS_PRESENT : wanted === 'late' ? STATUS_LATE_EXCUSED : STATUS_EXCUSED;
  const { error } = await supabase
    .from('person_attendances')
    .update({ status, notes: wanted === 'present' ? '' : reason, changed_by: null, changed_at: new Date().toISOString() })
    .eq('id', (pa as any).id);
  if (error) {
    console.error('fecg-bridge status write failed', error);
    return json({ error: 'write_failed' }, 500);
  }

  // Same notification as a self sign-in / sign-out in Attendix (push or Telegram to the leaders).
  const type = wanted === 'present'
    ? (current === STATUS_LATE_EXCUSED ? 'lateSignin' : 'signin')
    : wanted === 'late' ? 'lateSignout' : 'signout';
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/quick-processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ attId: (pa as any).id, type, reason, notes: '', isParents: false, isSelf: true }),
    });
    if (!res.ok) { console.error('fecg-bridge notify failed', res.status, await res.text().catch(() => '')); }
  } catch (e) {
    console.error('fecg-bridge notify failed', e);
  }

  return json({ ok: true, personId, status, notes: wanted === 'present' ? '' : reason });
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
