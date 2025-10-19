import { Component, OnInit } from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { TypePage } from 'src/app/settings/general/type/type.page';
import { AttendanceType } from 'src/app/utilities/interfaces';

@Component({
  selector: 'app-types',
  templateUrl: './types.page.html',
  styleUrls: ['./types.page.scss'],
})
export class TypesPage implements OnInit {
  public attendanceTypes: AttendanceType[] = [];
  public reorder: boolean = false;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
  ) { }

  async ngOnInit() {
    this.attendanceTypes = await this.db.getAttendanceTypes();
  }

  async saveOrder() {
    this.reorder = false;
    // this.db.updateAttendanceTypeOrder(this.attendanceTypes);
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

}
