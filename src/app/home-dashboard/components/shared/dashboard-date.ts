import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { translate } from '@jsverse/transloco';
import { currentLanguage } from '../../../i18n/languages';

/** Tageszahl für das Kalenderblatt, z. B. "18". */
export function tileDay(date: string | Date | dayjs.Dayjs): string {
  return dayjs(date).format('D');
}

/** Kurzer Monatsname ohne Punkt, z. B. "Okt". */
export function tileMonth(date: string | Date | dayjs.Dayjs): string {
  return dayjs(date).locale(currentLanguage()).format('MMM').replace('.', '');
}

/** "Heute", "Morgen", "vor 3 Tagen", "in 5 Tagen" relativ zu heute. */
export function relativeDays(date: string | Date | dayjs.Dayjs): string {
  const diff = dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diff === 0) return translate('teamOrg.todayCap');
  if (diff === -1) return translate('homeDashboard.yesterday');
  if (diff === 1) return translate('teamOrg.tomorrow');
  return diff < 0 ? translate('homeDashboard.daysAgo', { count: Math.abs(diff) }) : translate('homeDashboard.inDays', { count: diff });
}

/** Kurzes Datum, Jahr nur wenn nicht das aktuelle, z. B. "03.10." oder "03.10.25". */
export function shortDate(date: string | Date | dayjs.Dayjs): string {
  const d = dayjs(date);
  return d.format(d.year() === dayjs().year() ? 'DD.MM.' : 'DD.MM.YY');
}
