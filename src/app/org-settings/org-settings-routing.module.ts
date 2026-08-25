import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { OrgSettingsPage } from './org-settings.page';

const routes: Routes = [{ path: '', component: OrgSettingsPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgSettingsPageRoutingModule {}
