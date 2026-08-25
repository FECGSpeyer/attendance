import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { OrgPlanPublicPage } from './org-plan-public.page';

const routes: Routes = [{ path: '', component: OrgPlanPublicPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgPlanPublicPageRoutingModule {}
