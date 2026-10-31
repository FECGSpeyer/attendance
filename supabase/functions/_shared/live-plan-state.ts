// supabase/functions/_shared/live-plan-state.ts
// Schedule + live state of a running Ablaufplan, shared by the app
// (src/app/utilities/live-plan.ts re-exports it) and the
// `live-activity-tick` Edge Function. No imports on purpose, so it runs
// unchanged in Angular and Deno.

/** Minutes before the first item when the Live Activity appears. */
export const LIVE_LEAD_MINUTES = 15;
/** Minutes after the last item the finished Live Activity stays visible. */
export const LIVE_TAIL_MINUTES = 15;

/** Marker field for agenda items in team plans; takes no time and is not shown. */
const AGENDA_ITEMS_PLACEHOLDER_ID = 'agenda-items-placeholder';

export interface LivePlanField {
  id?: string;
  name?: string;
  time?: string | number;
  conductor?: string;
  agendaItemId?: string;
}

export interface LivePlanInput {
  /** attendance.date (timestamptz or YYYY-MM-DD); its calendar day in `timezone` is day 0. */
  date: string;
  /** plan.time: "HH:mm" or a date time whose clock time is used. */
  planTime: string;
  /** Day within a multi-day Termin, 0 = first day. */
  dayOffset?: number;
  fields: LivePlanField[];
  /** IANA timezone the plan times are meant in. */
  timezone: string;
}

export interface LivePlanItem {
  name: string;
  subtitle: string;
  /** Epoch milliseconds. */
  start: number;
  end: number;
}

export interface LiveNextItem {
  name: string;
  /** Epoch seconds. */
  at: number;
}

/**
 * What a Live Activity shows. Times are epoch seconds so Swift/Kotlin decode
 * them without date-format guessing. Keep the keys in sync with
 * PlanActivityAttributes.ContentState (iOS) and LiveActivityPlugin (Android).
 */
export interface LivePlanState {
  phase: 'before' | 'running' | 'ended';
  /** 1-based position of the current item. */
  index: number;
  total: number;
  title: string;
  subtitle: string;
  startsAt: number;
  endsAt: number;
  next: LiveNextItem[];
  planStart: number;
  planEnd: number;
  /** Start of every item (epoch seconds), for the widget's timeline bar; the last one ends at planEnd. */
  bounds?: number[];
  /** Accent colour of the widget (hex, from the Termin type); missing means the default teal. */
  color?: string;
}

/**
 * Ionic colour names of attendance_types.color as hex, in their dark-mode shade
 * because the widgets have a dark background. Hex values pass through.
 */
const LIVE_COLORS: Record<string, string> = {
  primary: '#5eb8bf',
  secondary: '#50c8ff',
  tertiary: '#8a85ff',
  success: '#25b15d',
  warning: '#ffd534',
  danger: '#ff4961',
  rosa: '#be72c0',
  mint: '#36c2c4',
  orange: '#ec8d09',
  holiday: '#c07a90',
  medium: '#989aa2',
};

/** Widget accent for a Termin type colour, or undefined for the default. */
export function liveColor(typeColor: string | null | undefined): string | undefined {
  const value = typeColor?.trim().toLowerCase();
  if (!value) return undefined;
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  return LIVE_COLORS[value];
}

/** State with the Termin type's accent colour attached (no-op without one). */
export function withLiveColor(state: LivePlanState | null, typeColor: string | null | undefined): LivePlanState | null {
  const color = liveColor(typeColor);
  return state && color ? { ...state, color } : state;
}

/** Offset of `timezone` from UTC at the given instant, in milliseconds. */
function tzOffset(utcMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Epoch ms of a wall-clock time in `timezone`. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - tzOffset(guess, timezone);
  // Second pass settles DST changes between the guess and the result.
  result = guess - tzOffset(result, timezone);
  return result;
}

/** Calendar day (y, m, d) of an instant in `timezone`. */
function localDay(value: string, timezone: string): { year: number; month: number; day: number } | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return { year, month, day };
  }
  // Postgres returns "2026-10-21 10:00:00+00"; make it ISO for Date.parse.
  const iso = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) { return null; }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Clock time of plan.time ("HH:mm" or "YYYY-MM-DDTHH:mm[:ss]"). */
