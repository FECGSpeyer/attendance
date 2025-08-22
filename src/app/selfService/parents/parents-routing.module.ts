import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ParentsPage } from './parents.page';

const routes: Routes = [
  {
    path: '',
    component: ParentsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ParentsPageRoutingModule {}
