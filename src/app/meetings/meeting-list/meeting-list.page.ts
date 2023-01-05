import { Component, OnInit } from '@angular/core';
import { format } from 'date-fns';
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
  ) { }

  async ngOnInit() {
    this.meetings = await this.db.getMeetings();
  }

  async addAttendance(modal: any): Promise<void> {
    await this.db.addMeeting({
      date: this.date,
      notes: "",
      attendees: [],
    });

    await modal.dismiss();
    await this.db.getMeetings();
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }
}
