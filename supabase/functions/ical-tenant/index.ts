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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId');
  if (!tenantId) {
    return new Response('Missing tenantId', { status: 400, headers: CORS_HEADERS });
  }

  // Fetch tenant shortName
  const { data: tenant } = await supabase
    .from('tenants')
    .select('shortName')
    .eq('id', tenantId)
    .single();

  if (!tenant) {
    return new Response('Tenant not found', { status: 404, headers: CORS_HEADERS });
  }

  // Fetch all attendance rows with their type joined
  const { data: rows } = await supabase
    .from('attendance')
    .select('id, date, type_id, typeInfo, start_time, end_time, duration_days, attendanceType:type_id(name, start_time, end_time, all_day, duration_days)')
    .eq('tenantId', tenantId)
    .order('date', { ascending: true });

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

    // Parse date as UTC midnight
    const dateParts = (ev.date as string).substring(0, 10).split('-');
    const s = new Date(Date.UTC(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2])));
    const e = new Date(s.getTime());

    lines.push('BEGIN:VEVENT');
    lines.push(icalLine('UID', `att-${ev.id}-${++uid}@attendix.de`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(icalLine('SUMMARY', escapeIcal(`${tenant.shortName} ${title}`)));

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
