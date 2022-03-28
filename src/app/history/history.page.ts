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
  historyEntry: History = {
    name: "",
    conductor: 0,
    date: new Date().toISOString(),
  };

  constructor(
    private modalController: ModalController,
    private db: DbService,
  ) { }

  async ngOnInit() {
    this.conductors = await this.db.getConductors();
    this.historyEntry.conductor = this.conductors[0].id;
    this.history = (await this.db.getHistory()).map((entry: History): History => {
      const conductor: Person = this.conductors.find((p: Person) => p.id === entry.conductor);
      return {
        ...entry,
        conductorName: `${conductor.firstName} ${conductor.lastName}`,
      }
    });;
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

      this.history = await this.db.getHistory(true);
      this.historyEntry = {
        name: "",
        conductor: 0,
        date: new Date().toISOString(),
      };
    } else {
      Utils.showToast("Bitte gib einen Namen an", "danger");
    }
  }

}
