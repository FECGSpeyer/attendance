import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';
import { DataService } from 'src/app/services/data.service';
import { DbService } from 'src/app/services/db.service';
import { Player, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-handover',
  templateUrl: './handover.page.html',
  styleUrls: ['./handover.page.scss'],
})
export class HandoverPage implements OnInit {
  public allPersons: Player[] = [];
  public filteredPersons: Player[] = [];
  public tenants: Tenant[] = [];
  public tenant: number;
  public mainGroupId: number;
  public includeMainGroup = false;
  public stayInInstance = false;
  public selectedPersons: number[] = [];

  constructor(
    private db: DbService,
    private dataService: DataService,
    private navCtrl: NavController
  ) { }

  async ngOnInit() {
    this.mainGroupId = (await this.db.getMainGroup()).id;
    this.allPersons = Utils.getModifiedPlayersForList(await this.db.getPlayers(), await this.db.getInstruments(), [], this.mainGroupId);
    this.onMainGroupChanged();
    this.tenants = await this.db.getTenantsFromOrganisation();
    if (this.tenants.length > 0) {
      this.tenant = this.tenants[0].id;
    } else {
      Utils.showToast('Es sind keine weiteren Instanzen vorhanden. Bitte füge weitere Instanzen dieser Organisation hinzu.', 'danger');
    }
  }

  async onMainGroupChanged() {
    if (this.includeMainGroup) {
      this.filteredPersons = this.allPersons;
    } else {
      this.filteredPersons = this.allPersons.filter(p => p.instrument !== this.mainGroupId);
    }
  }

  togglePersonSelection(person: Player) {
    const index = this.selectedPersons.findIndex(p => p === person.id);
    if (index > -1) {
      this.selectedPersons.splice(index, 1);
    } else {
      this.selectedPersons.push(person.id);
    }
    this.selectedPersons = [...this.selectedPersons];
  }

  selectAll() {
    this.selectedPersons = this.filteredPersons.map(p => p.id);
  }

  toDetail() {
    this.dataService.setHandoverData({
      persons: this.selectedPersons,
      tenant: this.tenant,
      stayInInstance: this.stayInInstance,
      filteredPersons: this.filteredPersons
    });

    this.navCtrl.navigateForward('/tabs/settings/handover/detail');
  }
}
