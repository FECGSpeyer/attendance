import { uniqueDates } from './unique-dates';

describe('uniqueDates', () => {
  it('removes the same day given in different formats', () => {
    const now = new Date(2027, 3, 9, 7, 30).toISOString();
    expect(uniqueDates([now, '2027-04-09', '2027-04-10'])).toEqual([now, '2027-04-10']);
  });

  it('removes exact duplicates and keeps order', () => {
    expect(uniqueDates(['2026-11-03', '2026-11-01', '2026-11-03'])).toEqual(['2026-11-03', '2026-11-01']);
  });

  it('handles empty input and invalid values', () => {
    expect(uniqueDates(undefined)).toEqual([]);
    expect(uniqueDates(['', 'kein Datum'])).toEqual([]);
  });
});
