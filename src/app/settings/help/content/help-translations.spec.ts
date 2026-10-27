import { describe, expect, it } from 'vitest';
import { ENABLED_LANGUAGES, DEFAULT_LANGUAGE } from '../../../i18n/languages';
import { GLOSSARY, HELP_ARTICLES, HELP_CATEGORIES, HELP_TRANSLATIONS, localizeHelp } from './index';

const GLOSSARY_LINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

// Every enabled language other than German needs the complete help.
const translated = ENABLED_LANGUAGES.filter(lang => lang !== DEFAULT_LANGUAGE);

describe('help translations', () => {
  translated.forEach(lang => {
    describe(lang, () => {
      const tr = HELP_TRANSLATIONS[lang]!;

      it('exists', () => {
        expect(tr).toBeDefined();
      });

      it('covers every category, article and glossary term', () => {
        expect(HELP_CATEGORIES.filter(c => !tr.categories[c.id]).map(c => c.id)).toEqual([]);
        expect(HELP_ARTICLES.filter(a => !tr.articles[a.id]).map(a => a.id)).toEqual([]);
        expect(GLOSSARY.filter(g => !tr.glossary[g.id]).map(g => g.id)).toEqual([]);
      });

      it('has no entries for unknown ids', () => {
        const articleIds = new Set(HELP_ARTICLES.map(a => a.id));
        const termIds = new Set(GLOSSARY.map(g => g.id));
        expect(Object.keys(tr.articles).filter(id => !articleIds.has(id))).toEqual([]);
        expect(Object.keys(tr.glossary).filter(id => !termIds.has(id))).toEqual([]);
      });

      it('links only to glossary terms that exist in this language', () => {
        const help = localizeHelp(lang);
        const names = new Set(help.glossary.flatMap(g => [g.term, ...(g.aliases ?? [])].map(n => n.toLowerCase())));
        const known = new Set(HELP_ARTICLES.flatMap(a => [...a.body.matchAll(GLOSSARY_LINK)].map(m => m[1].trim().toLowerCase()))
          .filter(n => !GLOSSARY.some(g => [g.term, ...(g.aliases ?? [])].some(x => x.toLowerCase() === n))));
        const broken = [...help.articles, ...help.glossary.map(g => ({ id: g.id, body: g.definition }))]
          .flatMap(a => [...a.body.matchAll(GLOSSARY_LINK)].map(m => m[1].trim().toLowerCase()))
          .filter(n => !names.has(n) && !known.has(n));
        expect([...new Set(broken)]).toEqual([]);
      });
    });
  });
});
