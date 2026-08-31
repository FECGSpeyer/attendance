import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { HomeDashboardPageRoutingModule } from './home-dashboard-routing.module';
import { HomeDashboardPage } from './home-dashboard.page';
import { BirthdaysCardComponent } from './components/birthdays-card/birthdays-card.component';
import { NextEventCardComponent } from './components/next-event-card/next-event-card.component';
import { MemberChangesCardComponent } from './components/member-changes-card/member-changes-card.component';
import { AbsencesCardComponent } from './components/absences-card/absences-card.component';
import { CriticalPersonsCardComponent } from './components/critical-persons-card/critical-persons-card.component';
import { CurrentSongsCardComponent } from './components/current-songs-card/current-songs-card.component';
import { PersonPageModule } from '../people/person/person.module';
import { AttendancePageModule } from '../attendance/attendance/attendance.module';
import { NotificationBellComponent } from '../shared/notification-bell/notification-bell.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HomeDashboardPageRoutingModule,
    PersonPageModule,
    AttendancePageModule,
    NotificationBellComponent,
  ],
  declarations: [
    HomeDashboardPage,
    BirthdaysCardComponent,
    NextEventCardComponent,
    MemberChangesCardComponent,
    AbsencesCardComponent,
    CriticalPersonsCardComponent,
    CurrentSongsCardComponent,
  ]
})
export class HomeDashboardPageModule {}
