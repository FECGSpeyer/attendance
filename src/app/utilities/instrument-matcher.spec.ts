/**
 * Instrument Matcher Unit Tests
 *
 * Tests for the instrument matching utility that handles:
 * - Roman numeral conversion (I, II, III -> 1, 2, 3)
 * - Multi-language support (German, English, Russian, Italian)
 * - Abbreviation expansion (Vl, Vc, Fl, etc.)
 * - Special file type detection (Partitur, Liedtext, etc.)
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeFilename,
  generateInstrumentVariations,
  matchInstrument,
  detectSpecialFileType
} from './instrument-matcher';
import { Group } from './interfaces';

/**
 * Helper to create mock instrument groups for testing
 */
function createMockInstruments(): Group[] {
  return [
    { id: 10, name: 'Violine 1', tenantId: 1, maingroup: false },
    { id: 11, name: 'Violine 2', tenantId: 1, maingroup: false },
    { id: 12, name: 'Viola', tenantId: 1, maingroup: false },
    { id: 13, name: 'Violoncello', tenantId: 1, maingroup: false },
    { id: 14, name: 'Kontrabass', tenantId: 1, maingroup: false },
    { id: 15, name: 'Flöte', tenantId: 1, maingroup: false },
    { id: 16, name: 'Oboe', tenantId: 1, maingroup: false },
    { id: 17, name: 'Klarinette', tenantId: 1, maingroup: false },
    { id: 18, name: 'Fagott', tenantId: 1, maingroup: false },
    { id: 19, name: 'Horn 1', tenantId: 1, maingroup: false },
    { id: 20, name: 'Horn 2', tenantId: 1, maingroup: false },
    { id: 21, name: 'Trompete 1', tenantId: 1, maingroup: false },
    { id: 22, name: 'Trompete 2', tenantId: 1, maingroup: false },
    { id: 23, name: 'Posaune', tenantId: 1, maingroup: false },
    { id: 24, name: 'Tuba', tenantId: 1, maingroup: false },
    { id: 25, name: 'Pauke', tenantId: 1, maingroup: false },
    { id: 26, name: 'Schlagzeug', tenantId: 1, maingroup: false },
  ];
}

