import { Component, Injector, OnInit, effect, inject } from '@angular/core';
import dayjs from 'dayjs';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from '../../../services/db.service';
import { Player, PlayerAbsence, PlayerHistoryEntry } from '../../../utilities/interfaces';
import { PlayerHistoryType, Role } from '../../../utilities/constants';
import { PersonPage } from '../../../people/person/person.page';

interface AbsenceEntry {
  player: Player;
  firstName: string;
  lastName: string;
  fromDate: string;
  untilDate: string;
  reason: string;
  type: 'absence' | 'pause';
}

@Component({
  selector: 'app-absences-card',
  templateUrl: './absences-card.component.html',
  styleUrls: ['./absences-card.component.scss'],
  standalone: false,
})
export class AbsencesCardComponent implements OnInit {
  public entries: AbsenceEntry[] = [];
  public loading = true;
  private loadDone = false;
  private readonly WEEKS = 4;

  constructor(
    public db: DbService,
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
    try {
      const cutoff = dayjs().subtract(this.WEEKS, 'week');
      const [absences, players]: [PlayerAbsence[], Player[]] = await Promise.all([
        this.db.getPlayerAbsencesForTenant(),
        this.db.getPlayers(true),
      ]);

      const playerMap = new Map<number, Player>(players.map(p => [p.id!, p]));

      const absenceEntries: AbsenceEntry[] = absences
        .filter(a => dayjs(a.from_date).isAfter(cutoff) || dayjs(a.until_date).isAfter(cutoff))
        .map(a => {
          const p = playerMap.get(a.person_id);
          return {
            player: p,
            firstName: p?.firstName ?? '?',
            lastName: p?.lastName ?? '',
            fromDate: a.from_date,
            untilDate: a.until_date,
            reason: a.reason,
            type: 'absence' as const,
          };
        });

      const pauseEntries: AbsenceEntry[] = players
        .filter(p => p.history?.length)
        .flatMap(p =>
          p.history
            .filter((h: PlayerHistoryEntry) => h.type === PlayerHistoryType.PAUSED && dayjs(h.date).isAfter(cutoff))
            .map((h: PlayerHistoryEntry) => ({
              player: p,
              firstName: p.firstName,
              lastName: p.lastName,
              fromDate: h.date,
              untilDate: p.paused_until ?? '',
              reason: h.text ?? 'Pausiert',
              type: 'pause' as const,
            }))
        );

      this.entries = [...absenceEntries, ...pauseEntries]
        .sort((a, b) => new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime());
    } finally {
      this.loading = false;
    }
  }

  async openPerson(player: Player) {
    if (!player) return;
    const isAdmin = [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser()?.role);
    const modal = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: { existingPlayer: { ...player }, readOnly: !isAdmin },
      backdropDismiss: false,
    });
    await modal.present();
  }

  formatDateRange(from: string, until: string): string {
    const f = dayjs(from).format('DD.MM.YY');
    if (!until) return `ab ${f}`;
    const u = dayjs(until).format('DD.MM.YY');
    return `${f} – ${u}`;
  }
}
