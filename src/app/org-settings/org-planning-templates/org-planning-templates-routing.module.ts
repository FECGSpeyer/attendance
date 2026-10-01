import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { OrgPlanningTemplatesPage } from './org-planning-templates.page';

const routes: Routes = [{ path: '', component: OrgPlanningTemplatesPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgPlanningTemplatesPageRoutingModule {}
