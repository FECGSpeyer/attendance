import { marked } from 'marked';

marked.setOptions({ breaks: true });

/**
 * Renders a help article's markdown body to HTML, turning `[[Term]]` or
 * `[[Term|Anzeigetext]]` references into clickable glossary links.
 * The resulting HTML is meant for a plain [innerHTML] binding — Angular's
 * built-in sanitizer strips anything unsafe, and this content is authored
 * in-repo (never user input), so no bypassSecurityTrustHtml is needed.
 *
 * The term name is carried via `href="#..."` rather than a `data-*` attribute
 * because Angular's sanitizer strips unrecognized attributes (including
 * `data-*`) from bound [innerHTML], but keeps safe `href` values.
 */
export function renderArticleHtml(body: string): string {
  const withGlossaryLinks = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, term: string, display?: string) => {
    const label = (display ?? term).trim();
    return `<a class="glossary-term" href="#${encodeURIComponent(term.trim())}">${label}</a>`;
  });

  return marked.parse(withGlossaryLinks, { async: false }) as string;
}

// Glossary definitions may themselves reference other terms via [[Term]]; those
// are rendered as plain emphasis here rather than nested clickable links.
export function renderGlossaryDefinitionHtml(definition: string): string {
  const plain = definition.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, term: string, display?: string) => {
    return `<em>${(display ?? term).trim()}</em>`;
  });

  return marked.parse(plain, { async: false }) as string;
}
