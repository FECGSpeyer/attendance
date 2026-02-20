import { Component, OnInit, effect } from '@angular/core';
import { DbService } from 'src/app/services/db.service';
import { ExtraField, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-members',
  templateUrl: './members.page.html',
  styleUrls: ['./members.page.scss'],
  standalone: false
})
export class MembersPage implements OnInit {
  public players: Player[] = [];
  public playersFiltered: Player[] = [];
  public searchTerm: string = '';
  public einteilungField: ExtraField | undefined;
  public einteilungFilter: string = 'all';
  public einteilungOptions: string[] = [];
  public isLoading: boolean = true;

  private initialized: boolean = false;
  private currentTenantId: number | undefined;

  constructor(public db: DbService) {
    effect(async () => {
      const tenantId = this.db.tenant()?.id;
      if (!this.initialized || tenantId === this.currentTenantId) {
        return;
      }
      this.currentTenantId = tenantId;
      await this.loadPlayers();
    });
  }

  async ngOnInit(): Promise<void> {
    this.currentTenantId = this.db.tenant()?.id;

    // Check if "einteilung" additional field exists
    this.einteilungField = this.db.tenant().additional_fields?.find(
      (field: ExtraField) => field.id === 'einteilung'
    );

    // Get options for einteilung field if it's a select type
    if (this.einteilungField?.type === 'select' && this.einteilungField.options?.length) {
      this.einteilungOptions = this.einteilungField.options;
    }

    await this.loadPlayers();
    this.initialized = true;
  }

  async loadPlayers(): Promise<void> {
    this.isLoading = true;

    try {
      const players = await this.db.getPlayers();

      // Use Utils to get modified players with grouping info
      this.players = Utils.getModifiedPlayersForList(
        players,
        this.db.groups(),
        [],
        this.db.attendanceTypes(),
        undefined,
        this.db.tenant().additional_fields
      );

      this.applyFilters();
    } catch (error) {
      console.error('Error loading players:', error);
      Utils.showToast('Fehler beim Laden der Mitglieder.', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  search(event: any): void {
    this.searchTerm = event.target?.value || '';
    this.applyFilters();
  }

  onEinteilungFilterChange(): void {
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.players];

    // Apply search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter((player: Player) =>
        player.firstName.toLowerCase().includes(term) ||
        player.lastName.toLowerCase().includes(term) ||
        (player.groupName || '').toString().toLowerCase().includes(term)
      );
    }

    // Apply einteilung filter
    if (this.einteilungFilter !== 'all' && this.einteilungField) {
      filtered = filtered.filter((player: Player) =>
        player.additional_fields?.['einteilung'] === this.einteilungFilter
      );
    }

    // Recalculate firstOfInstrument and instrumentLength for filtered list
    this.playersFiltered = this.recalculateGroupHeaders(filtered);
  }

  /**
   * Recalculate firstOfInstrument and instrumentLength for a filtered list
   * Handles players without a group assignment
   */
  private recalculateGroupHeaders(players: Player[]): Player[] {
    const seenInstruments = new Set<number | undefined>();
    const instrumentCounts = new Map<number | undefined, number>();

    // Count players per instrument (including undefined for players without group)
    for (const player of players) {
      const instrumentId = player.instrument;
      instrumentCounts.set(instrumentId, (instrumentCounts.get(instrumentId) || 0) + 1);
    }

    return players.map((player: Player) => {
      const instrumentId = player.instrument;
      const isFirst = !seenInstruments.has(instrumentId);

      if (isFirst) {
        seenInstruments.add(instrumentId);
      }

      return {
        ...player,
        firstOfInstrument: isFirst,
        instrumentLength: instrumentCounts.get(instrumentId) || 0,
        groupName: player.groupName || 'Ohne Gruppe'
      };
    });
  }

  async handleRefresh(event: any): Promise<void> {
    await this.loadPlayers();
    event.target.complete();
  }

  trackById(index: number, player: Player): number {
    return player.id;
  }
}
