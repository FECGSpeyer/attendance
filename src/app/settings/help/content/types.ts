export interface HelpCategory {
  id: string;
  label: string;
  icon: string;
  order: number;
}

export interface HelpArticle {
  id: string;
  title: string;
  categoryId: string;
  // Extra search terms beyond the title/body (synonyms, abbreviations, etc.)
  keywords: string[];
  // Markdown body; use [[Begriff]] to link inline to a glossary entry.
  body: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  // Alternate spellings/synonyms that should also resolve to this entry.
  aliases?: string[];
  definition: string;
}

// Translation of the German help content into another UI language, keyed by
// the ids of the German categories, articles and glossary terms. Missing
// entries fall back to German.
export interface HelpArticleTranslation {
  title: string;
  keywords: string[];
  body: string;
}

export interface GlossaryTermTranslation {
  term: string;
  aliases?: string[];
  definition: string;
}

export interface HelpTranslation {
  categories: Record<string, string>;
  articles: Record<string, HelpArticleTranslation>;
  glossary: Record<string, GlossaryTermTranslation>;
}
