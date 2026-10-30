import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, InfiniteScrollCustomEvent, LoadingController } from '@ionic/angular/lazy';
import { translate } from '@jsverse/transloco';
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { ExtraField, Group, OrgSongFile, OrgSongResult, Song, Tenant } from 'src/app/utilities/interfaces';
import {
  findSongsWithSameName,
  isSongNumberTaken,
  mapExtraFields,
  mapGroupByName,
  nextFreeSongNumber,
} from 'src/app/utilities/song-copy';
import { Utils } from 'src/app/utilities/Utils';

const PAGE_SIZE = 50;

interface TenantChip {
  id: number;
  name: string;
  selected: boolean;
}

interface CopyTarget {
  tenant: Tenant;
  /** Instance whose Werkbibliothek is used (differs when Werk-Synchronisierung is on). */
  libraryId: number;
  libraryName?: string;
}

interface FieldOption {
  key: string;
  label: string;
  value: string;
  checked: boolean;
  /** Current value in the existing target Werk, shown when copying into it. */
  currentValue?: string;
  apply: (patch: Partial<Song>) => void;
}

interface FileOption {
  file: OrgSongFile;
  checked: boolean;
  instrumentId: number | null;
  existsInTarget: boolean;
}

@Component({
  selector: 'app-org-songs',
  templateUrl: './org-songs.page.html',
  styleUrls: ['./org-songs.page.scss'],
  standalone: false,
})
export class OrgSongsPage implements OnInit {
  public readonly isAdmin: boolean;
  public query = '';
  public results: OrgSongResult[] = [];
  public total = 0;
  public isLoading = false;
  public hasSearched = false;
  public onlyWithFiles = false;
  public tenantChips: TenantChip[] = [];
  private ownLibraryNames = new Set<string>();
  private orgTenants: Tenant[] = [];
  private searchRun = 0;

  // Copy dialog
  public isCopyOpen = false;
  public selected: OrgSongResult | null = null;
  public targets: CopyTarget[] = [];
  public targetLibraryId: number | null = null;
  public isLoadingTarget = false;
  public targetSongs: Song[] = [];
  public targetGroups: Group[] = [];
  public duplicates: Song[] = [];
  public mode: 'existing' | 'new' = 'new';
  public existingSongId: number | null = null;
  public number: number | null = null;
  public prefix = '';
  public fieldOptions: FieldOption[] = [];
  public fileOptions: FileOption[] = [];
  public isCopying = false;

  constructor(
    public db: DbService,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private loadingController: LoadingController,
  ) {
    const role = this.db.tenantUser()?.role;
    this.isAdmin = role === Role.ADMIN || role === Role.RESPONSIBLE;
  }

  async ngOnInit(): Promise<void> {
    this.query = this.route.snapshot.queryParamMap.get('q') ?? '';
    if (!this.isAdmin || !this.db.organisation()) { return; }

    try {
      this.orgTenants = await this.db.getTenantsFromOrganisation();
    } catch {
      this.orgTenants = [];
    }
    const ownLibrary = this.libraryIdOf(this.db.tenant());
    this.tenantChips = this.orgTenants
      .filter(t => !t.song_source_tenant_id && t.id !== ownLibrary)
      .map(t => ({ id: t.id, name: t.shortName, selected: true }));
    this.targets = this.buildTargets();

    try {
      const ownSongs = await this.db.getSongs();
      this.ownLibraryNames = new Set((ownSongs ?? []).map(s => this.normName(s.name)));
    } catch { }

    await this.search();
  }

  // ===== Search =====

  onSearchInput(event: any): void {
    this.query = event?.detail?.value ?? '';
    void this.search();
  }

  toggleChip(chip: TenantChip): void {
    chip.selected = !chip.selected;
    if (!this.tenantChips.some(c => c.selected)) {
      this.tenantChips.forEach(c => c.selected = true);
    }
    void this.search();
  }

  toggleOnlyWithFiles(): void {
    this.onlyWithFiles = !this.onlyWithFiles;
    void this.search();
  }

