import { describe, expect, it, vi } from 'vitest';

vi.mock('../base/supabase', () => ({ supabase: {} }));

import { fillPlaceholders, personalizeMessage, textToDoc } from './auto-message.service';
import { Message, MessageRecipient } from '../../utilities/interfaces';

describe('fillPlaceholders', () => {
  it('replaces known placeholders and keeps unknown ones', () => {
    expect(fillPlaceholders('Hallo {vorname}, {unbekannt}', { vorname: 'Lena' })).toBe('Hallo Lena, {unbekannt}');
  });

  it('escapes values for HTML', () => {
    expect(fillPlaceholders('<p>{name}</p>', { name: '<b>X</b>' }, true)).toBe('<p>&lt;b&gt;X&lt;/b&gt;</p>');
  });
});

describe('textToDoc', () => {
  it('turns blank lines into paragraphs and single newlines into breaks', () => {
    const doc = textToDoc('A\n\nB\nC') as any;
    expect(doc.content).toHaveLength(2);
    expect(doc.content[1].content.map((n: any) => n.type)).toEqual(['text', 'hardBreak', 'text']);
  });
});

describe('personalizeMessage', () => {
  const message = {
    title: 'Wir haben dich vermisst, {vorname}',
    body_html: '<p>Hallo {vorname}, {termin}</p>',
    vars: { termin: 'Probe', date: '2026-10-28', instanz: 'Chor' },
    i18n: { en: { title: 'We missed you, {vorname}', html: '<p>Hi {vorname}, {termin}</p>', text: '' } },
  } as unknown as Message;

  it('uses the recipient language and fills personal and shared values', () => {
    const recipient = { lang: 'en', vars: { vorname: 'Lena' } } as unknown as MessageRecipient;
    expect(personalizeMessage(message, recipient)).toEqual({ title: 'We missed you, Lena', html: '<p>Hi Lena, Probe</p>' });
  });

  it('falls back to the stored text', () => {
    const recipient = { lang: 'ru', vars: { vorname: 'Jonas' } } as unknown as MessageRecipient;
    expect(personalizeMessage(message, recipient).title).toBe('Wir haben dich vermisst, Jonas');
  });
});
