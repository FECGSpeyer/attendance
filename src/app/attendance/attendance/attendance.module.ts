import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';
import { QuillModule } from 'ngx-quill';

import { AttendancePageRoutingModule } from './attendance-routing.module';

import { AttendancePage } from './attendance.page';
import { StatusInfoComponent } from './status-info/status-info.component';
import { AdHocReminderModalComponent } from './ad-hoc-reminder-modal/ad-hoc-reminder-modal.component';
import { ProtocolPageModule } from 'src/app/protocols/protocol/protocol.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AttendancePageRoutingModule,
    QuillModule.forRoot(),
    ProtocolPageModule,
  ],
  declarations: [AttendancePage, StatusInfoComponent, AdHocReminderModalComponent],
  exports: [AttendancePage],
})
export class AttendancePageModule {}
