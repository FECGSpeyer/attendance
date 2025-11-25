import { Component, OnInit } from '@angular/core';
import { IonModal } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-shifts',
  templateUrl: './shifts.page.html',
  styleUrls: ['./shifts.page.scss'],
})
export class ShiftsPage implements OnInit {
  newShiftName: string = '';
  newShiftDescription: string = '';

  constructor(
    public db: DbService,
  ) { }

  ngOnInit() {
  }

  async createShift(modal: IonModal) {
    await modal.dismiss();

    if (this.newShiftName.trim().length === 0) {
      Utils.showToast('Bitte gib einen Namen für den Schichtplan ein.', 'danger');
      return;
    }

    const newShift = {
      name: this.newShiftName,
      description: this.newShiftDescription,
      entries: [],
    };

    await this.db.addShift(newShift);
    this.newShiftName = '';
    this.newShiftDescription = '';
  }
}
