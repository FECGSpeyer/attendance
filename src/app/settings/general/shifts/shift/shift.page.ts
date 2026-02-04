import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { ShiftInstance, ShiftPlan, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
    selector: 'app-shift',
    templateUrl: './shift.page.html',
    styleUrls: ['./shift.page.scss'],
    standalone: false
})
export class ShiftPage implements OnInit {
  public shift: ShiftPlan;
  public calculatedShifts: any[] = [];
  public isCalculateModalOpen: boolean = false;
  public isUsed: boolean = false;
  public linkedTenants: Tenant[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    this.shift = await this.db.shifts().find(s => s.id === id);

    this.isUsed = await this.db.isShiftUsed(this.shift.id);
    this.linkedTenants = (await this.db.getTenantsFromUser(this.db.user.id)).filter(t => t.id !== this.db.tenant().id);
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

  async copyToInstance() {
    if (this.linkedTenants.length === 0) {
      Utils.showToast('Keine anderen Instanzen verfügbar.', 'warning');
      return;
    }

    const inputs = this.linkedTenants.map(t => ({
      type: 'radio' as const,
      label: t.longName,
      value: t.id.toString(),
    }));

    const alert = await this.alertController.create({
      header: 'In Instanz kopieren',
      message: 'Wähle die Ziel-Instanz, in die der Schichtplan kopiert werden soll.',
      inputs,
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Kopieren',
        handler: async (tenantId: string) => {
          if (!tenantId) {
            Utils.showToast('Bitte wähle eine Instanz aus.', 'warning');
            return false;
          }

          try {
            const loading = await Utils.getLoadingElement(9999, 'Schichtplan wird kopiert...');
            await loading.present();

            // Create a clean copy without IDs and dependencies
            const copiedShift: ShiftPlan = {
              name: `${this.shift.name} (Kopie)`,
              description: this.shift.description || '',
              tenant_id: Number(tenantId),
              definition: this.shift.definition.map(def => ({
                start_time: def.start_time,
                duration: def.duration,
                free: def.free,
                index: def.index,
                repeat_count: def.repeat_count,
              })),
              shifts: (this.shift.shifts || []).map(s => ({
                name: s.name,
                date: s.date,
              })),
            };

            await this.db.addShiftToTenant(copiedShift, Number(tenantId));

            await loading.dismiss();
            const targetTenant = this.linkedTenants.find(t => t.id === Number(tenantId));
            Utils.showToast(`Schichtplan nach "${targetTenant?.longName}" kopiert.`, 'success');
          } catch (error) {
            console.error('Error copying shift:', error);
            Utils.showToast('Fehler beim Kopieren des Schichtplans.', 'danger');
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

  trackByShiftIndex = (index: number, _: any): number => index;
}
