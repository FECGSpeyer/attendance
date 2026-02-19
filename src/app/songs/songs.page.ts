import { Component, OnInit } from '@angular/core';
import { GroupCategory, History, Group, Person, Song, Tenant, SongCategory, SongFile } from '../utilities/interfaces';
import { DbService } from 'src/app/services/db.service';
import { AlertController, IonModal, ItemReorderEventDetail } from '@ionic/angular';
import { Utils } from '../utilities/Utils';
import { Role } from '../utilities/constants';
import { Storage } from '@ionic/storage-angular';
import { Router } from '@angular/router';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

@Component({
    selector: 'app-songs',
    templateUrl: './songs.page.html',
    styleUrls: ['./songs.page.scss'],
    standalone: false
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
  public instruments: Group[] = [];
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
  public difficulty: number | null = null;
  public instrumentsToFilter: number[] = [];
  public currentSongs: { date: string, history: History[] }[] = [];
  public groupsWithFiles: Group[] = [];
  public selectedGroupFiles: { song: Song, file: SongFile }[] = [];
  public selectedGroupName: string = '';
  public isCurrentSongsModalOpen: boolean = false;
  public isGroupDirectoryModalOpen: boolean = false;
  public tenantData?: Tenant;
  public selectedCategory: string = "";
  private sub: RealtimeChannel;
  public tenantType: string;

  constructor(
    public db: DbService,
    private storage: Storage,
    private router: Router,
    private alertController: AlertController,
  ) { }

  // TrackBy function for main songs list
  trackBySongId = (_index: number, song: Song): number => song.id;

  async ngOnInit() {
    const pathParts = window.location.pathname.split('/');
    const songSharingId = pathParts[pathParts.length - 1];
    if (songSharingId !== "songs") {
      this.tenantData = await this.db.getTenantBySongSharingId(songSharingId);
      if (!this.tenantData) {
        Utils.showToast("Ungültiger Freigabe-Link.");
        return;
      }
    }

    this.tenantType = (this.tenantData ?? this.db.tenant()).type;
    this.sortOpt = await this.storage.get(`sortOptSongs${this.tenantData?.id ?? this.db.tenant().id}`) || "numberAsc";
    this.viewOpts = JSON.parse(await this.storage.get(`viewOptsSongs${this.tenantData?.id ?? this.db.tenant().id}`) || JSON.stringify(['withChoir', 'withSolo', 'missingInstruments', 'link', 'lastSung']));
    this.inclChoir = await this.storage.get(`inclChoirSongs${this.tenantData?.id ?? this.db.tenant().id}`) === "true";
    this.inclSolo = await this.storage.get(`inclSoloSongs${this.tenantData?.id ?? this.db.tenant().id}`) === "true";
    this.instrumentsToFilter = JSON.parse(await this.storage.get(`instrumentsToFilterSongs${this.tenantData?.id ?? this.db.tenant().id}`) || "[]");
    this.selectedCategory = await this.storage.get(`selectedCategorySongs${this.tenantData?.id ?? this.db.tenant().id}`) || "";
    this.currentSongs = await this.db.getCurrentSongs(this.tenantData?.id ?? this.db.tenant().id);

    await this.getSongs();
    this.buildGroupsWithFiles();

    this.subscribeToUpdates();
  }

  async ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  subscribeToUpdates() {
    this.sub?.unsubscribe();
    this.sub = this.db.getSupabase()
      .channel('att-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'songs' },
        (payload: RealtimePostgresChangesPayload<Song>) => {
          if ((payload.new as Song)?.tenantId === (this.tenantData?.id ?? this.db.tenant().id) || (payload.old as Song)?.id) {
            this.getSongs();
          }
        })
      .subscribe();
  }

  async getSongs(): Promise<void> {
    this.isOrchestra = (this.tenantData ?? this.db.tenant()).type === "orchestra";
    this.isAdmin = this.db.tenantUser()?.role === Role.ADMIN || this.db.tenantUser()?.role === Role.RESPONSIBLE;
    const history: History[] = await this.db.getHistory(this.tenantData?.id);
    const groups = this.tenantData ? await this.db.getGroups(this.tenantData.id) : this.db.groups();
    const conductors: Person[] = await this.db.getConductors(true, this.tenantData?.id, groups.find((g: Group) => g.maingroup)?.id);
    this.groupCategories = await this.db.getGroupCategories(this.tenantData?.id);
    if (this.isOrchestra) {
      this.instruments = groups.filter((instrument: Group) => !instrument.maingroup);
      this.selectedInstruments = groups.map((instrument: Group) => instrument.id);
    }
    this.songs = (await this.db.getSongs(this.tenantData?.id)).map((song: Song): Song => {
      const hisEntry: History | undefined = history.find((his: History): boolean => his.songId === song.id);
      const lastSung: string | undefined = hisEntry?.date;
      const conductor: Person | undefined = hisEntry ? conductors.find((con: Person) => con.id === hisEntry.person_id) : undefined;
      return {
        ...song,
        lastSung,
        conductor: conductor ? `${conductor.firstName} ${conductor.lastName}` : (hisEntry?.otherConductor ?? undefined),
        instrument_ids: song.instrument_ids?.length ? song.instrument_ids : this.selectedInstruments,
      }
    });
    this.songsFiltered = this.songs;

    await this.onFilterChanged();
    this.buildGroupsWithFiles();
  }

  buildGroupsWithFiles(): void {
    const groupIdsWithFiles = new Set<number>();
    for (const song of this.songs) {
      for (const file of song.files || []) {
        if (file.instrumentId && file.instrumentId > 2) {
          groupIdsWithFiles.add(file.instrumentId);
        }
      }
    }
    this.groupsWithFiles = this.instruments
      .filter(g => groupIdsWithFiles.has(g.id!))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  selectGroup(group: Group): void {
    this.selectedGroupName = group.name;
    this.selectedGroupFiles = [];
    for (const song of this.songs) {
      for (const file of song.files || []) {
        if (file.instrumentId === group.id) {
          this.selectedGroupFiles.push({ song, file });
        }
      }
    }
  }

  openFile(url: string): void {
    window.open(url, '_blank');
  }

  resetGroupSelection(): void {
    this.selectedGroupName = '';
    this.selectedGroupFiles = [];
  }

  async doRefresh(event: any) {
    await this.getSongs();

    window.setTimeout(() => {
      event.target.complete();
    }, 700);
  }

  async addSong(modal: IonModal, number: any, name: any, link: any, prefix: any) {
    if (this.songs.find((song: Song) => `${song.prefix ?? ""}${song.number}` === `${prefix ?? ""}${number}`)) {
      Utils.showToast("Die Liednummer ist bereits vergeben", "danger");
      return;
    } else if (link && !this.isValidHttpUrl(link)) {
      Utils.showToast("Der angegebene Link ist nicht valide", "danger");
      return;
    }
    const song = await this.db.addSong({
      number,
      name,
      link,
      withChoir: this.withChoir,
      withSolo: this.withSolo,
      instrument_ids: this.selectedInstruments,
      prefix: prefix || "",
    });

    this.withChoir = false;
    this.withSolo = false;

    await modal.dismiss();

    if (song?.id) {
      this.router.navigate([`tabs`, `settings`, "songs", `${song.id}`]);
    }
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
    await this.storage.set(`inclChoirSongs${this.tenantData?.id ?? this.db.tenant().id}`, this.inclChoir ? "true" : "false");
    await this.storage.set(`inclSoloSongs${this.tenantData?.id ?? this.db.tenant().id}`, this.inclSolo ? "true" : "false");
    await this.storage.set(`instrumentsToFilterSongs${this.tenantData?.id ?? this.db.tenant().id}`, JSON.stringify(this.instrumentsToFilter));
    await this.storage.set(`difficultyFilterSongs${this.tenantData?.id ?? this.db.tenant().id}`, this.difficulty);

    this.searchTerm = "";
    this.initializeItems();

    this.filter();
  }

  filter() {
    this.songsFiltered = this.songsFiltered.filter((song: Song) => {
      // Filter by category if selected
      if (this.selectedCategory && song.category !== this.selectedCategory) {
        return false;
      }

      if (this.instrumentsToFilter.length) {
        if (song.instrument_ids && !song.instrument_ids.some(r => this.instrumentsToFilter.includes(r))) {
          return false;
        }

        return this.filterChoirSolo(song);
      } else {
        return this.filterChoirSolo(song);
      }
    }).filter((song: Song) => {
      if (this.difficulty !== null && this.difficulty !== undefined) {
        return song.difficulty === this.difficulty;
      }
      return true;
    });

    this.onSortChanged();
  }

  async onSortChanged() {
    await this.storage.set(`sortOptSongs${this.tenantData?.id ?? this.db.tenant().id}`, this.sortOpt);

    if (this.sortOpt === "numberAsc") {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.number > b.number) ? 1 : -1);
    } else if (this.sortOpt === "numberDesc") {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.number < b.number) ? 1 : -1);
    } else if (this.sortOpt === "nameAsc") {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.name.toLowerCase() > b.name.toLowerCase()) ? 1 : -1);
    } else if (this.sortOpt === "nameDesc") {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.name.toLowerCase() < b.name.toLowerCase()) ? 1 : -1);
    } else if (this.sortOpt === "lastSungAsc") {
      // Oldest first (songs never sung at the end)
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => {
        if (!a.lastSung && !b.lastSung) return 0;
        if (!a.lastSung) return 1;
        if (!b.lastSung) return -1;
        return new Date(a.lastSung).getTime() - new Date(b.lastSung).getTime();
      });
    } else if (this.sortOpt === "lastSungDesc") {
      // Most recent first (songs never sung at the end)
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => {
        if (!a.lastSung && !b.lastSung) return 0;
        if (!a.lastSung) return 1;
        if (!b.lastSung) return -1;
        return new Date(b.lastSung).getTime() - new Date(a.lastSung).getTime();
      });
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
    await this.storage.set(`viewOptsSongs${this.tenantData?.id ?? this.db.tenant().id}`, JSON.stringify(this.viewOpts));
  }

  async onCategoryChanged() {
    await this.storage.set(`selectedCategorySongs${this.tenantData?.id ?? this.db.tenant().id}`, this.selectedCategory);
    this.searchTerm = "";
    this.initializeItems();
    this.filter();
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

  getSongSharingLink(): string {
    return `${window.location.origin}/${this.tenantData?.song_sharing_id ?? this.db.tenant().song_sharing_id}`;
  }

  copyShareLink() {
    navigator?.clipboard.writeText(this.getSongSharingLink());
    Utils.showToast("Der Link wurde in die Zwischenablage kopiert", "success");
  }

  openSong(songId: number, modal: IonModal) {
    modal.dismiss();
    if (!this.tenantData) {
      this.router.navigate([`/tabs/settings/songs/`, songId]);
      return;
    }
    this.router.navigate([`${this.tenantData?.song_sharing_id ?? this.db.tenant().song_sharing_id}`, `${songId}`]);
  }

  async addCategory() {
    const alert = await this.alertController.create({
      header: 'Kategorie hinzufügen',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Name der Kategorie'
        }
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
          cssClass: 'secondary',
        }, {
          text: 'Hinzufügen',
          handler: async (data) => {
            if (data.name && data.name.trim().length > 0) {
              this.db.addSongCategory({
                name: data.name.trim(),
                index: this.db.songCategories().length,
              }).then(() => {
                Utils.showToast("Kategorie hinzugefügt", "success");
                this.getSongs();
              });
            } else {
              Utils.showToast("Der Name der Kategorie darf nicht leer sein", "danger");
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async editCategory(category: SongCategory) {
    const alert = await this.alertController.create({
      header: 'Kategorie bearbeiten',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: category.name,
          placeholder: 'Name der Kategorie'
        }
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
          cssClass: 'secondary',
        }, {
          text: 'Speichern',
          handler: async (data) => {
            if (data.name && data.name.trim().length > 0) {
              this.db.updateSongCategory({
                name: data.name.trim(),
              }, category.id).then(() => {
                Utils.showToast("Kategorie gespeichert", "success");
                this.getSongs();
              });
            } else {
              Utils.showToast("Der Name der Kategorie darf nicht leer sein", "danger");
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async deleteCategory(categoryId: string) {
    const alert = await this.alertController.create({
      header: 'Kategorie löschen',
      message: 'Möchten Sie diese Kategorie wirklich löschen? Alle Werke in dieser Kategorie werden keiner neuen Kategorie zugewiesen.',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
          cssClass: 'secondary',
        }, {
          text: 'Löschen',
          handler: async () => {
            this.db.removeSongCategory(categoryId).then(async () => {
              Utils.showToast("Kategorie gelöscht", "success");
              await this.getSongs();
            });
          }
        }
      ]
    });

    await alert.present();
  }

  async handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    const data = ev.detail.complete(this.db.songCategories());

    for (let i = 0; i < data.length; i++) {
      const category = data[i];
      category.index = i;
      await this.db.updateSongCategory({ index: category.index, ...category }, category.id);
    }
  }

}
