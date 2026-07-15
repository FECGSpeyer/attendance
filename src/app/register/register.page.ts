import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
    selector: 'app-register',
    templateUrl: './register.page.html',
    styleUrls: ['./register.page.scss'],
    standalone: false
})
export class RegisterPage implements OnInit {
  public tenant: Tenant = {
    shortName: '',
    longName: '',
    maintainTeachers: false,
    withExcuses: true,
    type: 'general',
    betaProgram: true,
    showHolidays: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  public mainGroupName = '';
  public canDismiss = true;
  public namePlaceholder = 'z.B. Sportverein Musterstadt';
  public shortNamePlaceholder = 'z.B. SVM';
  public mainGroupPlaceholder = 'z.B. Vorstand';

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
  ) { }

  ngOnInit() {
    this.canDismiss = Boolean(this.db.tenantUser());
  }

  async createInstance() {
    if (!this.tenant.shortName || !this.tenant.longName || !this.mainGroupName) {
      Utils.showToast('Bitte füllen Sie alle Felder aus.', 'danger');
      return;
    }

    const loading = await Utils.getLoadingElement(9999, 'Instanz wird erstellt...');
    await loading.present();

    try {
      await this.db.createInstance(this.tenant, this.mainGroupName);
      if (this.canDismiss) {
        await this.modalController.dismiss();
      }
      await loading.dismiss();
    } catch (error) {
      Utils.showToast('Fehler beim Erstellen der Instanz: ' + error.message, 'danger');
      await loading.dismiss();
    }
  }

  onTypeChange() {
    if (this.tenant.type === 'general') {
      this.namePlaceholder = 'z.B. Sportverein Musterstadt';
      this.shortNamePlaceholder = 'z.B. SVM';
      this.mainGroupPlaceholder = 'z.B. Vorstand';
    } else if (this.tenant.type === 'choir') {
      this.namePlaceholder = 'z.B. Gospelchor Harmonie';
      this.shortNamePlaceholder = 'z.B. GCH';
      this.mainGroupPlaceholder = 'z.B. Chorleitung';
    } else if (this.tenant.type === 'orchestra') {
      this.namePlaceholder = 'z.B. Stadtorchester Musterstadt';
      this.shortNamePlaceholder = 'z.B. SOM';
      this.mainGroupPlaceholder = 'z.B. Dirigenten';
    }
  }

  getTypeLabel(): string {
    switch (this.tenant.type) {
      case 'general': return 'Allgemeine Gruppe';
      case 'choir': return 'Chor';
      case 'orchestra': return 'Orchester';
      default: return this.tenant.type;
    }
  }

  async close() {
    await this.modalController.dismiss();
  }

  /**
   * A freshly-confirmed user with no tenant lands on this page as a full page
   * (canDismiss === false). Without these actions they'd be stuck — unable to
   * leave, log out, or remove their account if they don't want to create an
   * instance. Both db methods sign out and navigate to /login themselves.
   */
  async logout() {
    await this.db.logout();
  }

  async confirmDeleteAccount() {
    const alert = await this.alertController.create({
      header: 'Konto wirklich löschen?',
      message: 'Dein Konto wird unwiderruflich entfernt. Diese Aktion kann nicht rückgängig gemacht werden.',
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Endgültig löschen',
          role: 'destructive',
          handler: async () => {
            const loading = await Utils.getLoadingElement(60000, 'Konto wird gelöscht...');
            await loading.present();
            try {
              await this.db.deleteAccount();
              await loading.dismiss();
              Utils.showToast('Dein Konto wurde gelöscht.', 'success', 4000);
            } catch (error: any) {
              await loading.dismiss();
              Utils.showToast(`Fehler beim Löschen: ${error?.message || 'Unbekannt'}`, 'danger', 5000);
            }
          }
        }
      ]
    });
    await alert.present();
  }

}
