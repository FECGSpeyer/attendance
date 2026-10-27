import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';
import { QuillModule } from 'ngx-quill';

import { AttendancePageRoutingModule } from './attendance-routing.module';

import { AttendancePage } from './attendance.page';
import { StatusInfoComponent } from './status-info/status-info.component';
import { AdHocReminderModalComponent } from './ad-hoc-reminder-modal/ad-hoc-reminder-modal.component';
import { FilesFolderPickerComponent } from 'src/app/shared/files-folder-picker/files-folder-picker.component';
import { PlanChipsComponent } from 'src/app/planning/plan-chips/plan-chips.component';
import { PlanMinutesPipe } from 'src/app/planning/plan-minutes.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    AttendancePageRoutingModule,
    QuillModule.forRoot(),
    FilesFolderPickerComponent,
    PlanChipsComponent,
    PlanMinutesPipe,
  ],
  declarations: [AttendancePage, StatusInfoComponent, AdHocReminderModalComponent],
  exports: [AttendancePage],
})
export class AttendancePageModule {}
