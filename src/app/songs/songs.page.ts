import { Component, OnInit } from '@angular/core';
import { History, Person, Song } from '../utilities/interfaces';
import { DbService } from 'src/app/services/db.service';
import { IonModal } from '@ionic/angular';
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

  constructor(
    private db: DbService,
  ) { }

  async ngOnInit() {
    await this.getSongs();
  }

  async getSongs(): Promise<void> {
    this.db.authenticationState.subscribe((state: { role: Role }) => {
      this.isAdmin = state.role === Role.ADMIN;
    });
    const history: History[] = await this.db.getHistory();
    const conductors: Person[] = await this.db.getConductors(true);
    this.songs = (await this.db.getSongs()).map((song: Song): Song => {
      const hisEntry: History | undefined = history.find((his: History): boolean => his.songId === song.id);
      const lastSung: string | undefined = hisEntry?.date;
      const conductor: Person | undefined = hisEntry ? conductors.find((con: Person) => con.id === hisEntry.conductor) : undefined;
      return {
        ...song,
        lastSung,
        conductor: conductor ? `${conductor.firstName} ${conductor.lastName}` : undefined,
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

  async addSong(modal: IonModal, number: any, name: any, link: any, withChoir: any) {
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
      withChoir: withChoir === "on",
    });

    await modal.dismiss();
    this.getSongs();
  }

  async editSong(id: number, modal: IonModal, number: any, name: any, link: any) {
    if (link && !this.isValidHttpUrl(link)) {
      Utils.showToast("Der angegebene Link ist nicht valide", "danger");
      return;
    }

    await this.db.editSong(id, {
      number,
      name,
      link,
      withChoir: this.songs.find((song: Song) => song.id === id).withChoir,
    });

    await modal.dismiss();
    this.getSongs();
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

}
