import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import 'dayjs/locale/ru';
import 'dayjs/locale/es';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { supabase } from '../services/base/supabase';
import { AppLanguage, DEFAULT_LANGUAGE, ENABLED_LANGUAGES, INTL_LOCALES, normalizeLanguage, resolveLanguage, setActiveLanguage } from './languages';

const STORAGE_KEY = 'appLanguage';

/**
 * Single source of truth for the UI language: drives Transloco, dayjs,
 * Intl formatting and <html lang>. Code should use `dayjsLocale` and
 * `intlLocale` instead of hard-coding 'de' / 'de-DE'.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private transloco = inject(TranslocoService);
  private languageSubject = new BehaviorSubject<AppLanguage>(DEFAULT_LANGUAGE);

  readonly language$ = this.languageSubject.asObservable();

  get language(): AppLanguage {
    return this.languageSubject.value;
  }

  /** Locale tag for dayjs().locale(...). */
  get dayjsLocale(): string {
    return this.language;
  }

  /** Locale tag for Intl APIs and toLocale*String. */
  get intlLocale(): string {
    return INTL_LOCALES[this.language];
  }

  /**
   * Applies the stored choice (or device language) at app start and loads
   * its translations, so the first screen never shows raw keys.
   */
  async init(): Promise<void> {
    const lang = resolveLanguage(this.readStored(), this.deviceLanguages());
    this.apply(lang);
    try {
      await firstValueFrom(this.transloco.load(lang));
    } catch (e) {
      console.error('Übersetzungen konnten nicht geladen werden', e);
    }
  }

  /**
   * Sets the language chosen by the user, e.g. from the profile/settings.
   * Unknown or not yet enabled languages fall back to German.
   */
  setLanguage(value: string | null | undefined): AppLanguage {
    const lang = normalizeLanguage(value);
    const next = lang && ENABLED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies.
    }
    this.apply(next);
    return next;
  }

  /**
   * Keeps the account's language (notifications.language, used for push,
   * Telegram and emails) in line with the app: a choice made on this device
   * is written to the account, otherwise a choice from another device is
   * applied here.
   */
  async syncWithAccount(userId: string): Promise<void> {
    try {
      const { data } = await supabase.from('notifications').select('language').eq('id', userId).maybeSingle();
      const account = normalizeLanguage(data?.language);
      const stored = normalizeLanguage(this.readStored());
      if (stored) {
        if (data && account !== stored) {
          await this.saveToAccount(userId, stored);
        }
        return;
      }
      if (account && ENABLED_LANGUAGES.includes(account) && account !== this.language) {
        this.setLanguage(account);
      }
    } catch (e) {
      console.error('Sprache konnte nicht abgeglichen werden', e);
    }
  }

  /** Stores the language on the account so server messages use it too. */
  async saveToAccount(userId: string, lang: AppLanguage = this.language): Promise<void> {
    const { error } = await supabase.from('notifications').update({ language: lang } as any).eq('id', userId);
    if (error) {
      console.error('Sprache konnte nicht gespeichert werden', error);
    }
  }

  private apply(lang: AppLanguage): void {
    setActiveLanguage(lang);
    this.transloco.setActiveLang(lang);
    dayjs.locale(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
    if (this.languageSubject.value !== lang) {
      this.languageSubject.next(lang);
    }
  }

  private readStored(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private deviceLanguages(): readonly string[] {
    if (typeof navigator === 'undefined') {
      return [];
    }
    return navigator.languages?.length ? navigator.languages : [navigator.language];
  }
}
