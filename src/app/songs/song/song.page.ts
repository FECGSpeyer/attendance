import { Component, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetButton, ActionSheetController, AlertController, IonItemSliding, IonModal, IonPopover, LoadingController, isPlatform } from '@ionic/angular';
// JSZip and pdf-lib are lazy-loaded for better initial bundle size
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { Group, Organisation, Player, Song, SongFile, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';


@Component({
    selector: 'app-song',
    templateUrl: './song.page.html',
    styleUrls: ['./song.page.scss'],
    standalone: false
})
export class SongPage implements OnInit {
  public song: Song;
  public isOrchestra: boolean = false;
  public instruments: Group[] = [];
  public selectedFileInfos: {
    file: File,
    instrumentId: number | null,
    note?: string
  }[] = [];
  public isFilesModalOpen: boolean = false;
  public readOnly: boolean = true;
  public tenant?: Tenant;
  public sharing_id?: string;

  // Copy to other instance
  public isCopyModalOpen: boolean = false;
  public targetTenantId: number;
  public availableTenants: Tenant[] = [];
  public organisation: Organisation | null;
  public targetGroups: Group[] = [];

  // Print feature
  private players: Player[] = [];

  constructor(
    public db: DbService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private loadingController: LoadingController
  ) { }

  async ngOnInit() {
    const songId = Number(window.location.pathname.split("/")[4] ?? window.location.pathname.split("/")[2]);
    if (!window.location.pathname.split("/")[4]) {
      this.sharing_id = window.location.pathname.split("/")[1];
      this.tenant = await this.db.getTenantBySongSharingId(this.sharing_id);
      this.isOrchestra = this.tenant?.type === "orchestra";
    } else {
      this.isOrchestra = this.db.tenant()?.type === "orchestra";
      this.readOnly = this.db.tenantUser()?.role !== Role.RESPONSIBLE && this.db.tenantUser()?.role !== Role.ADMIN;
    }

    this.song = await this.db.getSong(songId, this.tenant?.id);
    if (this.isOrchestra) {
      const groups = this.tenant ? await this.db.getGroups(this.tenant.id) : this.db.groups();
      this.instruments = groups.filter((instrument: Group) => !instrument.maingroup);
    }

    // Load organisation and tenants for copy feature (only for admin/responsible)
    if (!this.readOnly) {
      this.organisation = await this.db.getOrganisationFromTenant();
      if (this.organisation) {
        this.availableTenants = await this.db.getTenantsFromOrganisation();
        if (this.availableTenants.length > 0) {
          this.targetTenantId = this.availableTenants[0].id;
          this.targetGroups = await this.db.getGroups(this.targetTenantId);
        }
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
    if (!input.files) return;
    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];
      if (file.size > 20 * 1024 * 1024) {
        Utils.showToast(`Die Datei ${file.name} überschreitet die maximale Größe von 20MB.`, 'danger', 5000);
        continue;
      }
      // Try to map instrument by filename
      let mappedId: number | null = null;
      let note: string | undefined = undefined;
      if (this.instruments?.length) {
        const match = this.instruments.find(g => {
          if (file.name.normalize().toLowerCase().includes(g.name.normalize().toLowerCase())) {
            return true;
          }

          if (g.synonyms) {
            const synonyms = g.synonyms.split(',').map(s => s.trim().normalize().toLowerCase());
            if (synonyms.some(syn => file.name.normalize().toLowerCase().includes(syn))) {
              return true;
            }
          }

          return false;
        });
        if (match) mappedId = match.id;
      }

      if (!mappedId) {
        const fileName = file.name.normalize().toLowerCase();
        if (file.type.startsWith('audio/')) {
          mappedId = 1;
        } else if (file.name.includes(".sib")) {
          note = "Sibelius";
        } else if (fileName.includes("partitur") || fileName.includes("score") || fileName.includes("full")) {
          note = "Partitur";
        } else if (fileName.includes("liedtext") || fileName.includes("text")) {
          mappedId = 2;
        } else if (fileName.includes("chior") || fileName.includes("chor")) {
          note = "Chor";
        }
      }

      this.selectedFileInfos.push({ file, instrumentId: mappedId, note });
    }
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
              this.selectedFileInfos[index].note = data.note ?? "";
              this.selectedFileInfos[index].instrumentId = null;
            }
          }
        ]
      });
      await alert.present();
    } else {
      this.selectedFileInfos[index].instrumentId = instrumentId;
    }
  }

  async uploadFiles(event: Event, fileUploadModal: IonModal) {
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
              await this.performUpload(fileUploadModal);
            }
          }
        ]
      });
      await alert.present();
    } else {
      await this.performUpload(fileUploadModal);
    }
  }

  private async performUpload(fileUploadModal: IonModal) {
    const loading = await Utils.getLoadingElement(999999, 'Dateien werden hochgeladen...');
    await loading.present();
    for (const info of this.selectedFileInfos) {
      await this.db.uploadSongFile(this.song.id, info.file, info.instrumentId, info.note);
    }

    this.song = await this.db.getSong(this.song.id); // Refresh file list

    this.selectedFileInfos = [];
    await fileUploadModal.dismiss();
    await loading.dismiss();
  }

  getInstrumentName(id: number | null, note?: string): string {
    if (!id) return note ?? 'Sonstige';
    if (id === 1) return 'Aufnahme';
    if (id === 2) return 'Liedtext';

    const inst = this.instruments.find(i => i.id === id);
    return inst ? inst.name : 'Unbekannt';
  }

  openFile(file: SongFile) {
    window.open(file.url, '_blank');
  }

  openLink(link: string) {
    window.open(link, '_blank');
  }

  async downloadFile(file: SongFile) {
    const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), this.song.id);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.fileName;
    a.click();
    window.URL.revokeObjectURL(url);
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
            await this.saveFileChange(file, null, data.note ?? "");
          }
        }
      ]
    });
    await alert.present();
  }

  async saveFileChange(file: SongFile, instrumentId?: number | null, note?: string) {
    const files = this.song.files?.map(f => f.fileName === file.fileName ? { ...f, instrumentId, note } : f);
    await this.db.editSong(this.song.id, {
      ...this.song,
      files,
      instrument_ids: Array.from(new Set((files || []).map(f => f.instrumentId).filter(id => id !== null && id !== 1)))
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
    const blobs: { fileName: string, blob: Blob }[] = [];
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

    const result = await jszip.generateAsync({ type: "blob" });

    const url = window.URL.createObjectURL(result);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.song.name || 'songs'}.zip`;
    a.click();
    window.URL.revokeObjectURL(url);

    await loading.dismiss();
  }

  async openFileActionSheet(file: SongFile) {
    const buttons: ActionSheetButton[] = [
      {
        text: 'Datei öffnen',
        icon: 'open-outline',
        handler: () => {
          window.open(file.url, '_blank');
        }
      },
      {
        text: 'Datei drucken',
        icon: 'print-outline',
        handler: () => {
          const printWindow = window.open(file.url, '_blank');
          if (printWindow) {
            printWindow.onload = () => printWindow.print();
          }
        }
      }
    ];

    if (!isPlatform('ios')) {
      buttons.push({
        text: 'Datei herunterladen',
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
    return `${window.location.origin}/${this.sharing_id ?? this.db.tenant()?.song_sharing_id}/${this.song.id}`;
  }

  copyShareLink() {
    navigator?.clipboard.writeText(this.getSongSharingLink());
    Utils.showToast("Der Link wurde in die Zwischenablage kopiert", "success");
  }

  async update() {
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
    if (!categoryId) return 'Keine Kategorie';
    const category = this.db.songCategories().find(cat => cat.id === categoryId);
    return category ? category.name : 'Unbekannte Kategorie';
  }

  /**
   * Map instrument ID from source tenant to target tenant by name matching
   */
  private mapInstrumentId(sourceInstrumentId: number | undefined): number | null {
    // Reserved IDs remain unchanged
    if (!sourceInstrumentId) return null;
    if (sourceInstrumentId === 1 || sourceInstrumentId === 2) {
      return sourceInstrumentId;
    }

    const sourceGroup = this.instruments.find(g => g.id === sourceInstrumentId);
    if (!sourceGroup) return null;

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

        if (copies === 0) continue;

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
      const url = window.URL.createObjectURL(blob);

      // Open in new tab for printing
      const printWindow = window.open(url, '_blank');

      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      } else {
        // Fallback: download the file
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.song.name || 'song'}_print.pdf`;
        a.click();
        Utils.showToast('PDF heruntergeladen - bitte manuell drucken', 'success');
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
