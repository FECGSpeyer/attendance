import { Component, OnInit, effect } from '@angular/core';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { ModalController } from '@ionic/angular/lazy';
import { DbService } from '../../../services/db.service';
import { Player } from '../../../utilities/interfaces';
import { Utils } from '../../../utilities/Utils';
import { PersonPage } from '../../../people/person/person.page';
import { Role } from '../../../utilities/constants';
import { translate } from '@jsverse/transloco';
import { relativeDays } from '../shared/dashboard-date';
import { currentLanguage } from '../../../i18n/languages';

interface BirthdayEntry {
  player: Player;
  firstName: string;
  lastName: string;
  birthday: string;
  age: number;
  daysOffset: number;
  day: string;
  month: string;
  weekday: string;
}

@Component({
  selector: 'app-birthdays-card',
  templateUrl: './birthdays-card.component.html',
  styleUrls: ['./birthdays-card.component.scss'],
  standalone: false,
})
export class BirthdaysCardComponent {
  public entries: BirthdayEntry[] = [];
  public upcoming: BirthdayEntry[] = [];
  public past: BirthdayEntry[] = [];
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
      const today = dayjs().startOf('day');
      const WINDOW = 14;

      this.entries = players
        .filter(p => !p.left && p.birthday && p.correctBirthday)
        .map(p => {
          const bday = dayjs(p.birthday).startOf('day');
          const thisYear = bday.year(today.year()).startOf('day');
          let diff = thisYear.diff(today, 'day');
          if (diff < -WINDOW) {
            const nextYear = bday.year(today.year() + 1).startOf('day');
            diff = nextYear.diff(today, 'day');
          }
          const age = Utils.calculateAge(new Date(p.birthday));
          const date = today.add(diff, 'day').locale(currentLanguage());
          return {
            player: p,
            firstName: p.firstName,
            lastName: p.lastName,
            birthday: p.birthday,
            age: diff > 0 ? age + 1 : age,
            daysOffset: diff,
            day: date.format('D'),
            month: date.format('MMM').replace('.', ''),
            weekday: date.format('dddd'),
          };
        })
        .filter(e => e.daysOffset >= -WINDOW && e.daysOffset <= WINDOW)
        .sort((a, b) => {
          // Heute und Kommende aufsteigend vor Vergangenen (jüngster zuerst)
          const aPast = a.daysOffset < 0, bPast = b.daysOffset < 0;
          if (aPast !== bPast) return aPast ? 1 : -1;
          return aPast ? b.daysOffset - a.daysOffset : a.daysOffset - b.daysOffset;
        });
      this.upcoming = this.entries.filter(e => e.daysOffset >= 0);
      this.past = this.entries.filter(e => e.daysOffset < 0);
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
    return relativeDays(dayjs().add(offset, 'day'));
  }

  ageText(entry: BirthdayEntry): string {
    if (entry.daysOffset === 0) return translate('homeDashboard.turnsToday', { age: entry.age });
    if (entry.daysOffset > 0) return translate('homeDashboard.turns', { age: entry.age });
    return translate('homeDashboard.turned', { age: entry.age });
  }
}
