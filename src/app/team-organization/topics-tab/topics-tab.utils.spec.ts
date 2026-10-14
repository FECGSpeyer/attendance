import { describe, it, expect } from 'vitest';
import { AgendaItem } from '../../utilities/interfaces';
import { initials, planTops, relativeDay, splitTopics, suggestionStatus } from './topics-tab.utils';

const item = (id: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  id, tenant_id: 1, title: id, status: 'open', priority: 'medium', ...extra,
});

describe('splitTopics', () => {
  it('separates pending, open and done; drops rejected', () => {
    const result = splitTopics([
      item('a'),
      item('b', { proposal_status: 'pending', created_at: '2026-10-10' }),
      item('c', { proposal_status: 'pending', created_at: '2026-10-01' }),
      item('d', { proposal_status: 'accepted' }),
      item('e', { proposal_status: 'rejected' }),
      item('f', { status: 'completed', created_at: '2026-09-01' }),
      item('g', { status: 'dropped', created_at: '2026-10-01' }),
    ]);
    expect(result.pending.map(i => i.id)).toEqual(['c', 'b']);
    expect(result.open.map(i => i.id)).toEqual(['a', 'd']);
    expect(result.done.map(i => i.id)).toEqual(['g', 'f']);
  });

  it('handles empty input', () => {
    expect(splitTopics(null)).toEqual({ pending: [], open: [], done: [] });
  });
});

describe('suggestionStatus', () => {
  it('maps proposal status to label', () => {
    expect(suggestionStatus({ proposal_status: 'pending' }).label).toBe('Wartet');
    expect(suggestionStatus({ proposal_status: 'accepted' }).label).toBe('Übernommen');
    expect(suggestionStatus({ proposal_status: 'rejected' }).label).toBe('Abgelehnt');
  });
});

describe('relativeDay', () => {
  const now = new Date('2026-10-14T12:00:00');
  it('formats recent days relatively', () => {
    expect(relativeDay('2026-10-14T08:00:00', now)).toBe('heute');
    expect(relativeDay('2026-10-13T20:00:00', now)).toBe('gestern');
    expect(relativeDay('2026-10-09T10:00:00', now)).toBe('vor 5 Tagen');
    expect(relativeDay('2026-09-01T10:00:00', now)).toBe('01.09.2026');
    expect(relativeDay(null, now)).toBe('');
  });
});

describe('planTops', () => {
  it('keeps agenda fields and sums their minutes', () => {
    const { tops, minutes } = planTops([
      { id: 'w', name: 'Begrüßung', time: '5' },
      { id: 'agenda-1', name: 'A', time: '20', agendaItemId: '1' },
      { id: 'agenda-2', name: 'B', time: '10', agendaItemId: '2' },
    ]);
    expect(tops.map(t => t.id)).toEqual(['agenda-1', 'agenda-2']);
    expect(minutes).toBe(30);
  });
});

describe('initials', () => {
  it('builds upper-case initials', () => {
    expect(initials({ firstName: 'miriam', lastName: 'Wolf' })).toBe('MW');
    expect(initials(null)).toBe('');
  });
});
