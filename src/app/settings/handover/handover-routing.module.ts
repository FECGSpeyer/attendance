import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HandoverPage } from './handover.page';

const routes: Routes = [
  {
    path: '',
    component: HandoverPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HandoverPageRoutingModule {}
