import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DashboardSettingsPage } from './dashboard-settings.page';

const routes: Routes = [
  {
    path: '',
    component: DashboardSettingsPage,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardSettingsPageRoutingModule {}
