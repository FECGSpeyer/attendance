import { Component, OnInit } from '@angular/core';
import { IonRouterOutlet, ItemReorderEventDetail, ModalController, NavController } from '@ionic/angular/lazy';
import { DbService } from 'src/app/services/db.service';
import { TypePage } from 'src/app/settings/general/type/type.page';
import { AttendanceType } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

@Component({
    selector: 'app-types',
    templateUrl: './types.page.html',
    styleUrls: ['./types.page.scss'],
    standalone: false
})
export class TypesPage implements OnInit {
  public reorder = false;

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    private navController: NavController,
  ) { }

  ngOnInit() { }

  goBack(): void {
    this.navController.navigateBack('/tabs/settings/general');
  }

  async saveOrder() {
    const loading = await Utils.getLoadingElement(9999, translate('typeSettings.savingOrder'));
    await loading.present();

    const attendanceTypes = [...this.db.attendanceTypes()];

    for (let i = 0; i < attendanceTypes.length; i++) {
      const type: AttendanceType = attendanceTypes[i];
      type.index = i;
      await this.db.updateAttendanceType(type.id, type);
    }

    await loading.dismiss();
    await Utils.showToast(translate('typeSettings.orderSaved'), 'success');
    this.reorder = false;
  }

  async openTypeModal() {
    const modal = await this.modalController.create({
      component: TypePage,
      componentProps: {
        isNew: true,
      },
      presentingElement: this.routerOutlet.nativeEl,
    });
    await modal.present();
  }

  onReorderAttendanceTypes(event: CustomEvent<ItemReorderEventDetail>) {
    event.detail.complete(this.db.attendanceTypes());
  }

}
