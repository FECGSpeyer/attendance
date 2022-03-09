import { Component, Input, OnInit } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Instrument } from 'src/app/utilities/interfaces';

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
    private toastController: ToastController,
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

    const toast: HTMLIonToastElement = await this.toastController.create({
      message: `${this.instrument.name} wurde erfolgreich geupdated`,
      color: "success",
    });
    await toast.present();
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
