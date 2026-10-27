import { Injectable } from '@angular/core';
import Fuse from 'fuse.js';
import { GlossaryTerm, HelpArticle, HelpCategory, localizeHelp } from '../../settings/help/content';
import { currentIntlLocale, currentLanguage } from '../../i18n/languages';

export interface HelpSearchResults {
  articles: HelpArticle[];
  glossaryTerms: GlossaryTerm[];
}

@Injectable({
  providedIn: 'root'
})
export class HelpContentService {
  // The language is fixed for the app session (switching reloads the app).
  private readonly help = localizeHelp(currentLanguage());

  private articleFuse = new Fuse(this.help.articles, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'keywords', weight: 1.5 },
      { name: 'body', weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  });

  private glossaryFuse = new Fuse(this.help.glossary, {
    keys: [
      { name: 'term', weight: 2 },
      { name: 'aliases', weight: 1.5 },
      { name: 'definition', weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  });

  getCategories(): HelpCategory[] {
    return [...this.help.categories].sort((a, b) => a.order - b.order);
  }

  getArticlesByCategory(categoryId: string): HelpArticle[] {
    return this.help.articles.filter(a => a.categoryId === categoryId);
  }

  getArticle(id: string): HelpArticle | undefined {
    return this.help.articles.find(a => a.id === id);
  }

  getAllGlossaryTerms(): GlossaryTerm[] {
    return [...this.help.glossary].sort((a, b) => a.term.localeCompare(b.term, currentIntlLocale()));
  }

  getGlossaryTerm(idOrSlug: string): GlossaryTerm | undefined {
    return this.help.glossary.find(g => g.id === idOrSlug);
  }

  // Matches a glossary term by its display name or one of its aliases (case-insensitive).
  findGlossaryTermByName(name: string): GlossaryTerm | undefined {
    const normalized = name.trim().toLowerCase();
    return this.help.glossary.find(g =>
      g.term.toLowerCase() === normalized || g.aliases?.some(a => a.toLowerCase() === normalized)
    );
  }

  search(query: string): HelpSearchResults {
    const term = query.trim();
    if (!term) { return { articles: [], glossaryTerms: [] }; }

    return {
      articles: this.articleFuse.search(term).map(r => r.item),
      glossaryTerms: this.glossaryFuse.search(term).map(r => r.item),
    };
  }
}
