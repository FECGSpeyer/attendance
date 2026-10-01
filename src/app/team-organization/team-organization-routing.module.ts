import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { TeamOrganizationPage } from './team-organization.page';

const routes: Routes = [
  { path: '', component: TeamOrganizationPage }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TeamOrganizationPageRoutingModule {}
