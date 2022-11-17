import { Component, OnInit } from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Instrument, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { InstrumentPage } from '../instrument/instrument.page';

@Component({
  selector: 'app-instrument-list',
  templateUrl: './instrument-list.page.html',
  styleUrls: ['./instrument-list.page.scss'],
})
export class InstrumentListPage implements OnInit {
  public instruments: Instrument[] = [];

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private routerOutlet: IonRouterOutlet,
  ) { }

  async ngOnInit() {
    await this.getInstruments(true);
  }

  async getInstruments(reload: boolean = false): Promise<void> {
    const players: Player[] = await this.db.getPlayers(true);
    this.instruments = (await this.db.getInstruments(reload)).map((ins: Instrument): Instrument => {
      return {
        ...ins,
        count: players.filter((player: Player): boolean => player.instrument === ins.id).length,
        clefText: ins.clefs.map((key: string) => Utils.getClefText(key)).join(", "),
      }
    });
  }

  async openModal(instrument: Instrument): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: InstrumentPage,
      componentProps: {
        existingInstrument: instrument
      },
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data?.updated) {
      await this.getInstruments(true);
    }
  }

  async addInstrument(value: string | number, modal: any) {
    if (value) {
        await this.db.addInstrument(String(value));
    } else {
        Utils.showToast("Bitte gib einem Namen an", "danger");
        return;
    }

    this.instruments = await this.db.getInstruments(true);

    modal.dismiss();
  }

}