describe('instrument-matcher', () => {
  describe('normalizeFilename', () => {
    it('should normalize case, extensions, and separators', () => {
      expect(normalizeFilename('VIOLINE.pdf')).toBe('violine');
      expect(normalizeFilename('Violine_1.pdf')).toBe('violine 1');
      expect(normalizeFilename('Violine-1.pdf')).toBe('violine 1');
      expect(normalizeFilename('Vl.1.pdf')).toBe('vl 1');
      expect(normalizeFilename('Violine   1.pdf')).toBe('violine 1');
    });

    it('should convert Roman numerals to Arabic numbers', () => {
      expect(normalizeFilename('Violine_I.pdf')).toBe('violine 1');
      expect(normalizeFilename('Violine_II.pdf')).toBe('violine 2');
      expect(normalizeFilename('Horn_III.pdf')).toBe('horn 3');
      expect(normalizeFilename('Part_VIII.pdf')).toBe('part 8');
    });

    it('should not convert Roman numerals that are part of words', () => {
      expect(normalizeFilename('violine.pdf')).toBe('violine');
    });

    it('should handle Cyrillic characters', () => {
      expect(normalizeFilename('Скрипка_1.pdf')).toBe('скрипка 1');
    });
  });

  describe('generateInstrumentVariations', () => {
    it('should generate translations and abbreviations', () => {
      const variations = generateInstrumentVariations('Violine 1');
      expect(variations).toContain('violine 1');
      expect(variations).toContain('violin');
      expect(variations).toContain('vl 1');
      expect(variations).toContain('vl1');
    });

    it('should include all language variants', () => {
      const variations = generateInstrumentVariations('Trompete 1');
      expect(variations).toContain('trumpet');
      expect(variations).toContain('tromba 1'); // Italian
      expect(variations).toContain('труба 1'); // Russian
    });
  });

  describe('matchInstrument', () => {
    const instruments = createMockInstruments();

    it('should match exact instrument names with different formats', () => {
      expect(matchInstrument('Violine 1.pdf', instruments)?.name).toBe('Violine 1');
      expect(matchInstrument('VIOLINE 1.pdf', instruments)?.name).toBe('Violine 1');
      expect(matchInstrument('Violine_1.pdf', instruments)?.name).toBe('Violine 1');
      expect(matchInstrument('Violine-1.pdf', instruments)?.name).toBe('Violine 1');
    });

    it('should match Roman numerals to Arabic numbers', () => {
      expect(matchInstrument('Violine_I.pdf', instruments)?.name).toBe('Violine 1');
      expect(matchInstrument('Violine_II.pdf', instruments)?.name).toBe('Violine 2');
      expect(matchInstrument('Horn_I.pdf', instruments)?.name).toBe('Horn 1');
      expect(matchInstrument('Horn_II.pdf', instruments)?.name).toBe('Horn 2');
    });

    it('should match English instrument names', () => {
      expect(matchInstrument('Violin 1.pdf', instruments)?.name).toBe('Violine 1');
      expect(matchInstrument('Cello.pdf', instruments)?.name).toBe('Violoncello');
      expect(matchInstrument('Flute.pdf', instruments)?.name).toBe('Flöte');
      expect(matchInstrument('Trombone.pdf', instruments)?.name).toBe('Posaune');
    });

    it('should match Russian instrument names (Cyrillic and transliterated)', () => {
      expect(matchInstrument('Скрипка_1.pdf', instruments)?.name).toBe('Violine 1');
      expect(matchInstrument('Виолончель.pdf', instruments)?.name).toBe('Violoncello');
      expect(matchInstrument('Skripka.pdf', instruments)?.name).toContain('Violine');
    });

    it('should match Italian instrument names', () => {
      expect(matchInstrument('Violino.pdf', instruments)?.name).toContain('Violine');
      expect(matchInstrument('Flauto.pdf', instruments)?.name).toBe('Flöte');
      expect(matchInstrument('Tromba_1.pdf', instruments)?.name).toBe('Trompete 1');
    });

    it('should match common abbreviations', () => {
      expect(matchInstrument('Vl.pdf', instruments)?.name).toContain('Violine');
      expect(matchInstrument('Vl1.pdf', instruments)?.name).toBe('Violine 1');
      expect(matchInstrument('Vc.pdf', instruments)?.name).toBe('Violoncello');
      expect(matchInstrument('Fl.pdf', instruments)?.name).toBe('Flöte');
      expect(matchInstrument('Fg.pdf', instruments)?.name).toBe('Fagott');
      expect(matchInstrument('Pk.pdf', instruments)?.name).toBe('Pauke');
    });

    it('should match using synonyms defined on instrument', () => {
      const instrumentsWithSynonyms: Group[] = [
        { id: 10, name: 'Violine 1', tenantId: 1, maingroup: false, synonyms: '1. Geige, Erste Geige' },
      ];
      expect(matchInstrument('1. Geige.pdf', instrumentsWithSynonyms)?.name).toBe('Violine 1');
    });

    it('should prefer specific matches over general ones', () => {
      expect(matchInstrument('Violine 1.pdf', instruments)?.name).toBe('Violine 1');
      expect(matchInstrument('Trompete 2.pdf', instruments)?.name).toBe('Trompete 2');
    });

    it('should return null for unknown instruments', () => {
      expect(matchInstrument('Dudelsack.pdf', instruments)).toBeNull();
      expect(matchInstrument('.pdf', instruments)).toBeNull();
    });
  });

  describe('detectSpecialFileType', () => {
    it('should detect audio files as Aufnahme', () => {
      expect(detectSpecialFileType('Recording.mp3', 'audio/mpeg')?.instrumentId).toBe(1);
      expect(detectSpecialFileType('Recording.wav', 'audio/wav')?.instrumentId).toBe(1);
    });

    it('should detect Sibelius files', () => {
      expect(detectSpecialFileType('Score.sib', 'application/octet-stream')?.note).toBe('Sibelius');
    });

    it('should detect score/partitur files in multiple languages', () => {
      expect(detectSpecialFileType('Partitur.pdf', 'application/pdf')?.note).toBe('Partitur');
      expect(detectSpecialFileType('Full_Score.pdf', 'application/pdf')?.note).toBe('Partitur');
      expect(detectSpecialFileType('Conductor.pdf', 'application/pdf')?.note).toBe('Partitur');
      expect(detectSpecialFileType('партитура.pdf', 'application/pdf')?.note).toBe('Partitur');
    });

    it('should detect lyrics/liedtext files in multiple languages', () => {
      expect(detectSpecialFileType('Liedtext.pdf', 'application/pdf')?.instrumentId).toBe(2);
      expect(detectSpecialFileType('Lyrics.pdf', 'application/pdf')?.instrumentId).toBe(2);
      expect(detectSpecialFileType('текст.pdf', 'application/pdf')?.instrumentId).toBe(2);
    });

    it('should detect choir files in multiple languages', () => {
      expect(detectSpecialFileType('Chor.pdf', 'application/pdf')?.note).toBe('Chor');
      expect(detectSpecialFileType('Choir.pdf', 'application/pdf')?.note).toBe('Chor');
      expect(detectSpecialFileType('хор.pdf', 'application/pdf')?.note).toBe('Chor');
    });

    it('should detect piano reduction files', () => {
      expect(detectSpecialFileType('Klavierauszug.pdf', 'application/pdf')?.note).toBe('Klavierauszug');
      expect(detectSpecialFileType('Vocal_Score.pdf', 'application/pdf')?.note).toBe('Klavierauszug');
      expect(detectSpecialFileType('клавир.pdf', 'application/pdf')?.note).toBe('Klavierauszug');
    });

    it('should return null for regular instrument files', () => {
      expect(detectSpecialFileType('Violine_1.pdf', 'application/pdf')).toBeNull();
    });
  });

  /**
   * Regression tests for the Waldhorn / Althorn misassignment bug.
   * Uses a realistic Blasorchester lineup with the synonyms reported by the user.
   */
  describe('Waldhorn / Althorn regression', () => {
    const orchestra: Group[] = [
      { id: 1, name: 'Flöte', tenantId: 1, maingroup: false },
      { id: 2, name: 'Oboe', tenantId: 1, maingroup: false },
      { id: 3, name: 'Klarinette 1', tenantId: 1, maingroup: false },
      { id: 4, name: 'Klarinette 2', tenantId: 1, maingroup: false },
      { id: 5, name: 'Klarinette 3', tenantId: 1, maingroup: false },
      { id: 6, name: 'Alt-Saxophon', tenantId: 1, maingroup: false },
      { id: 7, name: 'Tenor-Saxophon', tenantId: 1, maingroup: false },
      { id: 8, name: 'Trompete 1', tenantId: 1, maingroup: false },
      { id: 9, name: 'Trompete 2', tenantId: 1, maingroup: false },
      { id: 10, name: 'Trompete 3', tenantId: 1, maingroup: false },
      { id: 11, name: 'Waldhorn 1', tenantId: 1, maingroup: false, synonyms: 'Horn F, Waldhorn F' },
      { id: 12, name: 'Waldhorn 2', tenantId: 1, maingroup: false, synonyms: 'Horn F, Waldhorn F' },
      { id: 13, name: 'Althorn 1', tenantId: 1, maingroup: false, synonyms: 'Alt Es, Alt Eb, Horn Es, Horn Eb' },
      { id: 14, name: 'Althorn 2', tenantId: 1, maingroup: false, synonyms: 'Alt Es, Alt Eb, Horn Es, Horn Eb' },
      { id: 15, name: 'Tenorhorn 1', tenantId: 1, maingroup: false },
      { id: 16, name: 'Tenorhorn 2', tenantId: 1, maingroup: false },
      { id: 17, name: 'Bariton', tenantId: 1, maingroup: false },
      { id: 18, name: 'Posaune 1', tenantId: 1, maingroup: false },
      { id: 19, name: 'Posaune 2', tenantId: 1, maingroup: false },
      { id: 20, name: 'Tuba', tenantId: 1, maingroup: false },
    ];

    it('matches Waldhorn 1.pdf to Waldhorn 1', () => {
      expect(matchInstrument('Waldhorn 1.pdf', orchestra)?.name).toBe('Waldhorn 1');
    });
    it('matches Waldhorn 2.pdf to Waldhorn 2', () => {
      expect(matchInstrument('Waldhorn 2.pdf', orchestra)?.name).toBe('Waldhorn 2');
    });
    it('matches Althorn 1.pdf to Althorn 1', () => {
      expect(matchInstrument('Althorn 1.pdf', orchestra)?.name).toBe('Althorn 1');
    });
    it('matches Althorn 2.pdf to Althorn 2', () => {
      expect(matchInstrument('Althorn 2.pdf', orchestra)?.name).toBe('Althorn 2');
    });
    it('matches "Horn F 1.pdf" to Waldhorn 1 via synonym', () => {
      expect(matchInstrument('Horn F 1.pdf', orchestra)?.name).toBe('Waldhorn 1');
    });
    it('matches "Horn Es 2.pdf" to Althorn 2 (number from filename disambiguates shared synonym)', () => {
      expect(matchInstrument('Horn Es 2.pdf', orchestra)?.name).toBe('Althorn 2');
    });
    it('matches "Alt Es 1.pdf" to Althorn 1 via synonym', () => {
      expect(matchInstrument('Alt Es 1.pdf', orchestra)?.name).toBe('Althorn 1');
    });
    it('matches Alt-Saxophon.pdf to Alt-Saxophon (not Althorn)', () => {
      expect(matchInstrument('Alt-Saxophon.pdf', orchestra)?.name).toBe('Alt-Saxophon');
    });
    it('does not misroute "Alt-Sax.pdf" to Althorn via the "alt" substring', () => {
      expect(matchInstrument('Alt-Sax.pdf', orchestra)?.name?.includes('Althorn')).toBeFalsy();
    });
    it('matches "1. Waldhorn.pdf" to Waldhorn 1 (number-prefix naming)', () => {
      expect(matchInstrument('1. Waldhorn.pdf', orchestra)?.name).toBe('Waldhorn 1');
    });
    it('matches "1. Althorn.pdf" to Althorn 1 (number-prefix naming)', () => {
      expect(matchInstrument('1. Althorn.pdf', orchestra)?.name).toBe('Althorn 1');
    });
    it('matches Tenorhorn 1.pdf to Tenorhorn 1 (not Waldhorn)', () => {
      expect(matchInstrument('Tenorhorn 1.pdf', orchestra)?.name).toBe('Tenorhorn 1');
    });
  });
});
