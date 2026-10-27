import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { AttListPageRoutingModule } from './att-list-routing.module';

import { AttListPage } from './att-list.page';
import { NotificationBellComponent } from 'src/app/shared/notification-bell/notification-bell.component';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    AttListPageRoutingModule,
    NotificationBellComponent
  ],
  declarations: [AttListPage]
})
export class AttListPageModule {}
