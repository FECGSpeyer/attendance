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

const STATUS_LABELS: Record<number, string> = {
  1: 'Zugesagt',
  2: 'Entschuldigt',
  3: 'Verspätet',
  4: 'Unentschuldigt',
  5: 'Verspätet entschuldigt',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

// Floating local time — no Z suffix. Calendar clients interpret in the user's local tz.
function formatDateTimeNoZ(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

// UTC datetime for VALARM TRIGGER (absolute trigger must be UTC with Z)
function formatDateTimeUTC(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeIcal(t: string): string {
  return String(t || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

// Fold iCal line at 75 octets, never splitting a \n escape or a UTF-8 multi-byte sequence.
function icalLine(prop: string, value: string): string {
  const full = `${prop}:${value}`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(full);
  if (bytes.length <= 75) return full;

  const parts: string[] = [];
  let bytePos = 0;
  let limit = 75;
  while (bytePos < bytes.length) {
    let end = bytePos + limit;
    if (end >= bytes.length) {
      end = bytes.length;
    } else {
      // Don't cut inside a multi-byte UTF-8 sequence
      while (end > bytePos && (bytes[end] & 0xC0) === 0x80) end--;
      // Don't cut between \ (0x5C) and n (0x6E) — would split \n escape
      while (end > bytePos + 1 && bytes[end - 1] === 0x5C && bytes[end] === 0x6E) end--;
    }
    parts.push(new TextDecoder().decode(bytes.slice(bytePos, end)));
    bytePos = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

function buildPlanDescription(plan: any): string {
  if (!plan) return '';
  const lines: string[] = [];
  if (plan.title) lines.push(plan.title);

  const fields: any[] = plan.fields ?? [];
  if (fields.length === 0) return lines.join('\\n');

  // Accumulate running time from plan.time start
  let [startH, startM] = (plan.time ?? '00:00').split(':').map(Number);
  let totalMinutes = startH * 60 + startM;

  for (const f of fields) {
    const dur = Number(f.time) || 0;
    const hh = pad(Math.floor(totalMinutes / 60) % 24);
    const mm = pad(totalMinutes % 60);
    const isNote = String(f.id).startsWith('noteFld');

    if (isNote) {
      lines.push(escapeIcal(f.name));
    } else {
      let entry = `${hh}:${mm} | ${f.name}`;
      if (f.conductor) entry += ` (${f.conductor})`;
      entry += ` – ${dur} min`;
      lines.push(escapeIcal(entry));
    }
    totalMinutes += dur;
  }
  return lines.join('\\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId');
  if (!tenantId) {
    return new Response('Missing tenantId', { status: 400, headers: CORS_HEADERS });
  }

  const personIdParam = url.searchParams.get('personId');
  const personId = personIdParam ? Number(personIdParam) : null;

  // Fetch tenant shortName
  const { data: tenant } = await supabase
    .from('tenants')
    .select('shortName')
    .eq('id', tenantId)
    .single();

  if (!tenant) {
    return new Response('Tenant not found', { status: 404, headers: CORS_HEADERS });
  }

  // Build a status map for the person if personId is provided
  let statusMap: Map<number, number> | null = null;
  let assignedIds: number[] | null = null;

  if (personId !== null && !isNaN(personId)) {
    const { data: paRows } = await supabase
      .from('person_attendances')
      .select('attendance_id, status')
      .eq('person_id', personId);

    statusMap = new Map();
    assignedIds = [];
    for (const row of (paRows ?? []) as any[]) {
      assignedIds.push(row.attendance_id);
      statusMap.set(row.attendance_id, row.status ?? 0);
    }
  }

  // Fetch attendance rows with their type joined
  let query = supabase
    .from('attendance')
    .select('id, date, type_id, typeInfo, start_time, end_time, duration_days, plan, deadline, attendanceType:type_id(name, start_time, end_time, all_day, duration_days, color)')
    .eq('tenantId', tenantId)
    .order('date', { ascending: true });

  if (assignedIds !== null) {
    if (assignedIds.length === 0) {
      // No assignments — return empty calendar
      const ical = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        icalLine('PRODID', '-//Attendix//DE'),
        'CALSCALE:GREGORIAN',
        icalLine('X-WR-CALNAME', escapeIcal(`${tenant.shortName} Termine`)),
        'X-WR-TIMEZONE:Europe/Berlin',
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
        'END:VCALENDAR',
      ].join('\r\n') + '\r\n';
      return new Response(ical, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename="termine.ics"',
          'Cache-Control': 'no-cache',
        },
      });
    }
    query = query.in('id', assignedIds);
  }

  const { data: rows } = await query;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    icalLine('PRODID', '-//Attendix//DE'),
    'CALSCALE:GREGORIAN',
    icalLine('X-WR-CALNAME', escapeIcal(`${tenant.shortName} Termine`)),
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  let uid = 0;
  for (const ev of (rows ?? []) as any[]) {
    const type = ev.attendanceType as any;
    if (!ev.type_id || !type) continue;

    const title = ev.typeInfo || type.name || '';
    const isAllDay = !!type.all_day;

    // Resolve status for this event (only meaningful when personId is provided)
    const status: number = statusMap?.get(ev.id) ?? 0;
    const statusLabel = STATUS_LABELS[status];

    // Parse date as UTC midnight
    const dateParts = (ev.date as string).substring(0, 10).split('-');
    const s = new Date(Date.UTC(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2])));
    const e = new Date(s.getTime());

    lines.push('BEGIN:VEVENT');
    lines.push(icalLine('UID', `att-${ev.id}-${++uid}@attendix.de`));
    lines.push(`DTSTAMP:${dtstamp}`);

    // SUMMARY — append status label for personal feeds
    const summaryBase = `${tenant.shortName} ${title}`;
    const summary = statusLabel ? `${summaryBase} – ${statusLabel}` : summaryBase;
    lines.push(icalLine('SUMMARY', escapeIcal(summary)));

    // COLOR — emit hex color from attendance type if available
    const color: string = type.color || '';
    if (color) {
      lines.push(icalLine('COLOR', escapeIcal(color)));
    }

    // DESCRIPTION — plan title + programme fields
    const description = buildPlanDescription(ev.plan);
    if (description) {
      lines.push(icalLine('DESCRIPTION', description));
    }

    if (isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(s)}`);
      const durationDays = Number(ev.duration_days || type.duration_days || 1);
      e.setUTCDate(e.getUTCDate() + durationDays);
      lines.push(`DTEND;VALUE=DATE:${formatDate(e)}`);
    } else {
      // Use per-event start/end_time if set, otherwise fall back to type defaults
      const startStr: string = ev.start_time || type.start_time || '19:00';
      const endStr: string = ev.end_time || type.end_time || '20:30';
      s.setUTCHours(Number(startStr.substring(0, 2)), Number(startStr.substring(3, 5)), 0);
      e.setUTCHours(Number(endStr.substring(0, 2)), Number(endStr.substring(3, 5)), 0);
      lines.push(`DTSTART:${formatDateTimeNoZ(s)}`);
      lines.push(`DTEND:${formatDateTimeNoZ(e)}`);
    }

    // VALARM — only for personal feeds where the player hasn't responded yet and a deadline is set
    if (statusMap !== null && status === 0 && ev.deadline) {
      const deadlineDate = new Date(ev.deadline);
      if (!isNaN(deadlineDate.getTime())) {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push(icalLine('DESCRIPTION', 'Bitte Anwesenheit eintragen'));
        lines.push(`TRIGGER;VALUE=DATE-TIME:${formatDateTimeUTC(deadlineDate)}`);
        lines.push('END:VALARM');
      }
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  const ical = lines.join('\r\n') + '\r\n';

  return new Response(ical, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="termine.ics"',
      'Cache-Control': 'no-cache',
    },
  });
});
