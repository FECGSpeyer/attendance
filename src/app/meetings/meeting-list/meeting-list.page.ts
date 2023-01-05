import { Component, OnInit } from '@angular/core';
import { DbService } from 'src/app/services/db.service';
import { Meeting } from 'src/app/utilities/interfaces';

@Component({
  selector: 'app-meeting-list',
  templateUrl: './meeting-list.page.html',
  styleUrls: ['./meeting-list.page.scss'],
})
export class MeetingListPage implements OnInit {
  public meetings: Meeting[] = [];

  constructor(
    private db: DbService,
  ) { }

  async ngOnInit() {
    this.meetings = await this.db.getMeetings();
  }

}
