import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { OrgSettingsPage } from './org-settings.page';

const routes: Routes = [
  { path: '', component: OrgSettingsPage },
  {
    path: 'person-fields',
    loadChildren: () => import('./org-person-fields/org-person-fields.module').then(m => m.OrgPersonFieldsPageModule),
  },
  {
    path: 'planning-templates',
    loadChildren: () => import('./org-planning-templates/org-planning-templates.module').then(m => m.OrgPlanningTemplatesPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgSettingsPageRoutingModule {}
