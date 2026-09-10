import { Component, inject, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetButton, ActionSheetController, AlertController, IonItemSliding, IonModal, IonPopover, LoadingController, isPlatform } from '@ionic/angular/lazy';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
// JSZip and pdf-lib are lazy-loaded for better initial bundle size
import { DbService } from 'src/app/services/db.service';
import { AudioPlayerService } from 'src/app/services/audio-player/audio-player.service';
import { TrackingEvent, TrackingService } from 'src/app/services/tracking/tracking.service';
import { Role } from 'src/app/utilities/constants';
import { matchInstrument, detectSpecialFileType } from 'src/app/utilities/instrument-matcher';
import { Group, History, Organisation, Player, Song, SongFile, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';


@Component({
  selector: 'app-song',
  templateUrl: './song.page.html',
  styleUrls: ['./song.page.scss'],
  standalone: false
})
export class SongPage implements OnInit {
  private audioPlayer = inject(AudioPlayerService);
  public song: Song;
  public isOrchestra = false;
  public isStandaloneTab = false;
  public instruments: Group[] = [];
  public selectedFileInfos: {
    file: File;
    instrumentId: number | null;
    note?: string;
    conflictingFiles?: SongFile[];
    toReplace?: Set<string>;
  }[] = [];
  public isFilesModalOpen = false;
  public isDragging = false;
  public isPageDragging = false;
  public isSingleFileModalOpen = false;
  public singleFileConflict: SongFile | null = null;
  public singleFileConflicts: SongFile[] = [];
  public singleFileConflictsToReplace: Set<string> = new Set();
  private pageDragCounter = 0;
  public readOnly = true;
  public tenant?: Tenant;
  public sharing_id?: string;

  // Copy to other instance
  public isCopyModalOpen = false;
  public targetTenantId: number;
  public availableTenants: Tenant[] = [];
  public organisation: Organisation | null;
  public targetGroups: Group[] = [];

  // Print feature
  private players: Player[] = [];

  // Song history
  public songHistory: History[] = [];

  private syncInstrumentIdsFromFiles(): void {
    if (!this.song) { return; }
    const merged = [...new Set([...(this.song.instrument_ids || []), ...this.instrumentIdsFromFiles])];
    this.song.instrument_ids = merged;
  }

  get aufnahmeFile(): SongFile | null {
    return this.song?.files?.find(f => f.instrumentId === 1 && AudioPlayerService.isAudioFile(f)) ?? null;
  }

  playAufnahme() {
    const file = this.aufnahmeFile;
    if (file) {
      this.audioPlayer.play(file, this.song.name);
    }
  }

  get instrumentIdsFromFiles(): number[] {
    return [...new Set(
      (this.song?.files || [])
        .map(f => f.instrumentId)
        .filter(id => id != null && id > 2) as number[]
    )];
  }

  getHistoryEntryTitle(entry: any): string {
    return entry.typeTitle || '';
  }

  constructor(
    public db: DbService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private loadingController: LoadingController,
    private tracking: TrackingService,
  ) { }

  async ngOnInit() {
    const segments = window.location.pathname.split('/');
    const isStandaloneTab = segments[2] === 'songs-tab';
    this.isStandaloneTab = isStandaloneTab;
    const songId = isStandaloneTab
      ? Number(segments[3])
      : Number(segments[4] ?? segments[2]);
    if (!isStandaloneTab && !segments[4]) {
      this.sharing_id = window.location.pathname.split('/')[1];
      this.tenant = await this.db.getTenantBySongSharingId(this.sharing_id);
      this.isOrchestra = this.tenant?.type === 'orchestra';
    } else {
      this.isOrchestra = this.db.tenant()?.type === 'orchestra';
      this.readOnly = this.db.tenantUser()?.role !== Role.RESPONSIBLE && this.db.tenantUser()?.role !== Role.ADMIN;
    }

    this.song = await this.db.getSong(songId, this.tenant?.id);
    if (!this.song.additional_fields) { this.song.additional_fields = {}; }
    for (const field of this.db.tenant()?.song_additional_fields ?? []) {
      if (this.song.additional_fields[field.id] === undefined || this.song.additional_fields[field.id] === null) {
        this.song.additional_fields[field.id] = Utils.getFieldTypeDefaultValue(field.type, field.defaultValue, field.options);
      }
    }
    if (this.isOrchestra) {
      const groups = this.tenant ? await this.db.getGroups(this.tenant.id) : this.db.groups();
      this.instruments = groups.filter((instrument: Group) => instrument.maingroup !== true);
    }
    this.syncInstrumentIdsFromFiles();

    // Load song history (when played at events)
    try {
      const tenantId = this.tenant?.id ?? this.db.tenant()?.id;
      if (tenantId && !this.readOnly) {
        this.songHistory = await this.db.getHistoryBySongId(songId, tenantId);
      }
    } catch (e) {
      // Non-critical, ignore errors
    }

    // Load organisation and tenants for copy feature.
    // Available to any logged-in user — filtered to tenants where they have
    // ADMIN or RESPONSIBLE rights, so a read-only member can still copy a
    // song into an instance where they do have the required permissions.
    this.organisation = await this.db.getOrganisationFromTenant();
    if (this.organisation) {
      const allTenants = await this.db.getTenantsFromOrganisation();
      // Keep only tenants where the user holds ADMIN or RESPONSIBLE role,
      // and exclude the current tenant (no point copying to yourself).
      const currentTenantId = this.db.tenant()?.id;
      this.availableTenants = allTenants.filter(t => {
        if (t.id === currentTenantId) { return false; }
        const tu = this.db.tenantUsers()?.find(u => u.tenantId === t.id);
        return tu?.role === Role.ADMIN || tu?.role === Role.RESPONSIBLE;
      });
      if (this.availableTenants.length > 0) {
        this.targetTenantId = this.availableTenants[0].id;
        this.targetGroups = await this.db.getGroups(this.targetTenantId);
      }
    }
  }

  async onTargetTenantChange(): Promise<void> {
    this.targetGroups = [];
    if (this.targetTenantId) {
      this.targetGroups = await this.db.getGroups(this.targetTenantId);
    }
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) {return;}
    this.addFiles(input.files);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave() {
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files) {
      this.addFiles(event.dataTransfer.files);
    }
  }

  private addFiles(files: FileList) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 20 * 1024 * 1024) {
        Utils.showToast(`Die Datei ${file.name} überschreitet die maximale Größe von 20MB.`, 'danger', 5000);
        continue;
      }

      let mappedId: number | null = null;
      let note: string | undefined;

      if (this.instruments?.length) {
        const match = matchInstrument(file.name, this.instruments);
        if (match) {mappedId = match.id!;}
      }

      if (!mappedId) {
        const specialType = detectSpecialFileType(file.name, file.type);
        if (specialType) {
          mappedId = specialType.instrumentId;
          note = specialType.note;
        }
      }

      const conflicts = this.findConflictingFiles(mappedId, note);
      const toReplace = new Set(conflicts.filter(f => f.fileName === file.name).map(f => f.url));
      if (toReplace.size === 0) { conflicts.forEach(f => toReplace.add(f.url)); }
      this.selectedFileInfos.push({ file, instrumentId: mappedId, note, conflictingFiles: conflicts, toReplace });
    }
  }

  // --- Page-level drag & drop ---

  onPageDragEnter(event: DragEvent) {
    event.preventDefault();
    this.pageDragCounter++;
    this.isPageDragging = true;
  }

  onPageDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onPageDragLeave(_event?: DragEvent) {
    if (--this.pageDragCounter === 0) {
      this.isPageDragging = false;
    }
  }

  onPageDrop(event: DragEvent) {
    event.preventDefault();
    this.pageDragCounter = 0;
    this.isPageDragging = false;
    if (!this.readOnly && event.dataTransfer?.files?.length) {
      this.handlePageDrop(event.dataTransfer.files);
    }
  }

  private handlePageDrop(files: FileList) {
    this.selectedFileInfos = [];
    this.addFiles(files);
    if (files.length > 1) {
      this.isFilesModalOpen = true;
    } else {
      this.refreshSingleFileConflicts();
      this.isSingleFileModalOpen = true;
    }
  }

  private findConflictingFiles(instrumentId: number | null, note?: string): SongFile[] {
    if (!this.song?.files?.length) { return []; }
    if (instrumentId != null) {
      return this.song.files.filter(f => f.instrumentId === instrumentId);
    }
    return this.song.files.filter(f => f.instrumentId == null && (f.note || '') === (note || ''));
  }

  private refreshSingleFileConflicts() {
    if (!this.selectedFileInfos.length) { return; }
    const info = this.selectedFileInfos[0];
    this.singleFileConflicts = this.findConflictingFiles(info.instrumentId, info.note);
    this.singleFileConflict = this.singleFileConflicts[0] ?? null;
    // Pre-check files whose name matches the dropped file
    this.singleFileConflictsToReplace = new Set(
      this.singleFileConflicts
        .filter(f => f.fileName === info.file.name)
        .map(f => f.url)
    );
    // If no name match, pre-check all conflicts
    if (this.singleFileConflictsToReplace.size === 0) {
      this.singleFileConflictsToReplace = new Set(this.singleFileConflicts.map(f => f.url));
    }
  }

  onSingleFileInstrumentChange(instrumentId: number | null) {
    if (!this.selectedFileInfos.length) { return; }
    this.selectedFileInfos[0] = { ...this.selectedFileInfos[0], instrumentId };
    this.refreshSingleFileConflicts();
  }

  toggleConflictToReplace(url: string) {
    if (this.singleFileConflictsToReplace.has(url)) {
      this.singleFileConflictsToReplace.delete(url);
    } else {
      this.singleFileConflictsToReplace.add(url);
    }
    this.singleFileConflictsToReplace = new Set(this.singleFileConflictsToReplace);
  }

  toggleModalConflict(index: number, url: string) {
    const info = this.selectedFileInfos[index];
    if (!info?.toReplace) { return; }
    if (info.toReplace.has(url)) { info.toReplace.delete(url); } else { info.toReplace.add(url); }
    info.toReplace = new Set(info.toReplace);
  }

  cancelSingleFile() {
    this.selectedFileInfos = [];
    this.singleFileConflict = null;
    this.singleFileConflicts = [];
    this.singleFileConflictsToReplace = new Set();
  }

  onSingleFileModalDismiss() {
    this.isSingleFileModalOpen = false;
  }

  async performDirectUpload(replaceExisting: boolean) {
    if (!this.selectedFileInfos.length) { return; }
    const info = this.selectedFileInfos[0];
    const loading = await Utils.getLoadingElement(999999, 'Datei wird hochgeladen...');
    await loading.present();
    if (replaceExisting) {
      for (const conflict of this.singleFileConflicts.filter(f => this.singleFileConflictsToReplace.has(f.url))) {
        await this.db.deleteSongFile(this.song.id, conflict);
      }
    }
    await this.db.uploadSongFile(this.song.id, info.file, info.instrumentId, info.note);
    this.song = await this.db.getSong(this.song.id);
    this.syncInstrumentIdsFromFiles();
    this.selectedFileInfos = [];
    this.singleFileConflict = null;
    this.singleFileConflicts = [];
    this.singleFileConflictsToReplace = new Set();
    await loading.dismiss();
  }

  trackByFileInfo(index: number, fileInfo: any): string {
    return `${index}-${fileInfo.note || ''}-${fileInfo.instrumentId}`;
  }

  async changeFileInstrument(index: number, instrumentId: number | null, note?: string) {
    if (!instrumentId) {
      const alert = await this.alertController.create({
        header: 'Sonstige Kategorie eingeben',
        inputs: [
          {
            name: 'note',
            type: 'text',
            placeholder: 'Beliebige Kategorie eingeben...',
            value: note || ''
          }
        ],
        buttons: [
          {
            text: 'Speichern',
            handler: async (data) => {
              const newNote = data.note ?? '';
              const conflicts = this.findConflictingFiles(null, newNote);
              const toReplace = new Set(conflicts.filter(f => f.fileName === this.selectedFileInfos[index].file.name).map(f => f.url));
              if (toReplace.size === 0) { conflicts.forEach(f => toReplace.add(f.url)); }
              this.selectedFileInfos[index] = {
                ...this.selectedFileInfos[index],
                note: newNote,
                instrumentId: null,
                conflictingFiles: conflicts,
                toReplace,
              };
              this.selectedFileInfos = [...this.selectedFileInfos];
              this.cdr.detectChanges();
            }
          }
        ]
      });
      await alert.present();
      this.focusAlertInput(alert);
    } else {
      const conflicts = this.findConflictingFiles(instrumentId, this.selectedFileInfos[index].note);
      const toReplace = new Set(conflicts.filter(f => f.fileName === this.selectedFileInfos[index].file.name).map(f => f.url));
      if (toReplace.size === 0) { conflicts.forEach(f => toReplace.add(f.url)); }
      this.selectedFileInfos[index] = { ...this.selectedFileInfos[index], instrumentId, conflictingFiles: conflicts, toReplace };
    }
  }

  async uploadFiles(event: Event, fileUploadModal: IonModal, skipReplace = false) {
    event.preventDefault();
    if (!this.selectedFileInfos.length) {
      return;
    }

    // Check for non-PDF files marked as Liedtext
    const invalidLiedtextFiles = this.selectedFileInfos.filter(info =>
      info.instrumentId === 2 &&
      info.file.type !== 'application/pdf' &&
      !info.file.name.toLowerCase().endsWith('.pdf')
    );

    if (invalidLiedtextFiles.length > 0) {
      const alert = await this.alertController.create({
        header: 'Warnung: Liedtext-Format',
        message: `${invalidLiedtextFiles.length} Datei(en) wurden als "Liedtext" kategorisiert, sind aber keine PDF-Dateien. Die Spieler und Sänger können diese Dateien daher nicht in ihrer Übersicht bei den aktuellen Werken sehen.`,
        buttons: [
          {
            text: 'Abbrechen',
            role: 'cancel'
          },
          {
            text: 'Trotzdem hochladen',
            handler: async () => {
              await this.performUpload(fileUploadModal, skipReplace);
            }
          }
        ]
      });
      await alert.present();
    } else {
      await this.performUpload(fileUploadModal, skipReplace);
    }
  }

  private async performUpload(fileUploadModal: IonModal, skipReplace = false) {
    const loading = await Utils.getLoadingElement(999999, 'Dateien werden hochgeladen...');
    await loading.present();
    for (const info of this.selectedFileInfos) {
      if (!skipReplace && info.toReplace?.size) {
        for (const conflict of (info.conflictingFiles ?? []).filter(f => info.toReplace.has(f.url))) {
          await this.db.deleteSongFile(this.song.id, conflict);
        }
      }
      await this.db.uploadSongFile(this.song.id, info.file, info.instrumentId, info.note);
    }

    this.song = await this.db.getSong(this.song.id); // Refresh file list
    this.syncInstrumentIdsFromFiles();

    this.selectedFileInfos = [];
    await fileUploadModal.dismiss();
    await loading.dismiss();
  }

  getInstrumentName(id: number | null, note?: string): string {
    if (!id) {return note ?? 'Sonstige';}
    if (id === 1) {return 'Aufnahme';}
    if (id === 2) {return 'Liedtext';}
    const inst = this.instruments.find(i => i.id === id);
    return inst ? inst.name : 'Unbekannt';
  }

  private fileSortKey(file: SongFile): string {
    const id = file.instrumentId ?? null;
    if (id === 1) { return '0'; }                              // Aufnahme
    if (id === null && file.note === 'Partitur') { return '1'; }
    if (id === null && file.note === 'Sibelius') { return '2'; }
    if (id === 2) { return '3'; }                              // Liedtext
    if (id === null && file.note === 'Chor') { return '4'; }
    if (id === null && file.note === 'Klavierauszug') { return '5'; }
    if (id === null) { return '6'; }                           // Sonstige (other notes)
    const inst = this.instruments.find(g => g.id === id);
    const order = inst?.sort_order ?? 9999;
    return '7_' + String(order).padStart(6, '0');
  }

  get sortedFiles(): SongFile[] {
    if (!this.song?.files) { return []; }
    return [...this.song.files].sort((a, b) =>
      this.fileSortKey(a).localeCompare(this.fileSortKey(b))
    );
  }

  getBadgeColor(instrumentId: number | null | undefined, note?: string): string {
    const id = instrumentId ?? null;
    if (id === 1) { return 'primary'; }       // Aufnahme
    if (id === 2) { return 'warning'; }       // Liedtext
    if (id != null) { return 'secondary'; }    // instrument group
    // note-based special categories
    switch (note) {
      case 'Sibelius':      return 'sibelius';
      case 'Klavierauszug': return 'success';
      case 'Partitur':      return 'success';
      case 'Chor':          return 'tertiary';
      default:              return 'medium';
    }
  }

  openFile(file: SongFile) {
    Utils.openFileNative(file.url, file.fileName);
  }

  openLink(link: string) {
    Browser.open({ url: link });
  }

  async downloadFile(file: SongFile) {
    const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), this.song.id);
    Utils.downloadFileNative(blob, file.fileName);
  }

  async deleteFile(file: SongFile) {
    const alert = await this.alertController.create({
      header: 'Datei löschen',
      message: `Möchten Sie die Datei "${file.fileName}" wirklich löschen?`,
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Löschen',
          role: 'destructive',
          handler: async () => {
            await this.db.deleteSongFile(this.song.id, file);
            this.song = await this.db.getSong(this.song.id); // Refresh file list
          }
        }
      ]
    });
    await alert.present();
  }

  async changeCategory(file: SongFile) {
    const alert = await this.alertController.create({
      header: 'Kategorie ändern',
      inputs: [{
        name: 'instrument',
        type: 'radio' as const,
        label: 'Sonstige (Freitext möglich)',
        value: null,
        checked: file.instrumentId === null
      }, {
        name: 'instrument',
        type: 'radio' as const,
        label: 'Aufnahme',
        value: 1,
        checked: file.instrumentId === 1
      }, {
        name: 'instrument',
        type: 'radio' as const,
        label: 'Liedtext',
        value: 2,
        checked: file.instrumentId === 2
      }].concat(this.instruments.map(inst => ({
        name: 'instrument',
        type: 'radio' as const,
        label: inst.name,
        value: inst.id,
        checked: file.instrumentId === inst.id
      }))),
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Speichern',
          handler: async (data) => {
            if (!data) {
              await this.showNoteInputAlert(file);
            } else {
              await this.saveFileChange(file, data);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async showNoteInputAlert(file: SongFile) {
    const alert = await this.alertController.create({
      header: 'Sonstige Kategorie eingeben',
      inputs: [
        {
          name: 'note',
          type: 'text',
          placeholder: 'Beliebige Kategorie eingeben...',
          value: file.note || ''
        }
      ],
      buttons: [
        {
          text: 'Speichern',
          handler: async (data) => {
            await this.saveFileChange(file, null, data.note ?? '');
          }
        }
      ]
    });
    await alert.present();
    this.focusAlertInput(alert);
  }

  private focusAlertInput(alert: HTMLIonAlertElement): void {
    // Ionic doesn't expose autofocus on alert inputs; query the rendered DOM and focus manually.
    // iOS WKWebView blocks programmatic focus outside a user gesture; click() before focus()
    // tricks Safari into treating it as user-initiated.
    setTimeout(() => {
      const input = alert.querySelector<HTMLInputElement>('input.alert-input');
      if (!input) return;
      try { input.click(); } catch {}
      input.focus();
      input.setSelectionRange?.(input.value.length, input.value.length);
    }, 150);
  }

  async saveFileChange(file: SongFile, instrumentId?: number | null, note?: string) {
    const files = this.song.files?.map(f => f.fileName === file.fileName ? { ...f, instrumentId, note } : f);
    await this.db.editSong(this.song.id, {
      ...this.song,
      files,
      instrument_ids: Array.from(new Set((files || []).map(f => f.instrumentId).filter(id => id !== null && id !== 1 && id !== 2 && id !== this.db.getMainGroup()?.id)))
    });
    this.song = await this.db.getSong(this.song.id); // Refresh file list
    this.cdr.detectChanges();
  }

  removeSelectedFile(index: number, slider?: IonItemSliding) {
    slider?.close();
    this.selectedFileInfos.splice(index, 1);
  }

  async deleteAllFiles(filesPopover: IonPopover) {
    filesPopover.dismiss();
    const alert = await this.alertController.create({
      header: 'Alle Dateien löschen',
      message: `Möchten Sie wirklich alle Dateien dieses Werks löschen?`,
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Löschen',
          role: 'destructive',
          handler: async () => {
            const loading = await Utils.getLoadingElement(999999, 'Dateien werden gelöscht...');
            await loading.present();
            for (const file of this.song.files || []) {
              await this.db.deleteSongFile(this.song.id, file);
            }
            this.song = await this.db.getSong(this.song.id); // Refresh file list
            await loading.dismiss();
          }
        }
      ]
    });
    await alert.present();
  }

  async downloadAllFiles(filesPopover?: IonPopover) {
    filesPopover?.dismiss();
    const loading = await Utils.getLoadingElement(999999, 'Dateien werden heruntergeladen...');
    await loading.present();
    const blobs: { fileName: string; blob: Blob }[] = [];
    for (const file of this.song.files || []) {
      const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), this.song.id);
      blobs.push({ fileName: file.fileName, blob });
    }

    // Lazy load JSZip
    const JSZipModule = await import('jszip') as any;
    const JSZip = JSZipModule.default ?? JSZipModule;
    const jszip = new JSZip();
    for (const file of blobs) {
      jszip.file(file.fileName, file.blob);
    }

    const result = await jszip.generateAsync({ type: 'blob' });

    await Utils.downloadFileNative(result, `${this.song.name || 'songs'}.zip`);

    await loading.dismiss();
  }

  async openFileActionSheet(file: SongFile) {
    const isAudio = AudioPlayerService.isAudioFile(file);
    const buttons: ActionSheetButton[] = [
      {
        text: isAudio ? 'Aufnahme abspielen' : 'Datei öffnen',
        icon: isAudio ? 'play-circle-outline' : 'open-outline',
        handler: () => {
          if (isAudio) {
            this.audioPlayer.play(file, this.song.name);
          } else {
            Utils.openFileNative(file.url, file.fileName);
          }
        }
      },
    ];

    if (!isAudio) {
      buttons.push({
        text: 'Datei drucken',
        icon: 'print-outline',
        handler: async () => {
          // iOS/PWA doesn't support window.print() reliably, use Share API instead
          if (isPlatform('ios') || isPlatform('mobileweb')) {
            try {
              // Fetch the PDF as blob
              const response = await fetch(file.url);
              const blob = await response.blob();
              const filesArray = [new File([blob], file.fileName || 'document.pdf', { type: 'application/pdf' })];

              // Check if Web Share API is available
              if (navigator.share && navigator.canShare && navigator.canShare({ files: filesArray })) {
                await navigator.share({
                  files: filesArray,
                  title: this.song.name || 'Dokument',
                  text: 'Drucke diese Datei'
                });
              } else {
                // Fallback: download the file
                const a = document.createElement('a');
                a.href = file.url;
                a.download = file.fileName || 'document.pdf';
                a.click();
                Utils.showToast('Datei heruntergeladen - bitte aus Dateien-App drucken', 'success');
              }
            } catch (error) {
              console.error('Share/download failed:', error);
              // Final fallback: open in new tab
              window.open(file.url, '_blank');
              Utils.showToast('Datei geöffnet - bitte manuell drucken', 'success');
            }
          } else {
            const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), this.song.id);
            const blobUrl = URL.createObjectURL(blob);
            const printWindow = window.open(blobUrl, '_blank');
            if (printWindow) {
              let printed = false;
              printWindow.onload = () => {
                if (!printed) {
                  printed = true;
                  setTimeout(() => {
                    try { printWindow.print(); } catch (e) { console.error('Print failed:', e); }
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                  }, 500);
                }
              };
              setTimeout(() => {
                if (!printed && printWindow) {
                  printed = true;
                  try { printWindow.print(); } catch (e) { console.error('Print failed:', e); }
                  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                }
              }, 2000);
            } else {
              URL.revokeObjectURL(blobUrl);
              Utils.showToast('Popup wurde blockiert. Bitte erlaube Popups für diese Seite.', 'warning');
            }
          }
        }
      });
    }

    if (!isPlatform('ios') || isAudio) {
      buttons.push({
        text: isAudio ? 'Aufnahme herunterladen' : 'Datei herunterladen',
        icon: 'download-outline',
        handler: () => {
          this.downloadFile(file);
        }
      });
    }

    if (!this.readOnly) {
      buttons.push(
        {
          text: 'Kategorie ändern',
          icon: 'swap-horizontal-outline',
          handler: async () => {
            await this.changeCategory(file);
          }
        },
      );
    }

    if (this.db.tenantUser()?.telegram_chat_id) {
      buttons.push({
        text: 'Per Telegram senden',
        icon: 'send-outline',
        handler: async () => {
          await this.sendPerTelegram(file);
        }
      });
    }

    if (!this.readOnly) {
      buttons.push({
        text: 'Datei löschen',
        icon: 'trash-outline',
        role: 'destructive',
        handler: () => {
          this.deleteFile(file);
        }
      });
    }

    buttons.push({
      text: 'Abbrechen',
      icon: 'close-outline',
      role: 'destructive'
    });

    const actionSheet = await this.actionSheetController.create({
      header: 'Datei Aktionen',
      buttons
    });
    await actionSheet.present();
  }

  async sendPerTelegram(file: SongFile) {
    const loading = await Utils.getLoadingElement(999999, 'Datei wird versendet...');
    await loading.present();
    await this.db.sendSongPerTelegram(file.url);
    await loading.dismiss();
  }

  getSongSharingLink(): string {
    return `https://attendix.de/${this.sharing_id ?? this.db.tenant()?.song_sharing_id}/${this.song.id}`;
  }

  copyShareLink() {
    navigator?.clipboard.writeText(this.getSongSharingLink());
    this.tracking.track(TrackingEvent.SongShared);
    Utils.showToast('Der Link wurde in die Zwischenablage kopiert', 'success');
  }

  async update() {
    const merged = [...new Set([...(this.song.instrument_ids || []), ...this.instrumentIdsFromFiles])];
    this.song.instrument_ids = merged;
    await this.db.editSong(this.song.id, this.song);
  }

  async confirmDeleteSong() {
    const alert = await this.alertController.create({
      header: 'Werk löschen',
      message: 'Soll das Werk wirklich gelöscht werden?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        }, {
          text: 'Löschen',
          handler: async () => {
            const loading = await Utils.getLoadingElement(999999, 'Werk wird gelöscht...');
            await loading.present();
            await this.db.removeSong(this.song);
            await loading.dismiss();
            this.router.navigate(['tabs', 'settings', 'songs']);
          }
        }
      ]
    });

    await alert.present();
  }

  getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) {return 'Keine Kategorie';}
    const category = this.db.songCategories().find(cat => cat.id === categoryId);
    return category ? category.name : 'Unbekannte Kategorie';
  }

  /**
   * Map instrument ID from source tenant to target tenant by name matching
   */
  private mapInstrumentId(sourceInstrumentId: number | undefined): number | null {
    // Reserved IDs remain unchanged
    if (!sourceInstrumentId) {return null;}
    if (sourceInstrumentId === 1 || sourceInstrumentId === 2) {
      return sourceInstrumentId;
    }

    const sourceGroup = this.instruments.find(g => g.id === sourceInstrumentId);
    if (!sourceGroup) {return null;}

    // Try exact name match first (case-insensitive)
    let targetGroup = this.targetGroups.find(g =>
      g.name.normalize().toLowerCase() === sourceGroup.name.normalize().toLowerCase()
    );

    // Try synonyms if no exact match
    if (!targetGroup && sourceGroup.synonyms) {
      const synonyms = sourceGroup.synonyms.split(',').map(s => s.trim().normalize().toLowerCase());
      targetGroup = this.targetGroups.find(g =>
        synonyms.includes(g.name.normalize().toLowerCase()) ||
        (g.synonyms && g.synonyms.split(',').map(s => s.trim().normalize().toLowerCase())
          .some(s => s === sourceGroup.name.normalize().toLowerCase() || synonyms.includes(s)))
      );
    }

    return targetGroup?.id ?? null;
  }

  async copySong(): Promise<void> {
    const loading = await this.loadingController.create({
      message: 'Werk wird kopiert...',
      duration: 9999999
    });
    await loading.present();

    try {
      // Build instrument mapping for all files
      const instrumentMapping: { [key: number]: number | null } = {};
      if (this.song.files?.length) {
        for (const file of this.song.files) {
          if (file.instrumentId && !instrumentMapping.hasOwnProperty(file.instrumentId)) {
            instrumentMapping[file.instrumentId] = this.mapInstrumentId(file.instrumentId);
          }
        }
      }

      await this.db.copySongToTenant(
        this.song,
        this.targetTenantId,
        instrumentMapping,
        (current, total) => {
          loading.message = `Datei ${current} von ${total} wird kopiert...`;
        }
      );

      await loading.dismiss();
      this.isCopyModalOpen = false;
      Utils.showToast('Werk wurde erfolgreich kopiert', 'success');
    } catch (error) {
      await loading.dismiss();
      console.error('Error copying song:', error);
      Utils.showToast('Fehler beim Kopieren des Werks: ' + error.message, 'danger');
    }
  }

  /**
   * Get the count of active players for a specific group/instrument
   */
  private getPlayerCountByGroup(groupId: number): number {
    return this.players.filter(p => p.instrument === groupId && !p.left && !p.paused).length;
  }

  /**
   * Print all group PDFs with copies based on player count
   */
  async printSongFiles(filesPopover?: IonPopover): Promise<void> {
    if (!this.players.length) {
      this.players = await this.db.getPlayers(true);
    }
    filesPopover?.dismiss();

    // Filter PDFs with real group assignments (instrumentId > 2)
    const groupPdfs = (this.song.files || []).filter(f =>
      f.instrumentId &&
      f.instrumentId > 2 &&
      (f.fileType === 'application/pdf' || f.fileName.toLowerCase().endsWith('.pdf'))
    );

    if (groupPdfs.length === 0) {
      Utils.showToast('Keine Gruppen-PDFs zum Drucken gefunden', 'warning');
      return;
    }

    // Check which groups have players
    const groupsWithPlayers = groupPdfs.filter(f => this.getPlayerCountByGroup(f.instrumentId) > 0);

    if (groupsWithPlayers.length === 0) {
      Utils.showToast('Keine Gruppen mit zugewiesenen Personen gefunden', 'warning');
      return;
    }

    // Ask for print ratio
    const alert = await this.alertController.create({
      header: 'Druckoptionen',
      message: 'Wie viele Ausdrucke pro Gruppe?',
      inputs: [
        {
          name: 'ratio',
          type: 'radio',
          label: 'Alle Personen (1 pro Person)',
          value: '1',
          checked: true
        },
        {
          name: 'ratio',
          type: 'radio',
          label: 'Jede 2. Person',
          value: '2'
        },
        {
          name: 'ratio',
          type: 'radio',
          label: 'Jede 3. Person',
          value: '3'
        },
        {
          name: 'ratio',
          type: 'radio',
          label: 'Jede 4. Person',
          value: '4'
        },
        {
          name: 'ratio',
          type: 'radio',
          label: '1 pro Gruppe',
          value: '0'
        }
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Drucken',
          handler: async (ratio: string) => {
            await this.generatePrintPdf(groupsWithPlayers, parseInt(ratio, 10));
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * Generate merged PDF with correct copy counts
   */
  private async generatePrintPdf(groupPdfs: SongFile[], ratio: number): Promise<void> {
    const loading = await Utils.getLoadingElement(999999, 'PDF wird erstellt...');
    await loading.present();

    try {
      // Lazy load pdf-lib
      const { PDFDocument } = await import('pdf-lib');
      const mergedPdf = await PDFDocument.create();
      let totalPages = 0;

      for (const file of groupPdfs) {
        const playerCount = this.getPlayerCountByGroup(file.instrumentId);

        // Calculate copies needed
        let copies: number;
        if (ratio === 0) {
          copies = 1; // 1 per group
        } else {
          copies = Math.ceil(playerCount / ratio);
        }

        if (copies === 0) {continue;}

        loading.message = `Lade ${this.getInstrumentName(file.instrumentId)}... (${copies} Kopien)`;

        // Download the PDF
        const pdfBlob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), this.song.id);
        const pdfBytes = await pdfBlob.arrayBuffer();

        // Load the source PDF
        const sourcePdf = await PDFDocument.load(pdfBytes);
        const pageCount = sourcePdf.getPageCount();

        // Add copies to merged PDF
        for (let copy = 0; copy < copies; copy++) {
          const copiedPages = await mergedPdf.copyPages(sourcePdf, Array.from({ length: pageCount }, (_, i) => i));
          copiedPages.forEach(page => mergedPdf.addPage(page));
          totalPages += pageCount;
        }
      }

      if (totalPages === 0) {
        await loading.dismiss();
        Utils.showToast('Keine Seiten zum Drucken', 'warning');
        return;
      }

      loading.message = 'PDF wird finalisiert...';

      // Save and download/print
      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes as BlobPart], { type: 'application/pdf' });
      const fileName = `${this.song.name || 'song'}_print.pdf`;

      if (Capacitor.isNativePlatform()) {
        await Utils.downloadFileNative(blob, fileName);
      } else if (isPlatform('ios') || isPlatform('mobileweb')) {
        try {
          const filesArray = [new File([blob], fileName, { type: 'application/pdf' })];

          if (navigator.share && navigator.canShare && navigator.canShare({ files: filesArray })) {
            await navigator.share({
              files: filesArray,
              title: this.song.name || 'Dokument',
              text: 'Drucke diese Datei'
            });
          } else {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            window.URL.revokeObjectURL(url);
            Utils.showToast('PDF heruntergeladen - bitte aus Dateien-App drucken', 'success');
          }
        } catch (error) {
          console.error('Share/download failed:', error);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          window.URL.revokeObjectURL(url);
          Utils.showToast('PDF heruntergeladen - bitte aus Dateien-App drucken', 'success');
        }
      } else {
        const url = window.URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');

        if (printWindow) {
          let printed = false;

          printWindow.onload = () => {
            if (!printed) {
              printed = true;
              setTimeout(() => {
                try {
                  printWindow.print();
                } catch (e) {
                  console.error('Print failed in onload:', e);
                }
              }, 500);
            }
          };

          setTimeout(() => {
            if (!printed && printWindow) {
              printed = true;
              try {
                printWindow.print();
              } catch (e) {
                console.error('Print failed in timeout:', e);
              }
            }
          }, 2000);
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          Utils.showToast('PDF heruntergeladen - bitte manuell drucken', 'success');
        }
        window.URL.revokeObjectURL(url);
      }

      await loading.dismiss();

      // Show summary
      const groupSummary = groupPdfs.map(f => {
        const count = this.getPlayerCountByGroup(f.instrumentId);
        const copies = ratio === 0 ? 1 : Math.ceil(count / ratio);
        return `${this.getInstrumentName(f.instrumentId)}: ${copies}x`;
      }).join(', ');

      Utils.showToast(`Druck vorbereitet: ${groupSummary}`, 'success', 5000);

    } catch (error) {
      await loading.dismiss();
      console.error('Error generating print PDF:', error);
      Utils.showToast('Fehler beim Erstellen des PDFs: ' + error.message, 'danger');
    }
  }
}
