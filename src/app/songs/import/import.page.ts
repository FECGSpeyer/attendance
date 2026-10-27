import { Component } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { Song } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { readSpreadsheetFile } from 'src/app/utilities/spreadsheet-reader';
import {
  autoMapSongHeaders,
  buildSongImportTemplateHeaders,
  detectSongDuplicates,
  MappedSongRow,
  mappingSongHasRequired,
  mapSongRows,
  SongColumnMapping,
  SongFieldKey,
  SongMapContext,
  EXTRA_PREFIX,
} from 'src/app/utilities/import-mapper';
import { translate } from '@jsverse/transloco';

interface SongTargetOption {
  key: SongFieldKey | null;
  label: string;
}

@Component({
  selector: 'app-song-import',
  templateUrl: './import.page.html',
  styleUrls: ['./import.page.scss'],
  standalone: false
})
export class SongImportPage {
  step: 'file' | 'mapping' | 'preview' = 'file';

  fileName = '';
  fileHeaders: string[] = [];
  rawRows: Record<string, any>[] = [];

  mapping: SongColumnMapping = {};
  targetOptions: SongTargetOption[] = [];

  mappedRows: MappedSongRow[] = [];
  isImporting = false;
  progressText = '';

  private ctx: SongMapContext;

  constructor(
    private modalController: ModalController,
    private alertController: AlertController,
    public db: DbService,
  ) {}

  private buildContext(): SongMapContext {
    return {
      songCategories: this.db.songCategories(),
      additionalFields: this.db.tenant()?.song_additional_fields ?? [],
    };
  }

  private buildTargetOptions(): SongTargetOption[] {
    const opts: SongTargetOption[] = [
      { key: null,               label: translate('people.ignore') },
      { key: 'Nummer',           label: translate('songs.number') },
      { key: 'Präfix',           label: translate('songs.prefix') },
      { key: 'Name',             label: translate('songs.name') },
      { key: 'Chor & Orchester', label: translate('songs.choirOrchestra') },
      { key: 'Mit Solo',         label: translate('songs.withSolo') },
      { key: 'Link',             label: translate('songs.link') },
      { key: 'Schwierigkeit',    label: translate('songs.difficulty123') },
      { key: 'Kategorien',       label: translate('songs.categories') },
    ];
    for (const field of this.ctx.additionalFields ?? []) {
      opts.push({ key: `${EXTRA_PREFIX}${field.id}`, label: field.name });
    }
    return opts;
  }

  triggerFilePicker(input: HTMLInputElement) {
    input.click();
  }

  async onFileSelect(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.fileName = file.name;
    const loading = await Utils.getLoadingElement(10000, translate('people.readingFile'));
    await loading.present();

    try {
      const { utils } = await import('xlsx');
      const wb = await readSpreadsheetFile(file);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      if (!rows.length) {
        Utils.showToast(translate('people.fileEmpty'), 'warning');
        return;
      }

      this.rawRows = rows;
      this.fileHeaders = Object.keys(rows[0] ?? {});
      this.ctx = this.buildContext();
      this.targetOptions = this.buildTargetOptions();
      this.mapping = autoMapSongHeaders(this.fileHeaders, this.ctx);
      this.step = 'mapping';
    } catch (error) {
      console.error('Song import file read error:', error);
      Utils.showToast(translate('people.fileUnreadable'), 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  get canProceedFromMapping(): boolean {
    return mappingSongHasRequired(this.mapping);
  }

  async proceedToPreview() {
    if (!this.canProceedFromMapping) {
      Utils.showToast(translate('songs.mapNumberName'), 'warning');
      return;
    }

    const loading = await Utils.getLoadingElement(10000, translate('people.checkingData'));
    await loading.present();
    try {
      const mapped = mapSongRows(this.rawRows, this.mapping, this.ctx);
      const existingKeys = await this.db.getExistingNumbers();
      this.mappedRows = detectSongDuplicates(mapped, existingKeys);
      this.step = 'preview';
    } catch (error) {
      console.error('Song import preview error:', error);
      Utils.showToast(translate('people.previewFailed'), 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  backToMapping() {
    this.step = 'mapping';
  }

  get importableRows(): MappedSongRow[] {
    return this.mappedRows.filter(r => r.errors.length === 0 && !r.isDuplicate);
  }

  get errorCount(): number {
    return this.mappedRows.filter(r => r.errors.length > 0).length;
  }

  get duplicateCount(): number {
    return this.mappedRows.filter(r => r.isDuplicate && r.errors.length === 0).length;
  }

  get warningCount(): number {
    return this.mappedRows.filter(r => r.errors.length === 0 && !r.isDuplicate && r.warnings.length > 0).length;
  }

  rowStatus(row: MappedSongRow): 'error' | 'duplicate' | 'warning' | 'ok' {
    if (row.errors.length > 0) return 'error';
    if (row.isDuplicate) return 'duplicate';
    if (row.warnings.length > 0) return 'warning';
    return 'ok';
  }

  async startImport() {
    const toImport = this.importableRows.map(r => r.song);
    if (!toImport.length) {
      Utils.showToast(translate('songs.nothingToImport'), 'warning');
      return;
    }

    if (this.db.isDemo()) {
      Utils.showToast(translate('people.demoUnavailable'), 'warning');
      return;
    }

    this.isImporting = true;
    const loading = await Utils.getLoadingElement(0, translate('people.importProgress', { done: 0, total: toImport.length }));
    await loading.present();

    try {
      const { imported, failed } = await this.db.importSongs(toImport, {
        onProgress: (done, total) => {
          loading.message = translate('people.importProgress', { done, total });
        },
      });

      await loading.dismiss();

      const parts = [translate('songs.importedCount', { count: imported.length })];
      if (failed.length) {
        parts.push(translate('people.failedCount', { count: failed.length }));
      }
      Utils.showToast(parts.join(' '), failed.length ? 'warning' : 'success');

      if (failed.length) {
        await this.showFailureDetails(failed);
      }

      if (imported.length) {
        this.modalController.dismiss({ imported: true });
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Song import error:', error);
      Utils.showToast(error, 'danger');
    } finally {
      this.isImporting = false;
    }
  }

  private async showFailureDetails(failed: { song: Partial<Song>; reason: string }[]) {
    const list = failed
      .slice(0, 10)
      .map(f => `• ${f.song.prefix ?? ''}${f.song.number} ${f.song.name}: ${f.reason}`)
      .join('<br>');
    const more = failed.length > 10 ? '<br>' + translate('people.andMore', { count: failed.length - 10 }) : '';
    const alert = await this.alertController.create({
      header: translate('songs.notImported'),
      message: list + more,
      buttons: ['OK'],
    });
    await alert.present();
  }

  async downloadTemplate() {
    const additionalFields = this.db.tenant()?.song_additional_fields ?? [];
    const headers = buildSongImportTemplateHeaders(additionalFields);
    const example = ['42', 'W', 'Stille Nacht', 'ja', 'nein', '', '2', 'Weihnachten'];
    while (example.length < headers.length) {
      example.push('');
    }

    const { utils } = await import('xlsx');
    const ws = utils.aoa_to_sheet([headers, example]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Import');
    await Utils.saveWorkbook(wb, 'Werke_Import_Vorlage.xlsx');
  }

  dismiss() {
    this.modalController.dismiss();
  }
}
