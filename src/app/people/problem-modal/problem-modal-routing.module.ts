import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ProblemModalPage } from './problem-modal.page';

const routes: Routes = [
  {
    path: '',
    component: ProblemModalPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProblemModalPageRoutingModule {}
