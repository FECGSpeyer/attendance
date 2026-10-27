import { GETTING_STARTED_ARTICLES } from './articles/getting-started.articles';
import { ATTENDANCE_ARTICLES } from './articles/attendance.articles';
import { PEOPLE_ARTICLES } from './articles/people.articles';
import { PLANNING_ARTICLES } from './articles/planning.articles';
import { SONGS_ARTICLES } from './articles/songs.articles';
import { SELF_SERVICE_ARTICLES } from './articles/self-service.articles';
import { SETTINGS_ARTICLES } from './articles/settings.articles';
import { OTHER_FEATURES_ARTICLES } from './articles/other-features.articles';
import { TEAM_ORGANIZATION_ARTICLES } from './articles/team-organization.articles';
import { DUTY_ARTICLES } from './articles/duty.articles';

import { AppLanguage } from '../../../i18n/languages';
import { HELP_CATEGORIES } from './categories';
import { GLOSSARY } from './glossary';
import { GlossaryTerm, HelpArticle, HelpCategory, HelpTranslation } from './types';
import { HELP_EN } from './en';

export * from './types';
export { HELP_CATEGORIES, GLOSSARY };

export const HELP_ARTICLES = [
  ...GETTING_STARTED_ARTICLES,
  ...ATTENDANCE_ARTICLES,
  ...PEOPLE_ARTICLES,
  ...PLANNING_ARTICLES,
  ...SONGS_ARTICLES,
  ...SELF_SERVICE_ARTICLES,
  ...SETTINGS_ARTICLES,
  ...TEAM_ORGANIZATION_ARTICLES,
  ...DUTY_ARTICLES,
  ...OTHER_FEATURES_ARTICLES,
];

export const HELP_TRANSLATIONS: Partial<Record<AppLanguage, HelpTranslation>> = {
  en: HELP_EN,
};

export interface LocalizedHelp {
  categories: HelpCategory[];
  articles: HelpArticle[];
  glossary: GlossaryTerm[];
}

/**
 * Help content in the given language. Untranslated entries stay German.
 * Glossary terms keep their German name as alias, so [[Begriff]] links in
 * not yet translated articles still resolve.
 */
export function localizeHelp(lang: AppLanguage): LocalizedHelp {
  const tr = HELP_TRANSLATIONS[lang];
  if (!tr) {
    return { categories: HELP_CATEGORIES, articles: HELP_ARTICLES, glossary: GLOSSARY };
  }
  return {
    categories: HELP_CATEGORIES.map(c => ({ ...c, label: tr.categories[c.id] ?? c.label })),
    articles: HELP_ARTICLES.map(a => ({ ...a, ...tr.articles[a.id] })),
    glossary: GLOSSARY.map(g => {
      const t = tr.glossary[g.id];
      return t ? { ...g, ...t, aliases: [...(t.aliases ?? []), g.term, ...(g.aliases ?? [])] } : g;
    }),
  };
}
