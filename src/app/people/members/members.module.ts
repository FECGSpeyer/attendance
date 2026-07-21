import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { MembersPageRoutingModule } from './members-routing.module';
import { MembersPage } from './members.page';
import { NotificationBellComponent } from 'src/app/shared/notification-bell/notification-bell.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MembersPageRoutingModule,
    NotificationBellComponent
  ],
  declarations: [MembersPage]
})
export class MembersPageModule {}
