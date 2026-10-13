// supabase/functions/_shared/message-render.ts
// Renders a Tiptap document (the Mitteilungen editor's JSON) into
// allowlisted HTML and plain text. The client only ever sends the JSON; all
// HTML stored in messages.body_html and sent by email is produced here, so no
// markup or script from the client can reach recipients.
//
// Supported nodes: doc, paragraph, heading (h2/h3), bulletList, orderedList,
// listItem, hardBreak, text. Supported marks: bold, italic, underline,
// strike, link (http/https/mailto/tel only). Anything else is dropped (its
// text content is kept).

import { escapeHtml } from './attendix-email-templates.ts';

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type?: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
}

const MAX_DEPTH = 20;

export function safeHref(raw: unknown): string | null {
  const href = String(raw ?? '').trim();
  if (!href) return null;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  // Bare domains typed without a scheme ("attendix.de") → https.
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(href)) return `https://${href}`;
  return null;
}

function renderMarks(text: string, marks: Mark[] | undefined, linkStyle: string): string {
  let html = escapeHtml(text);
  if (!marks) return html;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': html = `<strong>${html}</strong>`; break;
      case 'italic': html = `<em>${html}</em>`; break;
      case 'underline': html = `<u>${html}</u>`; break;
      case 'strike': html = `<s>${html}</s>`; break;
      case 'link': {
        const href = safeHref(mark.attrs?.href);
        if (href) {
          html = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${linkStyle}>${html}</a>`;
        }
        break;
      }
    }
  }
  return html;
}

export interface RenderOptions {
  /** Inline styles for email clients; empty for the in-app view. */
  email?: boolean;
}

export function renderHtml(doc: TiptapNode, opts: RenderOptions = {}): string {
  const s = opts.email
    ? {
      p: ' style="margin:0 0 14px 0; font-size:15px; line-height:1.6; color:#4a4a4a;"',
      h2: ' style="margin:20px 0 10px 0; font-size:18px; font-weight:600; color:#2b2b2b;"',
      h3: ' style="margin:16px 0 8px 0; font-size:16px; font-weight:600; color:#2b2b2b;"',
      list: ' style="margin:0 0 14px 0; padding-left:22px; font-size:15px; line-height:1.6; color:#4a4a4a;"',
      li: ' style="margin:2px 0;"',
      a: ' style="color:#438e96;"',
    }
    : { p: '', h2: '', h3: '', list: '', li: '', a: '' };

  const render = (node: TiptapNode, depth: number): string => {
    if (!node || depth > MAX_DEPTH) return '';
    const children = () => (Array.isArray(node.content) ? node.content.map(c => render(c, depth + 1)).join('') : '');

    switch (node.type) {
      case 'doc': return children();
      case 'text': return renderMarks(String(node.text ?? ''), node.marks, s.a);
      case 'hardBreak': return '<br>';
      case 'paragraph': {
        const inner = children();
        return `<p${s.p}>${inner || '<br>'}</p>`;
      }
      case 'heading': {
        const level = Number(node.attrs?.level) >= 3 ? 'h3' : 'h2';
        return `<${level}${level === 'h2' ? s.h2 : s.h3}>${children()}</${level}>`;
      }
      case 'bulletList': return `<ul${s.list}>${children()}</ul>`;
      case 'orderedList': return `<ol${s.list}>${children()}</ol>`;
      case 'listItem': {
        // List items wrap their text in paragraphs; render them inline so
        // email clients don't add paragraph margins inside bullets.
        const inner = (node.content ?? []).map(c => {
          if (c.type === 'paragraph') {
            return (c.content ?? []).map(cc => render(cc, depth + 2)).join('');
          }
          return render(c, depth + 1);
        }).join('<br>');
        return `<li${s.li}>${inner}</li>`;
      }
      default:
        // Unknown node: keep its text, drop its markup.
        return children();
    }
  };

  return render(doc, 0);
}

export function renderText(doc: TiptapNode): string {
  const blocks: string[] = [];

  const inline = (node: TiptapNode, depth: number): string => {
    if (!node || depth > MAX_DEPTH) return '';
    if (node.type === 'text') return String(node.text ?? '');
    if (node.type === 'hardBreak') return '\n';
    return (node.content ?? []).map(c => inline(c, depth + 1)).join('');
  };

  const block = (node: TiptapNode, depth: number, prefix = ''): void => {
    if (!node || depth > MAX_DEPTH) return;
    switch (node.type) {
      case 'doc':
        (node.content ?? []).forEach(c => block(c, depth + 1));
        return;
      case 'bulletList':
        (node.content ?? []).forEach(item => blocks.push(`${prefix}• ${listItemText(item, depth)}`));
        return;
      case 'orderedList': {
        const start = Number(node.attrs?.start) || 1;
        (node.content ?? []).forEach((item, i) => blocks.push(`${prefix}${start + i}. ${listItemText(item, depth)}`));
        return;
      }
      default:
        blocks.push(inline(node, depth + 1));
    }
  };

  const listItemText = (item: TiptapNode, depth: number): string =>
    (item.content ?? []).map(c => {
      if (c.type === 'bulletList' || c.type === 'orderedList') {
        const nested: string[] = [];
        const isOrdered = c.type === 'orderedList';
        (c.content ?? []).forEach((n, i) => nested.push(`  ${isOrdered ? `${i + 1}.` : '•'} ${listItemText(n, depth + 1)}`));
        return '\n' + nested.join('\n');
      }
      return inline(c, depth + 1);
    }).join(' ').replace(/ \n/g, '\n');

  block(doc, 0);

  // Paragraphs separated by blank lines; consecutive list items stay together.
  let out = '';
  blocks.forEach((b, i) => {
    if (i === 0) { out = b; return; }
    const prevIsItem = /^(• |\d+\. )/.test(blocks[i - 1]);
    const curIsItem = /^(• |\d+\. )/.test(b);
    out += (prevIsItem && curIsItem) ? '\n' + b : '\n\n' + b;
  });
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