  async search(): Promise<void> {
    const run = ++this.searchRun;
    this.isLoading = true;
    try {
      const rows = await this.fetchPage(0);
      if (run !== this.searchRun) { return; }
      this.results = rows;
      this.total = rows[0]?.total_count ?? 0;
    } catch (error) {
      if (run !== this.searchRun) { return; }
      this.results = [];
      this.total = 0;
      Utils.showToast(translate('orgSongs.searchFailed', { error: error.message }), 'danger');
    } finally {
      if (run === this.searchRun) {
        this.isLoading = false;
        this.hasSearched = true;
      }
    }
  }

  async loadMore(event: InfiniteScrollCustomEvent): Promise<void> {
    const run = this.searchRun;
    try {
      const rows = await this.fetchPage(this.results.length);
      if (run === this.searchRun) { this.results = [...this.results, ...rows]; }
    } catch { }
    await event.target.complete();
  }

  private fetchPage(offset: number): Promise<OrgSongResult[]> {
    const selectedIds = this.tenantChips.filter(c => c.selected).map(c => c.id);
    const allSelected = selectedIds.length === this.tenantChips.length;
    return this.db.songSvc.searchOrgSongs(this.db.tenant().id, this.query.trim(), {
      tenantIds: allSelected ? null : selectedIds,
      onlyWithFiles: this.onlyWithFiles,
      limit: PAGE_SIZE,
      offset,
    });
  }

  get canLoadMore(): boolean {
    return this.results.length < this.total;
  }

  songLabel(song: { prefix?: string | null; number?: number | null; name: string }): string {
    const number = song.number ? `${song.prefix ?? ''}${song.number} ` : '';
    return `${number}${song.name}`;
  }

  existsInOwnLibrary(song: OrgSongResult): boolean {
    return this.ownLibraryNames.has(this.normName(song.name));
  }

  // ===== Copy dialog =====

  async openCopy(song: OrgSongResult): Promise<void> {
    this.selected = song;
    const targets = this.availableTargets;
    if (!targets.length) {
      Utils.showToast(translate('orgSongs.noTargets'), 'warning');
      return;
    }
    this.isCopyOpen = true;
    const keep = targets.some(t => t.libraryId === this.targetLibraryId);
    this.targetLibraryId = keep ? this.targetLibraryId : targets[0].libraryId;
    await this.loadTarget();
  }

  closeCopy(): void {
    this.isCopyOpen = false;
  }

  /** Targets for the selected Werk: never its own library. */
  get availableTargets(): CopyTarget[] {
    return this.targets.filter(t => t.libraryId !== this.selected?.tenant_id);
  }

  get currentTarget(): CopyTarget | undefined {
    return this.targets.find(t => t.libraryId === this.targetLibraryId);
  }

  async onTargetChange(): Promise<void> {
    await this.loadTarget();
  }

  private async loadTarget(): Promise<void> {
    if (!this.selected || !this.targetLibraryId) { return; }
    const libraryId = this.targetLibraryId;
    this.isLoadingTarget = true;
    try {
      const [songs, groups] = await Promise.all([
        this.db.songSvc.getSongs(libraryId),
        this.db.getGroups(libraryId),
      ]);
      if (libraryId !== this.targetLibraryId) { return; }
      this.targetSongs = songs ?? [];
      this.targetGroups = groups ?? [];
    } catch (error) {
      this.targetSongs = [];
      this.targetGroups = [];
      Utils.showToast(translate('orgSongs.targetLoadFailed', { error: error.message }), 'danger');
    } finally {
      this.isLoadingTarget = false;
    }

    this.duplicates = findSongsWithSameName(this.selected.name, this.targetSongs);
    this.mode = this.duplicates.length ? 'existing' : 'new';
    this.existingSongId = this.duplicates[0]?.id ?? null;
    this.prefix = this.selected.prefix ?? '';
    this.number = this.selected.number ?? null;
    if (this.number !== null && this.numberTaken) {
      this.number = nextFreeSongNumber(this.prefix, this.targetSongs);
    }
    this.buildOptions();
  }

  onModeChange(): void {
    if (this.mode === 'existing' && !this.existingSongId) {
      this.existingSongId = this.duplicates[0]?.id ?? null;
    }
    this.buildOptions();
  }

  get existingSong(): Song | undefined {
    return this.mode === 'existing' ? this.targetSongs.find(s => s.id === this.existingSongId) : undefined;
  }

  get numberTaken(): boolean {
    return isSongNumberTaken(this.number, this.prefix, this.targetSongs);
  }

