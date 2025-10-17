import { Component, Input, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { DefaultAttendanceType } from 'src/app/utilities/constants';
import { GroupCategory, Instrument, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-instrument',
  templateUrl: './instrument.page.html',
  styleUrls: ['./instrument.page.scss'],
})
export class InstrumentPage implements OnInit {
  @Input() existingInstrument: Instrument;
  public instrument: Instrument;
  public isChoir: boolean = false;
  public isGeneral: boolean = false;
  public categories: GroupCategory[] = [];

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController
  ) { }

  async ngOnInit() {
    this.categories = await this.db.getGroupCategories();
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.instrument = { ...this.existingInstrument };
  }

  async update() {
    if (!this.instrument.name) {
      Utils.showToast("Bitte gib einen Namen an!", "danger");
      return;
    }

    await this.db.updateInstrument({
      notes: this.instrument.notes,
      range: this.instrument.range,
      tuning: this.instrument.tuning,
      clefs: this.instrument.clefs,
      name: this.instrument.name,
      maingroup: this.instrument.maingroup,
      category: this.instrument.category,
    }, this.instrument.id);

    Utils.showToast(`${this.instrument.name} wurde erfolgreich geupdated`);
    await this.modalController.dismiss({
      updated: true,
    });
  }

  async delete() {
    const allPlayers: Player[] = await this.db.getPlayers(true);
    if (Boolean(allPlayers.find((p: Player) => p.instrument === this.instrument.id))) {
      Utils.showToast("Du kannst das Instrument nicht löschen, da es Spieler gibt (gab), die darauf spielen", "danger");
      return;
    }

    const alert = await this.alertController.create({
      header: 'Bestätigen',
      message: 'Instrument wirklich löschen?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        }, {
          text: 'Ja',
          handler: async () => {
            await this.db.removeInstrument(this.instrument.id);
            await this.modalController.dismiss({
              updated: true,
            });
          }
        }
      ]
    });

    await alert.present();
  }

  async dismiss(): Promise<void> {
    await this.modalController.dismiss();
  }

}
