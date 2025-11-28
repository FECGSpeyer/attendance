import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
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
  };
  public mainGroupName: string = '';
  public canDismiss: boolean = true;
  public namePlaceholder: string = 'z.B. Gruppe 1';
  public shortNamePlaceholder: string = 'z.B. G1';
  public mainGroupPlaceholder: string = 'z.B. Verantwortliche, Dirigenten, etc.';

  constructor(
    private db: DbService,
    private modalController: ModalController,
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

  async onTypeChange() {
    if (this.tenant.type === 'general') {
      this.namePlaceholder = 'z.B. Gruppe 1';
      this.shortNamePlaceholder = 'z.B. G1';
      this.mainGroupPlaceholder = 'z.B. Verantwortliche, Leiter, etc.';
    } else if (this.tenant.type === 'choir') {
      this.namePlaceholder = 'z.B. Jugendchor';
      this.shortNamePlaceholder = 'z.B. JC';
      this.mainGroupPlaceholder = 'z.B. Jugendchorleitung, Dirigenten, etc.';
    } else if (this.tenant.type === 'orchestra') {
      this.namePlaceholder = 'z.B. Sinfonieorchester';
      this.shortNamePlaceholder = 'z.B. SO';
      this.mainGroupPlaceholder = 'z.B. Orchesterleitung, Dirigenten, etc.';
    }
  }

  async close() {
    await this.modalController.dismiss();
  }

}
