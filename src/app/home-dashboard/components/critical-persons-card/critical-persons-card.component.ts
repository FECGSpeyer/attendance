import { Component, effect } from '@angular/core';
import dayjs from 'dayjs';
import { ModalController } from '@ionic/angular/lazy';
import { DbService } from '../../../services/db.service';
import { Player } from '../../../utilities/interfaces';
import { PersonPage } from '../../../people/person/person.page';
import { PlayerHistoryType, Role } from '../../../utilities/constants';
import { Utils } from '../../../utilities/Utils';

@Component({
  selector: 'app-critical-persons-card',
  templateUrl: './critical-persons-card.component.html',
  styleUrls: ['./critical-persons-card.component.scss'],
  standalone: false,
})
export class CriticalPersonsCardComponent {
  public loading = true;
  public criticalPersons: Player[] = [];
  private loadDone = false;

  constructor(
    public db: DbService,
    private modalController: ModalController,
  ) {
    effect(() => {
      if (this.db.tenant() && !this.loadDone) {
        this.loadDone = true;
        this.load();
      }
    });
  }

  async load() {
    this.loadDone = false;
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

  getCriticalSince(player: Player): string | null {
    const entry = player.history?.slice().reverse().find(h => h.type === PlayerHistoryType.CRITICAL_PERSON);
    return entry ? dayjs(entry.date).format('DD.MM.YYYY') : null;
  }

  async openPerson(player: Player) {
    const isAdmin = [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser()?.role);
    const modal = await this.modalController.create({
      component: PersonPage,
      presentingElement: document.querySelector('ion-router-outlet'),
      componentProps: { existingPlayer: { ...player }, readOnly: !isAdmin },
      backdropDismiss: false,
    });
    await modal.present();
  }
}
