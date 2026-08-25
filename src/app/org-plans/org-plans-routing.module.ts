import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { OrgPlansPage } from './org-plans.page';

const routes: Routes = [{ path: '', component: OrgPlansPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgPlansPageRoutingModule {}
