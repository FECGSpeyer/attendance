import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import { DbService } from '../services/db.service';
import { History, Person } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
})
export class HistoryPage implements OnInit {
  date: string = new Date().toISOString();
  public dateString: string = format(new Date(), 'dd.MM.yyyy');
  conductors: Person[] = [];
  history: History[] = [];
  historyFiltered: History[] = [];
  historyEntry: History = {
    name: "",
    conductor: 0,
    date: new Date().toISOString(),
  };
  searchTerm: string = "";

  constructor(
    private modalController: ModalController,
    private db: DbService,
  ) { }

  async ngOnInit(): Promise<void> {
    this.conductors = await this.db.getConductors(true);
    this.historyEntry.conductor = this.conductors[0].id;

    await this.getHistory();
  }

  async getHistory(refresh: boolean = false): Promise<void> {
    this.history = (await this.db.getHistory(refresh)).map((entry: History): History => {
      const conductor: Person = this.conductors.find((p: Person) => p.id === entry.conductor);
      return {
        ...entry,
        conductorName: `${conductor.firstName} ${conductor.lastName}`,
      }
    });
    this.initializeItems();
  }

  search(event: any): void {
    if (this.history) {
      this.searchTerm = '';
      this.initializeItems();

      this.searchTerm = event.srcElement.value;

      if (!this.searchTerm) {
        return;
      }

      this.historyFiltered = this.filter();
    }
  }

  filter(): History[] {
    if (this.searchTerm === '') {
      return this.history;
    } else {
      return this.history.filter((entry: History) => {
        if (this.searchTerm) {
          if (entry.name.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1) {
            return true;
          }
          return false;
        }
      });
    }
  }

  initializeItems(): void {
    this.historyFiltered = this.history;
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  async dismiss(): Promise<void> {
    await this.modalController.dismiss();
  }

  async addHistoryEntry(modal: HTMLIonModalElement): Promise<void> {
    if (this.historyEntry.name) {
      await this.db.addHistoryEntry(this.historyEntry);

      modal.dismiss();

      await this.getHistory(true);
      this.historyEntry = {
        name: "",
        conductor: 1,
        date: new Date().toISOString(),
      };
      this.dateString = format(new Date(), 'dd.MM.yyyy');
    } else {
      Utils.showToast("Bitte gib einen Namen an", "danger");
    }
  }

}
