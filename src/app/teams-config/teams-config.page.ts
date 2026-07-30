import { Component, OnInit } from '@angular/core';
import { pages } from '@microsoft/teams-js';
import { DbService } from '../services/db.service';
import { TeamsService } from '../services/teams/teams.service';
import { Tenant } from '../utilities/interfaces';

/**
 * Configuration page for the Attendix channel (configurable) tab. Teams loads
 * this in a dialog when someone adds Attendix to a channel. The installer picks
 * which Attendix tenant the tab maps to; we save a contentUrl scoped by that
 * tenant id. The content page (open-attendance) then calls setTenant(id) so the
 * tab always opens that tenant's data.
 *
 * There is no DB link between a Teams channel and an Attendix entity — the
 * mapping lives entirely in the Teams tab config saved here.
 */
@Component({
  selector: 'app-teams-config',
  templateUrl: './teams-config.page.html',
  styleUrls: ['./teams-config.page.scss'],
  standalone: false,
})
export class TeamsConfigPage implements OnInit {
  tenants: Tenant[] = [];
  selectedTenantId?: number;
  loading = true;
  notInTeams = false;

  constructor(private db: DbService, private teams: TeamsService) {}

  async ngOnInit(): Promise<void> {
    if (!this.teams.isInTeams()) {
      this.notInTeams = true;
      this.loading = false;
      return;
    }

    // The user must be signed in for us to list their tenants. Silent SSO (or a
    // persisted session) normally handles this before the config dialog opens.
    await this.db.checkToken();
    this.tenants = this.db.tenants() ?? [];
    if (this.tenants.length === 1) {
      this.selectedTenantId = this.tenants[0].id;
    }
    this.loading = false;

    // Enable the Teams "Save" button only once a tenant is chosen, and define
    // what gets persisted when the installer clicks it.
    pages.config.registerOnSaveHandler((saveEvent) => {
      const tenant = this.tenants.find((t) => t.id === this.selectedTenantId);
      const contentUrl = `https://attendix.de/open-attendance?tenantId=${this.selectedTenantId}`;
      pages.config
        .setConfig({
          entityId: `attendix-tenant-${this.selectedTenantId}`,
          contentUrl,
          websiteUrl: contentUrl,
          suggestedDisplayName: tenant ? tenant.shortName : 'Attendix',
        })
        .then(() => saveEvent.notifySuccess())
        .catch(() => saveEvent.notifyFailure('Konfiguration konnte nicht gespeichert werden'));
    });

    this.updateValidity();
  }

  onTenantChange(): void {
    this.updateValidity();
  }

  private updateValidity(): void {
    pages.config.setValidityState(!!this.selectedTenantId);
  }
}