  get nextFreeNumber(): number {
    return nextFreeSongNumber(this.prefix, this.targetSongs);
  }

  useNextFreeNumber(): void {
    this.number = this.nextFreeNumber;
  }

  get selectedFileCount(): number {
    return this.fileOptions.filter(f => f.checked).length;
  }

  get canCopy(): boolean {
    if (!this.selected || !this.targetLibraryId || this.isCopying || this.isLoadingTarget) { return false; }
    if (this.mode === 'existing') {
      return !!this.existingSong && (this.selectedFileCount > 0 || this.fieldOptions.some(f => f.checked));
    }
    return this.number !== null && this.number !== undefined && !this.numberTaken;
  }

  private buildOptions(): void {
    const song = this.selected;
    if (!song) { return; }
    const existing = this.existingSong;
    const isEmpty = (value: any) => value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);
    const yesNo = (value: boolean) => translate(value ? 'common.yes' : 'common.no');
    const options: FieldOption[] = [];
    const add = (key: string, label: string, value: string, current: any, currentLabel: string | undefined, apply: FieldOption['apply']) => {
      options.push({
        key,
        label,
        value,
        currentValue: existing && !isEmpty(current) ? currentLabel : undefined,
        checked: existing ? isEmpty(current) : true,
        apply,
      });
    };

    if (song.link) {
      add('link', translate('songs.link'), song.link, existing?.link, existing?.link, p => p.link = song.link);
    }
    if (song.difficulty) {
      add('difficulty', translate('orgSongs.fieldDifficulty'), this.difficultyLabel(song.difficulty),
        existing?.difficulty, this.difficultyLabel(existing?.difficulty), p => p.difficulty = song.difficulty);
    }
    if (song.withChoir || song.withSolo) {
      const label = [song.withChoir ? translate('orgSongs.withChoir') : '', song.withSolo ? translate('orgSongs.withSolo') : '']
        .filter(Boolean).join(', ');
      options.push({
        key: 'choirSolo',
        label: translate('orgSongs.fieldChoirSolo'),
        value: label,
        checked: true,
        apply: p => {
          if (song.withChoir) { p.withChoir = true; }
          if (song.withSolo) { p.withSolo = true; }
        },
      });
    }
    if (song.category_names?.length) {
      options.push({
        key: 'categories',
        label: translate('orgSongs.fieldCategories'),
        value: song.category_names.join(', '),
        checked: existing ? !existing.category_ids?.length : true,
        apply: () => { /* resolved in copy() because categories may need to be created */ },
      });
    }
    for (const mapped of mapExtraFields(song.additional_fields, song.field_defs, this.targetFieldDefs)) {
      const current = existing?.additional_fields?.[mapped.targetField.id];
      add(`extra:${mapped.targetField.id}`, mapped.targetField.name, this.extraValueLabel(mapped.value), current,
        this.extraValueLabel(current), p => {
          p.additional_fields = { ...(p.additional_fields ?? {}), [mapped.targetField.id]: mapped.value };
        });
    }
    if (song.beamer_file) {
      add('beamer', translate('orgSongs.fieldBeamer'), song.beamer_file.name, existing?.beamer_file,
        existing?.beamer_file?.name, p => p.beamer_file = song.beamer_file);
    }
    this.fieldOptions = options;

