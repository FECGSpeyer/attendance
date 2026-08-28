import { Component, OnInit } from '@angular/core';
import dayjs from 'dayjs';
import { DbService } from '../../../services/db.service';
import { Player } from '../../../utilities/interfaces';

interface MemberChange {
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
export class MemberChangesCardComponent implements OnInit {
  public changes: MemberChange[] = [];
  public loading = true;
  private readonly DAYS = 60;

  constructor(public db: DbService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    try {
      const cutoff = dayjs().subtract(this.DAYS, 'day');
      const all: Player[] = await this.db.getPlayers(true);

      const joined: MemberChange[] = all
        .filter(p => p.joined && dayjs(p.joined).isAfter(cutoff))
        .map(p => ({ firstName: p.firstName, lastName: p.lastName, date: p.joined, type: 'joined' as const }));

      const left: MemberChange[] = all
        .filter(p => p.left && dayjs(p.left).isAfter(cutoff))
        .map(p => ({ firstName: p.firstName, lastName: p.lastName, date: p.left!, type: 'left' as const }));

      this.changes = [...joined, ...left]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } finally {
      this.loading = false;
    }
  }
}
