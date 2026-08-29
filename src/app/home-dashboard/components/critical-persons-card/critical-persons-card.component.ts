import { Component, Injector, OnInit, effect, inject } from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from '../../../services/db.service';
import { Player } from '../../../utilities/interfaces';
import { PersonPage } from '../../../people/person/person.page';
import { Role } from '../../../utilities/constants';
import { Utils } from '../../../utilities/Utils';

@Component({
  selector: 'app-critical-persons-card',
  templateUrl: './critical-persons-card.component.html',
  styleUrls: ['./critical-persons-card.component.scss'],
  standalone: false,
})
export class CriticalPersonsCardComponent implements OnInit {
  public loading = true;
  public criticalPersons: Player[] = [];
  private loadDone = false;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
  ) {}

  ngOnInit() {
    const injector = inject(Injector);
    effect(() => {
      if (this.db.tenant() && !this.loadDone) {
        this.loadDone = true;
        this.load();
      }
    }, { injector });
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