function clockTime(value: string): { hour: number; minute: number } | null {
  const match = /(?:^|T|\s)(\d{1,2}):(\d{2})/.exec(value ?? '');
  if (!match) { return null; }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** "TOP n · Name" for agenda items, like the plan viewer. */
function displayNames(fields: LivePlanField[]): string[] {
  let top = 0;
  return fields.map(f => {
    const name = (f.name ?? '').trim();
    return f.agendaItemId ? `TOP ${++top} · ${name}` : name;
  });
}

/** Start and end of every item of a plan, in order. Empty when the plan has no usable start time. */
export function buildSchedule(input: LivePlanInput): LivePlanItem[] {
  const day = localDay(input.date, input.timezone);
  const clock = clockTime(input.planTime);
  if (!day || !clock) { return []; }
  const fields = (input.fields ?? []).filter(f => f && f.id !== AGENDA_ITEMS_PLACEHOLDER_ID);
  const names = displayNames(fields);
  // Date.UTC normalises day overflow, so adding the offset to the day is safe.
  let cursor = zonedTimeToUtc(day.year, day.month, day.day + (input.dayOffset ?? 0), clock.hour, clock.minute, input.timezone);
  return fields.map((f, i) => {
    const minutes = parseInt(String(f.time ?? 0), 10) || 0;
    const item: LivePlanItem = {
      name: names[i] || 'Programmpunkt',
      subtitle: (f.conductor ?? '').trim(),
      start: cursor,
      end: cursor + minutes * 60_000,
    };
    cursor = item.end;
    return item;
  });
}

/** Window in which a Live Activity for this schedule should exist (epoch ms). */
export function liveWindow(schedule: LivePlanItem[]): { from: number; to: number } | null {
  if (!schedule.length) { return null; }
  return {
    from: schedule[0].start - LIVE_LEAD_MINUTES * 60_000,
    to: schedule[schedule.length - 1].end + LIVE_TAIL_MINUTES * 60_000,
  };
}

const sec = (ms: number) => Math.floor(ms / 1000);

/** What the Live Activity shows at `now`; null outside the live window. */
export function liveStateAt(schedule: LivePlanItem[], now: number): LivePlanState | null {
  const window = liveWindow(schedule);
  if (!window || now < window.from || now >= window.to) { return null; }
  const planStart = schedule[0].start;
  const planEnd = schedule[schedule.length - 1].end;
  const total = schedule.length;
  const nextFrom = (i: number) => schedule.slice(i, i + 2).map(item => ({ name: item.name, at: sec(item.start) }));
  const bounds = schedule.map(item => sec(item.start));

  if (now < planStart) {
    const first = schedule[0];
    return {
      phase: 'before', index: 1, total,
      title: first.name, subtitle: first.subtitle,
      startsAt: sec(first.start), endsAt: sec(first.end),
      next: nextFrom(1), planStart: sec(planStart), planEnd: sec(planEnd), bounds,
    };
  }
  if (now >= planEnd) {
    return {
      phase: 'ended', index: total, total,
      title: 'Ablaufplan beendet', subtitle: '',
      startsAt: sec(planStart), endsAt: sec(planEnd),
      next: [], planStart: sec(planStart), planEnd: sec(planEnd), bounds,
    };
  }
  // Zero-length items are skipped; the item whose end lies after now is current.
  const idx = schedule.findIndex(item => now < item.end);
  const current = schedule[idx];
  return {
    phase: 'running', index: idx + 1, total,
    title: current.name, subtitle: current.subtitle,
    startsAt: sec(current.start), endsAt: sec(current.end),
    next: nextFrom(idx + 1), planStart: sec(planStart), planEnd: sec(planEnd), bounds,
  };
}

/**
 * State as the iOS widget gets it. The widget shows a countdown next to the
 * title; before the start that read like the remaining time of the first item.
 * So the title becomes "Beginnt in" and the first item moves into the list.
 * Done in the data so it reaches installed widgets without a new build.
 */
export function iosLiveState(state: LivePlanState): LivePlanState {
  if (state.phase !== 'before') { return state; }
  const first = state.subtitle ? `${state.title} · ${state.subtitle}` : state.title;
  return {
    ...state,
    title: 'Beginnt in',
    subtitle: '',
    next: [{ name: first, at: state.startsAt }, ...state.next],
  };
}

/** Stable fingerprint of a state, to send an update only when something visible changed. */
export function liveStateKey(state: LivePlanState | null): string {
  return state ? JSON.stringify(state) : 'none';
}
