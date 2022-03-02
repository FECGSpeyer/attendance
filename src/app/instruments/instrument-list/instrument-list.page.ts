import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Instrument, Player } from 'src/app/utilities/interfaces';
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
  ) { }

  async ngOnInit() {
    const players: Player[] = await this.db.getPlayers();
    this.instruments = (await this.db.getInstruments()).map((ins: Instrument): Instrument => {
      return {
        ...ins,
        count: players.filter((player: Player): boolean => player.instrument === ins.id).length, 
      }
    });
  }

  async openModal(): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: InstrumentPage,
    });

    await modal.present();
  }

  async addInstrument(value: string | number, modal: any) {
    await this.db.addInstrument(String(value));

    this.instruments = await this.db.getInstruments(true);

    modal.dismiss();
  }

}
