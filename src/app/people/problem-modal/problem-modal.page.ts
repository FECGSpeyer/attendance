import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-problem-modal',
  templateUrl: './problem-modal.page.html',
  styleUrls: ['./problem-modal.page.scss'],
})
export class ProblemModalPage implements OnInit {
  public players: Player[] = [];

  constructor(
    private db: DbService,
    private alertController: AlertController,
    private modalController: ModalController
  ) { }

  async ngOnInit() {
    await this.getPlayers();
  }

  async getPlayers() {
    const allPlayers = await this.db.getPlayers();

    this.players = allPlayers.filter((player: Player) => player.isCritical);

    if (!this.players.length) {
      Utils.showToast("Keine Problemfälle vorhanden", "warning");
      this.modalController.dismiss();
    }
  }

  async save(player: Player) {
    const alert = await this.alertController.create({
      header: `${player.firstName} ${player.lastName}`,
      message: 'Aus Liste entfernen?',
      buttons: [
        {
          text: 'Abbrechen',
          handler: () => {
            const index: number = this.players.findIndex((p: Player) => player.id === p.id);
            this.players[index].isCritical = true;
          }
        }, {
          text: 'Ja',
          handler: async () => {
            await this.db.updatePlayer({
              ...player,
              isCritical: false,
              lastSolve: new Date().toISOString(),
            });
            await this.getPlayers();
          }
        }
      ]
    });

    await alert.present();
  }

}
