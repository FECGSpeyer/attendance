import { Component, OnInit } from '@angular/core';
import { IonRouterOutlet, ItemReorderEventDetail, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { TypePage } from 'src/app/settings/general/type/type.page';
import { AttendanceType } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-types',
  templateUrl: './types.page.html',
  styleUrls: ['./types.page.scss'],
})
export class TypesPage implements OnInit {
  public reorder: boolean = false;

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
  ) { }

  ngOnInit() { }

  async saveOrder() {
    const loading = await Utils.getLoadingElement(9999, 'Speichere Reihenfolge...');
    await loading.present();

    const attendanceTypes = [...this.db.attendanceTypes()];

    for (let i = 0; i < attendanceTypes.length; i++) {
      const type: AttendanceType = attendanceTypes[i];
      type.index = i;
      await this.db.updateAttendanceType(type.id, type);
    }

    await loading.dismiss();
    await Utils.showToast('Reihenfolge gespeichert', 'success');
    this.reorder = false;
  }

  async openTypeModal() {
    const modal = await this.modalController.create({
      component: TypePage,
      componentProps: {
        isNew: true,
      },
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      presentingElement: this.routerOutlet.nativeEl,
    });
    await modal.present();
  }

  onReorderAttendanceTypes(event: CustomEvent<ItemReorderEventDetail>) {
    event.detail.complete(this.db.attendanceTypes());
  }

}
