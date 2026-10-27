import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

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
  public namePlaceholder = translate('register.placeholder.generalName');
  public shortNamePlaceholder = translate('register.placeholder.generalShort');
  public mainGroupPlaceholder = translate('register.placeholder.generalMain');

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
      Utils.showToast(translate('register.fillAllToast'), 'danger');
      return;
    }

    const loading = await Utils.getLoadingElement(9999, translate('register.creating'));
    await loading.present();

    try {
      await this.db.createInstance(this.tenant, this.mainGroupName);
      if (this.canDismiss) {
        await this.modalController.dismiss();
      }
      await loading.dismiss();
    } catch (error) {
      Utils.showToast(translate('register.createFailed', { error: error.message }), 'danger');
      await loading.dismiss();
    }
  }

  onTypeChange() {
    if (this.tenant.type === 'general') {
      this.namePlaceholder = translate('register.placeholder.generalName');
      this.shortNamePlaceholder = translate('register.placeholder.generalShort');
      this.mainGroupPlaceholder = translate('register.placeholder.generalMain');
    } else if (this.tenant.type === 'choir') {
      this.namePlaceholder = translate('register.placeholder.choirName');
      this.shortNamePlaceholder = translate('register.placeholder.choirShort');
      this.mainGroupPlaceholder = translate('register.placeholder.choirMain');
    } else if (this.tenant.type === 'orchestra') {
      this.namePlaceholder = translate('register.placeholder.orchestraName');
      this.shortNamePlaceholder = translate('register.placeholder.orchestraShort');
      this.mainGroupPlaceholder = translate('register.placeholder.orchestraMain');
    }
  }

  getTypeLabel(): string {
    switch (this.tenant.type) {
      case 'general': return translate('register.typeGeneral');
      case 'choir': return translate('register.typeChoir');
      case 'orchestra': return translate('register.typeOrchestra');
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
      header: translate('register.delete.header'),
      message: translate('register.delete.message'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('register.delete.confirm'),
          role: 'destructive',
          handler: async () => {
            const loading = await Utils.getLoadingElement(60000, translate('register.delete.running'));
            await loading.present();
            try {
              await this.db.deleteAccount();
              await loading.dismiss();
              Utils.showToast(translate('register.delete.done'), 'success', 4000);
            } catch (error: any) {
              await loading.dismiss();
              Utils.showToast(translate('register.delete.failed', { error: error?.message || translate('common.unknown') }), 'danger', 5000);
            }
          }
        }
      ]
    });
    await alert.present();
  }

}
