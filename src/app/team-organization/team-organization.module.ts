import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { TeamOrganizationPageRoutingModule } from './team-organization-routing.module';
import { TeamOrganizationPage } from './team-organization.page';
import { TeamTasksTabComponent } from './tasks-tab/tasks-tab.component';
import { TeamTopicsTabComponent } from './topics-tab/topics-tab.component';
import { TeamProtocolsTabComponent } from './protocols-tab/protocols-tab.component';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    TeamOrganizationPageRoutingModule,
    TeamTasksTabComponent,
    TeamTopicsTabComponent,
    TeamProtocolsTabComponent,
  ],
  declarations: [TeamOrganizationPage]
})
export class TeamOrganizationPageModule {}
