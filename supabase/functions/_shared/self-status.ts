// supabase/functions/_shared/self-status.ts
// Self sign-in / sign-out from outside the app, shared by fecg-bridge (Gemeinde App card)
// and attendix-bot (Telegram card). Same rules and the same notification as a self
// sign-in / sign-out in Attendix (selfService/overview + quick-processor).

// deno-lint-ignore-file no-explicit-any

// Same values as AttendanceStatus in src/app/utilities/constants.ts.
export const STATUS_NEUTRAL = 0;
export const STATUS_PRESENT = 1;
export const STATUS_EXCUSED = 2;
export const STATUS_LATE = 3;
export const STATUS_ABSENT = 4;
export const STATUS_LATE_EXCUSED = 5;
export const MAX_REASON = 300;

// Same defaults as DEFAULT_ABSENCE_REASONS / DEFAULT_LATE_REASONS in constants.ts.
export const DEFAULT_ABSENCE_REASONS = ['Krankheitsbedingt', 'Urlaubsbedingt', 'Arbeitsbedingt', 'Familienbedingt'];
export const DEFAULT_LATE_REASONS = ['Krankheitsbedingt', 'Urlaubsbedingt', 'Arbeitsbedingt', 'Familienbedingt'];

export type SelfStatus = 'present' | 'late' | 'excused';

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
export function allowedActions(rules: CardRules, current: number): Record<SelfStatus, boolean> {
  if (rules.past) { return { present: false, late: false, excused: false }; }
  const blocked = current === STATUS_EXCUSED || current === STATUS_ABSENT;
  return {
    present: !rules.deadlinePassed && current !== STATUS_PRESENT,
    late: rules.allowLate && !blocked,
    excused: rules.allowExcuse && !blocked,
  };
}

export interface LoadedAttendance {
  a: any;
  date: string;
  deadline: string | null;
  rules: CardRules;
}

/** One Termin of the given tenants with the rules for signing in and out; null if missing or archived. */
export async function loadAttendanceRules(
  supabase: any,
  attendanceId: number,
  tenantIds: number[],
): Promise<LoadedAttendance | null> {
  if (!Number.isInteger(attendanceId) || !tenantIds.length) { return null; }
  const { data: att } = await supabase
    .from('attendance')
    .select('id, tenantId, date, start_time, end_time, deadline, place, typeInfo, duration_days, archived, type:type_id(name, available_statuses, duration_days), tenant:tenantId(shortName, longName, absence_reasons, late_reasons, default_language)')
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

export function reasonsOf(a: any): { absence: string[]; late: string[] } {
  return {
    absence: a.tenant?.absence_reasons?.length ? a.tenant.absence_reasons : DEFAULT_ABSENCE_REASONS,
    late: a.tenant?.late_reasons?.length ? a.tenant.late_reasons : DEFAULT_LATE_REASONS,
  };
}

export type SelfStatusError = 'reason_required' | 'not_invited' | 'past' | 'deadline' | 'not_allowed' | 'write_failed';

export interface SelfStatusResult {
  ok: boolean;
  status?: number;
  notes?: string;
  error?: SelfStatusError;
}

/**
 * Writes a self sign-in / sign-out of one person and notifies the leaders like the app does.
 */
export async function applySelfStatus(
  supabase: any,
  loaded: LoadedAttendance,
  personId: number,
  wanted: SelfStatus,
  rawReason: unknown,
  logPrefix: string,
): Promise<SelfStatusResult> {
  const reason = String(rawReason ?? '').trim().slice(0, MAX_REASON);
  if (wanted !== 'present' && !reason) { return { ok: false, error: 'reason_required' }; }
  const { a, rules } = loaded;

  const { data: pa } = await supabase
    .from('person_attendances')
    .select('id, status')
    .eq('attendance_id', a.id)
    .eq('person_id', personId)
    .maybeSingle();
  if (!pa) { return { ok: false, error: 'not_invited' }; }

  const current = (pa as any).status ?? STATUS_NEUTRAL;
  const allowed = allowedActions(rules, current);
  if (!allowed[wanted]) {
    const why: SelfStatusError = rules.past ? 'past' : wanted === 'present' && rules.deadlinePassed ? 'deadline' : 'not_allowed';
    return { ok: false, error: why };
  }

  const status = wanted === 'present' ? STATUS_PRESENT : wanted === 'late' ? STATUS_LATE_EXCUSED : STATUS_EXCUSED;
  const notes = wanted === 'present' ? '' : reason;
  const { error } = await supabase
    .from('person_attendances')
    .update({ status, notes, changed_by: null, changed_at: new Date().toISOString() })
    .eq('id', (pa as any).id);
  if (error) {
    console.error(`${logPrefix} status write failed`, error);
    return { ok: false, error: 'write_failed' };
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
    if (!res.ok) { console.error(`${logPrefix} notify failed`, res.status, await res.text().catch(() => '')); }
  } catch (e) {
    console.error(`${logPrefix} notify failed`, e);
  }

  return { ok: true, status, notes };
}
