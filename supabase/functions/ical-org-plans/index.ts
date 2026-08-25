import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FieldSelection {
  id: string;
  name: string;
  time: string;
  conductor?: string;
  info?: string;
}

interface PlanEntry {
  uid: string;
  date: string;
  title: string;
  time: string;
  end: string;
  fields: FieldSelection[];
}

// Parse a time value (ISO datetime or HH:mm) combined with a date string into a Date (Europe/Berlin local).
function parseLocalDateTime(date: string, timeVal: string): Date | null {
  if (!date || !timeVal) return null;
  let hh: number, mm: number;
  if (timeVal.includes('T')) {
    const d = new Date(timeVal);
    if (isNaN(d.getTime())) return null;
    hh = d.getHours();
    mm = d.getMinutes();
  } else if (timeVal.includes(':')) {
    hh = Number(timeVal.substring(0, 2));
    mm = Number(timeVal.substring(3, 5));
  } else {
    return null;
  }
  // Build ISO string treating the date+time as Europe/Berlin local.
  // We use the offset of Europe/Berlin for the given date by formatting a UTC
  // candidate and comparing it to the Berlin interpretation.
  const candidate = new Date(`${date}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);
  // candidate is treated as UTC by Date constructor; we need it as Berlin local.
  // Use Intl to find the Berlin offset for this date.
  const berlinFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  // Try finding offset: make a UTC time, convert to Berlin, compare delta.
  // Simpler: just assemble from a known Berlin timestamp string.
  // "2026-06-15T18:00" in Berlin = "2026-06-15T16:00:00Z" in summer (UTC+2).
  // We do this by passing a full ISO string with offset — but we don't know the offset.
  // Reliable approach: use the Date.UTC + offset trick via Intl.
  const utcCandidate = Date.UTC(
    Number(date.substring(0,4)),
    Number(date.substring(5,7)) - 1,
    Number(date.substring(8,10)),
    hh, mm, 0
  );
  // Get what Berlin thinks the time is for this UTC instant
  const parts = Object.fromEntries(
    berlinFormatter.formatToParts(new Date(utcCandidate)).map(p => [p.type, p.value])
  );
  const berlinHH = Number(parts.hour === '24' ? 0 : parts.hour);
  const berlinMM = Number(parts.minute);
  // Offset in minutes: how far ahead Berlin is from UTC
  const offsetMins = (hh - berlinHH) * 60 + (mm - berlinMM);
  // Adjust: our desired UTC = utcCandidate + offsetMins * 60000
  return new Date(utcCandidate + offsetMins * 60 * 1000);
}

function toIcalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Encode a property + value as a correctly folded iCal line (RFC 5545 §3.1).
// Folds at 75 octets on UTF-8 byte boundaries; continuation lines start with a space.
// Splits on \n (iCal escaped newline) first so that escape sequence is never torn
// across a fold boundary, which crashes Apple Calendar.
function icalLine(prop: string, value: string): string {
  const encoder = new TextEncoder();

  const foldSegment = (segment: string, firstLimit: number): string[] => {
    const bytes = encoder.encode(segment);
    if (bytes.length <= firstLimit) return [segment];
    const parts: string[] = [];
    let bytePos = 0;
    let limit = firstLimit;
    while (bytePos < bytes.length) {
      let end = bytePos + limit;
      if (end >= bytes.length) {
        end = bytes.length;
      } else {
        while (end > bytePos && (bytes[end] & 0xC0) === 0x80) end--;
      }
      parts.push(new TextDecoder().decode(bytes.slice(bytePos, end)));
      bytePos = end;
      limit = 74;
    }
    return parts;
  };

  // Split on iCal escaped newlines so \n is never torn across a fold boundary.
  const segments = value.split('\\n');
  // First segment includes the property name; remaining are continuations.
  const allParts: string[] = foldSegment(`${prop}:${segments[0]}`, 75);
  for (let i = 1; i < segments.length; i++) {
    allParts.push(...foldSegment(`\\n${segments[i]}`, 74));
  }
  return allParts.join('\r\n ');
}

function escapeIcal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildDescription(fields: FieldSelection[], startTime: string, date: string): string {
  if (!fields.length) return '';
  const lines: string[] = [];
  let cumulativeMins = 0;
  for (const f of fields) {
    const dur = Number(f.time) || 0;
    if (f.id.includes('noteFld')) {
      lines.push(escapeIcal(f.name));
    } else {
      const slotStart = parseLocalDateTime(date, startTime);
      let timeStr = '';
      if (slotStart) {
        const slotDate = new Date(slotStart.getTime() + cumulativeMins * 60000);
        const berlinFormatter = new Intl.DateTimeFormat('de-DE', {
          timeZone: 'Europe/Berlin',
          hour: '2-digit', minute: '2-digit',
          hour12: false,
        });
        timeStr = berlinFormatter.format(slotDate) + ' Uhr | ';
      }
      const conductorStr = f.conductor ? ` (${f.conductor})` : '';
      lines.push(escapeIcal(`${timeStr}${f.name}${conductorStr} \u2013 ${dur} min`));
      if (f.info) lines.push(escapeIcal(`  ${f.info}`));
    }
    cumulativeMins += dur;
  }
  // Join with literal \n (iCal escaped newline) — the whole value is one property.
  return lines.join('\\n');
}

function buildIcal(orgName: string, plans: PlanEntry[], detailed: boolean): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    icalLine('PRODID', '-//Attendix//OrgPlans//DE'),
    'CALSCALE:GREGORIAN',
    icalLine('X-WR-CALNAME', escapeIcal(`${orgName} Ablaufpläne`)),
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const plan of plans) {
    if (!plan.date) continue;

    if (!detailed) {
      const dtStart = parseLocalDateTime(plan.date, plan.time);
      const dtEnd = parseLocalDateTime(plan.date, plan.end);
      if (!dtStart) continue;
      const endDate = dtEnd ?? new Date(dtStart.getTime() + 60 * 60000);
      const desc = buildDescription(plan.fields, plan.time, plan.date);
      lines.push(
        'BEGIN:VEVENT',
        icalLine('UID', `${plan.uid}@attendix.de`),
        icalLine('DTSTART', toIcalDate(dtStart)),
        icalLine('DTEND', toIcalDate(endDate)),
        icalLine('SUMMARY', escapeIcal(plan.title)),
        ...(desc ? [icalLine('DESCRIPTION', desc)] : []),
        'END:VEVENT',
      );
    } else {
      let cumulativeMins = 0;
      for (let i = 0; i < plan.fields.length; i++) {
        const f = plan.fields[i];
        if (f.id.includes('noteFld')) { cumulativeMins += Number(f.time) || 0; continue; }
        const dur = Number(f.time) || 0;
        const slotStart = parseLocalDateTime(plan.date, plan.time);
        if (!slotStart) { cumulativeMins += dur; continue; }
        const dtStart = new Date(slotStart.getTime() + cumulativeMins * 60000);
        const dtEnd = new Date(dtStart.getTime() + (dur || 15) * 60000);
        const summary = escapeIcal(f.conductor ? `${f.name} (${f.conductor})` : f.name);
        lines.push(
          'BEGIN:VEVENT',
          icalLine('UID', `${plan.uid}-${i}@attendix.de`),
          icalLine('DTSTART', toIcalDate(dtStart)),
          icalLine('DTEND', toIcalDate(dtEnd)),
          icalLine('SUMMARY', summary),
          ...(f.info ? [icalLine('DESCRIPTION', escapeIcal(f.info))] : []),
          'END:VEVENT',
        );
        cumulativeMins += dur;
      }
    }
  }

  lines.push('END:VCALENDAR');
  // RFC 5545 requires the stream to end with CRLF after the last line.
  return lines.join('\r\n') + '\r\n';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  const detailed = url.searchParams.get('detailed') === 'true';

  if (!key) {
    return new Response('Missing key', { status: 400, headers: CORS_HEADERS });
  }

  const { data: org } = await supabase
    .from('tenant_groups')
    .select('id, name')
    .eq('public_plan_key', key)
    .single();

  if (!org) {
    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  }

  const { data: tgts } = await supabase
    .from('tenant_group_tenants')
    .select('tenant_id, tenant:tenant_id(longName)')
    .eq('tenant_group', org.id);

  const tenantIds: number[] = (tgts ?? []).map((t: any) => t.tenant_id);

  const [attRows, adhocRows] = await Promise.all([
    tenantIds.length
      ? supabase
          .from('attendance')
          .select('id, date, plan, typeInfo')
          .in('tenantId', tenantIds)
          .eq('is_org_plan', true)
          .not('plan', 'is', null)
          .order('date', { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from('shared_plans')
      .select('id, date, time, end_time, plan_title, fields')
      .eq('org_id', org.id)
      .order('date', { ascending: true }),
  ]);

  const plans: PlanEntry[] = [];

  for (const row of ((attRows as any).data ?? []) as any[]) {
    const plan = row.plan as any;
    if (!plan) continue;
    plans.push({
      uid: `att-${row.id}`,
      date: row.date ?? '',
      title: plan.title || row.typeInfo || 'Plan',
      time: plan.time || '',
      end: plan.end || '',
      fields: plan.fields || [],
    });
  }

  for (const row of ((adhocRows as any).data ?? []) as any[]) {
    plans.push({
      uid: `adhoc-${row.id}`,
      date: row.date ?? '',
      title: row.plan_title || 'Plan',
      time: row.time || '',
      end: row.end_time || '',
      fields: (row.fields as FieldSelection[]) || [],
    });
  }

  plans.sort((a, b) => a.date < b.date ? -1 : 1);

  const ical = buildIcal(org.name, plans, detailed);

  return new Response(ical, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="org-plans.ics"`,
      'Cache-Control': 'no-cache',
    },
  });
});
