import { Component, OnInit } from '@angular/core';
import { GroupCategory, History, Instrument, Person, Song } from '../utilities/interfaces';
import { DbService } from 'src/app/services/db.service';
import { AlertController, IonModal } from '@ionic/angular';
import { Utils } from '../utilities/Utils';
import { Browser } from '@capacitor/browser';
import { Role } from '../utilities/constants';
import { Storage } from '@ionic/storage-angular';

@Component({
  selector: 'app-songs',
  templateUrl: './songs.page.html',
  styleUrls: ['./songs.page.scss'],
})
export class SongsPage implements OnInit {
  public songs: Song[] = [];
  public songsFiltered: Song[] = [];
  searchTerm: string = "";
  public isAdmin: boolean = false;
  public withChoir: boolean = false;
  public withSolo: boolean = false;
  public inclChoir: boolean = false;
  public inclSolo: boolean = false;
  public isOrchestra: boolean = false;
  public instruments: Instrument[] = [];
  public selectedInstruments: number[] = [];
  public customModalOptions = {
    header: 'Gruppen wählen',
    breakpoints: [0, 0.7, 1],
    initialBreakpoint: 0.7,
  };
  public groupCategories: GroupCategory[] = [];
  public filterOpts = {};
  public sortOpt = "numberAsc";
  public viewOpts: string[] = ["withChoir", "withSolo", "missingInstruments", "link", "lastSung"];
  public instrumentsToFilter: number[] = [];

  constructor(
    private db: DbService,
    private storage: Storage,
  ) { }

  async ngOnInit() {
    this.sortOpt = await this.storage.get(`sortOptSongs${this.db.tenant().id}`) || "numberAsc";
    this.viewOpts = JSON.parse(await this.storage.get(`viewOptsSongs${this.db.tenant().id}`) || JSON.stringify(['withChoir', 'withSolo', 'missingInstruments', 'link', 'lastSung']));
    this.inclChoir = await this.storage.get(`inclChoirSongs${this.db.tenant().id}`) === "true";
    this.inclSolo = await this.storage.get(`inclSoloSongs${this.db.tenant().id}`) === "true";
    this.instrumentsToFilter = JSON.parse(await this.storage.get(`instrumentsToFilterSongs${this.db.tenant().id}`) || "[]");

    await this.getSongs();
  }

  async getSongs(): Promise<void> {
    this.isOrchestra = this.db.tenant().type === "orchestra";
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    const history: History[] = await this.db.getHistory();
    const conductors: Person[] = await this.db.getConductors(true);
    this.groupCategories = await this.db.getGroupCategories();
    if (this.isOrchestra) {
      this.instruments = (await this.db.getInstruments()).filter((instrument: Instrument) => !instrument.maingroup);
      this.selectedInstruments = this.instruments.map((instrument: Instrument) => instrument.id);
    }
    this.songs = (await this.db.getSongs()).map((song: Song): Song => {
      const hisEntry: History | undefined = history.find((his: History): boolean => his.songId === song.id);
      const lastSung: string | undefined = hisEntry?.date;
      const conductor: Person | undefined = hisEntry ? conductors.find((con: Person) => con.id === hisEntry.person_id) : undefined;
      return {
        ...song,
        lastSung,
        conductor: conductor ? `${conductor.firstName} ${conductor.lastName}` : undefined,
        instrument_ids: song.instrument_ids?.length ? song.instrument_ids : this.selectedInstruments,
      }
    });
    this.songsFiltered = this.songs;

    await this.onFilterChanged();
  }

  async doRefresh(event: any) {
    await this.getSongs();

    window.setTimeout(() => {
      event.target.complete();
    }, 700);
  }

  async addSong(modal: IonModal, number: any, name: any, link: any) {
    if (this.songs.find((song: Song) => song.number === Number(number))) {
      Utils.showToast("Die Liednummer ist bereits vergeben", "danger");
      return;
    } else if (link && !this.isValidHttpUrl(link)) {
      Utils.showToast("Der angegebene Link ist nicht valide", "danger");
      return;
    }
    await this.db.addSong({
      number,
      name,
      link,
      withChoir: this.withChoir,
      withSolo: this.withSolo,
      instrument_ids: this.selectedInstruments,
    });

    this.withChoir = false;
    this.withSolo = false;

    await modal.dismiss();
    this.getSongs();
  }

