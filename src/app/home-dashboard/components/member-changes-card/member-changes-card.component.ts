import { Component } from '@angular/core';
import dayjs from 'dayjs';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from '../../../services/db.service';
import { Player } from '../../../utilities/interfaces';
import { PersonPage } from '../../../people/person/person.page';
import { Role } from '../../../utilities/constants';

interface MemberChange {
  player: Player;
  firstName: string;
  lastName: string;
  date: string;
  type: 'joined' | 'left';
}

@Component({
  selector: 'app-member-changes-card',
  templateUrl: './member-changes-card.component.html',
  styleUrls: ['./member-changes-card.component.scss'],
  standalone: false,
})
export class MemberChangesCardComponent {
  public changes: MemberChange[] = [];
  public loading = true;
  private readonly DAYS = 60;

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
  ) {}


  async load() {
    this.loading = true;
    try {
      const cutoff = dayjs().subtract(this.DAYS, 'day');
      const all: Player[] = await this.db.getPlayers(true);

      const joined: MemberChange[] = all
        .filter(p => p.joined && dayjs(p.joined).isAfter(cutoff))
        .map(p => ({ player: p, firstName: p.firstName, lastName: p.lastName, date: p.joined, type: 'joined' as const }));

      const left: MemberChange[] = all
        .filter(p => p.left && dayjs(p.left).isAfter(cutoff))
        .map(p => ({ player: p, firstName: p.firstName, lastName: p.lastName, date: p.left!, type: 'left' as const }));

      this.changes = [...joined, ...left]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } finally {
      this.loading = false;
    }
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
