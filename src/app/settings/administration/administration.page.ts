import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular/lazy';
import { DbService } from '../../services/db.service';
import { Church } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

// Administration: nur für den Super-Developer (SuperDeveloperGuard).
// Sammelt instanzübergreifende Schalter und Werkzeuge wie das Usage Dashboard.
@Component({
  selector: 'app-administration',
  templateUrl: './administration.page.html',
  standalone: false,
})
export class AdministrationPage implements OnInit {
  public filesEnabled = false;
  public filesShared = false;
  public isSaving = false;
  public churches: Church[] = [];
  public duplicateGroups: { target: Church; duplicates: Church[] }[] = [];

  constructor(
    public db: DbService,
    private alertController: AlertController,
  ) {}

  async ngOnInit() {
    this.filesEnabled = this.db.tenant()?.files_enabled || false;
    this.filesShared = this.db.tenant()?.files_shared || false;
    this.churches = await this.db.getChurches();
    this.findDuplicates();
  }

  async saveFiles() {
    if (this.isSaving) { return; }
    this.isSaving = true;
    try {
      // DB-Trigger erlaubt die Änderung nur developer@attendix.de.
      await this.db.updateTenantData({
        files_enabled: this.filesEnabled,
        files_shared: this.filesEnabled ? this.filesShared : false,
      });
      this.filesShared = this.db.tenant()?.files_shared || false;
      Utils.showToast('Dateiablage gespeichert', 'success');
    } catch {
      this.filesEnabled = this.db.tenant()?.files_enabled || false;
      this.filesShared = this.db.tenant()?.files_shared || false;
    } finally {
      this.isSaving = false;
    }
  }

  async openChurchInput() {
    const alert = await this.alertController.create({
      header: 'Gemeinde hinzufügen',
      inputs: [{
        type: 'text',
        name: 'name',
        placeholder: 'Name der Gemeinde',
      }],
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Hinzufügen',
        handler: async (data: { name: string }) => {
          if (data.name.length) {
            const loading = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createChurch(data.name);
              Utils.showToast('Die Gemeinde wurde erfolgreich hinzugefügt.', 'success');
              this.churches = await this.db.getChurches();
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, 'danger');
              await loading.dismiss();
            }
          } else {
            alert.message = 'Bitte gib gültige Werte ein.';
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
      header: 'Gemeinden zusammenführen',
      message: `"${duplicate.name}" wird in "${target.name}" zusammengeführt. Alle Personen werden aktualisiert. Fortfahren?`,
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Zusammenführen',
        role: 'destructive',
        handler: async () => {
          const loading = await Utils.getLoadingElement(999999, 'Gemeinden werden zusammengeführt...');
          await loading.present();
          try {
            const count = await this.db.mergeChurches(target.id, duplicate.id);
            this.churches = await this.db.getChurches();
            this.findDuplicates();
            await loading.dismiss();
            Utils.showToast(`Zusammengeführt: ${count} Person(en) aktualisiert`, 'success');
          } catch (error) {
            await loading.dismiss();
            Utils.showToast('Fehler beim Zusammenführen', 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async mergeAllDuplicates() {
    const total = this.duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0);
    const alert = await this.alertController.create({
      header: 'Alle Duplikate zusammenführen',
      message: `${total} Duplikat(e) in ${this.duplicateGroups.length} Gruppe(n) werden zusammengeführt. Fortfahren?`,
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Alle zusammenführen',
        role: 'destructive',
        handler: async () => {
          const loading = await Utils.getLoadingElement(999999, 'Gemeinden werden zusammengeführt...');
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
            Utils.showToast(`${totalUpdated} Person(en) aktualisiert, ${total} Duplikat(e) entfernt`, 'success');
          } catch (error) {
            await loading.dismiss();
            Utils.showToast('Fehler beim Zusammenführen', 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async renameChurch(church: Church) {
    const alert = await this.alertController.create({
      header: 'Gemeinde umbenennen',
      inputs: [{
        type: 'text',
        name: 'name',
        value: church.name,
        placeholder: 'Name der Gemeinde',
      }],
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Speichern',
        handler: async (data) => {
          const name = data.name?.trim();
          if (!name) {return;}
          try {
            await this.db.renameChurch(church.id, name);
            this.churches = await this.db.getChurches();
            this.findDuplicates();
            Utils.showToast('Gemeinde umbenannt', 'success');
          } catch {
            Utils.showToast('Fehler beim Umbenennen', 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async mergeChurchManual(source: Church) {
    const targets = this.churches.filter(c => c.id !== source.id);
    const alert = await this.alertController.create({
      header: `"${source.name}" zusammenführen mit...`,
      inputs: targets.map((c, i) => ({
        type: 'radio' as const,
        label: c.name,
        value: c.id,
        checked: i === 0,
      })),
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Zusammenführen',
        handler: async (targetId: string) => {
          if (!targetId) {return;}
          const target = this.churches.find(c => c.id === targetId);
          const confirmAlert = await this.alertController.create({
            header: 'Bestätigen',
            message: `"${source.name}" wird gelöscht und alle Personen zu "${target.name}" verschoben. Fortfahren?`,
            buttons: [{
              text: 'Abbrechen',
            }, {
              text: 'Zusammenführen',
              role: 'destructive',
              handler: async () => {
                const loading = await Utils.getLoadingElement(999999, 'Gemeinden werden zusammengeführt...');
                await loading.present();
                try {
                  const count = await this.db.mergeChurches(targetId, source.id);
                  this.churches = await this.db.getChurches();
                  this.findDuplicates();
                  await loading.dismiss();
                  Utils.showToast(`Zusammengeführt: ${count} Person(en) aktualisiert`, 'success');
                } catch (error) {
                  await loading.dismiss();
                  Utils.showToast('Fehler beim Zusammenführen', 'danger');
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
