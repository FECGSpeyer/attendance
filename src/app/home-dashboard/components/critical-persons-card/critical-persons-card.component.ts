import { Component, OnInit, ViewChild } from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Player } from 'src/app/utilities/player';
import { PersonPage } from 'src/app/people/person/person.page';
import { Role } from 'src/app/utilities/constants';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-critical-persons-card',
  templateUrl: './critical-persons-card.component.html',
  styleUrls: ['./critical-persons-card.component.scss'],
  standalone: false,
})
export class CriticalPersonsCardComponent implements OnInit {
  public loading = true;
  public criticalPersons: Player[] = [];

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
  ) {}

  async ngOnInit() {
    this.loading = true;
    const players = await this.db.getPlayers(true);
    this.criticalPersons = players.filter(p => p.isCritical);
    this.loading = false;
  }

  getReasonText(player: Player): string {
    if (player.criticalReasonText) return player.criticalReasonText;
    if (player.criticalReason != null) return Utils.getPlayerHistoryTypeText(player.criticalReason);
    return '';
  }

  async openPerson(player: Player) {
    const isAdmin = [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser()?.role);
    const modal = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: { existingPlayer: { ...player }, readOnly: !isAdmin },
      backdropDismiss: false,
    });
    await modal.present();
  }
}
