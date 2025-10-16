import { Component, OnInit } from '@angular/core';
import { IonModal, IonPopover, NavController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DataService } from 'src/app/services/data.service';
import { DbService } from 'src/app/services/db.service';
import { Instrument, Player, Tenant } from 'src/app/utilities/interfaces';
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
  public filters: string[] = [];
  public date = new Date().toISOString();
  public dateString = format(new Date(), 'dd.MM.yyyy');
  public groupId: number;
  public groups: Instrument[] = [];
  public max: string = new Date().toISOString();

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
    this.groups = await this.db.getInstruments();
    this.groupId = await this.groups[0]?.id;
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
    const persons: Player[] = this.filteredPersons.filter(p => this.selectedPersons.includes(p.id));

    this.dataService.setHandoverData({
      persons,
      tenant: this.tenants.find(t => t.id === this.tenant),
      stayInInstance: this.stayInInstance
    });

    this.navCtrl.navigateForward('/tabs/settings/handover/detail');
  }

  filterBy(filter: string, popover: IonPopover) {
    popover.dismiss();
    this.filters.push(filter);
    this.filter();
  }

  filter() {
    this.onMainGroupChanged();

    if (this.filters.includes('older')) {
      this.filteredPersons = this.filteredPersons.filter((p: Player) => {
        return dayjs(this.date).isAfter(dayjs(p.birthday));
      });
    }
    if (this.filters.includes('younger')) {
      this.filteredPersons = this.filteredPersons.filter((p: Player) => {
        return dayjs(this.date).isBefore(dayjs(p.birthday));
      });
    }
    if (this.filters.includes('group') && this.groupId) {
      this.filteredPersons = this.filteredPersons.filter((p: Player) => {
        return p.instrument === this.groupId;
      });
    }
  }

  onDateChange(value: string | string[], modal: IonModal) {
    if (parseInt(this.dateString.substring(0, 2), 10) !== dayjs(this.date).date()) {
      modal.dismiss();
    }

    this.dateString = this.formatDate(String(value));

    this.filter();
  }

  formatDate(value: string) {
    return format(parseISO(value || new Date().toISOString()), 'dd.MM.yyyy');
  }

  removeFilter(filter: string) {
    const index = this.filters.findIndex(f => f === filter);
    if (index > -1) {
      this.filters.splice(index, 1);
    }
    this.filter();
  }
}
