import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HandoverDetailPage } from './handover-detail.page';

const routes: Routes = [
  {
    path: '',
    component: HandoverDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HandoverDetailPageRoutingModule {}
