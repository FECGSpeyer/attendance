import { describe, expect, it } from 'vitest';
import { normalizeLanguage, resolveLanguage } from './languages';

describe('normalizeLanguage', () => {
  it('maps region and casing variants', () => {
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('ru_RU')).toBe('ru');
    expect(normalizeLanguage('ES')).toBe('es');
    expect(normalizeLanguage('de')).toBe('de');
  });

  it('rejects unknown or empty values', () => {
    expect(normalizeLanguage('fr-FR')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });
});

describe('resolveLanguage', () => {
  const all = ['de', 'en', 'ru', 'es'] as const;

  it('prefers the stored choice', () => {
    expect(resolveLanguage('es', ['en-US'], all)).toBe('es');
  });

  it('falls back to the first supported device language', () => {
    expect(resolveLanguage(null, ['fr-FR', 'ru-RU', 'en'], all)).toBe('ru');
  });

  it('ignores languages that are not enabled yet', () => {
    expect(resolveLanguage('en', ['en-US'], ['de'])).toBe('de');
  });

  it('defaults to German', () => {
    expect(resolveLanguage(null, ['fr-FR'], all)).toBe('de');
  });
});
