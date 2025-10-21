import { Injectable } from '@angular/core';
import { AttendanceType, Player, Tenant } from 'src/app/utilities/interfaces';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private handoverData: { persons: Player[], stayInInstance: boolean, tenant: Tenant };
  private attendanceTypeData: AttendanceType;

  constructor() { }

  setHandoverData(data: { persons: Player[], stayInInstance: boolean, tenant: Tenant }) {
    this.handoverData = data;
  }

  getHandoverData(): { persons: Player[], stayInInstance: boolean, tenant: Tenant } {
    return this.handoverData;
  }

  setAttendanceTypeData(data: AttendanceType) {
    this.attendanceTypeData = data;
  }

  getAttendanceTypeData(): AttendanceType {
    return this.attendanceTypeData;
  }
}
