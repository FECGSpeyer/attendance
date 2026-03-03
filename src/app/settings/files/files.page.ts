import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { AlertController, IonPopover, NavController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { FilesService, StorageEntry } from '../../services/files/files.service';
import { Role } from 'src/app/utilities/constants';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-files',
  templateUrl: './files.page.html',
  styleUrls: ['./files.page.scss'],
  standalone: false
})
export class FilesPage implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  public entries: StorageEntry[] = [];
  public searchTerm: string = '';
  public currentPath: string = '';
  public isLoading: boolean = false;
  public imagePreviewUrls: Record<string, string> = {};
  public isImagePreviewOpen: boolean = false;
  public selectedImageUrl: string = '';
  public selectedImageName: string = '';
  public imageZoomScale: number = 1;
  public sortBy: 'name' | 'updatedAt' | 'size' = 'name';
  public sortDirection: 'asc' | 'desc' = 'asc';
  public canDeleteEntries: boolean = false;
  private pinchStartDistance: number = 0;
  private pinchStartScale: number = 1;
  private lastImageTapAt: number = 0;

  constructor(
    public db: DbService,
    private filesSvc: FilesService,
    private navCtrl: NavController,
    private alertController: AlertController,
  ) {}

  async ngOnInit(): Promise<void> {
    const role = this.db.tenantUser().role;
    const canAccess = this.db.isBeta() && [Role.ADMIN, Role.RESPONSIBLE, Role.HELPER, Role.VOICE_LEADER_HELPER].includes(role);
    this.canDeleteEntries = [Role.ADMIN, Role.RESPONSIBLE].includes(role);

    if (!canAccess) {
      Utils.showToast('Du hast keinen Zugriff auf Dateien.', 'danger');
      this.navCtrl.back();
      return;
    }

    await this.loadEntries();
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
    } catch (error: any) {
      Utils.showToast(`Fehler beim Laden der Dateien: ${error.message || error}`, 'danger');
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
    this.fileInput?.nativeElement.click();
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
    return `${mb.toFixed(1)} MB`;
  }

  formatUpdatedAt(updatedAt?: string): string {
    if (!updatedAt) {
      return '';
    }

    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('de-DE', {
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
      return `Upload ${processed}/${total} (${percent}%)\n${fileName}`;
    }

    return `Upload ${processed}/${total} (${percent}%)`;
  }

  private updateLoadingMessage(loading: HTMLIonLoadingElement, message: string): void {
    loading.message = message;
  }

  get sortLabel(): string {
    if (this.sortBy === 'updatedAt') {
      return `Datum (${this.sortDirection === 'asc' ? 'aufsteigend' : 'absteigend'})`;
    }

    if (this.sortBy === 'size') {
      return `Größe (${this.sortDirection === 'asc' ? 'aufsteigend' : 'absteigend'})`;
    }

    return `Name (${this.sortDirection === 'asc' ? 'A-Z' : 'Z-A'})`;
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
        comparison = left.name.localeCompare(right.name, 'de', { sensitivity: 'base' });
      }

      if (comparison === 0) {
        comparison = left.name.localeCompare(right.name, 'de', { sensitivity: 'base' });
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
        Utils.showToast(`Bildvorschau fehlgeschlagen: ${error.message || error}`, 'danger');
        return;
      }
    }

    this.selectedImageUrl = url;
    this.resetImageZoom();
    this.isImagePreviewOpen = true;
  }

  closeImagePreview(): void {
    this.isImagePreviewOpen = false;
    this.selectedImageUrl = '';
    this.selectedImageName = '';
    this.resetImageZoom();
  }

  private getTouchDistance(event: TouchEvent): number {
    if (event.touches.length < 2) {
      return 0;
    }

    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  private clampScale(value: number): number {
    return Math.min(4, Math.max(1, value));
  }

  resetImageZoom(): void {
    this.imageZoomScale = 1;
    this.pinchStartDistance = 0;
    this.pinchStartScale = 1;
    this.lastImageTapAt = 0;
  }

  onPreviewDblClick(): void {
    this.imageZoomScale = this.imageZoomScale > 1 ? 1 : 2;
  }

  onPreviewTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      this.pinchStartDistance = this.getTouchDistance(event);
      this.pinchStartScale = this.imageZoomScale;
      return;
    }

    if (event.touches.length === 1) {
      const now = Date.now();
      if (now - this.lastImageTapAt < 300) {
        this.imageZoomScale = this.imageZoomScale > 1 ? 1 : 2;
        this.lastImageTapAt = 0;
      } else {
        this.lastImageTapAt = now;
      }
    }
  }

  onPreviewTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 2 || !this.pinchStartDistance) {
      return;
    }

    event.preventDefault();
    const currentDistance = this.getTouchDistance(event);
    if (!currentDistance) {
      return;
    }

    const nextScale = this.pinchStartScale * (currentDistance / this.pinchStartDistance);
    this.imageZoomScale = this.clampScale(nextScale);
  }

  onPreviewTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this.pinchStartDistance = 0;
      this.pinchStartScale = this.imageZoomScale;
    }
  }

  private async askDuplicateHandling(duplicateNames: string[]): Promise<'overwrite' | 'skip' | 'cancel'> {
    const previewNames = duplicateNames.slice(0, 5).join(', ');
    const hasMore = duplicateNames.length > 5;
    const suffix = hasMore ? ` und ${duplicateNames.length - 5} weitere` : '';

    const alert = await this.alertController.create({
      header: 'Datei existiert bereits',
      message: `Folgende Datei(en) existieren bereits: ${previewNames}${suffix}. Möchtest du diese überschreiben?`,
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
        },
        {
          text: 'Überspringen',
          role: 'skip',
        },
        {
          text: 'Überschreiben',
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

  async onFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const files = Array.from(input.files || []);

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
        Utils.showToast(successCount === 1 ? 'Datei wurde hochgeladen.' : `${successCount} Dateien wurden hochgeladen.`, 'success');
      } else if (successCount > 0 || failedCount > 0 || skippedCount > 0) {
        Utils.showToast(`${successCount} hochgeladen, ${skippedCount} übersprungen, ${failedCount} fehlgeschlagen.`, 'warning');
      } else {
        Utils.showToast('Keine Datei hochgeladen.', 'medium');
      }

      await this.loadEntries();
    } finally {
      await loading?.dismiss();
      input.value = '';
    }
  }

  async createFolder(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Ordner erstellen',
      inputs: [{
        type: 'text',
        name: 'name',
        placeholder: 'Ordnername'
      }],
      buttons: [{
        text: 'Abbrechen',
        role: 'cancel'
      }, {
        text: 'Erstellen',
        handler: async (data: { name: string }) => {
          if (!data?.name?.trim()) {
            return false;
          }

          try {
            await this.filesSvc.createFolder(this.db.tenant().id, this.currentPath, data.name);
            Utils.showToast('Ordner wurde erstellt.', 'success');
            await this.loadEntries();
          } catch (error: any) {
            Utils.showToast(`Ordner konnte nicht erstellt werden: ${error.message || error}`, 'danger');
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
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      Utils.showToast(`Download fehlgeschlagen: ${error.message || error}`, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async sendEntryPerTelegram(entry: StorageEntry): Promise<void> {
    if (entry.isFolder) {
      return;
    }

    if (!this.db.tenantUser()?.telegram_chat_id) {
      Utils.showToast('Bitte verbinde zuerst Telegram in den Benachrichtigungen.', 'warning');
      return;
    }

    const loading = await Utils.getLoadingElement(999999, 'Datei wird per Telegram gesendet...');
    await loading.present();

    try {
      const url = await this.filesSvc.getSignedFileUrl(this.db.tenant().id, entry.path, 600);
      await this.db.sendSongPerTelegram(url);
    } catch (error: any) {
      Utils.showToast(`Telegram-Versand fehlgeschlagen: ${error.message || error}`, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async handleEntryAction(action: 'open' | 'download' | 'telegram' | 'rename' | 'move' | 'delete', entry: StorageEntry, popover: IonPopover): Promise<void> {
    await popover.dismiss();

    if (action === 'delete' && !this.canDeleteEntries) {
      Utils.showToast('Du darfst Dateien nicht löschen.', 'warning');
      return;
    }

    switch (action) {
      case 'open':
        await this.openFolder(entry);
        return;
      case 'download':
        await this.downloadEntry(entry);
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
    if (!this.canDeleteEntries) {
      Utils.showToast('Du darfst Dateien nicht löschen.', 'warning');
      return;
    }

    const alert = await this.alertController.create({
      header: entry.isFolder ? 'Ordner löschen?' : 'Datei löschen?',
      message: `Möchtest du ${entry.name} wirklich löschen?`,
      buttons: [{
        text: 'Abbrechen',
        role: 'cancel'
      }, {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          const loading = await Utils.getLoadingElement(999999);
          await loading.present();

          try {
            await this.filesSvc.deleteEntry(this.db.tenant().id, entry.path, entry.isFolder);
            Utils.showToast('Eintrag wurde gelöscht.', 'success');
            await this.loadEntries();
          } catch (error: any) {
            Utils.showToast(`Löschen fehlgeschlagen: ${error.message || error}`, 'danger');
          } finally {
            await loading.dismiss();
          }
        }
      }]
    });

    await alert.present();
  }

  async renameEntry(entry: StorageEntry): Promise<void> {
    const alert = await this.alertController.create({
      header: entry.isFolder ? 'Ordner umbenennen' : 'Datei umbenennen',
      inputs: [{
        type: 'text',
        name: 'name',
        value: entry.name,
        placeholder: 'Neuer Name'
      }],
      buttons: [{
        text: 'Abbrechen',
        role: 'cancel'
      }, {
        text: 'Speichern',
        handler: async (data: { name: string }) => {
          if (!data?.name?.trim()) {
            return false;
          }

          const loading = await Utils.getLoadingElement(999999);
          await loading.present();

          try {
            await this.filesSvc.renameEntry(this.db.tenant().id, entry.path, data.name, entry.isFolder);
            Utils.showToast('Eintrag wurde umbenannt.', 'success');
            await this.loadEntries();
          } catch (error: any) {
            Utils.showToast(`Umbenennen fehlgeschlagen: ${error.message || error}`, 'danger');
          } finally {
            await loading.dismiss();
          }
        }
      }]
    });

    await alert.present();
  }

  async moveEntry(entry: StorageEntry): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Verschieben',
      message: 'Zielordner relativ zum Tenant-Root. Leer lassen für Root.',
      inputs: [{
        type: 'text',
        name: 'target',
        placeholder: 'z. B. Dokumente/2026'
      }],
      buttons: [{
        text: 'Abbrechen',
        role: 'cancel'
      }, {
        text: 'Verschieben',
        handler: async (data: { target: string }) => {
          const loading = await Utils.getLoadingElement(999999);
          await loading.present();

          try {
            await this.filesSvc.moveEntry(this.db.tenant().id, entry.path, data?.target || '', entry.isFolder);
            Utils.showToast('Eintrag wurde verschoben.', 'success');
            await this.loadEntries();
          } catch (error: any) {
            Utils.showToast(`Verschieben fehlgeschlagen: ${error.message || error}`, 'danger');
          } finally {
            await loading.dismiss();
          }
        }
      }]
    });

    await alert.present();
  }
}
