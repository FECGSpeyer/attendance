import { Component, OnInit } from '@angular/core';
import { DbService } from 'src/app/services/db.service';
import { Meeting } from 'src/app/utilities/interfaces';

@Component({
  selector: 'app-meeting',
  templateUrl: './meeting.page.html',
  styleUrls: ['./meeting.page.scss'],
})
export class MeetingPage implements OnInit {
  public meeting: Meeting;

  constructor(
    private db: DbService
  ) { }

  async ngOnInit() {
    this.meeting = await this.db.getMeeting(1);
  }

  save() {
    this.db.editMeeting(this.meeting.id, this.meeting);
  }

}
