import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { Player, Tenant } from 'src/app/utilities/interfaces';
import { RankedMatch, rankCandidates } from 'src/app/utilities/person-matcher';
import { Utils } from 'src/app/utilities/Utils';
import dayjs from 'dayjs';

interface MatchEntry extends RankedMatch<Player> {
  selected: boolean;
}

export interface PersonLinkGroup {
  representative: Player;
  matches: MatchEntry[];
}

@Component({
  selector: 'app-link-persons',
  templateUrl: './link-persons.page.html',
  styleUrls: ['./link-persons.page.scss'],
  standalone: false,
})
export class LinkPersonsPage implements OnInit {
  public groups: PersonLinkGroup[] = [];
  public loading = true;
  public linkedCount = 0;
  public tenants: Tenant[] = [];

  private ignoredKeys = new Set<string>();
  private allPlayers: Player[] = [];

  private readonly STORAGE_KEY = 'link-persons-ignored';

  constructor(
    public db: DbService,
    private modalController: ModalController,
  ) {}

  async ngOnInit() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      (JSON.parse(stored) as string[]).forEach(k => this.ignoredKeys.add(k));
    }

    try {
      this.tenants = await this.db.getInstancesOfOrganisations(this.db.organisation().id);
      this.allPlayers = await this.db.getAllPersonsFromOrganisation(this.tenants);
      this.buildGroups();
    } finally {
      this.loading = false;
    }
  }

  private buildGroups() {
    const candidates = this.allPlayers.filter(p => !p.global_person_id && !p.appId);
    const seen = new Set<number>();
    const groups: PersonLinkGroup[] = [];

    for (const player of candidates) {
      if (seen.has(player.id)) {continue;}

      const otherTenantPlayers = candidates.filter(p => p.tenantId !== player.tenantId && !seen.has(p.id));
      const rawMatches = rankCandidates(
        { firstName: player.firstName, lastName: player.lastName, email: player.email, birthday: player.birthday },
        otherTenantPlayers,
        { threshold: 0.85, prefixMode: false },
      );

      if (rawMatches.length === 0) {continue;}

      const key = this.groupKey(player, rawMatches[0].candidate);
      if (this.ignoredKeys.has(key)) {continue;}

      groups.push({
        representative: player,
        matches: rawMatches.map(m => ({ ...m, selected: true })),
      });

      rawMatches.forEach(m => seen.add(m.candidate.id));
      seen.add(player.id);
    }

    this.groups = groups;
  }

  formatBirthday(birthday: string | null | undefined): string {
    if (!birthday) {return '–';}
    return dayjs(birthday).format('DD.MM.YYYY');
  }

  tenantName(tenantId: number): string {
    return this.tenants.find(t => t.id === tenantId)?.shortName ?? String(tenantId);
  }

  getSelectedMatches(group: PersonLinkGroup): Player[] {
    return group.matches.filter(m => m.selected).map(m => m.candidate);
  }

  async link(group: PersonLinkGroup, selectedCandidates: Player[]) {
    if (selectedCandidates.length === 0) {
      Utils.showToast('Bitte mindestens eine Übereinstimmung auswählen', 'warning');
      return;
    }

    const allIds = [group.representative.id, ...selectedCandidates.map(p => p.id)];
    const existingId = [group.representative, ...selectedCandidates]
      .map(p => p.global_person_id)
      .find(id => !!id);
    const globalPersonId: string = existingId ?? crypto.randomUUID();

    try {
      await this.db.setGlobalPersonId(allIds, globalPersonId);
      this.linkedCount += allIds.length;
      this.groups = this.groups.filter(g => g !== group);
      Utils.showToast(`${allIds.length} Personen verknüpft`, 'success');
    } catch {
      Utils.showToast('Fehler beim Verknüpfen', 'danger');
    }
  }

  ignore(group: PersonLinkGroup) {
    const key = this.groupKey(group.representative, group.matches[0].candidate);
    this.ignoredKeys.add(key);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify([...this.ignoredKeys]));
    this.groups = this.groups.filter(g => g !== group);
  }

  dismiss() {
    this.modalController.dismiss({ linkedCount: this.linkedCount });
  }

  private groupKey(a: Player, b: Player): string {
    return [a.id, b.id].sort().join('-');
  }
}
