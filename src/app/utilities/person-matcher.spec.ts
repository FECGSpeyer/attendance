/**
 * Person Matcher Unit Tests
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  levenshtein,
  nameSimilarity,
  rankCandidates,
  PersonLike,
} from './person-matcher';

describe('normalizeName', () => {
  it('strips diacritics, transliterating umlauts to German ASCII', () => {
    expect(normalizeName('Müller')).toBe('mueller');
    expect(normalizeName('Mueller')).toBe('mueller');
    expect(normalizeName('Étienne')).toBe('etienne');
  });

  it('expands ß to ss', () => {
    expect(normalizeName('Straße')).toBe('strasse');
    expect(normalizeName('Weiß')).toBe('weiss');
  });

  it('expands ligatures', () => {
    expect(normalizeName('Æsop')).toBe('aesop');
    expect(normalizeName('Œuvre')).toBe('oeuvre');
    expect(normalizeName('Søren')).toBe('soren');
  });

  it('lower-cases', () => {
    expect(normalizeName('HANS')).toBe('hans');
  });

  it('preserves hyphens for double-barrelled names', () => {
    expect(normalizeName('Müller-Wagner')).toBe('mueller-wagner');
  });

  it('collapses whitespace', () => {
    expect(normalizeName('  Hans   Peter  ')).toBe('hans peter');
  });

  it('handles empty input', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName(null as any)).toBe('');
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('returns the length when one side is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('classic kitten/sitting = 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('substitution costs 1', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('transposition costs 2', () => {
    expect(levenshtein('ab', 'ba')).toBe(2);
  });
});

describe('nameSimilarity', () => {
  it('exact match scores 1', () => {
    expect(nameSimilarity({firstName: 'Hans', lastName: 'Müller'}, {firstName: 'Hans', lastName: 'Müller'})).toBe(1);
  });

  it('treats Mueller and Müller as identical', () => {
    const s = nameSimilarity({firstName: 'Hans', lastName: 'Mueller'}, {firstName: 'Hans', lastName: 'Müller'});
    expect(s).toBeGreaterThanOrEqual(0.95);
  });

  it('treats Muller (ASCII) and Müller as very similar', () => {
    const s = nameSimilarity({firstName: 'Hans', lastName: 'Muller'}, {firstName: 'Hans', lastName: 'Müller'});
    expect(s).toBeGreaterThanOrEqual(0.9);
  });

  it('rewards prefix typing during typeahead', () => {
    const s = nameSimilarity({firstName: 'Joh', lastName: 'Müll'}, {firstName: 'Johannes', lastName: 'Müller'});
    expect(s).toBeGreaterThanOrEqual(0.7);
  });

  it('handles a single-letter first initial', () => {
    const s = nameSimilarity({firstName: 'H', lastName: 'Müller'}, {firstName: 'Hans', lastName: 'Müller'});
    expect(s).toBeGreaterThanOrEqual(0.6);
  });

  it('detects swapped first/last names', () => {
    const s = nameSimilarity({firstName: 'Müller', lastName: 'Hans'}, {firstName: 'Hans', lastName: 'Müller'});
    expect(s).toBeGreaterThanOrEqual(0.85);
  });

  it('tolerates a one-character typo', () => {
    const s = nameSimilarity({firstName: 'Hans', lastName: 'Mueler'}, {firstName: 'Hans', lastName: 'Müller'});
    expect(s).toBeGreaterThanOrEqual(0.7);
  });

  it('keeps unrelated names below the cutoff', () => {
    const s = nameSimilarity({firstName: 'Anna', lastName: 'Schmidt'}, {firstName: 'Hans', lastName: 'Müller'});
    expect(s).toBeLessThan(0.4);
  });
});

describe('rankCandidates', () => {
  const candidates: PersonLike[] = [
    {firstName: 'Hans', lastName: 'Müller', appId: 'u1'},
    {firstName: 'Hans', lastName: 'Mueller', appId: null},
    {firstName: 'Anna', lastName: 'Schmidt', appId: null},
    {firstName: 'Hannes', lastName: 'Müller', appId: null},
  ];

  it('filters below threshold', () => {
    const r = rankCandidates({firstName: 'Hans', lastName: 'Müller'}, candidates);
    expect(r.find(m => m.candidate.lastName === 'Schmidt')).toBeUndefined();
  });

  it('sorts by score descending', () => {
    const r = rankCandidates({firstName: 'Hans', lastName: 'Müller'}, candidates);
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  it('honours limit', () => {
    const r = rankCandidates({firstName: 'Hans', lastName: 'Müller'}, candidates, {limit: 2});
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it('tie-breaks prefer candidates with appId', () => {
    const tied: PersonLike[] = [
      {firstName: 'Hans', lastName: 'Müller', appId: null},
      {firstName: 'Hans', lastName: 'Müller', appId: 'u1'},
    ];
    const r = rankCandidates({firstName: 'Hans', lastName: 'Müller'}, tied);
    expect(r[0].candidate.appId).toBe('u1');
  });

  it('attaches a reason label', () => {
    const r = rankCandidates({firstName: 'Hans', lastName: 'Müller'}, candidates);
    for (const m of r) {
      expect(m.reason.length).toBeGreaterThan(0);
    }
  });

  it('reason for swap detection', () => {
    const r = rankCandidates(
      {firstName: 'Müller', lastName: 'Hans'},
      [{firstName: 'Hans', lastName: 'Müller', appId: null}],
    );
    expect(r[0].reason).toBe('Vor-/Nachname vertauscht');
  });
});
