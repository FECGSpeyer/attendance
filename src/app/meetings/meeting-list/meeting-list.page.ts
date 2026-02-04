import { Component, OnInit } from '@angular/core';
import { AlertController, IonModal } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Meeting } from 'src/app/utilities/interfaces';

@Component({
  selector: 'app-meeting-list',
  templateUrl: './meeting-list.page.html',
  styleUrls: ['./meeting-list.page.scss'],
})
export class MeetingListPage implements OnInit {
  public meetings: Meeting[] = [];
  public date: string = new Date().toISOString();
  public dateString: string = format(new Date(), 'dd.MM.yyyy');

  constructor(
    private db: DbService,
    private alertController: AlertController
  ) { }

  async ngOnInit() {
    this.meetings = await this.db.getMeetings();
  }

  async handleRefresh(event: any) {
    this.meetings = await this.db.getMeetings();
    event.target.complete();
  }

  trackByMeetingId = (_index: number, meeting: Meeting): number => meeting.id;

  async addMeeting(modal: any): Promise<void> {
    await this.db.addMeeting({
      date: this.date,
      notes: "",
      attendees: [],
    });

    await modal.dismiss();
    this.meetings = await this.db.getMeetings();
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  onDateChanged(value: string | string[], dateModal: IonModal): void {
    if (parseInt(this.dateString.substring(0, 2), 10) !== dayjs(this.date).date()) {
      dateModal.dismiss();
    }

    this.dateString = this.formatDate(String(value));
  }

  async removeMeeting(id: number) {
    const alert = await this.alertController.create({
      header: 'Besprechung wirklich entfernen?',
      buttons: [
        {
          text: 'Abbrechen',
        }, {
          text: 'Ja',
          handler: async () => {
            await this.db.removeMeeting(id);
            this.meetings = await this.db.getMeetings();
          }
        }
      ]
    });

    await alert.present();
  }
}