    const existingNames = new Set((existing?.files ?? []).map(f => f.fileName.toLowerCase()));
    this.fileOptions = (song.files ?? []).map(file => {
      const existsInTarget = existingNames.has(file.fileName.toLowerCase());
      return {
        file,
        existsInTarget,
        checked: !existsInTarget,
        instrumentId: mapGroupByName(file.instrumentId, file.groupName, file.groupSynonyms, this.targetGroups),
      };
    });
  }

  /** Song extra field definitions of the target library. */
  private get targetFieldDefs(): ExtraField[] {
    const library = [this.db.tenant(), ...this.orgTenants].find(t => t.id === this.targetLibraryId);
    return library?.song_additional_fields ?? this.currentTarget?.tenant.song_additional_fields ?? [];
  }

  sourceGroupLabel(file: OrgSongFile): string {
    if (file.instrumentId === 1) { return translate('songs.recording'); }
    if (file.instrumentId === 2) { return translate('songs.lyrics'); }
    return file.groupName ?? file.note ?? translate('songs.other');
  }

  setAllFiles(checked: boolean): void {
    this.fileOptions.forEach(f => f.checked = checked);
  }

  async copy(): Promise<void> {
    const song = this.selected;
    const target = this.currentTarget;
    if (!song || !target || !this.canCopy) { return; }

    if (this.mode === 'existing') {
      const overwrites = this.fieldOptions.filter(f => f.checked && f.currentValue !== undefined);
      if (overwrites.length) {
        const confirmed = await this.confirm(
          translate('orgSongs.overwriteHeader'),
          translate('orgSongs.overwriteMessage', { fields: overwrites.map(f => f.label).join(', ') }),
        );
        if (!confirmed) { return; }
      }
    }

    this.isCopying = true;
    const loading = await this.loadingController.create({ message: translate('songs.copying'), duration: 9999999 });
    await loading.present();
    try {
      const fields: Partial<Song> = {};
      for (const option of this.fieldOptions.filter(f => f.checked)) {
        option.apply(fields);
      }
      if (this.fieldOptions.some(f => f.key === 'categories' && f.checked)) {
        const ids = await this.db.songSvc.ensureSongCategories(target.libraryId, song.category_names);
        const current = this.existingSong?.category_ids ?? [];
        fields.category_ids = Array.from(new Set([...current, ...ids]));
      }
      if (this.mode === 'new') {
        fields.number = this.number;
        fields.prefix = this.prefix.trim() || null;
      }

      const mainGroupId = this.targetGroups.find(g => g.maingroup)?.id;
      await this.db.songSvc.copyOrgSong({
        source: song,
        targetLibraryId: target.libraryId,
        existingSongId: this.mode === 'existing' ? this.existingSongId : null,
        fields,
        files: this.fileOptions.filter(f => f.checked).map(f => ({ file: f.file, instrumentId: f.instrumentId })),
        mainGroupId,
        onProgress: (current, total) => loading.message = translate('songs.copyingFile', { current, total }),
      });

      if (target.libraryId === this.libraryIdOf(this.db.tenant())) {
        this.ownLibraryNames.add(this.normName(song.name));
        void this.db.getSongs();
      }
      this.isCopyOpen = false;
      Utils.showToast(translate(this.mode === 'existing' ? 'orgSongs.mergedInto' : 'orgSongs.copiedTo', {
        name: song.name,
        tenant: target.libraryName ?? target.tenant.shortName,
      }), 'success');
    } catch (error) {
      Utils.showToast(translate('songs.copyFailed', { error: error.message }), 'danger');
    } finally {
      this.isCopying = false;
      await loading.dismiss();
    }
  }

  // ===== Helpers =====

  private buildTargets(): CopyTarget[] {
    const all = [this.db.tenant(), ...this.orgTenants];
    const seen = new Set<number>();
    const targets: CopyTarget[] = [];
    for (const tenant of all) {
      const role = this.db.tenantUsers()?.find(u => u.tenantId === tenant.id)?.role;
      if (role !== Role.ADMIN && role !== Role.RESPONSIBLE) { continue; }
      const libraryId = this.libraryIdOf(tenant);
      if (seen.has(libraryId)) { continue; }
      seen.add(libraryId);
      const library = libraryId !== tenant.id ? all.find(t => t.id === libraryId) : undefined;
      targets.push({ tenant, libraryId, libraryName: library?.shortName });
    }
    return targets;
  }

  private libraryIdOf(tenant: Tenant): number {
    return tenant.song_source_tenant_id ?? tenant.id;
  }

  private normName(name: string): string {
    return (name ?? '').normalize().trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private difficultyLabel(difficulty: number | null | undefined): string {
    switch (difficulty) {
      case 1: return translate('songs.easy');
      case 2: return translate('songs.medium');
      case 3: return translate('songs.hard');
      default: return '';
    }
  }

  private extraValueLabel(value: any): string {
    if (value === true) { return translate('common.yes'); }
    if (value === false) { return translate('common.no'); }
    return value === null || value === undefined ? '' : String(value);
  }

  private async confirm(header: string, message: string): Promise<boolean> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        { text: translate('orgSongs.overwriteConfirm'), role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }
}
