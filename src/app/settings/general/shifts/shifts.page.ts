import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonModal } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { ShiftPlan } from 'src/app/utilities/interfaces';
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
    private router: Router
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
      definition: [],
      shifts: []
    };

    const shift = await this.db.addShift(newShift);
    this.newShiftName = '';
    this.newShiftDescription = '';
    this.router.navigate(['/tabs/settings/general/shifts/', shift.id]);
  }

  trackByShiftId = (_: number, item: ShiftPlan): string => item.id;
}
