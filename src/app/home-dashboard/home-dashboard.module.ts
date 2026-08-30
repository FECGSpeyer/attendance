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
import { PersonPageModule } from '../people/person/person.module';
import { AttendancePageModule } from '../attendance/attendance/attendance.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HomeDashboardPageRoutingModule,
    PersonPageModule,
    AttendancePageModule,
  ],
  declarations: [
    HomeDashboardPage,
    BirthdaysCardComponent,
    NextEventCardComponent,
    MemberChangesCardComponent,
    AbsencesCardComponent,
    CriticalPersonsCardComponent,
  ]
})
export class HomeDashboardPageModule {}
