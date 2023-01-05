import { Component, OnInit } from '@angular/core';
import { DbService } from 'src/app/services/db.service';
import { Meeting, Person } from 'src/app/utilities/interfaces';

@Component({
  selector: 'app-meeting',
  templateUrl: './meeting.page.html',
  styleUrls: ['./meeting.page.scss'],
})
export class MeetingPage implements OnInit {
  public meeting: Meeting;
  public conductors: Person[];
  public allConductors: Person[];
  public isEditMode: boolean;

  constructor(
    private db: DbService
  ) { }

  async ngOnInit() {
    this.allConductors = await this.db.getConductors(true);
    this.conductors = this.allConductors.filter((c: Person) => !c.isInactive);
    this.meeting = await this.db.getMeeting(1);
    this.isEditMode = !this.meeting.notes;
  }

  async save() {
    await this.db.editMeeting(this.meeting.id, this.meeting);
    this.isEditMode = false;
  }

}
