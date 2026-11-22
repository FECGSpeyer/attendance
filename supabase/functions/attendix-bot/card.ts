// Termin card in Telegram chats: text, buttons and who a Telegram user is in Attendix.
// deno-lint-ignore-file no-explicit-any

import { intlLocale, Lang, normalizeLang, t } from '../_shared/i18n.ts';
import {
  LoadedAttendance,
  loadAttendanceRules,
  STATUS_ABSENT,
  STATUS_EXCUSED,
  STATUS_LATE,
  STATUS_LATE_EXCUSED,
  STATUS_NEUTRAL,
  STATUS_PRESENT,
} from '../_shared/self-status.ts';
import { escapeHtml } from './telegram.ts';

export const BOT_USERNAME = Deno.env.get('TELEGRAM_BOT_USERNAME') || 'attendix_bot';
export const MINIAPP_NAME = Deno.env.get('TELEGRAM_MINIAPP_NAME') || 'termin';

export interface CardRow {
  id: number;
  key: string;
  attendance_id: number;
  tenant_id: number;
  chat_id: number;
  message_id: number;
}

export function cardLanguage(loaded: LoadedAttendance): Lang {
  return normalizeLang(loaded.a.tenant?.default_language);
}

export async function loadCardAttendance(supabase: any, card: Pick<CardRow, 'attendance_id' | 'tenant_id'>) {
  return loadAttendanceRules(supabase, Number(card.attendance_id), [Number(card.tenant_id)]);
}

function formatDay(lang: Lang, date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) { return date; }
  return d.toLocaleDateString(intlLocale(lang), {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  });
}

function hhmm(value: string | null | undefined): string | null {
  return /^\d{2}:\d{2}/.exec(value ?? '')?.[0] ?? null;
}

/** "YYYY-MM-DDTHH:MM" wall clock as "Fr., 27.11.2026, 18:00". */
function formatWallClock(lang: Lang, wall: string): string {
  const [date, time] = wall.split('T');
  return `${formatDay(lang, date)}, ${t(lang, 'tgcard.clock', { time })}`;
}

export function attendanceLink(a: any): string {
  return `https://attendix.de/open-attendance?id=${a.id}&tenantId=${a.tenantId}`;
}

export function cardTitle(a: any): string {
  const type = a.type?.name ? String(a.type.name) : '';
  const info = a.typeInfo ? String(a.typeInfo) : '';
  if (type && info && info !== type) { return `${type} · ${info}`; }
  return info || type || 'Termin';
}

export function cardWhen(lang: Lang, loaded: LoadedAttendance): string {
  const { a, date } = loaded;
  const start = hhmm(a.start_time);
  const end = hhmm(a.end_time);
  const time = start ? t(lang, 'tgcard.clock', { time: end ? `${start}–${end}` : start }) : '';
  return time ? `${formatDay(lang, date)}, ${time}` : formatDay(lang, date);
}

async function counts(supabase: any, attendanceId: number) {
  const { data } = await supabase
    .from('person_attendances')
    .select('status')
    .eq('attendance_id', attendanceId)
    .limit(5000);
  const c = { present: 0, late: 0, excused: 0, open: 0 };
  for (const row of (data ?? []) as any[]) {
    const s = row.status ?? STATUS_NEUTRAL;
    if (s === STATUS_PRESENT || s === STATUS_LATE) { c.present++; }
    else if (s === STATUS_LATE_EXCUSED) { c.late++; }
    else if (s === STATUS_EXCUSED || s === STATUS_ABSENT) { c.excused++; }
    else { c.open++; }
  }
  return c;
}

/** Text (HTML) and inline keyboard of the card. */
export async function renderCard(supabase: any, loaded: LoadedAttendance, key: string) {
  const lang = cardLanguage(loaded);
  const { a, deadline, rules } = loaded;
  const ensemble = a.tenant?.longName || a.tenant?.shortName || '';
  const lines = [`<b>${escapeHtml(cardTitle(a))}</b>`];
  if (ensemble) { lines.push(`<i>${escapeHtml(String(ensemble))}</i>`); }
  lines.push(`🗓 ${escapeHtml(cardWhen(lang, loaded))}`);
  if (a.place) { lines.push(`📍 ${escapeHtml(String(a.place))}`); }
  if (deadline && !rules.past) {
    lines.push(t(lang, rules.deadlinePassed ? 'tgcard.deadlinePassed' : 'tgcard.deadline', { when: formatWallClock(lang, deadline) }));
  }
  const c = await counts(supabase, a.id);
  lines.push('', t(lang, 'tgcard.counts', c), `<i>${escapeHtml(t(lang, 'tgcard.legend'))}</i>`);
  if (rules.past) { lines.push('', escapeHtml(t(lang, 'tgcard.past'))); }

  const appLink = (mode: 'x' | 'l') => `https://t.me/${BOT_USERNAME}/${MINIAPP_NAME}?startapp=${key}-${mode}`;
  const actions: any[] = [];
  if (!rules.past) {
    if (!rules.deadlinePassed) { actions.push({ text: t(lang, 'tgcard.signin'), callback_data: `p:${key}` }); }
    if (rules.allowLate) { actions.push({ text: t(lang, 'tgcard.late'), url: appLink('l') }); }
    if (rules.allowExcuse) { actions.push({ text: t(lang, 'tgcard.signout'), url: appLink('x') }); }
  }
  const keyboard = [
    ...(actions.length ? [actions] : []),
    [
      ...(rules.past ? [] : [{ text: t(lang, 'tgcard.refresh'), callback_data: `r:${key}` }]),
      { text: t(lang, 'tgcard.open'), url: attendanceLink(a) },
    ],
  ];
  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  };
}

export interface LinkedPerson {
  personId: number;
  name: string;
  status: number;
  notes: string;
  lang: Lang | null;
}

/**
 * Persons of a Telegram user in one Termin: accounts whose notification settings carry
 * this Telegram chat id (linked via @attendix_bot), their persons in the Termin's tenant,
 * and only those invited to the Termin. linked=false when no account is linked at all.
 */
export async function personsForTelegramUser(
  supabase: any,
  telegramUserId: number,
  loaded: LoadedAttendance,
): Promise<{ linked: boolean; persons: LinkedPerson[]; lang: Lang | null }> {
  const { data: accounts } = await supabase
    .from('notifications')
    .select('id, language')
    .eq('telegram_chat_id', String(telegramUserId))
    .limit(20);
  const rows = (accounts ?? []) as any[];
  if (!rows.length) { return { linked: false, persons: [], lang: null }; }
  const lang = rows[0].language ? normalizeLang(rows[0].language) : null;

  const { data: players } = await supabase
    .from('player')
    .select('id, firstName, lastName, appId, left, pending')
    .eq('tenantId', loaded.a.tenantId)
    .in('appId', rows.map(r => r.id))
    .is('left', null);
  const people = ((players ?? []) as any[]).filter(p => !p.pending);
  if (!people.length) { return { linked: true, persons: [], lang }; }

  const { data: pas } = await supabase
    .from('person_attendances')
    .select('person_id, status, notes')
    .eq('attendance_id', loaded.a.id)
    .in('person_id', people.map(p => p.id));
  const byPerson = new Map(((pas ?? []) as any[]).map(r => [Number(r.person_id), r]));
  const persons = people
    .filter(p => byPerson.has(Number(p.id)))
    .map(p => {
      const pa = byPerson.get(Number(p.id));
      return {
        personId: Number(p.id),
        name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
        status: pa.status ?? STATUS_NEUTRAL,
        notes: pa.notes || '',
        lang,
      };
    });
  return { linked: true, persons, lang };
}
