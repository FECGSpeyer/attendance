import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PublicPlanningPage } from './public-planning.page';

const routes: Routes = [
  {
    path: '',
    component: PublicPlanningPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PublicPlanningPageRoutingModule {}
