import { Component, OnInit } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { AlertController, IonItemSliding, IonModal, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import dayjs from 'dayjs';
import { DbService } from '../services/db.service';
import { Attendance, FieldSelection, History, Person, Song } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

interface GroupedHistory { date: string; parts: History[] };

@Component({
    selector: 'app-history',
    templateUrl: './history.page.html',
    styleUrls: ['./history.page.scss'],
    standalone: false
})

export class HistoryPage implements OnInit {
  date: string = new Date().toISOString();
  public dateString: string = format(new Date(), 'dd.MM.yyyy');
  conductors: Person[] = [];
  activeConductors: Person[] = [];
  history: History[] = [];
  groupedHistory: GroupedHistory[] = [];
  historyFiltered: History[] = [];
  historyEntry: History = {
    songId: 1,
    person_id: 0,
    date: new Date().toISOString(),
  };
  searchTerm = '';
  songs: Song[] = [];
  otherConductor = 9999999999;
  selectedSongs: number[] = [];
  public songSearchTerm = '';
  public filteredSongs: Song[] = [];
  public dateManualInput = true;

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  // TrackBy for history lists (ion-item-sliding elements)
  trackByHistoryId = (_index: number, entry: History): number => entry.id!;
  trackByGroupDate = (_index: number, group: GroupedHistory): string => group.date;

  async handleRefresh(event: any): Promise<void> {
    await this.getHistory();
    event.target.complete();
  }

  async ngOnInit(): Promise<void> {
    this.songs = await this.db.getSongs();
    this.filteredSongs = [...this.songs];
    this.selectedSongs = [this.songs[0].id];
    this.conductors = await this.db.getConductors(true);
    this.activeConductors = this.conductors.filter((con: Person) => !con.left);
    this.historyEntry.person_id = this.activeConductors[0].id;

    await this.getHistory();
  }

  async getHistory(): Promise<void> {
    const attendances: Attendance[] = await this.db.getAttendance(true);
    this.history = (await this.db.getHistory()).map((entry: History): History => {
      const conductor: Person | undefined = this.conductors.find((p: Person) => p.id === entry.person_id);
      return {
        ...entry,
        conductorName: conductor ? `${conductor.firstName} ${conductor.lastName}` : entry.otherConductor,
        number: this.songs.find((song: Song) => song.id === entry.songId)?.number,
        name: this.songs.find((song: Song) => song.id === entry.songId)?.name || entry.name,
        count: attendances.filter((att: Attendance) => this.isSongInPlan(att, entry.songId, entry.attendance?.date ?? entry.date)).length
      };
    });

    const grouped: GroupedHistory = this.history.reduce((r: History, a: History) => {
      r[dayjs(a.attendance?.date ?? a.date).format('DD.MM.YYYY')] = r[dayjs(a.attendance?.date ?? a.date).format('DD.MM.YYYY')] || [];
      r[dayjs(a.attendance?.date ?? a.date).format('DD.MM.YYYY')].push(a);
      return r;
    }, Object.create(null));

    const sorted: string[] = Object.keys(grouped).sort((a: string, b: string): number => dayjs(a).toDate().getTime() - dayjs(b).toDate().getTime());

    this.groupedHistory = sorted.map((date: string) => ({
        date,
        parts: grouped[date]
      }));

    this.initializeItems();
  }

  isSongInPlan(att: Attendance, songId: number, date: string): boolean {
    if (att.type !== 'uebung' || !att.plan) {
      return false;
    }

    if (dayjs(att.date).isBefore(date) && dayjs(att.date).isAfter(dayjs(date).subtract(4, 'months'))) {
      return Boolean(att.plan?.fields.find((field: FieldSelection) => field.id === String(songId)));
    }

    return false;
  }

  search(event: any): void {
    if (this.history) {
      this.searchTerm = '';
      this.initializeItems();

      this.searchTerm = event.srcElement.value;

      if (!this.searchTerm) {
        return;
      }

      this.historyFiltered = this.filter();
    }
  }

  onDateChanged(value: string | string[], dateModal: IonModal): void {
    if (parseInt(this.dateString.substring(0, 2), 10) !== dayjs(this.historyEntry.date).date()) {
      dateModal.dismiss();
    }

    this.dateString = this.formatDate(String(value));
  }

  onDateManualInput(): void {
    const parsed = this.parseDateString(this.dateString);
    if (parsed) {
      this.historyEntry.date = dayjs(parsed).startOf('day').utc(true).toISOString();
      this.dateString = this.formatDate(this.historyEntry.date);
    } else if (this.dateString.trim()) {
      Utils.showToast('Ungültiges Datumsformat. Bitte TT.MM.JJJJ verwenden.', 'warning');
      this.dateString = this.formatDate(this.historyEntry.date);
    }
  }

  private parseDateString(dateStr: string): Date | null {
    if (!dateStr || !dateStr.trim()) {
      return null;
    }

    // Support multiple formats: TT.MM.JJJJ, T.M.JJJJ, TT.M.JJ, etc.
    const parts = dateStr.trim().split('.');
    if (parts.length !== 3) {
      return null;
    }

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    // Handle 2-digit years
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

    // Validate ranges
    if (isNaN(day) || isNaN(month) || isNaN(year) ||
        day < 1 || day > 31 ||
        month < 1 || month > 12 ||
        year < 1900 || year > new Date().getFullYear() + 100) {
      return null;
    }

    const date = new Date(year, month - 1, day);

    // Check if the date is valid (e.g., not 31.02.2020)
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
      return null;
    }

    return date;
  }

  filter(): History[] {
    if (this.searchTerm === '') {
      return this.history;
    } else {
      return this.history.filter((entry: History) => {
        if (this.searchTerm) {
          if (entry.name.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1) {
            return true;
          }
          return false;
        }
      });
    }
  }

  initializeItems(): void {
    this.historyFiltered = this.history;
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  async dismiss(): Promise<void> {
    await this.modalController.dismiss();
  }

  async onConChange() {
    if (this.historyEntry.person_id === this.otherConductor) {
      const alert = await this.alertController.create({
        header: 'Dirigent eingeben',
        inputs: [
          {
            type: 'text',
            name: 'conductor',
            placeholder: 'Dirigent',
          }
        ],
        buttons: ['Abbrechen', {
          text: 'Speichern',
          handler: (data: any) => {
            this.historyEntry.otherConductor = data.conductor;
          }
        }]
      });

      await alert.present();
    } else {
      delete this.historyEntry.otherConductor;
    }
  }

  async addHistoryEntry(modal: IonModal): Promise<void> {
    if (this.selectedSongs.length) {
      if (this.historyEntry.person_id === this.otherConductor) {
        delete this.historyEntry.person_id;
      }

      const historyEntries: History[] = [];

      for (const songId of this.selectedSongs) {
        historyEntries.push({
          ...this.historyEntry,
          songId
        });
      }

      await this.db.addHistoryEntry(historyEntries);

      await modal.dismiss();

      await this.getHistory();
      this.selectedSongs = [];
      this.historyEntry = {
        songId: this.historyEntry.songId,
        person_id: this.conductors[0].id,
        date: this.historyEntry.date,
      };
      this.dateString = format(new Date(this.historyEntry.date), 'dd.MM.yyyy');
    } else {
      Utils.showToast('Bitte wähle mindestens ein Werk an', 'danger');
    }
  }

  async remove(id: number, sliding: IonItemSliding) {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* Haptics not available in PWA */ }
    const alert = await this.alertController.create({
      header: 'Möchtest du den Eintrag wirklich entfernen?',
      buttons: [
        {
          text: 'Abbrechen',
          handler: () => {
            sliding.close();
          },
        }, {
          text: 'Ja',
          handler: async () => {
            try {
              await this.db.removeHistoryEntry(id);
              await this.getHistory();
            } catch (error) {
              Utils.showToast(error, 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  onSongSearch(event: any) {
    const searchTerm = event.detail.value?.toLowerCase() || '';
    this.songSearchTerm = searchTerm;

    if (!searchTerm.trim()) {
      this.filteredSongs = [...this.songs];
      return;
    }

    this.filteredSongs = this.songs.filter(song => {
      const songText = `${song.prefix || ''}${song.number} ${song.name}`.toLowerCase();
      return songText.includes(searchTerm);
    });
  }

  resetSongSearch() {
    this.songSearchTerm = '';
    this.filteredSongs = [...this.songs];
  }

  toggleSongSelection(songId: number) {
    const index = this.selectedSongs.indexOf(songId);
    if (index > -1) {
      this.selectedSongs.splice(index, 1);
    } else {
      this.selectedSongs.push(songId);
    }
  }
}
