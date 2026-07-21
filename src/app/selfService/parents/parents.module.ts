import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { QuillModule } from 'ngx-quill';

import { ParentsPageRoutingModule } from './parents-routing.module';

import { ParentsPage } from './parents.page';
import { PlanViewerComponent } from 'src/app/planning/plan-viewer/plan-viewer.component';
import { NotificationBellComponent } from 'src/app/shared/notification-bell/notification-bell.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ParentsPageRoutingModule,
    PlanViewerComponent,
    NotificationBellComponent,
    QuillModule.forRoot(),
  ],
  declarations: [ParentsPage]
})
export class ParentsPageModule {}
