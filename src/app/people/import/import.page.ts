import { Component } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { ExtraField, Group } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { readSpreadsheetFile } from 'src/app/utilities/spreadsheet-reader';
import {
  autoMapHeaders,
  buildImportTemplateHeaders,
  ColumnMapping,
  detectDuplicates,
  FieldKey,
  MapContext,
  mappingHasName,
  MappedRow,
  mapRows,
  EXTRA_PREFIX,
} from 'src/app/utilities/import-mapper';
import { translate } from '@jsverse/transloco';

interface TargetOption {
  key: FieldKey | null;
  label: string;
}

@Component({
  selector: 'app-import',
  templateUrl: './import.page.html',
  styleUrls: ['./import.page.scss'],
  standalone: false
})
export class ImportPage {
  /** 'file' -> pick a file, 'mapping' -> assign columns, 'preview' -> confirm. */
  step: 'file' | 'mapping' | 'preview' = 'file';

  fileName = '';
  fileHeaders: string[] = [];
  rawRows: Record<string, any>[] = [];

  /** file column header -> target field (null = ignore). */
  mapping: ColumnMapping = {};
  targetOptions: TargetOption[] = [];

  mappedRows: MappedRow[] = [];
  createAccounts = false;
  isImporting = false;
  progressText = '';

  private ctx: MapContext;

  constructor(
    private modalController: ModalController,
    private alertController: AlertController,
    public db: DbService,
  ) {}

  private buildContext(): MapContext {
    return {
      groups: this.db.groups(),
      mainGroupId: this.db.getMainGroup()?.id,
      additionalFields: this.db.getPersonExtraFields(),
    };
  }

  private buildTargetOptions(): TargetOption[] {
    const opts: TargetOption[] = [
      { key: null, label: translate('people.ignore') },
      { key: 'Vorname', label: translate('people.firstName') },
      { key: 'Nachname', label: translate('people.lastName') },
      { key: 'Name', label: translate('people.fullName') },
      { key: 'Geburtsdatum', label: translate('people.birthday') },
      { key: 'Gruppe', label: translate('people.group') },
      { key: 'E-Mail', label: translate('people.email') },
      { key: 'Telefon', label: translate('people.phone') },
      { key: 'Eingetreten', label: translate('people.joined') },
      { key: 'Notizen', label: translate('people.notes') },
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
    input.value = ''; // allow re-selecting the same file
    if (!file) {
      return;
    }

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
      this.mapping = autoMapHeaders(this.fileHeaders, this.ctx);
      this.step = 'mapping';
    } catch (error) {
      console.error('Import file read error:', error);
      Utils.showToast(translate('people.fileUnreadable'), 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  get canProceedFromMapping(): boolean {
    return mappingHasName(this.mapping);
  }

  async proceedToPreview() {
    if (!this.canProceedFromMapping) {
      Utils.showToast(translate('people.mapNames'), 'warning');
      return;
    }

    const loading = await Utils.getLoadingElement(10000, translate('people.checkingData'));
    await loading.present();
    try {
      const mapped = mapRows(this.rawRows, this.mapping, this.ctx);
      const existingEmails = await this.db.getExistingEmails();
      this.mappedRows = detectDuplicates(mapped, existingEmails);
      this.step = 'preview';
    } catch (error) {
      console.error('Import preview error:', error);
      Utils.showToast(translate('people.previewFailed'), 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  backToMapping() {
    this.step = 'mapping';
  }

  /** Rows that will actually be imported: no hard errors, not a duplicate. */
  get importableRows(): MappedRow[] {
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

  rowStatus(row: MappedRow): 'error' | 'duplicate' | 'warning' | 'ok' {
    if (row.errors.length > 0) { return 'error'; }
    if (row.isDuplicate) { return 'duplicate'; }
    if (row.warnings.length > 0) { return 'warning'; }
    return 'ok';
  }

  groupName(id: number | null): string {
    return this.db.groups().find((g: Group) => g.id === id)?.name ?? '';
  }

  /** Groups selectable per row in the preview. */
  get groupOptions(): Group[] {
    return this.db.groups();
  }

  /**
   * Rows whose group name from the file couldn't be matched. These default to
   * the main group but should be reviewed/adjusted by the user.
   */
  get unresolvedGroupCount(): number {
    return this.mappedRows.filter(r => !r.groupResolved).length;
  }

  /** Once the user picks a group, the row is considered resolved. */
  onRowGroupChange(row: MappedRow) {
    row.groupResolved = true;
  }

  async startImport() {
    const toImport = this.importableRows.map(r => r.player);
    if (!toImport.length) {
      Utils.showToast(translate('people.nothingToImport'), 'warning');
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
      const { imported, failed } = await this.db.importPlayers(toImport, {
        createAccounts: this.createAccounts,
        onProgress: (done, total) => {
          loading.message = translate('people.importProgress', { done, total });
        },
      });

      await loading.dismiss();

      const parts = [translate('people.importedCount', { count: imported.length })];
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
      console.error('Import error:', error);
      Utils.showToast(error, 'danger');
    } finally {
      this.isImporting = false;
    }
  }

  private async showFailureDetails(failed: { player: any; reason: string }[]) {
    const list = failed
      .slice(0, 10)
      .map(f => `• ${f.player.firstName} ${f.player.lastName}: ${f.reason}`)
      .join('<br>');
    const more = failed.length > 10 ? '<br>' + translate('people.andMore', { count: failed.length - 10 }) : '';
    const alert = await this.alertController.create({
      header: translate('people.notImported'),
      message: list + more,
      buttons: ['OK'],
    });
    await alert.present();
  }

  async downloadTemplate() {
    const additionalFields: ExtraField[] = this.db.getPersonExtraFields();
    const headers = buildImportTemplateHeaders(additionalFields);
    const example = ['Anna', 'Müller', '15.03.1990', this.db.groups()?.[0]?.name ?? '', 'anna@example.com', '0170 1234567', '01.01.2024', ''];
    // Pad the example row to match any additional-field columns.
    while (example.length < headers.length) {
      example.push('');
    }

    const { utils } = await import('xlsx');
    const ws = utils.aoa_to_sheet([headers, example]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Import');
    await Utils.saveWorkbook(wb, 'Personen_Import_Vorlage.xlsx');
  }

  dismiss() {
    this.modalController.dismiss();
  }
}
