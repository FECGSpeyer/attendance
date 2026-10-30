import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

// Bridge for the Gemeinde App (FECG Speyer, FECG Schwegenheim). Auth: header x-gemeinde-app-key,
// of which tenant_groups stores only the SHA-256.
//
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   ORG plans with "Beamer-Datei nötig" per row
//                                      (default: today until 8 weeks ahead)
// POST { action: 'point', plan, field, file }   SongBeamer file of a Programmpunkt
// POST { action: 'song', songId, file }         SongBeamer file of a Werk
//   file = { name, path } or null to remove it. Points are written through the SQL function
//   fecg_set_beamer_file (supabase/sql/add_gemeinde_app_write.sql), so a concurrent save in
//   Attendix keeps the file.

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

  const [attRes, adhocRes] = await Promise.all([
    tenantIds.length
      ? supabase
          .from('attendance')
          .select('id, date, start_time, end_time, place, plan, extra_plans, typeInfo, tenantId')
          .in('tenantId', tenantIds)
          .eq('is_org_plan', true)
          .not('plan', 'is', null)
          .gte('date', from)
          .lte('date', `${to}T23:59:59`)
          .order('date', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('shared_plans')
      .select('id, date, time, end_time, plan_title, fields')
      .eq('org_id', org.id)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true }),
  ]);

  if ((attRes as any).error || adhocRes.error) {
    console.error('fecg-bridge load failed', (attRes as any).error ?? adhocRes.error);
    return json({ error: 'load_failed' }, 500);
  }

  const attRows = ((attRes as any).data ?? []) as any[];
  const adhocRows = (adhocRes.data ?? []) as any[];

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
  const plans: unknown[] = [];

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

  plans.sort((a: any, b: any) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return json({
    org: { id: org.id, name: org.name, beamerFilesEnabled: beamerActive },
    from,
    to,
    plans,
  });
});
