import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular';

import { OpenAttendancePageRoutingModule } from './open-attendance-routing.module';
import { OpenAttendancePage } from './open-attendance.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    OpenAttendancePageRoutingModule,
  ],
  declarations: [OpenAttendancePage],
})
export class OpenAttendanceModule {}
