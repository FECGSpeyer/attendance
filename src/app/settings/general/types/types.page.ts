import { Component, OnInit } from '@angular/core';
import { DbService } from 'src/app/services/db.service';
import { AttendanceType } from 'src/app/utilities/interfaces';

@Component({
  selector: 'app-types',
  templateUrl: './types.page.html',
  styleUrls: ['./types.page.scss'],
})
export class TypesPage implements OnInit {
  public attendanceTypes: AttendanceType[] = [];

  constructor(
    private db: DbService
  ) { }

  async ngOnInit() {
    this.attendanceTypes = await this.db.getAttendanceTypes();
  }

}
