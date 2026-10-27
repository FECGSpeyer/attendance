import { currentIntlLocale } from '../../i18n/languages';
import { Component, DestroyRef, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonPopover, NavController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { AudioPlayerService, AudioQueueItem } from 'src/app/services/audio-player/audio-player.service';
import { FilesService, StorageEntry } from '../../services/files/files.service';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';
import { currentLanguage } from '../../i18n/languages';

@Component({
  selector: 'app-files',
  templateUrl: './files.page.html',
  styleUrls: ['./files.page.scss'],
  standalone: false
})
export class FilesPage implements OnInit {
  private audioPlayer = inject(AudioPlayerService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  public entries: StorageEntry[] = [];
  public searchTerm = '';
  public currentPath = '';
  public isLoading = false;
  public imagePreviewUrls: Record<string, string> = {};
  public isImagePreviewOpen = false;
  public selectedImageUrl = '';
  public selectedImageName = '';
  public sortBy: 'name' | 'updatedAt' | 'size' = 'name';
  public sortDirection: 'asc' | 'desc' = 'asc';
  public canEditEntries = false;
  public usedBytes: number | null = null;

  constructor(
    public db: DbService,
    private filesSvc: FilesService,
    private navCtrl: NavController,
    private alertController: AlertController,
  ) {}

  async ngOnInit(): Promise<void> {
    this.canEditEntries = this.db.canEditFiles();

    if (!this.db.canAccessFiles()) {
      Utils.showToast(translate('files.noAccess'), 'danger');
      this.navCtrl.back();
      return;
    }

    // Direktlinks (siehe OpenFilePage) übergeben ?path=<ordner>&open=<datei>.
    // Abonniert statt Snapshot, da die Seite beim erneuten Öffnen eines Links
    // wiederverwendet wird.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.applyLinkParams(params.get('path'), params.get('open')));
  }

  private async applyLinkParams(path: string | null, openName: string | null): Promise<void> {
    this.currentPath = (path || '').split('/').filter(Boolean).join('/');
    this.searchTerm = '';
    await this.loadEntries();

    if (!openName) {
      return;
    }

    const entry = this.entries.find((e) => !e.isFolder && e.name === openName);
    if (!entry) {
      Utils.showToast(translate('files.linkedNotFound'), 'warning');
      return;
    }

    await this.openFolder(entry);
  }

  async shareEntry(entry?: StorageEntry): Promise<void> {
    const path = entry ? entry.path : this.currentPath;
    const isFolder = entry ? entry.isFolder : true;
    const url = this.filesSvc.getShareLink(this.db.tenant().id, path, isFolder);
    const title = entry?.name || this.pathSegments[this.pathSegments.length - 1] || translate('files.title');

    try {
      if (navigator.share) {
        await navigator.share({ url, title });
        return;
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      Utils.showToast(translate('files.linkCopied'), 'success');
    } catch {
      Utils.showToast(translate('files.linkToast', { url }), 'medium');
    }
  }

  get pathSegments(): string[] {
    if (!this.currentPath) {
      return [];
    }

    return this.currentPath.split('/').filter(Boolean);
  }

  async handleRefresh(event: any): Promise<void> {
    await this.loadEntries();
    event.target.complete();
  }

  async loadEntries(): Promise<void> {
    this.isLoading = true;

    try {
      const loadedEntries = await this.filesSvc.listEntries(this.db.tenant().id, this.currentPath);
      this.entries = this.sortEntries(loadedEntries);
      await this.loadImagePreviews();
      if (this.canEditEntries) {
        void this.loadUsage();
      }
    } catch (error: any) {
      Utils.showToast(translate('files.loadFailed', { error: error.message || error }), 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  get hasSearchTerm(): boolean {
    return !!this.searchTerm.trim();
  }

  get filteredEntries(): StorageEntry[] {
    if (!this.hasSearchTerm) {
      return this.entries;
    }

    const filters = this.parseSearchFilters(this.searchTerm);

    return this.entries.filter((entry) => this.matchesSearch(entry, filters));
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  async openFolder(entry: StorageEntry): Promise<void> {
    if (!entry.isFolder) {
      if (this.isImageEntry(entry)) {
        await this.openImagePreview(entry);
        return;
      }
      if (this.isAudioEntry(entry)) {
        await this.playAudioEntry(entry);
        return;
      }
      await this.downloadEntry(entry);
      return;
    }

    this.currentPath = entry.path;
    await this.loadEntries();
  }

  async openRoot(): Promise<void> {
    this.currentPath = '';
    await this.loadEntries();
  }

  async openSegment(index: number): Promise<void> {
    this.currentPath = this.pathSegments.slice(0, index + 1).join('/');
    await this.loadEntries();
  }

  triggerUpload(): void {
    if (!this.canEditEntries) {
      Utils.showToast(translate('files.noEditRights'), 'warning');
      return;
    }

    this.fileInput?.nativeElement.click();
  }

  /** Speicherlimit der Instanz in Bytes, null = unbegrenzt. */
  get maxBytes(): number | null {
    return this.db.tenant()?.files_max_bytes ?? null;
  }

  /** Ab 80 % Belegung bieten wir an, mehr Speicher anzufragen. */
  get isStorageAlmostFull(): boolean {
    const maxBytes = this.maxBytes;
    return maxBytes !== null && this.usedBytes !== null && this.usedBytes >= maxBytes * 0.8;
  }

  get storageStatusLabel(): string {
    if (!this.isStorageAlmostFull) {
      return '';
    }
    return (this.usedBytes ?? 0) >= (this.maxBytes ?? 0) ? translate('files.full') : translate('files.almostFull');
  }

  // Schickt die Anfrage als Hilfe-Frage an den Attendix-Admin (wie "Feedback geben").
  async requestMoreStorage(): Promise<void> {
    const alert = await this.alertController.create({
      header: translate('files.requestMore'),
      message: translate('files.requestHint'),
      inputs: [{
        type: 'textarea',
        name: 'note',
        placeholder: translate('files.howMuch'),
      }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('files.send'),
          handler: async (data: { note?: string }) => {
            const tenant = this.db.tenant();
            const usage = this.maxBytes !== null
              ? `${this.formatFileSize(this.usedBytes ?? 0)} von ${this.formatFileSize(this.maxBytes)}`
              : this.formatFileSize(this.usedBytes ?? 0);
            const message = [
              'Anfrage: Mehr Speicher für die Dateiablage',
              `Instanz: ${tenant.longName} (ID ${tenant.id})`,
              `Belegt: ${usage}`,
              data?.note?.trim() ? `Nachricht: ${data.note.trim()}` : '',
            ].filter(Boolean).join('\n');

            try {
              await this.db.sendQuestion(message, '');
              Utils.showToast(translate('files.requestSent'), 'success');
            } catch (error: any) {
              Utils.showToast(translate('files.requestFailed', { error: error?.message || error }), 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async loadUsage(): Promise<void> {
    try {
      this.usedBytes = await this.filesSvc.getUsedBytes(this.db.tenant().id);
    } catch {
      this.usedBytes = null;
    }
  }

  formatFileSize(size?: number): string {
    if (size === undefined || size === null || size < 0) {
      return '';
    }

    if (size < 1024) {
      return `${size} B`;
    }

    const kb = size / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    const mb = kb / 1024;
    if (mb < 1024) {
      return `${mb.toFixed(1)} MB`;
    }

    return `${(mb / 1024).toFixed(1)} GB`;
  }

  formatUpdatedAt(updatedAt?: string): string {
    if (!updatedAt) {
      return '';
    }

    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat(currentIntlLocale(), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private normalizeSearchValue(value: string): string {
    return (value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'ae')
      .replace(/Ö/g, 'oe')
      .replace(/Ü/g, 'ue')
      .toLowerCase()
      .trim();
  }

  private compactSearchValue(value: string): string {
    return this.normalizeSearchValue(value).replace(/[^a-z0-9]/g, '');
  }

  private parseSearchFilters(rawSearch: string): { text: string; type: string; date: string } {
    const parts = (rawSearch || '').split(/\s+/).filter(Boolean);
    const textParts: string[] = [];
    let type = '';
    let date = '';

    for (const part of parts) {
      const normalizedPart = this.normalizeSearchValue(part);

      if (normalizedPart.startsWith('typ:') || normalizedPart.startsWith('type:')) {
        type = normalizedPart.split(':').slice(1).join(':').trim();
        continue;
      }

      if (normalizedPart.startsWith('datum:') || normalizedPart.startsWith('date:')) {
        date = normalizedPart.split(':').slice(1).join(':').trim();
        continue;
      }

      textParts.push(part);
    }

    return {
      text: this.normalizeSearchValue(textParts.join(' ')),
      type,
      date,
    };
  }

  private getEntryExtension(entry: StorageEntry): string {
    if (entry.isFolder) {
      return '';
    }

    const lastDotIndex = (entry.name || '').lastIndexOf('.');
    if (lastDotIndex <= 0) {
      return '';
    }

    return (entry.name || '').slice(lastDotIndex + 1);
  }

  private matchesTypeFilter(entry: StorageEntry, typeFilter: string): boolean {
    if (!typeFilter) {
      return true;
    }

    const normalizedType = this.normalizeSearchValue(typeFilter);
    if (['ordner', 'folder', 'dir', 'verzeichnis'].includes(normalizedType)) {
      return entry.isFolder;
    }

    if (['datei', 'file'].includes(normalizedType)) {
      return !entry.isFolder;
    }

    const extension = this.normalizeSearchValue(this.getEntryExtension(entry));
    if (!extension) {
      return false;
    }

    return extension === normalizedType || extension.includes(normalizedType);
  }

  private matchesDateFilter(entry: StorageEntry, dateFilter: string): boolean {
    if (!dateFilter) {
      return true;
    }

    if (!entry.updatedAt) {
      return false;
    }

    const date = new Date(entry.updatedAt);
    if (Number.isNaN(date.getTime())) {
      return false;
    }

    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    const dateCandidates = [
      this.formatUpdatedAt(entry.updatedAt),
      `${day}.${month}.${year}`,
      `${day}.${month}.${year} ${hour}:${minute}`,
      `${year}-${month}-${day}`,
      `${year}-${month}`,
      `${month}.${year}`,
      entry.updatedAt,
    ];

    const normalizedFilter = this.normalizeSearchValue(dateFilter);
    const compactFilter = this.compactSearchValue(dateFilter);

    return dateCandidates.some((candidate) => {
      const normalizedCandidate = this.normalizeSearchValue(candidate);
      if (normalizedCandidate.includes(normalizedFilter)) {
        return true;
      }

      return this.compactSearchValue(candidate).includes(compactFilter);
    });
  }

  private matchesSearch(entry: StorageEntry, filters: { text: string; type: string; date: string }): boolean {
    const extension = this.getEntryExtension(entry);
    const kindLabel = entry.isFolder ? 'ordner folder verzeichnis dir' : 'datei file';
    const dateLabel = entry.updatedAt ? this.formatUpdatedAt(entry.updatedAt) : '';

    const searchableText = this.normalizeSearchValue([
      entry.name,
      extension,
      kindLabel,
      dateLabel,
      entry.updatedAt || '',
    ].filter(Boolean).join(' '));

    const matchesText = !filters.text || searchableText.includes(filters.text);
    return matchesText && this.matchesTypeFilter(entry, filters.type) && this.matchesDateFilter(entry, filters.date);
  }

  private getUploadProgressMessage(processed: number, total: number, fileName?: string): string {
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
    if (fileName) {
      return `${translate('files.uploadProgress', { done: processed, total, percent })}\n${fileName}`;
    }

    return translate('files.uploadProgress', { done: processed, total, percent });
  }

  private updateLoadingMessage(loading: HTMLIonLoadingElement, message: string): void {
    loading.message = message;
  }

  get sortLabel(): string {
    if (this.sortBy === 'updatedAt') {
      return translate('files.sortDate', { dir: translate(this.sortDirection === 'asc' ? 'files.ascending' : 'files.descending') });
    }

    if (this.sortBy === 'size') {
      return translate('files.sortSize', { dir: translate(this.sortDirection === 'asc' ? 'files.ascending' : 'files.descending') });
    }

    return translate('files.sortName', { dir: this.sortDirection === 'asc' ? 'A-Z' : 'Z-A' });
  }

  private sortEntries(entries: StorageEntry[]): StorageEntry[] {
    const directionFactor = this.sortDirection === 'asc' ? 1 : -1;

    return [...entries].sort((left, right) => {
      if (left.isFolder !== right.isFolder) {
        return left.isFolder ? -1 : 1;
      }

      let comparison = 0;

      if (this.sortBy === 'updatedAt') {
        const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
        const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
        comparison = leftTime - rightTime;
      } else if (this.sortBy === 'size') {
        const leftSize = left.size ?? 0;
        const rightSize = right.size ?? 0;
        comparison = leftSize - rightSize;
      } else {
        comparison = left.name.localeCompare(right.name, currentLanguage(), { sensitivity: 'base' });
      }

      if (comparison === 0) {
        comparison = left.name.localeCompare(right.name, currentLanguage(), { sensitivity: 'base' });
      }

      return comparison * directionFactor;
    });
  }

  async setSort(by: 'name' | 'updatedAt' | 'size', popover: IonPopover): Promise<void> {
    this.sortBy = by;
    this.entries = this.sortEntries(this.entries);
    await popover.dismiss();
  }

  async toggleSortDirection(popover: IonPopover): Promise<void> {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.entries = this.sortEntries(this.entries);
    await popover.dismiss();
  }

  isImageEntry(entry: StorageEntry): boolean {
    if (entry.isFolder) {
      return false;
    }

    const lowerName = (entry.name || '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/.test(lowerName);
  }

  isAudioEntry(entry: StorageEntry): boolean {
    if (entry.isFolder) {
      return false;
    }

    return AudioPlayerService.isAudioFile({ fileName: entry.name });
  }

  async playAudioEntry(entry: StorageEntry): Promise<void> {
    const tenantId = this.db.tenant().id;
    const audioEntries = this.filteredEntries.filter((e) => this.isAudioEntry(e));
    const startIndex = Math.max(audioEntries.findIndex((e) => e.path === entry.path), 0);
    const queue: AudioQueueItem[] = (audioEntries.length ? audioEntries : [entry]).map((e) => ({
      fileName: e.name,
      title: e.name,
      resolveUrl: () => this.filesSvc.getSignedFileUrl(tenantId, e.path, 3600),
    }));

    try {
      await this.audioPlayer.playQueue(queue, startIndex);
    } catch (error: any) {
      Utils.showToast(translate('files.playFailed', { error: error.message || error }), 'danger');
    }
  }

  getImagePreviewUrl(entry: StorageEntry): string {
    return this.imagePreviewUrls[entry.path] || '';
  }

  private async loadImagePreviews(): Promise<void> {
    this.imagePreviewUrls = {};

    const imageEntries = this.entries.filter((entry) => this.isImageEntry(entry));
    if (!imageEntries.length) {
      return;
    }

    const results = await Promise.all(
      imageEntries.map(async (entry) => {
        try {
          const url = await this.filesSvc.getSignedFileUrl(this.db.tenant().id, entry.path, 3600);
          return { path: entry.path, url };
        } catch {
          return { path: entry.path, url: '' };
        }
      })
    );

    for (const result of results) {
      if (result.url) {
        this.imagePreviewUrls[result.path] = result.url;
      }
    }
  }

  async openImagePreview(entry: StorageEntry): Promise<void> {
    this.selectedImageName = entry.name;
    let url = this.getImagePreviewUrl(entry);

    if (!url) {
      try {
        url = await this.filesSvc.getSignedFileUrl(this.db.tenant().id, entry.path, 3600);
        this.imagePreviewUrls[entry.path] = url;
      } catch (error: any) {
        Utils.showToast(translate('files.previewFailed', { error: error.message || error }), 'danger');
        return;
      }
    }

    this.selectedImageUrl = url;
    this.isImagePreviewOpen = true;
  }

  closeImagePreview(): void {
    this.isImagePreviewOpen = false;
    this.selectedImageUrl = '';
    this.selectedImageName = '';
  }


  private async askDuplicateHandling(duplicateNames: string[]): Promise<'overwrite' | 'skip' | 'cancel'> {
    const previewNames = duplicateNames.slice(0, 5).join(', ');
    const hasMore = duplicateNames.length > 5;
    const suffix = hasMore ? translate('files.andMore', { count: duplicateNames.length - 5 }) : '';

    const alert = await this.alertController.create({
      header: translate('files.exists'),
      message: translate('files.existsMessage', { names: previewNames + suffix }),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
        },
        {
          text: translate('files.skip'),
          role: 'skip',
        },
        {
          text: translate('files.overwrite'),
          role: 'overwrite',
        }
      ]
    });

    await alert.present();
    const result = await alert.onDidDismiss();

    if (result.role === 'overwrite') {
      return 'overwrite';
    }

    if (result.role === 'skip') {
      return 'skip';
    }

    return 'cancel';
  }

  // Prüft das Speicherlimit der Instanz vor dem Upload. Die Storage-Policy blockt erst,
  // wenn das Limit schon erreicht ist, daher rechnet die App die neuen Dateien vorab mit ein.
  private async hasEnoughSpace(files: File[], fileNameMap: Map<File, string>, duplicateNames: Set<string>, overwrite: boolean): Promise<boolean> {
    const maxBytes = this.maxBytes;
    if (maxBytes === null) {
      return true;
    }

    await this.loadUsage();
    const sizeByName = new Map(this.entries.filter((e) => !e.isFolder).map((e) => [e.name, e.size || 0]));
    let neededBytes = 0;
    for (const file of files) {
      const name = fileNameMap.get(file) || '';
      if (duplicateNames.has(name)) {
        if (!overwrite) {
          continue;
        }
        // Überschreiben ersetzt die alte Datei, nur der Zuwachs zählt.
        neededBytes += Math.max(0, file.size - (sizeByName.get(name) || 0));
      } else {
        neededBytes += file.size;
      }
    }

    const freeBytes = Math.max(0, maxBytes - (this.usedBytes || 0));
    if (neededBytes <= freeBytes) {
      return true;
    }

    const alert = await this.alertController.create({
      header: translate('files.storageFull'),
      message: translate('files.storageFullMessage', { needed: this.formatFileSize(neededBytes), free: this.formatFileSize(freeBytes), max: this.formatFileSize(maxBytes) }),
      buttons: [
        { text: 'OK', role: 'cancel' },
        { text: translate('files.requestMore'), handler: () => { void this.requestMoreStorage(); } },
      ],
    });
    await alert.present();
    return false;
  }

  async onFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    if (!this.canEditEntries) {
      input.value = '';
      return;
    }

    if (!files.length) {
      return;
    }

    let loading: HTMLIonLoadingElement | undefined;

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    try {
      const existingNames = new Set(this.entries.filter((entry) => !entry.isFolder).map((entry) => entry.name));
      const fileNameMap = new Map<File, string>();

      for (const file of files) {
        fileNameMap.set(file, this.filesSvc.getUploadFileName(file.name));
      }

      const duplicateNames = Array.from(
        new Set(
          files
            .map((file) => fileNameMap.get(file) || '')
            .filter((name) => name && existingNames.has(name))
        )
      );

      const duplicateNameSet = new Set(duplicateNames);
      let overwriteDuplicates = false;

      if (duplicateNames.length) {
        const handling = await this.askDuplicateHandling(duplicateNames);
        if (handling === 'cancel') {
          input.value = '';
          return;
        }

        overwriteDuplicates = handling === 'overwrite';
      }

      if (!(await this.hasEnoughSpace(files, fileNameMap, duplicateNameSet, overwriteDuplicates))) {
        input.value = '';
        return;
      }

      loading = await Utils.getLoadingElement(999999, this.getUploadProgressMessage(0, files.length));
      await loading.present();

      let processedCount = 0;

      for (const file of files) {
        const uploadName = fileNameMap.get(file) || '';
        const isDuplicate = duplicateNameSet.has(uploadName);

        this.updateLoadingMessage(loading, this.getUploadProgressMessage(processedCount, files.length, uploadName));

        if (isDuplicate && !overwriteDuplicates) {
          skippedCount++;
          processedCount++;
          this.updateLoadingMessage(loading, this.getUploadProgressMessage(processedCount, files.length));
          continue;
        }

        try {
          await this.filesSvc.uploadFile(this.db.tenant().id, this.currentPath, file, isDuplicate && overwriteDuplicates);
          successCount++;
        } catch {
          failedCount++;
        }

        processedCount++;
        this.updateLoadingMessage(loading, this.getUploadProgressMessage(processedCount, files.length));
      }

      if (successCount > 0 && failedCount === 0 && skippedCount === 0) {
        Utils.showToast(successCount === 1 ? translate('files.uploadedOne') : translate('files.uploadedMany', { count: successCount }), 'success');
      } else if (successCount > 0 || failedCount > 0 || skippedCount > 0) {
        Utils.showToast(translate('files.uploadSummary', { ok: successCount, skipped: skippedCount, failed: failedCount }), 'warning');
      } else {
        Utils.showToast(translate('files.noneUploaded'), 'medium');
      }

      await this.loadEntries();
    } finally {
      await loading?.dismiss();
      input.value = '';
    }
  }

  async createFolder(): Promise<void> {
    if (!this.canEditEntries) {
      Utils.showToast(translate('files.noEditRights'), 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: translate('files.createFolder'),
      inputs: [{
        type: 'text',
        name: 'name',
        placeholder: translate('files.folderName')
      }],
      buttons: [{
        text: translate('common.cancel'),
        role: 'cancel'
      }, {
        text: translate('files.create'),
        handler: async (data: { name: string }) => {
          if (!data?.name?.trim()) {
            return false;
          }

          try {
            await this.filesSvc.createFolder(this.db.tenant().id, this.currentPath, data.name);
            Utils.showToast(translate('files.folderCreated'), 'success');
            await this.loadEntries();
          } catch (error: any) {
            Utils.showToast(translate('files.folderFailed', { error: error.message || error }), 'danger');
          }
        }
      }]
    });

    await alert.present();
  }

  async downloadEntry(entry: StorageEntry): Promise<void> {
    if (entry.isFolder) {
      return;
    }

    const loading = await Utils.getLoadingElement(999999);
    await loading.present();

    try {
      const { blob, fileName } = await this.filesSvc.downloadFile(this.db.tenant().id, entry.path);
      await Utils.downloadFileNative(blob, fileName);
    } catch (error: any) {
      Utils.showToast(translate('files.downloadFailed', { error: error.message || error }), 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async sendEntryPerTelegram(entry: StorageEntry): Promise<void> {
    if (entry.isFolder) {
      return;
    }

    if (!this.db.tenantUser()?.telegram_chat_id) {
      Utils.showToast(translate('files.connectTelegram'), 'warning');
      return;
    }

    const loading = await Utils.getLoadingElement(999999, translate('files.sendingTelegram'));
    await loading.present();

    try {
      const url = await this.filesSvc.getSignedFileUrl(this.db.tenant().id, entry.path, 600);
      await this.db.sendSongPerTelegram(url);
    } catch (error: any) {
      Utils.showToast(translate('files.telegramFailed', { error: error.message || error }), 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async handleEntryAction(action: 'open' | 'download' | 'share' | 'telegram' | 'rename' | 'move' | 'delete', entry: StorageEntry, popover: IonPopover): Promise<void> {
    await popover.dismiss();

    if (['rename', 'move', 'delete'].includes(action) && !this.canEditEntries) {
      Utils.showToast(translate('files.noEditRights'), 'warning');
      return;
    }

    switch (action) {
      case 'open':
        await this.openFolder(entry);
        return;
      case 'download':
        await this.downloadEntry(entry);
        return;
      case 'share':
        await this.shareEntry(entry);
        return;
      case 'telegram':
        await this.sendEntryPerTelegram(entry);
        return;
      case 'rename':
        await this.renameEntry(entry);
        return;
      case 'move':
        await this.moveEntry(entry);
        return;
      case 'delete':
        await this.deleteEntry(entry);
        return;
      default:
        return;
    }
  }

  async deleteEntry(entry: StorageEntry): Promise<void> {
    if (!this.canEditEntries) {
      Utils.showToast(translate('files.noDeleteRights'), 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: entry.isFolder ? translate('files.deleteFolder') : translate('files.deleteFile'),
      message: translate('files.deleteMessage', { name: entry.name }),
      buttons: [{
        text: translate('common.cancel'),
        role: 'cancel'
      }, {
        text: translate('common.delete'),
        role: 'destructive',
        handler: async () => {
          const loading = await Utils.getLoadingElement(999999);
          await loading.present();

          try {
            await this.filesSvc.deleteEntry(this.db.tenant().id, entry.path, entry.isFolder);
            Utils.showToast(translate('files.deleted'), 'success');
            await this.loadEntries();
          } catch (error: any) {
            Utils.showToast(translate('files.deleteFailed', { error: error.message || error }), 'danger');
          } finally {
            await loading.dismiss();
          }
        }
      }]
    });

    await alert.present();
  }

  async renameEntry(entry: StorageEntry): Promise<void> {
    if (!this.canEditEntries) {
      Utils.showToast(translate('files.noEditRights'), 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: entry.isFolder ? translate('files.renameFolder') : translate('files.renameFile'),
      inputs: [{
        type: 'text',
        name: 'name',
        value: entry.name,
        placeholder: translate('files.newName')
      }],
      buttons: [{
        text: translate('common.cancel'),
        role: 'cancel'
      }, {
        text: translate('common.save'),
        handler: async (data: { name: string }) => {
          if (!data?.name?.trim()) {
            return false;
          }

          const loading = await Utils.getLoadingElement(999999);
          await loading.present();

          try {
            await this.filesSvc.renameEntry(this.db.tenant().id, entry.path, data.name, entry.isFolder);
            Utils.showToast(translate('files.renamed'), 'success');
            await this.loadEntries();
          } catch (error: any) {
            Utils.showToast(translate('files.renameFailed', { error: error.message || error }), 'danger');
          } finally {
            await loading.dismiss();
          }
        }
      }]
    });

    await alert.present();
  }

  async moveEntry(entry: StorageEntry): Promise<void> {
    if (!this.canEditEntries) {
      Utils.showToast(translate('files.noEditRights'), 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: translate('files.move'),
      message: translate('files.moveHint'),
      inputs: [{
        type: 'text',
        name: 'target',
        placeholder: 'z. B. Dokumente/2026'
      }],
      buttons: [{
        text: translate('common.cancel'),
        role: 'cancel'
      }, {
        text: translate('files.move'),
        handler: async (data: { target: string }) => {
          const loading = await Utils.getLoadingElement(999999);
          await loading.present();

          try {
            await this.filesSvc.moveEntry(this.db.tenant().id, entry.path, data?.target || '', entry.isFolder);
            Utils.showToast(translate('files.moved'), 'success');
            await this.loadEntries();
          } catch (error: any) {
            Utils.showToast(translate('files.moveFailed', { error: error.message || error }), 'danger');
          } finally {
            await loading.dismiss();
          }
        }
      }]
    });

    await alert.present();
  }

  goBack(): void {
    this.navCtrl.navigateBack('/tabs/settings');
  }
}