  async editSong(id: number, modal: IonModal, number: any, name: any, link: any, instrument_ids: any) {
    if (link && !this.isValidHttpUrl(link)) {
      Utils.showToast("Der angegebene Link ist nicht valide", "danger");
      return;
    }

    await this.db.editSong(id, {
      number,
      name,
      link,
      withChoir: this.songs.find((song: Song) => song.id === id).withChoir,
      withSolo: this.songs.find((song: Song) => song.id === id).withSolo,
      instrument_ids: instrument_ids ?? [],
    });

    await modal.dismiss();
    this.getSongs();
  }

  async removeSong(id: number, modal: IonModal) {
    const alert = await new AlertController().create({
      header: 'Werk löschen',
      message: 'Soll das Werk wirklich gelöscht werden?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        }, {
          text: 'Löschen',
          handler: async () => {
            await this.db.removeSong(id);
            await modal.dismiss();
            await this.getSongs();
          }
        }
      ]
    });

    await alert.present();
  }

  isValidHttpUrl(link: string) {
    let url: URL;

    try {
      url = new URL(link);
    } catch (_) {
      return false;
    }

    return url.protocol === "http:" || url.protocol === "https:";
  }

  openLink(link: string) {
    Browser.open({
      url: link
    });
  }

  search(event: any) {
    if (this.songs) {
      this.searchTerm = '';
      this.initializeItems();

      this.searchTerm = event.srcElement.value;

      this.filter();

      if (!this.searchTerm) {
        return;
      }

      this.songsFiltered = this.searchSongs();
    }
  }

  searchSongs() {
    if (this.searchTerm === '') {
      return this.songsFiltered;
    } else {
      return this.songsFiltered.filter((entry: Song) => {
        if (this.searchTerm) {
          if (entry.name.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1 ||
            entry.conductor?.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1 ||
            String(entry.number).toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1) {
            return true;
          }
          return false;
        }
      });
    }
  }

  async onFilterChanged() {
    await this.storage.set(`inclChoirSongs${this.db.tenant().id}`, this.inclChoir ? "true" : "false");
    await this.storage.set(`inclSoloSongs${this.db.tenant().id}`, this.inclSolo ? "true" : "false");
    await this.storage.set(`instrumentsToFilterSongs${this.db.tenant().id}`, JSON.stringify(this.instrumentsToFilter));

    this.searchTerm = "";
    this.initializeItems();

    this.filter();
  }

  filter() {
    this.songsFiltered = this.songsFiltered.filter((song: Song) => {
      if (this.instrumentsToFilter.length) {
        if (song.instrument_ids && !song.instrument_ids.some(r => this.instrumentsToFilter.includes(r))) {
          return false;
        }

        return this.filterChoirSolo(song);
      } else {
        return this.filterChoirSolo(song);
      }
    });

    this.onSortChanged();
  }

  async onSortChanged() {
    await this.storage.set(`sortOptSongs${this.db.tenant().id}`, this.sortOpt);

    if (this.sortOpt === "numberAsc") {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.number > b.number) ? 1 : -1);
    } else if (this.sortOpt === "numberDesc") {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.number < b.number) ? 1 : -1);
    } else if (this.sortOpt === "nameAsc") {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.name.toLowerCase() > b.name.toLowerCase()) ? 1 : -1);
    } else if (this.sortOpt === "nameDesc") {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.name.toLowerCase() < b.name.toLowerCase()) ? 1 : -1);
    }
  }

  filterChoirSolo(song: Song): boolean {
    if (!this.inclChoir && !this.inclSolo) {
      return true;
    }

    if (this.inclChoir && this.inclSolo) {
      return song.withChoir && song.withSolo;
    } else if (this.inclChoir) {
      return song.withChoir;
    } else if (this.inclSolo) {
      return song.withSolo;
    }
    return true;
  }

  async onViewChanged() {
    await this.storage.set(`viewOptsSongs${this.db.tenant().id}`, JSON.stringify(this.viewOpts));
  }

  initializeItems(): void {
    this.songsFiltered = this.songs;
  }

  onTextAreaFocus(evt: any) {
    evt.target?.children?.[0]?.children?.[0]?.select();
  }

  getInstrumentText(instrumentIds: number[]): string {
    return Utils.getInstrumentText(instrumentIds, this.instruments, this.groupCategories);
  }

}
