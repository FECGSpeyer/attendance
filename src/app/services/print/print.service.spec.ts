import { PrintService } from './print.service';

describe('PrintService.toCacheFileName', () => {
  it('replaces spaces and umlauts so the native printer finds the file', () => {
    expect(PrintService.toCacheFileName('Einsam und allein - Flöte.pdf')).toBe('Einsam_und_allein_-_Flote.pdf');
    expect(PrintService.toCacheFileName('Große Freude_print.pdf')).toBe('Grosse_Freude_print.pdf');
  });

  it('keeps already safe names', () => {
    expect(PrintService.toCacheFileName('aktuelle_noten.pdf')).toBe('aktuelle_noten.pdf');
    expect(PrintService.toCacheFileName('Noten_Sopran_2026-10-18.pdf')).toBe('Noten_Sopran_2026-10-18.pdf');
  });

  it('falls back to a default name and always ends in .pdf', () => {
    expect(PrintService.toCacheFileName('Хор.pdf')).toBe('noten.pdf');
    expect(PrintService.toCacheFileName('a/b:c')).toBe('a_b_c.pdf');
  });
});
