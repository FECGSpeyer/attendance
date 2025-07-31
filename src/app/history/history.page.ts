import { Component, OnInit } from '@angular/core';
import { AlertController, IonItemSliding, IonModal, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DbService } from '../services/db.service';
import { Attendance, FieldSelection, History, Person, Song } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

interface GroupedHistory { date: string, parts: History[] };

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
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
    conductor: 0,
    date: new Date().toISOString(),
  };
  searchTerm: string = "";
  songs: Song[] = [];
  otherConductor: number = 9999999999;
  selectedSongs: number[] = [];

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit(): Promise<void> {
    this.songs = await this.db.getSongs();
    this.selectedSongs = [this.songs[0].id];
    this.conductors = await this.db.getConductors(true);
    this.activeConductors = this.conductors.filter((con: Person) => !con.left);
    this.historyEntry.conductor = this.activeConductors[0].id;

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
        count: attendances.filter((att: Attendance) => this.isSongInPlan(att, entry.songId, entry.date)).length
      }
    });

    const grouped: GroupedHistory = this.history.reduce((r: History, a: History) => {
      r[dayjs(a.date).format("DD.MM.YYYY")] = r[dayjs(a.date).format("DD.MM.YYYY")] || [];
      r[dayjs(a.date).format("DD.MM.YYYY")].push(a);
      return r;
    }, Object.create(null));

    const sorted: string[] = Object.keys(grouped).sort((a: string, b: string): number => {
      return dayjs(a).toDate().getTime() - dayjs(b).toDate().getTime();
    });

    this.groupedHistory = sorted.map((date: string) => {
      return {
        date,
        parts: grouped[date]
      }
    });

    this.initializeItems();
  }

  isSongInPlan(att: Attendance, songId: number, date: string): boolean {
    if (att.type !== "uebung" || !att.plan) {
      return false;
    }

    if (dayjs(att.date).isBefore(date) && dayjs(att.date).isAfter(dayjs(date).subtract(4, "months"))) {
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
    if (this.historyEntry.conductor === this.otherConductor) {
      const alert = await this.alertController.create({
        header: 'Dirigent eingeben',
        inputs: [
          {
            type: "text",
            name: "conductor",
            placeholder: "Dirigent",
          }
        ],
        buttons: ["Abbrechen", {
          text: "Speichern",
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
      if (this.historyEntry.conductor === this.otherConductor) {
        delete this.historyEntry.conductor;
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
        conductor: this.conductors[0].id,
        date: this.historyEntry.date,
      };
      this.dateString = format(new Date(this.historyEntry.date), 'dd.MM.yyyy');
    } else {
      Utils.showToast("Bitte wähle mindestens ein Werk an", "danger");
    }
  }

  async remove(id: number, sliding: IonItemSliding) {
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
              Utils.showToast(error, "danger");
            }
          }
        }
      ]
    });

    await alert.present();
  }

}
