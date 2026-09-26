import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { OrgPersonFieldsPage } from './org-person-fields.page';

const routes: Routes = [{ path: '', component: OrgPersonFieldsPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgPersonFieldsPageRoutingModule {}
