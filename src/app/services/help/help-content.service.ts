import { Injectable } from '@angular/core';
import Fuse from 'fuse.js';
import { GLOSSARY, HELP_ARTICLES, HELP_CATEGORIES, GlossaryTerm, HelpArticle, HelpCategory } from '../../settings/help/content';

export interface HelpSearchResults {
  articles: HelpArticle[];
  glossaryTerms: GlossaryTerm[];
}

@Injectable({
  providedIn: 'root'
})
export class HelpContentService {
  private articleFuse = new Fuse(HELP_ARTICLES, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'keywords', weight: 1.5 },
      { name: 'body', weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  });

  private glossaryFuse = new Fuse(GLOSSARY, {
    keys: [
      { name: 'term', weight: 2 },
      { name: 'aliases', weight: 1.5 },
      { name: 'definition', weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  });

  getCategories(): HelpCategory[] {
    return [...HELP_CATEGORIES].sort((a, b) => a.order - b.order);
  }

  getArticlesByCategory(categoryId: string): HelpArticle[] {
    return HELP_ARTICLES.filter(a => a.categoryId === categoryId);
  }

  getArticle(id: string): HelpArticle | undefined {
    return HELP_ARTICLES.find(a => a.id === id);
  }

  getAllGlossaryTerms(): GlossaryTerm[] {
    return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'de'));
  }

  getGlossaryTerm(idOrSlug: string): GlossaryTerm | undefined {
    return GLOSSARY.find(g => g.id === idOrSlug);
  }

  // Matches a glossary term by its display name or one of its aliases (case-insensitive).
  findGlossaryTermByName(name: string): GlossaryTerm | undefined {
    const normalized = name.trim().toLowerCase();
    return GLOSSARY.find(g =>
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
