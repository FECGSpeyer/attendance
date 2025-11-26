import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { ShiftInstance, ShiftPlan } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-shift',
  templateUrl: './shift.page.html',
  styleUrls: ['./shift.page.scss'],
})
export class ShiftPage implements OnInit {
  public shift: ShiftPlan;
  public calculatedShifts: any[] = [];
  public isCalculateModalOpen: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    this.shift = await this.db.shifts().find(s => s.id === id);
  }

  async save() {
    if (!this.shift.name || this.shift.name.trim().length === 0) {
      Utils.showToast('Bitte gib einen Namen für den Schichtplan ein.', 'danger');
      return;
    }

    try {
      await this.db.updateShift(this.shift);
      Utils.showToast('Schichtplan gespeichert', 'success');
    } catch (error) {
      Utils.showToast('Fehler beim Speichern des Schichtplans', 'danger');
    }
  }

  async removeEntry(index: number) {
    this.shift.definition.splice(index, 1);
  }

  addEntry() {
    if (!this.shift.definition) {
      this.shift.definition = [];
    }

    let duration = 8;

    if (this.shift.definition.length > 0) {
      const lastEntry = this.shift.definition[this.shift.definition.length - 1];
      duration = lastEntry.duration;
    }

    this.shift.definition.push({
      start_time: '08:00',
      duration,
      free: false,
      index: this.shift.definition.length,
      repeat_count: 1,
    });
  }

  async removeShift(index: number) {
    this.shift.shifts.splice(index, 1);
  }

  addShift() {
    if (!this.shift.shifts) {
      this.shift.shifts = [];
    }

    this.shift.shifts.push({
      name: '',
      date: new Date().toISOString(),
    });
  }

  async delete() {
    const alert = await this.alertController.create({
      header: 'Schichtplan löschen',
      message: 'Möchtest du den Schichtplan wirklich löschen? Alle zugehörigen Schichten werden ebenfalls gelöscht. Personen, die diesem Schichtplan zugewiesen sind, verlieren ihre Zuordnung. Diese Aktion kann nicht rückgängig gemacht werden.',
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          try {
            const loading = await Utils.getLoadingElement(9999, 'Schichtplan wird gelöscht...');
            await loading.present();
            await this.db.deleteShift(this.shift.id);
            await loading.dismiss();
            this.router.navigate(['/tabs/settings/general/shifts']);
            Utils.showToast('Schichtplan gelöscht', 'success');
          } catch (error) {
            Utils.showToast('Fehler beim Löschen des Schichtplans', 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async calculateShifts(shiftInstance?: ShiftInstance) {
    this.calculatedShifts = [];

    const shiftDefinitions = this.shift.definition;
    let currentDate = dayjs(shiftInstance?.date || dayjs().add(1, 'week').day(1).startOf('day'));
    let nextDate = currentDate.clone();
    const endDate = dayjs(currentDate).add(30, 'day');

    while (currentDate.isBefore(endDate)) {
      for (const def of shiftDefinitions) {
        for (let i = 0; i < def.repeat_count; i++) {
          const shift = {
            date: nextDate.locale('de').format('ddd, DD.MM.YYYY'),
            start_time: def.start_time,
            duration: def.duration,
            free: def.free,
            end_time: ''
          };

          let end_time = dayjs(`${nextDate.format('YYYY-MM-DD')}T${def.start_time}`).add(def.duration, 'hour');

          if (!dayjs(end_time).isSame(nextDate, 'day')) {
            shift.end_time = `${end_time.format('HH:mm')} (+1)`;
          } else {
            shift.end_time = end_time.format('HH:mm');
          }

          this.calculatedShifts.push(shift);

          nextDate = nextDate.add(1, 'day');
        }
      }
      currentDate = currentDate.add(shiftDefinitions.length, 'day');
    }

    this.isCalculateModalOpen = true;
  }
}
