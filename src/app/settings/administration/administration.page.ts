import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular/lazy';
import { DbService } from '../../services/db.service';
import { FilesService } from '../../services/files/files.service';
import { Church } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { translate } from '@jsverse/transloco';

const GB = 1024 * 1024 * 1024;

// Administration: nur für den Super-Developer (SuperDeveloperGuard).
// Sammelt Schalter je Instanz und Werkzeuge wie das Usage Dashboard.
@Component({
  selector: 'app-administration',
  templateUrl: './administration.page.html',
  standalone: false,
})
export class AdministrationPage implements OnInit {
  public isSaving = false;
  public filesMaxGb: number | null = null;
  public usedGb: number | null = null;
  public churches: Church[] = [];
  public duplicateGroups: { target: Church; duplicates: Church[] }[] = [];

  constructor(
    public db: DbService,
    private filesSvc: FilesService,
    private alertController: AlertController,
  ) {}

  async ngOnInit() {
    this.filesMaxGb = this.toGb(this.db.tenant()?.files_max_bytes);
    this.filesSvc.getUsedBytes(this.db.tenant().id)
      .then((bytes) => this.usedGb = this.toGb(bytes))
      .catch(() => this.usedGb = null);
    this.churches = await this.db.getChurches();
    this.findDuplicates();
  }

  private toGb(bytes?: number | null): number | null {
    return bytes === null || bytes === undefined ? null : Math.round(bytes / GB * 100) / 100;
  }

  // Leeres Feld = unbegrenzt.
  async saveFilesLimit() {
    const raw = this.filesMaxGb as unknown;
    const gb = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (gb !== null && (!Number.isFinite(gb) || gb <= 0)) {
      Utils.showToast(translate('admin.invalidLimit'), 'warning');
      return;
    }

    const bytes = gb === null ? null : Math.round(gb * GB);
    if (bytes === (this.db.tenant()?.files_max_bytes ?? null)) { return; }

    this.isSaving = true;
    try {
      await this.db.updateTenantData({ files_max_bytes: bytes });
      Utils.showToast(bytes === null ? translate('admin.storageUnlimited') : translate('admin.storageLimit', { gb }), 'success');
    } catch {
      this.filesMaxGb = this.toGb(this.db.tenant()?.files_max_bytes);
    } finally {
      this.isSaving = false;
    }
  }

  async openChurchInput() {
    const alert = await this.alertController.create({
      header: translate('admin.addChurch'),
      inputs: [{
        type: 'text',
        name: 'name',
        placeholder: translate('admin.churchName'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('attendance.add'),
        handler: async (data: { name: string }) => {
          if (data.name.length) {
            const loading = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createChurch(data.name);
              Utils.showToast(translate('admin.churchAdded'), 'success');
              this.churches = await this.db.getChurches();
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, 'danger');
              await loading.dismiss();
            }
          } else {
            alert.message = translate('admin.invalidValues');
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  findDuplicates() {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
    const groups = new Map<string, Church[]>();

    for (const church of this.churches) {
      const key = normalize(church.name);
      if (!groups.has(key)) {groups.set(key, []);}
      groups.get(key).push(church);
    }

    this.duplicateGroups = [];
    for (const [, group] of groups) {
      if (group.length > 1) {
        this.duplicateGroups.push({
          target: group[0],
          duplicates: group.slice(1),
        });
      }
    }
  }

  async mergeChurch(target: Church, duplicate: Church) {
    const alert = await this.alertController.create({
      header: translate('admin.mergeChurches'),
      message: translate('admin.mergeMessage', { source: duplicate.name, target: target.name }),
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('admin.merge'),
        role: 'destructive',
        handler: async () => {
          const loading = await Utils.getLoadingElement(999999, translate('admin.merging'));
          await loading.present();
          try {
            const count = await this.db.mergeChurches(target.id, duplicate.id);
            this.churches = await this.db.getChurches();
            this.findDuplicates();
            await loading.dismiss();
            Utils.showToast(translate('admin.merged', { count }), 'success');
          } catch (error) {
            await loading.dismiss();
            Utils.showToast(translate('admin.mergeFailed'), 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async mergeAllDuplicates() {
    const total = this.duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0);
    const alert = await this.alertController.create({
      header: translate('admin.mergeAllDuplicates'),
      message: translate('admin.mergeAllMessage', { total, groups: this.duplicateGroups.length }),
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('admin.mergeAll'),
        role: 'destructive',
        handler: async () => {
          const loading = await Utils.getLoadingElement(999999, translate('admin.merging'));
          await loading.present();
          try {
            let totalUpdated = 0;
            for (const group of [...this.duplicateGroups]) {
              for (const dup of group.duplicates) {
                totalUpdated += await this.db.mergeChurches(group.target.id, dup.id);
              }
            }
            this.churches = await this.db.getChurches();
            this.findDuplicates();
            await loading.dismiss();
            Utils.showToast(translate('admin.mergedAll', { updated: totalUpdated, total }), 'success');
          } catch (error) {
            await loading.dismiss();
            Utils.showToast(translate('admin.mergeFailed'), 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async renameChurch(church: Church) {
    const alert = await this.alertController.create({
      header: translate('admin.renameChurch'),
      inputs: [{
        type: 'text',
        name: 'name',
        value: church.name,
        placeholder: translate('admin.churchName'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('common.save'),
        handler: async (data) => {
          const name = data.name?.trim();
          if (!name) {return;}
          try {
            await this.db.renameChurch(church.id, name);
            this.churches = await this.db.getChurches();
            this.findDuplicates();
            Utils.showToast(translate('admin.churchRenamed'), 'success');
          } catch {
            Utils.showToast(translate('admin.renameFailed'), 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async mergeChurchManual(source: Church) {
    const targets = this.churches.filter(c => c.id !== source.id);
    const alert = await this.alertController.create({
      header: translate('admin.mergeWith', { name: source.name }),
      inputs: targets.map((c, i) => ({
        type: 'radio' as const,
        label: c.name,
        value: c.id,
        checked: i === 0,
      })),
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('admin.merge'),
        handler: async (targetId: string) => {
          if (!targetId) {return;}
          const target = this.churches.find(c => c.id === targetId);
          const confirmAlert = await this.alertController.create({
            header: translate('common.confirm'),
            message: translate('admin.mergeMoveMessage', { source: source.name, target: target.name }),
            buttons: [{
              text: translate('common.cancel'),
            }, {
              text: translate('admin.merge'),
              role: 'destructive',
              handler: async () => {
                const loading = await Utils.getLoadingElement(999999, translate('admin.merging'));
                await loading.present();
                try {
                  const count = await this.db.mergeChurches(targetId, source.id);
                  this.churches = await this.db.getChurches();
                  this.findDuplicates();
                  await loading.dismiss();
                  Utils.showToast(translate('admin.merged', { count }), 'success');
                } catch (error) {
                  await loading.dismiss();
                  Utils.showToast(translate('admin.mergeFailed'), 'danger');
                }
              }
            }]
          });
          await confirmAlert.present();
        }
      }]
    });
    await alert.present();
  }
}
