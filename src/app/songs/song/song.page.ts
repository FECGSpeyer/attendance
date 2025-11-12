import { Component, Input, OnInit } from '@angular/core';
import { AlertController, IonModal, IonPopover } from '@ionic/angular';
import * as JSZip from 'jszip';
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { Group, Song, SongFile, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';


@Component({
  selector: 'app-song',
  templateUrl: './song.page.html',
  styleUrls: ['./song.page.scss'],
})
export class SongPage implements OnInit {
  public song: Song;
  public isOrchestra: boolean = false;
  public instruments: Group[] = [];
  public fileSizeError: string = '';
  public selectedFileInfos: { file: File, instrumentId: number | null }[] = [];
  public isFilesModalOpen: boolean = false;
  public readOnly: boolean = true;
  public tenant?: Tenant;
  public sharing_id?: string;

  constructor(
    public db: DbService,
    private alertController: AlertController
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
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    this.fileSizeError = '';
    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];
      if (file.size > 10 * 1024 * 1024) {
        this.fileSizeError = `Die Datei ${file.name} überschreitet die maximale Größe von 10MB.`;
        continue;
      }
      // Try to map instrument by filename
      let mappedId: number | null = null;
      if (this.instruments && this.instruments.length) {
        const match = this.instruments.find(g => {
          if (file.name.toLowerCase().includes(g.name.toLowerCase())) {
            return true;
          }

          if (g.synonyms) {
            const synonyms = g.synonyms.split(',').map(s => s.trim().toLowerCase());
            if (synonyms.some(syn => file.name.toLowerCase().includes(syn))) {
              return true;
            }
          }

          return false;
        });
        if (match) mappedId = match.id;
      }
      this.selectedFileInfos.push({ file, instrumentId: mappedId });
    }
  }

  changeFileInstrument(index: number, instrumentId: number | null) {
    this.selectedFileInfos[index].instrumentId = instrumentId;
  }

  async uploadFiles(event: Event, fileUploadModal: IonModal) {
    const loading = await Utils.getLoadingElement(999999, 'Dateien werden hochgeladen...');
    await loading.present();
    event.preventDefault();
    if (!this.selectedFileInfos.length) {
      await loading.dismiss();
      return;
    }
    for (const info of this.selectedFileInfos) {
      // Pass instrumentId to uploadSongFile if you want to override mapping
      await this.db.uploadSongFile(this.song.id, info.file, info.instrumentId);
    }

    this.song = await this.db.getSong(this.song.id); // Refresh file list

    this.selectedFileInfos = [];
    await fileUploadModal.dismiss();
    await loading.dismiss();
  }

  getInstrumentName(id: number | null): string {
    if (!id) return 'Sonstige';
    if (id === 1) return 'Aufnahme';

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
    const blob = await this.db.downloadSongFile(file.storageName, this.song.id);
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
        label: 'Sonstige',
        value: null,
        checked: file.instrumentId === null
      }, {
        name: 'instrument',
        type: 'radio' as const,
        label: 'Aufnahme',
        value: 1,
        checked: file.instrumentId === 1
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
            const files = this.song.files?.map(f => f.fileName === file.fileName ? { ...f, instrumentId: data } : f);
            await this.db.editSong(this.song.id, {
              ...this.song,
              files,
              instrument_ids: Array.from(new Set((files || []).map(f => f.instrumentId).filter(id => id !== null && id !== 1)))
            });
            this.song = await this.db.getSong(this.song.id); // Refresh file list
          }
        }
      ]
    });
    await alert.present();
  }

  removeSelectedFile(index: number) {
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
      const blob = await this.db.downloadSongFile(file.storageName, this.song.id);
      blobs.push({ fileName: file.fileName, blob });
    }

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
}