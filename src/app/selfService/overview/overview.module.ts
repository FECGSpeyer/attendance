import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { QuillModule } from 'ngx-quill';

import { OverviewPageRoutingModule } from './overview-routing.module';

import { OverviewPage } from './overview.page';
import { NotificationBellComponent } from 'src/app/shared/notification-bell/notification-bell.component';
import { ExcuseReasonPickerComponent } from 'src/app/shared/excuse-reason-picker/excuse-reason-picker.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    OverviewPageRoutingModule,
    NotificationBellComponent,
    ExcuseReasonPickerComponent,
    QuillModule.forRoot(),
  ],
  declarations: [OverviewPage]
})
export class OverviewPageModule {}
