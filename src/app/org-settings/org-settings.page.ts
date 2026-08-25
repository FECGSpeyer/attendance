import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { Organisation } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { LinkPersonsPage } from '../settings/general/link-persons/link-persons.page';

@Component({
  selector: 'app-org-settings',
  templateUrl: './org-settings.page.html',
  styleUrls: ['./org-settings.page.scss'],
  standalone: false,
})
export class OrgSettingsPage implements OnInit {
  public isSuperAdmin = false;
  public isAdmin = false;

  constructor(
    public db: DbService,
    private alertController: AlertController,
    private modalController: ModalController,
  ) {}

  ngOnInit() {
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.isAdmin = [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser().role);
  }

  async openOrganisationAlert() {
    const organisations = await this.db.getOrganisationsFromUser();

    if (organisations.length) {
      const alert = await this.alertController.create({
        header: 'Organisation auswählen',
        inputs: organisations.map((org: Organisation, index: number) => ({
          type: 'radio',
          checked: index === 0,
          label: org.name,
          value: org,
        })),
        buttons: [{
          text: 'Abbrechen',
        }, {
          text: 'Auswählen',
          handler: async (data: Organisation) => {
            if (data) {
              const loading = await Utils.getLoadingElement();
              loading.present();
              try {
                await this.db.linkTenantToOrganisation(this.db.tenant().id, data);
                Utils.showToast('Die Organisation wurde erfolgreich ausgewählt.', 'success');
                await loading.dismiss();
              } catch (error) {
                Utils.showToast(error.message, 'danger');
                await loading.dismiss();
              }
            } else {
              alert.message = 'Bitte wähle eine Organisation aus.';
              return false;
            }
          }
        }, {
          text: 'Neue Organisation erstellen',
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
      header: 'Organisation erstellen',
      inputs: [{
        type: 'text',
        name: 'name',
        placeholder: 'Name eingeben...',
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
              await this.db.createOrganisation(data.name);
              Utils.showToast('Die Organisation wurde erfolgreich erstellt.', 'success');
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

  async renameOrg() {
    const org = this.db.organisation();
    if (!org) { return; }

    const alert = await this.alertController.create({
      header: 'Organisation umbenennen',
      inputs: [{
        type: 'text',
        name: 'name',
        value: org.name,
        placeholder: 'Name eingeben...',
      }],
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Speichern',
        handler: async (data: { name: string }) => {
          const name = data.name?.trim();
          if (!name) {
            alert.message = 'Bitte gib einen gültigen Namen ein.';
            return false;
          }
          try {
            await this.db.updateOrgName(name);
            Utils.showToast('Organisation umbenannt', 'success');
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
      header: 'Organisation von Instanz trennen?',
      message: `Möchtest du die Organisation '${org.name}' wirklich von der Instanz trennen?`,
      buttons: [{
        text: 'Abbrechen'
      }, {
        text: 'Trennen',
        role: 'destructive',
        handler: async () => {
          await this.db.unlinkTenantFromOrganisation(org.id);
          this.db.organisation.set(null);
          Utils.showToast('Die Organisation wurde erfolgreich von der Instanz getrennt.', 'success');
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
}
