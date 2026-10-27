import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { DbService } from 'src/app/services/db.service';
import { Protocol } from 'src/app/utilities/interfaces';
import { isEditedAfterPublish } from '../team-org.utils';
import { MonthGroup, groupByMonth, matchesSearch } from 'src/app/protocols/protocol/protocol.helpers';
import { translate } from '@jsverse/transloco';
import { currentLanguage, dateFmt } from '../../i18n/languages';
import { TranslocoModule } from '@jsverse/transloco';

interface ProtocolRow {
  protocol: Protocol;
  attendanceId: number;
  date: string | null;
  day: string;
  weekday: string;
  title: string;
  subtitle: string;
  dateText: string;
  isDraft: boolean;
  edited: boolean;
}

/** "Protokolle": leadership sees drafts and published ones, members the published ones of their circle (RLS). */
@Component({
  selector: 'app-team-protocols-tab',
  templateUrl: './protocols-tab.component.html',
  styleUrls: ['./protocols-tab.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, IonicModule, TranslocoModule],
})
export class TeamProtocolsTabComponent implements OnInit {
  rows: ProtocolRow[] = [];
  groups: MonthGroup<ProtocolRow>[] = [];
  search = '';
  isLoading = true;
  isLeader = false;

  constructor(private db: DbService) {}

  async ngOnInit() {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.isLeader = this.db.isTeamLeader();
    try {
      const protocols = await this.db.getProtocols();
      const types = this.db.attendanceTypes();
      this.rows = protocols
        .filter(p => p.attendance_id)
        .map(p => {
          const att = p.attendance;
          const typeName = types.find(t => t.id === att?.type_id)?.name ?? '';
          const date = att?.date ?? null;
          const d = date ? dayjs(date).locale(currentLanguage()) : null;
          const title = att?.typeInfo || typeName || translate('attendance.eventFallback');
          return {
            protocol: p,
            attendanceId: p.attendance_id,
            date,
            day: d ? d.format('DD') : '–',
            weekday: d ? d.format('dd') : '',
            title,
            subtitle: att?.typeInfo && typeName && typeName !== title ? typeName : '',
            dateText: d ? d.format(`dd, ${dateFmt()}`) : '',
            isDraft: p.status !== 'published',
            edited: isEditedAfterPublish(p),
          };
        });
    } catch (error) {
      console.error('Protocols load error:', error);
      this.rows = [];
    } finally {
      this.isLoading = false;
    }
    this.applyFilter();
  }

  applyFilter() {
    const query = this.search.trim();
    const filtered = this.rows.filter(r => matchesSearch(query, [
      r.title,
      r.subtitle,
      r.dateText,
      r.date ? dayjs(r.date).format(dateFmt()) : '',
      r.isDraft ? translate('teamOrg.draft') : translate('teamOrg.published'),
    ]));
    this.groups = groupByMonth(filtered, r => r.date);
  }

  publishedText(row: ProtocolRow): string {
    const p = row.protocol;
    if (row.isDraft || !p.published_at) return '';
    const text = translate('teamOrg.publishedOn', { date: dayjs(p.published_at).format(dateFmt('dayMonth')) });
    return row.edited && p.updated_at ? translate('teamOrg.editedOn', { text, date: dayjs(p.updated_at).format(dateFmt('dayMonth')) }) : text;
  }
}
