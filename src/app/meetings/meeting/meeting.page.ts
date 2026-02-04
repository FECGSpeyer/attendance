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
  public attendeesNames: string = "";
  public isGeneral: boolean = false;

  // TrackBy function for performance
  trackByConductorId = (_: number, con: Person): number => con.id!;

  constructor(
    private db: DbService
  ) { }

  async ngOnInit() {
    this.isGeneral = this.db.tenant().type === 'general';
    this.allConductors = this.isGeneral ? await this.db.getPlayers() : await this.db.getConductors(true);
    this.conductors = this.allConductors.filter((c: Person) => !c.left);
    this.meeting = await this.db.getMeeting(Number(window.location.pathname.split("/")[4]));
    this.isEditMode = !this.meeting.notes;
    this.attendeesNames = this.meeting.attendees.map((id: number) => {
      const conductor: Person = this.allConductors.find((con: Person) => con.id === id);
      return `${conductor.firstName} ${conductor.lastName}`;
    }).join(", ");
  }

  async save() {
    await this.db.editMeeting(this.meeting.id, this.meeting);
    this.isEditMode = false;
    this.attendeesNames = this.meeting.attendees.map((id: number) => {
      const conductor: Person = this.allConductors.find((con: Person) => con.id === id);
      return `${conductor.firstName} ${conductor.lastName}`;
    }).join(", ");
  }

}
