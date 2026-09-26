import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { OrgSettingsPage } from './org-settings.page';

const routes: Routes = [
  { path: '', component: OrgSettingsPage },
  {
    path: 'person-fields',
    loadChildren: () => import('./org-person-fields/org-person-fields.module').then(m => m.OrgPersonFieldsPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgSettingsPageRoutingModule {}
