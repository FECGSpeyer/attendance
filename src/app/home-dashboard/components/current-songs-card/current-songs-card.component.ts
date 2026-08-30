import { Component, effect } from '@angular/core';
import { Router } from '@angular/router';
import { DbService } from '../../../services/db.service';
import { History } from '../../../utilities/interfaces';

interface SongEntry {
  songId: number;
  name: string;
  number: number;
  prefix?: string;
  conductorName?: string;
  dateLabel: string;
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

  songLabel(entry: SongEntry): string {
    const num = entry.prefix ? `${entry.prefix} ${entry.number}` : `${entry.number}`;
    return `${num} · ${entry.name}`;
  }
}
