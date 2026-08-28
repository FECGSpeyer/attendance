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

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HomeDashboardPageRoutingModule,
  ],
  declarations: [
    HomeDashboardPage,
    BirthdaysCardComponent,
    NextEventCardComponent,
    MemberChangesCardComponent,
    AbsencesCardComponent,
  ]
})
export class HomeDashboardPageModule {}
