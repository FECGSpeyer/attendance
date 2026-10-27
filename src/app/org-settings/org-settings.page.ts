import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { Organisation, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { LinkPersonsPage } from '../settings/general/link-persons/link-persons.page';
import { translate } from '@jsverse/transloco';

@Component({
  selector: 'app-org-settings',
  templateUrl: './org-settings.page.html',
  styleUrls: ['./org-settings.page.scss'],
  standalone: false,
})
export class OrgSettingsPage implements OnInit {
  public isSuperAdmin = false;
  public isAdmin = false;
  public linkedTenants: Tenant[] = [];
  public selectedSongSourceTenantId: number | null = null;

  constructor(
    public db: DbService,
    private alertController: AlertController,
    private modalController: ModalController,
  ) {}

  async ngOnInit() {
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.isAdmin = [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser().role);
    if (this.db.organisation()) {
      try {
        const all = await this.db.getLinkedTenants();
        this.linkedTenants = all.filter(t => t.id !== this.db.tenant().id);
      } catch { }
    }
    this.selectedSongSourceTenantId = this.db.tenant().song_source_tenant_id ?? null;
  }

  async openOrganisationAlert() {
    const organisations = await this.db.getOrganisationsFromUser();

    if (organisations.length) {
      const alert = await this.alertController.create({
        header: translate('org.select'),
        inputs: organisations.map((org: Organisation, index: number) => ({
          type: 'radio',
          checked: index === 0,
          label: org.name,
          value: org,
        })),
        buttons: [{
          text: translate('common.cancel'),
        }, {
          text: translate('org.choose'),
          handler: async (data: Organisation) => {
            if (data) {
              const loading = await Utils.getLoadingElement();
              loading.present();
              try {
                await this.db.linkTenantToOrganisation(this.db.tenant().id, data);
                Utils.showToast(translate('org.selected'), 'success');
                await loading.dismiss();
              } catch (error) {
                Utils.showToast(error.message, 'danger');
                await loading.dismiss();
              }
            } else {
              alert.message = translate('org.pleaseSelect');
              return false;
            }
          }
        }, {
          text: translate('org.createNew'),
          handler: async () => {
            alert.dismiss();
            this.openCreateOrganisationAlert();
          }
        }]
      });

      await alert.present();
      return;
    }

    this.openCreateOrganisationAlert();
  }

  async openCreateOrganisationAlert() {
    const alert = await this.alertController.create({
      header: translate('org.create'),
      inputs: [{
        type: 'text',
        name: 'name',
        placeholder: translate('org.namePh'),
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
              await this.db.createOrganisation(data.name);
              Utils.showToast(translate('org.created'), 'success');
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

  async renameOrg() {
    const org = this.db.organisation();
    if (!org) { return; }

    const alert = await this.alertController.create({
      header: translate('org.rename'),
      inputs: [{
        type: 'text',
        name: 'name',
        value: org.name,
        placeholder: translate('org.namePh'),
      }],
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('common.save'),
        handler: async (data: { name: string }) => {
          const name = data.name?.trim();
          if (!name) {
            alert.message = translate('org.validName');
            return false;
          }
          try {
            await this.db.updateOrgName(name);
            Utils.showToast(translate('org.renamed'), 'success');
          } catch {
            // toast shown in service
          }
        }
      }]
    });

    await alert.present();
  }

  async deleteOrganisation() {
    const org = this.db.organisation();
    if (!org) { return; }

    const alert = await this.alertController.create({
      header: translate('org.unlink'),
      message: translate('org.unlinkMessage', { name: org.name }),
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('org.unlinkButton'),
        role: 'destructive',
        handler: async () => {
          await this.db.unlinkTenantFromOrganisation(org.id);
          this.db.organisation.set(null);
          Utils.showToast(translate('org.unlinked'), 'success');
        }
      }]
    });

    await alert.present();
  }

  async openLinkPersons() {
    const modal = await this.modalController.create({
      component: LinkPersonsPage,
      breakpoints: [0, 0.5, 1],
      initialBreakpoint: 1,
      handleBehavior: 'none',
    });
    await modal.present();
  }

  async saveSongSync(newSourceId: number | null): Promise<void> {
    const currentSource = this.db.tenant().song_source_tenant_id;
    if (currentSource && !newSourceId) {
      const confirmed = await this.confirmDeactivation();
      if (!confirmed) {
        this.selectedSongSourceTenantId = currentSource;
        return;
      }
    }
    const loading = await Utils.getLoadingElement(999999, translate('generalSettings.saving'));
    await loading.present();
    try {
      await this.db.updateTenantData({ song_source_tenant_id: newSourceId ?? null });
      this.selectedSongSourceTenantId = newSourceId;
      Utils.showToast(translate('org.syncSaved'), 'success');
    } catch { }
    finally { await loading.dismiss(); }
  }

  private async confirmDeactivation(): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertController.create({
        header: translate('org.disableSync'),
        message: translate('org.disableSyncMessage'),
        buttons: [
          { text: translate('common.cancel'), role: 'cancel', handler: () => resolve(false) },
          { text: translate('org.disable'), role: 'destructive', handler: () => resolve(true) },
        ],
      });
      await alert.present();
    });
  }
}
