import { Component, OnInit } from '@angular/core';
import { History, Instrument, Person, Song } from '../utilities/interfaces';
import { DbService } from 'src/app/services/db.service';
import { AlertController, IonModal } from '@ionic/angular';
import { Utils } from '../utilities/Utils';
import { Browser } from '@capacitor/browser';
import { Role } from '../utilities/constants';

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
  public isOrchestra: boolean = false;
  public instruments: Instrument[] = [];
  public selectedInstruments: number[] = [];

  constructor(
    private db: DbService,
  ) { }

  async ngOnInit() {
    await this.getSongs();
  }

  async getSongs(): Promise<void> {
    this.isOrchestra = this.db.tenant().type === "orchestra";
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    const history: History[] = await this.db.getHistory();
    const conductors: Person[] = await this.db.getConductors(true);
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
    });

    this.withChoir = false;

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
          role: 'cancel',
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

  search(event: any): void {
    if (this.songs) {
      this.searchTerm = '';
      this.initializeItems();

      this.searchTerm = event.srcElement.value;

      if (!this.searchTerm) {
        return;
      }

      this.songsFiltered = this.filter();
    }
  }

  filter(): Song[] {
    if (this.searchTerm === '') {
      return this.songs;
    } else {
      return this.songs.filter((entry: Song) => {
        if (this.searchTerm) {
          if (entry.name.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1 ||
            entry.conductor.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1 ||
            String(entry.number).toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1) {
            return true;
          }
          return false;
        }
      });
    }
  }

  initializeItems(): void {
    this.songsFiltered = this.songs;
  }

  onTextAreaFocus(evt: any) {
    evt.target.children[0].children[0].select();
  }

  getInstrumentText(instrumentIds: number[]): string {
    const instruments: Instrument[] = this.instruments.filter((instrument: Instrument) => !instrumentIds.includes(instrument.id));
    // last instrument should be connected with 'und'

    if (instruments.length === 0) {
      return "";
    } else if (instruments.length === 1) {
      return instruments[0].name + " fehlt";
    }

    // , should be connected with 'und'
    if (instruments.length === 2) {
      return instruments.map((instrument: Instrument) => instrument.name).join(" und ") + " fehlen";
    }

    // more than 2 instruments, last should be connected only with 'und'
    return instruments.slice(0, -1).map((instrument: Instrument) => instrument.name).join(", ") + " und " + instruments[instruments.length - 1].name + " fehlen";
  }

}
