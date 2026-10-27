import { dateFmt } from '../../i18n/languages';
import dayjs from 'dayjs';
import { AgendaItem, AgendaItemPriority, FieldSelection } from '../../utilities/interfaces';
import { translate } from '@jsverse/transloco';

export const TOPIC_PRIORITY_LABELS: Record<AgendaItemPriority, string> = {
  get high() { return translate('agenda.high'); },
  get medium() { return translate('agenda.medium'); },
  get low() { return translate('agenda.low'); },
};

export const TOPIC_PRIORITY_COLORS: Record<AgendaItemPriority, string> = {
  high: 'danger',
  medium: 'warning',
  low: 'medium',
};

export interface TopicBuckets {
  /** Suggestions waiting for the leadership's decision, oldest first. */
  pending: AgendaItem[];
  /** Open topics in the Themenspeicher (accepted suggestions or created by leadership). */
  open: AgendaItem[];
  /** Completed or dropped topics. */
  done: AgendaItem[];
}

/** Splits the leadership's topic list. Rejected suggestions are left out. */
export function splitTopics(items: AgendaItem[] | undefined | null): TopicBuckets {
  const pending: AgendaItem[] = [];
  const open: AgendaItem[] = [];
  const done: AgendaItem[] = [];
  for (const item of items ?? []) {
    if (item.proposal_status === 'pending') pending.push(item);
    else if (item.proposal_status === 'rejected') continue;
    else if (item.status === 'open') open.push(item);
    else done.push(item);
  }
  pending.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  done.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  return { pending, open, done };
}

/** Status of a member's own suggestion. */
export function suggestionStatus(item: Pick<AgendaItem, 'proposal_status'>): { label: string; color: string } {
  switch (item.proposal_status) {
    case 'accepted': return { label: translate('teamOrg.suggestion.accepted'), color: 'success' };
    case 'rejected': return { label: translate('teamOrg.suggestion.rejected'), color: 'danger' };
    default: return { label: translate('teamOrg.suggestion.waiting'), color: 'medium' };
  }
}

/** "heute", "gestern", "vor 3 Tagen" – or the date for anything older than two weeks. */
export function relativeDay(date: string | undefined | null, now: Date = new Date()): string {
  if (!date) return '';
  const days = dayjs(now).startOf('day').diff(dayjs(date).startOf('day'), 'day');
  if (days <= 0) return translate('teamOrg.today');
  if (days === 1) return translate('teamOrg.yesterday');
  if (days < 14) return translate('teamOrg.daysAgo', { count: days });
  return dayjs(date).format(dateFmt());
}

/** Agenda fields (TOPs) of a plan with their total duration in minutes. */
export function planTops(fields: FieldSelection[] | undefined | null): { tops: FieldSelection[]; minutes: number } {
  const tops = (fields ?? []).filter(f => !!f.agendaItemId);
  return { tops, minutes: tops.reduce((s, f) => s + (parseInt(f.time, 10) || 0), 0) };
}

export function initials(person?: { firstName?: string; lastName?: string } | null): string {
  return `${person?.firstName?.charAt(0) ?? ''}${person?.lastName?.charAt(0) ?? ''}`.toUpperCase();
}
