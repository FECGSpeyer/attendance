import { Component, OnInit, effect } from '@angular/core';
import dayjs from 'dayjs';
import { ModalController } from '@ionic/angular/lazy';
import { DbService } from '../../../services/db.service';
import { Player } from '../../../utilities/interfaces';
import { Utils } from '../../../utilities/Utils';
import { PersonPage } from '../../../people/person/person.page';
import { Role } from '../../../utilities/constants';

interface BirthdayEntry {
  player: Player;
  firstName: string;
  lastName: string;
  birthday: string;
  age: number;
  daysOffset: number;
}

@Component({
  selector: 'app-birthdays-card',
  templateUrl: './birthdays-card.component.html',
  styleUrls: ['./birthdays-card.component.scss'],
  standalone: false,
})
export class BirthdaysCardComponent {
  public entries: BirthdayEntry[] = [];
  public loading = true;
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
    try {
      const players: Player[] = await this.db.getPlayers(true);
      const today = dayjs();
      const WINDOW = 14;

      this.entries = players
        .filter(p => p.birthday && p.correctBirthday)
        .map(p => {
          const bday = dayjs(p.birthday);
          const thisYear = bday.year(today.year());
          let diff = thisYear.diff(today, 'day');
          if (diff < -WINDOW) {
            const nextYear = bday.year(today.year() + 1);
            diff = nextYear.diff(today, 'day');
          }
          return {
            player: p,
            firstName: p.firstName,
            lastName: p.lastName,
            birthday: p.birthday,
            age: Utils.calculateAge(new Date(p.birthday)),
            daysOffset: diff,
          };
        })
        .filter(e => e.daysOffset >= -WINDOW && e.daysOffset <= WINDOW)
        .sort((a, b) => Math.abs(a.daysOffset) - Math.abs(b.daysOffset));
    } finally {
      this.loading = false;
    }
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

  formatDaysOffset(offset: number): string {
    if (offset === 0) return 'Heute';
    if (offset === -1) return 'Gestern';
    if (offset === 1) return 'Morgen';
    if (offset < 0) return `vor ${Math.abs(offset)} Tagen`;
    return `in ${offset} Tagen`;
  }

  offsetColor(offset: number): string {
    if (offset === 0) return 'success';
    if (offset > 0) return 'primary';
    return 'medium';
  }
}
