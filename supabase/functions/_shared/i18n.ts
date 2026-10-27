// supabase/functions/_shared/i18n.ts
// Language handling for server texts (push, Telegram, email, calendar).
// The user's language is notifications.language, the instance default is
// tenants.default_language (see supabase/sql/add_language_columns.sql).
// German is the source and the fallback for every missing text.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SERVER_TEXTS } from './server-texts.ts'

export type Lang = 'de' | 'en' | 'ru' | 'es';

const SUPPORTED: readonly Lang[] = ['de', 'en', 'ru', 'es'];
// Languages with complete server texts; others fall back to German.
const ENABLED: readonly Lang[] = ['de', 'en'];

const INTL_LOCALES: Record<Lang, string> = { de: 'de-DE', en: 'en-GB', ru: 'ru-RU', es: 'es-ES' };

export function normalizeLang(value: unknown): Lang {
  const base = typeof value === 'string' ? value.trim().toLowerCase().split(/[-_]/)[0] : '';
  return (SUPPORTED as readonly string[]).includes(base) && ENABLED.includes(base as Lang) ? base as Lang : 'de';
}

export function intlLocale(lang: Lang): string {
  return INTL_LOCALES[lang];
}

/** Picks the right plural form ("one" or "other") for a count. */
function plural(lang: Lang, count: number, forms: Record<string, string>): string {
  const rule = new Intl.PluralRules(INTL_LOCALES[lang]).select(count);
  return (forms[rule] ?? forms.other ?? '').replace(/#/g, String(count));
}

/**
 * Server text in the given language. Parameters are written as {name};
 * plurals as {count, plural, one {# item} other {# items}}.
 */
export function t(lang: Lang, key: string, params: Record<string, unknown> = {}): string {
  const text = SERVER_TEXTS[lang]?.[key] ?? SERVER_TEXTS.de[key] ?? key;
  return format(lang, text, params);
}

function format(lang: Lang, text: string, params: Record<string, unknown>): string {
  // Plurals first: {count, plural, one {...} other {...}} (one nesting level).
  const withPlurals = text.replace(/\{(\w+), plural,((?:\s*\w+\s*\{[^{}]*\})+)\s*\}/g, (_m, name: string, body: string) => {
    const forms: Record<string, string> = {};
    for (const f of body.matchAll(/(\w+)\s*\{([^{}]*)\}/g)) {
      forms[f[1]] = f[2];
    }
    return plural(lang, Number(params[name] ?? 0), forms);
  });
  return withPlurals.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name] ?? '') : m));
}

/** Language per user id, from notifications.language. Unknown users get German. */
export async function userLanguages(admin: SupabaseClient, userIds: string[]): Promise<Map<string, Lang>> {
  const result = new Map<string, Lang>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) {
    return result;
  }
  const { data, error } = await admin.from('notifications').select('id, language').in('id', ids);
  if (error) {
    console.error('userLanguages failed', error);
    return result;
  }
  for (const row of data ?? []) {
    result.set(row.id, normalizeLang(row.language));
  }
  return result;
}

/** Default language of an instance (tenants.default_language). */
export async function tenantLanguage(admin: SupabaseClient, tenantId: number): Promise<Lang> {
  const { data, error } = await admin.from('tenants').select('default_language').eq('id', tenantId).maybeSingle();
  if (error) {
    console.error('tenantLanguage failed', error);
    return 'de';
  }
  return normalizeLang(data?.default_language);
}

const DATE_SEPARATOR: Record<Lang, string> = { de: '.', en: '/', ru: '.', es: '/' };

/** "2026-10-18" (or an ISO timestamp) as 18.10.2026 / 18/10/2026. */
export function formatDate(lang: Lang, value: string | null | undefined): string {
  const text = String(value ?? '');
  // Plain dates are formatted as they are to avoid a timezone shift.
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const sep = DATE_SEPARATOR[lang];
    return `${m[3]}${sep}${m[2]}${sep}${m[1]}`;
  }
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) {
    return text;
  }
  return date.toLocaleDateString(INTL_LOCALES[lang], {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
  });
}

/** Day and month only: 18.10. / 18/10. */
export function formatDayMonth(lang: Lang, value: string | null | undefined): string {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    return String(value ?? '');
  }
  return lang === 'de' ? `${m[3]}.${m[2]}.` : `${m[3]}${DATE_SEPARATOR[lang]}${m[2]}`;
}
