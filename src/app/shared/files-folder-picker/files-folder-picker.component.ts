import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, IonModal } from '@ionic/angular/lazy';
import { FilesService, StorageEntry } from 'src/app/services/files/files.service';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Auswahl eines Ordners der Dateiablage (z. B. Aufnahmen eines Termins).
 * Navigiert durch die Ordnerstruktur und gibt den relativen Pfad zurück.
 */
@Component({
  selector: 'app-files-folder-picker',
  standalone: true,
  imports: [CommonModule, IonicModule, TranslocoModule],
  templateUrl: './files-folder-picker.component.html',
})
export class FilesFolderPickerComponent {
  @Input() tenantId: number;

  @Output() folderSelect = new EventEmitter<string>();

  @ViewChild('modal') private modal: IonModal;

  currentPath = '';
  folders: StorageEntry[] = [];
  isLoading = false;

  constructor(private filesSvc: FilesService) {}

  get pathSegments(): string[] {
    return this.currentPath.split('/').filter(Boolean);
  }

  async open(initialPath: string = ''): Promise<void> {
    await this.modal.present();
    await this.navigate(initialPath || '');
  }

  async navigate(path: string): Promise<void> {
    this.isLoading = true;
    try {
      const entries = await this.filesSvc.listEntries(this.tenantId, path);
      this.currentPath = path;
      this.folders = entries.filter((entry) => entry.isFolder);
    } catch (error: any) {
      if (path) {
        // Ordner existiert evtl. nicht mehr – zurück zum Hauptordner.
        await this.navigate('');
        return;
      }
      Utils.showToast(translate('folderPicker.loadFailed', { error: error.message || error }), 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  async goUp(): Promise<void> {
    await this.navigate(this.pathSegments.slice(0, -1).join('/'));
  }

  async goToSegment(index: number): Promise<void> {
    await this.navigate(this.pathSegments.slice(0, index + 1).join('/'));
  }

  onSelect(path: string = this.currentPath): void {
    if (!path) {
      return;
    }
    this.folderSelect.emit(path);
    this.modal.dismiss();
  }

  dismiss(): void {
    this.modal.dismiss();
  }
}
