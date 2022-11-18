import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Instrument } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-instrument',
  templateUrl: './instrument.page.html',
  styleUrls: ['./instrument.page.scss'],
})
export class InstrumentPage implements OnInit {
  @Input() existingInstrument: Instrument;
  public instrument: Instrument;

  constructor(
    private db: DbService,
    private modalController: ModalController,
  ) { }

  ngOnInit() {
    this.instrument = { ...this.existingInstrument };
  }

  async update() {
    await this.db.updateInstrument({
      notes: this.instrument.notes,
      range: this.instrument.range,
      tuning: this.instrument.tuning,
      clefs: this.instrument.clefs,
    }, this.instrument.id);

    Utils.showToast(`${this.instrument.name} wurde erfolgreich geupdated`);
    await this.modalController.dismiss({
      updated: true,
    });
  }

  onTuningChanges(event: any): void {
    this.instrument.tuning = event.detail.value;
  }

  onClefsChanges(event: any): void {
    this.instrument.clefs = event.detail.value;
  }

  async dismiss(): Promise<void> {
    await this.modalController.dismiss();
  }

}
