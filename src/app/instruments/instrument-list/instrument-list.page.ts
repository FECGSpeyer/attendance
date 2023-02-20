import { Component, OnInit } from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { Instrument, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { environment } from 'src/environments/environment.prod';
import { InstrumentPage } from '../instrument/instrument.page';

@Component({
  selector: 'app-instrument-list',
  templateUrl: './instrument-list.page.html',
  styleUrls: ['./instrument-list.page.scss'],
})
export class InstrumentListPage implements OnInit {
  public instruments: Instrument[] = [];
  public isAdmin: boolean = false;
  public isChoir: boolean = false;

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private routerOutlet: IonRouterOutlet,
  ) { }

  async ngOnInit() {
    this.isChoir = environment.isChoir;
    this.db.authenticationState.subscribe((state: { role: Role }) => {
      this.isAdmin = state.role === Role.ADMIN;
    });
    await this.getInstruments();
  }

  async getInstruments(): Promise<void> {
    const players: Player[] = await this.db.getPlayers();
    this.instruments = (await this.db.getInstruments()).map((ins: Instrument): Instrument => {
      return {
        ...ins,
        count: players.filter((player: Player): boolean => player.instrument === ins.id).length,
        clefText: ins.clefs?.map((key: string) => Utils.getClefText(key)).join(", ") || "",
      }
    });
  }

  async openModal(instrument: Instrument): Promise<void> {
    if (!this.isAdmin) {
      return;
    }

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
      await this.getInstruments();
    }
  }

  async addInstrument(value: string | number, modal: any) {
    if (value) {
      await this.db.addInstrument(String(value));
    } else {
      Utils.showToast("Bitte gib einem Namen an", "danger");
      return;
    }

    await this.getInstruments();

    modal.dismiss();
  }

}
