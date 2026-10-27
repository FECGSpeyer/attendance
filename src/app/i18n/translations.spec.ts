import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import MessageFormat from '@messageformat/core';
import { parse } from '@messageformat/parser';
import de from '../../i18n/de.json';
import en from '../../i18n/en.json';
import ru from '../../i18n/ru.json';
import es from '../../i18n/es.json';
import { DEFAULT_LANGUAGE, ENABLED_LANGUAGES, SUPPORTED_LANGUAGES } from './languages';

type Tree = { [key: string]: string | Tree };

const FILES: Record<string, Tree> = { de, en, ru, es };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out[path] = value;
    } else {
      Object.assign(out, flatten(value, path));
    }
  }
  return out;
}

/** Names of the ICU arguments ({name}, {count, plural, …}) used in a message. */
function argumentNames(message: string): string[] {
  const names = new Set<string>();
  const walk = (tokens: ReturnType<typeof parse>) => {
    for (const token of tokens) {
      if (token.type === 'argument' || token.type === 'function') {
        names.add(token.arg);
      } else if (token.type === 'plural' || token.type === 'select' || token.type === 'selectordinal') {
        names.add(token.arg);
        token.cases.forEach((c) => walk(c.tokens));
      }
    }
  };
  walk(parse(message));
  return [...names].sort();
}

const source = flatten(FILES[DEFAULT_LANGUAGE]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Literal keys passed to t('…'), translate('…') or '…' | transloco. */
function usedKeys(): Map<string, string> {
  const pattern = /(?:\bt|\btranslate|\.translate)\(\s*'([a-zA-Z0-9_.]+)'|'([a-zA-Z0-9_.]+)'\s*\|\s*transloco/g;
  const used = new Map<string, string>();
  for (const file of sourceFiles(join(__dirname, '..'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
      used.set(match[1] ?? match[2], file);
    }
  }
  return used;
}

describe('translations', () => {
  it('has a file for every supported language', () => {
    expect(Object.keys(FILES).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it('only enables supported languages, German always included', () => {
    expect(ENABLED_LANGUAGES).toContain(DEFAULT_LANGUAGE);
    ENABLED_LANGUAGES.forEach((lang) => expect(SUPPORTED_LANGUAGES).toContain(lang));
  });

  for (const lang of SUPPORTED_LANGUAGES) {
    describe(lang, () => {
      const messages = flatten(FILES[lang]);

      it('has exactly the same keys as German', () => {
        const missing = Object.keys(source).filter((k) => !(k in messages));
        const extra = Object.keys(messages).filter((k) => !(k in source));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });

      it('has no empty texts', () => {
        const empty = Object.entries(messages).filter(([, v]) => !v.trim()).map(([k]) => k);
        expect(empty).toEqual([]);
      });

      it('has valid ICU messages with the same arguments as German', () => {
        const mf = new MessageFormat(lang);
        for (const [key, message] of Object.entries(messages)) {
          expect(() => mf.compile(message), key).not.toThrow();
          if (key in source) {
            expect(argumentNames(message), key).toEqual(argumentNames(source[key]));
          }
        }
      });
    });
  }

  it('defines every key used in the code', () => {
    const missing = [...usedKeys()].filter(([key]) => !(key in source)).map(([key, file]) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });

  it('formats Russian plurals with their own forms', () => {
    const format = new MessageFormat('ru').compile(flatten(ru)['common.persons']);
    expect(format({ count: 1 })).toBe('1 человек');
    expect(format({ count: 3 })).toBe('3 человека');
    expect(format({ count: 5 })).toBe('5 человек');
  });
});
