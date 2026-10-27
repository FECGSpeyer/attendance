// Supported UI languages. German is the source language and the fallback
// for every missing key.
export const SUPPORTED_LANGUAGES = ['de', 'en', 'ru', 'es'] as const;
export type AppLanguage = typeof SUPPORTED_LANGUAGES[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'de';

// Languages users can currently pick. Others stay hidden until their
// translations are complete (see plans/mehrsprachigkeit-konzept.md).
export const ENABLED_LANGUAGES: readonly AppLanguage[] = ['de', 'en'];

// Locale tags for Intl / toLocale*String, per UI language.
export const INTL_LOCALES: Record<AppLanguage, string> = {
  de: 'de-DE',
  en: 'en-GB',
  ru: 'ru-RU',
  es: 'es-ES',
};

export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
  ru: 'Русский',
  es: 'Español',
};

export function isSupportedLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Maps "en-US", "ru_RU", "ES" etc. to a supported language, or null. */
export function normalizeLanguage(value: string | null | undefined): AppLanguage | null {
  if (!value) {
    return null;
  }
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLanguage(base) ? base : null;
}

/**
 * Picks the UI language: an explicit user choice wins, then the device
 * languages, then German. Only enabled languages are returned.
 */
export function resolveLanguage(
  preferred: string | null | undefined,
  deviceLanguages: readonly string[] = [],
  enabled: readonly AppLanguage[] = ENABLED_LANGUAGES,
): AppLanguage {
  for (const candidate of [preferred, ...deviceLanguages]) {
    const lang = normalizeLanguage(candidate);
    if (lang && enabled.includes(lang)) {
      return lang;
    }
  }
  return DEFAULT_LANGUAGE;
}

// Active UI language for code outside Angular DI (utilities, static helpers).
// LocaleService keeps it in sync.
let activeLanguage: AppLanguage = DEFAULT_LANGUAGE;

export function setActiveLanguage(lang: AppLanguage): void {
  activeLanguage = lang;
}

export function currentLanguage(): AppLanguage {
  return activeLanguage;
}

export function currentIntlLocale(): string {
  return INTL_LOCALES[activeLanguage];
}

// Numeric date patterns for dayjs().format(...), per UI language.
const DATE_PATTERNS: Record<AppLanguage, { date: string; short: string; dayMonth: string }> = {
  de: { date: 'DD.MM.YYYY', short: 'DD.MM.YY', dayMonth: 'DD.MM.' },
  en: { date: 'DD/MM/YYYY', short: 'DD/MM/YY', dayMonth: 'DD/MM' },
  ru: { date: 'DD.MM.YYYY', short: 'DD.MM.YY', dayMonth: 'DD.MM' },
  es: { date: 'DD/MM/YYYY', short: 'DD/MM/YY', dayMonth: 'DD/MM' },
};

/** Date pattern of the active language: full date, short year, or day and month. */
export function dateFmt(kind: 'date' | 'short' | 'dayMonth' = 'date'): string {
  return DATE_PATTERNS[activeLanguage][kind];
}
