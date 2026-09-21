import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { TeamOrganizationPageRoutingModule } from './team-organization-routing.module';
import { TeamOrganizationPage } from './team-organization.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TeamOrganizationPageRoutingModule,
  ],
  declarations: [TeamOrganizationPage]
})
export class TeamOrganizationPageModule {}
