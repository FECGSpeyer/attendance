import { Component, OnInit } from '@angular/core';
import { AlertController, IonModal } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Group, Song, SongFile } from 'src/app/utilities/interfaces';
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
  public selectedInstruments: number[] = [];

  constructor(
    private db: DbService,
    private alertController: AlertController
  ) { }

  async ngOnInit() {
    this.isOrchestra = this.db.tenant().type === "orchestra";
    this.song = await this.db.getSong(Number(window.location.pathname.split("/")[4]));
    if (this.isOrchestra) {
      this.instruments = await this.db.getGroups();
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
        const match = this.instruments.find(g => file.name.toLowerCase().includes(g.name.toLowerCase()));
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

  downloadFile(file: SongFile) {
    window.open(file.url, '_blank');
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
            await this.db.editSong(this.song.id, {
              ...this.song,
              files: this.song.files?.map(f => f.fileName === file.fileName ? { ...f, instrumentId: data } : f)
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
}