import { dateFmt } from '../i18n/languages';
import { Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { GroupCategory, History, Group, Person, Song, Tenant, SongCategory, SongFile } from '../utilities/interfaces';
import { DbService } from 'src/app/services/db.service';
import { AlertController, IonModal, IonPopover, IonRouterOutlet, ItemReorderEventDetail, ModalController } from '@ionic/angular/lazy';
import { Utils } from '../utilities/Utils';
import { FieldType, Role } from '../utilities/constants';
import dayjs from 'dayjs';
import { Storage } from '@ionic/storage-angular';
import { Router } from '@angular/router';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { SongImportPage } from './import/import.page';
import { PrintService } from '../services/print/print.service';
import { translate } from '@jsverse/transloco';

@Component({
    selector: 'app-songs',
    templateUrl: './songs.page.html',
    styleUrls: ['./songs.page.scss'],
    standalone: false
})
export class SongsPage implements OnInit, OnDestroy {
  private printService = inject(PrintService);
  @ViewChild('categoriesModal') categoriesModal: IonModal;
  @ViewChild(IonRouterOutlet) routerOutlet: IonRouterOutlet;
  public hasSongSharing = false;
  public songs: Song[] = [];
  public songsFiltered: Song[] = [];
  public loaded = false;
  private loadedTenantId: number | undefined;
  searchTerm = '';
  public isAdmin = false;
  public showSongsTab = false;
  public isStandaloneTab = false;
  public withChoir = false;
  public withSolo = false;
  public inclChoir = false;
  public inclSolo = false;
  public isOrchestra = false;
  public instruments: Group[] = [];
  public selectedInstruments: number[] = [];
  public customModalOptions = {
    header: translate('songs.chooseGroups'),
    breakpoints: [0, 0.7, 1],
    initialBreakpoint: 0.7,
    handleBehavior: 'none',
  };
  public groupCategories: GroupCategory[] = [];
  public sortOpt = 'numberAsc';
  public viewOpts: string[] = ['withChoir', 'withSolo', 'missingInstruments', 'link', 'lastSung'];
  public difficulty: number | null = null;
  public instrumentsToFilter: number[] = [];
  public currentSongs: { date: string; history: History[] }[] = [];
  public groupsWithFiles: Group[] = [];
  private directoryGroups: Group[] = [];
  public selectedGroupFiles: { song: Song; file: SongFile }[] = [];
  public selectedGroupName = '';
  public isCurrentSongsModalOpen = false;
  public isGroupDirectoryModalOpen = false;
  public tenantData?: Tenant;
  public selectedCategories: string[] = [];
  public selectedCategory = '';
  public filterOpts: { [key: string]: any } = {};
  public fieldTypes = FieldType;
  private sub: RealtimeChannel;
  public tenantType: string;
  // Populated from a direct fetch for public share links (db.songCategories()
  // is only ever populated for a logged-in session via setTenant()).
  public categories: SongCategory[] = [];

  constructor(
    public db: DbService,
    private storage: Storage,
    private router: Router,
    private alertController: AlertController,
    private modalController: ModalController,
  ) { }

  // TrackBy function for main songs list
  trackBySongId = (_index: number, song: Song): number => song.id;

  // Render the list in chunks: thousands of ion-items at once make the page sluggish.
  private static readonly DISPLAY_CHUNK = 100;
  public displayLimit = SongsPage.DISPLAY_CHUNK;

  loadMoreSongs(event: any): void {
    this.displayLimit += SongsPage.DISPLAY_CHUNK;
    event.target.complete();
  }

  async ngOnInit() {
    const pathParts = window.location.pathname.split('/');
    const lastSegment = pathParts[pathParts.length - 1];
    const isAuthenticatedRoute = lastSegment === 'songs' || lastSegment === 'songs-tab';
    this.isStandaloneTab = lastSegment === 'songs-tab';
    if (!isAuthenticatedRoute) {
      this.tenantData = await this.db.getTenantBySongSharingId(lastSegment);
      if (!this.tenantData) {
        Utils.showToast(translate('songs.invalidShareLink'));
        return;
      }
    }

    this.tenantType = (this.tenantData ?? this.db.tenant()).type;
    const tid = this.tenantData?.id ?? this.db.tenant().id;
    const [sortOpt, viewOptsRaw, inclChoirRaw, inclSoloRaw, instrumentsRaw, categoriesRaw, categoryRaw, filterOptsRaw, currentSongs] =
      await Promise.all([
        this.storage.get(`sortOptSongs${tid}`),
        this.storage.get(`viewOptsSongs${tid}`),
        this.storage.get(`inclChoirSongs${tid}`),
        this.storage.get(`inclSoloSongs${tid}`),
        this.storage.get(`instrumentsToFilterSongs${tid}`),
        this.storage.get(`selectedCategoriesSongs${tid}`),
        this.storage.get(`selectedCategorySongs${tid}`),
        this.storage.get(`filterOptsSongs${tid}`),
        this.db.getCurrentSongs(tid),
      ]);
    this.sortOpt = sortOpt || 'numberAsc';
    this.viewOpts = JSON.parse(viewOptsRaw || JSON.stringify(['withChoir', 'withSolo', 'missingInstruments', 'link', 'lastSung']));
    this.inclChoir = inclChoirRaw === 'true';
    this.inclSolo = inclSoloRaw === 'true';
    this.instrumentsToFilter = JSON.parse(instrumentsRaw || '[]');
    this.selectedCategories = JSON.parse(categoriesRaw || '[]');
    this.selectedCategory = categoryRaw || '';
    this.filterOpts = JSON.parse(filterOptsRaw || '{}');
    this.currentSongs = currentSongs;

    await this.getSongs();
    this.buildGroupsWithFiles();
    this.showSongsTab = this.db.getShowSongsTab();
    this.hasSongSharing = !!(this.tenantData?.song_sharing_id ?? this.db.tenant()?.song_sharing_id);

    this.loaded = true;
    this.loadedTenantId = this.tenantData?.id ?? this.db.tenant().id;
    this.subscribeToUpdates();
  }

  async ionViewWillEnter() {
    if (!this.loaded || this.tenantData) { return; }
    const currentTenantId = this.db.tenant().id;
    this.hasSongSharing = !!this.db.tenant()?.song_sharing_id;
    if (currentTenantId !== this.loadedTenantId) {
      this.loaded = false;
      this.loadedTenantId = currentTenantId;
      await this.getSongs();
      this.buildGroupsWithFiles();
      this.loaded = true;
      this.subscribeToUpdates();
    }
  }

  async ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  subscribeToUpdates() {
    this.sub?.unsubscribe();
    const effectiveTenantId = this.db.effectiveSongTenantId();
    this.sub = this.db.getSupabase()
      .channel(`songs-changes-${effectiveTenantId}`).on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'songs' },
        (payload: RealtimePostgresChangesPayload<Song>) => {
          if ((payload.new as Song)?.tenantId === effectiveTenantId || (payload.old as Song)?.id) {
            this.getSongs();
          }
        })
      .subscribe();
  }

  async getSongs(): Promise<void> {
    this.isOrchestra = (this.tenantData ?? this.db.tenant()).type === 'orchestra';
    this.isAdmin = this.db.tenantUser()?.role === Role.ADMIN || this.db.tenantUser()?.role === Role.RESPONSIBLE;
    const groups = this.tenantData ? await this.db.getGroups(this.tenantData.id) : this.db.groups();
    const mainGroupId = groups.find((g: Group) => g.maingroup)?.id;
    const [history, conductors, groupCategories, rawSongs, categories] = await Promise.all([
      this.db.getHistory(this.tenantData?.id),
      this.db.getConductors(true, this.tenantData?.id, mainGroupId),
      this.db.getGroupCategories(this.tenantData?.id),
      this.db.getSongs(this.tenantData?.id),
      this.tenantData
        ? this.db.songCategorySvc.getSongCategories(this.tenantData.id)
        : Promise.resolve(this.db.songCategories()),
    ]);
    this.groupCategories = groupCategories;
    this.categories = categories;
    this.directoryGroups = groups.filter((g: Group) => g.maingroup !== true);
    // Drop stored category selections that no longer exist (e.g. all categories deleted),
    // otherwise songs and the group directory stay hidden without a way to reset the filter.
    const categoryIds = new Set(categories.map(c => c.id));
    if (this.selectedCategory && !categoryIds.has(this.selectedCategory)) {
      this.selectedCategory = '';
    }
    this.selectedCategories = this.selectedCategories.filter(id => categoryIds.has(id));
    if (this.isOrchestra) {
      this.instruments = groups.filter((instrument: Group) => instrument.maingroup !== true);
      this.selectedInstruments = groups.map((instrument: Group) => instrument.id);
    }
    this.songs = rawSongs.map((song: Song): Song => {
      // History is sorted by date descending and also contains entries of planned future events.
      const songHistory = history.filter((his: History): boolean => his.songId === song.id);
      const hisEntry: History | undefined = songHistory.find((his: History): boolean => !dayjs(his.date).isAfter(dayjs(), 'day'));
      const nextPlannedEntry: History | undefined = songHistory.filter((his: History): boolean => dayjs(his.date).isAfter(dayjs(), 'day')).pop();
      const lastSung: string | undefined = hisEntry?.date;
      const conductor: Person | undefined = hisEntry ? conductors.find((con: Person) => con.id === hisEntry.person_id) : undefined;
      return {
        ...song,
        lastSung,
        nextPlanned: nextPlannedEntry?.date,
        conductor: conductor ? `${conductor.firstName} ${conductor.lastName}` : (hisEntry?.otherConductor ?? undefined),
        instrument_ids: song.instrument_ids?.length ? song.instrument_ids : this.selectedInstruments,
      };
    });
    this.songsFiltered = this.songs;

    await this.onFilterChanged();
    this.buildGroupsWithFiles();
  }

  private static readonly CONDUCTOR_GROUP_ID = -1;

  private isScoreFile(file: SongFile): boolean {
    return !file.instrumentId && file.note === 'Partitur';
  }

  buildGroupsWithFiles(): void {
    const groupIdsWithFiles = new Set<number>();
    let hasScores = false;
    for (const song of this.songs) {
      for (const file of song.files || []) {
        if (file.instrumentId && file.instrumentId > 2) {
          groupIdsWithFiles.add(file.instrumentId);
        } else if (this.isScoreFile(file)) {
          hasScores = true;
        }
      }
    }
    const groups = this.directoryGroups
      .filter(g => groupIdsWithFiles.has(g.id!))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (hasScores) {
      // virtual group listing all scores (Partituren)
      groups.unshift({
        id: SongsPage.CONDUCTOR_GROUP_ID,
        name: translate('songs.conductors'),
        tenantId: this.tenantData?.id ?? this.db.tenant()?.id,
        maingroup: false,
      });
    }
    this.groupsWithFiles = groups;
  }

  async toggleSongsTab(popover?: IonPopover): Promise<void> {
    await popover?.dismiss();
    this.showSongsTab = !this.showSongsTab;
    await this.db.setShowSongsTab(this.showSongsTab);
  }
  async printNotesForGroup(): Promise<void> {
    const groups = this.db.groups().filter(g => g.maingroup !== true);
    const alert = await this.alertController.create({
      header: translate('songs.chooseGroup'),
      inputs: groups.map(g => ({
        type: 'radio' as const,
        label: g.name,
        value: g.id,
      })),
      buttons: [{
        text: translate('common.cancel'),
        role: 'cancel',
      }, {
        text: translate('songs.printScores'),
        handler: async (groupId: number) => {
          if (!groupId) {
            Utils.showToast(translate('songs.chooseGroupPlease'), 'warning');
            return false;
          }

          const currentSongs = await this.db.getCurrentSongs();
          const filesToPrint: { song: Song; file: SongFile }[] = [];

          for (const group of currentSongs) {
            for (const his of group.history) {
              if (his.song?.files) {
                const file = his.song.files.find(f => f.instrumentId === groupId);
                if (file) filesToPrint.push({ song: his.song, file });
              }
            }
          }

          if (!filesToPrint.length) {
            Utils.showToast(translate('songs.noScoresCurrent'), 'warning');
            return;
          }

          const groupName = groups.find(g => g.id === groupId)?.name ?? translate('songs.group');
          await this.printService.printEntries(filesToPrint, `Noten_${groupName}_${new Date().toISOString().slice(0, 10)}.pdf`);
        },
      }],
    });
    await alert.present();
  }

  async printGroupFolder(): Promise<void> {
    if (!this.selectedGroupFiles.length) {
      Utils.showToast(translate('songs.noScoresGroup'), 'warning');
      return;
    }
    const files = [...this.selectedGroupFiles].sort((a, b) =>
      (a.song.prefix ?? '').localeCompare(b.song.prefix ?? '') || (a.song.number ?? 0) - (b.song.number ?? 0)
    );
    const fileName = `Mappe_${this.selectedGroupName}_${new Date().toISOString().slice(0, 10)}.pdf`;
    await this.printService.printEntries(files, fileName);
  }

  selectGroup(group: Group): void {
    this.selectedGroupName = group.name;
    this.selectedGroupFiles = [];
    for (const song of this.songs) {
      for (const file of song.files || []) {
        const matches = group.id === SongsPage.CONDUCTOR_GROUP_ID
          ? this.isScoreFile(file)
          : file.instrumentId === group.id;
        if (matches) {
          this.selectedGroupFiles.push({ song, file });
        }
      }
    }
  }

  openFile(url: string): void {
    Utils.openFileNative(url);
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

  async openImportModal(popover?: IonPopover) {
    await popover?.dismiss();
    const modal = await this.modalController.create({
      component: SongImportPage,
      presentingElement: this.routerOutlet?.nativeEl,
      backdropDismiss: false,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data?.imported) {
      await this.getSongs();
    }
  }

  async exportSongsPdf(popover?: IonPopover): Promise<void> {
    await popover?.dismiss();
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const shortName = this.tenantData?.shortName ?? this.db.tenant()?.shortName ?? '';
    const date = dayjs().format(dateFmt());
    const branding = await Utils.buildTenantBranding(this.db.getBrandingSource());
    const headerOpts = {
      title: translate('songs.catalogTitle', { tenant: shortName }),
      subtitle: translate('planning.asOf', { date }),
    };

    const additionalFields = this.db.tenant()?.song_additional_fields ?? [];
    const visibleExtraFields = additionalFields.filter(f => this.viewOpts.includes(f.id));

    const head: string[] = [translate('songs.numberShort'), translate('songs.name')];
    if (this.viewOpts.includes('lastSung') && !this.tenantData) {
      head.push(this.tenantType === 'orchestra' ? translate('songs.lastPlayed') : translate('songs.lastSung'));
    }
    if (this.viewOpts.includes('difficulty')) { head.push(translate('songs.difficultyShort')); }
    if (this.viewOpts.includes('withChoir')) { head.push(translate('songs.choirOrchShort')); }
    if (this.viewOpts.includes('withSolo')) { head.push(translate('songs.solo')); }
    for (const f of visibleExtraFields) { head.push(f.name); }

    const difficultyLabel = (d?: number) => d === 1 ? translate('songs.easy') : d === 2 ? translate('songs.medium') : d === 3 ? translate('songs.hard') : '';

    const body = this.songsFiltered.map(song => {
      const row: string[] = [
        `${song.prefix ?? ''}${song.number}`,
        song.name,
      ];
      if (this.viewOpts.includes('lastSung') && !this.tenantData) {
        row.push(song.lastSung ? dayjs(song.lastSung).format(dateFmt()) : '');
      }
      if (this.viewOpts.includes('difficulty')) { row.push(difficultyLabel(song.difficulty)); }
      if (this.viewOpts.includes('withChoir')) { row.push(song.withChoir ? translate('common.yes') : ''); }
      if (this.viewOpts.includes('withSolo')) { row.push(song.withSolo ? translate('common.yes') : ''); }
      for (const f of visibleExtraFields) {
        const val = song.additional_fields?.[f.id];
        row.push(val === true ? translate('common.yes') : val === false ? translate('common.no') : (val ?? '').toString());
      }
      return row;
    });

    const buildTable = (doc: any, styles: any, headStyles: any) => {
      const contentTop = Utils.addBrandingHeader(doc, branding, headerOpts);
      (doc as any).autoTable({
        head: [head],
        body,
        margin: { top: contentTop, bottom: 14 },
        theme: 'plain',
        styles,
        headStyles,
        bodyStyles: { fillColor: false },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didDrawPage: () => { Utils.addBrandingHeader(doc, branding, headerOpts); },
      });
    };

    const defaultStyles = { font: Utils.EXPORT_FONT, fontSize: 11, cellPadding: 3.5, textColor: [30, 30, 30], lineColor: [180, 180, 180], lineWidth: 0 };
    const defaultHeadStyles = { fillColor: false, textColor: [50, 50, 50], fontStyle: 'bold', lineWidth: { bottom: 0.5 }, lineColor: [100, 100, 100] };

    const probe = new jsPDF({ compress: true });
    await Utils.registerExportFont(probe);
    buildTable(probe, defaultStyles, defaultHeadStyles);
    const pages = probe.getNumberOfPages();

    let styles: any = defaultStyles;
    let headStyles: any = defaultHeadStyles;
    if (pages > 1) {
      styles = { ...defaultStyles, cellPadding: 2 };
      const probe2 = new jsPDF({ compress: true });
      await Utils.registerExportFont(probe2);
      buildTable(probe2, styles, headStyles);
      if (probe2.getNumberOfPages() > 1) {
        styles = { ...styles, fontSize: 9 };
        const probe3 = new jsPDF({ compress: true });
        await Utils.registerExportFont(probe3);
        buildTable(probe3, styles, headStyles);
        if (probe3.getNumberOfPages() > 1) {
          styles = { ...styles, fontSize: 8, cellPadding: 1.5 };
        }
      }
    }

    const doc = new jsPDF({ compress: true });
    await Utils.registerExportFont(doc);
    buildTable(doc, styles, headStyles);

    const fileName = `${shortName}_Werkverzeichnis_${date.replace(/\./g, '-')}.pdf`;
    await Utils.downloadFileNative(doc.output('blob'), fileName);
  }

  async addSong(modal: IonModal, number: any, name: any, link: any, prefix: any) {
    if (this.songs.find((song: Song) => `${song.prefix ?? ''}${song.number}` === `${prefix ?? ''}${number}`)) {
      Utils.showToast(translate('songs.numberTaken'), 'danger');
      return;
    } else if (link && !this.isValidHttpUrl(link)) {
      Utils.showToast(translate('songs.invalidLink'), 'danger');
      return;
    }
    const song = await this.db.addSong({
      number,
      name,
      link,
      withChoir: this.withChoir,
      withSolo: this.withSolo,
      instrument_ids: this.selectedInstruments,
      prefix: prefix || '',
    });

    this.withChoir = false;
    this.withSolo = false;

    await modal.dismiss();

    if (song?.id) {
      if (this.isStandaloneTab) {
        this.router.navigate(['tabs', 'songs-tab', `${song.id}`]);
      } else {
        this.router.navigate([`tabs`, `settings`, 'songs', `${song.id}`]);
      }
    }
  }

  async editSong(id: number, modal: IonModal, number: any, name: any, link: any, instrument_ids: any) {
    if (link && !this.isValidHttpUrl(link)) {
      Utils.showToast(translate('songs.invalidLink'), 'danger');
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

    return url.protocol === 'http:' || url.protocol === 'https:';
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
            `${entry.prefix ?? ''}${entry.number}`.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1) {
            return true;
          }
          return false;
        }
      });
    }
  }

  async onFilterChanged() {
    await this.storage.set(`inclChoirSongs${this.tenantData?.id ?? this.db.tenant().id}`, this.inclChoir ? 'true' : 'false');
    await this.storage.set(`inclSoloSongs${this.tenantData?.id ?? this.db.tenant().id}`, this.inclSolo ? 'true' : 'false');
    await this.storage.set(`instrumentsToFilterSongs${this.tenantData?.id ?? this.db.tenant().id}`, JSON.stringify(this.instrumentsToFilter));
    await this.storage.set(`difficultyFilterSongs${this.tenantData?.id ?? this.db.tenant().id}`, this.difficulty);
    await this.storage.set(`filterOptsSongs${this.tenantData?.id ?? this.db.tenant().id}`, JSON.stringify(this.filterOpts));
    await this.storage.set(`selectedCategoriesSongs${this.tenantData?.id ?? this.db.tenant().id}`, JSON.stringify(this.selectedCategories));

    this.searchTerm = '';
    this.initializeItems();

    this.filter();
  }

  filter() {
    this.songsFiltered = this.songsFiltered.filter((song: Song) => {
      // Filter by category if selected
      if (this.selectedCategory && !song.category_ids?.includes(this.selectedCategory)) {
        return false;
      }
      if (this.selectedCategories.length > 0 &&
          !this.selectedCategories.some(id => song.category_ids?.includes(id))) {
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
    }).filter((song: Song) => {
      for (const field of this.db.tenant()?.song_additional_fields ?? []) {
        const filterVal = this.filterOpts[field.id];
        if (filterVal !== undefined && filterVal !== null && filterVal !== '') {
          const songVal = song.additional_fields?.[field.id];
          const normalizedFilter = filterVal === 'true' ? true : filterVal === 'false' ? false : filterVal;
          if (songVal !== normalizedFilter) { return false; }
        }
      }
      return true;
    });

    this.onSortChanged();
  }

  async onSortChanged() {
    await this.storage.set(`sortOptSongs${this.tenantData?.id ?? this.db.tenant().id}`, this.sortOpt);

    if (this.sortOpt === 'numberAsc') {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.number > b.number) ? 1 : -1);
    } else if (this.sortOpt === 'numberDesc') {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.number < b.number) ? 1 : -1);
    } else if (this.sortOpt === 'nameAsc') {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.name.toLowerCase() > b.name.toLowerCase()) ? 1 : -1);
    } else if (this.sortOpt === 'nameDesc') {
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => (a.name.toLowerCase() < b.name.toLowerCase()) ? 1 : -1);
    } else if (this.sortOpt === 'lastSungAsc') {
      // Oldest first (songs never sung at the end)
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => {
        if (!a.lastSung && !b.lastSung) {return 0;}
        if (!a.lastSung) {return 1;}
        if (!b.lastSung) {return -1;}
        return new Date(a.lastSung).getTime() - new Date(b.lastSung).getTime();
      });
    } else if (this.sortOpt === 'lastSungDesc') {
      // Most recent first (songs never sung at the end)
      this.songsFiltered = this.songsFiltered.sort((a: Song, b: Song) => {
        if (!a.lastSung && !b.lastSung) {return 0;}
        if (!a.lastSung) {return 1;}
        if (!b.lastSung) {return -1;}
        return new Date(b.lastSung).getTime() - new Date(a.lastSung).getTime();
      });
    }
    // sort() mutates in place; a new reference lets the pure slice pipe pick up the new order
    this.songsFiltered = [...this.songsFiltered];
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
    this.searchTerm = '';
    this.initializeItems();
    this.filter();
  }

  initializeItems(): void {
    this.songsFiltered = this.songs;
    this.displayLimit = SongsPage.DISPLAY_CHUNK;
  }

  onTextAreaFocus(evt: any) {
    evt.target?.children?.[0]?.children?.[0]?.select();
  }

  getInstrumentText(instrumentIds: number[]): string {
    return Utils.getInstrumentText(instrumentIds, this.instruments, this.groupCategories);
  }

  getSongSharingLink(): string {
    return `https://attendix.de/${this.tenantData?.song_sharing_id ?? this.db.tenant().song_sharing_id}`;
  }

  async openCategoriesModal(popover: IonPopover): Promise<void> {
    await popover.dismiss();
    await this.categoriesModal.present();
  }

  copyShareLink(popover?: IonPopover) {
    popover?.dismiss();
    navigator?.clipboard.writeText(this.getSongSharingLink());
    Utils.showToast(translate('songs.linkCopied'), 'success');
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
      header: translate('songs.addCategory'),
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: translate('songs.categoryName')
        }
      ],
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
          cssClass: 'secondary',
        }, {
          text: translate('attendance.add'),
          handler: async (data) => {
            if (data.name && data.name.trim().length > 0) {
              this.db.addSongCategory({
                name: data.name.trim(),
                index: this.db.songCategories().length,
              }).then(() => {
                Utils.showToast(translate('songs.categoryAdded'), 'success');
                this.getSongs();
              });
            } else {
              Utils.showToast(translate('songs.categoryNameEmpty'), 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async editCategory(category: SongCategory) {
    const alert = await this.alertController.create({
      header: translate('songs.editCategory'),
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: category.name,
          placeholder: translate('songs.categoryName')
        }
      ],
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
          cssClass: 'secondary',
        }, {
          text: translate('common.save'),
          handler: async (data) => {
            if (data.name && data.name.trim().length > 0) {
              this.db.updateSongCategory({
                name: data.name.trim(),
              }, category.id).then(() => {
                Utils.showToast(translate('songs.categorySaved'), 'success');
                this.getSongs();
              });
            } else {
              Utils.showToast(translate('songs.categoryNameEmpty'), 'danger');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async deleteCategory(categoryId: string) {
    const alert = await this.alertController.create({
      header: translate('songs.deleteCategory'),
      message: translate('songs.deleteCategoryMessage'),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
          cssClass: 'secondary',
        }, {
          text: translate('common.delete'),
          handler: async () => {
            this.db.removeSongCategory(categoryId).then(async () => {
              Utils.showToast(translate('songs.categoryDeleted'), 'success');
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
