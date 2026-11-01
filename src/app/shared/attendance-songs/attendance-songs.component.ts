import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { Browser } from '@capacitor/browser';
import { TranslocoModule } from '@jsverse/transloco';
import { AttendanceSong } from '../../utilities/attendance-songs';
import { SongActionsService } from '../../services/song-actions/song-actions.service';

/** Role the sheet closes with when the person taps "Ablaufplan öffnen". */
export const ATTENDANCE_SONGS_OPEN_PLAN = 'plan';

/**
 * Sheet with the Werke of one Termin for members and parents.
 * Tapping a Werk opens the score actions (or only the link in `linkOnly` mode).
 */
@Component({
  selector: 'app-attendance-songs',
  standalone: true,
  imports: [CommonModule, IonicModule, TranslocoModule],
  templateUrl: './attendance-songs.component.html',
  styleUrls: ['./attendance-songs.component.scss'],
})
export class AttendanceSongsComponent {
  private modalCtrl = inject(ModalController);
  private songActions = inject(SongActionsService);

  @Input() title = '';
  @Input() subtitle = '';
  @Input() entries: AttendanceSong[] = [];
  /** Instrument / Stimme of the person; without it no red marking and no own scores. */
  @Input() instrumentId?: number;
  /** Parents: only the Werk link, as in their "Aktuelle Werke". */
  @Input() linkOnly = false;
  @Input() canOpenPlan = false;

  dismiss(role?: string) {
    this.modalCtrl.dismiss(undefined, role);
  }

  missingNotes(entry: AttendanceSong): boolean {
    return !this.linkOnly && !!entry.song && !!this.instrumentId
      && !this.songActions.hasNotesForInstrument(entry.song, this.instrumentId);
  }

  canTap(entry: AttendanceSong): boolean {
    return !!entry.song && (!this.linkOnly || !!entry.song.link);
  }

  async open(entry: AttendanceSong) {
    if (!entry.song) { return; }
    if (this.linkOnly) {
      this.openLink(entry.song.link);
      return;
    }
    await this.songActions.openSongOptions(entry.song, this.instrumentId);
  }

  openLink(link: string | undefined, event?: Event) {
    event?.stopPropagation();
    if (link) {
      Browser.open({ url: link });
    }
  }

  get canPrint(): boolean {
    return !this.linkOnly && this.entries.some(e => !!e.song);
  }

  async print() {
    const fileName = `${(this.subtitle || 'noten').replace(/[^\p{L}\p{N}]+/gu, '_')}.pdf`;
    await this.songActions.printScores(this.entries.map(e => e.song).filter(Boolean), this.instrumentId, fileName);
  }
}
