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
    type: 'orchestra',
    betaProgram: true,
  };
  public mainGroupName: string = '';

  constructor(
    private db: DbService,
    private modalController: ModalController,
  ) { }

  ngOnInit() {
  }

  async createInstance() {
    if (!this.tenant.shortName || !this.tenant.longName || !this.mainGroupName) {
      Utils.showToast('Bitte füllen Sie alle Felder aus.', 'danger');
      return;
    }

    await this.db.createInstance(this.tenant, this.mainGroupName);
    await this.modalController.dismiss();
  }

  async close() {
    await this.modalController.dismiss();
  }

}
