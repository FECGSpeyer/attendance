import { Component, effect } from '@angular/core';
import { Router } from '@angular/router';
import { DbService } from '../../../services/db.service';
import { History } from '../../../utilities/interfaces';
import dayjs from 'dayjs';
import { relativeDays } from '../shared/dashboard-date';
import { currentLanguage, dateFmt } from '../../../i18n/languages';

interface SongEntry {
  songId: number;
  name: string;
  number: number;
  prefix?: string;
  conductorName?: string;
  dateLabel: string;
  date?: string;
  typeLabel?: string;
}

@Component({
  selector: 'app-current-songs-card',
  templateUrl: './current-songs-card.component.html',
  styleUrls: ['./current-songs-card.component.scss'],
  standalone: false,
})
export class CurrentSongsCardComponent {
  public entries: SongEntry[] = [];
  public loading = true;
  private loadDone = false;

  constructor(public db: DbService, private router: Router) {
    effect(() => {
      if (this.db.tenant() && !this.loadDone) {
        this.loadDone = true;
        this.load();
      }
    });
  }

  async load() {
    this.loadDone = false;
    this.loading = true;
    try {
      const groups = await this.db.getCurrentSongs();
      const seen = new Set<number>();
      const result: SongEntry[] = [];
      for (const group of groups) {
        for (const h of group.history as History[]) {
          const song = (h as any).song;
          if (!song?.id || seen.has(song.id)) { continue; }
          seen.add(song.id);
          result.push({
            songId: song.id,
            name: song.name,
            number: song.number,
            prefix: song.prefix,
            conductorName: (h as any).conductorName || undefined,
            dateLabel: group.date,
            date: (h as any).attendance_id?.date ?? (h as any).date,
            typeLabel: group.date.split(' | ')[1],
          });
        }
      }
      this.entries = result;
    } finally {
      this.loading = false;
    }
  }

  openSong(songId: number): void {
    void this.router.navigate(['/tabs/songs-tab', songId]);
  }

  relativeDays = relativeDays;

  numberLabel(entry: SongEntry): string {
    return entry.prefix ? `${entry.prefix}${entry.number}` : `${entry.number}`;
  }

  songSubtitle(entry: SongEntry): string {
    const parts = [entry.conductorName, entry.typeLabel].filter(Boolean);
    if (parts.length) return parts.join(' · ');
    return entry.date ? dayjs(entry.date).locale(currentLanguage()).format(`dddd, ${dateFmt('dayMonth')}`) : entry.dateLabel;
  }
}
