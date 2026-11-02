import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonicModule, ModalController } from '@ionic/angular/lazy';
import { TranslocoModule, translate } from '@jsverse/transloco';
import { FilesService, StorageEntry } from 'src/app/services/files/files.service';
import { Utils } from 'src/app/utilities/Utils';
import { ancestorFilePaths, canMoveInto, isBlockedTarget, isCurrentLocation, normalizeFilePath } from 'src/app/utilities/file-move';

interface FolderNode {
  name: string;
  path: string;
  depth: number;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  children: FolderNode[];
}

export interface FilesMoveResult {
  target: string;
}

/**
 * Zielauswahl beim Verschieben in der Dateiablage: zeigt die Ordnerstruktur
 * als aufklappbaren Baum. Gibt beim Bestätigen `{ target }` zurück.
 */
@Component({
  selector: 'app-files-move-modal',
  standalone: true,
  imports: [CommonModule, IonicModule, TranslocoModule],
  templateUrl: './files-move-modal.component.html',
  styleUrls: ['./files-move-modal.component.scss'],
})
export class FilesMoveModalComponent implements OnInit {
  @Input() tenantId!: number;
  @Input() items: StorageEntry[] = [];
  /** Ordner, aus dem verschoben wird – wird beim Öffnen aufgeklappt. */
  @Input() currentPath = '';

  root: FolderNode = this.createNode('', '', 0);
  visibleNodes: FolderNode[] = [];
  selectedPath: string | null = null;

  constructor(
    private filesSvc: FilesService,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
  ) {}

  async ngOnInit(): Promise<void> {
    // Pfad bis zum aktuellen Ordner aufklappen, damit man sieht, wo man gerade ist.
    const chain = ancestorFilePaths(this.currentPath);
    let node: FolderNode | undefined = this.root;
    for (let index = 0; node && index < chain.length; index++) {
      node.expanded = true;
      await this.loadChildren(node);
      node = node.children.find((child) => child.path === chain[index + 1]);
    }
    this.refreshVisible();
  }

  get rootLabel(): string {
    return translate('filesMove.root');
  }

  get selectedLabel(): string {
    if (this.selectedPath === null) {
      return '';
    }
    const segments = normalizeFilePath(this.selectedPath).split('/').filter(Boolean);
    return [this.rootLabel, ...segments].join(' / ');
  }

  get canConfirm(): boolean {
    return this.selectedPath !== null && canMoveInto(this.selectedPath, this.items);
  }

  isBlocked(node: FolderNode): boolean {
    return isBlockedTarget(node.path, this.items);
  }

  isCurrent(node: FolderNode): boolean {
    return isCurrentLocation(node.path, this.items);
  }

  isMovedItem(node: FolderNode): boolean {
    return this.items.some((item) => item.isFolder && normalizeFilePath(item.path) === node.path);
  }

  select(node: FolderNode): void {
    if (this.isBlocked(node)) {
      return;
    }
    this.selectedPath = node.path;
  }

  async toggle(node: FolderNode, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (this.isBlocked(node)) {
      return;
    }
    node.expanded = !node.expanded;
    if (node.expanded) {
      await this.loadChildren(node);
    }
    this.refreshVisible();
  }

  async createFolder(): Promise<void> {
    const parentPath = this.selectedPath ?? this.currentPath;
    const parent = this.findNode(parentPath) ?? this.root;

    const alert = await this.alertCtrl.create({
      header: translate('files.createFolder'),
      inputs: [{ type: 'text', name: 'name', placeholder: translate('files.folderName') }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('files.create'),
          handler: async (data: { name: string }) => {
            if (!data?.name?.trim()) {
              return false;
            }
            try {
              const before = new Set(parent.children.map((child) => child.path));
              await this.filesSvc.createFolder(this.tenantId, parent.path, data.name);
              parent.loaded = false;
              parent.expanded = true;
              await this.loadChildren(parent);
              const created = parent.children.find((child) => !before.has(child.path));
              if (created) {
                this.selectedPath = created.path;
              }
              this.refreshVisible();
            } catch (error: any) {
              Utils.showToast(translate('files.folderFailed', { error: error.message || error }), 'danger');
            }
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  confirm(): void {
    if (!this.canConfirm || this.selectedPath === null) {
      return;
    }
    const result: FilesMoveResult = { target: this.selectedPath };
    this.modalCtrl.dismiss(result, 'confirm');
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  private createNode(name: string, path: string, depth: number): FolderNode {
    return { name, path, depth, expanded: false, loaded: false, loading: false, children: [] };
  }

  private async loadChildren(node: FolderNode): Promise<void> {
    if (node.loaded || node.loading) {
      return;
    }
    node.loading = true;
    this.refreshVisible();
    try {
      const entries = await this.filesSvc.listEntries(this.tenantId, node.path);
      node.children = entries
        .filter((entry) => entry.isFolder)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => this.createNode(entry.name, normalizeFilePath(entry.path), node.depth + 1));
      node.loaded = true;
    } catch (error: any) {
      Utils.showToast(translate('folderPicker.loadFailed', { error: error.message || error }), 'danger');
    } finally {
      node.loading = false;
    }
  }

  private findNode(path: string, node: FolderNode = this.root): FolderNode | undefined {
    if (node.path === normalizeFilePath(path)) {
      return node;
    }
    for (const child of node.children) {
      const found = this.findNode(path, child);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private refreshVisible(): void {
    const result: FolderNode[] = [];
    const walk = (node: FolderNode) => {
      result.push(node);
      if (node.expanded) {
        node.children.forEach(walk);
      }
    };
    walk(this.root);
    this.visibleNodes = result;
  }
}
